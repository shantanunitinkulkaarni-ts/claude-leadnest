-- Enterprise RBAC Schema Migration
-- Run this in your Supabase Dashboard -> SQL Editor -> New Query

BEGIN;

-- 1. Create team_members table
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'agent')),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create superadmins table
CREATE TABLE IF NOT EXISTS public.superadmins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Update leads table to support assignment
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.team_members(id) ON DELETE SET NULL;

-- 4. Enable RLS on new tables
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.superadmins ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies for team_members
-- A team member can read all members in their own agency (agent_id)
CREATE POLICY "Team members can view their own agency members"
ON public.team_members FOR SELECT
USING (
    agent_id IN (
        SELECT agent_id FROM public.team_members WHERE auth_user_id = auth.uid()
    )
);

-- Only owners/admins can insert/update team members
CREATE POLICY "Owners and admins can manage team members"
ON public.team_members FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.team_members 
        WHERE auth_user_id = auth.uid() AND role IN ('owner', 'admin') AND agent_id = team_members.agent_id
    )
);

-- A user can always view their own membership record
CREATE POLICY "Users can view own membership"
ON public.team_members FOR SELECT
USING (auth_user_id = auth.uid());

COMMIT;
