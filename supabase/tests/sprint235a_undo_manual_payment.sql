-- Run as service_role after applying the migration. Every fixture row is rolled back.
begin;
do $fixture$
declare
  owner_id uuid := gen_random_uuid();
  tenant_id uuid := gen_random_uuid();
  home_id uuid := gen_random_uuid();
  account_id uuid := gen_random_uuid();
  unit_id uuid := gen_random_uuid();
  lease_id uuid := gen_random_uuid();
  rent_id uuid := gen_random_uuid();
  covered_id uuid := gen_random_uuid();
  waived_id uuid := gen_random_uuid();
  partial_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  payment_id uuid := gen_random_uuid();
  active_id uuid := gen_random_uuid();
  note_id uuid := gen_random_uuid();
  result jsonb;
  payload jsonb;
  n integer;
begin
  insert into public.profiles(id, full_name, email, role) values
    (owner_id, 'Sprint235 Owner', owner_id::text || '@example.invalid', 'owner'),
    (tenant_id, 'Sprint235 Tenant', tenant_id::text || '@example.invalid', 'tenant');
  insert into public.ownership_accounts(id, display_name, account_type, created_by_profile_id)
    values (account_id, 'Sprint235 Account', 'individual', owner_id);
  insert into public.properties(id, owner_profile_id, owner_account_id, name, address_line1, city, state, postal_code)
    values (home_id, owner_id, account_id, 'Sprint235 Test', '1 Test St', 'Denver', 'CO', '80201');
  insert into public.units(id, property_id, unit_number, monthly_rent_cents)
    values (unit_id, home_id, '1', 100000);
  insert into public.leases(id, unit_id, tenant_profile_id, start_date, end_date, monthly_rent_cents, due_day_of_month)
    values (lease_id, unit_id, tenant_id, current_date - 40, current_date + 400, 100000, 15);
  insert into public.rent_charges(id, lease_id, due_date, amount_cents, status) values
    (rent_id, lease_id, current_date, 100000, 'paid'),
    (covered_id, lease_id, current_date + 1, 100000, 'paid'),
    (waived_id, lease_id, current_date + 2, 100000, 'waived'),
    (partial_id, lease_id, current_date + 3, 100000, 'pending'),
    (other_id, lease_id, current_date + 4, 100000, 'paid');

  -- Default and provenance checks use only fixture payments.
  insert into public.payments(id, rent_charge_id, amount_cents, method, paid_at, recorded_via)
    values (payment_id, rent_id, 100000, 'cash', now(), 'manual');
  insert into public.notifications(id, recipient_profile_id, type, title, body, entity_type, entity_id)
    values (note_id, tenant_id, 'late_rent', 'Payment Received', 'Fixture note', 'rent_charge', rent_id);
  insert into public.payments(id, rent_charge_id, amount_cents, method, paid_at)
    values (active_id, other_id, 100000, 'cash', now());
  insert into public.payments(rent_charge_id, amount_cents, method, recorded_via, created_at)
    values (other_id, 100000, 'cash', 'manual', now() - interval '1 day');
  if (select recorded_via from public.payments where id = active_id) <> 'legacy' then
    raise exception 'missing provenance did not fail closed';
  end if;
  result := public.undo_manual_payment(rent_id, tenant_id, 'pending');
  if result->>'code' <> 'forbidden' then raise exception 'tenant actor was accepted'; end if;
  result := public.undo_manual_payment(rent_id, gen_random_uuid(), 'pending');
  if result->>'code' <> 'forbidden' then raise exception 'unknown actor was accepted'; end if;
  result := public.undo_manual_payment(rent_id, owner_id, 'pending');
  if result->>'code' <> 'ok' or result->>'status' <> 'pending' or result->>'reopened' <> 'true'
    or (select reversed_at from public.payments where id = payment_id) is null
    or not exists (select 1 from public.notifications where id = note_id)
    or (select status from public.rent_charges where id = rent_id) <> 'pending' then
    raise exception 'manual undo did not reopen rent: %', result;
  end if;
  result := public.undo_manual_payment(rent_id, owner_id, 'pending');
  if result->>'code' <> 'nothing_to_undo' then raise exception 'double undo was accepted'; end if;
  if not exists (select 1 from public.audit_logs where entity_id = payment_id
    and action = 'undo_record_payment' and user_id = owner_id) then
    raise exception 'undo audit row missing';
  end if;

  insert into public.payments(rent_charge_id, amount_cents, method, recorded_via, created_at) values
    (covered_id, 100000, 'cash', 'manual', now() - interval '2 seconds'),
    (covered_id, 100000, 'cash', 'manual', now() - interval '1 second');
  result := public.undo_manual_payment(covered_id, owner_id, 'late');
  if result->>'code' <> 'ok' or result->>'reopened' <> 'false'
    or (select status from public.rent_charges where id = covered_id) <> 'paid' then
    raise exception 'coverage was not preserved: %', result;
  end if;
  result := public.undo_manual_payment(covered_id, owner_id, 'late');
  if result->>'reopened' <> 'true' or (select status from public.rent_charges where id = covered_id) <> 'late' then
    raise exception 'insufficient coverage did not reopen rent: %', result;
  end if;

  insert into public.payments(rent_charge_id, amount_cents, method, recorded_via)
    values (waived_id, 100000, 'cash', 'manual'), (partial_id, 100000, 'cash', 'manual');
  result := public.undo_manual_payment(waived_id, owner_id, 'late');
  if result->>'status' <> 'waived' then raise exception 'waived rent was reopened'; end if;
  result := public.undo_manual_payment(partial_id, owner_id, 'late');
  if result->>'reopened' <> 'false' or (select status from public.rent_charges where id = partial_id) <> 'pending' then
    raise exception 'partial writer failure changed rent: %', result;
  end if;

  result := public.undo_manual_payment(other_id, owner_id, 'pending');
  if result->>'code' <> 'legacy' then raise exception 'legacy payment was reversed'; end if;
  update public.payments set recorded_via = 'bank_feed' where id = active_id;
  result := public.undo_manual_payment(other_id, owner_id, 'pending');
  if result->>'code' <> 'bank_feed' then raise exception 'bank payment was reversed'; end if;
  update public.payments set recorded_via = 'stripe' where id = active_id;
  result := public.undo_manual_payment(other_id, owner_id, 'pending');
  if result->>'code' <> 'stripe' then raise exception 'Stripe payment was reversed'; end if;

  begin
    insert into public.payments(rent_charge_id, amount_cents, method)
      values (gen_random_uuid(), 100, 'cash');
    raise exception 'missing rent was accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    update public.payments set rent_charge_id = other_id where id = payment_id;
    raise exception 'payment rent reassignment was accepted';
  exception when raise_exception then
    if sqlerrm <> 'payment rent cannot change' then raise; end if;
  end;
  update public.payments set stripe_transfer_id = null where id = active_id;

  payload := public.owner_dashboard_payload(array[home_id], current_date);
  if exists (select 1 from jsonb_array_elements(payload->'recent_payments') p
    where p->>'id' = payment_id::text) or not exists (
      select 1 from jsonb_array_elements(payload->'recent_payments') p where p->>'id' = active_id::text) then
    raise exception 'recent payments reversal filter failed';
  end if;
  select count(*) into n from public.payments where rent_charge_id in
    (rent_id, covered_id, waived_id, partial_id, other_id);
  raise notice 'Sprint235a fixture payments: % total; manual, stripe, bank_feed, legacy paths checked', n;

  set local role authenticated;
  begin
    perform public.undo_manual_payment(rent_id, owner_id, 'pending');
    raise exception 'authenticated role could execute undo';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lock_rent_charge_for_payment();
    raise exception 'authenticated role could execute lock trigger';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.prevent_payment_rent_change();
    raise exception 'authenticated role could execute immutability trigger';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$fixture$;
rollback;

-- Overlap test (two separate sessions, each with its own rolled-back fixture):
-- A: begin; insert the same throwaway profile/property/unit/lease/rent chain above;
--    select 1 from public.rent_charges where id = <fixture rent> for update;
--    select pg_sleep(8); rollback;
-- B: begin; set local lock_timeout = '3s'; insert into public.payments
--    (rent_charge_id, amount_cents, method) values (<same fixture rent>, 100, 'cash'); rollback;
-- B must time out. Repeat B alone and it must succeed. Repeat A with undo_manual_payment
-- before pg_sleep(8); B must wait. A second undo call while A holds the lock returns busy near 5s.
