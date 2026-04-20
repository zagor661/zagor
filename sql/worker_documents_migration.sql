-- ============================================================
-- MIGRACJA: Pełna teczka pracownika
-- Nowe kolumny w profiles + tabela worker_documents
-- ============================================================

-- 1. Dodatkowe kolumny w profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nip TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contract_start DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contract_end DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shirt_size TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shoe_size TEXT;

-- 2. Tabela dokumentów pracowniczych (umowy, skany, zaświadczenia)
CREATE TABLE IF NOT EXISTS worker_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  document_type TEXT NOT NULL, -- 'umowa', 'aneks', 'badania_lekarskie', 'bhp', 'orzeczenie_sanitarne', 'szkolenie', 'inne'
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  file_name TEXT,
  issue_date DATE,
  expiry_date DATE,
  is_active BOOLEAN DEFAULT true,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_worker_documents_profile ON worker_documents(profile_id);
CREATE INDEX IF NOT EXISTS idx_worker_documents_type ON worker_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_worker_documents_expiry ON worker_documents(expiry_date) WHERE expiry_date IS NOT NULL;

-- RLS
ALTER TABLE worker_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "worker_documents_all" ON worker_documents FOR ALL USING (true) WITH CHECK (true);

-- Weryfikacja
SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('avatar_url','position','date_of_birth','nip','contract_start','contract_end','shirt_size','shoe_size')
ORDER BY column_name;
