-- Add profile fields: bio, hobbies, avatar_url
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS hobbies text[],
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own avatar
DROP POLICY IF EXISTS "Avatar upload own" ON storage.objects;
CREATE POLICY "Avatar upload own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow public read access to avatars
DROP POLICY IF EXISTS "Avatar public read" ON storage.objects;
CREATE POLICY "Avatar public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- Allow users to update their own avatar
DROP POLICY IF EXISTS "Avatar update own" ON storage.objects;
CREATE POLICY "Avatar update own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to delete their own avatar
DROP POLICY IF EXISTS "Avatar delete own" ON storage.objects;
CREATE POLICY "Avatar delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
