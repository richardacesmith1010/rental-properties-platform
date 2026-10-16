begin;
do $fixture$
declare
  own uuid := gen_random_uuid();
  mgr uuid := gen_random_uuid();
  ten uuid := gen_random_uuid();
  other_owner uuid := gen_random_uuid();
  account_id uuid := gen_random_uuid();
  client_id uuid;
  n integer;
  result text;
begin
  if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = 'set_managers_can_send_reminders'
      and p.proowner = 'postgres'::regrole and p.prosecdef) then
    raise exception 'RPC owner/security definer changed';
  end if;
  insert into public.profiles(id, full_name, email, role) values
    (own, 'Reminder Owner', own::text || '@example.invalid', 'owner'),
    (mgr, 'Reminder Manager', mgr::text || '@example.invalid', 'manager'),
    (ten, 'Reminder Tenant', ten::text || '@example.invalid', 'tenant'),
    (other_owner, 'Other Owner', other_owner::text || '@example.invalid', 'owner');
  insert into public.ownership_accounts(id, display_name, account_type, created_by_profile_id)
    values (account_id, 'Reminder Account', 'individual', own);
  insert into public.ownership_account_members(account_id, profile_id, member_role, active)
    values (account_id, own, 'owner', true);
  result := public.set_managers_can_send_reminders(account_id, own, true);
  if result <> 'ok' or not (select managers_can_send_reminders from public.ownership_accounts where id = account_id)
    then raise exception 'owner could not enable setting'; end if;
  select count(*) into n from public.audit_logs where entity_id = account_id and action = 'set_manager_reminders';
  if n <> 1 then raise exception 'expected one audit row'; end if;
  if public.set_managers_can_send_reminders(account_id, own, true) <> 'unchanged' then
    raise exception 'same value did not return unchanged'; end if;
  if (select count(*) from public.audit_logs where entity_id = account_id and action = 'set_manager_reminders') <> 1 then
    raise exception 'unchanged write added an audit row'; end if;
  if public.set_managers_can_send_reminders(account_id, mgr, false) <> 'not_allowed'
    or public.set_managers_can_send_reminders(account_id, ten, false) <> 'not_allowed'
    or public.set_managers_can_send_reminders(account_id, other_owner, false) <> 'not_allowed'
    or public.set_managers_can_send_reminders(account_id, gen_random_uuid(), false) <> 'not_allowed' then
    raise exception 'nonmember actor was allowed'; end if;
  if public.set_managers_can_send_reminders(gen_random_uuid(), own, true) <> 'not_found' then
    raise exception 'missing account result changed'; end if;
  client_id := public.create_client_account(mgr, 'individual', 'Reminder Client', null);
  if public.set_managers_can_send_reminders(client_id, own, true) <> 'client_account' then
    raise exception 'client account result changed'; end if;
  if (select managers_can_send_reminders from public.ownership_accounts where id = client_id) then
    raise exception 'client default is on'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', own::text, true);
  begin
    perform public.set_managers_can_send_reminders(account_id, own, false);
    raise exception 'authenticated executed RPC';
  exception when insufficient_privilege then null; end;
  begin
    update public.ownership_accounts set managers_can_send_reminders = false where id = account_id;
    raise exception 'direct authenticated update succeeded';
  exception when raise_exception then
    if sqlerrm <> 'managers_can_send_reminders is changed only by set_managers_can_send_reminders' then raise; end if;
  end;
  perform set_config('domus.allow_manager_reminder_write', 'on', true);
  begin
    update public.ownership_accounts set managers_can_send_reminders = false where id = account_id;
    raise exception 'marker-only attacker update succeeded';
  exception when raise_exception then
    if sqlerrm <> 'managers_can_send_reminders is changed only by set_managers_can_send_reminders' then raise; end if;
  end;
  begin
    insert into public.ownership_accounts(display_name, account_type, created_by_profile_id, managers_can_send_reminders)
      values ('Attack', 'individual', own, true);
    raise exception 'direct authenticated insert succeeded';
  exception when raise_exception then
    if sqlerrm <> 'managers_can_send_reminders is changed only by set_managers_can_send_reminders' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  -- Client accounts have no creator, so RLS usually filters the row (0 rows); either 0 rows or the guard error is safe.
  begin
    update public.ownership_accounts set managers_can_send_reminders = true where id = client_id;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'manager changed client account'; end if;
  exception when raise_exception then
    if sqlerrm <> 'managers_can_send_reminders is changed only by set_managers_can_send_reminders' then raise; end if;
  end;
  reset role;

  perform set_config('domus.client_sync', 'on', true);
  update public.ownership_accounts set managed_client = true where id = account_id;
  if (select managers_can_send_reminders from public.ownership_accounts where id = account_id) then
    raise exception 'conversion did not turn permission off'; end if;
  alter table public.ownership_accounts disable trigger ownership_accounts_guard_manager_reminder_write;
  begin
    update public.ownership_accounts set managers_can_send_reminders = true where id = account_id;
    raise exception 'check constraint allowed client permission';
  exception when check_violation then null; end;
  alter table public.ownership_accounts enable trigger ownership_accounts_guard_manager_reminder_write;
  raise notice 'Sprint237b manager reminder fixture passed';
end;
$fixture$;
rollback;
