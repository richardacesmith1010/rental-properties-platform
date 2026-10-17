-- Sprint 238k: close two Storage policy holes (found 2026-10-16 by the upload sweep, verified with attacker SQL).
--
-- 1. property-files: property_files_storage_select/insert/delete allowed ANY signed-in user (auth.role() = 'authenticated')
--    to list, read and add objects in every landlord's folder. Sign-up is open, so that meant anyone.
-- 2. profile-avatars: profile_avatars_public_read let anyone (including anon) read every avatar object.
--
-- The app never touches Storage with a user's own session: every upload, delete and signed download URL uses the
-- service-role admin client (lib/assets.ts, lib/uploads.ts, app/actions/*). Service role bypasses RLS, so dropping these
-- policies changes nothing the app does. The own-folder avatar policies stay. Both buckets stay private.
-- Live state when written: property-files 0 objects, profile-avatars 0 objects (nothing leaked).
-- Rollback (exact recreation of the live definitions): supabase/rollback/20261027_sprint238k_rollback.sql

drop policy property_files_storage_select on storage.objects;
drop policy property_files_storage_insert on storage.objects;
drop policy property_files_storage_delete on storage.objects;
drop policy profile_avatars_public_read on storage.objects;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') like '%property-files%' or coalesce(with_check, '') like '%property-files%')
  ) then
    raise exception 'a property-files storage policy still exists';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
      and coalesce(qual, '') like '%profile-avatars%' and coalesce(qual, '') not like '%auth.uid()%'
  ) then
    raise exception 'an avatar read policy without an owner check still exists';
  end if;
  if (select public from storage.buckets where id = 'property-files')
     or (select public from storage.buckets where id = 'profile-avatars') then
    raise exception 'a bucket is public';
  end if;
end $$;
