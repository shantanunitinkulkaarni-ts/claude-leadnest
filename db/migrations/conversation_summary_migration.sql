-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 4A: Context summarization for long conversations
-- Authored: 2026-06-16 | CTO Master Plan — Phase 4A
--
-- Run in Supabase SQL editor (copy-paste full file, run once).
-- Safe to re-run: all DDL uses IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS conversation_summary text,
  ADD COLUMN IF NOT EXISTS conversation_summary_message_count integer;
