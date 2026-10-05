-- Sprint 162: one tenant-started/landlord-started thread per tenant per property per subject.
-- Verified 2026-10-05: 0 rows with entity_type = 'tenant_profile', so no existing duplicates.
create unique index if not exists inbox_threads_tenant_profile_unique
  on public.inbox_threads (property_id, entity_id, subject)
  where entity_type = 'tenant_profile';
