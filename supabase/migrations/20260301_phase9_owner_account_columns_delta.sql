-- Phase 9 delta: complete missing owner-account linkage columns in live projects
-- Safe to run multiple times.

begin;

alter table properties
  add column if not exists owner_account_id uuid references ownership_accounts(id) on delete restrict;

alter table invitations
  add column if not exists ownership_account_id uuid references ownership_accounts(id) on delete set null;

-- Ensure each property with owner_profile_id can map to an individual ownership account.
insert into ownership_accounts (account_type, display_name, created_by_profile_id)
select
  'individual',
  coalesce(nullif(trim(pf.full_name), ''), split_part(pf.email, '@', 1)) || ' Account',
  pf.id
from profiles pf
where exists (
  select 1
  from properties p
  where p.owner_profile_id = pf.id
    and p.owner_account_id is null
)
and not exists (
  select 1
  from ownership_accounts oa
  where oa.account_type = 'individual'
    and oa.created_by_profile_id = pf.id
);

insert into ownership_account_members (account_id, profile_id, member_role, active, can_receive_critical_alerts)
select
  oa.id,
  oa.created_by_profile_id,
  'owner',
  true,
  true
from ownership_accounts oa
where oa.account_type = 'individual'
  and oa.created_by_profile_id is not null
on conflict (account_id, profile_id) do update
set
  active = true,
  can_receive_critical_alerts = true;

update properties p
set owner_account_id = oa.id
from ownership_accounts oa
where p.owner_account_id is null
  and p.owner_profile_id is not null
  and oa.account_type = 'individual'
  and oa.created_by_profile_id = p.owner_profile_id;

-- Fallback for legacy rows where owner_profile_id is null.
create temporary table if not exists tmp_property_account_map (
  property_id uuid primary key,
  account_id uuid not null
) on commit drop;

insert into tmp_property_account_map(property_id, account_id)
select p.id, gen_random_uuid()
from properties p
where p.owner_account_id is null
on conflict (property_id) do nothing;

insert into ownership_accounts(id, account_type, display_name, created_by_profile_id)
select
  m.account_id,
  'individual',
  'Property Account ' || left(m.property_id::text, 8),
  null
from tmp_property_account_map m
on conflict (id) do nothing;

update properties p
set owner_account_id = m.account_id
from tmp_property_account_map m
where p.id = m.property_id
  and p.owner_account_id is null;

create index if not exists idx_properties_owner_account on properties(owner_account_id);
create index if not exists idx_invitations_account on invitations(ownership_account_id);

-- Reconcile permission helper functions for partially-applied Phase 9 states.
create or replace function public.can_administer_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from properties p
    join ownership_account_members oam on oam.account_id = p.owner_account_id
    where p.id = target_property_id
      and oam.profile_id = auth.uid()
      and oam.member_role = 'owner'
      and oam.active = true
  )
  or exists (
    select 1
    from property_managers pm
    where pm.property_id = target_property_id
      and pm.manager_profile_id = auth.uid()
      and pm.active = true
  )
  or exists (
    select 1
    from properties p
    join ownership_accounts oa on oa.id = p.owner_account_id
    where p.id = target_property_id
      and oa.created_by_profile_id = auth.uid()
  );
$$;

create or replace function public.can_view_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_administer_property(target_property_id)
  or exists (
    select 1
    from leases l
    join units u on u.id = l.unit_id
    where u.property_id = target_property_id
      and l.tenant_profile_id = auth.uid()
      and l.active = true
  );
$$;

create or replace function public.can_access_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_view_property(target_property_id);
$$;

grant execute on function public.can_administer_property(uuid) to authenticated;
grant execute on function public.can_view_property(uuid) to authenticated;
grant execute on function public.can_access_property(uuid) to authenticated;

-- Hard guard before enforcing not-null.
do $$
begin
  if exists (select 1 from properties where owner_account_id is null) then
    raise exception 'Phase9 delta incomplete: properties.owner_account_id still null';
  end if;
end $$;

alter table properties
  alter column owner_account_id set not null;

commit;
