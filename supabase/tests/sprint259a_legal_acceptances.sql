-- Sprint 259a attacker and integrity checks for legal_document_versions, legal_acceptances, legal_holds and
-- purge_expired_legal_acceptances. Nothing is kept: the block always ends by raising, which rolls everything back.
-- Dry run: send the migration and this file in one call. After the live apply: send this file alone.
-- Pass = the error text starts with SPRINT259A_SQL_TESTS_PASSED. Anything else (FAIL ..., or a Postgres error) fails.
do $test$
declare
  a uuid := gen_random_uuid();  -- tenant; closed 11 years ago -> purged
  b uuid := gen_random_uuid();  -- owner; closed 9 years ago -> kept
  c uuid := gen_random_uuid();  -- closed 11 years ago, active hold -> kept
  d uuid := gen_random_uuid();  -- closed 11 years ago, then a newer open request (reopened) -> kept
  e uuid := gen_random_uuid();  -- withdrawn 12 years ago, then closed 11 years ago -> purged
  f uuid := gen_random_uuid();  -- closed 11 years ago, hold released -> purged
  g uuid := gen_random_uuid();  -- no deletion request -> kept
  h uuid := gen_random_uuid();  -- closed 11 years ago, row recorded after closure -> kept
  j uuid := gen_random_uuid();  -- active hold, no records -> can't be deleted
  k uuid := gen_random_uuid();  -- no records, no hold -> deletes
  n integer;
  o text := '';
  sha constant text := '39e3b5ff7c84d09c4a35270316cb1cecb6877de0';
  h1 constant text := repeat('a1', 32);
  h2 constant text := repeat('b2', 32);
  em constant text := repeat('c3', 32);
  old_t constant timestamptz := now() - interval '12 years';
  bad_approver constant text := $q$owner test'); drop table public.profiles; --$q$;
begin
  insert into public.legal_document_versions (document, version, sha256) values
    ('terms', '1999-01-01', h1), ('privacy', '1999-01-01', h2), ('terms', '1999-01-02', h1), ('privacy', '1999-01-02', h2);
  insert into public.profiles (id, full_name, email, role)
  select x.id, 'Consent ' || x.k, x.id::text || '@example.invalid', x.r
    from (values (a, 'A', 'tenant'), (b, 'B', 'owner'), (c, 'C', 'owner'), (d, 'D', 'owner'), (e, 'E', 'owner'),
                 (f, 'F', 'owner'), (g, 'G', 'owner'), (h, 'H', 'owner')) as x(id, k, r);

  set local role service_role;
  insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256, source,
    role_at_acceptance, client, email_hmac, email_hmac_key_version, app_commit, accepted_at, recorded_at)
  select x.id, '1999-01-01', h1, '1999-01-01', h2, 'agree_page', 'owner', 'web', em, 1, sha, old_t, old_t
    from (values (a), (b), (c), (d), (e), (f), (g)) as x(id);
  insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256, source,
    role_at_acceptance, client, email_hmac, email_hmac_key_version)
    values (h, '1999-01-01', h1, '1999-01-01', h2, 'sign_up', 'owner', 'ios_app', em, 1);
  insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256, source,
    role_at_acceptance, client, email_hmac, email_hmac_key_version, accepted_at, recorded_at)
    values (a, '1999-01-02', h1, '1999-01-02', h2, 'invite', 'tenant', 'ios_app', em, 1, old_t, old_t)
    on conflict (profile_id, terms_version, privacy_version) do nothing;
  insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256, source,
    role_at_acceptance, client, email_hmac, email_hmac_key_version)
    values (a, '1999-01-01', h1, '1999-01-01', h2, 'agree_page', 'tenant', 'web', em, 1)
    on conflict (profile_id, terms_version, privacy_version) do nothing;
  select count(*) into n from public.legal_acceptances where profile_id = a;
  if n <> 2 then raise exception 'FAIL ignore-duplicates: a has % rows', n; end if;
  select count(*) into n from public.legal_acceptances where terms_document = 'terms' and privacy_document = 'privacy';
  if n <> 9 then raise exception 'FAIL generated document columns: % rows', n; end if;
  o := o || 'service insert + ignore-duplicates + generated columns ok; ';

  begin
    insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256, source,
      role_at_acceptance, client, email_hmac, email_hmac_key_version)
      values (b, '2000-01-01', h1, '1999-01-01', h2, 'agree_page', 'owner', 'web', em, 1);
    raise exception 'FAIL unpublished terms version accepted';
  exception when foreign_key_violation then o := o || 'unpublished version 23503; ';
  end;
  begin
    insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256, source,
      role_at_acceptance, client, email_hmac, email_hmac_key_version)
      values (b, '1999-01-02', h2, '1999-01-02', h2, 'agree_page', 'owner', 'web', em, 1);
    raise exception 'FAIL wrong terms hash accepted';
  exception when foreign_key_violation then o := o || 'wrong hash 23503; ';
  end;
  begin
    insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256, source,
      role_at_acceptance, client, email_hmac, email_hmac_key_version)
      values (b, '1999-01-02', h1, '1999-01-02', h2, 'client_api', 'owner', 'web', em, 1);
    raise exception 'FAIL bad source accepted';
  exception when check_violation then o := o || 'bad source 23514; ';
  end;
  begin
    insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256, source,
      role_at_acceptance, client, email_hmac, email_hmac_key_version)
      values (b, '1999-01-02', h1, '1999-01-02', h2, 'agree_page', 'admin', 'web', em, 1);
    raise exception 'FAIL bad role accepted';
  exception when check_violation then o := o || 'bad role 23514; ';
  end;
  begin
    insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256, source,
      role_at_acceptance, client, email_hmac, email_hmac_key_version)
      values (b, '1999-01-02', h1, '1999-01-02', h2, 'agree_page', 'owner', 'android', em, 1);
    raise exception 'FAIL bad client accepted';
  exception when check_violation then o := o || 'bad client 23514; ';
  end;
  begin
    insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256, source,
      role_at_acceptance, client, email_hmac, email_hmac_key_version)
      values (b, '1999-01-02', h1, '1999-01-02', h2, 'agree_page', 'owner', 'web', 'x', 1);
    raise exception 'FAIL bad email hmac accepted';
  exception when check_violation then o := o || 'bad hmac 23514; ';
  end;
  begin
    insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256, source,
      role_at_acceptance, client, email_hmac, email_hmac_key_version)
      values (b, '1999-01-02', h1, '1999-01-02', h2, 'agree_page', 'owner', 'web', em, 0);
    raise exception 'FAIL bad key version accepted';
  exception when check_violation then o := o || 'bad key version 23514; ';
  end;
  begin
    insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256, source,
      role_at_acceptance, client, email_hmac, email_hmac_key_version, app_commit)
      values (b, '1999-01-02', h1, '1999-01-02', h2, 'agree_page', 'owner', 'web', em, 1, 'NOT-A-SHA');
    raise exception 'FAIL bad commit accepted';
  exception when check_violation then o := o || 'bad commit 23514; ';
  end;
  begin
    insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256, source,
      role_at_acceptance, client, email_hmac, email_hmac_key_version, accepted_at)
      values (b, '1999-01-02', h1, '1999-01-02', h2, 'agree_page', 'owner', 'web', em, 1, now() + interval '1 hour');
    raise exception 'FAIL future accepted_at accepted';
  exception when check_violation then o := o || 'future accepted_at 23514; ';
  end;
  begin
    update public.legal_acceptances set source = 'invite' where profile_id = b;
    raise exception 'FAIL service update allowed';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    o := o || 'service update refused; ';
  end;
  begin
    delete from public.legal_acceptances where profile_id = b;
    raise exception 'FAIL service direct delete allowed';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    o := o || 'service delete refused; ';
  end;
  begin
    perform pg_catalog.set_config('app.legal_acceptances_purge', 'on', true);
    delete from public.legal_acceptances where profile_id = b;
    raise exception 'FAIL service delete with purge flag allowed';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    perform pg_catalog.set_config('app.legal_acceptances_purge', 'off', true);
    o := o || 'service delete with purge flag refused; ';
  end;
  begin
    truncate public.legal_acceptances;
    raise exception 'FAIL truncate allowed';
  exception when raise_exception or insufficient_privilege then
    if sqlerrm like 'FAIL%' then raise; end if;
    o := o || 'truncate refused; ';
  end;
  begin
    update public.legal_document_versions set sha256 = h2 where document = 'terms' and version = '1999-01-01';
    raise exception 'FAIL published version changed';
  exception when raise_exception or insufficient_privilege then
    if sqlerrm like 'FAIL%' then raise; end if;
    o := o || 'published version immutable; ';
  end;
  begin
    perform public.account_wipe_apply(jsonb_build_array(jsonb_build_object('table', 'legal_acceptances', 'kind', 'delete',
      'filters', jsonb_build_array(jsonb_build_object('column', 'profile_id', 'op', 'eq', 'value', b::text)))));
    raise exception 'FAIL account wipe touched legal_acceptances';
  exception when insufficient_privilege then o := o || 'account wipe refuses the table; ';
  end;
  reset role;

  begin
    insert into public.legal_document_versions (document, version, sha256) values ('terms', '1999-01-01', h2);
    raise exception 'FAIL second hash for a published version accepted';
  exception when unique_violation then o := o || 'one hash per version 23505; ';
  end;
  begin
    update public.legal_acceptances set client = 'web' where profile_id = a;
    raise exception 'FAIL owner update allowed';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    o := o || 'owner update refused; ';
  end;

  -- A signed-in person sees only their own rows and can write, purge or read holds/versions not at all.
  perform pg_catalog.set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  select count(*) into n from public.legal_acceptances;
  if n <> 2 then raise exception 'FAIL authenticated A sees % rows (want 2)', n; end if;
  begin
    insert into public.legal_acceptances (profile_id, terms_version, terms_sha256, privacy_version, privacy_sha256, source,
      role_at_acceptance, client, email_hmac, email_hmac_key_version)
      values (a, '1999-01-02', h1, '1999-01-02', h2, 'agree_page', 'tenant', 'web', em, 1);
    raise exception 'FAIL authenticated insert allowed';
  exception when insufficient_privilege then o := o || 'auth insert 42501; ';
  end;
  begin
    update public.legal_acceptances set source = 'invite';
    raise exception 'FAIL authenticated update allowed';
  exception when insufficient_privilege then o := o || 'auth update 42501; ';
  end;
  begin
    delete from public.legal_acceptances;
    raise exception 'FAIL authenticated delete allowed';
  exception when insufficient_privilege then o := o || 'auth delete 42501; ';
  end;
  begin
    select count(*) into n from public.legal_document_versions;
    raise exception 'FAIL authenticated reads published versions table';
  exception when insufficient_privilege then o := o || 'auth versions 42501; ';
  end;
  begin
    select count(*) into n from public.legal_holds;
    raise exception 'FAIL authenticated reads legal holds';
  exception when insufficient_privilege then o := o || 'auth holds 42501; ';
  end;
  begin
    insert into public.legal_holds (profile_id, reason) values (a, 'self-hold attempt');
    raise exception 'FAIL authenticated wrote a legal hold';
  exception when insufficient_privilege then o := o || 'auth hold write 42501; ';
  end;
  begin
    perform public.purge_expired_legal_acceptances('attacker');
    raise exception 'FAIL authenticated ran the purge';
  exception when insufficient_privilege then o := o || 'auth purge 42501; ';
  end;
  reset role;

  perform pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  select count(*) into n from public.legal_acceptances;
  if n <> 0 then raise exception 'FAIL authenticated with no sub sees % rows', n; end if;
  reset role;

  set local role anon;
  begin
    select count(*) into n from public.legal_acceptances;
    raise exception 'FAIL anon select allowed';
  exception when insufficient_privilege then o := o || 'anon select 42501; ';
  end;
  reset role;

  -- Anonymization (runbook C9) keeps the rows.
  update public.profiles set full_name = 'Deleted user', email = 'deleted+' || a::text || '@deleted.domusbase.invalid'
   where id = a;
  select count(*) into n from public.legal_acceptances where profile_id = a;
  if n <> 2 then raise exception 'FAIL anonymization changed rows (%)', n; end if;
  o := o || 'anonymization keeps rows; ';

  -- Purge anchors.
  insert into public.account_deletion_requests (profile_id, email_at_request, role_at_request, requested_at, status, handled_at)
  values (a, 'a@example.invalid', 'tenant', now() - interval '11 years 1 month', 'done', now() - interval '11 years'),
         (b, 'b@example.invalid', 'owner', now() - interval '9 years 1 month', 'done', now() - interval '9 years'),
         (c, 'c@example.invalid', 'owner', now() - interval '11 years 1 month', 'done', now() - interval '11 years'),
         (d, 'd@example.invalid', 'owner', now() - interval '11 years 1 month', 'done', now() - interval '11 years'),
         (d, 'd@example.invalid', 'owner', now() - interval '1 month', 'open', null),
         (e, 'e@example.invalid', 'owner', now() - interval '12 years', 'withdrawn', now() - interval '12 years'),
         (e, 'e@example.invalid', 'owner', now() - interval '11 years 1 month', 'done', now() - interval '11 years'),
         (f, 'f@example.invalid', 'owner', now() - interval '11 years 1 month', 'done', now() - interval '11 years'),
         (h, 'h@example.invalid', 'owner', now() - interval '11 years 1 month', 'done', now() - interval '11 years');
  insert into public.legal_holds (profile_id, reason) values (c, 'open dispute (test)');
  insert into public.legal_holds (profile_id, reason, released_at) values (f, 'old dispute (test)', now() - interval '1 year');

  set local role service_role;
  begin
    perform public.purge_expired_legal_acceptances('  ');
    raise exception 'FAIL purge ran without an approver';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    o := o || 'purge refuses blank approver; ';
  end;
  begin
    perform public.purge_expired_legal_acceptances(repeat('x', 101));
    raise exception 'FAIL purge ran with a 101-character approver';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    o := o || 'purge refuses long approver; ';
  end;
  begin
    perform public.purge_expired_legal_acceptances('owner' || chr(10) || 'x');
    raise exception 'FAIL purge ran with a control character';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    o := o || 'purge refuses control characters; ';
  end;
  select public.purge_expired_legal_acceptances(bad_approver) into n;
  if n <> 4 then raise exception 'FAIL purge removed % rows (want 4: A x2, E, F)', n; end if;
  reset role;
  if to_regclass('public.profiles') is null then raise exception 'FAIL approver text was executed'; end if;
  select count(*) into n from public.legal_acceptances where profile_id in (a, e, f);
  if n <> 0 then raise exception 'FAIL purge left % rows for A, E, F', n; end if;
  select count(*) into n from public.legal_acceptances where profile_id in (b, c, d, g, h);
  if n <> 5 then raise exception 'FAIL purge touched B, C, D, G or H (% rows left, want 5)', n; end if;
  select count(*) into n from public.audit_logs
   where action = 'legal_acceptances_purge' and metadata->>'rows' = '4' and metadata->>'approved_by' = bad_approver;
  if n <> 1 then raise exception 'FAIL purge audit row missing or approver altered'; end if;
  if current_setting('app.legal_acceptances_purge', true) = 'on' then raise exception 'FAIL purge flag left on'; end if;
  o := o || 'purge: 10y anchor, latest request, holds, post-closure rows, audit ok; ';

  -- Hard-deleting a real profile with records or an active hold is refused; test accounts and empty profiles go.
  begin
    delete from public.profiles where id = b;
    raise exception 'FAIL real profile with agreement records was deleted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    o := o || 'real profile with records kept; ';
  end;
  insert into public.profiles (id, full_name, email, role) values (j, 'Consent J', j::text || '@example.invalid', 'owner');
  insert into public.legal_holds (profile_id, reason) values (j, 'hold without records (test)');
  begin
    delete from public.profiles where id = j;
    raise exception 'FAIL real profile with an active hold was deleted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    o := o || 'real profile with active hold kept; ';
  end;
  delete from public.profiles where id = f;  -- rows purged, hold released
  if exists (select 1 from public.profiles where id = f) then raise exception 'FAIL empty profile not deleted'; end if;
  insert into public.profiles (id, full_name, email, role) values (k, 'Consent K', k::text || '@example.invalid', 'owner');
  delete from public.profiles where id = k;
  o := o || 'profiles without records or holds still delete; ';
  update public.profiles set is_tester = true where id = g;
  delete from public.profiles where id = g;
  select count(*) into n from public.legal_acceptances where profile_id = g;
  if n <> 0 then raise exception 'FAIL tester cascade left % rows', n; end if;
  select count(*) into n from public.legal_acceptances where profile_id in (b, c, d, h);
  if n <> 4 then raise exception 'FAIL others have % rows after the tester delete (want 4)', n; end if;
  o := o || 'tester profile deletes and cascades';

  raise exception 'SPRINT259A_SQL_TESTS_PASSED %', o;
end
$test$;
