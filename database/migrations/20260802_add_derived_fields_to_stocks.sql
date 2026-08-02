-- Add 3 new derived performance and volatility columns to the stocks table:
-- pct_change_5d, volume_vs_avg_ratio, and atr_volatility_ratio.

ALTER TABLE stocks
  ADD COLUMN IF NOT EXISTS pct_change_5d numeric(9,4),
  ADD COLUMN IF NOT EXISTS volume_vs_avg_ratio numeric(9,4),
  ADD COLUMN IF NOT EXISTS atr_volatility_ratio numeric(9,4);

COMMENT ON COLUMN stocks.pct_change_5d IS
  '5-trading-day percentage price change computed from within the 1-month yfinance series.';
COMMENT ON COLUMN stocks.volume_vs_avg_ratio IS
  'Today''s volume vs. the 20-day average volume in the 1-month series.';
COMMENT ON COLUMN stocks.atr_volatility_ratio IS
  'Today''s true range vs. the 14-day Average True Range (ATR) in the 1-month series.';
