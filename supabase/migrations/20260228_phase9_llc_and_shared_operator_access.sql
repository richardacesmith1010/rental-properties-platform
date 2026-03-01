-- Phase 9: LLC ownership accounts + shared operator permissions

-- ─────────────────────────────────────────────────────────────────────────────
-- Ownership account model
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists ownership_accounts (
  id uuid primary key default gen_random_uuid(),
  account_type text not null check (account_type in ('individual', 'llc')),
  display_name text not null,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists ownership_account_members (
  account_id uuid not null references ownership_accounts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  member_role text not null check (member_role in ('owner')),
  can_receive_critical_alerts boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (account_id, profile_id)
);

create index if not exists idx_ownership_accounts_created_by on ownership_accounts(created_by_profile_id);
create index if not exists idx_ownership_account_members_profile on ownership_account_members(profile_id);
create unique index if not exists idx_ownership_accounts_individual_creator
  on ownership_accounts(created_by_profile_id)
  where account_type = 'individual' and created_by_profile_id is not null;

alter table ownership_accounts enable row level security;
alter table ownership_account_members enable row level security;

drop policy if exists "ownership_accounts_select_member_or_creator" on ownership_accounts;
create policy "ownership_accounts_select_member_or_creator" on ownership_accounts
for select using (
  created_by_profile_id = auth.uid()
  or exists (
    select 1
    from ownership_account_members oam
    where oam.account_id = ownership_accounts.id
      and oam.profile_id = auth.uid()
      and oam.active = true
  )
);

drop policy if exists "ownership_accounts_insert_owner_or_manager" on ownership_accounts;
create policy "ownership_accounts_insert_owner_or_manager" on ownership_accounts
for insert with check (
  exists (
    select 1
    from profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'manager')
  )
  and created_by_profile_id = auth.uid()
);

drop policy if exists "ownership_accounts_update_member_or_creator" on ownership_accounts;
create policy "ownership_accounts_update_member_or_creator" on ownership_accounts
for update using (
  created_by_profile_id = auth.uid()
  or exists (
    select 1
    from ownership_account_members oam
    where oam.account_id = ownership_accounts.id
      and oam.profile_id = auth.uid()
      and oam.member_role = 'owner'
      and oam.active = true
  )
);

drop policy if exists "ownership_account_members_select_member_or_creator" on ownership_account_members;
create policy "ownership_account_members_select_member_or_creator" on ownership_account_members
for select using (
  profile_id = auth.uid()
  or exists (
    select 1
    from ownership_accounts oa
    where oa.id = ownership_account_members.account_id
      and oa.created_by_profile_id = auth.uid()
  )
  or exists (
    select 1
    from ownership_account_members oam
    where oam.account_id = ownership_account_members.account_id
      and oam.profile_id = auth.uid()
      and oam.member_role = 'owner'
      and oam.active = true
  )
);

drop policy if exists "ownership_account_members_insert_owner_or_creator" on ownership_account_members;
create policy "ownership_account_members_insert_owner_or_creator" on ownership_account_members
for insert with check (
  exists (
    select 1
    from ownership_accounts oa
    where oa.id = ownership_account_members.account_id
      and (
        oa.created_by_profile_id = auth.uid()
        or exists (
          select 1
          from ownership_account_members oam
          where oam.account_id = oa.id
            and oam.profile_id = auth.uid()
            and oam.member_role = 'owner'
            and oam.active = true
        )
      )
  )
);

drop policy if exists "ownership_account_members_update_owner_or_creator" on ownership_account_members;
create policy "ownership_account_members_update_owner_or_creator" on ownership_account_members
for update using (
  exists (
    select 1
    from ownership_accounts oa
    where oa.id = ownership_account_members.account_id
      and (
        oa.created_by_profile_id = auth.uid()
        or exists (
          select 1
          from ownership_account_members oam
          where oam.account_id = oa.id
            and oam.profile_id = auth.uid()
            and oam.member_role = 'owner'
            and oam.active = true
        )
      )
  )
);

-- Backfill ownership accounts from existing property owner_profile_id rows.
insert into ownership_accounts (account_type, display_name, created_by_profile_id)
select
  'individual',
  coalesce(nullif(trim(pf.full_name), ''), split_part(pf.email, '@', 1)) || ' Account',
  pf.id
from profiles pf
where exists (
  select 1 from properties p where p.owner_profile_id = pf.id
)
on conflict do nothing;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Property/account linkage + ownership-scoped table updates
-- ─────────────────────────────────────────────────────────────────────────────

alter table properties
  add column if not exists owner_account_id uuid references ownership_accounts(id) on delete restrict;

update properties p
set owner_account_id = oa.id
from ownership_accounts oa
where p.owner_account_id is null
  and oa.account_type = 'individual'
  and oa.created_by_profile_id = p.owner_profile_id;

insert into ownership_accounts (account_type, display_name, created_by_profile_id)
select
  'individual',
  'Property Account ' || left(p.id::text, 8),
  p.owner_profile_id
from properties p
where p.owner_account_id is null
on conflict do nothing;

update properties p
set owner_account_id = oa.id
from ownership_accounts oa
where p.owner_account_id is null
  and oa.account_type = 'individual'
  and oa.created_by_profile_id = p.owner_profile_id;

alter table properties
  alter column owner_account_id set not null;

create index if not exists idx_properties_owner_account on properties(owner_account_id);

alter table document_templates
  add column if not exists owner_account_id uuid references ownership_accounts(id) on delete cascade;

update document_templates dt
set owner_account_id = oa.id
from ownership_accounts oa
where dt.owner_account_id is null
  and oa.account_type = 'individual'
  and oa.created_by_profile_id = dt.owner_profile_id;

alter table vendors
  add column if not exists owner_account_id uuid references ownership_accounts(id) on delete cascade;

update vendors v
set owner_account_id = oa.id
from ownership_accounts oa
where v.owner_account_id is null
  and oa.account_type = 'individual'
  and oa.created_by_profile_id = v.owner_profile_id;

alter table invitations
  add column if not exists ownership_account_id uuid references ownership_accounts(id) on delete set null;

alter table invitations drop constraint if exists invitations_role_check;
alter table invitations add constraint invitations_role_check check (role in ('tenant', 'manager', 'owner'));

create index if not exists idx_invitations_account on invitations(ownership_account_id);
create index if not exists idx_document_templates_owner_account on document_templates(owner_account_id);
create index if not exists idx_vendors_owner_account on vendors(owner_account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Permission engine
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS updates for admin operations (owner-member + assigned manager)
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "properties_insert_admin_v2" on properties;
create policy "properties_insert_admin_v2" on properties
for insert with check (
  owner_account_id is not null
  and exists (
    select 1
    from profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'manager')
  )
  and (
    exists (
      select 1
      from ownership_account_members oam
      where oam.account_id = properties.owner_account_id
        and oam.profile_id = auth.uid()
        and oam.active = true
    )
    or exists (
      select 1
      from ownership_accounts oa
      where oa.id = properties.owner_account_id
        and oa.created_by_profile_id = auth.uid()
    )
  )
);

drop policy if exists "properties_update_admin_v2" on properties;
create policy "properties_update_admin_v2" on properties
for update using (public.can_administer_property(id));

drop policy if exists "units_insert_admin_v2" on units;
create policy "units_insert_admin_v2" on units
for insert with check (public.can_administer_property(property_id));

drop policy if exists "units_update_admin_v2" on units;
create policy "units_update_admin_v2" on units
for update using (public.can_administer_property(property_id));

drop policy if exists "leases_insert_admin_v2" on leases;
create policy "leases_insert_admin_v2" on leases
for insert with check (
  exists (
    select 1
    from units u
    where u.id = leases.unit_id
      and public.can_administer_property(u.property_id)
  )
);

drop policy if exists "leases_update_admin_v2" on leases;
create policy "leases_update_admin_v2" on leases
for update using (
  exists (
    select 1
    from units u
    where u.id = leases.unit_id
      and public.can_administer_property(u.property_id)
  )
);

drop policy if exists "rent_charges_insert_admin_v2" on rent_charges;
create policy "rent_charges_insert_admin_v2" on rent_charges
for insert with check (
  exists (
    select 1
    from leases l
    join units u on u.id = l.unit_id
    where l.id = rent_charges.lease_id
      and public.can_administer_property(u.property_id)
  )
);

drop policy if exists "rent_charges_update_admin_v2" on rent_charges;
create policy "rent_charges_update_admin_v2" on rent_charges
for update using (
  exists (
    select 1
    from leases l
    join units u on u.id = l.unit_id
    where l.id = rent_charges.lease_id
      and public.can_administer_property(u.property_id)
  )
);

drop policy if exists "maintenance_update_admin_v2" on maintenance_tickets;
create policy "maintenance_update_admin_v2" on maintenance_tickets
for update using (public.can_administer_property(property_id));

drop policy if exists "communications_insert_admin_v2" on communication_logs;
create policy "communications_insert_admin_v2" on communication_logs
for insert with check (public.can_administer_property(property_id));

drop policy if exists "property_managers_select_admin_v2" on property_managers;
create policy "property_managers_select_admin_v2" on property_managers
for select using (
  manager_profile_id = auth.uid()
  or public.can_administer_property(property_id)
);

drop policy if exists "property_managers_insert_admin_v2" on property_managers;
create policy "property_managers_insert_admin_v2" on property_managers
for insert with check (public.can_administer_property(property_id));

drop policy if exists "property_managers_update_admin_v2" on property_managers;
create policy "property_managers_update_admin_v2" on property_managers
for update using (public.can_administer_property(property_id));

-- Invitations: shared operator flow + LLC owner invites.
drop policy if exists "invitations_insert_admin_v2" on invitations;
create policy "invitations_insert_admin_v2" on invitations
for insert with check (
  invited_by = auth.uid()
  and (
    (
      role = 'owner'
      and ownership_account_id is not null
      and exists (
        select 1
        from ownership_account_members oam
        where oam.account_id = invitations.ownership_account_id
          and oam.profile_id = auth.uid()
          and oam.member_role = 'owner'
          and oam.active = true
      )
    )
    or (
      role = 'manager'
      and property_id is not null
      and public.can_administer_property(property_id)
    )
    or (
      role = 'tenant'
      and exists (
        select 1
        from properties p
        where public.can_administer_property(p.id)
      )
    )
  )
);

drop policy if exists "invitations_update_admin_v2" on invitations;
create policy "invitations_update_admin_v2" on invitations
for update using (invited_by = auth.uid());

drop policy if exists "invitations_select_inviter_or_invitee_v2" on invitations;
create policy "invitations_select_inviter_or_invitee_v2" on invitations
for select using (
  invited_by = auth.uid()
  or lower(email) = lower(coalesce((select email from profiles where id = auth.uid()), ''))
);

-- Document templates scoped to ownership account.
drop policy if exists "document_templates_select_account_admin_v2" on document_templates;
create policy "document_templates_select_account_admin_v2" on document_templates
for select using (
  owner_account_id is not null
  and (
    exists (
      select 1
      from ownership_account_members oam
      where oam.account_id = document_templates.owner_account_id
        and oam.profile_id = auth.uid()
        and oam.member_role = 'owner'
        and oam.active = true
    )
    or exists (
      select 1
      from ownership_accounts oa
      where oa.id = document_templates.owner_account_id
        and oa.created_by_profile_id = auth.uid()
    )
    or exists (
      select 1
      from property_managers pm
      join properties p on p.id = pm.property_id
      where p.owner_account_id = document_templates.owner_account_id
        and pm.manager_profile_id = auth.uid()
        and pm.active = true
    )
  )
);

drop policy if exists "document_templates_insert_account_admin_v2" on document_templates;
create policy "document_templates_insert_account_admin_v2" on document_templates
for insert with check (
  owner_account_id is not null
  and (
    exists (
      select 1
      from ownership_account_members oam
      where oam.account_id = document_templates.owner_account_id
        and oam.profile_id = auth.uid()
        and oam.member_role = 'owner'
        and oam.active = true
    )
    or exists (
      select 1
      from ownership_accounts oa
      where oa.id = document_templates.owner_account_id
        and oa.created_by_profile_id = auth.uid()
    )
    or exists (
      select 1
      from property_managers pm
      join properties p on p.id = pm.property_id
      where p.owner_account_id = document_templates.owner_account_id
        and pm.manager_profile_id = auth.uid()
        and pm.active = true
    )
  )
);

drop policy if exists "document_templates_update_account_admin_v2" on document_templates;
create policy "document_templates_update_account_admin_v2" on document_templates
for update using (
  owner_account_id is not null
  and (
    exists (
      select 1
      from ownership_account_members oam
      where oam.account_id = document_templates.owner_account_id
        and oam.profile_id = auth.uid()
        and oam.member_role = 'owner'
        and oam.active = true
    )
    or exists (
      select 1
      from ownership_accounts oa
      where oa.id = document_templates.owner_account_id
        and oa.created_by_profile_id = auth.uid()
    )
    or exists (
      select 1
      from property_managers pm
      join properties p on p.id = pm.property_id
      where p.owner_account_id = document_templates.owner_account_id
        and pm.manager_profile_id = auth.uid()
        and pm.active = true
    )
  )
);

drop policy if exists "document_templates_delete_account_admin_v2" on document_templates;
create policy "document_templates_delete_account_admin_v2" on document_templates
for delete using (
  owner_account_id is not null
  and (
    exists (
      select 1
      from ownership_account_members oam
      where oam.account_id = document_templates.owner_account_id
        and oam.profile_id = auth.uid()
        and oam.member_role = 'owner'
        and oam.active = true
    )
    or exists (
      select 1
      from ownership_accounts oa
      where oa.id = document_templates.owner_account_id
        and oa.created_by_profile_id = auth.uid()
    )
  )
);

-- Document packet admin operations for both owner members and managers.
drop policy if exists "document_packets_insert_admin_v2" on document_packets;
create policy "document_packets_insert_admin_v2" on document_packets
for insert with check (
  created_by_profile_id = auth.uid()
  and public.can_administer_property(property_id)
);

drop policy if exists "document_packets_update_admin_v2" on document_packets;
create policy "document_packets_update_admin_v2" on document_packets
for update using (public.can_administer_property(property_id));

drop policy if exists "document_signers_insert_admin_v2" on document_signers;
create policy "document_signers_insert_admin_v2" on document_signers
for insert with check (
  exists (
    select 1
    from document_packets dp
    where dp.id = document_signers.packet_id
      and public.can_administer_property(dp.property_id)
  )
);

drop policy if exists "document_signers_update_admin_v2" on document_signers;
create policy "document_signers_update_admin_v2" on document_signers
for update using (
  exists (
    select 1
    from document_packets dp
    where dp.id = document_signers.packet_id
      and public.can_administer_property(dp.property_id)
  )
);

-- Vendors scoped to ownership account (owner members + assigned managers).
drop policy if exists "vendors_select_account_admin_v2" on vendors;
create policy "vendors_select_account_admin_v2" on vendors
for select using (
  owner_account_id is not null
  and (
    exists (
      select 1
      from ownership_account_members oam
      where oam.account_id = vendors.owner_account_id
        and oam.profile_id = auth.uid()
        and oam.active = true
    )
    or exists (
      select 1
      from ownership_accounts oa
      where oa.id = vendors.owner_account_id
        and oa.created_by_profile_id = auth.uid()
    )
    or exists (
      select 1
      from property_managers pm
      join properties p on p.id = pm.property_id
      where p.owner_account_id = vendors.owner_account_id
        and pm.manager_profile_id = auth.uid()
        and pm.active = true
    )
  )
);

drop policy if exists "vendors_insert_account_admin_v2" on vendors;
create policy "vendors_insert_account_admin_v2" on vendors
for insert with check (
  owner_account_id is not null
  and (
    exists (
      select 1
      from ownership_account_members oam
      where oam.account_id = vendors.owner_account_id
        and oam.profile_id = auth.uid()
        and oam.active = true
    )
    or exists (
      select 1
      from ownership_accounts oa
      where oa.id = vendors.owner_account_id
        and oa.created_by_profile_id = auth.uid()
    )
    or exists (
      select 1
      from property_managers pm
      join properties p on p.id = pm.property_id
      where p.owner_account_id = vendors.owner_account_id
        and pm.manager_profile_id = auth.uid()
        and pm.active = true
    )
  )
);

drop policy if exists "vendors_update_account_admin_v2" on vendors;
create policy "vendors_update_account_admin_v2" on vendors
for update using (
  owner_account_id is not null
  and (
    exists (
      select 1
      from ownership_account_members oam
      where oam.account_id = vendors.owner_account_id
        and oam.profile_id = auth.uid()
        and oam.active = true
    )
    or exists (
      select 1
      from ownership_accounts oa
      where oa.id = vendors.owner_account_id
        and oa.created_by_profile_id = auth.uid()
    )
    or exists (
      select 1
      from property_managers pm
      join properties p on p.id = pm.property_id
      where p.owner_account_id = vendors.owner_account_id
        and pm.manager_profile_id = auth.uid()
        and pm.active = true
    )
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Notifications: expand type enum for critical LLC events
-- ─────────────────────────────────────────────────────────────────────────────

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
check (type in (
  'new_ticket',
  'late_rent',
  'ticket_resolved',
  'payment_recorded',
  'lease_updated',
  'document_sent',
  'document_signed'
));

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger update: invitation accept + owner membership hydration
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _role text;
begin
  _role := coalesce(nullif(trim(new.raw_user_meta_data ->> 'role'), ''), 'tenant');
  if _role not in ('owner', 'manager', 'tenant') then
    _role := 'tenant';
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    _role
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name);

  -- Owner invitations create membership in the target ownership account.
  insert into ownership_account_members (account_id, profile_id, member_role, active, can_receive_critical_alerts)
  select i.ownership_account_id, new.id, 'owner', true, true
  from invitations i
  where lower(i.email) = lower(new.email)
    and i.status = 'pending'
    and i.role = 'owner'
    and i.ownership_account_id is not null
  on conflict (account_id, profile_id) do update
    set active = true,
        can_receive_critical_alerts = true;

  -- Manager invitations ensure active manager assignment.
  insert into property_managers (property_id, manager_profile_id, active)
  select i.property_id, new.id, true
  from invitations i
  where lower(i.email) = lower(new.email)
    and i.status = 'pending'
    and i.role = 'manager'
    and i.property_id is not null
  on conflict (property_id, manager_profile_id) do update
    set active = true;

  -- Auto-accept pending invitations for this email.
  update invitations
  set status = 'accepted',
      accepted_at = now(),
      invited_profile_id = new.id
  where lower(email) = lower(new.email)
    and status = 'pending';

  return new;
end;
$$;
