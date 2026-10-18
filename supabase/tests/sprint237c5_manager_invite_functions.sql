-- Rolled-back tests for 20261028_sprint237c5_manager_invite_functions.sql (rev 6). Claude runs them; nothing persists.
-- Run with the migration body (without begin/commit) in one implicit transaction, or after apply. Ends with RAISE.
-- Concurrency (two real sessions) is in supabase/tests/sprint237c5_manager_invite_concurrency.md.
-- Fixtures: smoke owner (inviter A), smoke manager (inviter B), Smoke Test Property (H); a second home H2 created here;
-- invitee P is a throwaway manager profile with an @example.com email (profiles has no FK to auth.users).
do $$
declare
  a uuid := (select id from profiles where email = 'richard.ace.smith+smokeowner@gmail.com');
  b uuid := (select id from profiles where email = 'richard.ace.smith+smokemanager@gmail.com');
  h uuid := (select id from properties where name = 'Smoke Test Property' and owner_profile_id = a);
  p uuid := gen_random_uuid();
  q uuid := gen_random_uuid();
  e text := 'c5-fn-' || substr(p::text, 1, 8) || '@example.com';
  eq text := 'c5-fn-' || substr(q::text, 1, 8) || '@example.com';
  ra uuid; rb uuid; rq uuid; t record; n int; acct uuid; ok boolean; log text := '';
begin
  if a is null or b is null or h is null then raise exception 'fixture missing'; end if;
  -- S0 every row that existed before the migration counts as a direct add
  if exists (select 1 from property_managers where not assigned_directly) then raise exception 'S0'; end if;
  log := log || 'S0 ';
  insert into profiles (id, full_name, email, role) values (p, 'Fn Test', e, 'manager'), (q, 'Fn Test', eq, 'manager');
  insert into invitations (email, full_name, role, property_id, invited_by, status, invited_profile_id)
    values (e, 'Fn Test', 'manager', h, a, 'pending', p) returning id into ra;

  -- G1 grant binds and grants; outcome granted; row stays pending
  select count(*) into n from manager_invite_grant(array[ra], p, a) g where g.outcome = 'granted';
  if n <> 1 or not exists (select 1 from property_managers where property_id = h and manager_profile_id = p and active)
     or (select status from invitations where id = ra) <> 'pending'
     or (select assigned_directly from property_managers where property_id = h and manager_profile_id = p) then raise exception 'G1'; end if;
  log := log || 'G1 ';

  -- G2 identity binding: wrong profile, wrong inviter, unknown id each raise and change nothing
  update property_managers set active = false where property_id = h and manager_profile_id = p;
  begin perform manager_invite_grant(array[ra], q, a); raise exception 'G2a no error';
  exception when no_data_found then null; end;
  begin perform manager_invite_grant(array[ra], p, b); raise exception 'G2b no error';
  exception when no_data_found then null; end;
  begin perform manager_invite_grant(array[ra, gen_random_uuid()], p, a); raise exception 'G2c no error';
  exception when no_data_found then null; end;
  begin perform manager_invite_grant(array[ra], gen_random_uuid(), a); raise exception 'G2d no error';
  exception when invalid_parameter_value then null; end;
  if exists (select 1 from property_managers where property_id = h and manager_profile_id = p and active)
     or exists (select 1 from property_managers where manager_profile_id = q) then raise exception 'G2 state'; end if;
  log := log || 'G2 ';

  -- G3 null invited_profile_id binds only to the manager profile with the row's email
  insert into invitations (email, full_name, role, property_id, invited_by, status, invited_profile_id)
    values (eq, 'Fn Test', 'manager', h, a, 'pending', null) returning id into rq;
  begin perform manager_invite_grant(array[rq], p, a); raise exception 'G3a no error';
  exception when no_data_found then null; end;
  select count(*) into n from manager_invite_grant(array[rq], q, a) g where g.outcome = 'granted';
  if n <> 1 or (select invited_profile_id from invitations where id = rq) <> q then raise exception 'G3'; end if;
  log := log || 'G3 ';

  -- G4 p_accept grants and accepts in one call; a second call reports already_accepted
  select outcome into t from manager_invite_grant(array[ra], p, a, true);
  if t.outcome <> 'accepted' or (select status from invitations where id = ra) <> 'accepted'
     or not (select active from property_managers where property_id = h and manager_profile_id = p) then raise exception 'G4'; end if;
  select outcome into t from manager_invite_grant(array[ra], p, a, true);
  if t.outcome <> 'already_accepted' then raise exception 'G4b'; end if;
  log := log || 'G4 ';

  -- R1 revoke pending → expired + access removed; R2 grant on expired → not_pending, no write
  update invitations set status = 'pending', accepted_at = null where id = ra;
  select * into t from manager_invite_revoke(ra, a);
  if t.outcome <> 'revoked' or not t.released or t.other_live or t.profile_id <> p then raise exception 'R1 %', t; end if;
  if (select status from invitations where id = ra) <> 'expired'
     or (select active from property_managers where property_id = h and manager_profile_id = p) then raise exception 'R1 state'; end if;
  select outcome into t from manager_invite_grant(array[ra], p, a);
  if t.outcome <> 'not_pending' or (select active from property_managers where property_id = h and manager_profile_id = p)
    then raise exception 'R2'; end if;
  log := log || 'R1 R2 ';

  -- R3 already_revoked; wrong inviter → not_found; accepted → accepted, no writes
  select * into t from manager_invite_revoke(ra, a);
  if t.outcome <> 'already_revoked' then raise exception 'R3a %', t; end if;
  select * into t from manager_invite_revoke(ra, b);
  if t.outcome <> 'not_found' then raise exception 'R3b %', t; end if;
  log := log || 'R3 ';

  -- R4 two inviters: revoking A keeps access while B's row is live; then revoking B removes it
  update invitations set status = 'pending' where id = ra;
  insert into invitations (email, full_name, role, property_id, invited_by, status, invited_profile_id)
    values (e, 'Fn Test', 'manager', h, b, 'pending', p) returning id into rb;
  perform manager_invite_grant(array[ra], p, a);
  perform manager_invite_grant(array[rb], p, b);
  select * into t from manager_invite_revoke(ra, a);
  if t.outcome <> 'revoked' or t.released or not t.other_live
     or not (select active from property_managers where property_id = h and manager_profile_id = p) then raise exception 'R4a %', t; end if;
  select * into t from manager_invite_revoke(rb, b);
  if t.outcome <> 'revoked' or not t.released or t.other_live
     or (select active from property_managers where property_id = h and manager_profile_id = p) then raise exception 'R4b %', t; end if;
  log := log || 'R4 ';

  -- R5 HEAD-shape row (invited_profile_id null) resolves the profile by email
  update invitations set status = 'pending', invited_profile_id = null where id = rb;
  update property_managers set active = true where property_id = h and manager_profile_id = p;
  select * into t from manager_invite_revoke(rb, b);
  if t.outcome <> 'revoked' or t.profile_id <> p or not t.released then raise exception 'R5 %', t; end if;
  log := log || 'R5 ';

  -- A1 accept: a pending row with an inactive grant stays pending (no_access); with an active grant it turns accepted
  update invitations set status = 'pending', invited_profile_id = p where id = ra;
  select outcome into t from manager_invite_accept(p) x where x.invitation_id = ra;
  if t.outcome <> 'no_access' or (select status from invitations where id = ra) <> 'pending' then raise exception 'A1a'; end if;
  perform manager_invite_grant(array[ra], p, a);
  select outcome into t from manager_invite_accept(p) x where x.invitation_id = ra;
  if t.outcome <> 'accepted' or (select status from invitations where id = ra) <> 'accepted' then raise exception 'A1b'; end if;
  select count(*) into n from manager_invite_accept(gen_random_uuid());
  if n <> 0 then raise exception 'A1c'; end if;
  log := log || 'A1 ';

  -- H1 grant_homes reports added only for homes not already active
  update property_managers set active = false where property_id = h and manager_profile_id = q;
  select count(*) into n from manager_grant_homes(q, array[h, h]) x where x.added;
  if n <> 1 then raise exception 'H1a'; end if;
  select count(*) into n from manager_grant_homes(q, array[h]) x where x.added;
  if n <> 0 then raise exception 'H1b'; end if;
  log := log || 'H1 ';

  -- D1 ChatGPT round 3: A's invite made the access; B then adds P directly (no row); A's revoke keeps the direct add
  update invitations set status = 'pending', accepted_at = null where id = ra;
  update invitations set status = 'expired' where id in (rb, rq);
  update property_managers set active = false, assigned_directly = false where property_id = h and manager_profile_id = p;
  perform manager_invite_grant(array[ra], p, a);
  if (select assigned_directly from property_managers where property_id = h and manager_profile_id = p) then raise exception 'D1a'; end if;
  select count(*) into n from manager_grant_homes(p, array[h]) x where x.added;
  if n <> 0 or not (select assigned_directly from property_managers where property_id = h and manager_profile_id = p)
    then raise exception 'D1b'; end if;
  select * into t from manager_invite_revoke(ra, a);
  if t.outcome <> 'revoked' or t.released or t.other_live or not t.kept_direct
     or not (select active from property_managers where property_id = h and manager_profile_id = p) then raise exception 'D1c %', t; end if;
  log := log || 'D1 ';

  -- D2 an active direct grant stays direct when an invite grants the same home; revoking that invite keeps it
  update invitations set status = 'pending' where id = ra;
  perform manager_invite_grant(array[ra], p, a);
  if not (select assigned_directly from property_managers where property_id = h and manager_profile_id = p) then raise exception 'D2a'; end if;
  select * into t from manager_invite_revoke(ra, a);
  if not t.kept_direct or t.released or not (select active from property_managers where property_id = h and manager_profile_id = p)
    then raise exception 'D2b %', t; end if;
  log := log || 'D2 ';

  -- D3 an inactive row (direct or not) re-granted by an invite becomes invitation-made; its revoke removes it
  update property_managers set active = false, assigned_directly = true where property_id = h and manager_profile_id = p;
  update invitations set status = 'pending' where id = ra;
  perform manager_invite_grant(array[ra], p, a);
  if (select assigned_directly from property_managers where property_id = h and manager_profile_id = p) then raise exception 'D3a'; end if;
  select * into t from manager_invite_revoke(ra, a);
  if t.kept_direct or not t.released or (select active from property_managers where property_id = h and manager_profile_id = p)
    then raise exception 'D3b %', t; end if;
  log := log || 'D3 ';

  -- X1 client-home guard: grant raises 42501 and rolls back every write of the call
  update invitations set status = 'pending' where id = ra;
  update property_managers set active = false where property_id = h and manager_profile_id = p;
  acct := (select owner_account_id from properties where id = h);
  begin
    update ownership_accounts set managed_client = true where id = acct;
    perform manager_invite_grant(array[ra], p, a, true);
    raise exception 'X1 no guard error';
  exception when insufficient_privilege then null;
  end;
  if (select active from property_managers where property_id = h and manager_profile_id = p)
     or (select status from invitations where id = ra) <> 'pending'
     or (select managed_client from ownership_accounts where id = acct) then raise exception 'X1 state'; end if;
  log := log || 'X1 ';

  -- P1 privileges: only service_role may EXECUTE any of the five
  select bool_and(not has_function_privilege(r, f, 'EXECUTE')) into ok
  from unnest(array['anon', 'authenticated']) r,
       unnest(array['public.manager_access_lock(text[])', 'public.manager_grant_homes(uuid, uuid[])',
                    'public.manager_invite_grant(uuid[], uuid, uuid, boolean)', 'public.manager_invite_revoke(uuid, uuid)',
                    'public.manager_invite_accept(uuid)']) f;
  if not ok or not has_function_privilege('service_role', 'public.manager_invite_accept(uuid)', 'EXECUTE')
    then raise exception 'P1'; end if;
  log := log || 'P1';

  raise exception 'ALL_PASS_ROLLED_BACK: %', log;
end $$;
