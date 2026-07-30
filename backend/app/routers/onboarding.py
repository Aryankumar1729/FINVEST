from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, HTTPException

from .. import chroma_client
from .. import db
from .. import tools
from ..schemas import LiabilityResponse, OnboardingRequest, OnboardingResponse

router = APIRouter()


@router.post("/onboarding", response_model=OnboardingResponse)
def onboard(req: OnboardingRequest) -> OnboardingResponse:
    existing = db.get_user_profile(req.user_id)
    with db.connect() as conn:
        if existing is not None:
            profile = db.update_user_profile(
                req.user_id,
                req.salary,
                req.tax_regime,
                req.current_expense_estimate,
                req.current_cash_balance,
                conn,
            )
        else:
            profile = db.create_user_profile(
                req.user_id,
                req.salary,
                req.tax_regime,
                req.current_expense_estimate,
                req.current_cash_balance,
                conn,
            )
        liability_rows = db.replace_user_liabilities(
            req.user_id, [item.model_dump() for item in req.liabilities], conn
        )
    old_tier = profile["risk_tier"] if profile else None
    risk_tier = None
    if req.risk_answers is not None:
        try:
            risk_score, scored_tier = tools.score_risk_questionnaire(req.risk_answers)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        updated = db.update_user_risk_assessment(
            req.user_id, risk_score, scored_tier, req.risk_answers
        )
        if updated is None:
            raise HTTPException(status_code=404, detail="User profile not found")
        risk_tier = updated["risk_tier"]
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
    journal_entries_created = 0
    for item in req.self_report_answers:
        text = f"Q: {item.question}\nA: {item.answer}"
        chroma_id = f"user:{req.user_id}:{uuid4().hex}"
        chroma_client.write_journal_embedding(
            chroma_id=chroma_id,
            user_id=req.user_id,
            entry_type="onboarding_self_reported",
            text=text,
        )
        db.write_journal_row(
            user_id=req.user_id,
            entry_type="onboarding_self_reported",
            linked_ref_type="none",
            linked_ref_id=None,
            chroma_id=chroma_id,
            text_snapshot=text,
        )
        journal_entries_created += 1
    return OnboardingResponse(
        user_id=profile["user_id"],
        salary=float(profile["salary"]),
        tax_regime=profile["tax_regime"],
        current_expense_estimate=float(profile["current_expense_estimate"]),
        current_cash_balance=float(profile["current_cash_balance"]),
        liabilities=[
            LiabilityResponse(
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
            for row in liability_rows
        ],
        journal_entries_created=journal_entries_created,
        risk_tier=risk_tier,
    )
