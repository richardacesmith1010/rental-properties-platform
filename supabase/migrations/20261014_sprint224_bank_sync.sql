-- Sprint 224. Apply only after review; no client can read Plaid secrets or write feed rows.
create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.ownership_accounts(id) on delete cascade,
  provider text not null default 'plaid' check (provider = 'plaid'),
  plaid_item_id text not null unique,
  institution_name text not null,
  status text not null default 'ok'
    check (status in ('pending_account_match', 'ok', 'needs_login', 'revoked', 'error')),
  last_synced_at timestamptz,
  last_error text check (char_length(last_error) <= 200),
  sync_lease_until timestamptz,
  sync_lease_token uuid,
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
revoke all on public.bank_connections from public, anon, authenticated;
alter table public.bank_connections enable row level security;
create policy bank_connections_owner_select on public.bank_connections for select to authenticated
  using (public.is_owner_member_of_account(owner_account_id));
grant select on public.bank_connections to authenticated;

create table public.bank_connection_secrets (
  connection_id uuid primary key references public.bank_connections(id) on delete cascade,
  access_token_ciphertext text not null,
  transactions_cursor text,
  updated_at timestamptz not null default now()
);
revoke all on public.bank_connection_secrets from public, anon, authenticated;
alter table public.bank_connection_secrets enable row level security;

alter table public.bank_accounts add constraint bank_accounts_id_owner_unique unique (id, owner_account_id);
alter table public.bank_accounts add column connection_id uuid references public.bank_connections(id) on delete set null;
alter table public.bank_accounts add column plaid_account_id text unique;
alter table public.bank_accounts add column mask text check (char_length(mask) <= 4);
alter table public.bank_accounts add column account_subtype text;
alter table public.bank_accounts drop constraint bank_accounts_institution_check;
alter table public.bank_accounts add constraint bank_accounts_institution_check
  check (char_length(trim(institution)) between 1 and 80);

create table public.bank_review_items (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.ownership_accounts(id) on delete cascade,
  bank_account_id uuid not null,
  external_id text not null,
  fingerprint text not null,
  posted_on date not null,
  amount_cents integer not null check (amount_cents > 0),
  direction text not null check (direction in ('in', 'out')),
  description text not null check (char_length(description) <= 200),
  suggestion jsonb,
  possible_duplicate boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_account_id, external_id),
  foreign key (bank_account_id, owner_account_id)
    references public.bank_accounts(id, owner_account_id) on delete cascade
);
revoke all on public.bank_review_items from public, anon, authenticated;
alter table public.bank_review_items enable row level security;
create policy bank_review_items_owner_select on public.bank_review_items for select to authenticated
  using (public.is_owner_member_of_account(owner_account_id));
grant select on public.bank_review_items to authenticated;
create function public.touch_bank_review_item()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.touch_bank_review_item() from public, anon, authenticated, service_role;
create trigger bank_review_items_updated_at before update on public.bank_review_items
  for each row execute function public.touch_bank_review_item();

alter table public.bank_transactions add column external_id text;
create unique index bank_transactions_account_external_unique
  on public.bank_transactions(bank_account_id, external_id) where external_id is not null;
alter table public.bank_transactions add column bank_change text
  check (bank_change in ('modified', 'removed'));
alter table public.bank_transactions add column bank_change_at timestamptz;
alter table public.ownership_accounts add constraint ownership_accounts_no_plaintext_plaid
  check (plaid_access_token is null);

create function public.create_bank_connection(p_owner_account_id uuid, p_plaid_item_id text,
  p_institution_name text, p_ciphertext text, p_actor_profile_id uuid, p_accounts jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_account jsonb; v_pending boolean;
begin
  if jsonb_typeof(p_accounts) <> 'array' or jsonb_array_length(p_accounts) = 0 then
    raise exception 'Selected bank accounts required';
  end if;
  select exists(select 1 from public.bank_accounts where owner_account_id = p_owner_account_id
    and source = 'upload') into v_pending;
  insert into public.bank_connections(owner_account_id, plaid_item_id, institution_name,
    created_by_profile_id, status)
  values (p_owner_account_id, p_plaid_item_id, p_institution_name, p_actor_profile_id,
    case when v_pending then 'pending_account_match' else 'ok' end) returning id into v_id;
  insert into public.bank_connection_secrets(connection_id, access_token_ciphertext)
    values (v_id, p_ciphertext);
  for v_account in select value from jsonb_array_elements(p_accounts) loop
    if exists(select 1 from public.bank_accounts where plaid_account_id = v_account->>'accountId'
      and owner_account_id <> p_owner_account_id) then
      raise exception 'Plaid account belongs to another ownership account';
    end if;
    if exists(select 1 from public.bank_accounts where plaid_account_id = v_account->>'accountId') then
      update public.bank_accounts set connection_id = v_id, source = 'plaid',
        mask = nullif(v_account->>'mask', ''), account_subtype = v_account->>'subtype'
        where plaid_account_id = v_account->>'accountId' and owner_account_id = p_owner_account_id;
    else
      insert into public.bank_accounts(owner_account_id, connection_id, plaid_account_id,
        institution, nickname, mask, account_subtype, source, created_by_profile_id)
      values (p_owner_account_id, v_id, v_account->>'accountId',
        coalesce(nullif(v_account->>'institution', ''), p_institution_name),
        v_account->>'nickname', nullif(v_account->>'mask', ''),
        v_account->>'subtype', 'plaid', p_actor_profile_id);
    end if;
  end loop;
  return v_id;
end $$;
revoke all on function public.create_bank_connection(uuid,text,text,text,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_bank_connection(uuid,text,text,text,uuid,jsonb) to service_role;

create function public.skip_bank_account_match(p_connection_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  update public.bank_connections set status = 'ok' where id = p_connection_id
    and status = 'pending_account_match';
  return case when found then 'ok' else 'conflict' end;
end $$;
revoke all on function public.skip_bank_account_match(uuid) from public, anon, authenticated;
grant execute on function public.skip_bank_account_match(uuid) to service_role;

create function public.confirm_bank_account_links(p_connection_id uuid, p_pairs jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_connection public.bank_connections%rowtype; v_pair jsonb;
  v_plaid public.bank_accounts%rowtype; v_upload public.bank_accounts%rowtype;
begin
  select * into v_connection from public.bank_connections where id = p_connection_id for update;
  if not found or v_connection.status <> 'pending_account_match' then
    raise exception 'conflict' using errcode = 'P0001';
  end if;
  for v_pair in select value from jsonb_array_elements(p_pairs) loop
    select * into v_plaid from public.bank_accounts
      where id = (v_pair->>'plaidBankAccountId')::uuid for update;
    select * into v_upload from public.bank_accounts
      where id = (v_pair->>'uploadBankAccountId')::uuid for update;
    if v_plaid.connection_id is distinct from p_connection_id
      or v_plaid.owner_account_id is distinct from v_connection.owner_account_id
      or v_upload.owner_account_id is distinct from v_connection.owner_account_id
      or v_upload.source <> 'upload' or v_upload.plaid_account_id is not null
      or lower(v_upload.institution) <> lower(v_plaid.institution) then
      raise exception 'Invalid bank account match';
    end if;
    update public.bank_accounts set plaid_account_id = null where id = v_plaid.id;
    update public.bank_accounts set plaid_account_id = v_plaid.plaid_account_id,
      connection_id = p_connection_id, mask = v_plaid.mask,
      account_subtype = v_plaid.account_subtype, source = 'plaid' where id = v_upload.id;
    delete from public.bank_accounts where id = v_plaid.id;
  end loop;
  update public.bank_connections set status = 'ok' where id = p_connection_id
    and status = 'pending_account_match';
  if not found then raise exception 'conflict' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.confirm_bank_account_links(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.confirm_bank_account_links(uuid,jsonb) to service_role;

create function public.disconnect_bank_connection(p_connection_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.bank_review_items where bank_account_id in
    (select id from public.bank_accounts where connection_id = p_connection_id);
  update public.bank_accounts set connection_id = null where connection_id = p_connection_id;
  delete from public.bank_connections where id = p_connection_id;
end $$;
revoke all on function public.disconnect_bank_connection(uuid) from public, anon, authenticated;
grant execute on function public.disconnect_bank_connection(uuid) to service_role;

-- The transaction marker is first inserted as a transfer; the helper atomically updates
-- it to the final kind after the linked payment or expense exists.
create function public._file_bank_choice(p jsonb, p_marker_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_choice jsonb := p->'choice'; v_kind text := v_choice->>'kind';
  v_charge public.rent_charges%rowtype; v_property uuid; v_lease uuid;
  v_payment uuid; v_expense uuid; v_count integer; v_prior text;
begin
  if v_kind = 'transfer' then return 'filed'; end if;
  if v_kind = 'expense' then
    insert into public.property_expenses(property_id, created_by_profile_id, category,
      description, amount_cents, expense_date, recurring)
    values ((v_choice->>'propertyId')::uuid, (p->>'actorProfileId')::uuid,
      v_choice->>'category', (v_choice->>'label') || ' · ' || left(p->>'description', 80),
      (p->>'amountCents')::integer, (p->>'postedOn')::date, false)
    returning id into v_expense;
    update public.bank_transactions set kind = 'expense', property_id = (v_choice->>'propertyId')::uuid,
      expense_id = v_expense, created_record = true where id = p_marker_id;
    return 'filed';
  end if;
  if v_kind <> 'rent' then return 'stale'; end if;
  select * into v_charge from public.rent_charges where id = (v_choice->>'rentChargeId')::uuid for update;
  if not found or v_charge.amount_cents <> (p->>'amountCents')::integer then return 'stale'; end if;
  select l.id, u.property_id into v_lease, v_property from public.leases l
    join public.units u on u.id = l.unit_id where l.id = v_charge.lease_id;
  if v_charge.status = 'paid' then
    select count(*) into v_count from public.payments
      where rent_charge_id = v_charge.id and reversed_at is null;
    if v_count = 1 then
      select id into v_payment from public.payments
        where rent_charge_id = v_charge.id and reversed_at is null limit 1;
    end if;
    update public.bank_transactions set kind = 'rent', property_id = v_property,
      lease_id = v_lease, rent_charge_id = v_charge.id, payment_id = v_payment
      where id = p_marker_id;
    return 'filed';
  end if;
  if v_charge.status not in ('pending', 'late') then return 'stale'; end if;
  v_prior := v_charge.status;
  update public.rent_charges set status = 'paid' where id = v_charge.id and status = v_prior;
  if not found then return 'stale'; end if;
  insert into public.payments(rent_charge_id, amount_cents, method, reference_note, paid_at)
    values (v_charge.id, (p->>'amountCents')::integer, 'ach',
      'From bank: ' || (p->>'nickname'), ((p->>'postedOn') || 'T12:00:00Z')::timestamptz)
    returning id into v_payment;
  update public.bank_transactions set kind = 'rent', property_id = v_property,
    lease_id = v_lease, rent_charge_id = v_charge.id, payment_id = v_payment,
    created_record = true, prior_charge_status = v_prior where id = p_marker_id;
  return 'filed';
end $$;
revoke all on function public._file_bank_choice(jsonb,uuid) from public, anon, authenticated, service_role;

create function public.file_synced_bank_item(p jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_result text; v_kind text := p->'choice'->>'kind';
  v_owner uuid := (p->>'ownerAccountId')::uuid; v_bank uuid := (p->>'bankAccountId')::uuid;
  v_property uuid; v_charge public.rent_charges%rowtype;
begin
  if not exists(select 1 from public.bank_accounts
    where id = v_bank and owner_account_id = v_owner) then
    raise exception 'Bank account ownership violation';
  end if;
  if v_kind = 'expense' then v_property := (p->'choice'->>'propertyId')::uuid;
  elsif v_kind = 'rent' then
    select * into v_charge from public.rent_charges
      where id = (p->'choice'->>'rentChargeId')::uuid;
    if not found or v_charge.amount_cents <> (p->>'amountCents')::integer
      or v_charge.status not in ('paid','pending','late') then return 'stale'; end if;
    select u.property_id into v_property from public.leases l
      join public.units u on u.id = l.unit_id where l.id = v_charge.lease_id;
  elsif v_kind <> 'transfer' then return 'stale'; end if;
  if v_kind <> 'transfer' and v_property is null then return 'stale'; end if;
  if v_kind = 'expense' and p->>'direction' <> 'out' then return 'stale'; end if;
  if v_kind = 'rent' and p->>'direction' <> 'in' then return 'stale'; end if;
  if v_property is not null and not exists(select 1 from public.properties
    where id = v_property and owner_account_id = v_owner) then
    raise exception 'Property ownership violation';
  end if;
  begin
    insert into public.bank_transactions(bank_account_id, fingerprint, external_id, posted_on,
      amount_cents, direction, description, kind, matched_by, rule_id, created_by_profile_id)
    values (v_bank, p->>'fingerprint', p->>'externalId', (p->>'postedOn')::date,
      (p->>'amountCents')::integer, p->>'direction', p->>'description', 'transfer',
      p->>'matchedBy', nullif(p->>'ruleId','')::uuid, (p->>'actorProfileId')::uuid)
    on conflict do nothing returning id into v_id;
    if v_id is null then return 'already'; end if;
    v_result := public._file_bank_choice(p, v_id);
    if v_result = 'stale' then raise exception 'stale' using errcode = 'P0001'; end if;
    return 'filed';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'stale' then return 'stale'; end if;
    raise;
  end;
end $$;
revoke all on function public.file_synced_bank_item(jsonb) from public, anon, authenticated;
grant execute on function public.file_synced_bank_item(jsonb) to service_role;

create function public.resolve_bank_review_item(p_item_id uuid, p_expected_updated_at timestamptz,
  p_decision text, p_choice jsonb, p_actor_profile_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_item public.bank_review_items%rowtype; v_payload jsonb; v_id uuid; v_result text;
  v_property uuid; v_charge public.rent_charges%rowtype;
begin
  begin
    delete from public.bank_review_items where id = p_item_id
      and updated_at = p_expected_updated_at returning * into v_item;
    if not found then raise exception 'conflict' using errcode = 'P0001'; end if;
    if p_decision = 'no' then
      insert into public.bank_skipped_fingerprints(bank_account_id, fingerprint)
        values (v_item.bank_account_id, v_item.fingerprint) on conflict do nothing;
      return 'skipped';
    end if;
    if p_decision <> 'yes' or p_choice->>'kind' not in ('expense','rent','transfer') then
      raise exception 'stale' using errcode = 'P0001';
    end if;
    v_payload := jsonb_build_object('ownerAccountId', v_item.owner_account_id,
      'bankAccountId', v_item.bank_account_id, 'externalId', v_item.external_id,
      'fingerprint', v_item.fingerprint, 'postedOn', v_item.posted_on,
      'amountCents', v_item.amount_cents, 'direction', v_item.direction,
      'description', v_item.description, 'choice', p_choice,
      'actorProfileId', p_actor_profile_id, 'matchedBy', 'owner');
    select nickname into strict v_result from public.bank_accounts
      where id = v_item.bank_account_id and owner_account_id = v_item.owner_account_id;
    v_payload := v_payload || jsonb_build_object('nickname', v_result);
    if p_choice->>'kind' = 'expense' then v_property := (p_choice->>'propertyId')::uuid;
    elsif p_choice->>'kind' = 'rent' then
      select * into v_charge from public.rent_charges
        where id = (p_choice->>'rentChargeId')::uuid;
      if not found or v_charge.amount_cents <> v_item.amount_cents
        or v_charge.status not in ('paid','pending','late') then
        raise exception 'stale' using errcode = 'P0001';
      end if;
      select u.property_id into v_property from public.leases l
        join public.units u on u.id = l.unit_id where l.id = v_charge.lease_id;
    end if;
    if p_choice->>'kind' <> 'transfer' and v_property is null then
      raise exception 'stale' using errcode = 'P0001';
    end if;
    if (p_choice->>'kind' = 'expense' and v_item.direction <> 'out')
      or (p_choice->>'kind' = 'rent' and v_item.direction <> 'in') then
      raise exception 'stale' using errcode = 'P0001';
    end if;
    if v_property is not null and not exists(select 1 from public.properties
      where id = v_property and owner_account_id = v_item.owner_account_id) then
      raise exception 'stale' using errcode = 'P0001';
    end if;
    insert into public.bank_transactions(bank_account_id, fingerprint, external_id, posted_on,
      amount_cents, direction, description, kind, matched_by, created_by_profile_id)
    values (v_item.bank_account_id, v_item.fingerprint, v_item.external_id, v_item.posted_on,
      v_item.amount_cents, v_item.direction, v_item.description, 'transfer', 'owner', p_actor_profile_id)
    on conflict do nothing returning id into v_id;
    if v_id is null then return 'already'; end if;
    v_result := public._file_bank_choice(v_payload, v_id);
    if v_result = 'stale' then raise exception 'stale' using errcode = 'P0001'; end if;
    return 'filed';
  exception when sqlstate 'P0001' then
    if sqlerrm in ('stale','conflict') then return sqlerrm; end if;
    raise;
  end;
end $$;
revoke all on function public.resolve_bank_review_item(uuid,timestamptz,text,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_bank_review_item(uuid,timestamptz,text,jsonb,uuid)
  to service_role;

create function public.save_bank_sync_cursor(p_connection_id uuid, p_lease_token uuid, p_cursor text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.bank_connection_secrets set transactions_cursor = p_cursor, updated_at = now()
    where connection_id = p_connection_id and exists (
      select 1 from public.bank_connections where id = p_connection_id
        and sync_lease_token = p_lease_token and sync_lease_until > now()
        and status in ('ok','error')
    );
  return found;
end $$;
revoke all on function public.save_bank_sync_cursor(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.save_bank_sync_cursor(uuid,uuid,text) to service_role;

create function public.acquire_bank_sync_lease(p_connection_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_token uuid;
begin
  update public.bank_connections set sync_lease_token = gen_random_uuid(),
    sync_lease_until = now() + interval '10 minutes'
  where id = p_connection_id and status in ('ok','error')
    and (sync_lease_until is null or sync_lease_until < now())
  returning sync_lease_token into v_token;
  return v_token;
end $$;
revoke all on function public.acquire_bank_sync_lease(uuid) from public, anon, authenticated;
grant execute on function public.acquire_bank_sync_lease(uuid) to service_role;
