-- Fix superadmin recognition server-side (June 2026).
-- Root cause: grant_privs.sql granted public.superadmins to `authenticated` but
-- NOT to `service_role`. The server-side auth context (lib/apiAuth.ts
-- getAuthContext) queries superadmins via supabaseAdmin (the service_role key),
-- which therefore fails with "permission denied for table superadmins". The
-- error is swallowed, so isSuperadmin is ALWAYS false on the server — breaking
-- superadmin-only API endpoints and admin impersonation of other agents' data.
--
-- Fix: grant the table to service_role (RLS is bypassed by service_role anyway,
-- so no policy change is needed). Idempotent / safe to re-run.

GRANT ALL ON public.superadmins TO service_role;
