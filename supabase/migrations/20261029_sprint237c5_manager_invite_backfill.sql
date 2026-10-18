-- Sprint 237c-5 C4 (5c rev 3.1, ChatGPT 5c REQUIRED 3): bring HEAD-shape manager invitations onto the new model.
-- Run AFTER 20261028_sprint237c5_manager_invite_functions.sql and AFTER the 5a+5b+5c deploy (until then HEAD keeps
-- writing HEAD-shape rows). Data only. Live 2026-10-18: 1 manager row (pending, unbound, user confirmed + signed in,
-- grant active).
-- (1) Bind: pending manager rows with invited_profile_id null get the manager profile with the same lower(email).
-- (2) Accept only with evidence of sign-in AND access: for each such profile whose auth user has last_sign_in_at,
--     manager_invite_accept(profile) — same locks, accepts only rows whose grant for that home is active. A confirmed
--     email alone is not enough; every other row stays pending.
-- Backup: every row touched is copied first to public.invitations_237c5_backfill_backup (RLS on, no policies, service
-- role only) so the rollback can restore it exactly.

begin;

create table if not exists public.invitations_237c5_backfill_backup as
  select i.*, now() as backed_up_at from public.invitations i where false;
alter table public.invitations_237c5_backfill_backup enable row level security;
revoke all on public.invitations_237c5_backfill_backup from public, anon, authenticated;

insert into public.invitations_237c5_backfill_backup
  select i.*, now() from public.invitations i
  where i.role = 'manager' and i.status = 'pending' and i.invited_profile_id is null;

update public.invitations i
  set invited_profile_id = p.id
from public.profiles p
where i.role = 'manager' and i.status = 'pending' and i.invited_profile_id is null
  and p.role = 'manager' and lower(p.email) = lower(i.email);

select public.manager_invite_accept(p.id)
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'manager'
  and u.last_sign_in_at is not null
  and exists (select 1 from public.invitations i
              where i.id in (select b.id from public.invitations_237c5_backfill_backup b)
                and i.invited_profile_id = p.id);

commit;
