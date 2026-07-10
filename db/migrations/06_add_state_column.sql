-- Phase 2: Add state column for lead state machine (zero-downtime)
-- 
-- This migration adds the new `state` column alongside the existing `conversation_stage`.
-- During the dual-write period (Phase 2C), both columns are written.
-- Once read cutover is verified (Phase 2D), `conversation_stage` is retired (Phase 2F).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS state_updated_at TIMESTAMPTZ;

-- Index for efficient filtering by state
CREATE INDEX IF NOT EXISTS idx_leads_state ON leads (state);
CREATE INDEX IF NOT EXISTS idx_leads_state_updated ON leads (state_updated_at);

-- Add check constraint to ensure state is one of the valid values
-- (This prevents accidental bad data)
ALTER TABLE leads
  ADD CONSTRAINT check_lead_state
    CHECK (
      state IS NULL OR state IN (
        'NEW',
        'IN_CONVERSATION',
        'QUALIFYING',
        'QUALIFIED',
        'PROPERTY_SHOWN',
        'INTERESTED',
        'VISIT_REQUESTED',
        'AWAITING_BROKER_APPROVAL',
        'VISIT_CONFIRMED',
        'VISIT_COMPLETED',
        'CONVERTED',
        'INACTIVE_24H',
        'INACTIVE_3D',
        'INACTIVE_7D',
        'DORMANT',
        'RESURRECTED',
        'LOST'
      )
    );
