# Database — source of truth

`db/schema.sql` is the **single source of truth** for the Convorian database. It is
**generated from the live Supabase production database** by read-only introspection, so it
reflects what *actually* exists — not what some old file hoped existed.

## The rules

1. **Never hand-edit `db/schema.sql`.** It is generated. Editing it by hand makes it lie again.
2. **To change the schema**, add ONE numbered migration in `db/migrations/`
   (e.g. `01_data_safety.sql`), make it **idempotent** (safe to re-run: `if exists` /
   `if not exists`, `drop policy if exists` before `create policy`).
3. **Apply the migration to the live DB** (Supabase SQL editor, or psql with `DATABASE_URL`).
4. **Regenerate `db/schema.sql`** so it matches reality again (see below).
5. Commit the migration **and** the regenerated schema together.

## Regenerating `db/schema.sql`

It is produced from the live DB via `information_schema` / `pg_catalog` (no `pg_dump` needed).
A throwaway generator script is used (`pg` driver, `DATABASE_URL` from `.env`); it reads only —
it never writes to the DB. If you need it again, recreate a small Node script that selects from
`information_schema.columns`, `pg_indexes`, `pg_class.relrowsecurity`, and `pg_policies`, and
writes the formatted output to `db/schema.sql`.

## History

The pre-existing `*_migration.sql` / `*_fix.sql` files at the repo root are the historical,
hand-applied migrations from before this folder existed. They are kept for the record but are
**not** the source of truth — `db/schema.sql` is. New changes go through `db/migrations/`.
`lib/schema.sql` is a legacy v1 snapshot kept only so old imports don't break; it points here.

## Known facts (captured at first introspection)

- Tables (14): agents, leads, messages, properties, appointments, wa_transactions,
  activity_log, knowledge_gaps, subscription_events, support_chat_logs, support_tickets,
  team_members, superadmins, demo_rate_limits. (The legacy `waitlist` table was
  dropped in `db/migrations/01_data_safety.sql` — feature removed.)
- `service_role` has full privileges on every table (the server runs as `service_role`, which
  bypasses RLS — so RLS is defense-in-depth, and the **real** tenant isolation is the
  `requireAgentAccess`/`requireLeadAccess` guards in `lib/apiAuth.ts`).
- Tenant tables (leads/messages/appointments/properties) have RLS on + `tenant_all_*` policies.
- Lead de-dup is enforced by a unique index `leads_agent_phone_unique (agent_id, phone)`;
  inbound message de-dup by partial unique `messages_inbound_wa_message_id_uniq`.
