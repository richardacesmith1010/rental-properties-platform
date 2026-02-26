-- Phase 4 foundation: optional property manager support

create table if not exists property_managers (
  property_id uuid not null references properties(id) on delete cascade,
  manager_profile_id uuid not null references profiles(id) on delete cascade,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  primary key (property_id, manager_profile_id)
);

alter table property_managers enable row level security;

drop policy if exists "property_managers_select_owner_or_manager" on property_managers;
create policy "property_managers_select_owner_or_manager" on property_managers
for select using (
  manager_profile_id = auth.uid()
  or exists (
    select 1
    from properties p
    where p.id = property_managers.property_id
      and p.owner_profile_id = auth.uid()
  )
);

drop policy if exists "property_managers_insert_owner" on property_managers;
create policy "property_managers_insert_owner" on property_managers
for insert with check (
  exists (
    select 1
    from properties p
    where p.id = property_managers.property_id
      and p.owner_profile_id = auth.uid()
  )
);

drop policy if exists "property_managers_update_owner" on property_managers;
create policy "property_managers_update_owner" on property_managers
for update using (
  exists (
    select 1
    from properties p
    where p.id = property_managers.property_id
      and p.owner_profile_id = auth.uid()
  )
);

create or replace function public.can_access_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from properties p
    where p.id = target_property_id
      and p.owner_profile_id = auth.uid()
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
    from leases l
    join units u on u.id = l.unit_id
    where u.property_id = target_property_id
      and l.tenant_profile_id = auth.uid()
  );
$$;
