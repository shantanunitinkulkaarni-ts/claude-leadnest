-- backfill_state.sql
-- One-time backfill: conversation_stage → state
-- RUN MANUALLY in Supabase SQL editor after 06_add_state_column.sql is deployed
-- Founder runs this (Step B of safe migration)

-- Backfill state from conversation_stage
UPDATE leads
SET state = CASE
  WHEN conversation_stage = 'new' THEN 'NEW'
  WHEN conversation_stage = 'awaiting_intent' THEN 'IN_CONVERSATION'
  WHEN conversation_stage = 'awaiting_area' THEN 'QUALIFYING'
  WHEN conversation_stage = 'presenting' THEN 'PROPERTY_SHOWN'
  WHEN conversation_stage = 'no_match_ai' THEN 'PROPERTY_SHOWN'
  WHEN conversation_stage = 'awaiting_booking' THEN 'VISIT_REQUESTED'
  WHEN conversation_stage = 'booked' THEN 'VISIT_CONFIRMED'
  ELSE 'NEW'
END,
state_updated_at = COALESCE(updated_at, created_at, NOW())
WHERE state IS NULL;

-- Verify: check for any unbackfilled leads (should be zero)
SELECT COUNT(*) as unbackfilled_count FROM leads WHERE state IS NULL;

-- Summary: show distribution
SELECT state, COUNT(*) as count FROM leads WHERE state IS NOT NULL GROUP BY state ORDER BY count DESC;
