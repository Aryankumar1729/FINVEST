-- Add slower-changing stock detail fields sourced from yfinance .info
-- (same refresh cadence as pe_ratio / market_cap / eps).

ALTER TABLE stocks
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS fifty_two_week_high numeric(18,6),
  ADD COLUMN IF NOT EXISTS fifty_two_week_low numeric(18,6);

COMMENT ON COLUMN stocks.name IS
  'Company display name from yfinance info.longName; refreshed with pe_ratio/market_cap/eps.';
COMMENT ON COLUMN stocks.fifty_two_week_high IS
  'yfinance info.fiftyTwoWeekHigh; refreshed with other stock detail fields.';
COMMENT ON COLUMN stocks.fifty_two_week_low IS
  'yfinance info.fiftyTwoWeekLow; refreshed with other stock detail fields.';
