-- Sprint 235a. Compare owner_dashboard_payload below with the live definition before applying.
alter table public.payments
  add column recorded_via text not null default 'legacy'
    constraint payments_recorded_via_check check (recorded_via in ('manual', 'stripe', 'bank_feed', 'legacy'));

update public.payments set recorded_via = 'stripe'
where stripe_checkout_session_id is not null or stripe_payment_intent_id is not null;

update public.payments p set recorded_via = 'bank_feed'
where p.recorded_via = 'legacy'
  and exists (select 1 from public.bank_transactions b where b.payment_id = p.id);

alter table public.payments add column created_at timestamptz not null default now();
update public.payments set created_at = paid_at;

-- Fail migration if a historical row was classified or dated incorrectly.
do $check_backfill$
begin
  if exists (select 1 from public.payments p where p.created_at <> p.paid_at) then
    raise exception 'payment created_at backfill mismatch';
  end if;
  if exists (select 1 from public.payments p
    where (p.stripe_checkout_session_id is not null or p.stripe_payment_intent_id is not null)
      and p.recorded_via <> 'stripe') then
    raise exception 'Stripe payment backfill mismatch';
  end if;
  if exists (select 1 from public.payments p
    where p.stripe_checkout_session_id is null and p.stripe_payment_intent_id is null
      and exists (select 1 from public.bank_transactions b where b.payment_id = p.id)
      and p.recorded_via <> 'bank_feed') then
    raise exception 'bank payment backfill mismatch';
  end if;
  if exists (select 1 from public.payments p
    where p.stripe_checkout_session_id is null and p.stripe_payment_intent_id is null
      and not exists (select 1 from public.bank_transactions b where b.payment_id = p.id)
      and p.recorded_via <> 'legacy') then
    raise exception 'legacy payment backfill mismatch';
  end if;
end;
$check_backfill$;

create or replace function public.lock_rent_charge_for_payment()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  perform 1 from public.rent_charges where id = new.rent_charge_id for update;
  return new;
end;
$fn$;
alter function public.lock_rent_charge_for_payment() owner to postgres;
revoke all on function public.lock_rent_charge_for_payment() from public, anon, authenticated;
create trigger lock_rent_charge_for_payment before insert on public.payments
  for each row execute function public.lock_rent_charge_for_payment();

create or replace function public.prevent_payment_rent_change()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if new.rent_charge_id is distinct from old.rent_charge_id then
    raise exception 'payment rent cannot change';
  end if;
  return new;
end;
$fn$;
alter function public.prevent_payment_rent_change() owner to postgres;
revoke all on function public.prevent_payment_rent_change() from public, anon, authenticated;
create trigger prevent_payment_rent_change before update of rent_charge_id on public.payments
  for each row execute function public.prevent_payment_rent_change();

create or replace function public.undo_manual_payment(
  p_charge_id uuid, p_actor_id uuid, p_restore_status text
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_charge public.rent_charges%rowtype;
  v_payment public.payments%rowtype;
  v_remaining bigint;
  v_status text;
  v_reopened boolean := false;
begin
  perform pg_catalog.set_config('lock_timeout', '5s', true);
  if not exists (select 1 from public.profiles where id = p_actor_id and role in ('owner', 'manager')) then
    return pg_catalog.jsonb_build_object('code', 'forbidden');
  end if;
  if p_restore_status not in ('pending', 'late') or p_restore_status is null then
    return pg_catalog.jsonb_build_object('code', 'invalid_status');
  end if;

  select * into v_charge from public.rent_charges where id = p_charge_id for update;
  if not found then return pg_catalog.jsonb_build_object('code', 'not_found'); end if;
  select * into v_payment from public.payments
    where rent_charge_id = p_charge_id and reversed_at is null
    order by created_at desc, id desc limit 1 for update;
  if not found then return pg_catalog.jsonb_build_object('code', 'nothing_to_undo'); end if;
  if v_payment.recorded_via <> 'manual' then
    return pg_catalog.jsonb_build_object('code', v_payment.recorded_via);
  end if;

  update public.payments set reversed_at = now()
    where id = v_payment.id and reversed_at is null;
  if not found then raise exception 'payment reversal failed'; end if;
  select coalesce(sum(amount_cents), 0) into v_remaining from public.payments
    where rent_charge_id = p_charge_id and reversed_at is null;
  v_status := v_charge.status;
  if v_charge.status = 'paid' and v_remaining < v_charge.amount_cents then
    update public.rent_charges set status = p_restore_status where id = p_charge_id;
    v_status := p_restore_status;
    v_reopened := true;
  end if;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
    values (p_actor_id, 'undo_record_payment', 'payment', v_payment.id,
      pg_catalog.jsonb_build_object('charge_id', p_charge_id, 'recorded_via', v_payment.recorded_via,
        'status_before', v_charge.status, 'status_after', v_status, 'remaining_cents', v_remaining));
  return pg_catalog.jsonb_build_object('code', 'ok', 'reopened', v_reopened, 'status', v_status);
exception when lock_not_available then
  return pg_catalog.jsonb_build_object('code', 'busy');
end;
$fn$;
alter function public.undo_manual_payment(uuid, uuid, text) owner to postgres;
revoke all on function public.undo_manual_payment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.undo_manual_payment(uuid, uuid, text) to service_role;

-- Compare this copy with pg_get_functiondef from live before applying (L-012).
create or replace function public.owner_dashboard_payload(p_property_ids uuid[], p_today date)
returns jsonb
language sql stable security invoker set search_path = ''
as $fn$
with scoped_properties as (
  select p.id, p.name from public.properties p where p.id = any(coalesce(p_property_ids, '{}'::uuid[]))
), scoped_units as (
  select u.id, u.occupied, u.property_id, u.unit_number
  from public.units u join scoped_properties p on p.id = u.property_id
), scoped_leases as (
  select l.id, l.monthly_rent_cents, l.active, l.unit_id, l.tenant_profile_id, l.collects_outside_domus
  from public.leases l join scoped_units u on u.id = l.unit_id
), maintenance_rows as (
  select t.id, t.priority from public.maintenance_tickets t
  join scoped_properties p on p.id = t.property_id where t.status in ('open', 'in_progress')
), scoped_charges as (
  select c.id, c.lease_id, c.due_date, c.amount_cents, c.status, c.category, c.notes, c.tenant_reported_paid_at
  from public.rent_charges c join scoped_leases l on l.id = c.lease_id where c.deleted_at is null
), late_charge_rows as (
  select c.id, c.lease_id, c.amount_cents from scoped_charges c
  join scoped_leases l on l.id = c.lease_id
  where c.status = 'late' and coalesce(l.collects_outside_domus, false) = false
), pending_charges as (
  select c.* from scoped_charges c where c.status in ('pending', 'late', 'waived')
  order by c.due_date, c.id limit 30
), recent_payments as (
  select pay.id, pay.amount_cents, pay.paid_at, pay.method, pay.rent_charge_id
  from public.payments pay join scoped_charges c on c.id = pay.rent_charge_id
  where pay.paid_at >= coalesce(p_today, current_date)::timestamptz - interval '30 days'
    and pay.reversed_at is null
  order by pay.paid_at desc, pay.id limit 10
), paid_charges as (
  select distinct on (c.id) c.*, pay.paid_at
  from recent_payments pay join scoped_charges c on c.id = pay.rent_charge_id
  where c.status = 'paid' order by c.id, pay.paid_at desc
), display_charges as (
  select c.id, c.lease_id, c.due_date, c.amount_cents, c.status, c.category, c.notes, c.tenant_reported_paid_at,
    0 as sort_group, c.due_date as sort_date, null::timestamptz as paid_at
  from pending_charges c
  union all
  select c.id, c.lease_id, c.due_date, c.amount_cents, c.status, c.category, c.notes, c.tenant_reported_paid_at,
    1, null::date, c.paid_at from paid_charges c
  where not exists (select 1 from pending_charges pc where pc.id = c.id)
), reminder_rows as (
  select n.id, n.entity_id, n.created_at from public.notifications n
  join display_charges c on c.id::text = n.entity_id::text
  where n.entity_type in ('rent_charge', 'charge')
    and n.type in ('rent_due_reminder', 'delinquency_escalation')
), history_rows as (
  select h.id, h.charge_id, h.edited_by, h.field_name, h.old_value, h.new_value, h.reason, h.created_at
  from public.charge_edit_history h join display_charges c on c.id = h.charge_id
)
select jsonb_build_object(
  'properties', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from scoped_properties p), '[]'::jsonb),
  'units', coalesce((select jsonb_agg(to_jsonb(u) order by u.id) from scoped_units u), '[]'::jsonb),
  'leases', coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from scoped_leases l), '[]'::jsonb),
  'maintenance', coalesce((select jsonb_agg(to_jsonb(t) order by t.id)
    from maintenance_rows t), '[]'::jsonb),
  'late_charges', coalesce((select jsonb_agg(to_jsonb(c) order by c.id)
    from late_charge_rows c), '[]'::jsonb),
  'charges', coalesce((select jsonb_agg(to_jsonb(c) - 'sort_group' - 'sort_date' - 'paid_at'
    order by c.sort_group, c.sort_date, c.paid_at desc, c.id) from display_charges c), '[]'::jsonb),
  'recent_payments', coalesce((select jsonb_agg(to_jsonb(pay) order by pay.paid_at desc, pay.id)
    from recent_payments pay), '[]'::jsonb),
  'tenant_profiles', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name,
    'email', p.email) order by p.id) from public.profiles p
    where p.id in (select l.tenant_profile_id from scoped_leases l)), '[]'::jsonb),
  'reminders', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc, n.id)
    from reminder_rows n), '[]'::jsonb),
  'charge_history', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc, h.id)
    from history_rows h), '[]'::jsonb),
  'editor_profiles', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name,
    'email', p.email) order by p.id) from public.profiles p
    where p.id in (select h.edited_by from history_rows h)), '[]'::jsonb),
  'aggregates', jsonb_build_object(
    'monthly_gross_rent_cents', coalesce((select sum(l.monthly_rent_cents) from scoped_leases l
      where l.active = true), 0),
    'active_lease_count', coalesce((select count(*) from scoped_leases l where l.active = true), 0),
    'occupied_units', coalesce((select count(*) from scoped_units u where u.occupied = true), 0),
    'total_units', coalesce((select count(*) from scoped_units), 0),
    'open_maintenance_count', coalesce((select count(*) from maintenance_rows), 0),
    'high_priority_maintenance_count', coalesce((select count(*) from maintenance_rows t
      where t.priority in ('high', 'urgent')), 0),
    'late_rent_cents', coalesce((select sum(c.amount_cents) from late_charge_rows c), 0),
    'late_account_count', coalesce((select count(distinct c.lease_id) from late_charge_rows c), 0)
  )
);
$fn$;
revoke execute on function public.owner_dashboard_payload(uuid[], date) from public, anon, authenticated;
grant execute on function public.owner_dashboard_payload(uuid[], date) to service_role;
