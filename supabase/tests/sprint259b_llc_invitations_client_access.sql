-- Sprint 259b attacker checks for public.llc_invitations. Nothing is kept: the block always ends by raising.
-- Dry run: send the migration and this file in one call. After the live apply: send this file alone.
-- Pass = the error text starts with SPRINT259B_SQL_TESTS_PASSED.
do $test$
declare
  member uuid := (select profile_id from public.ownership_account_members where active limit 1);
  n integer;
  o text := '';
begin
  perform pg_catalog.set_config('request.jwt.claims',
    json_build_object('sub', coalesce(member, gen_random_uuid()), 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(member, gen_random_uuid())::text, true);
  set local role authenticated;
  begin
    perform token from public.llc_invitations limit 1;
    raise exception 'FAIL authenticated read a token';
  exception when insufficient_privilege then o := o || 'member token read 42501; ';
  end;
  begin
    select count(*) into n from public.llc_invitations;
    raise exception 'FAIL authenticated read invitations';
  exception when insufficient_privilege then o := o || 'member row read 42501; ';
  end;
  begin
    update public.llc_invitations set status = 'cancelled' where false;
    raise exception 'FAIL authenticated could update';
  exception when insufficient_privilege then o := o || 'member update 42501; ';
  end;
  begin
    insert into public.llc_invitations (ownership_account_id, invited_by, email)
    values (gen_random_uuid(), gen_random_uuid(), 'x@example.invalid');
    raise exception 'FAIL authenticated could insert';
  exception when insufficient_privilege then o := o || 'member insert 42501; ';
  end;
  reset role;
  set local role anon;
  begin
    perform token from public.llc_invitations limit 1;
    raise exception 'FAIL anon read a token';
  exception when insufficient_privilege then o := o || 'anon read 42501; ';
  end;
  reset role;
  set local role service_role;
  select count(*) into n from public.llc_invitations;
  o := o || 'service role reads ' || n || ' row(s); ';
  reset role;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'llc_invitations') <> 0 then
    raise exception 'FAIL client policies remain';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.llc_invitations'::regclass) then
    raise exception 'FAIL RLS is off';
  end if;
  if exists (select 1 from pg_depend d join pg_rewrite rw on rw.oid = d.objid
             where d.refobjid = 'public.llc_invitations'::regclass and rw.ev_class <> 'public.llc_invitations'::regclass) then
    raise exception 'FAIL a view depends on llc_invitations';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.prokind = 'f' and p.prosrc ilike '%llc_invitations%') then
    raise exception 'FAIL a function references llc_invitations';
  end if;
  if exists (select 1 from information_schema.column_privileges where table_schema = 'public'
             and table_name = 'llc_invitations' and grantee in ('anon', 'authenticated')) then
    raise exception 'FAIL a client column privilege remains';
  end if;
  o := o || 'RLS on, no views, no functions, no client column privileges; ';
  o := o || 'no client policies';
  raise exception 'SPRINT259B_SQL_TESTS_PASSED %', o;
end
$test$;
