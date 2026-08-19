-- Migration: Add NAV columns to mutual_funds
-- Run this file against the existing database.

BEGIN;

ALTER TABLE mutual_funds
ADD COLUMN latest_nav numeric(12,4),
ADD COLUMN previous_nav numeric(12,4),
ADD COLUMN nav_date date;

COMMIT;
