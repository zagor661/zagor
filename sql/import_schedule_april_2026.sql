-- ============================================================
-- Import grafiku WOKI WOKI — kwiecień 2026 + 1 maja
-- ============================================================
-- Plan SALA (Katarzyna + Zuzanna):
--   - Katarzyna: NIE pracuje we wtorki
--   - Weekendy: naprzemiennie (W1 K, W2 Z, W3 K, W4 Z)
--   - Dni robocze: przemieszane
-- Plan KUCHNIA: wg oryginalnego CSV (Piotr, Yurii, Maciek, Michał)
-- ============================================================

-- 1. Dodaj Maćka i Zuzannę (jeśli jeszcze nie istnieją)
INSERT INTO profiles (email, full_name, role, pin, is_active)
SELECT 'maciek@wokiwoki.pl', 'Maciek', 'kitchen', '3344', true
WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE full_name = 'Maciek');

INSERT INTO profiles (email, full_name, role, pin, is_active)
SELECT 'zuzanna@wokiwoki.pl', 'Zuzanna', 'hall', '9012', true
WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE full_name = 'Zuzanna');

-- 2. Przypisz do aktywnej lokacji
INSERT INTO user_locations (user_id, location_id, is_primary)
SELECT p.id, l.id, true
FROM profiles p, locations l
WHERE p.full_name IN ('Maciek', 'Zuzanna')
  AND l.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM user_locations ul WHERE ul.user_id = p.id AND ul.location_id = l.id
  );

-- 3. Import zmian
WITH
loc AS (
  SELECT id FROM locations WHERE is_active = true ORDER BY name LIMIT 1
),
people AS (
  SELECT 'YURII'     AS k, id FROM profiles WHERE full_name = 'Yurii'
  UNION ALL SELECT 'PIOTR',     id FROM profiles WHERE full_name = 'Piotr'
  UNION ALL SELECT 'MACIEK',    id FROM profiles WHERE full_name = 'Maciek'
  UNION ALL SELECT 'MICHAL',    id FROM profiles WHERE full_name = 'Michał'
  UNION ALL SELECT 'KATARZYNA', id FROM profiles WHERE full_name = 'Katarzyna'
  UNION ALL SELECT 'ZUZANNA',   id FROM profiles WHERE full_name = 'Zuzanna'
),
kitchen_shifts(shift_date, names) AS (
  VALUES
    ('2026-04-01'::date, ARRAY['PIOTR','YURII']),
    ('2026-04-02'::date, ARRAY['YURII','PIOTR']),
    ('2026-04-03'::date, ARRAY['MACIEK','YURII']),
    ('2026-04-04'::date, ARRAY['MACIEK','MICHAL']),
    ('2026-04-05'::date, ARRAY['MICHAL','PIOTR']),
    ('2026-04-06'::date, ARRAY['YURII','PIOTR']),
    ('2026-04-07'::date, ARRAY['YURII','MACIEK']),
    ('2026-04-08'::date, ARRAY['MACIEK','PIOTR']),
    ('2026-04-09'::date, ARRAY['PIOTR','YURII']),
    ('2026-04-10'::date, ARRAY['YURII','MACIEK']),
    ('2026-04-11'::date, ARRAY['YURII','PIOTR']),
    ('2026-04-12'::date, ARRAY['MACIEK','PIOTR']),
    ('2026-04-13'::date, ARRAY['PIOTR','MACIEK']),
    ('2026-04-14'::date, ARRAY['YURII','PIOTR']),
    ('2026-04-15'::date, ARRAY['YURII','MACIEK']),
    ('2026-04-16'::date, ARRAY['MACIEK','MICHAL']),
    ('2026-04-17'::date, ARRAY['MICHAL','PIOTR']),
    ('2026-04-18'::date, ARRAY['YURII','MACIEK']),
    ('2026-04-19'::date, ARRAY['YURII','MACIEK']),
    ('2026-04-20'::date, ARRAY['MACIEK','MICHAL']),
    ('2026-04-21'::date, ARRAY['PIOTR','MICHAL']),
    ('2026-04-22'::date, ARRAY['PIOTR','YURII']),
    ('2026-04-23'::date, ARRAY['YURII','MACIEK']),
    ('2026-04-24'::date, ARRAY['MACIEK','MICHAL']),
    ('2026-04-25'::date, ARRAY['MICHAL','PIOTR']),
    ('2026-04-26'::date, ARRAY['YURII','PIOTR']),
    ('2026-04-27'::date, ARRAY['MACIEK','YURII']),
    ('2026-04-28'::date, ARRAY['MACIEK','MICHAL']),
    ('2026-04-29'::date, ARRAY['MICHAL','PIOTR']),
    ('2026-04-30'::date, ARRAY['YURII','PIOTR']),
    ('2026-05-01'::date, ARRAY['YURII'])
),
hall_shifts(shift_date, name) AS (
  VALUES
    -- K=Katarzyna, Z=Zuzanna. K bez wtorków, weekendy naprzemiennie.
    ('2026-04-01'::date, 'KATARZYNA'), -- śr
    ('2026-04-02'::date, 'ZUZANNA'),   -- czw
    ('2026-04-03'::date, 'KATARZYNA'), -- pt
    ('2026-04-04'::date, 'KATARZYNA'), -- sob W1
    ('2026-04-05'::date, 'KATARZYNA'), -- nd  W1
    ('2026-04-06'::date, 'ZUZANNA'),   -- pn
    ('2026-04-07'::date, 'ZUZANNA'),   -- wt (K nie pracuje)
    ('2026-04-08'::date, 'KATARZYNA'), -- śr
    ('2026-04-09'::date, 'ZUZANNA'),   -- czw
    ('2026-04-10'::date, 'KATARZYNA'), -- pt
    ('2026-04-11'::date, 'ZUZANNA'),   -- sob W2
    ('2026-04-12'::date, 'ZUZANNA'),   -- nd  W2
    ('2026-04-13'::date, 'ZUZANNA'),   -- pn
    ('2026-04-14'::date, 'ZUZANNA'),   -- wt (K nie pracuje)
    ('2026-04-15'::date, 'KATARZYNA'), -- śr
    ('2026-04-16'::date, 'ZUZANNA'),   -- czw
    ('2026-04-17'::date, 'KATARZYNA'), -- pt
    ('2026-04-18'::date, 'KATARZYNA'), -- sob W3
    ('2026-04-19'::date, 'KATARZYNA'), -- nd  W3
    ('2026-04-20'::date, 'ZUZANNA'),   -- pn
    ('2026-04-21'::date, 'ZUZANNA'),   -- wt (K nie pracuje)
    ('2026-04-22'::date, 'KATARZYNA'), -- śr
    ('2026-04-23'::date, 'ZUZANNA'),   -- czw
    ('2026-04-24'::date, 'KATARZYNA'), -- pt
    ('2026-04-25'::date, 'ZUZANNA'),   -- sob W4
    ('2026-04-26'::date, 'ZUZANNA'),   -- nd  W4
    ('2026-04-27'::date, 'ZUZANNA'),   -- pn
    ('2026-04-28'::date, 'ZUZANNA'),   -- wt (K nie pracuje)
    ('2026-04-29'::date, 'KATARZYNA'), -- śr
    ('2026-04-30'::date, 'ZUZANNA'),   -- czw
    ('2026-05-01'::date, 'KATARZYNA')  -- pt
),
all_shifts AS (
  SELECT ks.shift_date, n.name, 'KUCHNIA' AS dept
  FROM kitchen_shifts ks
  CROSS JOIN LATERAL unnest(ks.names) AS n(name)
  UNION ALL
  SELECT hs.shift_date, hs.name, 'SALA'
  FROM hall_shifts hs
)
INSERT INTO schedule_shifts (
  location_id, worker_id, shift_date, department,
  start_time, end_time, status, schedule_month
)
SELECT
  (SELECT id FROM loc),
  p.id,
  s.shift_date,
  s.dept,
  '11:00'::time,
  '21:00'::time,
  'scheduled',
  date_trunc('month', s.shift_date)::date
FROM all_shifts s
JOIN people p ON p.k = s.name;

-- 4. Weryfikacja
SELECT shift_date, department, COUNT(*) AS osoby,
       string_agg(pr.full_name, ', ' ORDER BY pr.full_name) AS imiona
FROM schedule_shifts ss
JOIN profiles pr ON pr.id = ss.worker_id
WHERE shift_date BETWEEN '2026-04-01' AND '2026-05-01'
GROUP BY shift_date, department
ORDER BY shift_date, department;
