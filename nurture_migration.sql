-- Nurture / follow-up tracking (June 13, 2026). Idempotent.
-- Powers the in-window nudge sequence (3h/10h/23h) in /api/cron.

alter table leads add column if not exists last_nudge_at timestamptz;
alter table leads add column if not exists window_nudge_count integer default 0;
-- 'active' (eligible) | 'dormant' (3 unanswered template touches) | 'opted_out'
alter table leads add column if not exists nurture_state text default 'active';

-- Fast lookup for the cron's eligibility scan.
create index if not exists leads_nurture_scan_idx
  on leads (agent_id, bot_paused, status, last_message_at);
