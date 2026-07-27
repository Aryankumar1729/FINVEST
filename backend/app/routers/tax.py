from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from .. import db
from .. import tools
from ..schemas import PayRequest, SellAllocationItem, SellAllocationListResponse, TaxResponse

router = APIRouter()


@router.get("/tax", response_model=TaxResponse)
async def get_tax(
    user_id: str = Query(...),
    assessment_year: int | None = Query(None),
) -> TaxResponse:
    if assessment_year is None:
        assessment_year = tools.get_current_assessment_year()
    profile = db.get_user_profile(user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    if profile.get("salary") is not None and profile.get("tax_regime") is not None:
        salary_tax = float(
            tools.calculate_salary_tax(profile["salary"], profile["tax_regime"], assessment_year)["tax"]
        )
    else:
        salary_tax = 0.0
    result = tools.calculate_fy_capital_gains_liability(user_id, assessment_year)
    unpaid = result["unpaid_capital_gains_tax"]
    return TaxResponse(
        assessment_year=assessment_year,
        salary_tax=salary_tax,
        unpaid_capital_gains_tax=unpaid,
        total_liability=salary_tax + unpaid,
    )


@router.get("/tax/allocations", response_model=SellAllocationListResponse)
async def list_tax_allocations(
    user_id: str = Query(...),
    assessment_year: int | None = Query(None),
    paid_status: Literal["unpaid", "paid"] | None = Query(None),
) -> SellAllocationListResponse:
    if assessment_year is None:
        assessment_year = tools.get_current_assessment_year()
    rows = db.get_sell_allocations(user_id, assessment_year, paid_status=paid_status)
    return SellAllocationListResponse(
        allocations=[SellAllocationItem.model_validate(row) for row in rows]
    )


@router.post("/tax/pay")
async def pay_tax(req: PayRequest) -> dict:
    try:
        return db.mark_sell_allocation_paid(req.sell_allocation_id, req.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
