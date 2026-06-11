-- ─────────────────────────────────────────
-- RLS TENANT POLICIES — defense-in-depth for core data tables
-- leads / messages / appointments / properties had RLS DISABLED in the live DB
-- (schema.sql intended it on; it was evidently turned off during earlier
-- policy-recursion fixes). They are not publicly readable today only because
-- anon/authenticated lack SELECT — fragile. This enables RLS + scopes every
-- row to the owning agency via team_members, so even direct API access is safe.
--
-- The server uses the service_role key (bypasses RLS) so app behaviour is
-- unchanged. Idempotent: drops policies by name before recreating. Safe to re-run.
-- ─────────────────────────────────────────

alter table leads        enable row level security;
alter table messages     enable row level security;
alter table appointments enable row level security;
alter table properties   enable row level security;

-- Helper predicate (inlined per table): the row's agent_id must belong to an
-- agency the current authenticated user is a team member of.
drop policy if exists tenant_all_leads on leads;
create policy tenant_all_leads on leads for all to authenticated
  using (agent_id in (select agent_id from team_members where auth_user_id = auth.uid()))
  with check (agent_id in (select agent_id from team_members where auth_user_id = auth.uid()));

drop policy if exists tenant_all_messages on messages;
create policy tenant_all_messages on messages for all to authenticated
  using (agent_id in (select agent_id from team_members where auth_user_id = auth.uid()))
  with check (agent_id in (select agent_id from team_members where auth_user_id = auth.uid()));

drop policy if exists tenant_all_appointments on appointments;
create policy tenant_all_appointments on appointments for all to authenticated
  using (agent_id in (select agent_id from team_members where auth_user_id = auth.uid()))
  with check (agent_id in (select agent_id from team_members where auth_user_id = auth.uid()));

drop policy if exists tenant_all_properties on properties;
create policy tenant_all_properties on properties for all to authenticated
  using (agent_id in (select agent_id from team_members where auth_user_id = auth.uid()))
  with check (agent_id in (select agent_id from team_members where auth_user_id = auth.uid()));
