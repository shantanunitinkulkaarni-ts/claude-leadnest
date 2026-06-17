-- ══════════════════════════════════════════════════════════════════════════════
-- Ensure the service_role can access EVERY app table (definitive + future-proof)
-- Authored: 2026-06-17
--
-- Root cause of a recurring class of bug: supabaseAdmin (server-side code) uses
-- the Postgres `service_role`. Several tables were created without granting that
-- role access, so server queries failed with "permission denied for table X" —
-- silently, because the errors were swallowed. Confirmed missing on: superadmins,
-- knowledge_gaps, demo_rate_limits, subscription_events (fixed piecemeal as found).
--
-- Instead of chasing tables one by one, grant the whole schema AND set default
-- privileges so any table created later inherits the grant automatically. This
-- kills the entire bug class. Idempotent — safe to re-run.
-- Run in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════════════════════

-- All existing tables + sequences in the public schema.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Future tables/sequences created in this schema inherit the grant, so a new
-- migration can never re-introduce the "permission denied for table X" bug.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
