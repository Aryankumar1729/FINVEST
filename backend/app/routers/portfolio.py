from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from .. import db
from .. import tools
from ..schemas import (
    BuyRequest,
    LotResponse,
    PortfolioResponse,
    PriceHistoryResponse,
    SellAllocationResult,
    SellRequest,
    SellResponse,
)

router = APIRouter()


@router.get("/portfolio", response_model=PortfolioResponse)
def get_portfolio(user_id: str = Query(...)) -> PortfolioResponse:
    return PortfolioResponse(**tools.calculate_overlap_and_concentration(user_id))


@router.get("/portfolio/history", response_model=PriceHistoryResponse)
def get_portfolio_history(
    user_id: str = Query(...),
    period: str = Query(default="1y"),
) -> PriceHistoryResponse:
    """Proxy portfolio value over time: today's open holdings × historical prices/NAVs."""
    try:
        points = tools.calculate_portfolio_history_proxy(user_id, period=period)
    except ValueError as exc:
        detail = str(exc)
        status = 400 if "Unsupported period" in detail else 502
        raise HTTPException(status_code=status, detail=detail) from exc
    return PriceHistoryResponse(points=points)


@router.post("/portfolio/buy", response_model=LotResponse)
def buy(req: BuyRequest) -> LotResponse:
    if db.get_user_profile(req.user_id) is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    if req.stock_symbol is not None:
        rows = db.list_catalog("stocks", filter_column="symbol", filter_value=req.stock_symbol)
    else:
        rows = db.list_catalog(
            "mutual_funds", filter_column="scheme_id", filter_value=req.mutual_fund_id
        )
    if not rows:
        raise HTTPException(status_code=404, detail="Asset not found in catalog")
    with db.connect() as conn:
        created = db.create_lot(
            {
                "user_id": req.user_id,
                "goal_id": req.goal_id,
                "stock_symbol": req.stock_symbol,
                "mutual_fund_id": req.mutual_fund_id,
                "buy_date": req.buy_date,
                "buy_price": req.buy_price,
                "quantity": req.quantity,
            },
            conn,
        )
        return LotResponse(
            lot_id=created["lot_id"],
            user_id=created["user_id"],
            goal_id=created["goal_id"],
            stock_symbol=created["stock_symbol"],
            mutual_fund_id=created["mutual_fund_id"],
            buy_date=created["buy_date"],
            buy_price=created["buy_price"],
            quantity=created["quantity"],
            remaining_quantity=created["remaining_quantity"],
        )


@router.post("/portfolio/sell", response_model=SellResponse)
def sell(req: SellRequest) -> SellResponse:
    asset = {"stock_symbol": req.stock_symbol, "mutual_fund_id": req.mutual_fund_id}
    try:
        matched_lots = tools.match_fifo_lots(
            req.user_id, asset, req.quantity, req.sell_price, req.sell_date
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    tax_result = tools.calculate_ltcg_tax(
        req.user_id, matched_lots, req.sell_price, req.sell_date
    )
    lot_decrements = [
        {"lot_id": lot_id, "matched_quantity": qty}
        for lot_id, qty, _hold_days in matched_lots
    ]
    sell_rows = []
    for detail in tax_result["details"]:
        sell_rows.append(
            {
                "user_id": req.user_id,
                "lot_id": detail["lot_id"],
                "sold_quantity": detail["matched_quantity"],
                "sell_price": req.sell_price,
                "sell_date": req.sell_date,
                "holding_period_days": detail["holding_period_days"],
                "gain_type": detail["gain_type"],
                "computed_tax": detail["computed_tax"],
                "assessment_year": tax_result["assessment_year"],
                "paid_status": "unpaid",
            }
        )
    with db.connect() as conn:
        inserted = db.create_sell_transaction(lot_decrements, sell_rows, conn)
        allocations = [
            SellAllocationResult(
                sell_allocation_id=row["sell_allocation_id"],
                lot_id=row["lot_id"],
                sold_quantity=row["sold_quantity"],
                holding_period_days=row["holding_period_days"],
                gain_type=row["gain_type"],
                computed_tax=row["computed_tax"],
            )
            for row in inserted
        ]
        total_gross_tax = float(sum(row["computed_tax"] for row in inserted))
        return SellResponse(
            assessment_year=tax_result["assessment_year"],
            total_gross_tax=total_gross_tax,
            allocations=allocations,
        )
