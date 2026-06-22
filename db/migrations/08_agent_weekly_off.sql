-- ============================================================================
-- MIGRATION 08: agent weekly day off
-- Optional weekly off-day per agent (e.g. 'Sunday'). NULL = open every day.
-- The AI bot mentions it and refuses to book site visits on that weekday.
-- ============================================================================

ALTER TABLE agents ADD COLUMN IF NOT EXISTS weekly_off text;
