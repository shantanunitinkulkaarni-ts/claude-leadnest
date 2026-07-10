-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 1C: Appointment confirmation loop — pending_appointment_* columns
-- Authored: 2026-06-16 | CTO Master Plan — Phase 1C
--
-- Run in Supabase SQL editor (copy-paste full file, run once).
-- Safe to re-run: all DDL uses IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS pending_appointment_time timestamptz,
  ADD COLUMN IF NOT EXISTS pending_appointment_property_id uuid,
  ADD COLUMN IF NOT EXISTS pending_appointment_set_at timestamptz;
