from __future__ import annotations

import asyncio
import json
import logging
import os
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Callable
from uuid import uuid4

import requests
import yfinance as yf
from google.genai import types

from . import chroma_client
from .db import (
    connect,
    execute,
    fetch_all,
    fetch_one,
    get_tax_config,
    get_user_goals,
    get_user_liabilities,
    get_user_open_lots,
    get_user_profile,
    get_sell_allocations,
    list_catalog,
    read_price_cache,
    write_journal_row,
    write_price_cache,
)
from .gemini_client import get_gemini_client


LTCG_DAYS = 365
AMFI_NAV_LOOKUP_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"
FINAPI_MF_URL = "https://finapi.upvaly.com/api/mf/scheme-code/{scheme_code}"
MFAPI_HISTORY_URL = "https://api.mfapi.in/mf/{scheme_code}"
NIFTY_50_TICKER = "^NSEI"

# yfinance history() period allowlist
STOCK_HISTORY_PERIODS = frozenset({"5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"})
# Client-facing MF history windows (filter after mfapi returns full series)
MF_HISTORY_PERIOD_DAYS = {
    "1y": 365,
    "3y": 365 * 3,
    "5y": 365 * 5,
    "max": None,
}
# Portfolio proxy history: intersection of stock+MF windows, with stock 3y = 5y fetch + truncate.
PORTFOLIO_HISTORY_PERIODS = frozenset({"1y", "3y", "5y", "max"})
_PORTFOLIO_HISTORY_3Y_DAYS = 365 * 3
_logger = logging.getLogger(__name__)

SECTION_WEIGHTS = {
    "goal": 0.15,
    "risk_tolerance": 0.30,
    "capacity": 0.20,
    "experience": 0.15,
    "behaviour": 0.20,
}

QUESTION_SECTIONS = {
    "q1": "goal",
    "q2": "goal",
    "q3": "goal",
    "q4": "risk_tolerance",
    "q5": "risk_tolerance",
    "q6": "risk_tolerance",
    "q7": "risk_tolerance",
    "q8": "capacity",
    "q9": "capacity",
    "q10": "capacity",
    "q11": "capacity",
    "q12": "experience",
    "q13": "experience",
    "q14": "experience",
    "q15": "behaviour",
    "q16": "behaviour",
    "q17": "behaviour",
    "q18": "behaviour",
}


def score_risk_questionnaire(answers: dict[str, int]) -> tuple[int, str]:
    expected = set(QUESTION_SECTIONS)
    provided = set(answers)
    missing = expected - provided
    extra = provided - expected
    if missing or extra:
        parts: list[str] = []
        if missing:
            parts.append(f"missing keys: {sorted(missing)}")
        if extra:
            parts.append(f"extra keys: {sorted(extra)}")
        raise ValueError("risk questionnaire answers must include exactly q1..q18; " + "; ".join(parts))
    for key in sorted(expected):
        value = answers[key]
        if not isinstance(value, int) or isinstance(value, bool) or value < 1 or value > 5:
            raise ValueError(f"risk questionnaire answer for {key} must be an int from 1 to 5, got {value!r}")
    section_values: dict[str, list[int]] = {section: [] for section in SECTION_WEIGHTS}
    for key, section in QUESTION_SECTIONS.items():
        section_values[section].append(answers[key])
    weighted_score = 0.0
    for section, weight in SECTION_WEIGHTS.items():
        values = section_values[section]
        section_mean = sum(values) / len(values)
        weighted_score += section_mean * weight
    risk_score = round(weighted_score * 20)
    if risk_score <= 40:
        risk_tier = "conservative"
    elif risk_score <= 60:
        risk_tier = "moderate"
    else:
        risk_tier = "aggressive"
    return risk_score, risk_tier


def _d(value: Any) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _as_date(value: date | str) -> date:
    return value if isinstance(value, date) else date.fromisoformat(value)


def _assessment_year(sale_date: date) -> int:
    sale_date = _as_date(sale_date)
    return sale_date.year + 1 if sale_date.month >= 4 else sale_date.year


def get_current_assessment_year() -> int:
    return _assessment_year(date.today())


def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    return value


def _price_fetch_result(
    name: str,
    price: Decimal,
    fetched_at: datetime,
    pct_change_5d: float | None = None,
    volume_vs_avg_ratio: float | None = None,
    atr_volatility_ratio: float | None = None,
    **extra: Any,
) -> dict[str, Any]:
    payload = {
        "name": name,
        "price": float(price),
        "fetched_at": fetched_at.isoformat(),
        "pct_change_5d": pct_change_5d,
        "volume_vs_avg_ratio": volume_vs_avg_ratio,
        "atr_volatility_ratio": atr_volatility_ratio,
    }
    payload.update(_jsonable(extra))
    return payload



def _resolve_finapi_scheme_code(scheme_identifier: str) -> str:
    scheme_identifier = str(scheme_identifier).strip()
    if scheme_identifier.isdigit():
        return scheme_identifier
    response = requests.get(AMFI_NAV_LOOKUP_URL, timeout=15)
    response.raise_for_status()
    needle = scheme_identifier.casefold()
    for line in response.text.splitlines():
        if ";" not in line:
            continue
        parts = [part.strip() for part in line.split(";")]
        if len(parts) < 3:
            continue
        scheme_code, scheme_name = parts[0], parts[3]
        if needle == scheme_code.casefold() or needle == scheme_name.casefold() or needle in scheme_name.casefold():
            return scheme_code
    raise ValueError(f"Scheme {scheme_identifier} not found in AMFI NAV lookup file")


def _optional_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_cagr_returns(raw: Any) -> dict[str, float] | None:
    if not isinstance(raw, dict) or not raw:
        return None
    out: dict[str, float] = {}
    for key, value in raw.items():
        parsed = _optional_float(value)
        if parsed is not None:
            out[str(key)] = parsed
    return out or None


def _parse_asset_allocation(raw: Any) -> dict[str, float | None] | None:
    if not isinstance(raw, dict) or not raw:
        return None
    return {
        "equity": _optional_float(raw.get("equityAllocation")),
        "debt": _optional_float(raw.get("debtAllocation")),
        "cash": _optional_float(raw.get("cashAllocation")),
        "other": _optional_float(raw.get("otherAllocation")),
    }


def _parse_sectors(raw: Any) -> list[dict[str, Any]] | None:
    if not isinstance(raw, list) or not raw:
        return None
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        sector = item.get("sector")
        if sector in (None, ""):
            continue
        out.append({"sector": str(sector), "weightage": _optional_float(item.get("weightage"))})
    return out or None


def _fetch_finapi_scheme_data(scheme_code: str) -> dict[str, Any]:
    def _fetch() -> dict[str, Any]:
        response = requests.get(FINAPI_MF_URL.format(scheme_code=scheme_code), timeout=15)
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data") or {}

        latest_nav_raw = data.get("latestNav")
        previous_nav_raw = data.get("previousNav")
        latest_nav = _d(latest_nav_raw)
        previous_nav = None if previous_nav_raw in (None, "", 0, "0") else _d(previous_nav_raw)
        nav_change = latest_nav - previous_nav if previous_nav is not None else None
        pct_change = (nav_change / previous_nav * 100) if previous_nav not in (None, 0) else None

        portfolio = data.get("portfolio") or {}
        market_cap_weightage = portfolio.get("marketCapWeightage") or data.get("marketCapWeightage") or {}
        holdings = data.get("holdings") or []
        fundamentals = data.get("fundamentals") or {}
        concentration = portfolio.get("concentration") or {}
        overlap_pct = concentration.get("top10StocksWeight")
        if overlap_pct in (None, ""):
            overlap_pct = sum(_d(item.get("weightage", 0)) for item in holdings[:10])

        return {
            "scheme_code": scheme_code,
            "scheme_name": data.get("schemeName"),
            "price": float(latest_nav),
            "latest_nav": float(latest_nav),
            "previous_nav": float(previous_nav) if previous_nav is not None else None,
            "nav_change": float(nav_change) if nav_change is not None else None,
            "pct_change": float(pct_change) if pct_change is not None else None,
            "risk_category": data.get("schemeRisk"),
            "market_cap_weightage": _jsonable(market_cap_weightage),
            "holdings": _jsonable(holdings),
            "fundamentals": _jsonable(fundamentals),
            "rolling_returns": _jsonable(data.get("rollingReturns") or []),
            "portfolio": _jsonable(portfolio),
            "overlap_pct": float(overlap_pct) if overlap_pct not in (None, "") else 0.0,
            "latest_nav_date": data.get("latestNavDate"),
            "previous_nav_date": data.get("previousNavDate"),
            "schemeFundManagers": data.get("schemeFundManagers"),
            "aum": data.get("aum"),
            "expenseRatio": data.get("expenseRatio"),
            "scheme_category": data.get("schemeCategory"),
            "scheme_category_label": data.get("schemeCategoryLabel"),
            "cagr_returns": _parse_cagr_returns(data.get("cagr")),
            "asset_allocation": _parse_asset_allocation(portfolio.get("assetAllocation")),
            "sectors": _parse_sectors(data.get("sectors")),
            "source": "finapi",
        }

    return _fetch()


def fetch_with_retry_and_cache(
    fetch_fn: Callable[[], dict[str, Any]],
    cache_key: str,
    *,
    cache_loader: Callable[[str], dict[str, Any] | None] | None = read_price_cache,
    cache_writer: Callable[[str, dict[str, Any]], None] | None = None,
    skip_live_if_fresh_seconds: int | None = None,
) -> dict[str, Any]:
    if skip_live_if_fresh_seconds is not None and cache_loader:
        cached = cache_loader(cache_key)
        if cached:
            fetched_at = cached["fetched_at"]
            now = datetime.now(timezone.utc)
            if getattr(fetched_at, "tzinfo", None) is None:
                age = (datetime.now() - fetched_at).total_seconds()
            else:
                age = (now - fetched_at).total_seconds()
            if age < skip_live_if_fresh_seconds:
                return {
                    "status": "cached",
                    "stale": False,
                    "cache_key": cache_key,
                    "cached_as_of": cached["fetched_at"].isoformat(),
                    "price": float(cached["price"]),
                }
    last_error: Exception | None = None
    for _ in range(2):
        try:
            result = fetch_fn()
            if cache_writer:
                cache_writer(cache_key, result)
            return {"status": "ok", "stale": False, "cache_key": cache_key, **result}
        except Exception as exc:
            last_error = exc
    if cache_loader:
        cached = cache_loader(cache_key)
        if cached:
            return {
                "status": "stale",
                "stale": True,
                "cache_key": cache_key,
                "stale_as_of": cached["fetched_at"].isoformat(),
                "price": float(cached["price"]),
            }
    return {"status": "unavailable", "available": False, "cache_key": cache_key, "error": str(last_error)}


def _fetch_yfinance_price(
    symbol: str,
    namespace: str,
    *,
    skip_live_if_fresh_seconds: int | None = None,
) -> dict[str, Any]:
    def _fetch() -> dict[str, Any]:
        ticker = yf.Ticker(symbol)
        fast_info = getattr(ticker, "fast_info", {}) or {}
        price = fast_info.get("lastPrice") or fast_info.get("last_price")
        previous_close = fast_info.get("previousClose") or fast_info.get("previous_close")
        if price is None or previous_close in (None, 0):
            history = ticker.history(period="5d", auto_adjust=False)
            if history.empty:
                raise ValueError(f"No market data returned for {symbol}")
            price = history["Close"].iloc[-1]
            previous_close = history["Close"].iloc[-2] if len(history) > 1 else history["Close"].iloc[-1]
        price_d = _d(price)
        prev_d = _d(previous_close) if previous_close not in (None, 0) else price_d
        pct_change = ((price_d - prev_d) / prev_d * 100) if prev_d else Decimal("0")
        return _price_fetch_result(
            symbol,
            price_d,
            datetime.now(timezone.utc),
            symbol=symbol,
            pct_change_today=float(pct_change),
            source="yfinance",
        )

    return fetch_with_retry_and_cache(
        _fetch,
        f"{namespace}:{symbol}",
        cache_writer=lambda key, result: write_price_cache(key, result["price"]),
        skip_live_if_fresh_seconds=skip_live_if_fresh_seconds,
    )


def fetch_stock_price(
    symbol: str,
    *,
    skip_live_if_fresh_seconds: int | None = None,
) -> dict[str, Any]:
    return _fetch_yfinance_price(
        symbol, "stock", skip_live_if_fresh_seconds=skip_live_if_fresh_seconds
    )


def _close_series_from_download(df: Any, symbol: str) -> Any:
    """Extract a Close series for one symbol from yf.download output (1 or N tickers)."""
    if df is None or getattr(df, "empty", True):
        raise ValueError(f"No market data returned for {symbol}")
    columns = df.columns
    if isinstance(columns, tuple) or getattr(columns, "nlevels", 1) > 1:
        # MultiIndex: usually (Ticker, Price) when group_by='ticker'
        level0 = columns.get_level_values(0)
        if symbol in level0:
            block = df[symbol]
            if "Close" in block.columns:
                return block["Close"].dropna()
        # Alternate: (Price, Ticker)
        if "Close" in level0:
            close = df["Close"]
            if symbol in close.columns:
                return close[symbol].dropna()
            if len(close.columns) == 1:
                return close.iloc[:, 0].dropna()
    if "Close" in columns:
        return df["Close"].dropna()
    raise ValueError(f"No Close column in download data for {symbol}")


def _ohlcv_block_from_download(df: Any, symbol: str) -> Any:
    """Extract the OHLCV DataFrame block for one symbol from yf.download output."""
    if df is None or getattr(df, "empty", True):
        raise ValueError(f"No market data returned for {symbol}")
    columns = df.columns
    if isinstance(columns, tuple) or getattr(columns, "nlevels", 1) > 1:
        # MultiIndex: usually (Ticker, Price) when group_by='ticker'
        level0 = columns.get_level_values(0)
        if symbol in level0:
            return df[symbol]
        # Alternate: (Price, Ticker)
        if "Close" in level0:
            import pandas as pd
            block_dict = {}
            for col in ["Open", "High", "Low", "Close", "Adj Close", "Volume"]:
                if col in df.columns.levels[0] and symbol in df[col].columns:
                    block_dict[col] = df[col][symbol]
            if block_dict:
                return pd.DataFrame(block_dict)
    if "Close" in columns:
        return df
    raise ValueError(f"No columns found in download data for {symbol}")


async def fetch_stock_prices_batch(
    symbols: list[str],
    *,
    skip_live_if_fresh_seconds: int | None = 300,
) -> dict[str, dict[str, Any]]:
    """Fetch last/prior close for many symbols via one yf.download when cache misses.

    Returns map symbol -> {status, price, pct_change_today?, ...} matching fetch_stock_price shapes.
    """
    import time
    results: dict[str, dict[str, Any]] = {}
    to_fetch: list[str] = []

    async def check_cache_for_symbol(symbol: str) -> None:
        cache_key = f"stock:{symbol}"
        if skip_live_if_fresh_seconds is not None:
            cached = await asyncio.to_thread(read_price_cache, cache_key)
            if cached:
                fetched_at = cached["fetched_at"]
                now = datetime.now(timezone.utc)
                if getattr(fetched_at, "tzinfo", None) is None:
                    age = (datetime.now() - fetched_at).total_seconds()
                else:
                    age = (now - fetched_at).total_seconds()
                if age < skip_live_if_fresh_seconds:
                    results[symbol] = {
                        "status": "cached",
                        "stale": False,
                        "cache_key": cache_key,
                        "cached_as_of": cached["fetched_at"].isoformat(),
                        "price": float(cached["price"]),
                    }
                    return
        to_fetch.append(symbol)

    if symbols:
        await asyncio.gather(
            *(check_cache_for_symbol(symbol) for symbol in symbols),
            return_exceptions=True,
        )

    if not to_fetch:
        return results

    last_error: Exception | None = None
    downloaded = None
    for _ in range(2):
        try:
            downloaded = await asyncio.to_thread(
                yf.download,
                to_fetch,
                period="1mo",
                group_by="ticker",
                auto_adjust=False,
                threads=True,
                progress=False,
            )
            last_error = None
            break
        except Exception as exc:
            last_error = exc
            downloaded = None

    async def process_symbol(symbol: str) -> None:
        cache_key = f"stock:{symbol}"
        try:
            if downloaded is None:
                raise last_error or ValueError(f"No market data returned for {symbol}")
            
            block = _ohlcv_block_from_download(downloaded, symbol)
            closes = block["Close"].dropna()
            if closes.empty:
                raise ValueError(f"No market data returned for {symbol}")
            
            price = closes.iloc[-1]
            previous_close = closes.iloc[-2] if len(closes) > 1 else closes.iloc[-1]
            price_d = _d(price)
            prev_d = _d(previous_close) if previous_close not in (None, 0) else price_d
            pct_change = ((price_d - prev_d) / prev_d * 100) if prev_d else Decimal("0")
            
            # Compute derived metrics
            import pandas as pd
            pct_change_5d = None
            if len(closes) >= 6:
                price_5d_ago = closes.iloc[-6]
                if price_5d_ago not in (None, 0):
                    pct_change_5d = float(((price - price_5d_ago) / price_5d_ago) * 100)

            # volume_vs_avg_ratio
            volume_vs_avg_ratio = None
            if "Volume" in block.columns:
                volumes = block["Volume"].dropna()
                if len(volumes) >= 21:
                    today_volume = volumes.iloc[-1]
                    avg_volume = volumes.iloc[-21:-1].mean()
                    if avg_volume not in (None, 0):
                        volume_vs_avg_ratio = float(today_volume / avg_volume)

            # atr_volatility_ratio
            atr_volatility_ratio = None
            if "High" in block.columns and "Low" in block.columns and "Close" in block.columns:
                aligned = block[["High", "Low", "Close"]].dropna()
                if len(aligned) >= 16:
                    h = aligned["High"]
                    l = aligned["Low"]
                    c = aligned["Close"]
                    c_prev = c.shift(1)
                    
                    tr = pd.concat([
                        h - l,
                        (h - c_prev).abs(),
                        (l - c_prev).abs()
                    ], axis=1).max(axis=1).dropna()
                    
                    if len(tr) >= 15:
                        atr_baseline = tr.iloc[-15:-1].mean()
                        today_tr = tr.iloc[-1]
                        if atr_baseline not in (None, 0):
                            atr_volatility_ratio = float(today_tr / atr_baseline)

            payload = _price_fetch_result(
                symbol,
                price_d,
                datetime.now(timezone.utc),
                symbol=symbol,
                pct_change_today=float(pct_change),
                pct_change_5d=pct_change_5d,
                volume_vs_avg_ratio=volume_vs_avg_ratio,
                atr_volatility_ratio=atr_volatility_ratio,
                source="yfinance_download",
            )
            await asyncio.to_thread(write_price_cache, cache_key, payload["price"])
            results[symbol] = {"status": "ok", "stale": False, "cache_key": cache_key, **payload}
        except Exception as exc:
            cached = await asyncio.to_thread(read_price_cache, cache_key)
            if cached:
                results[symbol] = {
                    "status": "stale",
                    "stale": True,
                    "cache_key": cache_key,
                    "stale_as_of": cached["fetched_at"].isoformat(),
                    "price": float(cached["price"]),
                }
            else:
                results[symbol] = {
                    "status": "unavailable",
                    "available": False,
                    "cache_key": cache_key,
                    "error": str(exc),
                }

    await asyncio.gather(
        *(process_symbol(symbol) for symbol in to_fetch),
        return_exceptions=True,
    )
    return results


def fetch_stock_detail_fields(symbol: str) -> dict[str, Any] | None:
    try:
        info = yf.Ticker(symbol).info
        pe_ratio = info.get("trailingPE")
        market_cap = info.get("marketCap")
        eps = info.get("trailingEps")
        name = info.get("longName")
        fifty_two_week_high = info.get("fiftyTwoWeekHigh")
        fifty_two_week_low = info.get("fiftyTwoWeekLow")
        if (
            pe_ratio is None
            and market_cap is None
            and eps is None
            and name is None
            and fifty_two_week_high is None
            and fifty_two_week_low is None
        ):
            return None
        return {
            "pe_ratio": pe_ratio,
            "market_cap": market_cap,
            "eps": eps,
            "name": name,
            "fifty_two_week_high": fifty_two_week_high,
            "fifty_two_week_low": fifty_two_week_low,
        }
    except Exception:
        return None


def fetch_benchmark_price(index_ticker: str = NIFTY_50_TICKER) -> dict[str, Any]:
    return _fetch_yfinance_price(index_ticker, "benchmark")


def fetch_mf_nav(
    scheme_identifier: str,
    *,
    skip_live_if_fresh_seconds: int | None = None,
) -> dict[str, Any]:
    scheme_code = _resolve_finapi_scheme_code(scheme_identifier)
    return fetch_with_retry_and_cache(
        lambda: _fetch_finapi_scheme_data(scheme_code),
        f"finapi:{scheme_code}",
        cache_writer=lambda key, result: write_price_cache(key, result["price"]),
        skip_live_if_fresh_seconds=skip_live_if_fresh_seconds,
    )


def fetch_mf_detail_fields(scheme_name: str) -> dict[str, Any] | None:
    try:
        scheme_code = _resolve_finapi_scheme_code(scheme_name)
        result = _fetch_finapi_scheme_data(scheme_code)
        return {
            "amfi_scheme_code": scheme_code,
            "finapi_scheme_code": scheme_code,
            "fund_manager": result.get("schemeFundManagers"),
            "aum": result.get("aum"),
            "expense_ratio": result.get("expenseRatio"),
        }
    except Exception:
        return None


def fetch_finapi_overlap(scheme_identifier: str) -> dict[str, Any]:
    scheme_code = _resolve_finapi_scheme_code(scheme_identifier)
    result = fetch_with_retry_and_cache(
        lambda: _fetch_finapi_scheme_data(scheme_code),
        f"finapi-overlap:{scheme_code}",
        cache_loader=None,
        cache_writer=None,
    )
    if result.get("status") != "ok":
        result.setdefault("overlap_pct", 0.0)
        return result
    return {**result, "overlap_pct": result.get("overlap_pct", 0.0)}


def fetch_fd_rates(bank_name: str | None = None, tenure_months: int | None = None) -> list[dict[str, Any]]:
    sql = "SELECT bank_name, tenure_months, interest_rate FROM fd_rates"
    params: list[Any] = []
    where: list[str] = []
    if bank_name:
        where.append("bank_name = %s")
        params.append(bank_name)
    if tenure_months is not None:
        where.append("tenure_months = %s")
        params.append(int(tenure_months))
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY interest_rate DESC, tenure_months ASC, bank_name ASC"
    return fetch_all(sql, params)


def _asset_filter(asset: dict[str, Any] | str) -> tuple[str, Any]:
    if isinstance(asset, str):
        return "stock_symbol", asset
    if asset.get("stock_symbol") is not None:
        return "stock_symbol", asset["stock_symbol"]
    if asset.get("mutual_fund_id") is not None:
        return "mutual_fund_id", asset["mutual_fund_id"]
    if asset.get("scheme_id") is not None:
        return "mutual_fund_id", asset["scheme_id"]
    raise ValueError("asset must contain stock_symbol or mutual_fund_id")


def match_fifo_lots(
    user_id: str,
    asset: dict[str, Any] | str,
    quantity: Any,
    sell_price: Any,
    sell_date: date | str,
) -> list[tuple[int, float, int]]:
    column, value = _asset_filter(asset)
    sell_date = _as_date(sell_date)
    requested = _d(quantity)
    available_row = fetch_one(
        f"SELECT COALESCE(SUM(remaining_quantity), 0) AS qty FROM lots WHERE user_id = %s AND remaining_quantity > 0 AND {column} = %s",
        (user_id, value),
    )
    available = _d(available_row["qty"] if available_row else 0)
    if requested > available:
        raise ValueError(f"Requested quantity {requested} exceeds available {available} for {column}={value}")
    rows = fetch_all(
        f"""
        SELECT lot_id, buy_date, remaining_quantity
        FROM lots
        WHERE user_id = %s AND remaining_quantity > 0 AND {column} = %s
        ORDER BY buy_date ASC, lot_id ASC
        """,
        (user_id, value),
    )
    remaining = requested
    matches: list[tuple[int, float, int]] = []
    for row in rows:
        if remaining <= 0:
            break
        take = min(remaining, _d(row["remaining_quantity"]))
        hold_days = (sell_date - _as_date(row["buy_date"])).days
        if hold_days < 0:
            raise ValueError(f"sell_date {sell_date.isoformat()} is before buy_date {row['buy_date']} for lot_id {row['lot_id']}")
        matches.append((int(row["lot_id"]), float(take), hold_days))
        remaining -= take
    return matches


def calculate_salary_tax(
    salary: Any,
    tax_regime: str,
    assessment_year: int,
    *,
    tax_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    config = tax_config if tax_config is not None else get_tax_config(assessment_year)
    regime_config = config["salary"][str(tax_regime)]
    slabs = regime_config["slabs"]
    income = _d(salary)
    standard_deduction = _d(regime_config["standard_deduction"])
    taxable_income = max(income - standard_deduction, Decimal("0"))
    slab_tax = Decimal("0")
    lower = Decimal("0")
    breakdown: list[dict[str, Any]] = []
    for slab in slabs:
        upper = None if slab.get("upto") in (None, "") else _d(slab["upto"])
        rate = _d(slab["rate"])
        band = (taxable_income - lower) if upper is None else min(taxable_income, upper) - lower
        if band > 0:
            piece = band * rate
            slab_tax += piece
            breakdown.append({"from": float(lower), "to": None if upper is None else float(upper), "rate": float(rate), "tax": float(piece)})
        if upper is None:
            break
        lower = upper

    rebate_threshold = _d(regime_config["rebate_threshold"])
    rebate_max_amount = _d(regime_config["rebate_max_amount"])
    cess_rate = _d(regime_config["cess_rate"])
    rebate_applied = min(slab_tax, rebate_max_amount) if taxable_income <= rebate_threshold else Decimal("0")
    tax_after_rebate = max(slab_tax - rebate_applied, Decimal("0"))
    cess_amount = tax_after_rebate * cess_rate
    tax_after_cess = tax_after_rebate + cess_amount

    return {
        "assessment_year": assessment_year,
        "tax_regime": tax_regime,
        "salary": float(income),
        "taxable_income": float(taxable_income),
        "slab_tax": float(slab_tax),
        "breakdown": breakdown,
        "rebate_applied": float(rebate_applied),
        "tax_after_rebate": float(tax_after_rebate),
        "cess_amount": float(cess_amount),
        "tax_after_cess": float(tax_after_cess),
        "tax": float(tax_after_cess),
    }


def _lot_asset_class(row: dict[str, Any]) -> str:
    if row.get("stock_symbol") is not None:
        return "gold" if row.get("is_gold_etf") else "equity"
    if row.get("risk_category") == "equity":
        return "equity"
    return "debt"


def calculate_ltcg_tax(
    user_id: str,
    matched_lots: list[tuple[int, float, int]],
    sell_price: Any,
    sell_date: date | str,
) -> dict[str, Any]:
    """Financial-year-level loss carryforward across separate transactions is explicitly out of scope."""
    sell_date = _as_date(sell_date)
    assessment_year = _assessment_year(sell_date)
    config = get_tax_config(assessment_year)["capital_gains"]
    sell_price_d = _d(sell_price)
    lot_ids = [lot_id for lot_id, _, _ in matched_lots]
    buy_price_rows = fetch_all(
        """
        SELECT l.lot_id, l.buy_price, l.stock_symbol, l.mutual_fund_id,
               s.is_gold_etf, mf.risk_category
        FROM lots l
        LEFT JOIN stocks s ON s.symbol = l.stock_symbol
        LEFT JOIN mutual_funds mf ON mf.scheme_id = l.mutual_fund_id
        WHERE l.lot_id = ANY(%s)
        """,
        (lot_ids,),
    ) if lot_ids else []
    lot_meta = {
        int(row["lot_id"]): {
            "buy_price": _d(row["buy_price"]),
            "asset_class": _lot_asset_class(row),
        }
        for row in buy_price_rows
    }
    profile = get_user_profile(user_id)
    salary = None if profile is None else profile.get("salary")
    tax_regime = None if profile is None else profile.get("tax_regime")
    salary_data_missing = salary is None or tax_regime is None
    prior_row = fetch_one(
        """
        SELECT COALESCE(SUM(GREATEST((sa.sell_price - l.buy_price) * sa.sold_quantity, 0)), 0) AS realized_ltcg
        FROM sell_allocations sa
        JOIN lots l ON l.lot_id = sa.lot_id
        LEFT JOIN stocks s ON s.symbol = l.stock_symbol
        LEFT JOIN mutual_funds mf ON mf.scheme_id = l.mutual_fund_id
        WHERE sa.user_id = %s AND sa.assessment_year = %s AND sa.gain_type = 'LTCG'
          AND (
            (l.stock_symbol IS NOT NULL AND COALESCE(s.is_gold_etf, false) = false)
            OR (l.mutual_fund_id IS NOT NULL AND mf.risk_category = 'equity')
          )
        """,
        (user_id, assessment_year),
    )
    prior_ltcg = _d(prior_row["realized_ltcg"] if prior_row else 0)
    ltcg_rate = _d(config["ltcg_rate"])
    stcg_rate = _d(config["stcg_rate"])
    exemption = _d(config["ltcg_exemption"])
    raw_equity_ltcg = Decimal("0")
    raw_equity_stcg = Decimal("0")
    raw_gold_ltcg = Decimal("0")
    slab_taxed_gains_total = Decimal("0")
    details: list[dict[str, Any]] = []
    for lot_id, qty, hold_days in matched_lots:
        meta = lot_meta.get(int(lot_id))
        if meta is None:
            raise ValueError(f"lot_id {lot_id} was not found when calculating tax")
        buy_price = meta["buy_price"]
        asset_class = meta["asset_class"]
        quantity = _d(qty)
        gross_gain = (sell_price_d - buy_price) * quantity
        bucket = "LTCG" if int(hold_days) >= LTCG_DAYS else "STCG"
        if asset_class == "equity":
            if bucket == "LTCG":
                raw_equity_ltcg += gross_gain
                computed_tax = gross_gain * ltcg_rate
            else:
                raw_equity_stcg += gross_gain
                computed_tax = gross_gain * stcg_rate
        elif asset_class == "gold" and bucket == "LTCG":
            raw_gold_ltcg += gross_gain
            computed_tax = gross_gain * ltcg_rate
        else:
            # debt (any holding) or gold STCG — marginal slab tax
            if salary_data_missing:
                computed_tax = Decimal("0")
            else:
                base_tax = _d(calculate_salary_tax(salary, str(tax_regime), assessment_year)["tax"])
                with_gain_tax = _d(
                    calculate_salary_tax(_d(salary) + gross_gain, str(tax_regime), assessment_year)["tax"]
                )
                computed_tax = with_gain_tax - base_tax
            slab_taxed_gains_total += computed_tax
        details.append(
            {
                "lot_id": int(lot_id),
                "matched_quantity": float(quantity),
                "holding_period_days": int(hold_days),
                "buy_price": float(buy_price),
                "sell_price": float(sell_price_d),
                "gross_gain": float(gross_gain),
                "gain_type": bucket,
                "asset_class": asset_class,
                "computed_tax": float(computed_tax),
            }
        )
    # Flat-rate bucket: equity (LTCG+STCG) + gold LTCG. Debt / gold-STCG stay out of these aggregates.
    raw_current_ltcg = raw_equity_ltcg + raw_gold_ltcg
    raw_current_stcg = raw_equity_stcg
    stcl_offset_applied = Decimal("0")
    net_equity_ltcg = raw_equity_ltcg
    net_gold_ltcg = raw_gold_ltcg
    net_current_stcg = raw_equity_stcg
    if net_current_stcg < 0 and (net_equity_ltcg + net_gold_ltcg) > 0:
        stcl_offset_applied = min(net_equity_ltcg + net_gold_ltcg, -net_current_stcg)
        remaining_offset = stcl_offset_applied
        # Apply STCL to gold LTCG first so exemption-eligible equity LTCG is preserved when possible.
        if net_gold_ltcg > 0 and remaining_offset > 0:
            take = min(net_gold_ltcg, remaining_offset)
            net_gold_ltcg -= take
            remaining_offset -= take
        if net_equity_ltcg > 0 and remaining_offset > 0:
            take = min(net_equity_ltcg, remaining_offset)
            net_equity_ltcg -= take
            remaining_offset -= take
        net_current_stcg += stcl_offset_applied
    net_current_ltcg = net_equity_ltcg + net_gold_ltcg
    current_ltcg = max(net_current_ltcg, Decimal("0"))
    current_stcg = max(net_current_stcg, Decimal("0"))
    headroom = max(exemption - prior_ltcg, Decimal("0"))
    # Exemption applies to equity LTCG only; gold LTCG is flat with no exemption.
    taxable_ltcg = max(max(net_equity_ltcg, Decimal("0")) - headroom, Decimal("0"))
    gold_ltcg_tax = max(net_gold_ltcg, Decimal("0")) * ltcg_rate
    tax = taxable_ltcg * ltcg_rate + current_stcg * stcg_rate + gold_ltcg_tax
    return {
        "assessment_year": assessment_year,
        "prior_realized_ltcg": float(prior_ltcg),
        "ltcg_headroom_remaining": float(headroom),
        "raw_current_ltcg": float(raw_current_ltcg),
        "raw_current_stcg": float(raw_current_stcg),
        "stcl_offset_applied": float(stcl_offset_applied),
        "current_ltcg": float(current_ltcg),
        "current_stcg": float(current_stcg),
        "taxable_ltcg": float(taxable_ltcg),
        "tax_owed": float(tax),
        "slab_taxed_gains_total": float(slab_taxed_gains_total),
        "salary_data_missing": salary_data_missing,
        "rates": {"ltcg_rate": float(ltcg_rate), "stcg_rate": float(stcg_rate), "ltcg_exemption": float(exemption)},
        "details": details,
    }


def calculate_fy_capital_gains_liability(
    user_id: str,
    assessment_year: int,
    *,
    tax_config: dict[str, Any] | None = None,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    full_config = tax_config if tax_config is not None else get_tax_config(assessment_year)
    config = full_config["capital_gains"]
    ltcg_rate = _d(config["ltcg_rate"])
    stcg_rate = _d(config["stcg_rate"])
    exemption = _d(config["ltcg_exemption"])

    def _partition(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        flat_rows: list[dict[str, Any]] = []
        slab_rows: list[dict[str, Any]] = []
        for row in rows:
            asset_class = _lot_asset_class(row)
            if asset_class == "equity" or (asset_class == "gold" and row["gain_type"] == "LTCG"):
                flat_rows.append(row)
            else:
                slab_rows.append(row)
        return flat_rows, slab_rows

    def _flat_tax(flat_rows: list[dict[str, Any]]) -> Decimal:
        equity_ltcg_tax = sum(
            (_d(r["computed_tax"]) for r in flat_rows
             if _lot_asset_class(r) == "equity" and r["gain_type"] == "LTCG"),
            Decimal("0"),
        )
        gold_ltcg_tax = sum(
            (_d(r["computed_tax"]) for r in flat_rows
             if _lot_asset_class(r) == "gold" and r["gain_type"] == "LTCG"),
            Decimal("0"),
        )
        equity_stcg_tax = sum(
            (_d(r["computed_tax"]) for r in flat_rows
             if _lot_asset_class(r) == "equity" and r["gain_type"] == "STCG"),
            Decimal("0"),
        )
        net_equity_ltcg = equity_ltcg_tax / ltcg_rate if ltcg_rate else Decimal("0")
        net_gold_ltcg = gold_ltcg_tax / ltcg_rate if ltcg_rate else Decimal("0")
        net_current_stcg = equity_stcg_tax / stcg_rate if stcg_rate else Decimal("0")
        if net_current_stcg < 0 and (net_equity_ltcg + net_gold_ltcg) > 0:
            stcl_offset = min(net_equity_ltcg + net_gold_ltcg, -net_current_stcg)
            remaining_offset = stcl_offset
            if net_gold_ltcg > 0 and remaining_offset > 0:
                take = min(net_gold_ltcg, remaining_offset)
                net_gold_ltcg -= take
                remaining_offset -= take
            if net_equity_ltcg > 0 and remaining_offset > 0:
                take = min(net_equity_ltcg, remaining_offset)
                net_equity_ltcg -= take
                remaining_offset -= take
            net_current_stcg += stcl_offset
        current_stcg = max(net_current_stcg, Decimal("0"))
        taxable_ltcg = max(max(net_equity_ltcg, Decimal("0")) - exemption, Decimal("0"))
        gold_ltcg_after = max(net_gold_ltcg, Decimal("0")) * ltcg_rate
        return taxable_ltcg * ltcg_rate + current_stcg * stcg_rate + gold_ltcg_after

    if profile is None:
        profile = get_user_profile(user_id)
    salary = None if profile is None else profile.get("salary")
    tax_regime = None if profile is None else profile.get("tax_regime")
    salary_data_missing = salary is None or tax_regime is None

    def _slab_tax(slab_rows: list[dict[str, Any]]) -> Decimal:
        if not slab_rows:
            return Decimal("0")
        if salary_data_missing:
            return Decimal("0")
        total_slab_gain = sum(
            (_d(r["sell_price"]) - _d(r["buy_price"])) * _d(r["sold_quantity"])
            for r in slab_rows
        )
        with_gain = _d(
            calculate_salary_tax(
                _d(salary) + total_slab_gain,
                str(tax_regime),
                assessment_year,
                tax_config=full_config,
            )["tax"]
        )
        base = _d(
            calculate_salary_tax(
                salary,
                str(tax_regime),
                assessment_year,
                tax_config=full_config,
            )["tax"]
        )
        return max(with_gain - base, Decimal("0"))

    all_rows = get_sell_allocations(user_id, assessment_year)
    paid_rows = [r for r in all_rows if r["paid_status"] == "paid"]
    flat_all, slab_all = _partition(all_rows)
    flat_paid, slab_paid = _partition(paid_rows)
    flat_tax_all = _flat_tax(flat_all)
    slab_tax_all = _slab_tax(slab_all)
    flat_tax_paid = _flat_tax(flat_paid)
    slab_tax_paid = _slab_tax(slab_paid)
    total_net_tax = flat_tax_all + slab_tax_all
    unpaid_net_tax = max(total_net_tax - (flat_tax_paid + slab_tax_paid), Decimal("0"))
    return {
        "assessment_year": assessment_year,
        "total_net_capital_gains_tax": float(total_net_tax),
        "unpaid_capital_gains_tax": float(unpaid_net_tax),
        "flat_capital_gains_tax": float(flat_tax_all),
        "slab_capital_gains_tax": float(slab_tax_all),
        "salary_data_missing": salary_data_missing,
    }


def calculate_sip_projection(monthly_amount: Any, expected_annual_return: Any, months: int) -> dict[str, Any]:
    monthly_rate = float(expected_annual_return) / 1200
    amount = float(monthly_amount)
    future_value = amount * (((1 + monthly_rate) ** months - 1) / monthly_rate) * (1 + monthly_rate) if monthly_rate else amount * months
    invested = amount * months
    return {"monthly_amount": amount, "expected_annual_return": float(expected_annual_return), "months": months, "invested": invested, "future_value": future_value, "gain": future_value - invested}


def calculate_compound_interest(principal: Any, rate: Any, years: Any) -> dict[str, Any]:
    principal_f = float(principal)
    rate_f = float(rate) / 100
    years_f = float(years)
    future_value = principal_f * ((1 + rate_f) ** years_f)
    return {"principal": principal_f, "rate": float(rate), "years": years_f, "future_value": future_value, "interest": future_value - principal_f}


def _market_value(row: dict[str, Any]) -> tuple[Decimal | None, bool]:
    qty = _d(row["remaining_quantity"])
    if row.get("stock_symbol"):
        price = row.get("current_price")
        is_stale = False
        if price in (None, ""):
            live = fetch_stock_price(row["stock_symbol"], skip_live_if_fresh_seconds=300)
            status = live.get("status")
            # "cached" is returned when skip_live_if_fresh_seconds hits a fresh price_cache row
            if status in ("ok", "stale", "cached"):
                price = live["price"]
                is_stale = status == "stale"
            else:
                return None, False
        return qty * _d(price), is_stale
    detail_stats = row.get("detail_stats") or {}
    nav = detail_stats.get("current_nav") or detail_stats.get("nav")
    is_stale = False
    if nav in (None, ""):
        nav_ref = detail_stats.get("amfi_scheme_code") or detail_stats.get("amfi_ref") or row.get("scheme_name")
        live = fetch_mf_nav(str(nav_ref), skip_live_if_fresh_seconds=300)
        status = live.get("status")
        if status in ("ok", "stale", "cached"):
            nav = live["price"]
            is_stale = status == "stale"
        else:
            return None, False
    return qty * _d(nav), is_stale


async def calculate_goal_progress(user_id: str) -> dict[int, float]:
    """Map goal_id → live open market value for lots linked to that goal."""
    goal_lots = fetch_all(
        """
        SELECT l.goal_id, l.lot_id, l.remaining_quantity, l.stock_symbol, l.mutual_fund_id, l.buy_price,
               s.sector, s.current_price, mf.scheme_name, mf.risk_category, mf.detail_stats
        FROM lots l
        LEFT JOIN stocks s ON s.symbol = l.stock_symbol
        LEFT JOIN mutual_funds mf ON mf.scheme_id = l.mutual_fund_id
        WHERE l.user_id = %s AND l.remaining_quantity > 0 AND l.goal_id IS NOT NULL
        """,
        (user_id,),
    )
    by_goal: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in goal_lots:
        by_goal[int(row["goal_id"])].append(row)

    # Outer per-goal loop is cheap aggregation; value work is _market_value per lot.
    # Flatten all lots into one gather wave (same as parallelizing every inner loop at once).
    flat: list[tuple[int, dict[str, Any]]] = [
        (goal_id, row) for goal_id, rows in by_goal.items() for row in rows
    ]
    if not flat:
        return {}

    # _market_value never raises on price failure — returns (None, False); skip that lot only.
    valued = await asyncio.gather(
        *(asyncio.to_thread(_market_value, row) for _goal_id, row in flat)
    )

    totals: dict[int, Decimal] = {goal_id: Decimal("0") for goal_id in by_goal}
    for (goal_id, _row), (value, _is_stale) in zip(flat, valued, strict=True):
        if value is not None:
            totals[goal_id] += value
    return {goal_id: float(total) for goal_id, total in totals.items()}


def calculate_overlap_and_concentration(user_id: str) -> dict[str, Any]:
    rows = fetch_all(
        """
        SELECT l.lot_id, l.remaining_quantity, l.stock_symbol, l.mutual_fund_id, l.buy_price, s.sector, s.current_price,
               mf.scheme_name, mf.risk_category, mf.detail_stats
        FROM lots l
        LEFT JOIN stocks s ON s.symbol = l.stock_symbol
        LEFT JOIN mutual_funds mf ON mf.scheme_id = l.mutual_fund_id
        WHERE l.user_id = %s AND l.remaining_quantity > 0
        """,
        (user_id,),
    )
    stock_sector_totals: defaultdict[str, Decimal] = defaultdict(Decimal)
    stock_total = Decimal("0")
    mf_total = Decimal("0")
    overlap_weighted = Decimal("0")
    overlap_details: list[dict[str, Any]] = []
    unpriced_lots: list[dict[str, Any]] = []
    stale_lots: list[dict[str, Any]] = []
    priced_lots: list[dict[str, Any]] = []
    for row in rows:
        value, is_stale = _market_value(row)
        if value is None:
            entry: dict[str, Any] = {"lot_id": row["lot_id"], "reason": "price_unavailable"}
            if row.get("stock_symbol"):
                entry["stock_symbol"] = row["stock_symbol"]
            else:
                entry["mutual_fund_id"] = row["mutual_fund_id"]
            unpriced_lots.append(entry)
            continue
        if is_stale:
            entry = {"lot_id": row["lot_id"], "reason": "stale_price"}
            if row.get("stock_symbol"):
                entry["stock_symbol"] = row["stock_symbol"]
            else:
                entry["mutual_fund_id"] = row["mutual_fund_id"]
            stale_lots.append(entry)
        if row.get("stock_symbol"):
            stock_total += value
            stock_sector_totals[row.get("sector") or "unknown"] += value
            priced_lots.append(
                {
                    "lot_id": row["lot_id"],
                    "stock_symbol": row["stock_symbol"],
                    "remaining_quantity": float(row["remaining_quantity"]),
                    "value": float(value),
                    "is_stale": is_stale,
                    "buy_price": float(row["buy_price"]),
                    "unrealized_gain": float(value - (_d(row["buy_price"]) * _d(row["remaining_quantity"]))),
                }
            )
        else:
            mf_total += value
            detail_stats = row.get("detail_stats") or {}
            finapi_ref = (
                detail_stats.get("finapi_scheme_code")
                or detail_stats.get("scheme_code")
                or detail_stats.get("amfi_scheme_code")
                or row.get("scheme_name")
            )
            overlap = fetch_finapi_overlap(str(finapi_ref))
            overlap_pct = _d(overlap.get("overlap_pct") or 0)
            overlap_weighted += value * overlap_pct
            overlap_details.append({"scheme_name": row.get("scheme_name"), "overlap_pct": float(overlap_pct), "weighted_value": float(value)})
            priced_lots.append(
                {
                    "lot_id": row["lot_id"],
                    "mutual_fund_id": row["mutual_fund_id"],
                    "scheme_name": row.get("scheme_name"),
                    "remaining_quantity": float(row["remaining_quantity"]),
                    "value": float(value),
                    "is_stale": is_stale,
                    "buy_price": float(row["buy_price"]),
                    "unrealized_gain": float(value - (_d(row["buy_price"]) * _d(row["remaining_quantity"]))),
                }
            )
    stock_sector_pct = {sector: float(value / stock_total * 100) for sector, value in stock_sector_totals.items()} if stock_total else {}
    mf_overlap_pct = float(overlap_weighted / mf_total) if mf_total else 0.0
    return {
        "stock_open_value": float(stock_total),
        "stock_sector_concentration_pct": stock_sector_pct,
        "mutual_fund_open_value": float(mf_total),
        "mutual_fund_overlap_pct": mf_overlap_pct,
        "mutual_fund_overlap_details": overlap_details,
        "unpriced_lots": unpriced_lots,
        "stale_lots": stale_lots,
        "priced_lots": priced_lots,
    }


def _latest_sell_allocation(user_id: str, lot_id: int) -> dict[str, Any] | None:
    return fetch_one(
        """
        SELECT sa.*, l.stock_symbol, l.mutual_fund_id, l.buy_date, l.buy_price, s.sector, mf.scheme_name, mf.detail_stats
        FROM sell_allocations sa
        JOIN lots l ON l.lot_id = sa.lot_id
        LEFT JOIN stocks s ON s.symbol = l.stock_symbol
        LEFT JOIN mutual_funds mf ON mf.scheme_id = l.mutual_fund_id
        WHERE sa.user_id = %s AND sa.lot_id = %s
        ORDER BY sa.sell_date DESC, sa.sell_allocation_id DESC
        LIMIT 1
        """,
        (user_id, lot_id),
    )


def _historical_close(symbol: str, on_date: date) -> Decimal:
    history = yf.Ticker(symbol).history(start=on_date.isoformat(), end=(on_date + timedelta(days=5)).isoformat(), auto_adjust=False)
    if history.empty:
        raise ValueError(f"No historical price found for {symbol} on {on_date.isoformat()}")
    return _d(history["Close"].iloc[0])


def fetch_stock_price_history(symbol: str, *, period: str = "1y") -> list[dict[str, Any]]:
    """Return ascending Close series as {date: YYYY-MM-DD, value: float} via yfinance history()."""
    period_key = (period or "1y").strip().lower()
    if period_key not in STOCK_HISTORY_PERIODS:
        raise ValueError(
            f"Unsupported period {period!r}; allowed: {', '.join(sorted(STOCK_HISTORY_PERIODS))}"
        )
    history = yf.Ticker(symbol).history(period=period_key, auto_adjust=False)
    if history is None or getattr(history, "empty", True):
        raise ValueError(f"No historical price data returned for {symbol}")
    if "Close" not in history.columns:
        raise ValueError(f"Close column missing in history for {symbol}")

    points: list[dict[str, Any]] = []
    for idx, close in history["Close"].items():
        if close is None or (isinstance(close, float) and close != close):  # NaN
            continue
        try:
            value = float(close)
        except (TypeError, ValueError):
            continue
        if hasattr(idx, "date"):
            day = idx.date()
        else:
            day = date.fromisoformat(str(idx)[:10])
        points.append({"date": day.isoformat(), "value": value})
    points.sort(key=lambda p: p["date"])
    if not points:
        raise ValueError(f"No usable Close points for {symbol}")
    return points


def fetch_mf_nav_history(scheme_code: str, *, period: str = "3y") -> list[dict[str, Any]]:
    """Fetch NAV history from mfapi.in; return ascending {date, value} (best-effort third party)."""
    code = str(scheme_code).strip()
    if not code.isdigit():
        raise ValueError(f"scheme_code must be a numeric AMFI code, got {scheme_code!r}")
    period_key = (period or "3y").strip().lower()
    if period_key not in MF_HISTORY_PERIOD_DAYS:
        raise ValueError(
            f"Unsupported period {period!r}; allowed: {', '.join(sorted(MF_HISTORY_PERIOD_DAYS))}"
        )

    url = MFAPI_HISTORY_URL.format(scheme_code=code)
    max_attempts = 2
    response = None
    last_exc = None

    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.get(url, timeout=30)
            if response.status_code == 502 or (500 <= response.status_code < 600):
                if attempt < max_attempts:
                    continue
            break
        except requests.exceptions.Timeout as exc:
            last_exc = exc
            if attempt < max_attempts:
                continue
            raise ValueError(f"mfapi.in request failed for scheme {code}: {exc}") from exc
        except requests.RequestException as exc:
            raise ValueError(f"mfapi.in request failed for scheme {code}: {exc}") from exc

    try:
        if response is None:
            if last_exc:
                raise ValueError(f"mfapi.in request failed for scheme {code}: {last_exc}") from last_exc
            raise ValueError(f"mfapi.in request failed for scheme {code}: No response")
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        raise ValueError(f"mfapi.in request failed for scheme {code}: {exc}") from exc
    except ValueError as exc:
        raise ValueError(f"mfapi.in returned invalid JSON for scheme {code}") from exc

    if not isinstance(payload, dict) or payload.get("status") != "SUCCESS":
        raise ValueError(f"mfapi.in did not return SUCCESS for scheme {code}")
    raw_rows = payload.get("data")
    if not isinstance(raw_rows, list) or not raw_rows:
        raise ValueError(f"mfapi.in returned no NAV data for scheme {code}")

    points: list[dict[str, Any]] = []
    for row in raw_rows:
        if not isinstance(row, dict):
            continue
        date_raw = row.get("date")
        nav_raw = row.get("nav")
        if not date_raw or nav_raw in (None, ""):
            continue
        try:
            day = datetime.strptime(str(date_raw).strip(), "%d-%m-%Y").date()
            value = float(nav_raw)
        except (TypeError, ValueError):
            continue
        points.append({"date": day.isoformat(), "value": value})

    points.sort(key=lambda p: p["date"])
    if not points:
        raise ValueError(f"No usable NAV points for scheme {code}")

    max_days = MF_HISTORY_PERIOD_DAYS[period_key]
    if max_days is not None:
        cutoff = date.today() - timedelta(days=max_days)
        cutoff_s = cutoff.isoformat()
        points = [p for p in points if p["date"] >= cutoff_s]
        if not points:
            raise ValueError(f"No NAV points in period {period_key} for scheme {code}")
    return points


def _truncate_history_to_recent_days(
    points: list[dict[str, Any]], *, days: int
) -> list[dict[str, Any]]:
    """Keep points on/after (today - days). Assumes ascending by date."""
    if not points:
        return points
    cutoff_s = (date.today() - timedelta(days=days)).isoformat()
    return [p for p in points if p["date"] >= cutoff_s]


def _amfi_scheme_code_for_mf(mutual_fund_id: int) -> str | None:
    row = fetch_one(
        "SELECT detail_stats FROM mutual_funds WHERE scheme_id = %s",
        (mutual_fund_id,),
    )
    if not row:
        return None
    detail_stats = row.get("detail_stats") or {}
    code = detail_stats.get("amfi_scheme_code")
    if code in (None, ""):
        return None
    return str(code)


def calculate_portfolio_history_proxy(user_id: str, *, period: str = "1y") -> list[dict[str, Any]]:
    """
    Proxy series: today's open holdings × each asset's historical price/NAV by date.
    Ignores buy/sell timing and cash flows. Returns ascending {date, value} points.
    """
    period_key = (period or "1y").strip().lower()
    if period_key not in PORTFOLIO_HISTORY_PERIODS:
        raise ValueError(
            f"Unsupported period {period!r}; allowed: {', '.join(sorted(PORTFOLIO_HISTORY_PERIODS))}"
        )

    portfolio = calculate_overlap_and_concentration(user_id)
    priced_lots = portfolio.get("priced_lots") or []
    if not priced_lots:
        return []

    # Group by asset → summed remaining_quantity
    stock_qty: dict[str, float] = defaultdict(float)
    mf_qty: dict[int, float] = defaultdict(float)
    for lot in priced_lots:
        qty = float(lot.get("remaining_quantity") or 0)
        if qty <= 0:
            continue
        if lot.get("stock_symbol"):
            stock_qty[str(lot["stock_symbol"])] += qty
        elif lot.get("mutual_fund_id") is not None:
            mf_qty[int(lot["mutual_fund_id"])] += qty

    # Per-asset history: date → price (after optional stock 3y truncation)
    series_by_asset: list[tuple[float, dict[str, float]]] = []

    for symbol, qty in stock_qty.items():
        fetch_period = "5y" if period_key == "3y" else period_key
        try:
            points = fetch_stock_price_history(symbol, period=fetch_period)
        except Exception as exc:
            _logger.warning(
                "portfolio history: stock fetch failed symbol=%s period=%s: %s",
                symbol,
                fetch_period,
                exc,
            )
            continue
        if period_key == "3y":
            before_n = len(points)
            points = _truncate_history_to_recent_days(points, days=_PORTFOLIO_HISTORY_3Y_DAYS)
            _logger.info(
                "portfolio history: stock %s truncated 5y→3y points %s→%s",
                symbol,
                before_n,
                len(points),
            )
        if not points:
            _logger.warning(
                "portfolio history: stock %s produced no points after period handling",
                symbol,
            )
            continue
        series_by_asset.append((qty, {p["date"]: float(p["value"]) for p in points}))

    for mf_id, qty in mf_qty.items():
        amfi = _amfi_scheme_code_for_mf(mf_id)
        if not amfi:
            _logger.warning(
                "portfolio history: skipping mutual_fund_id=%s — no amfi_scheme_code in DB",
                mf_id,
            )
            continue
        try:
            points = fetch_mf_nav_history(amfi, period=period_key)
        except Exception as exc:
            _logger.warning(
                "portfolio history: MF fetch failed mutual_fund_id=%s amfi=%s period=%s: %s",
                mf_id,
                amfi,
                period_key,
                exc,
            )
            continue
        if not points:
            _logger.warning(
                "portfolio history: MF mutual_fund_id=%s amfi=%s produced no points",
                mf_id,
                amfi,
            )
            continue
        series_by_asset.append((qty, {p["date"]: float(p["value"]) for p in points}))

    if not series_by_asset:
        _logger.warning(
            "portfolio history: no asset series fetched for user_id=%s period=%s",
            user_id,
            period_key,
        )
        return []

    all_dates = sorted({d for _qty, series in series_by_asset for d in series})
    # Forward-fill per asset from first available date; before first date → contribute 0
    filled: list[tuple[float, dict[str, float | None]]] = []
    for qty, series in series_by_asset:
        first_date = min(series)
        last: float | None = None
        by_date: dict[str, float | None] = {}
        for d in all_dates:
            if d < first_date:
                by_date[d] = None  # contribute 0
                continue
            if d in series:
                last = series[d]
            by_date[d] = last
        filled.append((qty, by_date))

    out: list[dict[str, Any]] = []
    for d in all_dates:
        total = 0.0
        for qty, by_date in filled:
            px = by_date[d]
            if px is not None:
                total += qty * px
        out.append({"date": d, "value": round(total, 2)})
    return out


def _cagr(start: Any, end: Any, days: int) -> float:
    if days <= 0:
        return 0.0
    return (float(end) / float(start)) ** (365 / days) - 1


def calculate_exit_timing_insight(user_id: str, lot_id: int, chroma_id: str | None = None) -> dict[str, Any]:
    existing = fetch_one(
        """
        SELECT * FROM journal
        WHERE user_id = %s AND entry_type = 'exit_timing_insight' AND linked_ref_type = 'lot' AND linked_ref_id = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (user_id, str(lot_id)),
    )
    if existing:
        return {"already_written": True, "journal": existing}
    sale = _latest_sell_allocation(user_id, lot_id)
    if not sale:
        raise ValueError(f"No sell_allocation found for lot_id {lot_id}")
    sell_date = _as_date(sale["sell_date"])
    days_since_sale = max((date.today() - sell_date).days, 0)
    sale_price = _d(sale["sell_price"])
    if sale["stock_symbol"]:
        asset_now = _d(fetch_stock_price(sale["stock_symbol"])["price"])
        asset_name = sale["stock_symbol"]
    else:
        nav_ref = (sale.get("detail_stats") or {}).get("amfi_scheme_code") or sale.get("scheme_name")
        asset_now = _d(fetch_mf_nav(str(nav_ref))["price"])
        asset_name = sale.get("scheme_name")
    benchmark_at_sale = _historical_close(NIFTY_50_TICKER, sell_date)
    benchmark_now = _d(fetch_benchmark_price(NIFTY_50_TICKER)["price"])
    asset_cagr = _cagr(sale_price, asset_now, days_since_sale)
    benchmark_cagr = _cagr(benchmark_at_sale, benchmark_now, days_since_sale)
    delta = asset_cagr - benchmark_cagr
    summary = (
        f"{asset_name} since sale CAGR {asset_cagr * 100:.2f}% vs Nifty 50 {benchmark_cagr * 100:.2f}%; "
        f"delta {delta * 100:.2f}pp"
    )
    chroma_id = chroma_id or f"exit:{lot_id}:{uuid4().hex}"
    chroma_client.write_journal_embedding(
        chroma_id=chroma_id,
        user_id=user_id,
        entry_type="exit_timing_insight",
        text=summary,
    )
    journal = write_journal_row(
        user_id=user_id,
        entry_type="exit_timing_insight",
        linked_ref_type="lot",
        linked_ref_id=str(lot_id),
        chroma_id=chroma_id,
        text_snapshot=summary,
    )
    return {
        "lot_id": lot_id,
        "sale_date": sell_date.isoformat(),
        "asset_name": asset_name,
        "asset_cagr_pct": asset_cagr * 100,
        "benchmark_cagr_pct": benchmark_cagr * 100,
        "delta_pct_points": delta * 100,
        "journal": journal,
    }


def calculate_strategy_deviation(user_id: str, goal_id: int, chroma_id: str | None = None) -> dict[str, Any]:
    goal = fetch_one("SELECT * FROM goals WHERE user_id = %s AND goal_id = %s", (user_id, goal_id))
    if not goal:
        raise ValueError(f"Goal {goal_id} not found for user {user_id}")
    variant_id = goal["selected_variant_id"]
    variant = fetch_one(
        "SELECT * FROM goal_strategy_variants WHERE goal_id = %s AND variant_id = %s",
        (goal_id, variant_id),
    ) if variant_id else fetch_one(
        "SELECT * FROM goal_strategy_variants WHERE goal_id = %s AND is_selected = true ORDER BY variant_id DESC LIMIT 1",
        (goal_id,),
    )
    if not variant:
        raise ValueError(f"No selected goal strategy variant found for goal_id {goal_id}")
    rows = fetch_all(
        """
        SELECT l.remaining_quantity, l.stock_symbol, l.mutual_fund_id, l.buy_price, s.sector, s.current_price,
               mf.scheme_name, mf.risk_category, mf.detail_stats
        FROM lots l
        LEFT JOIN stocks s ON s.symbol = l.stock_symbol
        LEFT JOIN mutual_funds mf ON mf.scheme_id = l.mutual_fund_id
        WHERE l.user_id = %s AND l.goal_id = %s AND l.remaining_quantity > 0
        """,
        (user_id, goal_id),
    )
    actual_totals: defaultdict[str, Decimal] = defaultdict(Decimal)
    actual_value = Decimal("0")
    for row in rows:
        value, _is_stale = _market_value(row)
        if value is None:
            continue
        actual_value += value
        bucket = row.get("sector") if row.get("stock_symbol") else row.get("risk_category")
        actual_totals[bucket or row.get("scheme_name") or row.get("stock_symbol") or "unknown"] += value
    actual_pct = {bucket: float(value / actual_value * 100) for bucket, value in actual_totals.items()} if actual_value else {}
    target_pct_raw = variant["target_allocation_pct"] or {}
    target_pct = {str(key): float(value) for key, value in target_pct_raw.items()}
    buckets = sorted(set(actual_pct) | set(target_pct))
    deviation = {
        bucket: {
            "actual_pct": actual_pct.get(bucket, 0.0),
            "target_pct": target_pct.get(bucket, 0.0),
            "delta_pct_points": actual_pct.get(bucket, 0.0) - target_pct.get(bucket, 0.0),
        }
        for bucket in buckets
    }
    summary = "; ".join(f"{bucket} {item['delta_pct_points']:+.2f}pp" for bucket, item in deviation.items()) or "No open lots for this goal"
    chroma_id = chroma_id or f"strategy:{goal_id}:{uuid4().hex}"
    chroma_client.write_journal_embedding(
        chroma_id=chroma_id,
        user_id=user_id,
        entry_type="strategy_deviation",
        text=summary,
    )
    journal = write_journal_row(
        user_id=user_id,
        entry_type="strategy_deviation",
        linked_ref_type="goal",
        linked_ref_id=str(goal_id),
        chroma_id=chroma_id,
        text_snapshot=summary,
    )
    return {
        "goal_id": goal_id,
        "variant_id": variant_id,
        "actual_value": float(actual_value),
        "actual_allocation_pct": actual_pct,
        "target_allocation_pct": target_pct,
        "deviation": deviation,
        "journal": journal,
    }


_VARIANT_KEYS = (
    "variant_type",
    "allocation_pct",
    "stock_picks",
    "mf_debt_equity_split",
    "rationale",
    "target_allocation_pct",
    "target_monthly_expense_ceiling",
    "target_cash_reserve_balance",
)
_REQUIRED_VARIANT_TYPES = ("conservative", "moderate", "aggressive")


def generate_goal_strategy_variants(
    user_id: str, target_amount: Decimal | None, timeframe_years: int | None
) -> list[dict[str, Any]]:
    profile = get_user_profile(user_id)
    if not profile:
        raise ValueError(f"No users_profile row for user_id={user_id}")
    liabilities = get_user_liabilities(user_id)
    holdings = get_user_open_lots(user_id)

    prompt = (
        "You are the Goal Agent. Produce investment strategy variants as a JSON array.\n"
        "Both target_amount and timeframe_years may be null — in that case suggest a reasonable goal "
        "and invent variants for it.\n"
        "Always include exactly 3 variants with variant_type conservative, moderate, and aggressive. "
        "Optionally include a 4th with variant_type situational if the user's situation warrants it.\n"
        "Each object must have exactly these keys: "
        + ", ".join(_VARIANT_KEYS)
        + ".\n"
        "Shape example only (not the actual values to return) — match these types/shapes exactly:\n"
        "{\n"
        '  "variant_type": "moderate",\n'
        '  "allocation_pct": {"equity": 60, "debt": 30, "gold": 10},\n'
        '  "stock_picks": ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS"],\n'
        '  "mf_debt_equity_split": {"debt": 40, "equity": 60},\n'
        '  "rationale": "Balanced mix for a medium-term goal with moderate risk.",\n'
        '  "target_allocation_pct": {"equity": 55, "debt": 35, "gold": 10},\n'
        '  "target_monthly_expense_ceiling": 50000,\n'
        '  "target_cash_reserve_balance": 200000\n'
        "}\n"
        "allocation_pct, target_allocation_pct, and mf_debt_equity_split must be JSON objects (dicts); "
        "stock_picks must be a JSON array of strings.\n"
        f"target_amount={target_amount}\n"
        f"timeframe_years={timeframe_years}\n"
        f"profile_salary={profile.get('salary')}\n"
        f"profile_risk_tier={profile.get('risk_tier')}\n"
        f"profile_cash_balance={profile.get('current_cash_balance')}\n"
        f"liabilities={_jsonable(liabilities)}\n"
        f"holdings={_jsonable(holdings)}\n"
    )

    client = get_gemini_client()
    resp = client.models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    raw = getattr(resp, "text", None)
    if not raw:
        raise ValueError("Gemini returned empty content for strategy variants")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini strategy variants JSON parse failed: {exc}") from exc
    if not isinstance(parsed, list):
        raise ValueError(f"Expected a JSON array of variants, got {type(parsed).__name__}")
    if len(parsed) not in (3, 4):
        raise ValueError(f"Expected 3 or 4 variants, got {len(parsed)}")

    variants: list[dict[str, Any]] = []
    for i, item in enumerate(parsed):
        if not isinstance(item, dict):
            raise ValueError(f"Variant at index {i} is not an object")
        missing = [k for k in _VARIANT_KEYS if k not in item]
        if missing:
            raise ValueError(f"Variant at index {i} missing keys: {missing}")
        for field, expected in (
            ("allocation_pct", dict),
            ("target_allocation_pct", dict),
            ("stock_picks", list),
            ("mf_debt_equity_split", dict),
        ):
            if not isinstance(item[field], expected):
                raise ValueError(
                    f"Variant at index {i} field {field} must be {expected.__name__}, "
                    f"got {type(item[field]).__name__}"
                )
        variants.append({k: item[k] for k in _VARIANT_KEYS})

    types_present = {v["variant_type"] for v in variants}
    missing_required = [t for t in _REQUIRED_VARIANT_TYPES if t not in types_present]
    if missing_required:
        raise ValueError(f"Missing required variant_type(s): {missing_required}")
    allowed = set(_REQUIRED_VARIANT_TYPES) | {"situational"}
    unexpected = types_present - allowed
    if unexpected:
        raise ValueError(f"Unexpected variant_type(s): {unexpected}")
    if len(variants) == 4 and "situational" not in types_present:
        raise ValueError("4th variant must have variant_type situational")
    return variants


_STOCK_REC_CACHE: dict[str, tuple[datetime, list[dict[str, str]]]] = {}
_STOCK_REC_CACHE_TTL = timedelta(minutes=15)


def _build_stock_csv_block(catalog_rows: list[dict[str, Any]]) -> str:
    # Format per-stock data block in a token-efficient CSV style
    stock_data_lines = [
        "symbol,sector,current_price,pct_change_today,pct_change_5d,volume_vs_avg_ratio,atr_volatility_ratio,pe_ratio,market_cap"
    ]
    for row in catalog_rows:
        sym = row["symbol"]
        sect = (row["sector"] or "N/A").replace(",", " ")
        price = str(row["current_price"]) if row["current_price"] is not None else "N/A"
        change = str(row["pct_change_today"]) if row["pct_change_today"] is not None else "N/A"
        change_5d = str(row["pct_change_5d"]) if row.get("pct_change_5d") is not None else "N/A"
        vol_ratio = str(row["volume_vs_avg_ratio"]) if row.get("volume_vs_avg_ratio") is not None else "N/A"
        atr_ratio = str(row["atr_volatility_ratio"]) if row.get("atr_volatility_ratio") is not None else "N/A"
        pe = str(row["pe_ratio"]) if row["pe_ratio"] is not None else "N/A"
        mcap = str(row["market_cap"]) if row["market_cap"] is not None else "N/A"
        stock_data_lines.append(
            f"{sym},{sect},{price},{change},{change_5d},{vol_ratio},{atr_ratio},{pe},{mcap}"
        )
    return "\n".join(stock_data_lines)


_SHORTLIST_CACHE_TTL = timedelta(hours=12)


def generate_stock_shortlist() -> list[str]:
    now = datetime.now(timezone.utc)
    row = fetch_one(
        "SELECT symbols, generated_at FROM stock_shortlist_cache ORDER BY generated_at DESC LIMIT 1"
    )
    if row:
        symbols = row["symbols"]
        if isinstance(symbols, str):
            symbols = json.loads(symbols)
        generated_at = row["generated_at"]
        if now - generated_at < _SHORTLIST_CACHE_TTL:
            _logger.info("Returning cached stock shortlist")
            return symbols
        else:
            _logger.info("Cached stock shortlist expired")

    catalog = list_catalog("stocks", filter_column="is_gold_etf", filter_value=False)
    symbol_set = {row["symbol"] for row in catalog}

    csv_block = _build_stock_csv_block(catalog)

    prompt = (
        "Given this real market data for the full stock universe, identify exactly 80 to 100 stocks that show notable signals worth a closer look — momentum, unusual volume, volatility, sector strength, or other broadly relevant market/technical factors. "
        "Use the numeric data provided plus your general knowledge of current market/sector/technology conditions. Do not tailor this to any individual investor — this is a broad screen only.\n\n"
        f"Available Stock Data (CSV format):\n{csv_block}\n\n"
        "Return ONLY a JSON array of stock symbol strings (each must be from the provided list). You must output between 80 and 100 symbols in your array. No other keys, no explanations, no markdown."
    )

    client = get_gemini_client()
    resp = client.models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    raw = getattr(resp, "text", None)
    if not raw:
        raise ValueError("Gemini returned empty content for stock shortlist")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini stock shortlist JSON parse failed: {exc}") from exc

    if not isinstance(parsed, list):
        raise ValueError(f"Expected stock shortlist to be a JSON array, got {type(parsed).__name__}")
    for sym in parsed:
        if not isinstance(sym, str):
            raise ValueError(f"Expected symbol to be a string, got {type(sym).__name__}")

    filtered = [sym for sym in parsed if sym in symbol_set]

    count = len(filtered)
    if count < 20 or count > 150:
        raise ValueError(f"Gemini stock shortlist count {count} is wildly off (expected 20-150). Filtered: {filtered!r}")
    elif count < 60 or count > 100:
        _logger.warning(f"Gemini stock shortlist count {count} is outside the optimal range of 60-100.")

    from psycopg.types.json import Jsonb
    with connect() as conn:
        conn.execute("DELETE FROM stock_shortlist_cache")
        conn.execute(
            "INSERT INTO stock_shortlist_cache (symbols, generated_at) VALUES (%s, %s)",
            (Jsonb(filtered), now),
        )
    return filtered


def generate_stock_recommendations(user_id: str) -> list[dict[str, str]]:
    now = datetime.now(timezone.utc)
    if user_id in _STOCK_REC_CACHE:
        cached_time, recs = _STOCK_REC_CACHE[user_id]
        if now - cached_time < _STOCK_REC_CACHE_TTL:
            _logger.info(f"Returning cached stock recommendations for user_id={user_id}")
            return recs
        else:
            _logger.info(f"Cached stock recommendations expired for user_id={user_id}")

    profile = get_user_profile(user_id)
    if not profile:
        raise ValueError(f"No users_profile row for user_id={user_id}")
    goals = get_user_goals(user_id)
    holdings = get_user_open_lots(user_id)

    shortlist_symbols = generate_stock_shortlist()
    catalog_full = list_catalog("stocks", filter_column="is_gold_etf", filter_value=False)
    symbol_set = {row["symbol"] for row in catalog_full}

    catalog = [row for row in catalog_full if row["symbol"] in shortlist_symbols]
    stock_data_block = _build_stock_csv_block(catalog)

    prompt = (
        "Recommend 5 to 10 stocks for this user given their profile, goals, and holdings. "
        "The stocks below have already been broadly screened for notable market signals. Pick the best 5-10 fits for this specific user's profile, goals, and holdings. "
        "Your recommendations must be strictly grounded in the real, current per-stock data provided below (such as price, daily percentage change, sector, P/E ratio, and market cap), rather than relying on general historical training data or pre-existing knowledge about the companies.\n"
        f"Available Stock Data (CSV format):\n{stock_data_block}\n\n"
        "Only return symbols from the available stock data list. Do not invent, modify, or suggest any symbol not in this list.\n"
        "Return ONLY a JSON array of objects, each with exactly three keys: symbol (must be from the available list), confidence (must be exactly \"High\" or \"Moderate\"), and reason (a single concise sentence, max ~20 words, explaining why this stock fits this user's profile/goals/holdings). No other text, markdown, or keys.\n"
        f"profile_salary={profile.get('salary')}\n"
        f"profile_risk_tier={profile.get('risk_tier')}\n"
        f"profile_cash_balance={profile.get('current_cash_balance')}\n"
        f"goals={_jsonable(goals)}\n"
        f"holdings={_jsonable(holdings)}\n"
    )

    client = get_gemini_client()
    resp = client.models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            thinking_config=types.ThinkingConfig(thinking_level="MEDIUM"),
        ),
    )
    raw = getattr(resp, "text", None)
    if not raw:
        raise ValueError("Gemini returned empty content for stock recommendations")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini stock recommendations JSON parse failed: {exc}") from exc
    if not isinstance(parsed, list):
        raise ValueError(f"Expected a JSON array, got {type(parsed).__name__}: {parsed!r}")

    for item in parsed:
        if not isinstance(item, dict):
            raise ValueError(f"Expected each item to be a dict, got {type(item).__name__}: {item!r}")
        if set(item.keys()) != {"symbol", "confidence", "reason"}:
            raise ValueError(f"Expected keys to be exactly {{'symbol', 'confidence', 'reason'}}, got: {list(item.keys())}")
        if not isinstance(item["symbol"], str):
            raise ValueError(f"Expected symbol to be a str, got {type(item['symbol']).__name__}")
        if item["confidence"] not in ("High", "Moderate"):
            raise ValueError(f"Expected confidence to be 'High' or 'Moderate', got {item['confidence']!r}")
        if not isinstance(item["reason"], str) or not item["reason"].strip():
            raise ValueError(f"Expected reason to be a non-empty str, got {item['reason']!r}")

    if not (5 <= len(parsed) <= 10):
        raise ValueError(f"Expected 5 to 10 stock recommendations, got {len(parsed)}: {parsed!r}")

    # Drop hallucinated tickers silently — a stray invented symbol shouldn't fail the whole recommendation;
    # the returned list is only as trustworthy as the real catalog.
    shortlist_set = set(shortlist_symbols)
    filtered = [item for item in parsed if item["symbol"] in shortlist_set]
    if not (5 <= len(filtered) <= 10):
        raise ValueError(
            f"After filtering hallucinated symbols, only {len(filtered)} valid recommendations "
            f"remained (need 5-10): {filtered!r}"
        )

    _STOCK_REC_CACHE[user_id] = (now, filtered)
    return filtered
