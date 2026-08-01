from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import db
from .. import tools
from ..schemas import (
    AssetAllocation,
    FixedDepositInvestResponse,
    GoldInvestResponse,
    InvestQueryParams,
    MutualFundInvestListResponse,
    MutualFundInvestResponse,
    PriceHistoryResponse,
    SectorWeight,
    StockInvestListResponse,
    StockInvestResponse,
)

router = APIRouter()

_DETAIL_STALE_AFTER = timedelta(hours=24)


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


def _mf_extra_from_live(live: dict[str, Any] | None) -> dict[str, Any]:
    if not live:
        return {
            "scheme_category": None,
            "scheme_category_label": None,
            "cagr_returns": None,
            "asset_allocation": None,
            "sectors": None,
        }
    allocation = live.get("asset_allocation")
    sectors_raw = live.get("sectors")
    return {
        "scheme_category": live.get("scheme_category"),
        "scheme_category_label": live.get("scheme_category_label"),
        "cagr_returns": live.get("cagr_returns"),
        "asset_allocation": AssetAllocation(**allocation) if isinstance(allocation, dict) else None,
        "sectors": (
            [SectorWeight(**item) for item in sectors_raw]
            if isinstance(sectors_raw, list)
            else None
        ),
    }


def _mf_catalog_only(row: dict) -> MutualFundInvestResponse:
    # NAV fields not populated until a background NAV-refresh job exists.
    return MutualFundInvestResponse(
        scheme_id=row["scheme_id"],
        name=row["scheme_name"],
        risk_category=row["risk_category"],
        cagr=row["cagr"],
        latest_nav=None,
        previous_nav=None,
        nav_change=None,
        pct_change=None,
        market_cap_weightage=None,
        amfi_scheme_code=_mf_amfi_scheme_code(row),
        **_mf_extra_from_live(None),
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


def _refresh_stock_detail_if_stale(row: dict) -> None:
    try:
        # Detail "complete" for 24h cadence: name OR fifty_two_week_high present.
        # Do NOT require pe_ratio — gold ETFs lack trailingPE. Some ETFs also lack
        # longName (e.g. HDFCGOLD.NS) but still return 52W from .info; treating 52W
        # as proof we've already refreshed stops perpetual .info hits.
        detail_present = row.get("name") is not None or row.get("fifty_two_week_high") is not None
        if detail_present and not _updated_at_older_than(row, _DETAIL_STALE_AFTER):
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


def _refresh_mf_detail_if_stale(row: dict) -> None:
    try:
        detail_stats = row.get("detail_stats") or {}
        if detail_stats and not _updated_at_older_than(row, _DETAIL_STALE_AFTER):
            return
        fields = tools.fetch_mf_detail_fields(row["scheme_name"])
        if fields is None:
            return
        db.update_mf_detail_stats(row["scheme_name"], fields)
        row["detail_stats"] = fields
    except Exception:
        return


def _fetch_mf_nav_for_list_row(row: dict[str, Any]) -> dict[str, Any]:
    """Resolve nav_id from row (post-refresh) and fetch live/cached NAV. May raise ValueError."""
    detail_stats = row.get("detail_stats") or {}
    nav_id = detail_stats.get("amfi_scheme_code") or row["scheme_name"]
    return tools.fetch_mf_nav(nav_id)


def _paginate(rows: list[dict[str, Any]], page: int, page_size: int) -> tuple[list[dict[str, Any]], int, bool, bool]:
    total = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    has_prev = page > 1 and total > 0
    has_next = start + page_size < total
    return page_rows, total, has_prev, has_next


def _resolve_stock_catalog_rows(params: InvestQueryParams) -> tuple[list[dict[str, Any]], dict[str, dict[str, str]]]:
    rec_lookup: dict[str, dict[str, str]] = {}
    if params.search:
        rows = db.list_catalog(
            "stocks",
            search_column="symbol",
            search_term=params.search,
            sort_column=None,
            sort_order="asc",
        )
    elif params.user_id:
        try:
            recommendations = tools.generate_stock_recommendations(params.user_id)
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
async def list_stocks(params: InvestQueryParams = Depends()) -> StockInvestListResponse:
    rows, rec_lookup = await asyncio.to_thread(_resolve_stock_catalog_rows, params)
    page_rows, total, has_prev, has_next = _paginate(rows, params.page, params.page_size)

    # Same per-row helper as before (swallows all exceptions internally). Run in
    # parallel so one slow/failing .info call does not block the others.
    if page_rows:
        await asyncio.gather(
            *(asyncio.to_thread(_refresh_stock_detail_if_stale, row) for row in page_rows)
        )

    symbols = [row["symbol"] for row in page_rows]
    live_by_symbol = (
        await asyncio.to_thread(
            tools.fetch_stock_prices_batch, symbols, skip_live_if_fresh_seconds=300
        )
        if symbols
        else {}
    )

    items: list[StockInvestResponse] = []
    for row in page_rows:
        live = live_by_symbol.get(row["symbol"]) or {"status": "unavailable"}
        status = live.get("status")
        if status == "ok":
            await asyncio.to_thread(
                db.update_stock_price_fields,
                row["symbol"],
                live["price"],
                live.get("pct_change_today"),
            )
            price, pct_change = live["price"], live.get("pct_change_today")
        elif status in ("stale", "cached"):
            price, pct_change = live["price"], row["pct_change_today"]
        else:
            price, pct_change = row["current_price"], row["pct_change_today"]
        
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
async def list_mf(params: InvestQueryParams = Depends()) -> MutualFundInvestListResponse:
    rows = await asyncio.to_thread(
        db.list_catalog,
        "mutual_funds",
        search_column="scheme_name" if params.search else None,
        search_term=params.search,
        sort_column=None,
        sort_order="asc",
    )
    # Stable pagination key — scheme_name ASC.
    rows.sort(key=lambda r: r["scheme_name"])
    page_rows, total, has_prev, has_next = _paginate(rows, params.page, params.page_size)

    # Phase 1 then phase 2 (not merged): loop 2 reads detail_stats.amfi_scheme_code
    # that phase 1 may populate on this request. Parallelize only within each phase.
    if page_rows:
        await asyncio.gather(
            *(asyncio.to_thread(_refresh_mf_detail_if_stale, row) for row in page_rows)
        )

    try:
        live_by_row = (
            await asyncio.gather(
                *(asyncio.to_thread(_fetch_mf_nav_for_list_row, row) for row in page_rows)
            )
            if page_rows
            else []
        )
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    items: list[MutualFundInvestResponse] = []
    for row, live in zip(page_rows, live_by_row, strict=True):
        status = live.get("status")
        if status == "ok":
            items.append(
                MutualFundInvestResponse(
                    scheme_id=row["scheme_id"],
                    name=row["scheme_name"],
                    risk_category=row["risk_category"],
                    cagr=row["cagr"],
                    latest_nav=live["latest_nav"],
                    previous_nav=live["previous_nav"],
                    nav_change=live["nav_change"],
                    pct_change=live["pct_change"],
                    market_cap_weightage=live["market_cap_weightage"],
                    amfi_scheme_code=_mf_amfi_scheme_code(row),
                    **_mf_extra_from_live(live),
                )
            )
        elif status in ("stale", "cached"):
            items.append(
                MutualFundInvestResponse(
                    scheme_id=row["scheme_id"],
                    name=row["scheme_name"],
                    risk_category=row["risk_category"],
                    cagr=row["cagr"],
                    latest_nav=live["price"],
                    previous_nav=None,
                    nav_change=None,
                    pct_change=None,
                    market_cap_weightage=None,
                    amfi_scheme_code=_mf_amfi_scheme_code(row),
                    **_mf_extra_from_live(None),
                )
            )
        else:
            items.append(_mf_catalog_only(row))

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
    detail_stats = catalog.get("detail_stats") or {}
    nav_id = detail_stats.get("amfi_scheme_code") or scheme_name
    try:
        live = tools.fetch_mf_nav(nav_id)
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
            market_cap_weightage=live["market_cap_weightage"],
            amfi_scheme_code=_mf_amfi_scheme_code(catalog),
            **_mf_extra_from_live(live),
        )
    if status == "stale":
        return MutualFundInvestResponse(
            scheme_id=catalog["scheme_id"],
            name=catalog["scheme_name"],
            risk_category=catalog["risk_category"],
            cagr=catalog["cagr"],
            latest_nav=live["price"],
            previous_nav=None,
            nav_change=None,
            pct_change=None,
            market_cap_weightage=None,
            amfi_scheme_code=_mf_amfi_scheme_code(catalog),
            **_mf_extra_from_live(None),
        )
    return _mf_catalog_only(catalog)


@router.get("/invest/fd", response_model=list[FixedDepositInvestResponse])
def list_fd(params: InvestQueryParams = Depends()) -> list[FixedDepositInvestResponse]:
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
def list_gold(params: InvestQueryParams = Depends()) -> list[GoldInvestResponse]:
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
