-- Sprint 58 reference migration.
-- The live app already uses the existing maintenance_photos table and bucket.
-- This upgrades that table in place for richer metadata and tenant-safe insert/delete policies.

alter table if exists maintenance_photos
  add column if not exists file_name text,
  add column if not exists file_type text,
  add column if not exists file_size_bytes integer;

update maintenance_photos
set file_name = coalesce(file_name, nullif(split_part(storage_path, '/', 2), ''))
where file_name is null;

update maintenance_photos
set file_type = coalesce(file_type, 'application/octet-stream')
where file_type is null;

update maintenance_photos
set file_size_bytes = coalesce(file_size_bytes, 0)
where file_size_bytes is null;

alter table maintenance_photos enable row level security;

drop policy if exists "maintenance_photos_insert_owner_or_manager" on maintenance_photos;
create policy "maintenance_photos_insert_ticket_participants" on maintenance_photos
for insert with check (
  uploaded_by_profile_id = auth.uid()
  and exists (
    select 1
    from maintenance_tickets mt
    where mt.id = maintenance_photos.ticket_id
      and (
        mt.tenant_profile_id = auth.uid()
        or public.can_administer_property(mt.property_id)
      )
  )
);

drop policy if exists "maintenance_photos_delete_uploader_or_admin" on maintenance_photos;
create policy "maintenance_photos_delete_uploader_or_admin" on maintenance_photos
for delete using (
  uploaded_by_profile_id = auth.uid()
  or exists (
    select 1
    from maintenance_tickets mt
    where mt.id = maintenance_photos.ticket_id
      and public.can_administer_property(mt.property_id)
  )
);
