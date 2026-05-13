-- Uruchom w Supabase → SQL Editor
-- Powiązanie dań pracowniczych z recepturami + log odejmowań

-- 1. Dodaj recipe_id do staff_menu
ALTER TABLE staff_menu
  ADD COLUMN IF NOT EXISTS recipe_id TEXT;
-- recipe_id = id z foodcostRecipes.ts (np. 'tokio', 'osaka')
-- NULL = danie bez receptury (nie odejmuje składników)

-- 2. Tabela logów odejmowań ze stanów magazynowych
CREATE TABLE IF NOT EXISTS meal_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id UUID NOT NULL,                           -- worker_meals.id
  location_id UUID NOT NULL REFERENCES locations(id),
  recipe_id TEXT NOT NULL,                         -- powiązana receptura
  ingredient_name TEXT NOT NULL,                   -- nazwa składnika
  quantity_kg NUMERIC(10,4) NOT NULL,              -- ilość odjęta (w kg)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meal_deductions_location ON meal_deductions(location_id, created_at);
CREATE INDEX IF NOT EXISTS idx_meal_deductions_meal ON meal_deductions(meal_id);

-- RLS
ALTER TABLE meal_deductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meal_deductions_select" ON meal_deductions FOR SELECT USING (true);
CREATE POLICY "meal_deductions_insert" ON meal_deductions FOR INSERT WITH CHECK (true);
