-- Template (post-24h) re-engagement engine (June 13, 2026). Idempotent.

-- Agent-level outreach policy. Default 'persistent' (max engagement / spend).
-- Changed in Settings behind a PIN + spend disclaimer.
alter table agents add column if not exists outreach_intensity text default 'persistent'; -- gentle | balanced | persistent

-- Per-lead paid-template tracking (separate from the free in-window nudges).
alter table leads add column if not exists template_touches integer default 0;
alter table leads add column if not exists last_template_at timestamptz;
