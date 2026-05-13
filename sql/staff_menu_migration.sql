-- Uruchom w Supabase → SQL Editor
-- Tabela stałego menu pracowniczego

CREATE TABLE IF NOT EXISTS staff_menu (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  number TEXT NOT NULL,           -- numer dania (np. "1", "2a")
  name TEXT NOT NULL,             -- nazwa dania (np. "Kurczak teriyaki z ryżem")
  category TEXT DEFAULT 'danie',  -- kategoria: danie / zupa / deser / napój
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups per location
CREATE INDEX IF NOT EXISTS idx_staff_menu_location ON staff_menu(location_id, is_active);

-- RLS
ALTER TABLE staff_menu ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_menu_select" ON staff_menu FOR SELECT USING (true);
CREATE POLICY "staff_menu_insert" ON staff_menu FOR INSERT WITH CHECK (true);
CREATE POLICY "staff_menu_update" ON staff_menu FOR UPDATE USING (true);
CREATE POLICY "staff_menu_delete" ON staff_menu FOR DELETE USING (true);
