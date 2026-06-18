-- ============================================================================
-- 01_data_safety.sql — close the data-exposure gaps found in the live-DB audit
-- ============================================================================
-- Idempotent. Safe to re-run. The app connects as service_role (bypasses RLS),
-- so none of this changes app behaviour — it only closes direct anon/authenticated
-- (public Supabase API) access paths.
--
-- AUDIT FINDINGS (live prod, introspected read-only):
--   🔴 waitlist        : RLS OFF *and* anon+authenticated had FULL CRUD grants.
--                        The anon key ships in client JS → anyone on the internet
--                        could read/insert/update/DELETE every waitlist row
--                        (name/email/phone). Dead feature (the /waitlist route was
--                        removed; the page only redirected to /onboarding).
--   🟠 support_tickets : RLS OFF. Not currently readable via API (anon/authenticated
--                        lack a SELECT grant) but inconsistent — enable for defence
--                        in depth.
-- Everything else was clean: 0 orphan rows; FKs present; service_role has full
-- grants on every table; core tenant tables (leads/messages/appointments/
-- properties) already have RLS on + tenant_all_* policies.
-- ============================================================================

-- ── waitlist: DROP the table entirely (founder decision) ─────────────────────
-- The waitlist feature is gone (route + page removed). Dropping the table closes
-- the public-exposure hole for good — no table, nothing to expose.
drop table if exists waitlist;

-- ── support_tickets: enable RLS + tenant-scoped policy (defence in depth) ────
alter table support_tickets enable row level security;
drop policy if exists tenant_all_support_tickets on support_tickets;
create policy tenant_all_support_tickets on support_tickets for all to authenticated
  using (agent_id in (select agent_id from team_members where auth_user_id = auth.uid()))
  with check (agent_id in (select agent_id from team_members where auth_user_id = auth.uid()));
-- (Public ticket creation goes through /api/support-ticket using service_role, so
--  this policy does not block the help-page form.)

-- ============================================================================
-- NOT DONE HERE — needs founder sign-off (per plan, no row deletion in this pass)
-- ============================================================================
-- 1) 2 duplicate `messages` rows share a wa_message_id (likely outbound; the
--    inbound dedup unique index doesn't cover them). Harmless but untidy. To
--    clean AFTER review (keeps the earliest row of each duplicate set):
--
--      -- preview first:
--      -- select wa_message_id, count(*) from messages
--      --   where wa_message_id is not null group by wa_message_id having count(*)>1;
--      --
--      -- delete duplicates, keep earliest:
--      -- delete from messages m using messages keep
--      --   where m.wa_message_id = keep.wa_message_id
--      --     and m.wa_message_id is not null
--      --     and m.created_at > keep.created_at;
--
-- 2) `agents` has 6 overlapping RLS policies accreted from old migrations
--    (incl. a public INSERT and a public SELECT policy). This is NOT a live hole
--    — anon has NO DML grant on agents, so the policies can't be exploited — but
--    it is confusing. Consolidating them safely requires tracing every
--    client-side (authenticated) read of `agents` first (login/onboarding), so it
--    is deferred to its own pass rather than risked here.
