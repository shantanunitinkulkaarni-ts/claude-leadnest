alter table appointments
  add column if not exists reminder_sent_at timestamptz;
