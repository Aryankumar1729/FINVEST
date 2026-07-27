from __future__ import annotations

import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

sys.path.insert(0, str(ROOT))

import backend.app.db as db


STOCKS = [
    ("RELIANCE.NS", "Energy", False),
    ("TCS.NS", "Technology", False),
    ("HDFCBANK.NS", "Financial Services", False),
    ("INFY.NS", "Technology", False),
    ("ITC.NS", "Consumer Defensive", False),
    ("ICICIBANK.NS", "Financial Services", False),
    ("HINDUNILVR.NS", "Consumer Defensive", False),
    ("SBIN.NS", "Financial Services", False),
    ("BHARTIARTL.NS", "Communication Services", False),
    ("KOTAKBANK.NS", "Financial Services", False),
    ("LT.NS", "Industrials", False),
    ("AXISBANK.NS", "Financial Services", False),
    ("ASIANPAINT.NS", "Basic Materials", False),
    ("MARUTI.NS", "Consumer Cyclical", False),
    ("SUNPHARMA.NS", "Healthcare", False),
    ("TITAN.NS", "Consumer Cyclical", False),
    ("WIPRO.NS", "Technology", False),
    ("ULTRACEMCO.NS", "Basic Materials", False),
    ("GOLDBEES.NS", "Commodities", True),
    ("HDFCGOLD.NS", "Commodities", True),
]

MUTUAL_FUNDS = [
    ("SBI Bluechip Fund - Direct Plan - Growth", "equity", 14.20),
    ("HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth", "equity", 18.50),
    ("Axis Bluechip Fund - Direct Plan - Growth", "equity", 13.80),
    ("ICICI Prudential Balanced Advantage Fund - Direct Plan - Growth", "hybrid", 11.60),
    ("Parag Parikh Flexi Cap Fund - Direct Plan - Growth", "equity", 17.90),
    ("HDFC Corporate Bond Fund - Direct Plan - Growth", "debt", 7.40),
]

FD_RATES = [
    ("SBI", 12, 6.80),
    ("SBI", 24, 6.75),
    ("HDFC Bank", 12, 6.60),
    ("HDFC Bank", 24, 7.00),
    ("ICICI Bank", 12, 6.70),
    ("ICICI Bank", 24, 7.05),
    ("Axis Bank", 12, 6.75),
    ("Axis Bank", 36, 7.10),
]


def main() -> None:
    for symbol, sector, is_gold_etf in STOCKS:
        db.execute(
            """
            INSERT INTO stocks (symbol, sector, is_gold_etf)
            VALUES (%s, %s, %s)
            ON CONFLICT (symbol) DO NOTHING
            """,
            (symbol, sector, is_gold_etf),
        )
    print(f"Seeded {len(STOCKS)} stocks")

    for scheme_name, risk_category, cagr in MUTUAL_FUNDS:
        db.execute(
            """
            INSERT INTO mutual_funds (scheme_name, risk_category, cagr)
            VALUES (%s, %s, %s)
            ON CONFLICT (scheme_name) DO NOTHING
            """,
            (scheme_name, risk_category, cagr),
        )
    print(f"Seeded {len(MUTUAL_FUNDS)} mutual funds")

    for bank_name, tenure_months, interest_rate in FD_RATES:
        db.execute(
            """
            INSERT INTO fd_rates (bank_name, tenure_months, interest_rate)
            VALUES (%s, %s, %s)
            ON CONFLICT (bank_name, tenure_months) DO NOTHING
            """,
            (bank_name, tenure_months, interest_rate),
        )
    print(f"Seeded {len(FD_RATES)} fd rates")


if __name__ == "__main__":
    main()
