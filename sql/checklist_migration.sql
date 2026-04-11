-- ============================================================
-- Migration: Checklisty otwarcia/zamknięcia — Kuchnia + Sala
-- 4 typy: opening, during_day, closing, weekly
-- Dział: kitchen, hall
-- ============================================================

-- 1. Tabela definicji zadań checklisty
CREATE TABLE IF NOT EXISTS checklist_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID REFERENCES locations(id),
  department TEXT NOT NULL CHECK (department IN ('kitchen', 'hall')),
  checklist_type TEXT NOT NULL CHECK (checklist_type IN ('opening', 'during_day', 'closing', 'weekly')),
  title TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela logów (kto kiedy wypełnił checklist)
CREATE TABLE IF NOT EXISTS checklist_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID REFERENCES locations(id),
  department TEXT NOT NULL,
  checklist_type TEXT NOT NULL,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_by UUID REFERENCES profiles(id),
  completed_at TIMESTAMPTZ DEFAULT now(),
  all_done BOOLEAN DEFAULT false,
  UNIQUE(location_id, department, checklist_type, log_date)
);

-- 3. Tabela wpisów (poszczególne odhaczenia)
CREATE TABLE IF NOT EXISTS checklist_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  log_id UUID REFERENCES checklist_logs(id) ON DELETE CASCADE,
  item_id UUID REFERENCES checklist_items(id),
  is_completed BOOLEAN DEFAULT false,
  completed_by UUID REFERENCES profiles(id),
  completed_at TIMESTAMPTZ
);

-- 4. RLS
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_items_read" ON checklist_items;
CREATE POLICY "checklist_items_read" ON checklist_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "checklist_items_write" ON checklist_items;
CREATE POLICY "checklist_items_write" ON checklist_items FOR ALL USING (true);

DROP POLICY IF EXISTS "checklist_logs_all" ON checklist_logs;
CREATE POLICY "checklist_logs_all" ON checklist_logs FOR ALL USING (true);

DROP POLICY IF EXISTS "checklist_entries_all" ON checklist_entries;
CREATE POLICY "checklist_entries_all" ON checklist_entries FOR ALL USING (true);

-- 5. Indeksy
CREATE INDEX IF NOT EXISTS idx_checklist_items_dept ON checklist_items(location_id, department, checklist_type);
CREATE INDEX IF NOT EXISTS idx_checklist_logs_date ON checklist_logs(location_id, log_date);

-- ============================================================
-- SEED DATA — Sala
-- ============================================================

-- OTWARCIE SALI
INSERT INTO checklist_items (location_id, department, checklist_type, title, sort_order)
SELECT l.id, 'hall', 'opening', t.title, t.sort_order
FROM locations l, (VALUES
  ('Włączyć oświetlenie sali', 1),
  ('Włączyć muzykę / nagłośnienie JBL', 2),
  ('Sprawdzić temperaturę na sali (klimatyzacja/ogrzewanie)', 3),
  ('Sprawdzić menu / wyświetlacze', 4),
  ('Wytrzeć stoliki i krzesła', 5),
  ('Uzupełnić serwetniki', 6),
  ('Uzupełnić pojemniki z sosami', 7),
  ('Sprawdzić czystość podłogi', 8),
  ('Sprawdzić toalety (papier, mydło, ręczniki)', 9),
  ('Przygotować stanowisko kasowe', 10),
  ('Sprawdzić czy terminal płatniczy działa', 11),
  ('Włączyć szyld / reklamę zewnętrzną', 12)
) AS t(title, sort_order)
WHERE l.is_active = true;

-- W CIĄGU DNIA — SALA
INSERT INTO checklist_items (location_id, department, checklist_type, title, sort_order)
SELECT l.id, 'hall', 'during_day', t.title, t.sort_order
FROM locations l, (VALUES
  ('Sprawdzić czystość stolików', 1),
  ('Uzupełnić serwetniki i sosy', 2),
  ('Sprawdzić toalety (czystość, papier, mydło)', 3),
  ('Sprawdzić czystość wejścia do lokalu', 4),
  ('Sprawdzić zapach w toalecie', 5),
  ('Opróżnić kosze na śmieci jeśli pełne', 6),
  ('Przetrzeć ladę / bar', 7)
) AS t(title, sort_order)
WHERE l.is_active = true;

-- ZAMKNIĘCIE SALI
INSERT INTO checklist_items (location_id, department, checklist_type, title, sort_order)
SELECT l.id, 'hall', 'closing', t.title, t.sort_order
FROM locations l, (VALUES
  ('Wytrzeć wszystkie stoliki i krzesła', 1),
  ('Zamieść / umyć podłogę na sali', 2),
  ('Opróżnić wszystkie kosze na śmieci', 3),
  ('Wymienić worki w koszach', 4),
  ('Wytrzeć ladę / bar', 5),
  ('Wyczyścić ekspres do kawy (jeśli jest)', 6),
  ('Uzupełnić serwetniki na następny dzień', 7),
  ('Uzupełnić sosy na następny dzień', 8),
  ('Posprzątać toalety', 9),
  ('Wyłączyć muzykę / nagłośnienie', 10),
  ('Wyłączyć oświetlenie sali', 11),
  ('Wyłączyć szyld / reklamę zewnętrzną', 12),
  ('Sprawdzić okna (zamknięte)', 13),
  ('Zamknąć drzwi na klucz', 14),
  ('Zamknąć kasę / terminal', 15)
) AS t(title, sort_order)
WHERE l.is_active = true;

-- RAZ W TYGODNIU — SALA
INSERT INTO checklist_items (location_id, department, checklist_type, title, sort_order)
SELECT l.id, 'hall', 'weekly', t.title, t.sort_order
FROM locations l, (VALUES
  ('Umyć okna / witryny', 1),
  ('Przetrzeć lampy na sali', 2),
  ('Odkurzyć kratki wentylacyjne', 3),
  ('Przetrzeć drzwi wejściowe', 4),
  ('Wyczyścić menu / karty', 5),
  ('Sprawdzić stan krzeseł i stolików', 6),
  ('Przetrzeć dekoracje / rośliny', 7)
) AS t(title, sort_order)
WHERE l.is_active = true;

-- ============================================================
-- SEED DATA — Kuchnia
-- ============================================================

-- OTWARCIE KUCHNI
INSERT INTO checklist_items (location_id, department, checklist_type, title, sort_order)
SELECT l.id, 'kitchen', 'opening', t.title, t.sort_order
FROM locations l, (VALUES
  ('Sprawdzić temperatury lodówek i mroźni', 1),
  ('Sprawdzić daty ważności produktów', 2),
  ('Włączyć urządzenia kuchenne (grill, frytkownica, itp.)', 3),
  ('Przygotować stanowisko prep (deski, noże, pojemniki)', 4),
  ('Sprawdzić zapas jednorazówek (rękawiczki, fartuchy)', 5),
  ('Sprawdzić czystość stanowisk', 6),
  ('Wyciągnąć produkty na prep z chłodni', 7),
  ('Sprawdzić stan oleju we frytownicy', 8),
  ('Włączyć okap / wentylację', 9)
) AS t(title, sort_order)
WHERE l.is_active = true;

-- W CIĄGU DNIA — KUCHNIA
INSERT INTO checklist_items (location_id, department, checklist_type, title, sort_order)
SELECT l.id, 'kitchen', 'during_day', t.title, t.sort_order
FROM locations l, (VALUES
  ('Utrzymywać czystość stanowisk', 1),
  ('Sprawdzić temperatury w salad barze', 2),
  ('Uzupełnić prep (warzywka, sosy, składniki)', 3),
  ('Wynosić śmieci jeśli pełne', 4),
  ('Myć bieżąco deski i narzędzia', 5),
  ('Sprawdzić daty ważności produktów otwartych', 6)
) AS t(title, sort_order)
WHERE l.is_active = true;

-- ZAMKNIĘCIE KUCHNI
INSERT INTO checklist_items (location_id, department, checklist_type, title, sort_order)
SELECT l.id, 'kitchen', 'closing', t.title, t.sort_order
FROM locations l, (VALUES
  ('Schować wszystkie produkty do lodówek/mroźni', 1),
  ('Opisać i ofoliować wszystkie pojemniki prep', 2),
  ('Wyczyścić grill / frytkownicę / patelnie', 3),
  ('Umyć wszystkie deski, noże, garnki', 4),
  ('Wytrzeć i zdezynfekować blaty robocze', 5),
  ('Zamieść / umyć podłogę kuchni', 6),
  ('Opróżnić kosze na śmieci + wymienić worki', 7),
  ('Wyczyścić okap (filtr powierzchniowy)', 8),
  ('Wyłączyć urządzenia kuchenne', 9),
  ('Wyłączyć okap / wentylację', 10),
  ('Pomiary temperatur wieczorne', 11),
  ('Sprawdzić czy wszystko zamknięte', 12)
) AS t(title, sort_order)
WHERE l.is_active = true;

-- RAZ W TYGODNIU — KUCHNIA
INSERT INTO checklist_items (location_id, department, checklist_type, title, sort_order)
SELECT l.id, 'kitchen', 'weekly', t.title, t.sort_order
FROM locations l, (VALUES
  ('Rozmrozić i umyć mroźnię', 1),
  ('Umyć lodówki wewnątrz', 2),
  ('Wyczyścić filtr okapu dokładnie', 3),
  ('Wyczyścić frytownicę (wymiana oleju)', 4),
  ('Umyć ściany za stanowiskami', 5),
  ('Sprawdzić i uzupełnić apteczkę', 6),
  ('Odkurzyć kratki wentylacyjne', 7),
  ('Przetrzeć lampy kuchenne', 8)
) AS t(title, sort_order)
WHERE l.is_active = true;

-- ============================================================
-- Dodaj pracowników Sali: Katarzyna i Zuzanna
-- ============================================================
INSERT INTO profiles (email, full_name, role, pin, is_active)
VALUES
  ('katarzyna@wokiwoki.pl', 'Katarzyna', 'hall', '5678', true),
  ('zuzanna@wokiwoki.pl', 'Zuzanna', 'hall', '9012', true);

-- Przypisz do aktywnej lokacji
INSERT INTO user_locations (user_id, location_id, is_primary)
SELECT p.id, l.id, true
FROM profiles p, locations l
WHERE p.full_name IN ('Katarzyna', 'Zuzanna')
  AND l.is_active = true;

-- Weryfikacja
SELECT full_name, role FROM profiles WHERE is_active = true ORDER BY
  CASE role
    WHEN 'owner' THEN 0
    WHEN 'manager' THEN 1
    WHEN 'kitchen' THEN 2
    WHEN 'hall' THEN 3
    ELSE 9
  END, full_name;
