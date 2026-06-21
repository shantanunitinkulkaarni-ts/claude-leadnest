-- 05_lead_state_machine.sql
-- Adds state machine columns to leads + creates lead_tasks table.
-- DO NOT RUN — reviewed first.

-- ─── Leads: new columns for state machine ────────────────────────────────
alter table leads
  add column if not exists lead_stage text,
  add column if not exists lead_stage_updated_at timestamptz,
  add column if not exists nurture_plan text,
  add column if not exists nurture_step integer default 0,
  add column if not exists next_action_at timestamptz,
  add column if not exists last_bot_action text,
  add column if not exists visit_status text,
  add column if not exists last_visit_at timestamptz,
  add column if not exists last_nurture_at timestamptz;

-- Default existing leads to initial stage
update leads
  set lead_stage = 'NEW',
      lead_stage_updated_at = coalesce(updated_at, created_at, now())
  where lead_stage is null;

-- ─── Indexes ────────────────────────────────────────────────────────────
create index if not exists idx_leads_lead_stage on leads (lead_stage);
create index if not exists idx_leads_next_action on leads (next_action_at) where next_action_at is not null;
create index if not exists idx_leads_agent_stage on leads (agent_id, lead_stage);
create index if not exists idx_leads_nurture_plan on leads (nurture_plan) where nurture_plan is not null;

-- ─── lead_tasks table ───────────────────────────────────────────────────
create table if not exists lead_tasks (
  id uuid not null default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  task_type text not null,
  scheduled_for timestamptz not null,
  executed_at timestamptz,
  status text not null default 'pending'::text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (id)
);

-- Task statuses: pending | running | completed | failed | cancelled

create index if not exists idx_lead_tasks_due on lead_tasks (status, scheduled_for)
  where status = 'pending' or status = 'running';
create index if not exists idx_lead_tasks_lead on lead_tasks (lead_id);