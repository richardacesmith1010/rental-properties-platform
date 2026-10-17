-- Sprint 237c-1: one invitation row per home (M1 "All my homes").
--
-- The old key UNIQUE (email, role, invited_by) allowed only one invitation per inviter, email and role. A second home
-- for the same pending manager could not be tracked (the insert failed and was only logged), and the same inviter could
-- not link an existing tenant to a second home. The app already treats invitations as per-home rows.
--
-- New key: UNIQUE NULLS NOT DISTINCT (email, role, invited_by, property_id). Owner invitations (property_id null) stay
-- unique per inviter exactly as before. Every row set valid under the old key is valid under the new one.
-- No grant change: clients still have no INSERT/UPDATE on public.invitations (checked below).
--
-- Rollback (only while no inviter has two rows for the same email and role):
--   alter table public.invitations drop constraint invitations_email_role_invited_by_property_key;
--   alter table public.invitations add constraint invitations_email_role_invited_by_key unique (email, role, invited_by);

alter table public.invitations drop constraint invitations_email_role_invited_by_key;

alter table public.invitations
  add constraint invitations_email_role_invited_by_property_key
  unique nulls not distinct (email, role, invited_by, property_id);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.invitations'::regclass and conname = 'invitations_email_role_invited_by_key'
  ) then
    raise exception 'old invitations key still present';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invitations'::regclass
      and conname = 'invitations_email_role_invited_by_property_key'
      and pg_get_constraintdef(oid) = 'UNIQUE NULLS NOT DISTINCT (email, role, invited_by, property_id)'
  ) then
    raise exception 'new invitations key missing or different';
  end if;
  if has_table_privilege('anon', 'public.invitations', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.invitations', 'INSERT,UPDATE,DELETE')
     or has_any_column_privilege('anon', 'public.invitations', 'INSERT,UPDATE')
     or has_any_column_privilege('authenticated', 'public.invitations', 'INSERT,UPDATE') then
    raise exception 'client write grant on public.invitations';
  end if;
end $$;
