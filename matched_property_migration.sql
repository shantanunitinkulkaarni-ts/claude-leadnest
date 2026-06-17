-- Add matched_property_id to leads if it doesn't exist
-- This stores which property the bot last recommended, so follow-up photo
-- requests and nudges can reference the right property.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS matched_property_id uuid REFERENCES properties(id);
