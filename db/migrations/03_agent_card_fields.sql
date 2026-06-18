-- ============================================================================
-- 03_agent_card_fields.sql — agent details for the safe fallback contact card
-- ============================================================================
-- Idempotent. Adds the fields the contact card (lib/fallbackCard.ts) shows and
-- that the founder wants captured at signup. No data change.
--
-- ⚠️ Apply before relying on these in the card / Settings. The card already
-- degrades gracefully when they're null, so applying is non-urgent but needed
-- for agents to fill them in.
-- ============================================================================

alter table agents add column if not exists office_address text; -- full office address
alter table agents add column if not exists weekly_off     text; -- e.g. "Sunday"
alter table agents add column if not exists holidays        text; -- free text, e.g. "Closed on public holidays"
