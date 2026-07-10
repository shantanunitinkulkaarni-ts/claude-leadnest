-- ─────────────────────────────────────────────────────────────────────────────
-- LeadNest — Test Properties Seed Script
-- Run this AFTER seed_test_agent.sql
-- Replace AGENT_UUID_HERE with the actual UUID from the agents table
-- ─────────────────────────────────────────────────────────────────────────────

-- First, get the agent UUID:
-- SELECT id FROM agents WHERE email = 'shantanu@leadnest.in';

DO $$
DECLARE
  v_agent_id UUID;
BEGIN
  SELECT id INTO v_agent_id FROM agents WHERE email = 'shantanu@leadnest.in';

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Agent not found. Run seed_test_agent.sql first.';
  END IF;

  INSERT INTO properties (agent_id, title, type, category, location, city, price, size_sqft, bhk, description, features, status)
  VALUES
  (
    v_agent_id,
    'Spacious 2BHK in Baner',
    'sale',
    'apartment',
    'Baner, Pune',
    'Pune',
    8500000,   -- ₹85L
    1100,
    '2BHK',
    'Beautiful east-facing 2BHK apartment on the 4th floor in the heart of Baner. Brand new building with all modern amenities. 5 minutes from Baner road, close to schools and hospitals.',
    ARRAY['covered_parking', 'gym', 'security', 'power_backup', 'garden'],
    'active'
  ),
  (
    v_agent_id,
    'Premium 3BHK in Wakad',
    'sale',
    'apartment',
    'Wakad, Pune',
    'Pune',
    12000000,  -- ₹1.2Cr
    1550,
    '3BHK',
    'Luxurious 3BHK flat with stunning city view. Semi-furnished with modular kitchen. Walking distance from Hinjewadi IT Park — perfect for working professionals and families.',
    ARRAY['covered_parking', 'swimming_pool', 'gym', 'clubhouse', 'security', 'power_backup'],
    'active'
  ),
  (
    v_agent_id,
    '1BHK Rental — Hinjewadi Phase 1',
    'rental',
    'apartment',
    'Hinjewadi Phase 1, Pune',
    'Pune',
    NULL,
    620,
    '1BHK',
    'Fully furnished 1BHK flat available immediately. Perfect for IT professionals. All bills included except electricity. Attached bathroom, kitchenette, high speed internet connection possible.',
    ARRAY['semi_furnished', 'parking', 'security'],
    'active'
  );

  RAISE NOTICE 'Properties inserted successfully for agent %', v_agent_id;
END $$;

-- Verify:
SELECT p.id, p.title, p.type, p.bhk, p.location, p.price, p.status
FROM properties p
JOIN agents a ON a.id = p.agent_id
WHERE a.email = 'shantanu@leadnest.in';
