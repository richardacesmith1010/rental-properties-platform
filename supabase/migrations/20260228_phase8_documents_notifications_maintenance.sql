-- Phase 8: Documents + E-sign, Notifications, Vendor Assignments, Maintenance Photos

-- ─────────────────────────────────────────────────────────────────────────────
-- Documents + E-sign core tables
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists document_templates (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  category text not null,
  body_markdown text not null,
  created_at timestamptz not null default now()
);

create table if not exists document_packets (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references document_templates(id) on delete restrict,
  property_id uuid not null references properties(id) on delete cascade,
  unit_id uuid references units(id) on delete set null,
  lease_id uuid references leases(id) on delete set null,
  status text not null check (status in ('draft', 'sent', 'signed', 'void')) default 'draft',
  created_by_profile_id uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  signed_at timestamptz
);

create table if not exists document_signers (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references document_packets(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  email text not null,
  role text not null check (role in ('owner', 'manager', 'tenant')),
  status text not null check (status in ('pending', 'signed')) default 'pending',
  signed_at timestamptz,
  signature_text text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (packet_id, email)
);

create index if not exists idx_document_templates_owner on document_templates(owner_profile_id);
create index if not exists idx_document_packets_property on document_packets(property_id);
create index if not exists idx_document_packets_lease on document_packets(lease_id);
create index if not exists idx_document_signers_packet on document_signers(packet_id);
create index if not exists idx_document_signers_profile on document_signers(profile_id);

alter table document_templates enable row level security;
alter table document_packets enable row level security;
alter table document_signers enable row level security;

drop policy if exists "document_templates_select_owner" on document_templates;
create policy "document_templates_select_owner" on document_templates
for select using (owner_profile_id = auth.uid());

drop policy if exists "document_templates_insert_owner" on document_templates;
create policy "document_templates_insert_owner" on document_templates
for insert with check (owner_profile_id = auth.uid());

drop policy if exists "document_templates_update_owner" on document_templates;
create policy "document_templates_update_owner" on document_templates
for update using (owner_profile_id = auth.uid());

drop policy if exists "document_templates_delete_owner" on document_templates;
create policy "document_templates_delete_owner" on document_templates
for delete using (owner_profile_id = auth.uid());

drop policy if exists "document_packets_select_accessible" on document_packets;
create policy "document_packets_select_accessible" on document_packets
for select using (public.can_access_property(property_id));

drop policy if exists "document_packets_insert_owner" on document_packets;
create policy "document_packets_insert_owner" on document_packets
for insert with check (
  created_by_profile_id = auth.uid()
  and exists (
    select 1
    from properties p
    where p.id = document_packets.property_id
      and p.owner_profile_id = auth.uid()
  )
);

drop policy if exists "document_packets_update_owner" on document_packets;
create policy "document_packets_update_owner" on document_packets
for update using (
  exists (
    select 1
    from properties p
    where p.id = document_packets.property_id
      and p.owner_profile_id = auth.uid()
  )
);

drop policy if exists "document_signers_select_accessible" on document_signers;
create policy "document_signers_select_accessible" on document_signers
for select using (
  profile_id = auth.uid()
  or lower(email) = lower(coalesce((select email from profiles where id = auth.uid()), ''))
  or exists (
    select 1
    from document_packets dp
    where dp.id = document_signers.packet_id
      and public.can_access_property(dp.property_id)
  )
);

drop policy if exists "document_signers_insert_owner" on document_signers;
create policy "document_signers_insert_owner" on document_signers
for insert with check (
  exists (
    select 1
    from document_packets dp
    join properties p on p.id = dp.property_id
    where dp.id = document_signers.packet_id
      and p.owner_profile_id = auth.uid()
  )
);

drop policy if exists "document_signers_update_self_or_owner" on document_signers;
create policy "document_signers_update_self_or_owner" on document_signers
for update using (
  profile_id = auth.uid()
  or lower(email) = lower(coalesce((select email from profiles where id = auth.uid()), ''))
  or exists (
    select 1
    from document_packets dp
    join properties p on p.id = dp.property_id
    where dp.id = document_signers.packet_id
      and p.owner_profile_id = auth.uid()
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Notifications (in-app + delivery records)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('new_ticket', 'late_rent')),
  title text not null,
  body text not null,
  entity_type text not null,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_profile_id, type, entity_type, entity_id)
);

create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email')),
  status text not null check (status in ('pending', 'sent', 'failed')),
  provider_ref text,
  error_message text,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient on notifications(recipient_profile_id, created_at desc);
create index if not exists idx_notification_deliveries_notification on notification_deliveries(notification_id);

alter table notifications enable row level security;
alter table notification_deliveries enable row level security;

drop policy if exists "notifications_select_self" on notifications;
create policy "notifications_select_self" on notifications
for select using (recipient_profile_id = auth.uid());

drop policy if exists "notifications_update_self" on notifications;
create policy "notifications_update_self" on notifications
for update using (recipient_profile_id = auth.uid());

drop policy if exists "notification_deliveries_select_self" on notification_deliveries;
create policy "notification_deliveries_select_self" on notification_deliveries
for select using (
  exists (
    select 1
    from notifications n
    where n.id = notification_deliveries.notification_id
      and n.recipient_profile_id = auth.uid()
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Vendors + ticket assignments + maintenance photos
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  trade text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists maintenance_assignments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references maintenance_tickets(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete restrict,
  assigned_by_profile_id uuid not null references profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  status text not null check (status in ('assigned', 'reassigned', 'cancelled')) default 'assigned'
);

create table if not exists maintenance_photos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references maintenance_tickets(id) on delete cascade,
  uploaded_by_profile_id uuid not null references profiles(id) on delete restrict,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendors_owner on vendors(owner_profile_id);
create index if not exists idx_maintenance_assignments_ticket on maintenance_assignments(ticket_id, assigned_at desc);
create index if not exists idx_maintenance_photos_ticket on maintenance_photos(ticket_id, created_at desc);

alter table vendors enable row level security;
alter table maintenance_assignments enable row level security;
alter table maintenance_photos enable row level security;

drop policy if exists "vendors_select_owner_or_manager" on vendors;
create policy "vendors_select_owner_or_manager" on vendors
for select using (
  owner_profile_id = auth.uid()
  or exists (
    select 1
    from property_managers pm
    join properties p on p.id = pm.property_id
    where pm.manager_profile_id = auth.uid()
      and pm.active = true
      and p.owner_profile_id = vendors.owner_profile_id
  )
);

drop policy if exists "vendors_insert_owner" on vendors;
create policy "vendors_insert_owner" on vendors
for insert with check (owner_profile_id = auth.uid());

drop policy if exists "vendors_update_owner" on vendors;
create policy "vendors_update_owner" on vendors
for update using (owner_profile_id = auth.uid());

drop policy if exists "vendors_delete_owner" on vendors;
create policy "vendors_delete_owner" on vendors
for delete using (owner_profile_id = auth.uid());

drop policy if exists "maintenance_assignments_select_accessible" on maintenance_assignments;
create policy "maintenance_assignments_select_accessible" on maintenance_assignments
for select using (
  exists (
    select 1
    from maintenance_tickets mt
    where mt.id = maintenance_assignments.ticket_id
      and public.can_access_property(mt.property_id)
  )
);

drop policy if exists "maintenance_assignments_insert_owner_or_manager" on maintenance_assignments;
create policy "maintenance_assignments_insert_owner_or_manager" on maintenance_assignments
for insert with check (
  exists (
    select 1
    from maintenance_tickets mt
    where mt.id = maintenance_assignments.ticket_id
      and public.can_access_property(mt.property_id)
  )
  and (
    assigned_by_profile_id = auth.uid()
    or exists (
      select 1
      from profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'manager')
    )
  )
);

drop policy if exists "maintenance_photos_select_accessible" on maintenance_photos;
create policy "maintenance_photos_select_accessible" on maintenance_photos
for select using (
  exists (
    select 1
    from maintenance_tickets mt
    where mt.id = maintenance_photos.ticket_id
      and public.can_access_property(mt.property_id)
  )
);

drop policy if exists "maintenance_photos_insert_owner_or_manager" on maintenance_photos;
create policy "maintenance_photos_insert_owner_or_manager" on maintenance_photos
for insert with check (
  uploaded_by_profile_id = auth.uid()
  and exists (
    select 1
    from maintenance_tickets mt
    where mt.id = maintenance_photos.ticket_id
      and public.can_access_property(mt.property_id)
  )
  and exists (
    select 1
    from profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'manager')
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage buckets used by server-side uploads
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('lease-documents', 'lease-documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('maintenance-photos', 'maintenance-photos', false)
on conflict (id) do nothing;
