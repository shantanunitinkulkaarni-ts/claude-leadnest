-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 4D: Knowledge gap training interface
-- Authored: 2026-06-16 | CTO Master Plan — Phase 4D
--
-- When the bot defers ("let me check and get back to you"), the webhook already
-- detects this (lib/intentSignals.ts detectReplyKnowledgeGap) and fires a
-- priority alert. This migration adds a table to also persist the question as
-- a task the agent can answer in the dashboard — and once answered, the answer
-- is injected into future prompts for that agent (lib/knowledgeGaps.ts).
--
-- Run in Supabase SQL editor (copy-paste full file, run once). Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.knowledge_gaps (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  question text not null,
  bot_reply text,
  answer text,
  status text not null default 'pending' check (status in ('pending', 'answered', 'dismissed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_agent_status ON public.knowledge_gaps(agent_id, status);

-- Server-only table (accessed exclusively via API routes using the service
-- role) — same lockdown pattern as rls_lockdown_migration.sql.
ALTER TABLE public.knowledge_gaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_gaps FROM anon, authenticated;
