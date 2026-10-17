-- Sprint 238k: remove every user-session Storage policy on the property-files and profile-avatars buckets.
-- Found 2026-10-16 by the upload sweep; rev 2 after the critic panel (live state re-read 2026-10-16).
--
-- Holes this closes (all eight live policies are roles {public}; sign-up is open, so "signed in" means anyone):
-- 1. property-files: property_files_storage_select/insert/delete let ANY signed-in user (auth.role() = 'authenticated')
--    list, read, add AND delete objects in every landlord's folder. Delete was missed at first: a direct SQL DELETE is
--    always refused by the trigger protect_objects_delete (storage.protect_delete(), SQLSTATE 42501, the same code as an
--    RLS denial), but the Storage API sets storage.allow_delete_query = 'true', so through the API only RLS decides.
-- 2. profile-avatars: profile_avatars_public_read let anyone, including anon, read every avatar object.
-- 3. profile-avatars: profile_avatars_insert/_update/_delete/_select let any signed-in user write, overwrite, delete and
--    read files under profile-avatars/<own uid>/ with the anon key. The bucket has no size or type limit, so that is free
--    file hosting (own-folder select also lets them mint signed URLs to share the files).
--
-- Why this breaks nothing: apps/web sends no Storage request with a user session. Every upload, remove, list and signed
-- URL goes through createAdminClient() (service role, bypasses RLS): apps/web/lib/assets.ts, apps/web/lib/uploads.ts,
-- apps/web/app/actions/{document-templates,profile,maintenance-queries,maintenance-photo-actions,account-wipe}.ts.
-- apps/web/lib/auth.ts:140 calls getPublicUrl, which only builds a URL string (no request, no RLS). apps/ios has no
-- Storage calls. After this migration storage.objects has no policies for these buckets; RLS stays on, so clients get
-- nothing. Future direct uploads (238j-2) must use admin-minted signed upload URLs; never re-add user policies.
--
-- Avatar images were already broken before 238k: the app builds public URLs for a private bucket
-- (apps/web/lib/auth.ts:140, apps/web/app/actions/profile.ts:77), which fail no matter what the policies say.
-- A broken avatar is NOT a 238k regression and NOT a reason to run the rollback.
--
-- Live state when written: property-files 0 objects, profile-avatars 0 objects (nothing leaked); both buckets private.
-- Attacker test (run BEFORE apply to see the holes, AFTER apply to see them closed): docs/sprint238k-attacker-test.md
-- Rollback (exact recreation of the eight live definitions): supabase/rollback/20261027_sprint238k_rollback.sql

drop policy property_files_storage_select on storage.objects;
drop policy property_files_storage_insert on storage.objects;
drop policy property_files_storage_delete on storage.objects;
drop policy profile_avatars_public_read on storage.objects;
drop policy profile_avatars_select on storage.objects;
drop policy profile_avatars_insert on storage.objects;
drop policy profile_avatars_update on storage.objects;
drop policy profile_avatars_delete on storage.objects;

do $$
begin
  -- ChatGPT review (AWC, 2026-10-16): the intended state is ZERO policies on storage.objects (all eight were for these
  -- two buckets), so a catch-all policy added later could not silently reopen them.
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects') <> 0 then
    raise exception 'storage.objects still has policies';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(property-files|profile-avatars)'
  ) then
    raise exception 'a storage.objects policy still mentions property-files or profile-avatars';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'storage.objects'::regclass) then
    raise exception 'row level security is off on storage.objects';
  end if;
  if (select count(*) from storage.buckets where id in ('property-files', 'profile-avatars')) <> 2 then
    raise exception 'the property-files or profile-avatars bucket is missing';
  end if;
  if exists (select 1 from storage.buckets where id in ('property-files', 'profile-avatars') and public) then
    raise exception 'a bucket is public';
  end if;
end $$;
