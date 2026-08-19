from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import db
from .. import tools
from ..auth import get_optional_user_id
from ..schemas import (
    AssetAllocation,
    FixedDepositInvestResponse,
    GoldInvestResponse,
    InvestQueryParams,
    MarketCapWeightage,
    MutualFundInvestListResponse,
    MutualFundInvestResponse,
    PriceHistoryResponse,
    SectorWeight,
    StockInvestListResponse,
    StockInvestResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)

_DETAIL_STALE_AFTER = timedelta(hours=24)
# Weekend gap tolerance for daily AMFI NAV (Fri→Mon), not a multi-day cache window.
_MF_NAV_STALE_THRESHOLD_DAYS = 2
_NAV_STALE_AFTER = timedelta(days=_MF_NAV_STALE_THRESHOLD_DAYS)


def _optional_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _stock_detail_kwargs(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": row.get("name"),
        "pe_ratio": _optional_float(row.get("pe_ratio")),
        "market_cap": _optional_float(row.get("market_cap")),
        "eps": _optional_float(row.get("eps")),
        "fifty_two_week_high": _optional_float(row.get("fifty_two_week_high")),
        "fifty_two_week_low": _optional_float(row.get("fifty_two_week_low")),
    }


def _mf_amfi_scheme_code(row: dict) -> str | None:
    detail_stats = row.get("detail_stats") or {}
    code = detail_stats.get("amfi_scheme_code")
    if code in (None, ""):
        return None
    return str(code)


def _safe_asset_allocation(raw: Any) -> AssetAllocation | None:
    if not isinstance(raw, dict):
        return None
    try:
        return AssetAllocation(**raw)
    except Exception:
        logger.warning("Ignoring malformed asset_allocation in detail_stats: %r", raw)
        return None


def _safe_market_cap_weightage(raw: Any) -> MarketCapWeightage | None:
    if not isinstance(raw, dict):
        return None
    try:
        return MarketCapWeightage(**raw)
    except Exception:
        logger.warning("Ignoring malformed market_cap_weightage in detail_stats: %r", raw)
        return None


def _safe_sectors(raw: Any) -> list[SectorWeight] | None:
    if not isinstance(raw, list):
        return None
    out: list[SectorWeight] = []
    for item in raw:
        if not isinstance(item, dict):
            logger.warning("Ignoring non-dict sector entry in detail_stats: %r", item)
            continue
        try:
            out.append(SectorWeight(**item))
        except Exception:
            logger.warning("Ignoring malformed sector entry in detail_stats: %r", item)
    return out or None


def _mf_extra_from_detail(detail_stats: dict[str, Any] | None) -> dict[str, Any]:
    if not detail_stats:
        return {
            "scheme_category": None,
            "scheme_category_label": None,
            "cagr_returns": None,
            "asset_allocation": None,
            "sectors": None,
            "market_cap_weightage": None,
        }
    return {
        "scheme_category": detail_stats.get("scheme_category"),
        "scheme_category_label": detail_stats.get("scheme_category_label"),
        "cagr_returns": detail_stats.get("cagr_returns"),
        "asset_allocation": _safe_asset_allocation(detail_stats.get("asset_allocation")),
        "sectors": _safe_sectors(detail_stats.get("sectors")),
        "market_cap_weightage": _safe_market_cap_weightage(detail_stats.get("market_cap_weightage")),
    }


def _nav_date_stale(row: dict[str, Any]) -> bool:
    """True when nav_date is present and older than _MF_NAV_STALE_THRESHOLD_DAYS."""
    nav_date = row.get("nav_date")
    if nav_date is None:
        return False
    if isinstance(nav_date, datetime):
        nav_date = nav_date.date()
    if not isinstance(nav_date, date):
        return False
    return (date.today() - nav_date).days > _MF_NAV_STALE_THRESHOLD_DAYS


def _mf_catalog_only(row: dict) -> MutualFundInvestResponse:
    # NAV fields not populated until a background NAV-refresh job exists.
    detail_stats = row.get("detail_stats") or {}
    return MutualFundInvestResponse(
        scheme_id=row["scheme_id"],
        name=row["scheme_name"],
        risk_category=row["risk_category"],
        cagr=row["cagr"],
        latest_nav=None,
        previous_nav=None,
        nav_change=None,
        pct_change=None,
        amfi_scheme_code=_mf_amfi_scheme_code(row),
        **_mf_extra_from_detail(detail_stats),
    )


def _updated_at_older_than(row: dict, max_age: timedelta) -> bool:
    updated_at = row.get("updated_at")
    if updated_at is None:
        return True
    if getattr(updated_at, "tzinfo", None) is None:
        age = (datetime.now() - updated_at).total_seconds()
    else:
        age = (datetime.now(timezone.utc) - updated_at).total_seconds()
    return age > max_age.total_seconds()


# Fields written only by fetch_stock_detail_fields (not by seed_catalog / seed_nifty500).
_STOCK_DETAIL_EXTENDED_FIELDS = (
    "pe_ratio",
    "market_cap",
    "eps",
    "fifty_two_week_high",
    "fifty_two_week_low",
)


def _stock_detail_extended_present(row: dict) -> bool:
    return any(row.get(field) is not None for field in _STOCK_DETAIL_EXTENDED_FIELDS)


def _refresh_stock_detail_if_stale(row: dict) -> None:
    try:
        # CSV seeds write name/sector only; gold ETFs may keep pe_ratio null after
        # a real fetch but will have 52W fields. Require a yfinance-only field.
        if _stock_detail_extended_present(row) and not _updated_at_older_than(row, _DETAIL_STALE_AFTER):
            return
        fields = tools.fetch_stock_detail_fields(row["symbol"])
        if fields is None:
            return
        db.update_stock_detail_fields(
            row["symbol"],
            fields["pe_ratio"],
            fields["market_cap"],
            fields["eps"],
            name=fields.get("name"),
            fifty_two_week_high=fields.get("fifty_two_week_high"),
            fifty_two_week_low=fields.get("fifty_two_week_low"),
        )
        row["pe_ratio"] = fields["pe_ratio"]
        row["market_cap"] = fields["market_cap"]
        row["eps"] = fields["eps"]
        row["name"] = fields.get("name")
        row["fifty_two_week_high"] = fields.get("fifty_two_week_high")
        row["fifty_two_week_low"] = fields.get("fifty_two_week_low")
    except Exception:
        return


# Extended fields written by fetch_mf_detail_fields (not present in the AMFI seed).
# We treat data as fresh only when at least one extended field is present AND the
# row was updated within the staleness window.  Checking only "detail_stats is
# non-empty" is NOT sufficient because the AMFI seed writes only
# amfi_scheme_code / finapi_scheme_code into detail_stats.
_MF_DETAIL_EXTENDED_SENTINEL = "cagr_returns"


def _refresh_mf_detail_if_stale(row: dict) -> None:
    try:
        detail_stats = row.get("detail_stats") or {}
        extended_present = _MF_DETAIL_EXTENDED_SENTINEL in detail_stats
        if extended_present and not _updated_at_older_than(row, _DETAIL_STALE_AFTER):
            return
        fields = tools.fetch_mf_detail_fields(row["scheme_name"])
        if fields is None:
            return
        db.update_mf_detail_stats(row["scheme_name"], fields)
        row["detail_stats"] = fields
    except Exception:
        return


def _paginate(rows: list[dict[str, Any]], page: int, page_size: int) -> tuple[list[dict[str, Any]], int, bool, bool]:
    total = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    has_prev = page > 1 and total > 0
    has_next = start + page_size < total
    return page_rows, total, has_prev, has_next


def _resolve_stock_catalog_rows(
    params: InvestQueryParams,
    user_id: str | None,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, str]]]:
    rec_lookup: dict[str, dict[str, str]] = {}
    if params.search:
        rows = db.list_catalog(
            "stocks",
            search_column="symbol",
            search_term=params.search,
            sort_column=None,
            sort_order="asc",
        )
    elif user_id:
        try:
            recommendations = tools.generate_stock_recommendations(user_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Stock recommendation generation failed: {exc}") from exc
        catalog_rows = db.list_catalog("stocks", sort_column=None, sort_order="asc")
        rec_lookup = {item["symbol"]: item for item in recommendations}
        rows = [row for row in catalog_rows if row["symbol"] in rec_lookup]
    else:
        rows = db.list_catalog("stocks", sort_column=None, sort_order="asc")
    # Stable pagination key — always symbol ASC regardless of sort_by.
    rows.sort(key=lambda r: r["symbol"])
    return rows, rec_lookup


@router.get("/invest/stocks", response_model=StockInvestListResponse)
async def list_stocks(
    params: InvestQueryParams = Depends(),
    firebase_uid: str | None = Depends(get_optional_user_id),
) -> StockInvestListResponse:
    user_id = db.get_user_id_by_firebase_uid(firebase_uid) if firebase_uid else None
    rows, rec_lookup = await asyncio.to_thread(_resolve_stock_catalog_rows, params, user_id)
    page_rows, total, has_prev, has_next = _paginate(rows, params.page, params.page_size)

    # Same per-row helper as before (swallows all exceptions internally). Run in
    # parallel so one slow/failing .info call does not block the others.
    if page_rows:
        await asyncio.gather(
            *(asyncio.to_thread(_refresh_stock_detail_if_stale, row) for row in page_rows)
        )

    symbols = [row["symbol"] for row in page_rows]
    live_by_symbol = (
        await tools.fetch_stock_prices_batch(symbols, skip_live_if_fresh_seconds=300)
        if symbols
        else {}
    )

    async def _resolve_and_update_row_price(row: dict[str, Any]) -> tuple[float | Decimal | None, float | None]:
        live = live_by_symbol.get(row["symbol"]) or {"status": "unavailable"}
        status = live.get("status")
        if status == "ok":
            try:
                await asyncio.to_thread(
                    db.update_stock_price_fields,
                    row["symbol"],
                    live["price"],
                    live.get("pct_change_today"),
                    live.get("pct_change_5d"),
                    live.get("volume_vs_avg_ratio"),
                    live.get("atr_volatility_ratio"),
                )
                return live["price"], live.get("pct_change_today")
            except Exception:
                return row["current_price"], row["pct_change_today"]
        elif status in ("stale", "cached"):
            return live["price"], row["pct_change_today"]
        else:
            return row["current_price"], row["pct_change_today"]

    resolved_prices = await asyncio.gather(
        *(_resolve_and_update_row_price(row) for row in page_rows),
        return_exceptions=True,
    )

    items: list[StockInvestResponse] = []
    for idx, row in enumerate(page_rows):
        res = resolved_prices[idx]
        if isinstance(res, Exception):
            price, pct_change = row["current_price"], row["pct_change_today"]
        else:
            price, pct_change = res
        
        rec_item = rec_lookup.get(row["symbol"])
        confidence = rec_item["confidence"] if rec_item else None
        reason = rec_item["reason"] if rec_item else None

        items.append(
            StockInvestResponse(
                symbol=row["symbol"],
                sector=row["sector"],
                price=price,
                pct_change=pct_change,
                is_gold_etf=row["is_gold_etf"],
                confidence=confidence,
                reason=reason,
                **_stock_detail_kwargs(row),
            )
        )
    return StockInvestListResponse(
        items=items,
        page=params.page,
        page_size=params.page_size,
        total=total,
        has_prev=has_prev,
        has_next=has_next,
    )


@router.get("/invest/stocks/{symbol}", response_model=StockInvestResponse)
def get_stock(symbol: str) -> StockInvestResponse:
    rows = db.list_catalog("stocks", filter_column="symbol", filter_value=symbol)
    if not rows:
        raise HTTPException(status_code=404, detail="Stock not found")
    catalog = rows[0]
    _refresh_stock_detail_if_stale(catalog)
    live = tools.fetch_stock_price(symbol)
    status = live.get("status")
    if status == "ok":
        db.update_stock_price_fields(symbol, live["price"], live.get("pct_change_today"))
        price, pct_change = live["price"], live.get("pct_change_today")
    elif status == "stale":
        price, pct_change = live["price"], catalog["pct_change_today"]
    else:
        price, pct_change = catalog["current_price"], catalog["pct_change_today"]
    return StockInvestResponse(
        symbol=catalog["symbol"],
        sector=catalog["sector"],
        price=price,
        pct_change=pct_change,
        is_gold_etf=catalog["is_gold_etf"],
        **_stock_detail_kwargs(catalog),
    )


@router.get("/invest/stocks/{symbol}/history", response_model=PriceHistoryResponse)
def get_stock_history(
    symbol: str,
    period: str = Query(default="1y"),
) -> PriceHistoryResponse:
    rows = db.list_catalog("stocks", filter_column="symbol", filter_value=symbol)
    if not rows:
        raise HTTPException(status_code=404, detail="Stock not found")
    try:
        points = tools.fetch_stock_price_history(symbol, period=period)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return PriceHistoryResponse(points=points)


@router.get("/invest/mf", response_model=MutualFundInvestListResponse)
async def list_mf(
    params: InvestQueryParams = Depends(),
    firebase_uid: str | None = Depends(get_optional_user_id),
) -> MutualFundInvestListResponse:
    user_id = db.get_user_id_by_firebase_uid(firebase_uid) if firebase_uid else None
    limit = params.page_size
    offset = (params.page - 1) * params.page_size
    rows = await asyncio.to_thread(
        db.list_catalog,
        "mutual_funds",
        search_column="scheme_name" if params.search else None,
        search_term=params.search,
        sort_column="scheme_name",
        sort_order="asc",
        limit=limit,
        offset=offset,
    )
    if rows:
        total = rows[0].get("total_count", 0)
        for r in rows:
            r.pop("total_count", None)
    else:
        total = await asyncio.to_thread(
            db.count_catalog,
            "mutual_funds",
            search_column="scheme_name" if params.search else None,
            search_term=params.search,
        )
    page_rows = rows
    has_prev = params.page > 1 and total > 0
    has_next = (params.page - 1) * params.page_size + len(page_rows) < total

    # Lazy-refresh extended detail_stats for the page (cagr_returns sentinel).
    # NAV itself comes from DB columns (latest_nav / previous_nav); get_mf falls back
    # to a live FinAPI fetch when those are missing or past _MF_NAV_STALE_THRESHOLD_DAYS.
    if page_rows:
        await asyncio.gather(
            *(asyncio.to_thread(_refresh_mf_detail_if_stale, row) for row in page_rows)
        )

    items: list[MutualFundInvestResponse] = []
    for row in page_rows:
        latest = row.get("latest_nav")
        prev = row.get("previous_nav")
        detail_stats = row.get("detail_stats") or {}
        extra = _mf_extra_from_detail(detail_stats)
        if latest is None:
            items.append(_mf_catalog_only(row))
        elif prev is None:
            items.append(
                MutualFundInvestResponse(
                    scheme_id=row["scheme_id"],
                    name=row["scheme_name"],
                    risk_category=row["risk_category"],
                    cagr=row["cagr"],
                    latest_nav=latest,
                    previous_nav=None,
                    nav_change=None,
                    pct_change=None,
                    amfi_scheme_code=_mf_amfi_scheme_code(row),
                    **extra,
                )
            )
        else:
            nav_change = latest - prev
            pct_change = (nav_change / prev * 100) if prev else None
            items.append(
                MutualFundInvestResponse(
                    scheme_id=row["scheme_id"],
                    name=row["scheme_name"],
                    risk_category=row["risk_category"],
                    cagr=row["cagr"],
                    latest_nav=latest,
                    previous_nav=prev,
                    nav_change=nav_change,
                    pct_change=pct_change,
                    amfi_scheme_code=_mf_amfi_scheme_code(row),
                    **extra,
                )
            )

    return MutualFundInvestListResponse(
        items=items,
        page=params.page,
        page_size=params.page_size,
        total=total,
        has_prev=has_prev,
        has_next=has_next,
    )


@router.get("/invest/mf/{scheme_code}/history", response_model=PriceHistoryResponse)
def get_mf_history(
    scheme_code: str,
    period: str = Query(default="3y"),
) -> PriceHistoryResponse:
    try:
        points = tools.fetch_mf_nav_history(scheme_code, period=period)
    except ValueError as e:
        # Invalid code / empty / third-party failure — 502 for upstream, 400 for bad input
        detail = str(e)
        status = 400 if "must be a numeric" in detail or "Unsupported period" in detail else 502
        raise HTTPException(status_code=status, detail=detail) from e
    return PriceHistoryResponse(points=points)


@router.get("/invest/mf/{scheme_name}", response_model=MutualFundInvestResponse)
def get_mf(scheme_name: str) -> MutualFundInvestResponse:
    rows = db.list_catalog("mutual_funds", filter_column="scheme_name", filter_value=scheme_name)
    if not rows:
        raise HTTPException(status_code=404, detail="Mutual fund not found")
    catalog = rows[0]
    # Lazy-refresh extended detail stats (same pattern as list_mf).  This populates
    # cagr_returns, sectors, asset_allocation, market_cap_weightage, scheme_category,
    # and scheme_category_label on first detail-view access for funds that were only
    # seeded with amfi_scheme_code / finapi_scheme_code by the AMFI script.
    _refresh_mf_detail_if_stale(catalog)
    latest = catalog.get("latest_nav")
    prev = catalog.get("previous_nav")
    detail_stats = catalog.get("detail_stats") or {}
    extra = _mf_extra_from_detail(detail_stats)

    # Fast path: serve DB NAV when present and fresh. Fall back to live FinAPI
    # when NAV was never populated or nav_date is older than _MF_NAV_STALE_THRESHOLD_DAYS.
    needs_live = latest is None or _nav_date_stale(catalog)
    if needs_live:
        nav_id = detail_stats.get("amfi_scheme_code") or scheme_name
        logger.info(
            "get_mf live NAV fallback for %r (latest_nav=%r, nav_date=%r)",
            scheme_name,
            latest,
            catalog.get("nav_date"),
        )
        try:
            live = tools.fetch_mf_nav(str(nav_id))
        except ValueError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
        status = live.get("status")
        if status == "ok":
            return MutualFundInvestResponse(
                scheme_id=catalog["scheme_id"],
                name=catalog["scheme_name"],
                risk_category=catalog["risk_category"],
                cagr=catalog["cagr"],
                latest_nav=live["latest_nav"],
                previous_nav=live["previous_nav"],
                nav_change=live["nav_change"],
                pct_change=live["pct_change"],
                amfi_scheme_code=_mf_amfi_scheme_code(catalog),
                market_cap_weightage=_safe_market_cap_weightage(live.get("market_cap_weightage")),
                **{
                    k: v
                    for k, v in extra.items()
                    if k != "market_cap_weightage"
                },
            )
        if status in ("stale", "cached"):
            return MutualFundInvestResponse(
                scheme_id=catalog["scheme_id"],
                name=catalog["scheme_name"],
                risk_category=catalog["risk_category"],
                cagr=catalog["cagr"],
                latest_nav=live["price"],
                previous_nav=None,
                nav_change=None,
                pct_change=None,
                amfi_scheme_code=_mf_amfi_scheme_code(catalog),
                **extra,
            )
        # Live fetch failed and DB has no NAV — catalog-only response.
        if latest is None:
            return _mf_catalog_only(catalog)
        # Live failed but DB still has a (stale) NAV — fall through to DB path.

    logger.info("get_mf DB NAV path for %r (latest_nav=%r)", scheme_name, latest)
    if prev is None:
        return MutualFundInvestResponse(
            scheme_id=catalog["scheme_id"],
            name=catalog["scheme_name"],
            risk_category=catalog["risk_category"],
            cagr=catalog["cagr"],
            latest_nav=latest,
            previous_nav=None,
            nav_change=None,
            pct_change=None,
            amfi_scheme_code=_mf_amfi_scheme_code(catalog),
            **extra,
        )
    nav_change = latest - prev
    pct_change = (nav_change / prev * 100) if prev else None
    return MutualFundInvestResponse(
        scheme_id=catalog["scheme_id"],
        name=catalog["scheme_name"],
        risk_category=catalog["risk_category"],
        cagr=catalog["cagr"],
        latest_nav=latest,
        previous_nav=prev,
        nav_change=nav_change,
        pct_change=pct_change,
        amfi_scheme_code=_mf_amfi_scheme_code(catalog),
        **extra,
    )


@router.get("/invest/fd", response_model=list[FixedDepositInvestResponse])
def list_fd(
    params: InvestQueryParams = Depends(),
    firebase_uid: str | None = Depends(get_optional_user_id),
) -> list[FixedDepositInvestResponse]:
    user_id = db.get_user_id_by_firebase_uid(firebase_uid) if firebase_uid else None
    rows = db.list_catalog(
        "fd_rates",
        search_column="bank_name" if params.search else None,
        search_term=params.search,
        sort_column=params.sort_by,
        sort_order=params.sort_order,
    )
    return [
        FixedDepositInvestResponse(
            bank=row["bank_name"],
            rate=row["interest_rate"],
            tenure=row["tenure_months"],
        )
        for row in rows
    ]


@router.get("/invest/gold", response_model=list[GoldInvestResponse])
def list_gold(
    params: InvestQueryParams = Depends(),
    firebase_uid: str | None = Depends(get_optional_user_id),
) -> list[GoldInvestResponse]:
    user_id = db.get_user_id_by_firebase_uid(firebase_uid) if firebase_uid else None
    # Live-fetch price per gold ETF row (same pattern as list_stocks); fall back to stocks.current_price if unavailable.
    rows = db.list_catalog(
        "stocks",
        search_column="symbol" if params.search else None,
        search_term=params.search,
        sort_column=params.sort_by,
        sort_order=params.sort_order,
        filter_column="is_gold_etf",
        filter_value=True,
    )
    result: list[GoldInvestResponse] = []
    for row in rows:
        live = tools.fetch_stock_price(row["symbol"], skip_live_if_fresh_seconds=300)
        status = live.get("status")
        if status == "ok" or status in ("stale", "cached"):
            price = live["price"]
        else:
            price = row["current_price"]  # unavailable — falls back to existing null column
        result.append(GoldInvestResponse(ticker=row["symbol"], price=price))
    return result
