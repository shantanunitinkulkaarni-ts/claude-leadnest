-- ─────────────────────────────────────────
-- DELIVERY STATUS TRACKING (June 14, 2026)
-- MSG91/Meta accept a send (2xx + requestId) BEFORE Meta actually delivers it.
-- Meta can still reject afterward (bad params, paused template, quality limits,
-- 24h-window) and the message silently never arrives — exactly the "no msg"
-- blind spot. MSG91 posts delivery reports (sent/delivered/read/failed) to a
-- status-callback URL; the handler at /api/webhook/status records them here so
-- failures become visible in the Inbox and in queries.
-- Idempotent. Safe to re-run.
-- ─────────────────────────────────────────

alter table messages add column if not exists delivery_status     text;       -- accepted | sent | delivered | read | failed
alter table messages add column if not exists delivery_error      text;       -- Meta/MSG91 failure reason, when failed
alter table messages add column if not exists delivery_updated_at  timestamptz;

-- Look up the row a delivery report refers to by its provider request/message id.
create index if not exists messages_wa_message_id_idx
  on messages (wa_message_id)
  where wa_message_id is not null;
