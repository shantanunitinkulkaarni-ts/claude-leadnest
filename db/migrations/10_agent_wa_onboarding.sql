-- ============================================================================
-- MIGRATION 10: per-agent WhatsApp onboarding fields (Embedded Signup)
-- When an agent self-connects via Embedded Signup we store their WhatsApp
-- Business Account id and the two-step PIN we set at registration (so the
-- number can be re-registered later without guessing the PIN).
-- ============================================================================

ALTER TABLE agents ADD COLUMN IF NOT EXISTS wa_business_id text; -- Meta WABA id (client's WhatsApp Business Account)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS wa_pin text;         -- two-step PIN set at register (server-managed)
