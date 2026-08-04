from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import get_current_user_id
from .. import db
from .. import tools
from ..schemas import PayRequest, SellAllocationItem, SellAllocationListResponse, TaxResponse

router = APIRouter()


@router.get("/tax", response_model=TaxResponse)
def get_tax(
    firebase_uid: str = Depends(get_current_user_id),
    assessment_year: int | None = Query(None),
) -> TaxResponse:
    user_id = db.get_user_id_by_firebase_uid(firebase_uid)
    if user_id is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    if assessment_year is None:
        assessment_year = tools.get_current_assessment_year()
    profile = db.get_user_profile(user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    tax_config = db.get_tax_config(assessment_year)
    if profile.get("salary") is not None and profile.get("tax_regime") is not None:
        salary_tax = float(
            tools.calculate_salary_tax(
                profile["salary"],
                profile["tax_regime"],
                assessment_year,
                tax_config=tax_config,
            )["tax"]
        )
    else:
        salary_tax = 0.0
    result = tools.calculate_fy_capital_gains_liability(
        user_id,
        assessment_year,
        tax_config=tax_config,
        profile=profile,
    )
    unpaid = result["unpaid_capital_gains_tax"]
    return TaxResponse(
        assessment_year=assessment_year,
        salary_tax=salary_tax,
        unpaid_capital_gains_tax=unpaid,
        total_liability=salary_tax + unpaid,
    )


@router.get("/tax/allocations", response_model=SellAllocationListResponse)
def list_tax_allocations(
    firebase_uid: str = Depends(get_current_user_id),
    assessment_year: int | None = Query(None),
    paid_status: Literal["unpaid", "paid"] | None = Query(None),
) -> SellAllocationListResponse:
    user_id = db.get_user_id_by_firebase_uid(firebase_uid)
    if user_id is None:
        return SellAllocationListResponse(allocations=[])
    if assessment_year is None:
        assessment_year = tools.get_current_assessment_year()
    rows = db.get_sell_allocations(user_id, assessment_year, paid_status=paid_status)
    return SellAllocationListResponse(
        allocations=[SellAllocationItem.model_validate(row) for row in rows]
    )


@router.post("/tax/pay")
def pay_tax(req: PayRequest) -> dict:
    try:
        return db.mark_sell_allocation_paid(req.sell_allocation_id, req.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
