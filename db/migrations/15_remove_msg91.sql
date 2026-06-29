-- Remove the legacy MSG91 routing column. We are Meta Cloud API direct (Tech
-- Provider); no code reads this column anymore. APPLY ONLY AFTER the code that
-- drops the column read is deployed (PR "remove MSG91 completely"), or a still-
-- running old build that selects this column will error.
DROP INDEX IF EXISTS public.idx_agents_msg91_number;
ALTER TABLE public.agents DROP COLUMN IF EXISTS msg91_integrated_number;
