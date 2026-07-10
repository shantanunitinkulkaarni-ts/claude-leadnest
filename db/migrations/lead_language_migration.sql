-- Capture each lead's chat language so template re-engagement picks the right
-- language variant (Hindi vs Marathi can't be told apart from Devanagari script
-- alone — the engine knows, so it tags it). June 13, 2026. Idempotent.
alter table leads add column if not exists language text default 'en'; -- en | hi | mr
