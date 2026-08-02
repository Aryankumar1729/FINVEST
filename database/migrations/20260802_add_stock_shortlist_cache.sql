-- Migration to add stock_shortlist_cache table
-- Holds the Stage 1 shortlist of stock symbols.

CREATE TABLE IF NOT EXISTS stock_shortlist_cache (
  id serial PRIMARY KEY,
  symbols jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE stock_shortlist_cache IS
  'Stage 1 shared stock recommendation shortlist cache, holding exactly one row.';
