-- ─────────────────────────────────────────────────────────────────────────────
-- Lock down workspace creation (closes a tenant-isolation P0).
--
-- BEFORE: onboarding created the `agents` + `team_members` rows from the BROWSER
-- using the anon key, which required permissive INSERT policies. The team_members
-- INSERT policies only checked `auth_user_id = auth.uid()` with NO restriction on
-- `agent_id` — so any authenticated user could insert a team_members row for ANY
-- agent_id and join (take over) another agency's workspace. `requireAgentAccess`
-- trusts team_members, so this leaked another tenant's leads/data.
--
-- AFTER: onboarding posts to POST /api/onboarding/workspace, which creates both
-- rows server-side with the service role, keyed to the verified logged-in user.
-- The service role bypasses RLS, so NO client INSERT policy is needed — we drop
-- the permissive ones below.
--
-- ⚠️ APPLY ONLY AFTER the server route is deployed (onboarding no longer does the
-- client inserts), otherwise signup will fail.
-- ─────────────────────────────────────────────────────────────────────────────

-- team_members: remove both self-insert policies (no agent_id restriction).
DROP POLICY IF EXISTS "Insert team members safely" ON public.team_members;
DROP POLICY IF EXISTS "Users can insert their own team_member record" ON public.team_members;

-- agents: drop the permissive client INSERT policy that let any authed user
-- create an agents row directly from the browser. The exact policy name must be
-- confirmed first (it wasn't captured) — list and drop it:
--
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'agents' AND cmd = 'INSERT';
--   -- then for each permissive client INSERT policy:
--   -- DROP POLICY IF EXISTS "<policyname>" ON public.agents;
--
-- (Workspace creation now happens only via the service-role server route, so no
-- client INSERT policy on agents should remain.)

-- Sanity check after applying — these should return NO client INSERT policies:
--   SELECT tablename, policyname, cmd, with_check
--   FROM pg_policies
--   WHERE tablename IN ('team_members','agents') AND cmd = 'INSERT';
