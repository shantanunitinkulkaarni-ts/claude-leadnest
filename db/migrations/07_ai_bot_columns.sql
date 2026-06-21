-- ============================================================================
-- MIGRATION 07: AI Bot columns
-- Adds columns needed for the new AI-first bot engine.
-- Run once against the live Supabase DB.
-- ============================================================================

-- Chat history: last 5-6 messages so AI always has context
ALTER TABLE leads ADD COLUMN IF NOT EXISTS chat_history jsonb DEFAULT '[]'::jsonb;

-- Bot stage: where in the conversation is this lead
-- Values: 'greeting' | 'language' | 'name' | 'intent' | 'qualifying' | 'property_shown' | 'visit_requested' | 'confirmed' | 'handover'
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bot_stage text DEFAULT 'greeting';

-- BHK preference (e.g. '1BHK', '2BHK', '3BHK')
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bhk text;

-- Email address (collected at site visit stage)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email text;

-- Square footage preference (optional)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sqft_preference integer;

-- GRANTS (service role needs full access — same pattern as other tables)
GRANT SELECT, INSERT, UPDATE ON leads TO service_role;
