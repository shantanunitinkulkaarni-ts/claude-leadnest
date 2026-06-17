-- Fix /admin access (June 13, 2026).
-- Root cause: superadmins has RLS ENABLED but NO policies, so the client-side
-- check `select from superadmins where auth_user_id = me` returns 0 rows for
-- everyone → /admin thinks nobody is an admin and redirects to /dashboard.
-- Also: the admin page lists all agencies via the user's session, but agents
-- RLS is tenant-scoped → a superadmin would only see their own agency.
--
-- Idempotent.

-- 1) Let an authenticated user read THEIR OWN superadmin row (and only that).
drop policy if exists "Read own superadmin row" on public.superadmins;
create policy "Read own superadmin row"
  on public.superadmins for select
  using (auth_user_id = auth.uid());

-- 2) SECURITY DEFINER helper so other policies can check superadmin status
--    without tripping RLS or recursion (runs as owner, bypasses RLS).
create or replace function public.is_superadmin()
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select exists (
    select 1 from public.superadmins where auth_user_id = auth.uid()
  );
$$;

-- 3) Superadmins can read ALL agencies (permissive → OR'd with existing
--    tenant policies, so normal users are unaffected).
drop policy if exists "Superadmins read all agents" on public.agents;
create policy "Superadmins read all agents"
  on public.agents for select
  using (public.is_superadmin());
