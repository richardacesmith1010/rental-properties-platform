-- Sprint 11: Add profile onboarding columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Allow users to update their own nickname and avatar_url
CREATE POLICY profiles_update_own_profile ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Create storage bucket for profile avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-avatars', 'profile-avatars', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: users can upload their own avatar
CREATE POLICY profile_avatars_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage policy: users can read their own avatar
CREATE POLICY profile_avatars_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage policy: users can update their own avatar
CREATE POLICY profile_avatars_update ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage policy: users can delete their own avatar
CREATE POLICY profile_avatars_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read access for avatars (so they can be displayed in sidebar without auth)
CREATE POLICY profile_avatars_public_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'profile-avatars'
  );
