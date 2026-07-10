-- June 13, 2026 — batch 2: property details, consent, ticketing
-- Safe/idempotent: all ADD COLUMN IF NOT EXISTS.

-- ── Properties: possession, deposit, project website + AI consent, extra info ──
alter table properties add column if not exists possession_date date;
alter table properties add column if not exists possession_status text; -- ready_to_move | under_construction | new_launch
alter table properties add column if not exists deposit numeric(12,2); -- rental security/holding deposit
alter table properties add column if not exists project_website text;
alter table properties add column if not exists website_ai_consent boolean default false;
alter table properties add column if not exists extra_info text; -- free-text locality highlights (hospital nearby, etc.)

-- ── Leads: explicit consent capture on manual add (Meta ban-safety) ──
alter table leads add column if not exists consent_confirmed boolean default false;
alter table leads add column if not exists consent_confirmed_at timestamptz;

-- ── Support tickets ──
create table if not exists support_tickets (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  agent_id uuid references agents(id) on delete set null,
  email text,
  name text,
  subject text not null,
  message text not null,
  status text default 'open', -- open | resolved
  source text default 'help_page' -- help_page | support_chat
);

grant all on support_tickets to service_role;

-- ── Support chat: capture WHY (reason on thumbs-down / what they liked on up) ──
alter table support_chat_logs add column if not exists feedback_note text;
