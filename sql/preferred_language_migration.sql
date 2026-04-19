-- ============================================================
-- WOKI TALKIE — preferred_language na profiles
-- ============================================================
-- Dodaje kolumnę preferred_language do tabeli profiles.
-- Domyślnie 'pl' (polski). Yurii → 'uk' (ukraiński).
-- ============================================================

-- 1. Dodaj kolumnę
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'pl';

-- 2. Ustaw język Yuriego na ukraiński
UPDATE profiles
  SET preferred_language = 'uk'
  WHERE LOWER(full_name) LIKE '%yurii%'
     OR LOWER(full_name) LIKE '%юрій%';

-- 3. Weryfikacja
SELECT full_name, role, preferred_language
  FROM profiles
  WHERE is_active = true
  ORDER BY full_name;
