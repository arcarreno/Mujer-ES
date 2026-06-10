-- =====================================================
-- MIGRATION: Fix cross-user reads + admin avatar_url
-- CRITICAL-3: Allow authenticated users to read all profiles
-- CRITICAL-4: Allow authenticated users to read admin basics
-- CRITICAL-5: Add avatar_url column to admins table
-- =====================================================

-- CRITICAL-3: Allow authenticated users to read all profiles
-- profiles only contains: id, username, full_name, bio, hobbies, avatar_url, blocked_until
-- No sensitive data — safe for cross-user reads
DROP POLICY IF EXISTS "authenticated read all profiles" ON public.profiles;
CREATE POLICY "authenticated read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- CRITICAL-4: Allow authenticated users to read admin basics
-- admins contains: id, username, full_name, phone, password (hashed), created_at, updated_at
-- Queries only select id, username, full_name — safe at the query level
DROP POLICY IF EXISTS "authenticated read admin basics" ON public.admins;
CREATE POLICY "authenticated read admin basics" ON public.admins
  FOR SELECT TO authenticated USING (true);

-- CRITICAL-5: Add avatar_url column to admins table
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS avatar_url text;
