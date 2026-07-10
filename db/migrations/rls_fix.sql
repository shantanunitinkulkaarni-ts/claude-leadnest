-- Enable RLS on agents if not already
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to create their own workspace during onboarding
CREATE POLICY "Authenticated users can create workspaces" ON public.agents
FOR INSERT TO authenticated WITH CHECK (true);

-- Allow authenticated users to view their own workspace
CREATE POLICY "Users can view their own workspace" ON public.agents
FOR SELECT TO authenticated
USING (
    id IN (
        SELECT agent_id FROM public.team_members WHERE auth_user_id = auth.uid()
    )
);

-- Allow owners to update their workspace
CREATE POLICY "Owners can update workspace" ON public.agents
FOR UPDATE TO authenticated
USING (
    id IN (
        SELECT agent_id FROM public.team_members WHERE auth_user_id = auth.uid() AND role IN ('owner', 'admin')
    )
);

-- Fix team_members insert policy for onboarding
CREATE POLICY "Users can insert their own team member record" ON public.team_members
FOR INSERT TO authenticated WITH CHECK (auth_user_id = auth.uid());
