-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️  STALE / LEGACY — NOT THE SOURCE OF TRUTH.
--
-- 👉 The canonical, up-to-date schema is `db/schema.sql` (generated from the LIVE
--    database). See `db/README.md` for how to change the schema. This file is a
--    v1 snapshot kept only so old references don't break — do not trust it.
--
-- This is a v1 snapshot from the early days of LeadNest/Convorian. The actual
-- live schema is the cumulative result of THIS file PLUS the 25+ migration
-- files at the repo root (`*_migration.sql`, `*_fix.sql`, etc.). Tables &
-- columns missing from this file include (non-exhaustive):
--   - property_media (Phase 0F)
--   - team_members, superadmins
--   - knowledge_gaps, support_chat_logs, support_tickets
--   - subscription_events, demo_rate_limits
--   - messages.wa_message_id partial unique index (dedup)
--   - leads.last_nudge_at / window_nudge_count / nurture_state / template_touches
--     / opted_in / consent_*
--   - agents.msg91_integrated_number / outreach_intensity / nurture_emails_sent
--     / consent_terms / consent_marketing / plan_status='trial' etc.
--   - service_role grants (`service_role_grants.sql`) — REQUIRED for app
--     to read without "permission denied for table X" errors
--   - RLS lockdown + tenant policies (`rls_lockdown_migration.sql`,
--     `rls_tenant_policies_migration.sql`)
--
-- To bring a fresh database to prod parity, you must apply migration files in
-- chronological order (see git log). This file is kept ONLY as historical
-- reference for the original table shape. The next engineering-maturity task
-- is to move these into a real Supabase CLI migrations folder.
-- ─────────────────────────────────────────────────────────────────────────────

-- LeadNest Database Schema (v1 — see warning above)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- AGENTS (clients who pay for LeadNest)
-- ─────────────────────────────────────────
create table if not exists agents (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  email text unique not null,
  name text not null,
  phone text,
  agency_name text,
  city text,
  state text,
  areas text[], -- array of areas they cover
  property_types text[], -- residential_sale, residential_rental, commercial_sale, commercial_rental, plots
  bot_tone text default 'friendly', -- friendly, professional, concise
  languages text[] default array['english', 'hindi'],
  office_open text default '09:00',
  office_close text default '19:00',
  bot_active boolean default true,
  window_keepalive boolean default true,
  plan text default 'monthly', -- monthly, annual
  plan_status text default 'active', -- active, paused, cancelled
  plan_started_at timestamptz default now(),
  plan_expires_at timestamptz,
  messages_used integer default 0,
  messages_limit integer default 5000,
  wa_balance numeric(10,2) default 0,
  wa_phone_number_id text, -- Meta WhatsApp phone number ID
  wa_access_token text, -- Meta access token for this agent
  wa_verified boolean default false,
  out_of_office_message text default 'Hi! Thanks for reaching out. Our team is currently unavailable but your message is important to us. We will get back to you first thing in the morning!',
  nurture_emails_sent text[] default array[]::text[] -- lifecycle email step keys already sent
);

-- ─────────────────────────────────────────
-- PROPERTIES
-- ─────────────────────────────────────────
create table if not exists properties (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  agent_id uuid references agents(id) on delete cascade,
  title text not null,
  type text not null, -- sale, rental
  category text, -- apartment, villa, plot, commercial, office
  location text,
  city text,
  price numeric(15,2),
  rent_per_month numeric(10,2),
  size_sqft integer,
  bhk text, -- 1BHK, 2BHK, 3BHK, 4BHK, commercial
  description text,
  features text[], -- parking, gym, pool, garden, etc
  photos text[], -- array of image URLs
  video_url text,
  brochure_url text,
  status text default 'active', -- active, sold, rented, on_hold
  facing text -- north, south, east, west
);

-- ─────────────────────────────────────────
-- LEADS
-- ─────────────────────────────────────────
create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  agent_id uuid references agents(id) on delete cascade,
  name text,
  phone text not null,
  intent text, -- buy, rent
  property_category text,
  preferred_areas text[],
  budget_min numeric(15,2),
  budget_max numeric(15,2),
  timeline text, -- immediately, within_3_months, exploring
  family_size integer,
  special_requirements text,
  ai_score integer default 0, -- 1-10
  status text default 'new', -- new, contacted, qualified, visit_booked, visit_done, closed_won, closed_lost
  temperature text default 'new', -- hot, warm, cold, new
  source text default 'whatsapp_inbound',
  last_message_at timestamptz,
  window_expires_at timestamptz, -- 24h window expiry
  window_keepalive_sent_at timestamptz, -- when we last sent 23h keepalive
  bot_paused boolean default false, -- manual takeover
  matched_property_id uuid references properties(id),
  notes text
);

-- ─────────────────────────────────────────
-- CONVERSATIONS
-- ─────────────────────────────────────────
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  lead_id uuid references leads(id) on delete cascade,
  agent_id uuid references agents(id) on delete cascade,
  direction text not null, -- inbound, outbound
  content text not null,
  message_type text default 'text', -- text, image, document, template
  template_name text,
  wa_message_id text, -- WhatsApp message ID
  status text default 'sent', -- sent, delivered, read, failed
  sent_by text default 'bot' -- bot, agent
);

-- ─────────────────────────────────────────
-- APPOINTMENTS
-- ─────────────────────────────────────────
create table if not exists appointments (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  agent_id uuid references agents(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  property_id uuid references properties(id),
  scheduled_at timestamptz not null,
  status text default 'upcoming', -- upcoming, done, cancelled, no_show
  reminder_sent boolean default false,
  post_visit_prompted boolean default false,
  post_visit_result text, -- interested, follow_up_later, not_interested
  notes text
);

-- ─────────────────────────────────────────
-- WHATSAPP BALANCE TRANSACTIONS
-- ─────────────────────────────────────────
create table if not exists wa_transactions (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  agent_id uuid references agents(id) on delete cascade,
  type text not null, -- topup, deduction
  amount numeric(10,4) not null,
  description text,
  balance_after numeric(10,2),
  template_name text,
  lead_id uuid references leads(id)
);

-- ─────────────────────────────────────────
-- ACTIVITY LOG (for timeline view)
-- ─────────────────────────────────────────
create table if not exists activity_log (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  agent_id uuid references agents(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  type text not null, -- lead_created, score_updated, visit_booked, status_changed, manual_takeover, bot_resumed, property_matched
  title text not null,
  description text,
  metadata jsonb
);

-- ─────────────────────────────────────────
-- INDEXES for performance
-- ─────────────────────────────────────────
create index if not exists idx_leads_agent_id on leads(agent_id);
create index if not exists idx_leads_phone on leads(phone);
create index if not exists idx_leads_status on leads(status);
create index if not exists idx_leads_temperature on leads(temperature);
create index if not exists idx_messages_lead_id on messages(lead_id);
create index if not exists idx_messages_agent_id on messages(agent_id);
create index if not exists idx_messages_created_at on messages(created_at);
create index if not exists idx_appointments_agent_id on appointments(agent_id);
create index if not exists idx_appointments_scheduled_at on appointments(scheduled_at);
create index if not exists idx_properties_agent_id on properties(agent_id);
create index if not exists idx_properties_status on properties(status);
create index if not exists idx_activity_lead_id on activity_log(lead_id);

-- ─────────────────────────────────────────
-- RLS (Row Level Security)
-- ─────────────────────────────────────────
alter table agents enable row level security;
alter table properties enable row level security;
alter table leads enable row level security;
alter table messages enable row level security;
alter table appointments enable row level security;
alter table wa_transactions enable row level security;
alter table activity_log enable row level security;

-- Service role bypasses RLS (used by backend)
-- Frontend will use anon key with proper policies once auth is added

-- ─────────────────────────────────────────
-- FUNCTION: auto-update updated_at on leads
-- ─────────────────────────────────────────
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at_column();
