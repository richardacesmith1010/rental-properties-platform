-- Sprint 181: read-only, service-role-only owner Home payloads.
-- Every dashboard collection is scoped through p_property_ids. NULL and '{}' scope nothing.
-- Order: properties, units, leases, maintenance, late_charges, tenant_profiles, editor_profiles by id;
-- charges: pending/late/waived by due_date,id, then paid by payment paid_at DESC,id;
-- recent_payments by paid_at DESC,id; reminders by created_at DESC,id;
-- charge_history by created_at DESC,id.
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
  select c.id, c.lease_id, c.due_date, c.amount_cents, c.status, c.category, c.notes
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
  select c.id, c.lease_id, c.due_date, c.amount_cents, c.status, c.category, c.notes,
    0 as sort_group, c.due_date as sort_date, null::timestamptz as paid_at
  from pending_charges c
  union all
  select c.id, c.lease_id, c.due_date, c.amount_cents, c.status, c.category, c.notes,
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

-- Order: property_account_ids/member_rows/creator_rows/member_counts by account_id (id for creators);
-- accounts by created_at,id. NULL p_user_id yields empty arrays and no account access.
create or replace function public.ownership_accounts_payload(p_user_id uuid)
returns jsonb
language sql stable security invoker set search_path = ''
as $fn$
with owner_memberships as (
  select m.account_id from public.ownership_account_members m
  where m.profile_id = p_user_id and m.member_role = 'owner' and m.active = true
), administered_properties as (
  select p.id, p.owner_account_id from public.properties p
  where p.active = true and p.owner_account_id in (select m.account_id from owner_memberships m)
  union
  select p.id, p.owner_account_id from public.properties p
  join public.property_managers pm on pm.property_id = p.id
  where pm.manager_profile_id = p_user_id and pm.active = true and p.active = true
), property_account_ids as (
  select distinct p.owner_account_id as account_id from administered_properties p where p.owner_account_id is not null
  union
  select m.account_id from owner_memberships m
), member_rows as (
  select m.account_id from public.ownership_account_members m
  where m.profile_id = p_user_id and m.active = true
), creator_rows as (
  select a.id from public.ownership_accounts a where a.created_by_profile_id = p_user_id
), account_ids as (
  select account_id as id from property_account_ids
  union select account_id from member_rows
  union select id from creator_rows
), account_rows as (
  select a.id, a.account_type, a.display_name, a.join_code, a.stripe_account_id,
    a.stripe_onboarding_complete, a.stripe_status, a.distribution_mode,
    a.plaid_account_id, a.plaid_bank_name, a.plaid_bank_mask, a.plaid_balance_cents,
    a.plaid_balance_updated_at, a.created_at
  from public.ownership_accounts a join account_ids ids on ids.id = a.id
), member_counts as (
  select m.account_id, coalesce(count(*), 0)::integer as member_count from public.ownership_account_members m
  join account_ids ids on ids.id = m.account_id where m.active = true group by m.account_id
)
select jsonb_build_object(
  'property_account_ids', coalesce((select jsonb_agg(p.account_id order by p.account_id)
    from property_account_ids p), '[]'::jsonb),
  'member_rows', coalesce((select jsonb_agg(to_jsonb(m) order by m.account_id)
    from member_rows m), '[]'::jsonb),
  'creator_rows', coalesce((select jsonb_agg(to_jsonb(c) order by c.id)
    from creator_rows c), '[]'::jsonb),
  'accounts', coalesce((select jsonb_agg(to_jsonb(a) - 'created_at' order by a.created_at, a.id)
    from account_rows a), '[]'::jsonb),
  'member_counts', coalesce((select jsonb_agg(to_jsonb(m) order by m.account_id)
    from member_counts m), '[]'::jsonb)
);
$fn$;
revoke execute on function public.ownership_accounts_payload(uuid) from public, anon, authenticated;
grant execute on function public.ownership_accounts_payload(uuid) to service_role;
