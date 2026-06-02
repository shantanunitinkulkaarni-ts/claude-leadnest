-- ─────────────────────────────────────────────────────────────────────────────
-- LeadNest — Test Agent Seed Script
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- After running, copy the UUID from the result and set it as TWILIO_TEST_AGENT_ID in .env
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO agents (
  email,
  name,
  phone,
  agency_name,
  city,
  state,
  areas,
  property_types,
  bot_tone,
  languages,
  office_open,
  office_close,
  bot_active,
  window_keepalive,
  plan,
  plan_status,
  messages_used,
  messages_limit,
  wa_balance,
  wa_phone_number_id,
  wa_access_token,
  wa_verified
)
VALUES (
  'shantanu@leadnest.in',
  'Shantanu Kulkaarni',
  '+919999999999',
  'LeadNest Test Agency',
  'Pune',
  'Maharashtra',
  ARRAY['Baner', 'Wakad', 'Hinjewadi', 'Kharadi', 'Viman Nagar'],
  ARRAY['residential_sale', 'residential_rental', 'commercial_sale'],
  'friendly',
  ARRAY['english', 'hindi'],
  '09:00',
  '20:00',
  true,   -- bot_active
  true,   -- window_keepalive
  'monthly',
  'active',
  0,
  5000,
  100.00, -- ₹100 starting WhatsApp balance
  'twilio_sandbox',    -- wa_phone_number_id (used as placeholder for Twilio)
  'twilio_sandbox',    -- wa_access_token (used as placeholder for Twilio)
  true                 -- wa_verified = true so bot runs
)
ON CONFLICT (email) DO UPDATE SET
  bot_active = true,
  wa_verified = true,
  plan_status = 'active'
RETURNING id, email, name, agency_name, bot_active;

-- After running:
-- 1. Copy the UUID from the "id" column in results
-- 2. Open c:\LN\claude-leadnest\.env
-- 3. Replace REPLACE_WITH_AGENT_UUID_FROM_SUPABASE with that UUID
-- 4. Restart the dev server: npm run dev
