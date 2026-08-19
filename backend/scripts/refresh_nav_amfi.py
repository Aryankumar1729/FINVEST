from __future__ import annotations

import sys
from pathlib import Path
from datetime import datetime
from decimal import Decimal
import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT))

import backend.app.db as db

# Configure stdout to use UTF-8
if sys.stdout:
    sys.stdout.reconfigure(encoding='utf-8')

AMFI_NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"

# Category keywords mapping
DEBT_KWS = ["debt", "gilt", "liquid", "overnight", "income", "money market", "floater"]
EQUITY_KWS = ["equity", "elss", "growth", "contra", "value", "focused", "sectoral", "thematic"]
HYBRID_KWS = ["hybrid", "arbitrage", "balanced", "asset allocation"]

def get_risk_category(header_text: str) -> str:
    h = header_text.lower()
    if any(kw in h for kw in DEBT_KWS):
        return "debt"
    elif any(kw in h for kw in EQUITY_KWS):
        return "equity"
    elif any(kw in h for kw in HYBRID_KWS):
        return "hybrid"
    else:
        return "other"

def parse_amfi_nav() -> list[tuple[str, str, Decimal, datetime.date, str]]:
    print(f"Fetching NAVAll.txt from {AMFI_NAV_URL}...")
    response = requests.get(AMFI_NAV_URL, timeout=30)
    response.raise_for_status()
    lines = response.text.splitlines()
    print(f"Fetched {len(lines)} lines from AMFI")

    parsed_records = []
    current_header = "unknown"
    current_category = "other"

    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            continue

        # Parse headers (lines without Semicolon)
        if ";" not in line_stripped:
            # Skip fund house lines
            if "mutual fund" not in line_stripped.lower():
                current_header = line_stripped
                current_category = get_risk_category(line_stripped)
            continue

        parts = [p.strip() for p in line_stripped.split(";")]
        if len(parts) < 5:
            continue

        code = parts[0]
        # Skip header indicator line if it got here
        if code.lower() == "scheme code":
            continue

        # AMFI currently publishes plan/option as separate columns:
        #   code;isin1;isin2;scheme_name;Direct Plan;Growth;nav;DD-MMM-YYYY
        # Older dumps used a combined scheme name and nav/date earlier in the row.
        if (
            len(parts) >= 8
            and parts[4].lower() in ("direct plan", "regular plan")
            and parts[5]
        ):
            scheme_name = f"{parts[3]} - {parts[4]} - {parts[5]}"
            nav_str = parts[6]
            date_str = parts[7]
        else:
            scheme_name = parts[3]
            nav_str = parts[4]
            date_str = parts[5] if len(parts) > 5 else ""

        name_lower = scheme_name.lower()

        # Check for Direct, Growth and not IDCW
        is_direct = "direct" in name_lower
        is_growth = "growth" in name_lower

        is_idcw = False
        if "idcw" in name_lower or "income distribution" in name_lower:
            is_idcw = True
        elif "dividend" in name_lower and "dividend yield" not in name_lower:
            is_idcw = True

        if is_direct and is_growth and not is_idcw:
            # Handle NAV value
            if not nav_str or nav_str.upper() in ("N.A.", "NA"):
                continue
            try:
                nav_val = Decimal(nav_str)
            except Exception:
                continue

            # Handle date parsing (format: DD-MMM-YYYY, e.g., 31-Jul-2026)
            try:
                nav_date = datetime.strptime(date_str, "%d-%b-%Y").date()
            except Exception:
                continue

            parsed_records.append(
                (
                    scheme_name,
                    current_category,
                    nav_val,
                    nav_date,
                    code,
                )
            )

    print(f"Successfully parsed {len(parsed_records)} Direct Growth records.")
    return parsed_records

def main() -> None:
    db.open_pool()
    try:
        parsed_records = parse_amfi_nav()
        if not parsed_records:
            print("No records parsed. Exiting.")
            return

        with db.connect() as conn:
            # 1. Capture count before migration/upsert
            pre_count_row = conn.execute("SELECT COUNT(*) FROM mutual_funds;").fetchone()
            pre_count = pre_count_row["count"] if pre_count_row else 0
            print(f"Mutual funds row count BEFORE refresh: {pre_count}")

            # Capture details of existing 8 funds for verification
            pre_existing_funds = conn.execute("""
                SELECT scheme_name, risk_category, cagr, detail_stats, latest_nav, previous_nav, nav_date
                FROM mutual_funds
                ORDER BY scheme_name;
            """).fetchall()

            # 2. Create temp staging table
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TEMP TABLE temp_mf_stage (
                        scheme_name text,
                        risk_category mf_risk_category_enum,
                        latest_nav numeric(12,4),
                        nav_date date,
                        amfi_scheme_code text
                    ) ON COMMIT DROP;
                """)

                # 3. Use copy to bulk load staging table
                print("Bulk loading data into temp staging table using copy()...")
                with cur.copy("COPY temp_mf_stage (scheme_name, risk_category, latest_nav, nav_date, amfi_scheme_code) FROM STDIN") as copy:
                    for row in parsed_records:
                        copy.write_row(row)

                # 4. Perform single bulk upsert
                print("Upserting from staging table to mutual_funds...")
                cur.execute("""
                    INSERT INTO mutual_funds (
                        scheme_name,
                        risk_category,
                        latest_nav,
                        nav_date,
                        detail_stats
                    )
                    SELECT
                        scheme_name,
                        risk_category,
                        latest_nav,
                        nav_date,
                        jsonb_build_object(
                            'amfi_scheme_code', amfi_scheme_code,
                            'finapi_scheme_code', amfi_scheme_code
                        )
                    FROM temp_mf_stage
                    ON CONFLICT (scheme_name) DO UPDATE
                    SET
                        previous_nav = mutual_funds.latest_nav,
                        latest_nav = EXCLUDED.latest_nav,
                        nav_date = EXCLUDED.nav_date;
                """)

            # 5. Capture count after upsert
            post_count_row = conn.execute("SELECT COUNT(*) FROM mutual_funds;").fetchone()
            post_count = post_count_row["count"] if post_count_row else 0
            print(f"Mutual funds row count AFTER refresh: {post_count}")

            # Calculate conflict-match count
            staging_count = len(parsed_records)
            inserted_count = post_count - pre_count
            conflict_matches = staging_count - inserted_count
            print(f"Staging table count: {staging_count}")
            print(f"New rows inserted: {inserted_count}")
            print(f"Conflict match count (name overlap with pre-existing rows): {conflict_matches}")

            # Capture details of existing 8 funds post refresh
            post_existing_funds = conn.execute("""
                SELECT scheme_name, risk_category, cagr, detail_stats, latest_nav, previous_nav, nav_date
                FROM mutual_funds
                ORDER BY scheme_name;
            """).fetchall()

            print("\nVerification check for 8 pre-existing funds:")
            print("---------------------------------------------")
            pre_map = {r["scheme_name"]: r for r in pre_existing_funds}
            for post_r in post_existing_funds:
                name = post_r["scheme_name"]
                if name in pre_map:
                    pre_r = pre_map[name]
                    # Verify risk_category, cagr, and detail_stats are byte-identical
                    same_risk = pre_r["risk_category"] == post_r["risk_category"]
                    same_cagr = pre_r["cagr"] == post_r["cagr"]
                    same_stats = pre_r["detail_stats"] == post_r["detail_stats"]
                    byte_identical = same_risk and same_cagr and same_stats
                    
                    print(f"Fund Name: {name}")
                    print(f"  Byte-identical details? {byte_identical} (risk_category={same_risk}, cagr={same_cagr}, detail_stats={same_stats})")
                    print(f"  Pre-NAV columns: latest={pre_r['latest_nav']}, previous={pre_r['previous_nav']}, date={pre_r['nav_date']}")
                    print(f"  Post-NAV columns: latest={post_r['latest_nav']}, previous={post_r['previous_nav']}, date={post_r['nav_date']}")
                    if not byte_identical:
                        print("  WARNING: Non-NAV metadata fields changed!")
                else:
                    # New fund, show its stats
                    pass

            conn.commit()
            print("\nDatabase transaction committed successfully!")
    finally:
        db.close_pool()

if __name__ == "__main__":
    main()
