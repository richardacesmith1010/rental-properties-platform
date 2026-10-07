-- Run as service_role after applying the migration. The final exception rolls back every fixture row.
do $$
declare
  no_owner uuid := 'e1810000-0000-4000-8000-000000000001';
  one_owner uuid := 'e1810000-0000-4000-8000-000000000002';
  two_owner uuid := 'e1810000-0000-4000-8000-000000000003';
  llc_owner uuid := 'e1810000-0000-4000-8000-000000000004';
  tenant_id uuid := 'e1810000-0000-4000-8000-000000000005';
  account_one uuid := 'e1810000-0000-4000-8000-000000000011';
  account_two uuid := 'e1810000-0000-4000-8000-000000000012';
  account_llc uuid := 'e1810000-0000-4000-8000-000000000013';
  home_one uuid := 'e1810000-0000-4000-8000-000000000021';
  home_two uuid := 'e1810000-0000-4000-8000-000000000022';
  unit_one uuid := 'e1810000-0000-4000-8000-000000000031';
  unit_two uuid := 'e1810000-0000-4000-8000-000000000032';
  lease_one uuid := 'e1810000-0000-4000-8000-000000000041';
  lease_two uuid := 'e1810000-0000-4000-8000-000000000042';
  late_id uuid := 'e1810000-0000-4000-8000-000000000051';
  pending_id uuid := 'e1810000-0000-4000-8000-000000000052';
  paid_id uuid := 'e1810000-0000-4000-8000-000000000053';
  d jsonb;
  a jsonb;
begin
  insert into public.profiles (id, full_name, email, role) values
    (no_owner, 'Sprint181 Empty', 's181-empty@example.invalid', 'owner'),
    (one_owner, 'Sprint181 One', 's181-one@example.invalid', 'owner'),
    (two_owner, 'Sprint181 Two', 's181-two@example.invalid', 'owner'),
    (llc_owner, 'Sprint181 LLC', 's181-llc@example.invalid', 'owner'),
    (tenant_id, 'Sprint181 Tenant', 's181-tenant@example.invalid', 'tenant');
  insert into public.ownership_accounts (id, account_type, display_name, created_by_profile_id) values
    (account_one, 'individual', 'Sprint181 One', one_owner),
    (account_two, 'individual', 'Sprint181 Two', two_owner),
    (account_llc, 'llc', 'Sprint181 LLC', llc_owner);
  insert into public.ownership_account_members (account_id, profile_id, member_role, active) values
    (account_one, one_owner, 'owner', true),
    (account_two, two_owner, 'owner', true),
    (account_llc, llc_owner, 'owner', true);
  insert into public.properties
    (id, owner_profile_id, owner_account_id, name, address_line1, city, state, postal_code) values
    (home_one, one_owner, account_one, 'Sprint181 A', '1 Test St', 'Denver', 'CO', '80201'),
    (home_two, two_owner, account_two, 'Sprint181 B', '2 Test St', 'Denver', 'CO', '80202');
  insert into public.units (id, property_id, unit_number, monthly_rent_cents, occupied) values
    (unit_one, home_one, '1', 100000, true), (unit_two, home_two, '2', 200000, true);
  insert into public.leases
    (id, unit_id, tenant_profile_id, start_date, end_date, monthly_rent_cents, due_day_of_month, active) values
    (lease_one, unit_one, tenant_id, '2026-01-01', '2027-01-01', 100000, 1, true),
    (lease_two, unit_two, tenant_id, '2026-01-01', '2027-01-01', 200000, 1, true);
  insert into public.rent_charges (id, lease_id, due_date, amount_cents, status, category) values
    (late_id, lease_one, '2026-10-01', 100000, 'late', 'rent'),
    (pending_id, lease_one, '2026-10-15', 5000, 'pending', 'late_fee'),
    (paid_id, lease_two, '2026-10-02', 200000, 'paid', 'rent');
  insert into public.payments (id, rent_charge_id, paid_at, amount_cents, method) values
    ('e1810000-0000-4000-8000-000000000061', paid_id, '2026-10-03 00:00:00+00', 200000, 'ach');

  d := public.owner_dashboard_payload('{}'::uuid[], '2026-10-06');
  if d->'aggregates'->>'late_rent_cents' <> '0'
    or d->'properties' <> '[]'::jsonb or d->'charges' <> '[]'::jsonb
    or d->'recent_payments' <> '[]'::jsonb or d->'late_charges' <> '[]'::jsonb then
    raise exception 'empty array scope leaked rows: %', d;
  end if;
  d := public.owner_dashboard_payload(null, '2026-10-06');
  if d->'properties' <> '[]'::jsonb or d->'units' <> '[]'::jsonb then
    raise exception 'NULL scope leaked rows: %', d;
  end if;
  a := public.ownership_accounts_payload(no_owner);
  if a->'accounts' <> '[]'::jsonb or a->'member_counts' <> '[]'::jsonb then
    raise exception 'no-home account payload mismatch: %', a;
  end if;
  a := public.ownership_accounts_payload(null);
  if a->'accounts' <> '[]'::jsonb or a->'property_account_ids' <> '[]'::jsonb then
    raise exception 'NULL user leaked accounts: %', a;
  end if;
  d := public.owner_dashboard_payload(array[home_one], '2026-10-06');
  if jsonb_array_length(d->'properties') <> 1 or jsonb_array_length(d->'units') <> 1
    or jsonb_array_length(d->'leases') <> 1 or jsonb_array_length(d->'charges') <> 2
    or jsonb_array_length(d->'late_charges') <> 1
    or d->'aggregates'->>'late_rent_cents' <> '100000'
    or d->'aggregates'->>'active_lease_count' <> '1'
    or d->'late_charges'->0->>'amount_cents' <> '100000'
    or d->'late_charges'->0->>'id' <> late_id::text
    or d->'charges'->0->>'id' <> late_id::text
    or d->'charges'->1->>'id' <> pending_id::text then
    raise exception 'one-home charge/count/order mismatch: %', d;
  end if;
  a := public.ownership_accounts_payload(one_owner);
  if jsonb_array_length(a->'accounts') <> 1 or (a->'member_counts'->0->>'member_count')::int <> 1
    or a->'accounts'->0->>'id' <> account_one::text then
    raise exception 'one-home account mismatch: %', a;
  end if;
  d := public.owner_dashboard_payload(array[home_one, home_two], '2026-10-06');
  if jsonb_array_length(d->'properties') <> 2 or jsonb_array_length(d->'charges') <> 3
    or jsonb_array_length(d->'recent_payments') <> 1
    or d->'charges'->2->>'id' <> paid_id::text
    or d->'aggregates'->>'monthly_gross_rent_cents' <> '300000'
    or d->'recent_payments'->0->>'amount_cents' <> '200000'
    or d->'charges'->2->>'amount_cents' <> '200000' then
    raise exception 'two-home paid/count/order mismatch: %', d;
  end if;
  a := public.ownership_accounts_payload(two_owner);
  if jsonb_array_length(a->'accounts') <> 1 or a->'accounts'->0->>'id' <> account_two::text then
    raise exception 'two-home account mismatch: %', a;
  end if;
  a := public.ownership_accounts_payload(llc_owner);
  if jsonb_array_length(a->'accounts') <> 1 or a->'accounts'->0->>'account_type' <> 'llc'
    or a->'accounts'->0->>'id' <> account_llc::text then
    raise exception 'LLC account mismatch: %', a;
  end if;
  d := public.owner_dashboard_payload('{}'::uuid[], '2026-10-06');
  if d->'properties' <> '[]'::jsonb then raise exception 'LLC no-home payload mismatch: %', d; end if;
  raise exception 'SPRINT181_SQL_TESTS_PASSED';
end $$;
