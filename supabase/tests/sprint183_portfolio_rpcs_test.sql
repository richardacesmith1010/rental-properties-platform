-- Run as schema owner. The final exception rolls back the fixture rows and temporary column change.
do $$
declare
  owner_id uuid := 'e1830000-0000-4000-8000-000000000001';
  member_id uuid := 'e1830000-0000-4000-8000-000000000002';
  manager_id uuid := 'e1830000-0000-4000-8000-000000000003';
  inactive_id uuid := 'e1830000-0000-4000-8000-000000000004';
  tenant_id uuid := 'e1830000-0000-4000-8000-000000000005';
  invited_id uuid := 'e1830000-0000-4000-8000-000000000006';
  mixed_id uuid := 'e1830000-0000-4000-8000-000000000007';
  foreign_id uuid := 'e1830000-0000-4000-8000-000000000008';
  account_a uuid := 'e1830000-0000-4000-8000-000000000011';
  account_b uuid := 'e1830000-0000-4000-8000-000000000012';
  home_a uuid := 'e1830000-0000-4000-8000-000000000021';
  home_b uuid := 'e1830000-0000-4000-8000-000000000022';
  home_off uuid := 'e1830000-0000-4000-8000-000000000023';
  home_foreign uuid := 'e1830000-0000-4000-8000-000000000024';
  unit_a uuid := 'e1830000-0000-4000-8000-000000000031';
  unit_b uuid := 'e1830000-0000-4000-8000-000000000032';
  unit_off uuid := 'e1830000-0000-4000-8000-000000000033';
  unit_foreign uuid := 'e1830000-0000-4000-8000-000000000034';
  unit_inactive uuid := 'e1830000-0000-4000-8000-000000000035';
  unit_a2 uuid := 'e1830000-0000-4000-8000-000000000036';
  lease_a uuid := 'e1830000-0000-4000-8000-000000000041';
  lease_b uuid := 'e1830000-0000-4000-8000-000000000042';
  lease_off uuid := 'e1830000-0000-4000-8000-000000000043';
  lease_foreign uuid := 'e1830000-0000-4000-8000-000000000044';
  lease_inactive_unit uuid := 'e1830000-0000-4000-8000-000000000045';
  a jsonb;
  d jsonb;
  x jsonb;
  empty_payload jsonb;
begin
  insert into public.profiles (id, full_name, email, role) values
    (owner_id, 'S183 Owner', 's183-owner@example.invalid', 'owner'),
    (member_id, 'S183 Member', 's183-member@example.invalid', 'manager'),
    (manager_id, 'S183 Manager', 's183-manager@example.invalid', 'manager'),
    (inactive_id, 'S183 Inactive', 's183-inactive@example.invalid', 'manager'),
    (tenant_id, 'S183 Tenant', 's183-tenant@example.invalid', 'tenant'),
    (invited_id, 'S183 Invited', 's183-invited@example.invalid', 'tenant'),
    (mixed_id, 'S183 Mixed', 'S183-MIXED@example.invalid', 'tenant'),
    (foreign_id, 'S183 Foreign', 's183-foreign@example.invalid', 'tenant');
  insert into public.ownership_accounts (id, account_type, display_name, created_by_profile_id) values
    (account_a, 'individual', 'S183 A', owner_id),
    (account_b, 'llc', 'S183 B', member_id);
  insert into public.ownership_account_members (account_id, profile_id, member_role, active) values
    (account_a, owner_id, 'owner', true),
    (account_a, member_id, 'member', true),
    (account_a, manager_id, 'member', true),
    (account_a, inactive_id, 'member', false),
    (account_b, manager_id, 'member', true);
  -- properties.active is NOT NULL live, so active IS NULL cannot occur; the coalesce() in the RPC is defensive only.
  insert into public.properties
    (id, owner_profile_id, owner_account_id, name, address_line1, city, state, postal_code, active, created_at)
  values
    (home_a, owner_id, account_a, 'S183 A', '1 Test St', 'Denver', 'CO', '80201', true, '2026-01-01'),
    (home_b, owner_id, account_a, 'S183 B', '2 Test St', 'Denver', 'CO', '80202', true, '2026-01-01'),
    (home_off, owner_id, account_a, 'S183 Off', '3 Test St', 'Denver', 'CO', '80203', false, '2026-01-01'),
    (home_foreign, member_id, account_b, 'S183 Foreign', '4 Test St', 'Denver', 'CO', '80204', true, '2026-01-01');
  insert into public.property_managers (property_id, manager_profile_id, active) values
    (home_b, manager_id, true), (home_b, inactive_id, true), (home_foreign, manager_id, true);
  insert into public.units (id, property_id, unit_number, monthly_rent_cents, occupied, active) values
    (unit_a, home_a, '1', 100000, true, true),
    (unit_b, home_b, '1', 100000, false, true),
    (unit_off, home_off, '1', 100000, true, true),
    (unit_foreign, home_foreign, '1', 100000, true, true),
    (unit_inactive, home_a, '9', 100000, false, false),
    (unit_a2, home_a, '2', 100000, false, true);
  insert into public.leases
    (id, unit_id, tenant_profile_id, start_date, end_date, monthly_rent_cents, due_day_of_month, active, lease_status)
  values
    (lease_a, unit_a, tenant_id, '2026-01-01', '2027-01-01', 100000, 1, true, 'active'),
    (lease_b, unit_b, tenant_id, '2026-01-01', '2026-06-01', 100000, 1, false, 'expired'),
    (lease_off, unit_off, foreign_id, '2026-01-01', '2027-01-01', 100000, 1, true, 'active'),
    (lease_foreign, unit_foreign, foreign_id, '2026-01-01', '2027-01-01', 100000, 1, true, 'active'),
    (lease_inactive_unit, unit_inactive, foreign_id, '2026-01-01', '2027-01-01', 100000, 1, true, 'active');
  insert into public.invitations (email, full_name, role, property_id, invited_by, status) values
    ('S183-TENANT@example.invalid', 'S183 Tenant', 'tenant', home_a, owner_id, 'pending'),
    ('S183-INVITED@example.invalid', 'S183 Invited', 'tenant', home_a, owner_id, 'accepted'),
    ('S183-MIXED@example.invalid', 'S183 Mixed', 'tenant', home_b, owner_id, 'pending'),
    ('s183-foreign@example.invalid', 'S183 Foreign', 'tenant', home_foreign, owner_id, 'pending');

  a := public.owner_administered_property_ids(owner_id, account_a);
  if a->'property_ids' <> jsonb_build_array(home_a, home_b) then
    raise exception 'owner IDs/order mismatch';
  end if;
  if public.owner_administered_property_ids(member_id, account_a)->'property_ids' <> '[]'::jsonb
    or public.owner_administered_property_ids(inactive_id, account_a)->'property_ids' <> '[]'::jsonb
    or public.owner_administered_property_ids(manager_id, account_a)->'property_ids' <> jsonb_build_array(home_b)
    or public.owner_administered_property_ids(manager_id, account_b)->'property_ids' <> jsonb_build_array(home_foreign)
    or public.owner_administered_property_ids(null, account_a)->'property_ids' <> '[]'::jsonb
    or public.owner_administered_property_ids(owner_id, null)->'property_ids' <> '[]'::jsonb then
    raise exception 'membership gate matrix mismatch';
  end if;
  d := public.owner_portfolio_payload(owner_id, array[home_b, home_a, home_a, home_off]);
  if (select jsonb_agg(v->>'id') from jsonb_array_elements(d->'properties') v)
       <> jsonb_build_array(home_a::text, home_b::text)
    or (select jsonb_agg(v->>'id') from jsonb_array_elements(d->'units') v)
       <> jsonb_build_array(unit_a::text, unit_b::text, unit_a2::text)
    or (select jsonb_agg(v->>'id') from jsonb_array_elements(d->'leases') v)
       <> jsonb_build_array(lease_a::text, lease_b::text)
    or d->'ownership_accounts'->0->>'id' <> account_a::text
    or jsonb_array_length(d->'ownership_accounts') <> 1
    or (select jsonb_agg(v->>'email') from jsonb_array_elements(d->'invitations') v)
       <> jsonb_build_array('s183-invited@example.invalid', 's183-tenant@example.invalid',
         's183-mixed@example.invalid')
    or (select jsonb_agg(v->>'id') from jsonb_array_elements(d->'tenant_profiles') v)
       <> jsonb_build_array(tenant_id::text, invited_id::text)
    or d->'leases'->0->>'lease_status' <> 'active'
    or d->'leases'->1->>'lease_status' <> 'expired'
    or d->'properties'->1->'active' <> 'true'::jsonb then
    raise exception 'portfolio contents/order/privacy/duplicate/NULL active mismatch';
  end if;
  -- Forward privacy invariant: every profile is linked by returned lease ID or exact invitation email.
  if exists (
    select 1 from jsonb_array_elements(d->'tenant_profiles') t
    where not exists (select 1 from jsonb_array_elements(d->'leases') l
      where l->>'tenant_profile_id' = t->>'id')
      and not exists (select 1 from jsonb_array_elements(d->'invitations') i
        where i->>'email' = t->>'email')
  ) then raise exception 'unlinked tenant profile leaked'; end if;
  -- Reverse invariant: each linked lease profile and exact invitation profile is returned.
  if exists (
    select 1 from jsonb_array_elements(d->'leases') l join public.profiles p
      on p.id::text = l->>'tenant_profile_id'
    where not exists (select 1 from jsonb_array_elements(d->'tenant_profiles') t
      where t->>'id' = p.id::text)
  ) or exists (
    select 1 from jsonb_array_elements(d->'invitations') i join public.profiles p
      on p.email = i->>'email'
    where not exists (select 1 from jsonb_array_elements(d->'tenant_profiles') t
      where t->>'id' = p.id::text)
  ) then raise exception 'linked tenant profile missing'; end if;
  if d->'self_profile'->>'id' <> owner_id::text then raise exception 'self profile mismatch'; end if;
  x := public.owner_portfolio_payload(owner_id, array[home_foreign, home_a]);
  if (select jsonb_agg(v->>'id') from jsonb_array_elements(x->'ownership_accounts') v)
       <> jsonb_build_array(account_a::text, account_b::text)
    or (select jsonb_agg(v->>'id') from jsonb_array_elements(x->'tenant_profiles') v)
       <> jsonb_build_array(tenant_id::text, invited_id::text, foreign_id::text) then
    raise exception 'account/profile order mismatch';
  end if;
  empty_payload := public.owner_portfolio_payload(owner_id, null);
  x := public.owner_portfolio_payload(owner_id, '{}'::uuid[]);
  if empty_payload <> x or empty_payload->'self_profile'->>'id' <> owner_id::text
    or empty_payload->'properties' <> '[]'::jsonb or empty_payload->'units' <> '[]'::jsonb
    or empty_payload->'leases' <> '[]'::jsonb or empty_payload->'invitations' <> '[]'::jsonb
    or empty_payload->'ownership_accounts' <> '[]'::jsonb
    or empty_payload->'tenant_profiles' <> '[]'::jsonb then
    raise exception 'NULL/empty property arrays mismatch';
  end if;
  x := public.owner_portfolio_payload(null, array[home_a]);
  if x->'self_profile' <> 'null'::jsonb or jsonb_array_length(x->'properties') <> 1 then
    raise exception 'NULL user broadened or removed property collections';
  end if;
  raise exception 'SPRINT183_SQL_TESTS_PASSED';
end $$;
