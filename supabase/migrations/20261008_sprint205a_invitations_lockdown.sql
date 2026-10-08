-- Sprint 205a (URGENT security hotfix): invitations are written only by the server (service role).
-- Found 2026-10-08: any signed-in owner could INSERT invitations for any home/account
-- (invitations_insert_owner had no target check; invitations_insert_admin_v2's tenant branch was unbound),
-- and handle_new_user() turns pending owner/manager invitations into ownership_account_members /
-- property_managers rows at signup -> takeover of another owner's home or account.
-- All app writes to invitations already use the admin client (verified by grep); users only read.
-- Live audit before fix: 5 invitations total, all tenant, all from authorized inviters.

do $pre$
begin
  if exists (select 1 from public.invitations i where i.role in ('owner', 'manager') and i.status = 'pending') then
    raise notice 'pending owner/manager invitations exist; they keep working (server-created)';
  end if;
end $pre$;

drop policy if exists invitations_insert_admin_v2 on public.invitations;
drop policy if exists invitations_insert_owner on public.invitations;
drop policy if exists invitations_update_admin_v2 on public.invitations;
drop policy if exists invitations_update_owner on public.invitations;

revoke insert, update, delete, truncate, references, trigger on public.invitations from anon, authenticated;
grant select on public.invitations to authenticated;
