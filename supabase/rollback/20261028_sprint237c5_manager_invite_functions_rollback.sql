-- Rollback for 20261028_sprint237c5_manager_invite_functions.sql (rev 5). Deploy the pre-237c-5 app first: it never
-- calls these functions.
begin;
drop function if exists public.manager_invite_accept(uuid);
drop function if exists public.manager_invite_revoke(uuid, uuid);
drop function if exists public.manager_invite_grant(uuid[], uuid, uuid, boolean);
drop function if exists public.manager_grant_homes(uuid, uuid[]);
drop function if exists public.manager_access_lock(text[]);
commit;
