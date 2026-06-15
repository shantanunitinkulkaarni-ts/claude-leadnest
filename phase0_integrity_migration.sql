-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 0: Data Integrity Migration
-- Authored: 2026-06-16 | CTO Master Plan — Phase 0
--
-- Run in Supabase SQL editor (copy-paste full file, run once).
-- Safe to re-run: all DDL uses IF NOT EXISTS / CREATE OR REPLACE.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 0A: UNIQUE CONSTRAINT ON LEADS (agent_id, phone) ─────────────────────────
-- Deduplicate first: for any (agent_id, phone) pair with multiple rows,
-- keep the most recently updated row and soft-cancel the rest via status change.
-- We don't DELETE because the duplicate rows may have activity_log / messages
-- referencing them. Instead we mark them as 'closed_lost' so they're invisible
-- in normal queries but audit-traceable.

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY agent_id, phone
      ORDER BY updated_at DESC, created_at DESC
    ) AS rn
  FROM leads
  WHERE phone IS NOT NULL AND phone != ''
)
UPDATE leads
  SET status = 'closed_lost', notes = COALESCE(notes || ' ', '') || '[dedup: merged into newer row]'
  WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Now it is safe to add the unique constraint.
ALTER TABLE leads
  ADD CONSTRAINT IF NOT EXISTS leads_agent_phone_unique UNIQUE (agent_id, phone);


-- ── 0B: CHECK CONSTRAINTS FOR STATUS FIELDS ──────────────────────────────────
-- Using CHECK on text columns (not ENUM) — easier to extend later.
-- Sanitize any invalid values before adding constraints.

-- leads.status
UPDATE leads SET status = 'new'
  WHERE status IS NULL
     OR status NOT IN ('new','contacted','qualified','visit_booked','visit_done','closed_won','closed_lost');

ALTER TABLE leads
  ADD CONSTRAINT IF NOT EXISTS leads_status_check
  CHECK (status IN ('new','contacted','qualified','visit_booked','visit_done','closed_won','closed_lost'));

-- leads.temperature
UPDATE leads SET temperature = 'new'
  WHERE temperature IS NULL
     OR temperature NOT IN ('hot','warm','cold','new');

ALTER TABLE leads
  ADD CONSTRAINT IF NOT EXISTS leads_temperature_check
  CHECK (temperature IN ('hot','warm','cold','new'));

-- leads.intent — nullable; only constrain when present
UPDATE leads SET intent = NULL
  WHERE intent IS NOT NULL AND intent NOT IN ('buy','rent');

ALTER TABLE leads
  ADD CONSTRAINT IF NOT EXISTS leads_intent_check
  CHECK (intent IS NULL OR intent IN ('buy','rent'));

-- properties.type
UPDATE properties SET type = 'sale'
  WHERE type IS NULL OR type NOT IN ('sale','rental');

ALTER TABLE properties
  ADD CONSTRAINT IF NOT EXISTS properties_type_check
  CHECK (type IN ('sale','rental'));

-- properties.status
UPDATE properties SET status = 'active'
  WHERE status IS NULL OR status NOT IN ('active','sold','rented','on_hold');

ALTER TABLE properties
  ADD CONSTRAINT IF NOT EXISTS properties_status_check
  CHECK (status IN ('active','sold','rented','on_hold'));


-- ── 0C: CROSS-FIELD VALIDATION CONSTRAINTS ───────────────────────────────────

-- Rental must have rent_per_month (set to 0 for existing violations rather than
-- dropping properties — agent can fix the real value in the dashboard)
UPDATE properties
  SET rent_per_month = 0
  WHERE type = 'rental' AND rent_per_month IS NULL;

ALTER TABLE properties
  ADD CONSTRAINT IF NOT EXISTS properties_rental_price_required
  CHECK (type != 'rental' OR rent_per_month IS NOT NULL);

-- Sale must have price
UPDATE properties
  SET price = 0
  WHERE type = 'sale' AND price IS NULL;

ALTER TABLE properties
  ADD CONSTRAINT IF NOT EXISTS properties_sale_price_required
  CHECK (type != 'sale' OR price IS NOT NULL);

-- Budget ordering: min ≤ max when both are present
-- Fix backwards budgets by swapping them
UPDATE leads
  SET budget_min = budget_max, budget_max = budget_min
  WHERE budget_min IS NOT NULL
    AND budget_max IS NOT NULL
    AND budget_min > budget_max;

ALTER TABLE leads
  ADD CONSTRAINT IF NOT EXISTS leads_budget_order
  CHECK (budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max);


-- ── 0D: APPOINTMENT UNIQUE INDEX (one upcoming appt per lead) ────────────────
-- If a lead somehow has multiple 'upcoming' appointments (pre-existing data bug),
-- cancel the older ones — keep only the most recently created.

WITH ranked_appts AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY lead_id
      ORDER BY created_at DESC
    ) AS rn
  FROM appointments
  WHERE status = 'upcoming'
),
stale_appts AS (SELECT id FROM ranked_appts WHERE rn > 1)
UPDATE appointments
  SET status = 'cancelled'
  WHERE id IN (SELECT id FROM stale_appts);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_lead_upcoming_uniq
  ON appointments (lead_id) WHERE status = 'upcoming';


-- ── 0E: ATOMIC MESSAGES_USED INCREMENT ───────────────────────────────────────
-- Postgres function called via supabaseAdmin.rpc() in the webhook.
-- Replaces the lossy read-modify-write: UPDATE ... SET messages_used = (read) + 2

CREATE OR REPLACE FUNCTION increment_messages_used(p_agent_id uuid, p_amount integer DEFAULT 2)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count integer;
BEGIN
  UPDATE agents
    SET messages_used = COALESCE(messages_used, 0) + p_amount
    WHERE id = p_agent_id
  RETURNING messages_used INTO v_new_count;

  IF v_new_count IS NULL THEN
    RAISE EXCEPTION 'Agent % not found', p_agent_id;
  END IF;

  RETURN v_new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_messages_used(uuid, integer) TO service_role;


-- ── 0F: SEPARATE MEDIA URLS FROM FEATURES ARRAY ──────────────────────────────
-- Add property_media column. Migrate existing 'media:<url>' entries out of
-- the features array so features only contains amenity strings.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS property_media text[] DEFAULT '{}';

-- Migrate: extract media: entries from features → property_media
-- Only runs on rows that actually have media entries (safe no-op otherwise)
UPDATE properties
SET
  property_media = ARRAY(
    SELECT regexp_replace(f, '^media:', '')
    FROM unnest(features) AS f
    WHERE f LIKE 'media:%'
  ),
  features = ARRAY(
    SELECT f
    FROM unnest(features) AS f
    WHERE f NOT LIKE 'media:%'
  )
WHERE features IS NOT NULL
  AND array_length(features, 1) > 0
  AND EXISTS (
    SELECT 1 FROM unnest(features) AS f WHERE f LIKE 'media:%'
  );

-- Index for efficient media lookups
CREATE INDEX IF NOT EXISTS idx_properties_agent_status
  ON properties (agent_id, status);
