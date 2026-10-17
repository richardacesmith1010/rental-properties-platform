-- Rollback for 20261027_sprint238k_storage_policy_lockdown.sql: recreates the eight policies exactly as they were live
-- on 2026-10-16 (pg_policies: roles {public}; qual / with_check text copied verbatim; profile_avatars_update has no
-- with_check). This REOPENS every hole: any signed-in user can list, read, add and delete every landlord's property
-- files, anyone can read every avatar, and any signed-in user can host files in their own avatar folder.
-- Use it only if the lockdown breaks a real flow that you have traced to a missing policy.
-- NOT a rollback reason: broken avatar images. They were already broken before 238k (public URL on a private bucket,
-- apps/web/lib/auth.ts:140 and apps/web/app/actions/profile.ts:77), whatever the policies say.
-- After rollback, run docs/sprint238k-attacker-test.md: it must report mode before-apply and every hole OPEN.

create policy property_files_storage_select on storage.objects for select to public
  using ((bucket_id = 'property-files'::text) and (auth.role() = 'authenticated'::text));
create policy property_files_storage_insert on storage.objects for insert to public
  with check ((bucket_id = 'property-files'::text) and (auth.role() = 'authenticated'::text));
create policy property_files_storage_delete on storage.objects for delete to public
  using ((bucket_id = 'property-files'::text) and (auth.role() = 'authenticated'::text));
create policy profile_avatars_public_read on storage.objects for select to public
  using ((bucket_id = 'profile-avatars'::text));
create policy profile_avatars_select on storage.objects for select to public
  using (((bucket_id = 'profile-avatars'::text) and ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy profile_avatars_insert on storage.objects for insert to public
  with check (((bucket_id = 'profile-avatars'::text) and ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy profile_avatars_update on storage.objects for update to public
  using (((bucket_id = 'profile-avatars'::text) and ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy profile_avatars_delete on storage.objects for delete to public
  using (((bucket_id = 'profile-avatars'::text) and ((storage.foldername(name))[1] = (auth.uid())::text)));

do $$
begin
  if (
    select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in (
        'property_files_storage_select', 'property_files_storage_insert', 'property_files_storage_delete',
        'profile_avatars_public_read', 'profile_avatars_select', 'profile_avatars_insert',
        'profile_avatars_update', 'profile_avatars_delete'
      )
  ) <> 8 then
    raise exception 'rollback did not restore all eight storage policies';
  end if;
end $$;
