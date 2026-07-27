-- Migration: add strategy_deviation support to journal.
-- Run this file as-is against the existing database.
-- The enum addition is isolated in its own committed step so later constraint
-- changes can safely reference the new value.

COMMIT;

ALTER TYPE journal_entry_type_enum ADD VALUE IF NOT EXISTS 'strategy_deviation';

COMMIT;

BEGIN;

ALTER TABLE journal
  DROP CONSTRAINT IF EXISTS journal_linked_ref_type_check;

ALTER TABLE journal
  ADD CONSTRAINT journal_linked_ref_type_check
  CHECK (linked_ref_type IN ('none', 'lot', 'goal'));

ALTER TABLE journal
  DROP CONSTRAINT IF EXISTS journal_linked_ref_shape_check;

ALTER TABLE journal
  ADD CONSTRAINT journal_linked_ref_shape_check
  CHECK (
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
  );

COMMENT ON COLUMN journal.linked_ref_type IS
  'Self-describing polymorphic reference type. exit_timing_insight rows use lot, strategy_deviation rows use goal, and the other journal entry types have no linked row.';

COMMIT;

-- Quick verification query after applying the migration:
--
-- 1) These should be accepted by the CHECK constraints:
-- INSERT INTO journal (user_id, entry_type, linked_ref_type, linked_ref_id, chroma_id)
-- VALUES
--   ('00000000-0000-0000-0000-000000000000', 'strategy_deviation', 'goal', '123', 'verify-goal'),
--   ('00000000-0000-0000-0000-000000000000', 'exit_timing_insight', 'lot', '456', 'verify-lot');
--
-- 2) This should still fail:
-- INSERT INTO journal (user_id, entry_type, linked_ref_type, linked_ref_id, chroma_id)
-- VALUES ('00000000-0000-0000-0000-000000000000', 'strategy_deviation', 'lot', '456', 'verify-invalid');
