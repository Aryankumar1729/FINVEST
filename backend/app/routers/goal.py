from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from .. import db
from ..schemas import (
    GoalCreateRequest,
    GoalCreateResponse,
    GoalListItem,
    GoalListResponse,
    GoalSelectRequest,
    StrategyVariant,
)
from ..tools import calculate_goal_progress, generate_goal_strategy_variants

router = APIRouter()


def _add_years(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        # Feb 29 → non-leap year
        return d.replace(year=d.year + years, day=28)


def _goal_response(goal: dict[str, Any], variants: list[dict[str, Any]]) -> GoalCreateResponse:
    selected = goal.get("selected_variant_id")
    return GoalCreateResponse(
        goal_id=int(goal["goal_id"]),
        variants=[
            StrategyVariant(
                variant_id=v["variant_id"],
                goal_id=v["goal_id"],
                variant_type=v["variant_type"],
                allocation_pct=v["allocation_pct"],
                stock_picks=v["stock_picks"],
                mf_split=v["mf_split"],
                rationale=v.get("rationale"),
                target_allocation_pct=v["target_allocation_pct"],
                target_monthly_expense_ceiling=v.get("target_monthly_expense_ceiling"),
                target_cash_reserve_balance=v.get("target_cash_reserve_balance"),
                is_selected=v["variant_id"] == selected,
            )
            for v in variants
        ],
    )


@router.get("/goal", response_model=GoalListResponse)
async def list_goals(user_id: str = Query(...)) -> GoalListResponse:
    goals = db.get_user_goals(user_id)
    progress = calculate_goal_progress(user_id)
    variant_ids = [g["selected_variant_id"] for g in goals if g.get("selected_variant_id") is not None]
    variant_type_by_id: dict[int, str] = {}
    if variant_ids:
        rows = db.fetch_all(
            "SELECT variant_id, variant_type FROM goal_strategy_variants WHERE variant_id = ANY(%s)",
            (variant_ids,),
        )
        variant_type_by_id = {int(r["variant_id"]): r["variant_type"] for r in rows}

    items: list[GoalListItem] = []
    for g in goals:
        goal_id = int(g["goal_id"])
        selected = g.get("selected_variant_id")
        selected_id = int(selected) if selected is not None else None
        items.append(
            GoalListItem(
                goal_id=goal_id,
                target_amount=g["target_amount"],
                target_date=g["target_date"],
                selected_variant_id=selected_id,
                variant_type=variant_type_by_id.get(selected_id) if selected_id is not None else None,
                saved_amount=Decimal(str(progress.get(goal_id, 0))),
                created_at=g["created_at"],
                updated_at=g["updated_at"],
            )
        )
    return GoalListResponse(goals=items)


@router.post("/goal", response_model=GoalCreateResponse)
async def create_goal_endpoint(req: GoalCreateRequest) -> GoalCreateResponse:
    years = req.timeframe_years if req.timeframe_years is not None else 10
    target_date = _add_years(date.today(), years)
    try:
        variants = generate_goal_strategy_variants(req.user_id, req.target_amount, req.timeframe_years)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Strategy variant generation failed: {exc}") from exc
    goal = db.create_goal(req.user_id, req.target_amount, target_date)
    rows = db.create_goal_strategy_variants(int(goal["goal_id"]), req.user_id, variants)
    return _goal_response(goal, rows)


@router.post("/goal/select", response_model=GoalCreateResponse)
async def select_goal_endpoint(req: GoalSelectRequest) -> GoalCreateResponse:
    if not db.variant_belongs_to_goal(req.variant_id, req.goal_id, req.user_id):
        raise HTTPException(status_code=404, detail="Variant not found for this goal")
    updated = db.select_goal_variant(req.goal_id, req.variant_id, req.user_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    loaded = db.get_goal_with_variants(req.goal_id, req.user_id)
    if loaded is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    goal, variants = loaded
    return _goal_response(goal, variants)
