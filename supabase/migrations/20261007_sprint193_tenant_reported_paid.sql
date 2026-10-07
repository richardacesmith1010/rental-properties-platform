-- Sprint 193: tenant "I paid this" reports, visible on the owner's Rent row.
-- 1) New nullable column (no default, no backfill). Claimed atomically by requestManualPaymentConfirmation before the owner message is sent.
-- No IF NOT EXISTS: if the column already exists (drift), fail loudly instead of assuming its shape.
alter table public.rent_charges add column tenant_reported_paid_at timestamptz;

-- 2) owner_dashboard_payload: identical to live (pg_get_functiondef, 2026-10-07) except
--    scoped_charges and both display_charges branches also select c.tenant_reported_paid_at.
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
