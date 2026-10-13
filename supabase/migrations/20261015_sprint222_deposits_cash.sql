-- Sprint 222. Claude applies this migration after review.
create table public.lease_deposit_returns (
  lease_id uuid primary key references public.leases(id) on delete cascade,
  returned_cents integer not null check (returned_cents >= 0),
  returned_on date not null,
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
revoke all on public.lease_deposit_returns from public, anon, authenticated;
alter table public.lease_deposit_returns enable row level security;

create function public.lease_admin_visible(p_lease_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.leases l join public.units u on u.id = l.unit_id
    where l.id = p_lease_id and public.can_administer_property(u.property_id)
  );
$$;
revoke all on function public.lease_admin_visible(uuid) from public, anon, authenticated;
grant execute on function public.lease_admin_visible(uuid) to authenticated;
create policy lease_deposit_returns_admin_select on public.lease_deposit_returns
  for select to authenticated using (public.lease_admin_visible(lease_id));
grant select on public.lease_deposit_returns to authenticated;

create function public.lease_has_deposit_return(p_lease_id uuid)
returns boolean language sql volatile security definer set search_path = '' as $$
  select exists (select 1 from public.lease_deposit_returns where lease_id = p_lease_id);
$$;
revoke all on function public.lease_has_deposit_return(uuid) from public, anon, authenticated;

create function public.check_lease_deposit_return_bound()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_deposit integer;
begin
  select deposit_cents into v_deposit from public.leases where id = new.lease_id for update;
  if v_deposit is null or new.returned_cents > v_deposit then
    raise exception 'Amount returned cannot exceed the deposit.';
  end if;
  return new;
end $$;
revoke all on function public.check_lease_deposit_return_bound() from public, anon, authenticated;
create trigger lease_deposit_returns_bound before insert or update on public.lease_deposit_returns
  for each row execute function public.check_lease_deposit_return_bound();

create function public.freeze_returned_lease_deposit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.deposit_cents is distinct from old.deposit_cents
    and public.lease_has_deposit_return(old.id) then
    raise exception 'Undo the deposit return before changing the deposit.';
  end if;
  return new;
end $$;
revoke all on function public.freeze_returned_lease_deposit() from public, anon, authenticated;
create trigger leases_deposit_freeze before update of deposit_cents on public.leases
  for each row execute function public.freeze_returned_lease_deposit();

create function public.record_deposit_return(p_lease_id uuid, p_returned_cents integer,
  p_returned_on date, p_actor_profile_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_deposit integer; v_inserted uuid;
begin
  select deposit_cents into v_deposit from public.leases where id = p_lease_id for update;
  if v_deposit is null then raise exception 'Lease not found.'; end if;
  if p_returned_cents is null or p_returned_cents < 0 or p_returned_cents > v_deposit
    or p_returned_on is null or p_returned_on > current_date then
    raise exception 'Invalid deposit return.';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_profile_id) then
    raise exception 'Actor profile not found.';
  end if;
  insert into public.lease_deposit_returns(lease_id, returned_cents, returned_on, created_by_profile_id)
    values (p_lease_id, p_returned_cents, p_returned_on, p_actor_profile_id)
    on conflict (lease_id) do nothing returning lease_id into v_inserted;
  if v_inserted is null then return 'already'; end if;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
    values (p_actor_profile_id, 'deposit_return_recorded', 'lease', p_lease_id,
      jsonb_build_object('returned_cents', p_returned_cents, 'returned_on', p_returned_on));
  return 'recorded';
end $$;
revoke all on function public.record_deposit_return(uuid,integer,date,uuid) from public, anon, authenticated;
grant execute on function public.record_deposit_return(uuid,integer,date,uuid) to service_role;

create function public.clear_deposit_return(p_lease_id uuid, p_actor_profile_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_deleted uuid;
begin
  if not exists (select 1 from public.profiles where id = p_actor_profile_id) then
    raise exception 'Actor profile not found.';
  end if;
  delete from public.lease_deposit_returns where lease_id = p_lease_id returning lease_id into v_deleted;
  if v_deleted is null then return 'none'; end if;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
    values (p_actor_profile_id, 'deposit_return_cleared', 'lease', p_lease_id, '{}'::jsonb);
  return 'cleared';
end $$;
revoke all on function public.clear_deposit_return(uuid,uuid) from public, anon, authenticated;
grant execute on function public.clear_deposit_return(uuid,uuid) to service_role;

alter table public.bank_accounts add column balance_cents bigint;
alter table public.bank_accounts add column balance_as_of timestamptz;
alter table public.bank_accounts add column balance_source text
  check (balance_source in ('plaid', 'manual'));
alter table public.bank_accounts add column account_type text;
alter table public.bank_accounts add column iso_currency_code text;
alter table public.bank_accounts add constraint bank_accounts_balance_triple check (
  (balance_cents is null and balance_as_of is null and balance_source is null) or
  (balance_cents is not null and balance_as_of is not null and balance_source is not null)
);
-- Existing bank_accounts privilege is select-only for authenticated; no client write grant is added.

create function public.save_bank_balances(p_connection_id uuid, p_lease_token uuid,
  p_balances jsonb, p_complete boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_connection uuid;
begin
  select id into v_connection from public.bank_connections
    where id = p_connection_id and sync_lease_token = p_lease_token
      and sync_lease_until > now() and status in ('ok', 'error') for update;
  if v_connection is null then return false; end if;
  if jsonb_typeof(p_balances) <> 'array' or p_complete is null then
    raise exception 'Invalid balance snapshot.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_balances) as x(plaid_account_id text)
    group by x.plaid_account_id having x.plaid_account_id is null or count(*) > 1) then
    raise exception 'Duplicate or missing Plaid account id.';
  end if;
  update public.bank_accounts b set
    account_type = x.account_type, account_subtype = x.subtype, iso_currency_code = x.currency,
    balance_cents = case when x.account_type = 'depository'
      and x.subtype in ('checking', 'savings', 'cash management', 'money market')
      and x.currency = 'USD' and x.cents is not null then x.cents else null end,
    balance_as_of = case when x.account_type = 'depository'
      and x.subtype in ('checking', 'savings', 'cash management', 'money market')
      and x.currency = 'USD' and x.cents is not null then x.as_of else null end,
    balance_source = case when x.account_type = 'depository'
      and x.subtype in ('checking', 'savings', 'cash management', 'money market')
      and x.currency = 'USD' and x.cents is not null then 'plaid' else null end
  from jsonb_to_recordset(p_balances) as x(plaid_account_id text, account_type text,
    subtype text, currency text, cents bigint, as_of timestamptz)
  where b.connection_id = p_connection_id and b.source = 'plaid'
    and b.plaid_account_id = x.plaid_account_id;
  if p_complete then
    update public.bank_accounts b set balance_cents = null, balance_as_of = null, balance_source = null
    where b.connection_id = p_connection_id and b.source = 'plaid'
      and not exists (select 1 from jsonb_to_recordset(p_balances) as x(plaid_account_id text)
        where x.plaid_account_id = b.plaid_account_id);
  end if;
  return true;
end $$;
revoke all on function public.save_bank_balances(uuid,uuid,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.save_bank_balances(uuid,uuid,jsonb,boolean) to service_role;
