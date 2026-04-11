-- ============================================================
-- Migration: System ról — Kitchen Ops
-- Nowe role: kitchen, hall, manager, owner (zamiast admin/worker)
-- ============================================================

-- 1. Zmień istniejące role
-- admin → owner (właściciel)
UPDATE profiles SET role = 'owner' WHERE role = 'admin';

-- worker → kitchen (domyślnie kuchnia)
UPDATE profiles SET role = 'kitchen' WHERE role = 'worker';

-- manager zostaje manager (bez zmian)

-- 2. Dodaj constraint na dozwolone wartości
-- Najpierw sprawdź czy constraint istnieje i usuń
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Dodaj nowy constraint
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('kitchen', 'hall', 'manager', 'owner'));

-- 3. Weryfikacja
SELECT full_name, role FROM profiles ORDER BY role, full_name;
