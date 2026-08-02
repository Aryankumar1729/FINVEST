from __future__ import annotations

import csv
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

sys.path.insert(0, str(ROOT))

import backend.app.db as db


def main() -> None:
    csv_path = ROOT / "backend" / "data" / "ind_nifty500list.csv"
    if not csv_path.exists():
        print(f"Error: CSV file not found at {csv_path}")
        print("Searching root directory recursively for any 'ind_nifty500list.csv'...")
        found_paths = list(ROOT.glob("**/ind_nifty500list.csv"))
        if found_paths:
            csv_path = found_paths[0]
            print(f"Found CSV file at: {csv_path}")
        else:
            sys.exit(1)

    print(f"Reading Nifty 500 catalog from {csv_path}...")
    
    total_rows = 0
    newly_inserted = 0
    updated_existing = 0
    skipped_existing = 0

    db.open_pool()
    try:
        with db.connect() as conn:
            with conn.cursor() as cur:
                with open(csv_path, mode="r", encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    
                    # Verify expected columns are present
                    expected_cols = ["Company Name", "Industry", "Symbol"]
                    headers = reader.fieldnames or []
                    missing_cols = [c for c in expected_cols if c not in headers]
                    if missing_cols:
                        print(f"Error: Missing expected columns in CSV: {missing_cols}")
                        print(f"Available headers: {headers}")
                        sys.exit(1)

                    for row in reader:
                        raw_symbol = row["Symbol"].strip()
                        if not raw_symbol:
                            continue
                        
                        # Map fields
                        symbol = f"{raw_symbol}.NS"
                        name = row["Company Name"].strip()
                        sector = row["Industry"].strip()
                        is_gold_etf = False

                        total_rows += 1

                        # Query existing values to determine insertion status
                        cur.execute("SELECT name, sector FROM stocks WHERE symbol = %s", (symbol,))
                        existing = cur.fetchone()

                        if not existing:
                            newly_inserted += 1
                        else:
                            db_name = existing.get("name")
                            db_sector = existing.get("sector")
                            
                            will_update_name = (db_name is None) and (name is not None and name != "")
                            will_update_sector = (db_sector is None) and (sector is not None and sector != "")
                            
                            if will_update_name or will_update_sector:
                                updated_existing += 1
                            else:
                                skipped_existing += 1

                        # Upsert and update name/sector only where currently NULL
                        cur.execute(
                            """
                            INSERT INTO stocks (symbol, name, sector, is_gold_etf)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (symbol) DO UPDATE SET
                              name = COALESCE(stocks.name, EXCLUDED.name),
                              sector = COALESCE(stocks.sector, EXCLUDED.sector)
                            """,
                            (symbol, name, sector, is_gold_etf),
                        )

            # The connection context manager will commit the transaction here on success.

        print("\nSeeding Summary:")
        print(f"  Total rows processed from CSV: {total_rows}")
        print(f"  Newly inserted stocks:         {newly_inserted}")
        print(f"  Existing stocks updated:       {updated_existing}")
        print(f"  Existing stocks skipped:       {skipped_existing}")

    except Exception as e:
        print(f"Error during seeding: {e}")
        sys.exit(1)
    finally:
        db.close_pool()


if __name__ == "__main__":
    main()
