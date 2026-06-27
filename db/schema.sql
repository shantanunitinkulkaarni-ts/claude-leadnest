-- ============================================================================
-- CONVORIAN — CANONICAL DATABASE SCHEMA  (SINGLE SOURCE OF TRUTH)
-- ============================================================================
-- GENERATED from the LIVE Supabase production database (read-only introspection).
-- This file reflects the ACTUAL current schema. Do NOT hand-edit to "design" —
-- to change the schema, write a numbered migration in db/migrations/, apply it
-- to the live DB, then regenerate this file. See db/README.md.
--
-- Tables: 14. RLS + policies summarized at the bottom.
-- ============================================================================


-- ─── activity_log ────────────────────────────────────────────────
create table if not exists activity_log (
  id uuid not null default uuid_generate_v4(),
  created_at timestamptz default now(),
  agent_id uuid,
  lead_id uuid,
  type text not null,
  title text not null,
  description text,
  metadata jsonb,
  primary key (id)
);
--   fk: agent_id -> agents(id) on delete cascade
--   fk: lead_id -> leads(id) on delete cascade

-- ─── agents ──────────────────────────────────────────────────────
create table if not exists agents (
  id uuid not null default uuid_generate_v4(),
  created_at timestamptz default now(),
  email text not null,
  name text not null,
  phone text,
  agency_name text,
  city text,
  state text,
  areas text[],
  property_types text[],
  bot_tone text default 'friendly'::text,
  languages text[] default ARRAY['english'::text, 'hindi'::text],
  office_open text default '09:00'::text,
  office_close text default '19:00'::text,
  bot_active boolean default true,
  window_keepalive boolean default true,
  plan text default 'monthly'::text,
  plan_status text default 'active'::text,
  plan_started_at timestamptz default now(),
  plan_expires_at timestamptz,
  messages_used integer default 0,
  messages_limit integer default 5000,
  wa_balance numeric(10,2) default 0,
  wa_phone_number_id text,
  wa_access_token text,
  wa_verified boolean default false,
  out_of_office_message text default 'Hi! Thanks for reaching out. Our team is currently unavailable but your message is important to us. We will get back to you first thing in the morning!'::text,
  nurture_emails_sent text[] default ARRAY[]::text[],
  razorpay_customer_id text,
  razorpay_subscription_id text,
  subscription_charge_at timestamptz,
  msg91_integrated_number text,
  consent_terms boolean default false,
  consent_marketing boolean default false,
  consent_at timestamptz,
  outreach_intensity text default 'persistent'::text,
  pin_hash text,
  primary key (id)
);

-- ─── appointments ────────────────────────────────────────────────
create table if not exists appointments (
  id uuid not null default uuid_generate_v4(),
  created_at timestamptz default now(),
  agent_id uuid,
  lead_id uuid,
  property_id uuid,
  scheduled_at timestamptz not null,
  status text default 'upcoming'::text,
  reminder_sent boolean default false,
  reminder_sent_at timestamptz,
  post_visit_prompted boolean default false,
  post_visit_result text,
  notes text,
  primary key (id)
);
--   fk: agent_id -> agents(id) on delete cascade
--   fk: lead_id -> leads(id) on delete cascade
--   fk: property_id -> properties(id) on delete no action

-- ─── demo_rate_limits ────────────────────────────────────────────
create table if not exists demo_rate_limits (
  ip_address text not null,
  session_count integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (ip_address)
);

-- ─── knowledge_gaps ──────────────────────────────────────────────
create table if not exists knowledge_gaps (
  id uuid not null default gen_random_uuid(),
  agent_id uuid not null,
  lead_id uuid,
  question text not null,
  bot_reply text,
  answer text,
  status text not null default 'pending'::text,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  primary key (id)
);
--   fk: agent_id -> agents(id) on delete cascade
--   fk: lead_id -> leads(id) on delete set null

-- ─── leads ───────────────────────────────────────────────────────
create table if not exists leads (
  id uuid not null default uuid_generate_v4(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  agent_id uuid,
  name text,
  phone text not null,
  intent text,
  property_category text,
  preferred_areas text[],
  budget_min numeric(15,2),
  budget_max numeric(15,2),
  timeline text,
  family_size integer,
  special_requirements text,
  ai_score integer default 0,
  status text default 'new'::text,
  temperature text default 'new'::text,
  source text default 'whatsapp_inbound'::text,
  last_message_at timestamptz,
  window_expires_at timestamptz,
  window_keepalive_sent_at timestamptz,
  bot_paused boolean default false,
  matched_property_id uuid,
  notes text,
  assigned_to uuid,
  opted_in boolean default false,
  opt_in_at timestamptz,
  opt_in_source text,
  consent_confirmed boolean default false,
  consent_confirmed_at timestamptz,
  last_nudge_at timestamptz,
  window_nudge_count integer default 0,
  nurture_state text default 'active'::text,
  template_touches integer default 0,
  last_template_at timestamptz,
  language text default 'en'::text,
  pending_appointment_time timestamptz,
  pending_appointment_property_id uuid,
  pending_appointment_set_at timestamptz,
  conversation_summary text,
  conversation_summary_message_count integer,
  primary key (id)
);
--   fk: agent_id -> agents(id) on delete cascade
--   fk: matched_property_id -> properties(id) on delete no action
--   fk: assigned_to -> team_members(id) on delete set null

-- ─── messages ────────────────────────────────────────────────────
create table if not exists messages (
  id uuid not null default uuid_generate_v4(),
  created_at timestamptz default now(),
  lead_id uuid,
  agent_id uuid,
  direction text not null,
  content text not null,
  message_type text default 'text'::text,
  template_name text,
  wa_message_id text,
  status text default 'sent'::text,
  sent_by text default 'bot'::text,
  delivery_status text,
  delivery_error text,
  delivery_updated_at timestamptz,
  primary key (id)
);
--   fk: lead_id -> leads(id) on delete cascade
--   fk: agent_id -> agents(id) on delete cascade

-- ─── properties ──────────────────────────────────────────────────
create table if not exists properties (
  id uuid not null default uuid_generate_v4(),
  created_at timestamptz default now(),
  agent_id uuid,
  title text not null,
  type text not null,
  category text,
  location text,
  city text,
  price numeric(15,2),
  rent_per_month numeric(10,2),
  size_sqft integer,
  bhk text,
  description text,
  features text[],
  photos text[],
  video_url text,
  brochure_url text,
  status text default 'active'::text,
  facing text,
  possession_date date,
  possession_status text,
  deposit numeric(12,2),
  project_website text,
  website_ai_consent boolean default false,
  extra_info text,
  property_media text[] default '{}'::text[],
  primary key (id)
);
--   fk: agent_id -> agents(id) on delete cascade

-- ─── subscription_events ─────────────────────────────────────────
create table if not exists subscription_events (
  id uuid not null default uuid_generate_v4(),
  created_at timestamptz default now(),
  agent_id uuid,
  razorpay_subscription_id text,
  event text,
  payment_id text,
  amount numeric(10,2),
  raw jsonb,
  primary key (id)
);
--   fk: agent_id -> agents(id) on delete cascade

-- ─── superadmins ─────────────────────────────────────────────────
create table if not exists superadmins (
  id uuid not null default gen_random_uuid(),
  auth_user_id uuid not null,
  email text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (id)
);

-- ─── support_chat_logs ───────────────────────────────────────────
create table if not exists support_chat_logs (
  id uuid not null default uuid_generate_v4(),
  created_at timestamptz default now(),
  agent_id uuid,
  ip_address text,
  user_message text,
  assistant_reply text,
  escalated boolean default false,
  turn_count integer,
  helpful boolean,
  feedback_note text,
  primary key (id)
);
--   fk: agent_id -> agents(id) on delete set null

-- ─── support_tickets ─────────────────────────────────────────────
create table if not exists support_tickets (
  id uuid not null default uuid_generate_v4(),
  created_at timestamptz default now(),
  agent_id uuid,
  email text,
  name text,
  subject text not null,
  message text not null,
  status text default 'open'::text,
  source text default 'help_page'::text,
  primary key (id)
);
--   fk: agent_id -> agents(id) on delete set null

-- ─── team_members ────────────────────────────────────────────────
create table if not exists team_members (
  id uuid not null default gen_random_uuid(),
  agent_id uuid not null,
  auth_user_id uuid not null,
  role text not null,
  name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (id)
);
--   fk: agent_id -> agents(id) on delete cascade

-- ─── wa_transactions ─────────────────────────────────────────────
create table if not exists wa_transactions (
  id uuid not null default uuid_generate_v4(),
  created_at timestamptz default now(),
  agent_id uuid,
  type text not null,
  amount numeric(10,4) not null,
  description text,
  balance_after numeric(10,2),
  template_name text,
  lead_id uuid,
  primary key (id)
);
--   fk: agent_id -> agents(id) on delete cascade
--   fk: lead_id -> leads(id) on delete no action


-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE UNIQUE INDEX activity_log_pkey ON public.activity_log USING btree (id);
CREATE INDEX idx_activity_lead_id ON public.activity_log USING btree (lead_id);
CREATE UNIQUE INDEX agents_email_key ON public.agents USING btree (email);
CREATE UNIQUE INDEX agents_pkey ON public.agents USING btree (id);
CREATE INDEX idx_agents_msg91_number ON public.agents USING btree (msg91_integrated_number);
CREATE INDEX idx_agents_rzp_subscription ON public.agents USING btree (razorpay_subscription_id);
CREATE UNIQUE INDEX appointments_lead_upcoming_uniq ON public.appointments USING btree (lead_id) WHERE (status = 'upcoming'::text);
CREATE UNIQUE INDEX appointments_pkey ON public.appointments USING btree (id);
CREATE INDEX idx_appointments_agent_id ON public.appointments USING btree (agent_id);
CREATE INDEX idx_appointments_scheduled_at ON public.appointments USING btree (scheduled_at);
CREATE UNIQUE INDEX demo_rate_limits_pkey ON public.demo_rate_limits USING btree (ip_address);
CREATE INDEX idx_knowledge_gaps_agent_status ON public.knowledge_gaps USING btree (agent_id, status);
CREATE UNIQUE INDEX knowledge_gaps_pkey ON public.knowledge_gaps USING btree (id);
CREATE INDEX idx_leads_agent_id ON public.leads USING btree (agent_id);
CREATE INDEX idx_leads_phone ON public.leads USING btree (phone);
CREATE INDEX idx_leads_status ON public.leads USING btree (status);
CREATE INDEX idx_leads_temperature ON public.leads USING btree (temperature);
CREATE UNIQUE INDEX leads_agent_phone_unique ON public.leads USING btree (agent_id, phone);
CREATE INDEX leads_nurture_scan_idx ON public.leads USING btree (agent_id, bot_paused, status, last_message_at);
CREATE UNIQUE INDEX leads_pkey ON public.leads USING btree (id);
CREATE INDEX idx_messages_agent_id ON public.messages USING btree (agent_id);
CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at);
CREATE INDEX idx_messages_lead_id ON public.messages USING btree (lead_id);
CREATE UNIQUE INDEX messages_inbound_wa_message_id_uniq ON public.messages USING btree (wa_message_id) WHERE ((wa_message_id IS NOT NULL) AND (direction = 'inbound'::text));
CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id);
CREATE INDEX messages_wa_message_id_idx ON public.messages USING btree (wa_message_id) WHERE (wa_message_id IS NOT NULL);
CREATE INDEX idx_properties_agent_id ON public.properties USING btree (agent_id);
CREATE INDEX idx_properties_agent_status ON public.properties USING btree (agent_id, status);
CREATE INDEX idx_properties_status ON public.properties USING btree (status);
CREATE UNIQUE INDEX properties_pkey ON public.properties USING btree (id);
CREATE INDEX idx_sub_events_agent ON public.subscription_events USING btree (agent_id);
CREATE UNIQUE INDEX subscription_events_pkey ON public.subscription_events USING btree (id);
CREATE UNIQUE INDEX superadmins_email_key ON public.superadmins USING btree (email);
CREATE UNIQUE INDEX superadmins_pkey ON public.superadmins USING btree (id);
CREATE INDEX idx_support_logs_agent ON public.support_chat_logs USING btree (agent_id);
CREATE INDEX idx_support_logs_created ON public.support_chat_logs USING btree (created_at DESC);
CREATE INDEX idx_support_logs_escalated ON public.support_chat_logs USING btree (escalated);
CREATE UNIQUE INDEX support_chat_logs_pkey ON public.support_chat_logs USING btree (id);
CREATE UNIQUE INDEX support_tickets_pkey ON public.support_tickets USING btree (id);
CREATE UNIQUE INDEX team_members_pkey ON public.team_members USING btree (id);
CREATE UNIQUE INDEX wa_transactions_pkey ON public.wa_transactions USING btree (id);


-- ============================================================================
-- ROW LEVEL SECURITY (enabled?) + POLICIES
-- ============================================================================
-- RLS ON   activity_log
-- RLS ON   agents
-- RLS ON   appointments
-- RLS ON   demo_rate_limits
-- RLS ON   knowledge_gaps
-- RLS ON   leads
-- RLS ON   messages
-- RLS ON   properties
-- RLS ON   subscription_events
-- RLS ON   superadmins
-- RLS ON   support_chat_logs
-- RLS ON   support_tickets
-- RLS ON   team_members
-- RLS ON   wa_transactions

-- policy agents.Authenticated users can create workspaces [INSERT] roles={authenticated}
--    USING -  WITH CHECK true
-- policy agents.Owners can update workspace [UPDATE] roles={authenticated}
--    USING (id IN ( SELECT team_members.agent_id
   FROM team_members
  WHERE ((team_members.auth_user_id = auth.uid()) AND (team_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))  WITH CHECK -
-- policy agents.Superadmins read all agents [SELECT] roles={public}
--    USING is_superadmin()  WITH CHECK -
-- policy agents.Users can create new agents [INSERT] roles={public}
--    USING -  WITH CHECK true
-- policy agents.Users can view their own agents via email [SELECT] roles={authenticated}
--    USING (email = (auth.jwt() ->> 'email'::text))  WITH CHECK -
-- policy agents.Users can view their own workspace [SELECT] roles={authenticated}
--    USING (id IN ( SELECT team_members.agent_id
   FROM team_members
  WHERE (team_members.auth_user_id = auth.uid())))  WITH CHECK -
-- policy appointments.tenant_all_appointments [ALL] roles={authenticated}
--    USING (agent_id IN ( SELECT team_members.agent_id
   FROM team_members
  WHERE (team_members.auth_user_id = auth.uid())))  WITH CHECK (agent_id IN ( SELECT team_members.agent_id
   FROM team_members
  WHERE (team_members.auth_user_id = auth.uid())))
-- policy leads.tenant_all_leads [ALL] roles={authenticated}
--    USING (agent_id IN ( SELECT team_members.agent_id
   FROM team_members
  WHERE (team_members.auth_user_id = auth.uid())))  WITH CHECK (agent_id IN ( SELECT team_members.agent_id
   FROM team_members
  WHERE (team_members.auth_user_id = auth.uid())))
-- policy messages.tenant_all_messages [ALL] roles={authenticated}
--    USING (agent_id IN ( SELECT team_members.agent_id
   FROM team_members
  WHERE (team_members.auth_user_id = auth.uid())))  WITH CHECK (agent_id IN ( SELECT team_members.agent_id
   FROM team_members
  WHERE (team_members.auth_user_id = auth.uid())))
-- policy properties.tenant_all_properties [ALL] roles={authenticated}
--    USING (agent_id IN ( SELECT team_members.agent_id
   FROM team_members
  WHERE (team_members.auth_user_id = auth.uid())))  WITH CHECK (agent_id IN ( SELECT team_members.agent_id
   FROM team_members
  WHERE (team_members.auth_user_id = auth.uid())))
-- policy superadmins.Read own superadmin row [SELECT] roles={public}
--    USING (auth_user_id = auth.uid())  WITH CHECK -
-- policy support_tickets.tenant_all_support_tickets [ALL] roles={authenticated}
--    USING (agent_id IN ( SELECT team_members.agent_id
   FROM team_members
  WHERE (team_members.auth_user_id = auth.uid())))  WITH CHECK (agent_id IN ( SELECT team_members.agent_id
   FROM team_members
  WHERE (team_members.auth_user_id = auth.uid())))
-- policy team_members.Delete team members safely [DELETE] roles={authenticated}
--    USING is_agency_admin(agent_id)  WITH CHECK -
-- policy team_members.Insert team members safely [INSERT] roles={authenticated}
--    USING -  WITH CHECK (auth_user_id = auth.uid())
-- policy team_members.Manage team members safely [UPDATE] roles={authenticated}
--    USING is_agency_admin(agent_id)  WITH CHECK -
-- policy team_members.Users can insert their own team_member record [INSERT] roles={public}
--    USING -  WITH CHECK (auth.uid() = auth_user_id)
-- policy team_members.View team members safely [SELECT] roles={authenticated}
--    USING ((auth_user_id = auth.uid()) OR (agent_id IN ( SELECT get_user_agent_ids() AS get_user_agent_ids)))  WITH CHECK -
-- policy team_members.service_role_select [SELECT] roles={service_role}
--    USING true  WITH CHECK -
-- policy team_members.users_read_own [SELECT] roles={authenticated}
--    USING (auth_user_id = auth.uid())  WITH CHECK -
