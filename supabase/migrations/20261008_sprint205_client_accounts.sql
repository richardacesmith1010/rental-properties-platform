-- Sprint 205 (rev 2): client accounts groundwork (design: docs/manager-client-accounts-design.md rev 3).
-- A client account = an ownership account run by a manager for an owner who is not on Domus.
--
-- Security model (rev 2, after ChatGPT REJECT of rev 1):
--  * ownership_account_managers is the ONLY source of manager authority for client accounts.
--    property_managers rows for client homes are derived and can only be written by the
--    client functions/sync trigger (guard trigger, enforced for every role incl. service_role).
--  * Client accounts have created_by_profile_id = NULL (the creator lives in
--    ownership_account_managers.manager_role = 'creator'). Every live "creator" entitlement
--    (can_administer_property branch 3, is_creator_of_account, ownership_accounts update policy,
--    ownership_account_members insert policy, canUserAdministerOwnershipAccount in TS) therefore
--    fails closed for client accounts.
--  * Unclaimed client accounts can't hold owner members, Stripe/Plaid links or a join code.
--  * Leases on unclaimed client homes are always collects_outside_domus = true (trigger).
--  * Property ownership columns are read-only for anon/authenticated on ALL homes
--    (closes a pre-existing hole: an assigned manager could rewrite owner_profile_id).
--  * Writes that bypass the guards require BOTH the transaction-local flag domus.client_sync = 'on'
--    (set only inside the client functions / sync trigger) AND a non-user request role.

-- 0) Preflight: refuse to run against an unexpected live schema (L-012).
do $pre$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'ownership_accounts' and column_name = 'managed_client') then
    raise exception 'preflight: ownership_accounts.managed_client already exists';
  end if;
  if to_regclass('public.ownership_account_managers') is not null then
    raise exception 'preflight: ownership_account_managers already exists';
  end if;
  if md5(pg_get_functiondef('public.can_administer_property(uuid)'::regprocedure))
     <> '3ca6005c3fc63d37b868cfd1f1d340d2' then
    raise exception 'preflight: can_administer_property differs from the reviewed live definition';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'property_managers_pkey')
     <> 'PRIMARY KEY (property_id, manager_profile_id)' then
    raise exception 'preflight: property_managers primary key changed';
  end if;
  if exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
             join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and not t.tgisinternal
               and c.relname in ('properties', 'property_managers', 'ownership_accounts',
                                 'ownership_account_members', 'leases', 'invitations')) then
    raise exception 'preflight: unexpected user triggers on guarded tables';
  end if;
end $pre$;

-- 1) Homes may have no owner profile (client homes, until claimed). Guarded by trigger in 5a.
alter table public.properties alter column owner_profile_id drop not null;

-- 2) Client-account fields on ownership accounts.
alter table public.ownership_accounts
  add column managed_client boolean not null default false,
  add column claim_state text not null default 'claimed' check (claim_state in ('claimed', 'unclaimed')),
  add column client_contact_email text check (client_contact_email is null or length(client_contact_email) <= 254),
  add column claimed_at timestamptz,
  add column claimed_by_profile_id uuid references public.profiles(id) on delete set null,
  add constraint ownership_accounts_client_state_check
    check (managed_client or claim_state = 'claimed'),
  add constraint ownership_accounts_unclaimed_no_claim_meta_check
    check (claim_state = 'claimed' or (claimed_at is null and claimed_by_profile_id is null)),
  add constraint ownership_accounts_client_no_creator_check
    check (not managed_client or claim_state = 'claimed' or created_by_profile_id is null),
  add constraint ownership_accounts_unclaimed_no_money_links_check
    check (claim_state = 'claimed' or (stripe_account_id is null and plaid_access_token is null
           and plaid_item_id is null and join_code is null));

-- 3) Canonical manager authority for client accounts.
create table public.ownership_account_managers (
  account_id uuid not null references public.ownership_accounts(id) on delete cascade,
  manager_profile_id uuid not null references public.profiles(id) on delete cascade,
  manager_role text not null default 'creator' check (manager_role in ('creator', 'manager')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, manager_profile_id)
);
create index ownership_account_managers_manager_idx
  on public.ownership_account_managers (manager_profile_id) where active;
alter table public.ownership_account_managers enable row level security;
revoke all on public.ownership_account_managers from anon, authenticated;
grant select on public.ownership_account_managers to authenticated;
grant all on public.ownership_account_managers to service_role;
create policy ownership_account_managers_select_self on public.ownership_account_managers
  for select to authenticated using (manager_profile_id = auth.uid());

-- 4) Helpers.
-- The caller's request role. PostgREST runs requests as SET ROLE authenticated/anon/service_role;
-- SECURITY DEFINER changes current_user but not this setting, so it identifies the real caller.
create or replace function public.domus_caller_is_user() returns boolean
language sql stable set search_path = ''
as $fn$ select coalesce(nullif(current_setting('role', true), ''), 'none') in ('authenticated', 'anon'); $fn$;

-- Guarded client writes need the transaction-local flag (set only inside the client functions/sync
-- trigger, which authenticated/anon can't execute) AND a non-user caller.
create or replace function public.domus_client_sync_allowed() returns boolean
language sql stable set search_path = ''
as $fn$
  select coalesce(current_setting('domus.client_sync', true), '') = 'on' and not public.domus_caller_is_user();
$fn$;

revoke execute on function public.domus_client_sync_allowed() from public, anon, authenticated;
revoke execute on function public.domus_caller_is_user() from public, anon, authenticated;

-- 5a) properties: ownership columns read-only for users; null owner only for unclaimed clients;
--     client homes are created/re-owned only through the client functions.
create or replace function public.properties_guard_ownership() returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_new_client boolean := false; v_new_unclaimed boolean := false; v_old_client boolean := false;
  v_changed boolean;
begin
  select coalesce(oa.managed_client, false), coalesce(oa.managed_client and oa.claim_state = 'unclaimed', false)
    into v_new_client, v_new_unclaimed
    from public.ownership_accounts oa where oa.id = new.owner_account_id;
  v_new_client := coalesce(v_new_client, false);
  v_new_unclaimed := coalesce(v_new_unclaimed, false);
  if tg_op = 'UPDATE' then
    select coalesce(oa.managed_client, false) into v_old_client
      from public.ownership_accounts oa where oa.id = old.owner_account_id;
    v_old_client := coalesce(v_old_client, false);
    v_changed := new.owner_profile_id is distinct from old.owner_profile_id
              or new.owner_account_id is distinct from old.owner_account_id;
    if v_changed and public.domus_caller_is_user() then
      raise exception 'home ownership can''t be changed here' using errcode = '42501';
    end if;
  else
    v_changed := true;
  end if;
  if new.owner_profile_id is null and not v_new_unclaimed then
    raise exception 'a home needs an owner unless it is in an unclaimed client account' using errcode = '23514';
  end if;
  if new.owner_profile_id is not null and v_new_unclaimed then
    raise exception 'homes in an unclaimed client account have no owner profile' using errcode = '23514';
  end if;
  if v_changed and (v_new_client or v_old_client) and not public.domus_client_sync_allowed() then
    raise exception 'client homes are changed only through client functions' using errcode = '42501';
  end if;
  return new;
end $fn$;
create trigger properties_guard_ownership before insert or update on public.properties
  for each row execute function public.properties_guard_ownership();

-- 5b) property_managers rows for client homes are derived; only the client functions write them.
create or replace function public.property_managers_guard_client() returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare v_pid uuid := coalesce(new.property_id, old.property_id); v_client boolean;
begin
  select oa.managed_client into v_client
    from public.properties p join public.ownership_accounts oa on oa.id = p.owner_account_id
    where p.id = v_pid;
  -- on cascade delete of the home the property row is gone -> not a client row anymore
  if coalesce(v_client, false) and not public.domus_client_sync_allowed() then
    raise exception 'client home managers are set through the client account' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.property_id is distinct from old.property_id then
    raise exception 'property_managers.property_id is immutable' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $fn$;
create trigger property_managers_guard_client before insert or update or delete on public.property_managers
  for each row execute function public.property_managers_guard_client();

-- 5c) ownership_accounts: client flags and claim fields only through client functions.
create or replace function public.ownership_accounts_guard_client() returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    if (new.managed_client or new.claim_state <> 'claimed' or new.claimed_at is not null
        or new.claimed_by_profile_id is not null) and not public.domus_client_sync_allowed() then
      raise exception 'client accounts are created only through create_client_account' using errcode = '42501';
    end if;
    return new;
  end if;
  if (new.managed_client is distinct from old.managed_client
      or new.claim_state is distinct from old.claim_state
      or new.claimed_at is distinct from old.claimed_at
      or new.claimed_by_profile_id is distinct from old.claimed_by_profile_id
      or (old.managed_client and new.created_by_profile_id is distinct from old.created_by_profile_id))
     and not public.domus_client_sync_allowed() then
    raise exception 'client account state changes only through client functions' using errcode = '42501';
  end if;
  if new.claim_state = 'claimed' and old.claim_state = 'unclaimed' and exists (
       select 1 from public.properties p where p.owner_account_id = new.id and p.owner_profile_id is null) then
    raise exception 'claim must set the owner on every home first' using errcode = '23514';
  end if;
  return new;
end $fn$;
create trigger ownership_accounts_guard_client before insert or update on public.ownership_accounts
  for each row execute function public.ownership_accounts_guard_client();

-- 5d) No owner members on an unclaimed client account (join code, owner invite, creator policy).
create or replace function public.ownership_account_members_guard_client() returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  -- Contract: on ANY managed-client account (unclaimed or claimed) memberships are created/changed
  -- only by the controlled client functions (the v1.1 claim function creates the first owner
  -- membership atomically with the claim). Generic paths (join code, inviteOwner, creator policy,
  -- handle_new_user) can never grant owner authority on a client account.
  if exists (select 1 from public.ownership_accounts oa
             where oa.id in (new.account_id, case when tg_op = 'UPDATE' then old.account_id end)
               and oa.managed_client)
     and not public.domus_client_sync_allowed() then
    raise exception 'client account members are set only through client functions' using errcode = '42501';
  end if;
  return new;
end $fn$;
create trigger ownership_account_members_guard_client before insert or update on public.ownership_account_members
  for each row execute function public.ownership_account_members_guard_client();

-- 5e) Leases on unclaimed client homes always collect outside Domus (all roles, all paths).
create or replace function public.leases_force_outside_for_clients() returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  if exists (select 1 from public.units u join public.properties p on p.id = u.property_id
             join public.ownership_accounts oa on oa.id = p.owner_account_id
             where u.id = new.unit_id and oa.managed_client and oa.claim_state = 'unclaimed') then
    new.collects_outside_domus := true;
  end if;
  return new;
end $fn$;
create trigger leases_force_outside_for_clients before insert or update on public.leases
  for each row execute function public.leases_force_outside_for_clients();

-- 5f) Manager/owner invitations into unclaimed client homes/accounts are refused (tenants allowed).
create or replace function public.invitations_guard_client() returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.role in ('manager', 'owner') and not public.domus_client_sync_allowed() and (
       exists (select 1 from public.properties p join public.ownership_accounts oa on oa.id = p.owner_account_id
               where p.id = new.property_id and oa.managed_client and oa.claim_state = 'unclaimed')
    or exists (select 1 from public.ownership_accounts oa where oa.id = new.ownership_account_id
               and oa.managed_client and oa.claim_state = 'unclaimed')) then
    raise exception 'this client account can''t take manager or owner invitations yet' using errcode = '42501';
  end if;
  return new;
end $fn$;
create trigger invitations_guard_client before insert or update on public.invitations
  for each row execute function public.invitations_guard_client();

-- 5g) ownership_account_managers -> derived property_managers rows (single source of truth).
create or replace function public.ownership_account_managers_touch() returns trigger
language plpgsql set search_path = ''
as $fn$
begin
  if new.account_id is distinct from old.account_id or new.manager_profile_id is distinct from old.manager_profile_id then
    raise exception 'ownership_account_managers keys are immutable' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $fn$;
create trigger ownership_account_managers_touch before update on public.ownership_account_managers
  for each row execute function public.ownership_account_managers_touch();

create or replace function public.ownership_account_managers_sync() returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare v_account uuid := coalesce(new.account_id, old.account_id);
        v_manager uuid := coalesce(new.manager_profile_id, old.manager_profile_id);
        v_active boolean := case when tg_op = 'DELETE' then false else new.active end;
        v_prev text := coalesce(current_setting('domus.client_sync', true), '');
begin
  -- Same lock order as add_client_home/claim: the account row first. Concurrent home creation
  -- waits here, and the update below (new statement snapshot) also sees homes committed meanwhile.
  perform 1 from public.ownership_accounts where id = v_account for update;
  perform set_config('domus.client_sync', 'on', true);
  if v_active then
    insert into public.property_managers (property_id, manager_profile_id, active)
      select p.id, v_manager, true from public.properties p where p.owner_account_id = v_account
      on conflict (property_id, manager_profile_id) do update set active = true;
  else
    update public.property_managers pm set active = false
      from public.properties p
      where p.id = pm.property_id and p.owner_account_id = v_account and pm.manager_profile_id = v_manager;
  end if;
  perform set_config('domus.client_sync', v_prev, true);
  return null;
end $fn$;
create trigger ownership_account_managers_sync after insert or update or delete on public.ownership_account_managers
  for each row execute function public.ownership_account_managers_sync();

revoke execute on function public.properties_guard_ownership() from public, anon, authenticated;
revoke execute on function public.property_managers_guard_client() from public, anon, authenticated;
revoke execute on function public.ownership_accounts_guard_client() from public, anon, authenticated;
revoke execute on function public.ownership_account_members_guard_client() from public, anon, authenticated;
revoke execute on function public.leases_force_outside_for_clients() from public, anon, authenticated;
revoke execute on function public.invitations_guard_client() from public, anon, authenticated;
revoke execute on function public.ownership_account_managers_touch() from public, anon, authenticated;
revoke execute on function public.ownership_account_managers_sync() from public, anon, authenticated;

-- 6) can_administer_property: the manager branch also requires an active client link for client
--    homes (belt and braces on top of the sync trigger). Branches 1 and 3 are unchanged
--    (branch 3 fails closed for clients because created_by_profile_id is NULL).
create or replace function public.can_administer_property(target_property_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select exists (
    select 1
    from public.properties p
    join public.ownership_account_members oam on oam.account_id = p.owner_account_id
    where p.id = target_property_id
      and oam.profile_id = auth.uid()
      and oam.member_role = 'owner'
      and oam.active = true
  )
  or exists (
    select 1
    from public.property_managers pm
    join public.properties p on p.id = pm.property_id
    left join public.ownership_accounts oa on oa.id = p.owner_account_id
    where pm.property_id = target_property_id
      and pm.manager_profile_id = auth.uid()
      and pm.active = true
      and (coalesce(oa.managed_client, false) = false or exists (
        select 1 from public.ownership_account_managers x
        where x.account_id = oa.id and x.manager_profile_id = auth.uid() and x.active = true))
  )
  or exists (
    select 1
    from public.properties p
    join public.ownership_accounts oa on oa.id = p.owner_account_id
    where p.id = target_property_id
      and oa.created_by_profile_id = auth.uid()
  );
$function$;

-- 7) Client functions (service role only; server actions check auth first).
create or replace function public.create_client_account(
  p_manager uuid, p_account_type text, p_client_name text, p_client_email text
) returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare v_account uuid; v_name text := trim(coalesce(p_client_name, ''));
        v_email text := nullif(lower(trim(coalesce(p_client_email, ''))), '');
        v_prev text := coalesce(current_setting('domus.client_sync', true), '');
begin
  if p_account_type is null or p_account_type not in ('individual', 'llc') then
    raise exception 'invalid account type' using errcode = '22023';
  end if;
  if length(v_name) < 1 or length(v_name) > 120 then raise exception 'invalid client name' using errcode = '22023'; end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid client email' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_manager and role = 'manager') then
    raise exception 'manager required' using errcode = '42501';
  end if;
  perform set_config('domus.client_sync', 'on', true);
  insert into public.ownership_accounts
    (account_type, display_name, created_by_profile_id, managed_client, claim_state, client_contact_email, join_code)
  values (p_account_type, v_name, null, true, 'unclaimed', v_email, null)
  returning id into v_account;
  insert into public.ownership_account_managers (account_id, manager_profile_id, manager_role)
  values (v_account, p_manager, 'creator');
  perform set_config('domus.client_sync', v_prev, true);
  return v_account;
end $fn$;

create or replace function public.add_client_home(
  p_manager uuid, p_account uuid, p_name text, p_address_line1 text, p_city text,
  p_state text, p_postal_code text, p_property_type text
) returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare v_property uuid; v_state text := upper(trim(coalesce(p_state, '')));
        v_type text := nullif(trim(coalesce(p_property_type, '')), '');
        v_prev text := coalesce(current_setting('domus.client_sync', true), '');
begin
  if length(trim(coalesce(p_name, ''))) not between 1 and 120
     or length(trim(coalesce(p_address_line1, ''))) not between 1 and 200
     or length(trim(coalesce(p_city, ''))) not between 1 and 100
     or v_state !~ '^[A-Z]{2}$'
     or trim(coalesce(p_postal_code, '')) !~ '^\d{5}(-\d{4})?$'
     or (v_type is not null and v_type not in ('single_family', 'duplex', 'triplex', 'apartment', 'condo', 'townhouse')) then
    raise exception 'invalid home details' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_manager and role = 'manager') then
    raise exception 'manager required' using errcode = '42501';
  end if;
  -- Lock order shared with the future claim function: the account row first.
  perform 1 from public.ownership_accounts
    where id = p_account and managed_client and claim_state = 'unclaimed' for update;
  if not found then raise exception 'not an unclaimed client account' using errcode = '42501'; end if;
  if not exists (select 1 from public.ownership_account_managers
                 where account_id = p_account and manager_profile_id = p_manager and active) then
    raise exception 'not a manager of this client' using errcode = '42501';
  end if;
  perform set_config('domus.client_sync', 'on', true);
  insert into public.properties
    (owner_profile_id, owner_account_id, name, address_line1, city, state, postal_code, property_type)
  values (null, p_account, trim(p_name), trim(p_address_line1), trim(p_city), v_state, trim(p_postal_code), v_type)
  returning id into v_property;
  -- derived rows for every active manager of the client (single source: ownership_account_managers)
  insert into public.property_managers (property_id, manager_profile_id, active)
    select v_property, x.manager_profile_id, true from public.ownership_account_managers x
    where x.account_id = p_account and x.active
  on conflict (property_id, manager_profile_id) do update set active = true;
  perform set_config('domus.client_sync', v_prev, true);
  return v_property;
end $fn$;

revoke execute on function public.create_client_account(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.add_client_home(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_client_account(uuid, text, text, text) to service_role;
grant execute on function public.add_client_home(uuid, uuid, text, text, text, text, text, text) to service_role;
