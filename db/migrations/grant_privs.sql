-- Grant privileges to authenticated role
GRANT ALL ON public.team_members TO authenticated;
GRANT ALL ON public.superadmins TO authenticated;
GRANT ALL ON public.agents TO authenticated;
