-- ============================================================
-- 009: Dodanie enabled_modules do locations + setup_completed
-- Pozwala ownerowi wybrać które moduły są aktywne w lokacji
-- ============================================================

-- Dodaj kolumny do locations (jeśli tabela istnieje)
DO $$
BEGIN
  -- enabled_modules — tablica ścieżek modułów, np. ['/checklist','/tasks']
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'locations' AND column_name = 'enabled_modules'
  ) THEN
    ALTER TABLE locations ADD COLUMN enabled_modules text[] DEFAULT NULL;
    COMMENT ON COLUMN locations.enabled_modules IS 'Tablica włączonych modułów (href). NULL = wszystkie domyślne.';
  END IF;

  -- setup_completed — czy owner przeszedł setup wizard
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'locations' AND column_name = 'setup_completed'
  ) THEN
    ALTER TABLE locations ADD COLUMN setup_completed boolean DEFAULT false;
  END IF;

  -- owner_id — kto jest właścicielem lokacji
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'locations' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE locations ADD COLUMN owner_id uuid REFERENCES profiles(id);
  END IF;

  -- business_type — typ lokalu (restaurant, bar, cafe, etc.)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'locations' AND column_name = 'business_type'
  ) THEN
    ALTER TABLE locations ADD COLUMN business_type text DEFAULT 'restaurant';
  END IF;
END$$;

-- Tabela user_locations (jeśli jeszcze nie istnieje)
CREATE TABLE IF NOT EXISTS user_locations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'kitchen',
  is_primary boolean DEFAULT true,
  granted_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT NULL,
  UNIQUE(user_id, location_id)
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_user_locations_user ON user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_location ON user_locations(location_id);
