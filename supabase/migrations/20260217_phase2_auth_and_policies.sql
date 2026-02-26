-- Phase 2: auth bootstrap + role-aware RLS policies

-- Auto-create or sync profile row when a user signs up through Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    'tenant'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Allow users to create and maintain their own profile rows.
create policy "profiles_insert_self" on profiles
for insert with check (auth.uid() = id);

-- Access helper: users can read a property if they own it or are the tenant in one of its leases.
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
    from leases l
    join units u on u.id = l.unit_id
    where u.property_id = target_property_id
      and l.tenant_profile_id = auth.uid()
  );
$$;

grant execute on function public.can_access_property(uuid) to authenticated;

-- Properties
create policy "properties_select_accessible" on properties
for select using (public.can_access_property(id));

create policy "properties_insert_owner" on properties
for insert with check (owner_profile_id = auth.uid());

create policy "properties_update_owner" on properties
for update using (owner_profile_id = auth.uid());

-- Units
create policy "units_select_accessible" on units
for select using (public.can_access_property(property_id));

create policy "units_insert_owner" on units
for insert with check (
  exists (
    select 1 from properties p
    where p.id = units.property_id
      and p.owner_profile_id = auth.uid()
  )
);

create policy "units_update_owner" on units
for update using (
  exists (
    select 1 from properties p
    where p.id = units.property_id
      and p.owner_profile_id = auth.uid()
  )
);

-- Leases
create policy "leases_select_accessible" on leases
for select using (
  tenant_profile_id = auth.uid()
  or exists (
    select 1
    from units u
    join properties p on p.id = u.property_id
    where u.id = leases.unit_id
      and p.owner_profile_id = auth.uid()
  )
);

create policy "leases_insert_owner" on leases
for insert with check (
  exists (
    select 1
    from units u
    join properties p on p.id = u.property_id
    where u.id = leases.unit_id
      and p.owner_profile_id = auth.uid()
  )
);

create policy "leases_update_owner" on leases
for update using (
  exists (
    select 1
    from units u
    join properties p on p.id = u.property_id
    where u.id = leases.unit_id
      and p.owner_profile_id = auth.uid()
  )
);

-- Rent charges
create policy "rent_charges_select_accessible" on rent_charges
for select using (
  exists (
    select 1
    from leases l
    join units u on u.id = l.unit_id
    join properties p on p.id = u.property_id
    where l.id = rent_charges.lease_id
      and (p.owner_profile_id = auth.uid() or l.tenant_profile_id = auth.uid())
  )
);

create policy "rent_charges_insert_owner" on rent_charges
for insert with check (
  exists (
    select 1
    from leases l
    join units u on u.id = l.unit_id
    join properties p on p.id = u.property_id
    where l.id = rent_charges.lease_id
      and p.owner_profile_id = auth.uid()
  )
);

create policy "rent_charges_update_owner" on rent_charges
for update using (
  exists (
    select 1
    from leases l
    join units u on u.id = l.unit_id
    join properties p on p.id = u.property_id
    where l.id = rent_charges.lease_id
      and p.owner_profile_id = auth.uid()
  )
);

-- Payments
create policy "payments_select_accessible" on payments
for select using (
  exists (
    select 1
    from rent_charges rc
    join leases l on l.id = rc.lease_id
    join units u on u.id = l.unit_id
    join properties p on p.id = u.property_id
    where rc.id = payments.rent_charge_id
      and (p.owner_profile_id = auth.uid() or l.tenant_profile_id = auth.uid())
  )
);

create policy "payments_insert_accessible" on payments
for insert with check (
  exists (
    select 1
    from rent_charges rc
    join leases l on l.id = rc.lease_id
    join units u on u.id = l.unit_id
    join properties p on p.id = u.property_id
    where rc.id = payments.rent_charge_id
      and (p.owner_profile_id = auth.uid() or l.tenant_profile_id = auth.uid())
  )
);

-- Maintenance tickets
create policy "maintenance_select_accessible" on maintenance_tickets
for select using (public.can_access_property(property_id));

create policy "maintenance_insert_owner_or_tenant" on maintenance_tickets
for insert with check (
  public.can_access_property(property_id)
  and (
    exists (select 1 from properties p where p.id = maintenance_tickets.property_id and p.owner_profile_id = auth.uid())
    or tenant_profile_id = auth.uid()
  )
);

create policy "maintenance_update_owner" on maintenance_tickets
for update using (
  exists (select 1 from properties p where p.id = maintenance_tickets.property_id and p.owner_profile_id = auth.uid())
);

-- Documents
create policy "documents_select_accessible" on documents
for select using (
  uploaded_by_profile_id = auth.uid()
  or (property_id is not null and public.can_access_property(property_id))
  or (
    lease_id is not null and exists (
      select 1
      from leases l
      join units u on u.id = l.unit_id
      join properties p on p.id = u.property_id
      where l.id = documents.lease_id
        and (p.owner_profile_id = auth.uid() or l.tenant_profile_id = auth.uid())
    )
  )
);

create policy "documents_insert_accessible" on documents
for insert with check (
  uploaded_by_profile_id = auth.uid()
  and (
    (property_id is not null and public.can_access_property(property_id))
    or lease_id is not null
  )
);

-- Communication logs
create policy "communications_select_accessible" on communication_logs
for select using (public.can_access_property(property_id));

create policy "communications_insert_owner" on communication_logs
for insert with check (
  exists (select 1 from properties p where p.id = communication_logs.property_id and p.owner_profile_id = auth.uid())
);
