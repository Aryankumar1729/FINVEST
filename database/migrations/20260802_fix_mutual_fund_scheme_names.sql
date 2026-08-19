-- Migration: fix mutual fund scheme_name mismatches to align with official AMFI source names.
-- Run this file against the existing database.

BEGIN;

UPDATE mutual_funds
SET scheme_name = 'SBI Large Cap FUND-DIRECT PLAN -GROWTH'
WHERE scheme_name = 'SBI Bluechip Fund - Direct Plan - Growth';

UPDATE mutual_funds
SET scheme_name = 'Axis Large Cap Fund - Direct Plan - Growth'
WHERE scheme_name = 'Axis Bluechip Fund - Direct Plan - Growth';

UPDATE mutual_funds
SET scheme_name = 'HDFC Mid Cap Fund - Growth Option - Direct Plan'
WHERE scheme_name = 'HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth';

-- ICICI Prudential Balanced Advantage: no rename needed. An earlier draft
-- incorrectly introduced a double space before "Growth" ("Plan -  Growth");
-- that was a typo, not an AMFI name. DBs that already applied the typo can fix with:
--   UPDATE mutual_funds
--   SET scheme_name = 'ICICI Prudential Balanced Advantage Fund - Direct Plan - Growth'
--   WHERE scheme_name = 'ICICI Prudential Balanced Advantage Fund - Direct Plan -  Growth';

UPDATE mutual_funds
SET scheme_name = 'HDFC Corporate Bond Fund - Growth Option - Direct Plan'
WHERE scheme_name = 'HDFC Corporate Bond Fund - Direct Plan - Growth';

UPDATE mutual_funds
SET scheme_name = 'Nippon India Nifty 500 Momentum 50 Index Fund - Direct Plan - Growth Option'
WHERE scheme_name = 'Nippon India Nifty 500 Momentum 50 Index Fund - Direct Plan - Growth';

COMMIT;
