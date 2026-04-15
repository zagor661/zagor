-- ============================================================
-- Migration: Tajne / prywatne zadania
-- ============================================================
-- Zadanie oznaczone jako is_private=true widzą tylko:
--   • osoba przypisana (assigned_to)
--   • osoba przypisująca (created_by)
--   • wszyscy Menagerowie i Właściciele
-- Filtrowanie po stronie frontendu (loadTasks).
-- ============================================================

ALTER TABLE worker_tasks
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

-- Pomocniczy index dla zapytań filtrujących prywatne
CREATE INDEX IF NOT EXISTS idx_worker_tasks_private
  ON worker_tasks(is_private) WHERE is_private = true;
