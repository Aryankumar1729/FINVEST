-- Enumerations
CREATE TYPE tax_regime_enum AS ENUM ('old', 'new');
CREATE TYPE risk_tier_enum AS ENUM ('conservative', 'moderate', 'aggressive');
CREATE TYPE mf_risk_category_enum AS ENUM ('debt', 'equity', 'hybrid', 'other');
CREATE TYPE gain_type_enum AS ENUM ('LTCG', 'STCG');
CREATE TYPE paid_status_enum AS ENUM ('unpaid', 'paid');
CREATE TYPE goal_variant_type_enum AS ENUM ('conservative', 'moderate', 'aggressive', 'situational');
CREATE TYPE journal_entry_type_enum AS ENUM (
  'user_authored',
  'onboarding_self_reported',
  'exit_timing_insight',
  'strategy_deviation',
  'risk_tier_change'
);

-- Updated-at trigger helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1) users_profile
CREATE TABLE users_profile (
  user_id uuid PRIMARY KEY,
  firebase_uid text UNIQUE,
  salary numeric(14,2),
  current_expense_estimate numeric(14,2),
  current_cash_balance numeric(14,2),
  tax_regime tax_regime_enum,
  risk_score integer,
  risk_tier risk_tier_enum,
  raw_risk_mcq_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN users_profile.raw_risk_mcq_answers IS
  'Raw onboarding answers kept as JSONB so the risk score can be recomputed later.';

-- 2) liabilities
CREATE TABLE liabilities (
  liability_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users_profile(user_id) ON DELETE CASCADE,
  loan_type text NOT NULL,
  principal numeric(14,2) NOT NULL,
  remaining_balance numeric(14,2) NOT NULL,
  interest_rate numeric(7,4) NOT NULL,
  tenure_months integer NOT NULL,
  monthly_emi numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_liabilities_user_id ON liabilities(user_id);

-- 3) stocks
CREATE TABLE stocks (
  stock_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  symbol text NOT NULL UNIQUE,
  name text,
  sector text,
  current_price numeric(18,6),
  pct_change_today numeric(9,4),
  pe_ratio numeric(14,4),
  market_cap numeric(24,2),
  eps numeric(14,4),
  fifty_two_week_high numeric(18,6),
  fifty_two_week_low numeric(18,6),
  is_gold_etf boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE stocks IS
  'Symbol-level market snapshot. current_price and pct_change_today refresh frequently; name, pe_ratio, market_cap, eps, and 52-week high/low are slower-changing detail fields kept in the same row by design.';

-- 4) mutual_funds
CREATE TABLE mutual_funds (
  scheme_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_name text NOT NULL UNIQUE,
  risk_category mf_risk_category_enum NOT NULL,
  cagr numeric(9,4),
  detail_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  latest_nav numeric(12,4),
  previous_nav numeric(12,4),
  nav_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN mutual_funds.detail_stats IS
  'Less-frequently-needed fund statistics stored as JSONB to avoid extra normalization.';

-- 5) fd_rates
CREATE TABLE fd_rates (
  fd_rate_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bank_name text NOT NULL,
  tenure_months integer NOT NULL,
  interest_rate numeric(7,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fd_rates_bank_tenure_uk UNIQUE (bank_name, tenure_months)
);

-- 6) lots
CREATE TABLE lots (
  lot_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users_profile(user_id) ON DELETE CASCADE,
  goal_id bigint,
  stock_symbol text REFERENCES stocks(symbol),
  mutual_fund_id bigint REFERENCES mutual_funds(scheme_id),
  buy_date date NOT NULL,
  buy_price numeric(18,6) NOT NULL,
  quantity numeric(18,6) NOT NULL,
  remaining_quantity numeric(18,6) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lots_exactly_one_asset_ref CHECK (
    ((stock_symbol IS NOT NULL)::int + (mutual_fund_id IS NOT NULL)::int) = 1
  ),
  CONSTRAINT lots_remaining_qty_check CHECK (
    remaining_quantity >= 0 AND remaining_quantity <= quantity
  )
);

COMMENT ON TABLE lots IS
  'Each lot points to exactly one asset family. The pair of nullable typed FKs preserves referential integrity while staying polymorphic.';

CREATE INDEX idx_lots_user_id ON lots(user_id);
CREATE INDEX idx_lots_goal_id ON lots(goal_id);
CREATE INDEX idx_lots_stock_symbol_buy_date_open
  ON lots (stock_symbol, buy_date)
  WHERE remaining_quantity > 0;
CREATE INDEX idx_lots_mutual_fund_id_buy_date_open
  ON lots (mutual_fund_id, buy_date)
  WHERE remaining_quantity > 0;

-- 7) sell_allocations
CREATE TABLE sell_allocations (
  sell_allocation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users_profile(user_id) ON DELETE CASCADE,
  lot_id bigint NOT NULL REFERENCES lots(lot_id) ON DELETE CASCADE,
  sold_quantity numeric(18,6) NOT NULL,
  sell_price numeric(18,6) NOT NULL,
  sell_date date NOT NULL,
  holding_period_days integer NOT NULL,
  gain_type gain_type_enum NOT NULL,
  computed_tax numeric(14,2) NOT NULL,
  assessment_year integer NOT NULL,
  paid_status paid_status_enum NOT NULL DEFAULT 'unpaid',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sell_allocations_sold_qty_check CHECK (sold_quantity > 0),
  CONSTRAINT sell_allocations_holding_period_check CHECK (holding_period_days >= 0)
);

COMMENT ON TABLE sell_allocations IS
  'Sale allocations are stored with a denormalized holding_period_days field, but a trigger below enforces that it matches the referenced lot buy date.';

CREATE INDEX idx_sell_allocations_user_id ON sell_allocations(user_id);
CREATE INDEX idx_sell_allocations_lot_id ON sell_allocations(lot_id);
CREATE INDEX idx_sell_allocations_assessment_year ON sell_allocations(assessment_year);

CREATE OR REPLACE FUNCTION sync_sell_allocations_holding_period_days()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  lot_buy_date date;
  computed_holding_period_days integer;
BEGIN
  SELECT l.buy_date
    INTO lot_buy_date
  FROM lots l
  WHERE l.lot_id = NEW.lot_id;

  IF lot_buy_date IS NULL THEN
    RAISE EXCEPTION 'No lot found for lot_id %', NEW.lot_id;
  END IF;

  computed_holding_period_days := NEW.sell_date - lot_buy_date;

  IF NEW.holding_period_days IS DISTINCT FROM computed_holding_period_days THEN
    RAISE EXCEPTION
      'holding_period_days mismatch for lot_id %: supplied %, computed %',
      NEW.lot_id,
      NEW.holding_period_days,
      computed_holding_period_days;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sell_allocations_validate_holding_period_days ON sell_allocations;

CREATE TRIGGER trg_sell_allocations_validate_holding_period_days
BEFORE INSERT OR UPDATE ON sell_allocations
FOR EACH ROW
EXECUTE FUNCTION sync_sell_allocations_holding_period_days();

-- 8) tax_config
CREATE TABLE tax_config (
  tax_config_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assessment_year integer NOT NULL UNIQUE,
  config jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tax_config IS
  'Append-only yearly tax configuration snapshot; assessment_year is unique and historical years are never overwritten.';

COMMENT ON COLUMN tax_config.config IS
  'JSONB payload containing slab boundaries, LTCG/STCG rates, and the exemption threshold for that assessment year.';

-- Seed: FY 2025-26 rates (assessment_year = 2026 per tools._assessment_year / get_current_assessment_year)
INSERT INTO tax_config (assessment_year, config) VALUES (
  2026,
  '{
    "salary": {
      "new": {
        "slabs": [
          {"upto": 400000, "rate": 0.0},
          {"upto": 800000, "rate": 0.05},
          {"upto": 1200000, "rate": 0.10},
          {"upto": 1600000, "rate": 0.15},
          {"upto": 2000000, "rate": 0.20},
          {"upto": 2400000, "rate": 0.25},
          {"upto": null, "rate": 0.30}
        ],
        "standard_deduction": 75000,
        "rebate_threshold": 1200000,
        "rebate_max_amount": 60000,
        "cess_rate": 0.04
      },
      "old": {
        "slabs": [
          {"upto": 250000, "rate": 0.0},
          {"upto": 500000, "rate": 0.05},
          {"upto": 1000000, "rate": 0.20},
          {"upto": null, "rate": 0.30}
        ],
        "standard_deduction": 50000,
        "rebate_threshold": 500000,
        "rebate_max_amount": 12500,
        "cess_rate": 0.04
      }
    },
    "capital_gains": {
      "ltcg_rate": 0.125,
      "stcg_rate": 0.20,
      "ltcg_exemption": 125000
    }
  }'::jsonb
)
ON CONFLICT (assessment_year) DO NOTHING;

-- 9) goals
CREATE TABLE goals (
  goal_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users_profile(user_id) ON DELETE CASCADE,
  target_amount numeric(14,2) NOT NULL,
  target_date date NOT NULL,
  selected_variant_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_goals_user_id ON goals(user_id);

ALTER TABLE lots
  ADD CONSTRAINT lots_goal_id_fkey
  FOREIGN KEY (goal_id)
  REFERENCES goals(goal_id)
  ON DELETE SET NULL;

-- 10) goal_strategy_variants
CREATE TABLE goal_strategy_variants (
  variant_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users_profile(user_id) ON DELETE CASCADE,
  goal_id bigint NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
  variant_type goal_variant_type_enum NOT NULL,
  allocation_pct jsonb NOT NULL DEFAULT '{}'::jsonb,
  stock_picks jsonb NOT NULL DEFAULT '[]'::jsonb,
  mf_split jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale text,
  target_allocation_pct jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_monthly_expense_ceiling numeric(14,2),
  target_cash_reserve_balance numeric(14,2),
  is_selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE goal_strategy_variants IS
  'Variant definitions for a goal; goals.selected_variant_id points back to the chosen row.';

CREATE INDEX idx_goal_strategy_variants_user_id ON goal_strategy_variants(user_id);
CREATE INDEX idx_goal_strategy_variants_goal_id ON goal_strategy_variants(goal_id);

ALTER TABLE goals
  ADD CONSTRAINT goals_selected_variant_id_fkey
  FOREIGN KEY (selected_variant_id)
  REFERENCES goal_strategy_variants(variant_id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

COMMENT ON COLUMN goals.selected_variant_id IS
  'Nullable until a strategy variant is chosen; the FK is added after goal_strategy_variants because the relationship is circular.';

-- 11) journal
CREATE TABLE journal (
  journal_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users_profile(user_id) ON DELETE CASCADE,
  entry_type journal_entry_type_enum NOT NULL,
  linked_ref_type text NOT NULL DEFAULT 'none',
  linked_ref_id text,
  chroma_id text NOT NULL,
  text_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journal_linked_ref_type_check CHECK (linked_ref_type IN ('none', 'lot', 'goal')),
  CONSTRAINT journal_linked_ref_shape_check CHECK (
    (
      entry_type = 'exit_timing_insight'
      AND linked_ref_type = 'lot'
      AND linked_ref_id IS NOT NULL
    )
    OR
    (
      entry_type = 'strategy_deviation'
      AND linked_ref_type = 'goal'
      AND linked_ref_id IS NOT NULL
    )
    OR
    (
      entry_type IN ('user_authored', 'onboarding_self_reported', 'risk_tier_change')
      AND linked_ref_type = 'none'
      AND linked_ref_id IS NULL
    )
  )
);

COMMENT ON COLUMN journal.linked_ref_type IS
  'Self-describing polymorphic reference type. exit_timing_insight rows use lot, strategy_deviation rows use goal, and the other journal entry types have no linked row.';

COMMENT ON COLUMN journal.linked_ref_id IS
  'When linked_ref_type = lot, this stores the lot_id as text. Otherwise it remains null.';

COMMENT ON TABLE journal IS
  'Audit journal for user-authored and system-generated insights, with optional plaintext debugging copy alongside the vector-store pointer.';

CREATE INDEX idx_journal_user_id ON journal(user_id);

-- 12) price_cache
CREATE TABLE price_cache (
  price_cache_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker text NOT NULL,
  price numeric(18,6) NOT NULL,
  fetched_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE price_cache IS
  'Shared cache for stock prices, mutual fund prices, and benchmark index prices such as Nifty 50.';

CREATE INDEX idx_price_cache_ticker_fetched_at ON price_cache(ticker, fetched_at DESC);

-- 13) tool_call_log
CREATE TABLE tool_call_log (
  tool_call_log_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users_profile(user_id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary text,
  success boolean NOT NULL,
  called_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tool_call_log IS
  'Debugging and grounding log for Gemini tool usage, scoped per user so tool calls can be audited alongside the facts they influenced.';

CREATE INDEX idx_tool_call_log_user_id ON tool_call_log(user_id);
CREATE INDEX idx_tool_call_log_user_id_called_at ON tool_call_log(user_id, called_at DESC);

-- Apply updated_at maintenance to every table that has the column
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users_profile',
    'liabilities',
    'stocks',
    'mutual_funds',
    'fd_rates',
    'lots',
    'sell_allocations',
    'tax_config',
    'goals',
    'goal_strategy_variants',
    'journal',
    'price_cache',
    'tool_call_log'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I;', table_name || '_set_updated_at', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      table_name || '_set_updated_at',
      table_name
    );
  END LOOP;
END $$;

-- Foreign key summary:
-- liabilities.user_id -> users_profile.user_id
-- lots.user_id -> users_profile.user_id
-- lots.goal_id -> goals.goal_id
-- lots.stock_symbol -> stocks.symbol
-- lots.mutual_fund_id -> mutual_funds.scheme_id
-- sell_allocations.user_id -> users_profile.user_id
-- sell_allocations.lot_id -> lots.lot_id
-- goals.user_id -> users_profile.user_id
-- goal_strategy_variants.user_id -> users_profile.user_id
-- goal_strategy_variants.goal_id -> goals.goal_id
-- goals.selected_variant_id -> goal_strategy_variants.variant_id
-- journal.user_id -> users_profile.user_id
-- tool_call_log.user_id -> users_profile.user_id