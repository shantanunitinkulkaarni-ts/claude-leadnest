-- ============================================================================
-- 02_nurture_flow.sql — state columns for the nurture-flow v2 engine
-- ============================================================================
-- Idempotent. Adds the per-lead state the post-window plan engine
-- (lib/nurtureFlow.ts) needs. Safe to run anytime; no data change.
--
-- ⚠️ APPLY THIS BEFORE setting NURTURE_FLOW_V2=true in Vercel. The v2 cron path
-- writes these columns; the flag stays OFF until this migration is applied and
-- the flow is reviewed on staging.
-- ============================================================================

alter table leads add column if not exists nurture_plan  text;       -- null | 'A' | 'B' | 'C' | 'D'
alter table leads add column if not exists plan_d_touches integer default 0;

-- Helps the v2 cron scan (active, openable leads) stay fast as volume grows.
create index if not exists leads_nurture_v2_idx
  on leads (bot_paused, opted_in, status, last_message_at);
