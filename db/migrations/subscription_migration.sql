-- ─────────────────────────────────────────
-- SUBSCRIPTION (Razorpay UPI Autopay) — additive migration
-- Run once in Supabase SQL editor. Safe to re-run (IF NOT EXISTS).
-- ─────────────────────────────────────────

-- Razorpay identifiers so we can map webhooks back to an agent.
alter table agents add column if not exists razorpay_customer_id text;
alter table agents add column if not exists razorpay_subscription_id text;

-- Next auto-charge date (from Razorpay), shown to the agent in the dashboard.
alter table agents add column if not exists subscription_charge_at timestamptz;

-- plan_status already exists ('active' | 'paused' | 'cancelled'); we also use:
--   'pending'   = subscription created, mandate not yet authorised
--   'halted'    = Razorpay halted after repeated failed charges
-- plan_expires_at already exists = the date access is paid through ("paid until").

-- Lookup index for webhook handler (find agent by subscription id).
create index if not exists idx_agents_rzp_subscription
  on agents (razorpay_subscription_id);

-- Optional: a log of subscription lifecycle events for support/debugging.
create table if not exists subscription_events (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  agent_id uuid references agents(id) on delete cascade,
  razorpay_subscription_id text,
  event text,            -- e.g. subscription.charged, subscription.halted
  payment_id text,
  amount numeric(10,2),
  raw jsonb
);
create index if not exists idx_sub_events_agent on subscription_events (agent_id);
