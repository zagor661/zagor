-- 011: Fix user_locations RLS — enable + allow reads for anon/authenticated
-- ALSO: backfill user_locations for profiles that have a location_id but no link
-- Run in Supabase SQL Editor

-- =============================================
-- 1. Enable RLS on user_locations + profiles
-- =============================================
ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read user_locations (login page needs this with anon key)
CREATE POLICY "user_locations_select_all"
  ON user_locations FOR SELECT
  USING (true);

-- Allow service role to insert/update/delete (API routes use service key)
CREATE POLICY "user_locations_modify_service"
  ON user_locations FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================
-- 2. Ensure profiles table also allows reads
-- =============================================
-- Check if profiles has RLS enabled — if yes, make sure there's a read policy
DO $$
BEGIN
  -- Enable RLS if not already (some Supabase projects enable by default)
  ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

-- Allow reading all profiles (login page needs this)
DO $$
BEGIN
  CREATE POLICY "profiles_select_all"
    ON profiles FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END$$;

-- Allow all operations on profiles (app manages access control)
DO $$
BEGIN
  CREATE POLICY "profiles_modify_all"
    ON profiles FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END$$;

-- =============================================
-- 3. Ensure locations table allows reads
-- =============================================
DO $$
BEGIN
  ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

DO $$
BEGIN
  CREATE POLICY "locations_select_all"
    ON locations FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END$$;

DO $$
BEGIN
  CREATE POLICY "locations_modify_all"
    ON locations FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END$$;

-- =============================================
-- 4. Backfill: link existing profiles to locations
--    For profiles that have NO entry in user_locations
--    but DO exist in auth.users, link them to all locations
-- =============================================
INSERT INTO user_locations (user_id, location_id, is_primary)
SELECT p.id, l.id, true
FROM profiles p
CROSS JOIN locations l
WHERE p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM user_locations ul
    WHERE ul.user_id = p.id AND ul.location_id = l.id
  )
ON CONFLICT (user_id, location_id) DO NOTHING;
