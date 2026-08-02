from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from typing import Any, Iterable

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg.types.string import TextLoader
from psycopg_pool import ConnectionPool


DATABASE_URL = os.getenv("DATABASE_URL")

_pool: ConnectionPool | None = None
_logger = logging.getLogger(__name__)

_DEFAULT_POOL_MIN_SIZE = 2
_DEFAULT_POOL_MAX_SIZE = 25


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        _logger.warning(
            "Invalid %s=%r; using default %s",
            name,
            raw,
            default,
        )
        return default


def _configure_connection(conn: psycopg.Connection) -> None:
    conn.adapters.register_loader("uuid", TextLoader)


def open_pool() -> None:
    """Create and open the process-wide connection pool (call once at app startup)."""
    global _pool
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    if _pool is not None:
        return
    min_size = _env_int("POOL_MIN_SIZE", _DEFAULT_POOL_MIN_SIZE)
    max_size = _env_int("POOL_MAX_SIZE", _DEFAULT_POOL_MAX_SIZE)
    _pool = ConnectionPool(
        conninfo=DATABASE_URL,
        kwargs={"row_factory": dict_row},
        configure=_configure_connection,
        min_size=min_size,
        max_size=max_size,
        open=True,
    )
    msg = f"Database pool opened: min_size={min_size} max_size={max_size}"
    _logger.info(msg)
    print(msg, flush=True)


def close_pool() -> None:
    """Close the process-wide connection pool (call once at app shutdown)."""
    global _pool
    if _pool is None:
        return
    _pool.close()
    _pool = None


@contextmanager
def connect():
    if _pool is None:
        raise RuntimeError("Database pool is not open; call open_pool() at startup")
    with _pool.connection() as conn:
        yield conn


def fetch_one(sql: str, params: Iterable[Any] = ()) -> dict[str, Any] | None:
    with connect() as conn:
        return conn.execute(sql, tuple(params)).fetchone()


def fetch_all(sql: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
    with connect() as conn:
        return list(conn.execute(sql, tuple(params)).fetchall())


def execute(sql: str, params: Iterable[Any] = ()) -> dict[str, Any] | None:
    with connect() as conn:
        cur = conn.execute(sql, tuple(params))
        return cur.fetchone() if cur.description is not None else None


def read_price_cache(cache_key: str) -> dict[str, Any] | None:
    return fetch_one(
        "SELECT price, fetched_at FROM price_cache WHERE ticker = %s ORDER BY fetched_at DESC LIMIT 1",
        (cache_key,),
    )


def write_price_cache(cache_key: str, price: Any) -> None:
    execute(
        "INSERT INTO price_cache (ticker, price, fetched_at) VALUES (%s, %s, now())",
        (cache_key, price),
    )


def get_tax_config(assessment_year: int) -> dict[str, Any]:
    row = fetch_one("SELECT config FROM tax_config WHERE assessment_year = %s", (assessment_year,))
    if not row:
        raise ValueError(f"No tax_config row found for assessment_year {assessment_year}")
    config = row["config"]
    return config if isinstance(config, dict) else __import__("json").loads(config)


def get_user_profile(user_id: str) -> dict[str, Any] | None:
    return fetch_one("SELECT * FROM users_profile WHERE user_id = %s", (user_id,))


def get_user_liabilities(user_id: str) -> list[dict[str, Any]]:
    return fetch_all("SELECT * FROM liabilities WHERE user_id = %s", (user_id,))


def create_user_profile(
    user_id: str,
    salary: Decimal,
    tax_regime: str,
    current_expense_estimate: Decimal,
    current_cash_balance: Decimal,
    conn: Any | None = None,
) -> dict[str, Any]:
    sql = """
        INSERT INTO users_profile (
            user_id, salary, tax_regime, current_expense_estimate, current_cash_balance
        )
        VALUES (%s, %s, %s, %s, %s)
        RETURNING *
        """
    params = (user_id, salary, tax_regime, current_expense_estimate, current_cash_balance)
    if conn is not None:
        return conn.execute(sql, params).fetchone()
    return execute(sql, params)


def update_user_profile(
    user_id: str,
    salary: Decimal,
    tax_regime: str,
    current_expense_estimate: Decimal,
    current_cash_balance: Decimal,
    conn: Any | None = None,
) -> dict[str, Any] | None:
    sql = """
        UPDATE users_profile
        SET salary = %s,
            tax_regime = %s,
            current_expense_estimate = %s,
            current_cash_balance = %s
        WHERE user_id = %s
        RETURNING *
        """
    params = (salary, tax_regime, current_expense_estimate, current_cash_balance, user_id)
    if conn is not None:
        return conn.execute(sql, params).fetchone()
    return execute(sql, params)


def replace_user_liabilities(
    user_id: str,
    liabilities: list[dict[str, Any]],
    conn: Any | None = None,
) -> list[dict[str, Any]]:
    def _run(active_conn: Any) -> list[dict[str, Any]]:
        inserted: list[dict[str, Any]] = []
        active_conn.execute("DELETE FROM liabilities WHERE user_id = %s", (user_id,))
        for item in liabilities:
            inserted.append(
                active_conn.execute(
                    """
                    INSERT INTO liabilities (
                        user_id, loan_type, principal, remaining_balance,
                        interest_rate, tenure_months, monthly_emi
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    (
                        user_id,
                        item["loan_type"],
                        item["principal"],
                        item["remaining_balance"],
                        item["interest_rate"],
                        item["tenure_months"],
                        item["monthly_emi"],
                    ),
                ).fetchone()
            )
        return inserted

    if conn is not None:
        return _run(conn)
    with connect() as owned_conn:
        return _run(owned_conn)


def update_user_risk_tier(user_id: str, risk_tier: str) -> dict[str, Any] | None:
    return execute(
        """
        UPDATE users_profile
        SET risk_tier = %s
        WHERE user_id = %s
        RETURNING *
        """,
        (risk_tier, user_id),
    )


def update_user_risk_assessment(
    user_id: str, risk_score: int, risk_tier: str, raw_risk_mcq_answers: dict
) -> dict[str, Any] | None:
    return execute(
        """
        UPDATE users_profile
        SET risk_score = %s,
            risk_tier = %s,
            raw_risk_mcq_answers = %s
        WHERE user_id = %s
        RETURNING *
        """,
        (risk_score, risk_tier, Jsonb(raw_risk_mcq_answers), user_id),
    )


def get_user_open_lots(user_id: str) -> list[dict[str, Any]]:
    return fetch_all(
        "SELECT * FROM lots WHERE user_id = %s AND remaining_quantity > 0",
        (user_id,),
    )


def update_stock_detail_fields(
    symbol: str,
    pe_ratio: Any,
    market_cap: Any,
    eps: Any,
    *,
    name: Any = None,
    fifty_two_week_high: Any = None,
    fifty_two_week_low: Any = None,
) -> None:
    execute(
        """
        UPDATE stocks
        SET pe_ratio = %s,
            market_cap = %s,
            eps = %s,
            name = %s,
            fifty_two_week_high = %s,
            fifty_two_week_low = %s
        WHERE symbol = %s
        """,
        (pe_ratio, market_cap, eps, name, fifty_two_week_high, fifty_two_week_low, symbol),
    )


def update_stock_price_fields(symbol: str, current_price: Any, pct_change_today: Any) -> None:
    execute(
        """
        UPDATE stocks
        SET current_price = %s,
            pct_change_today = %s
        WHERE symbol = %s
        """,
        (current_price, pct_change_today, symbol),
    )


def update_mf_detail_stats(scheme_name: str, detail_stats: dict) -> None:
    execute(
        """
        UPDATE mutual_funds
        SET detail_stats = %s
        WHERE scheme_name = %s
        """,
        (Jsonb(detail_stats), scheme_name),
    )


def list_catalog(
    table: str,
    *,
    search_column: str | None = None,
    search_term: str | None = None,
    sort_column: str | None = None,
    sort_order: str = "asc",
    filter_column: str | None = None,
    filter_value: Any = None,
) -> list[dict[str, Any]]:
    _CATALOG_WHITELIST = {
        "stocks": {
            "search": ("symbol", "sector"),
            "sort": ("symbol", "current_price", "pct_change_today", "pe_ratio", "market_cap"),
            "filter": ("is_gold_etf", "symbol"),
        },
        "mutual_funds": {"search": ("scheme_name",), "sort": ("scheme_name", "cagr"), "filter": ("scheme_name", "scheme_id")},
        "fd_rates": {
            "search": ("bank_name",),
            "sort": ("bank_name", "interest_rate", "tenure_months"),
            "filter": (),
        },
    }
    if table not in _CATALOG_WHITELIST:
        raise ValueError(f"Unsupported catalog table: {table}")
    allowed = _CATALOG_WHITELIST[table]
    order = sort_order.lower()
    if order not in ("asc", "desc"):
        raise ValueError(f"sort_order must be 'asc' or 'desc', got {sort_order!r}")
    if search_column is not None and search_column not in allowed["search"]:
        raise ValueError(f"Unsupported search_column {search_column!r} for table {table}")
    if sort_column is not None and sort_column not in allowed["sort"]:
        raise ValueError(f"Unsupported sort_column {sort_column!r} for table {table}")
    if filter_column is not None and filter_column not in allowed["filter"]:
        raise ValueError(f"Unsupported filter_column {filter_column!r} for table {table}")

    sql = f"SELECT * FROM {table}"
    params: list[Any] = []
    clauses: list[str] = []
    if search_column is not None and search_term is not None:
        clauses.append(f"{search_column} ILIKE %s")
        params.append(f"%{search_term}%")
    if filter_column is not None:
        clauses.append(f"{filter_column} = %s")
        params.append(filter_value)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    if sort_column is not None:
        sql += f" ORDER BY {sort_column} {order.upper()}"
    return fetch_all(sql, params)


def get_user_goals(user_id: str) -> list[dict[str, Any]]:
    # Only committed goals (selected_variant_id set); uncommitted strategy drafts are excluded by design.
    return fetch_all(
        """
        SELECT * FROM goals
        WHERE user_id = %s AND selected_variant_id IS NOT NULL
        ORDER BY created_at DESC
        """,
        (user_id,),
    )


def create_goal(user_id: str, target_amount: Decimal | None, target_date: date) -> dict[str, Any]:
    return execute(
        """
        INSERT INTO goals (user_id, target_amount, target_date)
        VALUES (%s, %s, %s)
        RETURNING *
        """,
        (user_id, target_amount, target_date),
    )


def create_goal_strategy_variants(
    goal_id: int, user_id: str, variants: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with connect() as conn:
        for v in variants:
            mf_split = v.get("mf_split", v.get("mf_debt_equity_split"))
            row = conn.execute(
                """
                INSERT INTO goal_strategy_variants (
                    user_id, goal_id, variant_type, allocation_pct, stock_picks, mf_split,
                    rationale, target_allocation_pct, target_monthly_expense_ceiling,
                    target_cash_reserve_balance
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    user_id,
                    goal_id,
                    v["variant_type"],
                    Jsonb(v["allocation_pct"]),
                    Jsonb(v["stock_picks"]),
                    Jsonb(mf_split),
                    v.get("rationale"),
                    Jsonb(v["target_allocation_pct"]),
                    v.get("target_monthly_expense_ceiling"),
                    v.get("target_cash_reserve_balance"),
                ),
            ).fetchone()
            rows.append(row)
    return rows


def variant_belongs_to_goal(variant_id: int, goal_id: int, user_id: str) -> bool:
    row = fetch_one(
        "SELECT 1 FROM goal_strategy_variants WHERE variant_id = %s AND goal_id = %s AND user_id = %s",
        (variant_id, goal_id, user_id),
    )
    return row is not None


def select_goal_variant(goal_id: int, variant_id: int, user_id: str) -> dict[str, Any] | None:
    return execute(
        """
        UPDATE goals
        SET selected_variant_id = %s
        WHERE goal_id = %s AND user_id = %s
        RETURNING *
        """,
        (variant_id, goal_id, user_id),
    )


def get_goal_with_variants(goal_id: int, user_id: str) -> tuple[dict[str, Any], list[dict[str, Any]]] | None:
    goal = fetch_one(
        "SELECT * FROM goals WHERE goal_id = %s AND user_id = %s",
        (goal_id, user_id),
    )
    if not goal:
        return None
    variants = fetch_all(
        "SELECT * FROM goal_strategy_variants WHERE goal_id = %s AND user_id = %s ORDER BY variant_id ASC",
        (goal_id, user_id),
    )
    return goal, variants


def list_journal_entries(
    user_id: str, entry_type: str | None = None, limit: int = 20, offset: int = 0
) -> list[dict]:
    if entry_type is not None:
        return fetch_all(
            """
            SELECT * FROM journal
            WHERE user_id = %s AND entry_type = %s
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
            """,
            (user_id, entry_type, limit, offset),
        )
    return fetch_all(
        """
        SELECT * FROM journal
        WHERE user_id = %s
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s
        """,
        (user_id, limit, offset),
    )


def write_journal_row(
    *,
    user_id: str,
    entry_type: str,
    linked_ref_type: str,
    linked_ref_id: str | None,
    chroma_id: str,
    text_snapshot: str | None,
) -> dict[str, Any]:
    return execute(
        """
        INSERT INTO journal (user_id, entry_type, linked_ref_type, linked_ref_id, chroma_id, text_snapshot)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            user_id,
            entry_type,
            linked_ref_type,
            linked_ref_id,
            chroma_id,
            text_snapshot,
        ),
    )


def write_tool_call_log(
    *,
    user_id: str,
    tool_name: str,
    args: dict[str, Any],
    result_summary: str | None,
    success: bool,
) -> dict[str, Any]:
    """Insert a row into tool_call_log and return it via RETURNING *."""
    return execute(
        """
        INSERT INTO tool_call_log (user_id, tool_name, args, result_summary, success)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING *
        """,
        (user_id, tool_name, Jsonb(args), result_summary, success),
    )


def create_sell_allocation(
    *,
    user_id: str,
    lot_id: int,
    sold_quantity: float,
    sell_price: float,
    sell_date: date,
    holding_period_days: int,
    gain_type: str,
    computed_tax: float,
    assessment_year: int,
    paid_status: str = "unpaid",
) -> dict[str, Any]:
    return execute(
        """
        INSERT INTO sell_allocations (
            user_id, lot_id, sold_quantity, sell_price, sell_date,
            holding_period_days, gain_type, computed_tax, assessment_year, paid_status
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            user_id,
            lot_id,
            sold_quantity,
            sell_price,
            sell_date,
            holding_period_days,
            gain_type,
            computed_tax,
            assessment_year,
            paid_status,
        ),
    )


def create_sell_allocations_batch(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    inserted: list[dict[str, Any]] = []
    with connect() as conn:
        for row in rows:
            inserted.append(
                conn.execute(
                    """
                    INSERT INTO sell_allocations (
                        user_id, lot_id, sold_quantity, sell_price, sell_date,
                        holding_period_days, gain_type, computed_tax, assessment_year, paid_status
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    (
                        row["user_id"],
                        row["lot_id"],
                        row["sold_quantity"],
                        row["sell_price"],
                        row["sell_date"],
                        row["holding_period_days"],
                        row["gain_type"],
                        row["computed_tax"],
                        row["assessment_year"],
                        row.get("paid_status", "unpaid"),
                    ),
                ).fetchone()
            )
    return inserted


def mark_sell_allocation_paid(sell_allocation_id: int, user_id: str) -> dict[str, Any]:
    row = execute(
        """
        UPDATE sell_allocations
        SET paid_status = 'paid'
        WHERE sell_allocation_id = %s AND user_id = %s
        RETURNING *
        """,
        (sell_allocation_id, user_id),
    )
    if row is None:
        raise ValueError(
            f"No sell_allocation found for sell_allocation_id={sell_allocation_id} user_id={user_id}"
        )
    return row


def create_lot(row: dict[str, Any], conn: Any | None = None) -> dict[str, Any]:
    sql = """
        INSERT INTO lots (
            user_id, goal_id, stock_symbol, mutual_fund_id,
            buy_date, buy_price, quantity, remaining_quantity
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """
    params = (
        row["user_id"],
        row.get("goal_id"),
        row.get("stock_symbol"),
        row.get("mutual_fund_id"),
        row["buy_date"],
        row["buy_price"],
        row["quantity"],
        row["quantity"],
    )
    if conn is not None:
        return conn.execute(sql, params).fetchone()
    return execute(sql, params)


def create_sell_transaction(
    lot_decrements: list[dict[str, Any]],
    sell_rows: list[dict[str, Any]],
    conn: Any | None = None,
) -> list[dict[str, Any]]:
    def _run(active_conn: Any) -> list[dict[str, Any]]:
        inserted: list[dict[str, Any]] = []
        for dec in lot_decrements:
            active_conn.execute(
                """
                UPDATE lots
                SET remaining_quantity = remaining_quantity - %s
                WHERE lot_id = %s
                RETURNING remaining_quantity
                """,
                (dec["matched_quantity"], dec["lot_id"]),
            ).fetchone()
        for row in sell_rows:
            inserted.append(
                active_conn.execute(
                    """
                    INSERT INTO sell_allocations (
                        user_id, lot_id, sold_quantity, sell_price, sell_date,
                        holding_period_days, gain_type, computed_tax, assessment_year, paid_status
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    (
                        row["user_id"],
                        row["lot_id"],
                        row["sold_quantity"],
                        row["sell_price"],
                        row["sell_date"],
                        row["holding_period_days"],
                        row["gain_type"],
                        row["computed_tax"],
                        row["assessment_year"],
                        row.get("paid_status", "unpaid"),
                    ),
                ).fetchone()
            )
        return inserted

    if conn is not None:
        return _run(conn)
    with connect() as owned_conn:
        return _run(owned_conn)


def get_sell_allocations(
    user_id: str, assessment_year: int, paid_status: str | None = None
) -> list[dict[str, Any]]:
    base_sql = """
        SELECT sa.*, l.buy_price, l.stock_symbol, l.mutual_fund_id,
               s.is_gold_etf, mf.risk_category, mf.scheme_name
        FROM sell_allocations sa
        LEFT JOIN lots l ON l.lot_id = sa.lot_id
        LEFT JOIN stocks s ON s.symbol = l.stock_symbol
        LEFT JOIN mutual_funds mf ON mf.scheme_id = l.mutual_fund_id
        WHERE sa.user_id = %s AND sa.assessment_year = %s
    """
    if paid_status is not None:
        return fetch_all(
            base_sql + " AND sa.paid_status = %s",
            (user_id, assessment_year, paid_status),
        )
    return fetch_all(base_sql, (user_id, assessment_year))
