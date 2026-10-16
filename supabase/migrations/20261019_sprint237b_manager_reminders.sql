alter table public.ownership_accounts
  add column managers_can_send_reminders boolean not null default false;

alter table public.ownership_accounts
  add constraint ownership_accounts_no_client_manager_reminders
  check (not (managed_client and managers_can_send_reminders));

create function public.guard_manager_reminder_write()
returns trigger
language plpgsql security invoker set search_path = ''
as $fn$
declare
  v_changed boolean;
begin
  if tg_op = 'INSERT' then
    v_changed := new.managers_can_send_reminders;
  else
    if new.managed_client and not old.managed_client then
      new.managers_can_send_reminders := false;
    end if;
    v_changed := new.managers_can_send_reminders is distinct from old.managers_can_send_reminders
      and not (new.managed_client and not old.managed_client);
  end if;
  if v_changed then
    if current_setting('domus.allow_manager_reminder_write', true) is distinct from 'on'
       or current_user <> 'postgres' then
      raise exception 'managers_can_send_reminders is changed only by set_managers_can_send_reminders';
    end if;
  end if;
  return new;
end;
$fn$;

create trigger ownership_accounts_guard_manager_reminder_write
before insert or update on public.ownership_accounts
for each row execute function public.guard_manager_reminder_write();

revoke execute on function public.guard_manager_reminder_write() from public, anon, authenticated;

create function public.set_managers_can_send_reminders(
  p_account_id uuid, p_actor_id uuid, p_value boolean
) returns text
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_account public.ownership_accounts%rowtype;
begin
  select * into v_account from public.ownership_accounts where id = p_account_id for update;
  if not found then return 'not_found'; end if;
  if v_account.managed_client then return 'client_account'; end if;
  if not exists (
    select 1 from public.ownership_account_members m
    where m.account_id = p_account_id and m.profile_id = p_actor_id
      and m.member_role = 'owner' and m.active = true
  ) then return 'not_allowed'; end if;
  if v_account.managers_can_send_reminders is not distinct from p_value then return 'unchanged'; end if;
  if p_value is null then return 'not_allowed'; end if;
  perform pg_catalog.set_config('domus.allow_manager_reminder_write', 'on', true);
  update public.ownership_accounts set managers_can_send_reminders = p_value where id = p_account_id;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'set_manager_reminders', 'ownership_account', p_account_id,
    pg_catalog.jsonb_build_object('before', v_account.managers_can_send_reminders, 'after', p_value));
  return 'ok';
end;
$fn$;

revoke execute on function public.set_managers_can_send_reminders(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_managers_can_send_reminders(uuid, uuid, boolean) to service_role;
