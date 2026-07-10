-- Fix Foreign Key constraint RLS error during Onboarding

-- When inserting into team_members, Postgres checks the foreign key on agents(id).
-- The user needs SELECT access to the agent they just created. Since they aren't in team_members yet,
-- the previous SELECT policy on agents blocks them from seeing it!

-- Allow users to view agents that match their verified email
CREATE POLICY "Users can view their own agents via email" ON public.agents
FOR SELECT TO authenticated
USING (email = (auth.jwt() ->> 'email'));

-- Also, just to be absolutely certain the team_members insert policy is bulletproof:
DROP POLICY IF EXISTS "Insert team members safely" ON public.team_members;
CREATE POLICY "Insert team members safely" 
ON public.team_members FOR INSERT TO authenticated
WITH CHECK (
  auth_user_id = auth.uid()
);
