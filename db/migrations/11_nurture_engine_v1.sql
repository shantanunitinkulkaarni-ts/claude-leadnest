-- ============================================================================
-- MIGRATION 11: Nurture Engine V1 — the foundation
-- Per-lead nurture state + engagement signals + a SILENT personality profile,
-- plus a nurture_events learning log that records every move and its outcome.
-- The learning log is the data moat — it begins accumulating from day one, even
-- before auto-learning is built. All additive; the live bot is untouched.
-- ============================================================================

-- ── Per-lead nurture fields ────────────────────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS nurture_state text;          -- new|engaged|shown|visit_booked|no_show|dormant|won|lost|stopped
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_tier text;            -- consented | cold
ALTER TABLE leads ADD COLUMN IF NOT EXISTS personality jsonb DEFAULT '{}'::jsonb;  -- silent inferred profile (values_vastu, evening_person, investor…)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS engagement jsonb DEFAULT '{}'::jsonb;    -- signals: avg_response_secs, last_reply_len, replies, nudges_sent…
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz;   -- last time the lead messaged us
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_outbound_at timestamptz;  -- last time we messaged the lead
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_nurture_at timestamptz;   -- when the scheduler should next consider this lead
ALTER TABLE leads ADD COLUMN IF NOT EXISTS nurture_paused boolean DEFAULT false; -- stopped / opted out of nurture

-- ── Learning log: every nurture move + signals + (later) outcome ────────────
CREATE TABLE IF NOT EXISTS nurture_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  agent_id uuid,
  state text,        -- lead nurture_state when the move was chosen
  move text,         -- playbook move / approach used (e.g. no_show_warm_checkin)
  channel text,      -- free_text | template
  signals jsonb,     -- snapshot of signals at decision time (for learning)
  outcome text,      -- filled later: replied | booked | no_response | stopped | won | lost
  meta jsonb
);
CREATE INDEX IF NOT EXISTS nurture_events_lead_idx ON nurture_events(lead_id);
CREATE INDEX IF NOT EXISTS nurture_events_agent_idx ON nurture_events(agent_id);
CREATE INDEX IF NOT EXISTS leads_next_nurture_idx ON leads(next_nurture_at) WHERE next_nurture_at IS NOT NULL;

-- ── Security: same second-wall posture as the rest of the schema ────────────
ALTER TABLE nurture_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_all_nurture_events ON nurture_events;
CREATE POLICY tenant_all_nurture_events ON nurture_events
  FOR ALL TO authenticated
  USING (agent_id IN (SELECT agent_id FROM team_members WHERE auth_user_id = auth.uid()))
  WITH CHECK (agent_id IN (SELECT agent_id FROM team_members WHERE auth_user_id = auth.uid()));
GRANT ALL ON nurture_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON nurture_events TO authenticated;
