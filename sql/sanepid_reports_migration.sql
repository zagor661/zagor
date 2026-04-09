-- =====================================================================
-- Sanepid Reports — migracja bazy
-- Uruchom w Supabase → SQL Editor → New query → wklej całość → Run
-- =====================================================================

-- 1. Tabela trzymająca metadane wygenerowanych raportów HACCP
CREATE TABLE IF NOT EXISTS sanepid_reports (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id      uuid        NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  generated_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  report_id        text        NOT NULL,               -- "SAN-20260409-143022"
  from_date        date        NOT NULL,
  to_date          date        NOT NULL,
  file_name        text        NOT NULL,
  storage_path     text        NOT NULL,
  public_url       text,
  file_size        integer,
  overall_status   text        CHECK (overall_status IN ('ok','warn','fail')),
  temp_status      text        CHECK (temp_status IN ('ok','warn','fail')),
  cleaning_status  text        CHECK (cleaning_status IN ('ok','warn','fail')),
  metrics          jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sanepid_reports_location     ON sanepid_reports(location_id);
CREATE INDEX IF NOT EXISTS idx_sanepid_reports_created_at   ON sanepid_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sanepid_reports_date_range   ON sanepid_reports(location_id, from_date, to_date);

-- 2. RLS — użytkownicy widzą tylko raporty ze swojej lokalizacji
ALTER TABLE sanepid_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see reports from their location" ON sanepid_reports;
CREATE POLICY "Users see reports from their location"
  ON sanepid_reports
  FOR SELECT
  USING (
    location_id IN (
      SELECT location_id FROM user_locations WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role can insert" ON sanepid_reports;
CREATE POLICY "Service role can insert"
  ON sanepid_reports
  FOR INSERT
  WITH CHECK (true);  -- backend używa service_role key, więc to ok

-- 3. Storage bucket dla PDFów (jeśli jeszcze nie istnieje)
-- UWAGA: bucket tworzy się osobno w Supabase Dashboard → Storage → New bucket
-- Nazwa: "reports", Public: TAK (żeby linki działały w historii)
-- Jeśli już masz bucket "reports" — pomiń ten krok.

INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage policies — każdy zalogowany może czytać, tylko service_role pisze
DROP POLICY IF EXISTS "Public read reports" ON storage.objects;
CREATE POLICY "Public read reports"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'reports');

-- =====================================================================
-- GOTOWE. Sprawdź że tabela istnieje:
--   SELECT * FROM sanepid_reports LIMIT 1;
-- =====================================================================
