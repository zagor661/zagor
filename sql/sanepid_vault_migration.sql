-- ============================================================
-- MIGRACJA: Sanepid Vault — dokumenty, personel, alergeny
-- ============================================================

-- 1. Dokumenty archiwum (skany umów, decyzji, protokołów)
CREATE TABLE IF NOT EXISTS sanepid_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'decyzja','umowa_ddd','odpady','tluszcz','protokol','chemia','haccp','dostawca','inne'
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT,          -- Supabase Storage URL
  file_name TEXT,
  file_size INTEGER,
  expires_at DATE,        -- data wygaśnięcia (np. umowa DDD na rok)
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_sanepid_docs_location ON sanepid_documents(location_id);
CREATE INDEX IF NOT EXISTS idx_sanepid_docs_expires ON sanepid_documents(expires_at) WHERE expires_at IS NOT NULL;

-- 2. Personel — orzeczenia sanitarne i szkolenia
CREATE TABLE IF NOT EXISTS sanepid_personnel (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- 'orzeczenie_sanitarne','szkolenie_higiena','badania_lekarskie'
  issue_date DATE,
  expiry_date DATE,           -- KRYTYCZNE: kiedy wygasa
  file_url TEXT,              -- skan
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_sanepid_personnel_expiry ON sanepid_personnel(expiry_date);
CREATE INDEX IF NOT EXISTS idx_sanepid_personnel_location ON sanepid_personnel(location_id);

-- 3. Alergeny — 14 alergenów UE per danie
CREATE TABLE IF NOT EXISTS menu_allergens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  dish_name TEXT NOT NULL,
  category TEXT,              -- 'starter','main','side','drink','dessert'
  allergens INTEGER[] NOT NULL DEFAULT '{}', -- array of allergen IDs (1-14)
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_id, dish_name)
);

CREATE INDEX IF NOT EXISTS idx_menu_allergens_location ON menu_allergens(location_id);

-- 4. Log przyjęć dostaw
CREATE TABLE IF NOT EXISTS delivery_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by UUID REFERENCES profiles(id),
  temperature_ok BOOLEAN DEFAULT true,
  visual_ok BOOLEAN DEFAULT true,
  document_number TEXT,       -- numer WZ
  notes TEXT,
  rejected_items TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_location ON delivery_logs(location_id, delivery_date);

-- RLS
ALTER TABLE sanepid_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanepid_personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_allergens ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_logs ENABLE ROW LEVEL SECURITY;

-- Policies (location-based)
CREATE POLICY "Location access" ON sanepid_documents FOR ALL
  USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Location access" ON sanepid_personnel FOR ALL
  USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Location access" ON menu_allergens FOR ALL
  USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Location access" ON delivery_logs FOR ALL
  USING (location_id IN (SELECT location_id FROM profiles WHERE id = auth.uid()));
