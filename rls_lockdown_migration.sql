-- ─────────────────────────────────────────
-- RLS LOCKDOWN — additive security migration
-- Enables Row Level Security on tables that were created without it, so the
-- public/anon and authenticated PostgREST roles cannot read them directly.
-- The server uses the service_role key, which BYPASSES RLS — so app behaviour
-- is unchanged; this only closes direct-API access to sensitive rows.
-- No policies are added → these tables are locked to anon/authenticated. Safe to re-run.
-- ─────────────────────────────────────────

alter table if exists support_chat_logs   enable row level security;
alter table if exists subscription_events enable row level security;
alter table if exists demo_rate_limits     enable row level security;

-- Belt-and-braces: ensure anon/authenticated have NO table privileges on these.
revoke all on support_chat_logs   from anon, authenticated;
revoke all on subscription_events from anon, authenticated;
revoke all on demo_rate_limits     from anon, authenticated;
