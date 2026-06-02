-- Fix infinite recursion in RLS policies

-- 1. Create SECURITY DEFINER functions to bypass RLS during checks
CREATE OR REPLACE FUNCTION public.get_user_agent_ids()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT agent_id FROM team_members WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_agency_admin(target_agent_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members 
    WHERE auth_user_id = auth.uid() AND role IN ('owner', 'admin') AND agent_id = target_agent_id
  );
$$;

-- 2. Drop all recursive policies on team_members
DROP POLICY IF EXISTS "Team members can view their own agency members" ON public.team_members;
DROP POLICY IF EXISTS "Owners and admins can manage team members" ON public.team_members;
DROP POLICY IF EXISTS "Users can view own membership" ON public.team_members;
DROP POLICY IF EXISTS "Users can insert their own team member record" ON public.team_members;

-- 3. Recreate safe non-recursive policies for team_members
-- SELECT: Users can view themselves AND anyone in their agency
CREATE POLICY "View team members safely" 
ON public.team_members FOR SELECT TO authenticated
USING (
  auth_user_id = auth.uid() OR agent_id IN (SELECT public.get_user_agent_ids())
);

-- INSERT: Users can insert their own initial record (for onboarding) OR admins can insert for others
CREATE POLICY "Insert team members safely" 
ON public.team_members FOR INSERT TO authenticated
WITH CHECK (
  auth_user_id = auth.uid() OR public.is_agency_admin(agent_id)
);

-- UPDATE/DELETE: Only owners/admins can modify other team members
CREATE POLICY "Manage team members safely" 
ON public.team_members FOR UPDATE TO authenticated
USING (public.is_agency_admin(agent_id));

CREATE POLICY "Delete team members safely" 
ON public.team_members FOR DELETE TO authenticated
USING (public.is_agency_admin(agent_id));
