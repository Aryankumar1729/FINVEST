from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import get_current_user_id

from .. import chroma_client
from .. import db
from .. import tools
from ..schemas import (
    LiabilitiesUpdateRequest,
    LiabilityResponse,
    ProfileResponse,
    RiskAdjustRequest,
    RiskQuestionnaireRequest,
    RiskQuestionnaireResponse,
    SalaryUpdateRequest,
)

router = APIRouter()


def _profile_response(row: dict) -> ProfileResponse:
    return ProfileResponse(
        user_id=row["user_id"],
        salary=row["salary"],
        current_expense_estimate=row["current_expense_estimate"],
        current_cash_balance=row["current_cash_balance"],
        tax_regime=row["tax_regime"],
        risk_tier=row["risk_tier"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _liability_response(row: dict) -> LiabilityResponse:
    return LiabilityResponse(
        liability_id=row["liability_id"],
        loan_type=row["loan_type"],
        principal=row["principal"],
        remaining_balance=row["remaining_balance"],
        interest_rate=row["interest_rate"],
        tenure_months=row["tenure_months"],
        monthly_emi=row["monthly_emi"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("/profile", response_model=ProfileResponse)
def get_profile(firebase_uid: str = Depends(get_current_user_id)) -> ProfileResponse:
    user_id = db.get_user_id_by_firebase_uid(firebase_uid)
    if user_id is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    row = db.get_user_profile(user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    return _profile_response(row)


@router.get("/profile/liabilities", response_model=list[LiabilityResponse])
def get_liabilities(user_id: str = Query(...)) -> list[LiabilityResponse]:
    if db.get_user_profile(user_id) is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    rows = db.get_user_liabilities(user_id)
    return [_liability_response(row) for row in rows]


@router.put("/profile/salary", response_model=ProfileResponse)
def update_salary(req: SalaryUpdateRequest) -> ProfileResponse:
    row = db.update_user_profile(
        req.user_id,
        req.salary,
        req.tax_regime,
        req.current_expense_estimate,
        req.current_cash_balance,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    return _profile_response(row)


@router.put("/profile/liabilities", response_model=list[LiabilityResponse])
def update_liabilities(req: LiabilitiesUpdateRequest) -> list[LiabilityResponse]:
    if db.get_user_profile(req.user_id) is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    rows = db.replace_user_liabilities(
        req.user_id, [item.model_dump() for item in req.liabilities]
    )
    return [_liability_response(row) for row in rows]


@router.put("/profile/risk/adjust", response_model=ProfileResponse)
def adjust_risk(req: RiskAdjustRequest) -> ProfileResponse:
    profile = db.get_user_profile(req.user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    old_tier = profile["risk_tier"]
    row = db.update_user_risk_tier(req.user_id, req.risk_tier)
    if row is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    if old_tier != req.risk_tier:
        text = f"Risk tier changed from {profile['risk_tier']} to {req.risk_tier}"
        chroma_id = f"risktier:{req.user_id}:{uuid4().hex}"
        chroma_client.write_journal_embedding(
            chroma_id=chroma_id,
            user_id=req.user_id,
            entry_type="risk_tier_change",
            text=text,
        )
        db.write_journal_row(
            user_id=req.user_id,
            entry_type="risk_tier_change",
            linked_ref_type="none",
            linked_ref_id=None,
            chroma_id=chroma_id,
            text_snapshot=text,
        )
    return _profile_response(row)


@router.post("/profile/risk/questionnaire", response_model=RiskQuestionnaireResponse)
def risk_questionnaire(req: RiskQuestionnaireRequest) -> RiskQuestionnaireResponse:
    profile = db.get_user_profile(req.user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    old_tier = profile["risk_tier"]
    try:
        risk_score, risk_tier = tools.score_risk_questionnaire(req.answers)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    row = db.update_user_risk_assessment(req.user_id, risk_score, risk_tier, req.answers)
    if row is None:
        raise HTTPException(status_code=404, detail="User profile not found")
    if old_tier != risk_tier:
        text = f"Risk tier changed from {old_tier} to {risk_tier}"
        chroma_id = f"risktier:{req.user_id}:{uuid4().hex}"
        chroma_client.write_journal_embedding(
            chroma_id=chroma_id,
            user_id=req.user_id,
            entry_type="risk_tier_change",
            text=text,
        )
        db.write_journal_row(
            user_id=req.user_id,
            entry_type="risk_tier_change",
            linked_ref_type="none",
            linked_ref_id=None,
            chroma_id=chroma_id,
            text_snapshot=text,
        )
    return RiskQuestionnaireResponse(
        user_id=row["user_id"],
        risk_tier=row["risk_tier"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
