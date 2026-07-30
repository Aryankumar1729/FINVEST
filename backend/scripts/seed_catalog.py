from __future__ import annotations

import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

sys.path.insert(0, str(ROOT))

import backend.app.db as db


STOCKS = [
    ("ADANIENT.NS", "Metals & Mining", False),
    ("ADANIPORTS.NS", "Services", False),
    ("APOLLOHOSP.NS", "Healthcare", False),
    ("ASIANPAINT.NS", "Consumer Durables", False),
    ("AXISBANK.NS", "Financial Services", False),
    ("BAJAJ-AUTO.NS", "Automobile and Auto Components", False),
    ("BAJFINANCE.NS", "Financial Services", False),
    ("BAJAJFINSV.NS", "Financial Services", False),
    ("BEL.NS", "Capital Goods", False),
    ("BHARTIARTL.NS", "Telecommunication", False),
    ("CIPLA.NS", "Healthcare", False),
    ("COALINDIA.NS", "Oil Gas & Consumable Fuels", False),
    ("DRREDDY.NS", "Healthcare", False),
    ("EICHERMOT.NS", "Automobile and Auto Components", False),
    ("ETERNAL.NS", "Consumer Services", False),
    ("GRASIM.NS", "Construction Materials", False),
    ("HCLTECH.NS", "Information Technology", False),
    ("HDFCBANK.NS", "Financial Services", False),
    ("HDFCLIFE.NS", "Financial Services", False),
    ("HINDALCO.NS", "Metals & Mining", False),
    ("HINDUNILVR.NS", "Fast Moving Consumer Goods", False),
    ("ICICIBANK.NS", "Financial Services", False),
    ("INDIGO.NS", "Services", False),
    ("INFY.NS", "Information Technology", False),
    ("ITC.NS", "Fast Moving Consumer Goods", False),
    ("JIOFIN.NS", "Financial Services", False),
    ("JSWSTEEL.NS", "Metals & Mining", False),
    ("KOTAKBANK.NS", "Financial Services", False),
    ("LT.NS", "Construction", False),
    ("M&M.NS", "Automobile and Auto Components", False),
    ("MARUTI.NS", "Automobile and Auto Components", False),
    ("MAXHEALTH.NS", "Healthcare", False),
    ("NESTLEIND.NS", "Fast Moving Consumer Goods", False),
    ("NTPC.NS", "Power", False),
    ("ONGC.NS", "Oil Gas & Consumable Fuels", False),
    ("POWERGRID.NS", "Power", False),
    ("RELIANCE.NS", "Oil Gas & Consumable Fuels", False),
    ("SBILIFE.NS", "Financial Services", False),
    ("SHRIRAMFIN.NS", "Financial Services", False),
    ("SBIN.NS", "Financial Services", False),
    ("SUNPHARMA.NS", "Healthcare", False),
    ("TCS.NS", "Information Technology", False),
    ("TATACONSUM.NS", "Fast Moving Consumer Goods", False),
    ("TMPV.NS", "Automobile and Auto Components", False),
    ("TATASTEEL.NS", "Metals & Mining", False),
    ("TECHM.NS", "Information Technology", False),
    ("TITAN.NS", "Consumer Durables", False),
    ("TRENT.NS", "Consumer Services", False),
    ("ULTRACEMCO.NS", "Construction Materials", False),
    ("WIPRO.NS", "Information Technology", False),
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
    db.open_pool()
    try:
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
    finally:
        db.close_pool()


if __name__ == "__main__":
    main()
