-- 04_add_conversation_stage.sql
-- Adds the conversation_stage column to the leads table.
-- This column tracks the lead's current position in the bot's if-else state machine.
-- It was referenced in code but never created, causing every update containing it
-- to fail with PGRST204 and the entire payload to be rejected.

alter table leads
  add column if not exists conversation_stage text;

-- Backfill existing leads: set to 'new' where NULL
update leads
  set conversation_stage = 'new'
  where conversation_stage is null;