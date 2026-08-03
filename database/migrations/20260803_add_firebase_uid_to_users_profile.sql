-- Migration: Add firebase_uid to users_profile (Decision 1 Option B)
-- Keeps user_id as uuid PRIMARY KEY; adds nullable unique Firebase identity column.
-- Run this file against the existing database.

BEGIN;

ALTER TABLE users_profile
  ADD COLUMN firebase_uid text;

ALTER TABLE users_profile
  ADD CONSTRAINT users_profile_firebase_uid_key UNIQUE (firebase_uid);

COMMIT;
