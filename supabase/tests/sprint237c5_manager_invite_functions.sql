-- Rolled-back test for 20261028_sprint237c5_manager_invite_functions.sql (Claude runs it; never commits data).
-- Run the migration body first in the same transaction (or after apply). Ends with RAISE so everything rolls back.
-- Fixtures: the smoke owner (inviter A), the smoke manager (inviter B), Smoke Test Property; invitee profile is a
-- throwaway uuid with an @example.com email (profiles has no FK to auth.users).
do $$
declare
  a uuid := (select id from profiles where email = 'richard.ace.smith+smokeowner@gmail.com');
  b uuid := (select id from profiles where email = 'richard.ace.smith+smokemanager@gmail.com');
  h uuid := (select id from properties where name = 'Smoke Test Property' and owner_profile_id = a);
  p uuid := gen_random_uuid();
  e text := 'c5-fn-test-' || substr(p::text, 1, 8) || '@example.com';
  ra uuid; rb uuid; t record; n int; acct uuid; log text := '';
begin
  if a is null or b is null or h is null then raise exception 'fixture missing'; end if;
  insert into profiles (id, full_name, email, role) values (p, 'Fn Test', e, 'manager');
  insert into invitations (email, full_name, role, property_id, invited_by, status, invited_profile_id)
    values (e, 'Fn Test', 'manager', h, a, 'pending', p) returning id into ra;

  -- T1 grant on a pending row grants
  select count(*) into n from manager_invite_grant(array[ra], p) g where g.granted;
  if n <> 1 or not exists (select 1 from property_managers where property_id = h and manager_profile_id = p and active)
    then raise exception 'T1 fail'; end if;
  log := log || 'T1 ';

  -- T2 revoke: expires the row and removes access in one call
  select * into t from manager_invite_revoke(ra, a);
  if t.outcome <> 'revoked' or not t.released or t.other_live or t.profile_id <> p then raise exception 'T2 fail %', t; end if;
  if (select status from invitations where id = ra) <> 'expired'
     or (select active from property_managers where property_id = h and manager_profile_id = p) then raise exception 'T2 state'; end if;
  log := log || 'T2 ';

  -- T3 grant on an expired row does nothing
  select count(*) into n from manager_invite_grant(array[ra], p) g where g.granted;
  if n <> 0 or (select active from property_managers where property_id = h and manager_profile_id = p)
    then raise exception 'T3 fail'; end if;
  log := log || 'T3 ';

  -- T4 revoke again: already_revoked, no writes; wrong inviter: not_found
  select * into t from manager_invite_revoke(ra, a);
  if t.outcome <> 'already_revoked' then raise exception 'T4a fail %', t; end if;
  select * into t from manager_invite_revoke(ra, b);
  if t.outcome <> 'not_found' then raise exception 'T4b fail %', t; end if;
  log := log || 'T4 ';

  -- T5 two inviters: revoking A keeps access while B's row is live
  update invitations set status = 'pending' where id = ra;
  insert into invitations (email, full_name, role, property_id, invited_by, status, invited_profile_id)
    values (e, 'Fn Test', 'manager', h, b, 'pending', p) returning id into rb;
  perform manager_invite_grant(array[ra, rb], p);
  select * into t from manager_invite_revoke(ra, a);
  if t.outcome <> 'revoked' or t.released or not t.other_live
     or not (select active from property_managers where property_id = h and manager_profile_id = p) then raise exception 'T5 fail %', t; end if;
  log := log || 'T5 ';

  -- T6 accepted row: outcome accepted, no writes
  update invitations set status = 'accepted' where id = rb;
  select * into t from manager_invite_revoke(rb, b);
  if t.outcome <> 'accepted' or (select status from invitations where id = rb) <> 'accepted' then raise exception 'T6 fail %', t; end if;
  log := log || 'T6 ';

  -- T7 profile resolved by email when invited_profile_id is null (HEAD-shape row)
  update invitations set status = 'pending', invited_profile_id = null where id = rb;
  update property_managers set active = true where property_id = h and manager_profile_id = p;
  select * into t from manager_invite_revoke(rb, b);
  if t.outcome <> 'revoked' or t.profile_id <> p or not t.released then raise exception 'T7 fail %', t; end if;
  log := log || 'T7 ';

  -- T8 client-home guard: the grant raises and nothing changes (all-or-nothing)
  update invitations set status = 'pending' where id = ra;
  update property_managers set active = false where property_id = h and manager_profile_id = p;
  acct := (select owner_account_id from properties where id = h);
  begin
    update ownership_accounts set managed_client = true where id = acct;
    perform manager_invite_grant(array[ra], p);
    raise exception 'T8 no guard error';
  exception when insufficient_privilege then
    log := log || 'T8(guard 42501) ';
  end;
  if (select active from property_managers where property_id = h and manager_profile_id = p)
     or (select managed_client from ownership_accounts where id = acct) then raise exception 'T8 state'; end if;

  -- T9 privileges
  if has_function_privilege('authenticated', 'public.manager_invite_grant(uuid[], uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.manager_invite_grant(uuid[], uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.manager_invite_revoke(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.manager_invite_revoke(uuid, uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.manager_invite_revoke(uuid, uuid)', 'EXECUTE')
    then raise exception 'T9 privileges'; end if;
  log := log || 'T9';

  raise exception 'ALL_PASS_ROLLED_BACK: %', log;
end $$;
