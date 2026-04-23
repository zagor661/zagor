-- 010: Onboarding — configurable checklist items, cleaning zones, location extras
-- Run in Supabase SQL Editor

-- Add onboarding_completed and food_cost_sheet_url to locations
ALTER TABLE locations ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS food_cost_sheet_url text;

-- Configurable checklist items per location
CREATE TABLE IF NOT EXISTS checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  shift_type text NOT NULL DEFAULT 'morning', -- 'morning' or 'evening'
  item_text text NOT NULL,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_location ON checklist_items(location_id);

-- Configurable cleaning zones per location
CREATE TABLE IF NOT EXISTS cleaning_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  zone_name text NOT NULL,
  frequency text DEFAULT 'co tydzień', -- 'codziennie', 'co tydzień', 'co miesiąc'
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cleaning_zones_location ON cleaning_zones(location_id);

-- RLS
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_zones ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/write (app handles access control)
CREATE POLICY "checklist_items_all" ON checklist_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "cleaning_zones_all" ON cleaning_zones FOR ALL USING (true) WITH CHECK (true);
