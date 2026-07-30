from __future__ import annotations

import asyncio
import os
from decimal import Decimal
from typing import Any
from uuid import uuid4

from google.genai import types

from .. import chroma_client
from .. import db
from .. import tools as app_tools
from ..gemini_client import get_gemini_client
from ..schemas import ChatResponse
from ..tools import _market_value, calculate_goal_progress
from .system_prompt import SYSTEM_PROMPT


conversation_sessions: dict[str, Any] = {}
conversation_locks: dict[str, asyncio.Lock] = {}

_OPEN_LOT_VALUE_SELECT = """
    SELECT l.lot_id, l.remaining_quantity, l.stock_symbol, l.mutual_fund_id, l.buy_price,
           s.sector, s.current_price, mf.scheme_name, mf.risk_category, mf.detail_stats
    FROM lots l
    LEFT JOIN stocks s ON s.symbol = l.stock_symbol
    LEFT JOIN mutual_funds mf ON mf.scheme_id = l.mutual_fund_id
    WHERE l.user_id = %s AND l.remaining_quantity > 0
"""


def get_or_create_session(conversation_id: str | None) -> tuple[str, Any, asyncio.Lock]:
    if conversation_id and conversation_id in conversation_sessions:
        lock = conversation_locks.setdefault(conversation_id, asyncio.Lock())
        return conversation_id, conversation_sessions[conversation_id], lock
    conversation_id = str(uuid4())
    client = get_gemini_client()
    session = client.aio.chats.create(
        model=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
        config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
    )
    conversation_sessions[conversation_id] = session
    lock = conversation_locks.setdefault(conversation_id, asyncio.Lock())
    return conversation_id, session, lock


def _sum_live_lot_values(rows: list[dict[str, Any]]) -> Decimal:
    total = Decimal("0")
    for row in rows:
        value, _is_stale = _market_value(row)
        if value is not None:
            total += value
    return total


async def build_snapshot(user_id: str) -> str:
    # TEMPORARY — client-supplied and UNVERIFIED until Firebase auth is added. At that point this should be derived from the verified token server-side, not trusted from the request body.
    profile = db.get_user_profile(user_id)
    cash = (profile or {}).get("current_cash_balance")
    open_lots = db.fetch_all(_OPEN_LOT_VALUE_SELECT, (user_id,))
    portfolio_total = _sum_live_lot_values(open_lots)
    # get_user_liabilities returns all rows; preserve prior snapshot filter/order
    liabilities = [
        row for row in db.get_user_liabilities(user_id) if (row.get("remaining_balance") or 0) > 0
    ]
    liabilities.sort(key=lambda row: row["updated_at"], reverse=True)
    goals = db.fetch_all("SELECT * FROM goals WHERE user_id = %s ORDER BY target_date ASC, goal_id ASC", (user_id,))
    progress_map = await calculate_goal_progress(user_id) if goals else {}

    lines: list[str] = ["<<<SNAPSHOT>>>"]
    lines += ["[PROFILE]", str(profile or {})]
    lines += ["[ACTIVE_GOALS]"]
    if not goals:
        lines += ["(none)"]
    else:
        for g in goals:
            open_value = progress_map.get(int(g["goal_id"]), 0)
            lines += [
                f"- goal_id={g['goal_id']} target_amount={g.get('target_amount')} target_date={g.get('target_date')} open_value={open_value}"
            ]
    lines += ["[PORTFOLIO_TOTAL]", str(portfolio_total)]
    lines += ["[CASH_BALANCE]", str(cash if cash is not None else 0)]
    lines += ["[ACTIVE_LIABILITIES]"]
    lines += [str(liabilities or [])]
    lines += ["<<<END_SNAPSHOT>>>"]
    return "\n".join(lines)


def journal_similarity_search(user_id: str, query: str, k: int = 5) -> list[dict[str, Any]]:
    return chroma_client.query_journal(user_id=user_id, query_text=query, k=k)


def _toolkit() -> tuple[types.Tool, dict[str, Any]]:
    # Read-only tools only: DO NOT include any buy/sell/goal-write functions here.
    # Write-capable / write-side-effect functions in tools.py (EXCLUDED here):
    # - app_tools.calculate_exit_timing_insight (writes journal via write_journal_row)
    # - app_tools.calculate_strategy_deviation (writes journal via write_journal_row)
    # - app_tools.fetch_stock_price (writes price_cache via write_price_cache)
    # - app_tools.fetch_benchmark_price (writes price_cache via write_price_cache)
    # - app_tools.fetch_mf_nav (writes price_cache via write_price_cache)
    # Price-cache writes are an accepted side-effect of live lookups (not user financial state) and are not what the read-only rule is protecting against.
    fns = [app_tools.fetch_stock_price, app_tools.calculate_salary_tax, app_tools.fetch_fd_rates, journal_similarity_search]
    client = get_gemini_client()
    decls = [types.FunctionDeclaration.from_callable(client=client, callable=fn) for fn in fns]
    return types.Tool(function_declarations=decls), {fn.__name__: fn for fn in fns}


async def handle_chat(user_id: str, message: str, conversation_id: str | None) -> ChatResponse:
    # TEMPORARY — client-supplied and UNVERIFIED until Firebase auth is added. At that point this should be derived from the verified token server-side, not trusted from the request body.
    # Expected caller: routers/chat.py will pass request.user_id straight through until auth lands.
    conversation_id, session, lock = get_or_create_session(conversation_id)
    snapshot = await build_snapshot(user_id)
    tool, fn_map = _toolkit()
    config = types.GenerateContentConfig(tools=[tool])
    tool_calls_made: list[str] = []

    async with lock:
        resp = await session.send_message(f"{snapshot}\n\n[USER_MESSAGE]\n{message}", config=config)
        for _ in range(12):
            calls = list(getattr(resp, "function_calls", None) or [])
            if not calls:
                text = getattr(resp, "text", None)
                return ChatResponse(
                    conversation_id=conversation_id,
                    reply=text
                    if text
                    else "I wasn't able to generate a response to that — could you try rephrasing or asking again?",
                    tool_calls_made=tool_calls_made,
                )
            parts: list[types.Part] = []
            for fc in calls:
                name, args = fc.name, dict(fc.args or {})
                fn = fn_map.get(name)
                if not fn:
                    marker = f"TOOL_ERROR: {name} failed: unknown tool"
                    tool_calls_made.append(f"{name}:error")
                    try:
                        db.write_tool_call_log(
                            user_id=user_id,
                            tool_name=name,
                            args=args,
                            result_summary="unknown tool",
                            success=False,
                        )
                    except Exception:
                        pass
                    parts.append(types.Part.from_function_response(name=name, response={"error": marker}))
                    continue
                last_exc: Exception | None = None
                for attempt in range(2):
                    try:
                        result = fn(**args)
                        tool_calls_made.append(f"{name}:ok")
                        try:
                            db.write_tool_call_log(
                                user_id=user_id,
                                tool_name=name,
                                args=args,
                                result_summary=str(result)[:500],
                                success=True,
                            )
                        except Exception:
                            pass
                        parts.append(types.Part.from_function_response(name=name, response=result))
                        last_exc = None
                        break
                    except Exception as exc:
                        last_exc = exc
                if last_exc is not None:
                    marker = f"TOOL_ERROR: {name} failed: {last_exc}"
                    tool_calls_made.append(f"{name}:error")
                    try:
                        db.write_tool_call_log(
                            user_id=user_id,
                            tool_name=name,
                            args=args,
                            result_summary=marker,
                            success=False,
                        )
                    except Exception:
                        pass
                    parts.append(types.Part.from_function_response(name=name, response={"error": marker}))
            resp = await session.send_message(parts, config=config)

        text = getattr(resp, "text", None)
        return ChatResponse(
            conversation_id=conversation_id,
            reply=text
            if text
            else "I wasn't able to generate a response to that — could you try rephrasing or asking again?",
            tool_calls_made=tool_calls_made,
        )

