-- ============================================
-- KitchenOps: Breaks tracking on clock_logs
-- Run in Supabase SQL Editor
-- ============================================

-- 1) Add breaks JSON column to clock_logs
--    Stores array of { start: ISO, end: ISO | null }
ALTER TABLE clock_logs
  ADD COLUMN IF NOT EXISTS breaks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_break_minutes INTEGER NOT NULL DEFAULT 0;

-- Breaks structure (stored as JSON array):
-- [
--   { "start": "2026-04-14T12:30:00Z", "end": "2026-04-14T12:45:00Z" },
--   { "start": "2026-04-14T15:00:00Z", "end": null }  <-- currently on break
-- ]
