-- Sprint 205: client accounts groundwork (design: docs/manager-client-accounts-design.md rev 3).
-- A client account = an ownership account run by a manager for an owner who is not on Domus.
-- Homes in an unclaimed client account have owner_profile_id = NULL, so every existing
-- "owner_profile_id = auth.uid()" policy fails closed for them; managers reach them only through
-- property_managers (the same path managers use today).

-- 1) Homes may have no owner profile (client homes, until claimed).
alter table public.properties alter column owner_profile_id drop not null;

-- 2) Client-account fields on ownership accounts.
alter table public.ownership_accounts
  add column managed_client boolean not null default false,
  add column claim_state text not null default 'claimed' check (claim_state in ('claimed', 'unclaimed')),
  add column client_contact_email text,
  add column claimed_at timestamptz,
  add column claimed_by_profile_id uuid references public.profiles(id) on delete set null,
  add constraint ownership_accounts_client_state_check
    check (managed_client or claim_state = 'claimed');

-- 3) Canonical manager authority for client accounts.
create table public.ownership_account_managers (
  account_id uuid not null references public.ownership_accounts(id) on delete cascade,
  manager_profile_id uuid not null references public.profiles(id) on delete cascade,
  manager_role text not null default 'creator' check (manager_role in ('creator', 'manager')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (account_id, manager_profile_id)
);
alter table public.ownership_account_managers enable row level security;
revoke all on public.ownership_account_managers from anon, authenticated;
grant select on public.ownership_account_managers to authenticated;
grant all on public.ownership_account_managers to service_role;
create policy ownership_account_managers_select_self on public.ownership_account_managers
  for select to authenticated using (manager_profile_id = auth.uid());

-- 4) Atomic creation: client account + its first home + the derived manager assignment.
--    Callable only by the service role (server actions check auth first).
create or replace function public.create_client_account(
  p_manager uuid, p_account_type text, p_client_name text, p_client_email text
) returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare v_account uuid;
begin
  if p_account_type not in ('individual', 'llc') then raise exception 'invalid account type'; end if;
  if coalesce(trim(p_client_name), '') = '' then raise exception 'client name required'; end if;
  if not exists (select 1 from public.profiles where id = p_manager and role = 'manager') then
    raise exception 'manager required';
  end if;
  insert into public.ownership_accounts
    (account_type, display_name, created_by_profile_id, managed_client, claim_state, client_contact_email)
  values (p_account_type, trim(p_client_name), p_manager, true, 'unclaimed', nullif(trim(p_client_email), ''))
  returning id into v_account;
  insert into public.ownership_account_managers (account_id, manager_profile_id, manager_role)
  values (v_account, p_manager, 'creator');
  return v_account;
end $fn$;

create or replace function public.add_client_home(
  p_manager uuid, p_account uuid, p_name text, p_address_line1 text, p_city text,
  p_state text, p_postal_code text, p_property_type text
) returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare v_property uuid;
begin
  -- Same lock order as the future claim function: the account row first.
  perform 1 from public.ownership_accounts
    where id = p_account and managed_client and claim_state = 'unclaimed' for update;
  if not found then raise exception 'not an unclaimed client account'; end if;
  if not exists (select 1 from public.ownership_account_managers
                 where account_id = p_account and manager_profile_id = p_manager and active) then
    raise exception 'not a manager of this client';
  end if;
  insert into public.properties
    (owner_profile_id, owner_account_id, name, address_line1, city, state, postal_code, property_type)
  values (null, p_account, p_name, p_address_line1, p_city, p_state, p_postal_code, p_property_type)
  returning id into v_property;
  insert into public.property_managers (property_id, manager_profile_id, active)
  values (v_property, p_manager, true)
  on conflict (property_id, manager_profile_id) do update set active = true;
  return v_property;
end $fn$;

revoke execute on function public.create_client_account(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.add_client_home(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_client_account(uuid, text, text, text) to service_role;
grant execute on function public.add_client_home(uuid, uuid, text, text, text, text, text, text) to service_role;
