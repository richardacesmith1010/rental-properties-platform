-- Rollback for 20261027_sprint238k_storage_policy_lockdown.sql: recreates the four policies exactly as they were live
-- on 2026-10-16 (pg_policies: roles {public}). This REOPENS the holes; use only if the lockdown breaks a real flow.
create policy property_files_storage_select on storage.objects for select to public
  using ((bucket_id = 'property-files'::text) and (auth.role() = 'authenticated'::text));
create policy property_files_storage_insert on storage.objects for insert to public
  with check ((bucket_id = 'property-files'::text) and (auth.role() = 'authenticated'::text));
create policy property_files_storage_delete on storage.objects for delete to public
  using ((bucket_id = 'property-files'::text) and (auth.role() = 'authenticated'::text));
create policy profile_avatars_public_read on storage.objects for select to public
  using ((bucket_id = 'profile-avatars'::text));
