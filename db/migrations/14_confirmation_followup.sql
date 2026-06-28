alter table if exists leads
  add column if not exists confirmation_followup_sent_at timestamptz;
