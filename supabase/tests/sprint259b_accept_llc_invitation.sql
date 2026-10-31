-- Sprint 259b checks for public.accept_llc_invitation. Nothing is kept: the block always ends by raising.
-- Dry run: send the migration and this file in one call. After the live apply: send this file alone.
-- Pass = the error text starts with SPRINT259B_ACCEPT_TESTS_PASSED. Fixture people use @example.invalid addresses.
-- Real concurrency (two sessions, with forced row-lock contention) is checked live by
-- supabase/tests/sprint259b_accept_concurrency.mjs (D4).
do $test$
declare
  cur constant text := '2026-10-30';
  t_sha constant text := 'd9f5bae5103bae8db4851a6d30f0283f3c92017ba045d813b4b3c388bcb95b7d';
  p_sha constant text := 'e698a76b026206ae3d8553fcef451dd867d06cc80fbe0734b647dc60d2f865c3';
  admin_id uuid := gen_random_uuid();
  invitee_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  old_id uuid := gen_random_uuid();
  stale_id uuid := gen_random_uuid();
  mixed_id uuid := gen_random_uuid();
  clash_id uuid := gen_random_uuid();
  squat_id uuid := gen_random_uuid();
  invitee_email text := 'invitee-259b-' || invitee_id || '@example.invalid';
  clash_email text := 'clash-259b-' || clash_id || '@example.invalid';
  acct uuid[] := array[]::uuid[];
  a uuid;
  inv_ok uuid; inv_cancel uuid; inv_expired uuid; inv_bind uuid; inv_edge uuid; inv_old uuid;
  inv_stale uuid; inv_mixed uuid; inv_clash uuid; inv_rot uuid;
  tok_ok uuid; tok_cancel uuid; tok_expired uuid; tok_bind uuid; tok_edge uuid; tok_old uuid;
  tok_stale uuid; tok_mixed uuid; tok_clash uuid; tok_rot uuid; tok_new uuid;
  first_accepted timestamptz;
  r text;
  n integer;
  o text := '';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, meta::jsonb, created, now()
  from (values
    (admin_id, 'admin-259b-' || admin_id || '@example.invalid', '{"role":"owner"}', now()),
    (invitee_id, ' Invitee-259B-' || invitee_id || '@Example.invalid', '{"role":"tenant"}', now()),
    (other_id, 'other-259b-' || other_id || '@example.invalid', '{"role":"owner"}', now()),
    (old_id, 'old-259b-' || old_id || '@example.invalid', '{"role":"owner"}', timestamptz '2026-01-01 00:00:00+00'),
    (stale_id, 'stale-259b-' || stale_id || '@example.invalid', '{"role":"owner"}', now()),
    (mixed_id, 'mixed-259b-' || mixed_id || '@example.invalid', '{"role":"owner"}', now()),
    (clash_id, ' Clash-259B-' || clash_id || '@Example.invalid', '{"role":"tenant"}', now()),
    (squat_id, clash_email, '{"role":"owner"}', now())
  ) as f(id, email, meta, created);
  for i in 1..9 loop
    insert into public.ownership_accounts (account_type, display_name, claim_state)
      values ('llc', 'Sprint 259b test ' || i, 'claimed') returning id into a;
    acct := acct || a;
  end loop;
  -- idx_llc_invitations_unique_pending allows one pending invitation per account and email.
  insert into public.llc_invitations (ownership_account_id, invited_by, email, status, created_at)
    values (acct[1], admin_id, invitee_email, 'pending', now() - interval '1 day') returning id, token into inv_ok, tok_ok;
  insert into public.llc_invitations (ownership_account_id, invited_by, email, status, created_at)
    values (acct[2], admin_id, invitee_email, 'cancelled', now() - interval '1 day')
    returning id, token into inv_cancel, tok_cancel;
  insert into public.llc_invitations (ownership_account_id, invited_by, email, status, created_at)
    values (acct[2], admin_id, invitee_email, 'pending', now() - interval '7 days 1 minute')
    returning id, token into inv_expired, tok_expired;
  insert into public.llc_invitations (ownership_account_id, invited_by, email, status, created_at)
    values (acct[4], admin_id, invitee_email, 'pending', now() - interval '1 day') returning id, token into inv_bind, tok_bind;
  insert into public.llc_invitations (ownership_account_id, invited_by, email, status, created_at)
    values (acct[5], admin_id, invitee_email, 'pending', now() - interval '6 days 23 hours 59 minutes')
    returning id, token into inv_edge, tok_edge;
  insert into public.llc_invitations (ownership_account_id, invited_by, email, status, created_at)
    values (acct[3], admin_id, 'old-259b-' || old_id || '@example.invalid', 'pending', now() - interval '1 day')
    returning id, token into inv_old, tok_old;
  insert into public.llc_invitations (ownership_account_id, invited_by, email, status, created_at)
    values (acct[6], admin_id, 'stale-259b-' || stale_id || '@example.invalid', 'pending', now() - interval '1 day')
    returning id, token into inv_stale, tok_stale;
  insert into public.llc_invitations (ownership_account_id, invited_by, email, status, created_at)
    values (acct[7], admin_id, 'mixed-259b-' || mixed_id || '@example.invalid', 'pending', now() - interval '1 day')
    returning id, token into inv_mixed, tok_mixed;
  insert into public.llc_invitations (ownership_account_id, invited_by, email, status, created_at)
    values (acct[8], admin_id, clash_email, 'pending', now() - interval '1 day') returning id, token into inv_clash, tok_clash;
  insert into public.llc_invitations (ownership_account_id, invited_by, email, status, created_at)
    values (acct[9], admin_id, invitee_email, 'pending', now() - interval '1 day') returning id, token into inv_rot, tok_rot;

  -- 1. Clients can't call it; tokens are unique.
  set local role authenticated;
  begin
    perform public.accept_llc_invitation(inv_ok, tok_ok, invitee_id, 'Ivy Invitee', 'Ivy', cur, cur);
    raise exception 'FAIL authenticated could call accept_llc_invitation';
  exception when insufficient_privilege then o := o || 'authenticated 42501; ';
  end;
  reset role;
  set local role anon;
  begin
    perform public.accept_llc_invitation(inv_ok, tok_ok, invitee_id, 'Ivy Invitee', 'Ivy', cur, cur);
    raise exception 'FAIL anon could call accept_llc_invitation';
  exception when insufficient_privilege then o := o || 'anon 42501; ';
  end;
  reset role;
  begin
    insert into public.llc_invitations (ownership_account_id, invited_by, email, status, token)
      values (acct[9], admin_id, 'dup-259b@example.invalid', 'cancelled', tok_ok);
    raise exception 'FAIL a duplicate token was stored';
  exception when unique_violation then o := o || 'duplicate token 23505; ';
  end;

  -- 2. A new account with no record, or only records for other versions, can't join; nothing is written.
  insert into public.legal_document_versions (document, version, sha256)
    values ('terms', '2026-01-01', repeat('a', 64)), ('privacy', '2026-01-01', repeat('b', 64));
  insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256,
                                        source, role_at_acceptance, client, email_hmac, email_hmac_key_version)
  values (stale_id, '2026-01-01', repeat('a', 64), '2026-01-01', repeat('b', 64), 'agree_page', 'owner', 'web',
          repeat('0', 64), 1),
         (mixed_id, cur, t_sha, '2026-01-01', repeat('b', 64), 'agree_page', 'owner', 'web', repeat('0', 64), 1);
  set local role service_role;
  if public.accept_llc_invitation(inv_ok, tok_ok, invitee_id, 'Ivy Invitee', 'Ivy', cur, cur) <> 'agreement_required'
     or public.accept_llc_invitation(inv_stale, tok_stale, stale_id, 'Sam Stale', 'Sam', cur, cur) <> 'agreement_required'
     or public.accept_llc_invitation(inv_mixed, tok_mixed, mixed_id, 'Mia Mixed', 'Mia', cur, cur) <> 'agreement_required'
  then
    reset role;
    raise exception 'FAIL a join without a current agreement record was not refused';
  end if;
  reset role;
  if exists (select 1 from public.llc_invitations where id in (inv_ok, inv_stale, inv_mixed) and status <> 'pending')
     or exists (select 1 from public.ownership_account_members where account_id in (acct[1], acct[6], acct[7]))
     or (select role from public.profiles where id = invitee_id) <> 'tenant' then
    raise exception 'FAIL agreement_required wrote something';
  end if;
  o := o || 'no record / old versions / mixed versions -> agreement_required, no writes; ';

  insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256,
                                        source, role_at_acceptance, client, email_hmac, email_hmac_key_version)
  values (invitee_id, cur, t_sha, cur, p_sha, 'agree_page', 'tenant', 'web', repeat('0', 64), 1),
         (other_id, cur, t_sha, cur, p_sha, 'agree_page', 'owner', 'web', repeat('0', 64), 1),
         (clash_id, cur, t_sha, cur, p_sha, 'agree_page', 'tenant', 'web', repeat('0', 64), 1);

  -- 3. The right id with a wrong token is refused and writes nothing.
  set local role service_role;
  r := public.accept_llc_invitation(inv_ok, gen_random_uuid(), invitee_id, 'Ivy Invitee', 'Ivy', cur, cur);
  reset role;
  if r <> 'not_active' or (select status from public.llc_invitations where id = inv_ok) <> 'pending'
     or exists (select 1 from public.ownership_account_members where account_id = acct[1]) then
    raise exception 'FAIL wrong token: %', r;
  end if;
  o := o || 'wrong token -> not_active, no writes; ';

  -- 4. With a current record, the invitee joins: invitation, profile and membership change together.
  set local role service_role;
  r := public.accept_llc_invitation(inv_ok, tok_ok, invitee_id, ' Ivy Invitee ', 'Ivy', cur, cur);
  reset role;
  if r <> 'accepted' then raise exception 'FAIL valid join returned %', r; end if;
  select accepted_at into first_accepted from public.llc_invitations where id = inv_ok and status = 'accepted';
  if first_accepted is null then raise exception 'FAIL invitation not marked accepted'; end if;
  if not exists (select 1 from public.ownership_account_members where account_id = acct[1] and profile_id = invitee_id
                 and member_role = 'owner' and active and can_receive_critical_alerts) then
    raise exception 'FAIL membership missing or wrong';
  end if;
  if not exists (select 1 from public.profiles where id = invitee_id and role = 'owner' and email = invitee_email
                 and full_name = 'Ivy Invitee' and nickname = 'Ivy' and onboarding_completed_at is not null) then
    raise exception 'FAIL profile not updated as before';
  end if;
  o := o || 'current record -> accepted (invitation, profile, membership); ';

  -- 5. Single use: a second accept is refused and changes nothing.
  set local role service_role;
  r := public.accept_llc_invitation(inv_ok, tok_ok, invitee_id, 'Ivy Invitee', 'Ivy', cur, cur);
  reset role;
  select count(*) into n from public.ownership_account_members where account_id = acct[1] and profile_id = invitee_id;
  if r <> 'not_active' or n <> 1
     or (select accepted_at from public.llc_invitations where id = inv_ok) <> first_accepted then
    raise exception 'FAIL second accept: % (% rows)', r, n;
  end if;
  o := o || 'second accept -> not_active, 1 membership, accepted_at unchanged; ';

  -- 6. A resend rotates the token: the old link fails while the row is still pending; the new one works.
  update public.llc_invitations set token = gen_random_uuid(), created_at = now()
   where id = inv_rot and status = 'pending' returning token into tok_new;
  set local role service_role;
  r := public.accept_llc_invitation(inv_rot, tok_rot, invitee_id, 'Ivy Invitee', 'Ivy', cur, cur);
  reset role;
  if r <> 'not_active' or (select status from public.llc_invitations where id = inv_rot) <> 'pending'
     or exists (select 1 from public.ownership_account_members where account_id = acct[9]) then
    raise exception 'FAIL old token after rotation: %', r;
  end if;
  set local role service_role;
  r := public.accept_llc_invitation(inv_rot, tok_new, invitee_id, 'Ivy Invitee', 'Ivy', cur, cur);
  reset role;
  if r <> 'accepted' then raise exception 'FAIL new token after rotation: %', r; end if;
  o := o || 'rotated: old token -> not_active (still pending), new token -> accepted; ';

  -- 7. Cancelled, expired, someone else and unknown: refused, nothing written.
  set local role service_role;
  if public.accept_llc_invitation(inv_cancel, tok_cancel, invitee_id, 'Ivy Invitee', 'Ivy', cur, cur) <> 'not_active'
     or public.accept_llc_invitation(inv_expired, tok_expired, invitee_id, 'Ivy Invitee', 'Ivy', cur, cur) <> 'not_active'
     or public.accept_llc_invitation(inv_bind, tok_bind, other_id, 'Oscar Other', 'Oscar', cur, cur) <> 'not_active'
     or public.accept_llc_invitation(gen_random_uuid(), gen_random_uuid(), invitee_id, 'Ivy', 'Ivy', cur, cur)
        <> 'not_active' then
    reset role;
    raise exception 'FAIL an inactive or mismatched invitation was accepted';
  end if;
  reset role;
  if (select status from public.llc_invitations where id = inv_cancel) <> 'cancelled'
     or (select status from public.llc_invitations where id = inv_expired) <> 'pending'
     or (select status from public.llc_invitations where id = inv_bind) <> 'pending'
     or exists (select 1 from public.ownership_account_members where account_id in (acct[2], acct[4])) then
    raise exception 'FAIL a refused accept wrote something';
  end if;
  o := o || 'cancelled/expired/other person/unknown -> not_active, no writes; ';

  -- 8. A failure in a later write rolls the whole join back (here: another profile already holds the email).
  set local role service_role;
  begin
    perform public.accept_llc_invitation(inv_clash, tok_clash, clash_id, 'Cal Clash', 'Cal', cur, cur);
    raise exception 'FAIL clash join succeeded';
  exception when unique_violation then o := o || 'later profile write fails -> 23505; ';
  end;
  reset role;
  if (select status from public.llc_invitations where id = inv_clash) <> 'pending'
     or exists (select 1 from public.ownership_account_members where account_id = acct[8])
     or (select role from public.profiles where id = clash_id) <> 'tenant' then
    raise exception 'FAIL a failed join left a partial write';
  end if;
  o := o || 'invitation still pending, no membership, profile unchanged; ';

  -- 9. Inside 7 days still works; an account from before 2026-10-30 is exempt from the floor.
  set local role service_role;
  if public.accept_llc_invitation(inv_edge, tok_edge, invitee_id, 'Ivy Invitee', 'Ivy', cur, cur) <> 'accepted'
     or public.accept_llc_invitation(inv_old, tok_old, old_id, 'Olga Old', 'Olga', cur, cur) <> 'accepted' then
    reset role;
    raise exception 'FAIL edge or exempt accept refused';
  end if;
  reset role;
  if not exists (select 1 from public.ownership_account_members where account_id = acct[3] and profile_id = old_id) then
    raise exception 'FAIL exempt membership missing';
  end if;
  o := o || '6d23h59m old -> accepted; pre-cutoff account with no record -> accepted; ';

  -- 10. Definition: security definer, empty search_path, service role only.
  if not (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
          where p.oid = 'public.accept_llc_invitation(uuid, uuid, uuid, text, text, text, text)'::regprocedure) then
    raise exception 'FAIL definition flags';
  end if;
  o := o || 'definer + empty search_path';
  raise exception 'SPRINT259B_ACCEPT_TESTS_PASSED %', o;
end
$test$;
