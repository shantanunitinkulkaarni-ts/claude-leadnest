-- ─────────────────────────────────────────
-- SUPPORT CHAT LOGS — additive migration (data flywheel)
-- Captures every support-assistant turn so the agent can learn over time
-- (few-shot examples now, fine-tuning later). Safe to re-run (IF NOT EXISTS).
-- ─────────────────────────────────────────

create table if not exists support_chat_logs (
  id          uuid primary key default uuid_generate_v4(),
  created_at  timestamptz default now(),
  agent_id    uuid references agents(id) on delete set null, -- null for public /help visitors
  ip_address  text,
  user_message    text,
  assistant_reply text,
  escalated   boolean default false,
  turn_count  int,
  -- Human feedback for supervised improvement (filled later via a feedback action).
  helpful     boolean
);

create index if not exists idx_support_logs_created on support_chat_logs (created_at desc);
create index if not exists idx_support_logs_agent on support_chat_logs (agent_id);
create index if not exists idx_support_logs_escalated on support_chat_logs (escalated);

-- Writes happen via the service role (server-side insert), which bypasses RLS,
-- but grant explicitly so future role changes don't silently break logging.
-- ("permission denied for table" = missing GRANT, not RLS — known gotcha.)
grant select, insert, update on support_chat_logs to service_role;
