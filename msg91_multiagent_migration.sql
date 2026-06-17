-- ─────────────────────────────────────────
-- MSG91 multi-agent routing — additive migration
-- Lets each agent own a distinct MSG91 WhatsApp business number so inbound
-- messages route to the correct agent. Safe to re-run (IF NOT EXISTS).
-- Store DIGITS ONLY (e.g. 919876543210) to match the webhook's normalisation.
-- ─────────────────────────────────────────

alter table agents add column if not exists msg91_integrated_number text;

-- Webhook looks up the owning agent by this number on every inbound message.
create index if not exists idx_agents_msg91_number
  on agents (msg91_integrated_number);

grant select, insert, update on agents to service_role;
