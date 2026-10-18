-- Rollback for 20261028_sprint237c5_manager_invite_functions.sql. Deploy the pre-237c-5 app first (it never calls these).
begin;
drop function if exists public.manager_invite_grant(uuid[], uuid);
drop function if exists public.manager_invite_revoke(uuid, uuid);
commit;
