-- Service-role callers supply the authenticated user and server-computed property IDs.
-- NULL user/account yields no administered IDs. NULL/empty property IDs yield empty collections and self_profile.
-- Orders: property_ids by id; properties by created_at,id; units by unit_number,id;
-- leases by start_date DESC,id; invitations by property_id,email; accounts and tenant_profiles by id.
create or replace function public.owner_administered_property_ids(p_user_id uuid, p_account_id uuid)
returns jsonb
language sql stable security invoker set search_path = ''
as $fn$
with gate as (
  select 1 from public.ownership_account_members m
  where m.account_id = p_account_id and m.profile_id = p_user_id and m.active = true
), eligible as (
  select p.id from public.properties p
  where p.owner_account_id = p_account_id and coalesce(p.active, true) = true
    and exists (select 1 from gate)
    and (
      exists (select 1 from public.ownership_account_members m
        where m.account_id = p.owner_account_id and m.profile_id = p_user_id
          and m.member_role = 'owner' and m.active = true)
      or exists (select 1 from public.property_managers pm
        where pm.property_id = p.id and pm.manager_profile_id = p_user_id and pm.active = true)
    )
)
select jsonb_build_object('property_ids', coalesce(
  (select jsonb_agg(e.id order by e.id) from eligible e), '[]'::jsonb));
$fn$;
revoke execute on function public.owner_administered_property_ids(uuid, uuid) from public, anon, authenticated;
grant execute on function public.owner_administered_property_ids(uuid, uuid) to service_role;

create or replace function public.owner_portfolio_payload(p_user_id uuid, p_property_ids uuid[])
returns jsonb
language sql stable security invoker set search_path = ''
as $fn$
with property_rows as (
  select p.id, p.name, p.address_line1, p.city, p.state, p.postal_code,
    p.owner_account_id, p.active, p.created_at
  from public.properties p
  where p.id = any(p_property_ids) and coalesce(p.active, true) = true
), unit_rows as (
  select u.id, u.property_id, u.unit_number, u.bedrooms, u.bathrooms,
    u.monthly_rent_cents, u.square_feet, u.occupied, u.active
  from public.units u join property_rows p on p.id = u.property_id
  where coalesce(u.active, true) = true
), lease_rows as (
  select l.id, l.unit_id, l.tenant_profile_id, l.monthly_rent_cents, l.deposit_cents,
    l.due_day_of_month, l.start_date, l.end_date, l.lease_status, l.grace_period_days,
    l.late_fee_cents, l.collects_outside_domus, l.active
  from public.leases l join unit_rows u on u.id = l.unit_id
), invitation_rows as (
  select distinct lower(i.email) as email, i.property_id
  from public.invitations i
  where i.property_id = any(p_property_ids) and i.role = 'tenant'
    and i.status in ('pending', 'accepted')
), account_rows as (
  select distinct a.id, a.display_name from public.ownership_accounts a
  join property_rows p on p.owner_account_id = a.id
), tenant_rows as (
  select p.id, p.email, p.full_name, p.phone from public.profiles p
  where p.id in (select l.tenant_profile_id from lease_rows l)
    or p.email = any(select i.email from invitation_rows i)
)
select jsonb_build_object(
  'properties', coalesce((select jsonb_agg(to_jsonb(p) - 'created_at' order by p.created_at, p.id)
    from property_rows p), '[]'::jsonb),
  'units', coalesce((select jsonb_agg(to_jsonb(u) order by u.unit_number, u.id)
    from unit_rows u), '[]'::jsonb),
  'leases', coalesce((select jsonb_agg(to_jsonb(l) order by l.start_date desc, l.id)
    from lease_rows l), '[]'::jsonb),
  'invitations', coalesce((select jsonb_agg(to_jsonb(i) order by i.property_id, i.email)
    from invitation_rows i), '[]'::jsonb),
  'ownership_accounts', coalesce((select jsonb_agg(to_jsonb(a) order by a.id)
    from account_rows a), '[]'::jsonb),
  'tenant_profiles', coalesce((select jsonb_agg(to_jsonb(t) order by t.id)
    from tenant_rows t), '[]'::jsonb),
  'self_profile', (select to_jsonb(s) from (
    select p.id, p.email, p.full_name, p.phone from public.profiles p where p.id = p_user_id
  ) s)
);
$fn$;
revoke execute on function public.owner_portfolio_payload(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.owner_portfolio_payload(uuid, uuid[]) to service_role;
