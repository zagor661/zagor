-- ============================================================
-- MIGRACJA: Teczka pracownika — stawki, umowa, dane osobowe
-- ============================================================

-- Dodaj kolumny do profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(6,2) DEFAULT 29.00;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contract_type TEXT DEFAULT 'zlecenie';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pesel TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_account TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notes TEXT;

-- Ustaw stawkę Yuriia na 35 PLN/h
UPDATE profiles SET hourly_rate = 35.00
WHERE LOWER(full_name) LIKE '%yurii%';

-- Ustaw resztę na 29 PLN/h (ci co mają default)
UPDATE profiles SET hourly_rate = 29.00
WHERE hourly_rate IS NULL OR hourly_rate = 0;

-- Ustaw wszystkim umowę zlecenie
UPDATE profiles SET contract_type = 'zlecenie'
WHERE contract_type IS NULL;

-- Weryfikacja
SELECT full_name, hourly_rate, contract_type FROM profiles ORDER BY full_name;
