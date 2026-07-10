-- Webhook dedup hardening (June 12, 2026)
-- Meta/MSG91 retry webhook deliveries; without a DB-level guarantee, two
-- concurrent deliveries of the same message can both pass the app-level
-- "already processed?" check and each send a reply (the double-response bug).
-- A partial unique index on inbound wa_message_id makes the second insert fail
-- with 23505, which the webhook treats as "duplicate — do not reply".

-- 1) Clean up any existing duplicate inbound rows (keep the earliest).
DELETE FROM messages m
USING messages keep
WHERE m.wa_message_id IS NOT NULL
  AND m.direction = 'inbound'
  AND keep.direction = 'inbound'
  AND keep.wa_message_id = m.wa_message_id
  AND keep.created_at < m.created_at;

-- 2) Enforce uniqueness going forward (inbound only — outbound rows are
--    inserted without an id and stamped later; MSG91 outbound may use a
--    placeholder id, so outbound is deliberately excluded).
CREATE UNIQUE INDEX IF NOT EXISTS messages_inbound_wa_message_id_uniq
  ON messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL AND direction = 'inbound';
