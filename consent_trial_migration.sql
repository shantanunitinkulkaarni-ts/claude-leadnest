-- ─────────────────────────────────────────
-- CONSENT + TRIAL — additive migration
-- Consent: store explicit, timestamped agreement (DPDP + basis for WhatsApp
-- template nurturing). Trial uses EXISTING columns (plan_status='trial',
-- messages_limit, plan_expires_at, plan_started_at, wa_balance) — no new
-- columns needed there. Safe to re-run (IF NOT EXISTS).
-- ─────────────────────────────────────────

-- Did the agent accept Terms of Service + Privacy Policy at signup?
alter table agents add column if not exists consent_terms boolean default false;
-- Did the agent opt in to receive nurturing/marketing via WhatsApp + email?
alter table agents add column if not exists consent_marketing boolean default false;
-- When consent was captured (audit trail).
alter table agents add column if not exists consent_at timestamptz;

grant select, insert, update on agents to service_role;
