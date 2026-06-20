-- 06_add_state_column.sql
-- Add leads.state + leads.state_updated_at for the new state machine
-- SAFE: additive migration, no behavior change
-- Founder runs this first (Step A of safe migration)

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS state_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_state ON leads (state);
CREATE INDEX IF NOT EXISTS idx_leads_state_updated ON leads (state_updated_at);
