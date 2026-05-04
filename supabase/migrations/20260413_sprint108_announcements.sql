create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid not null references profiles(id),
  scope text not null check (scope in ('all_administered', 'specific_properties')),
  property_ids uuid[] default null,
  title text not null check (char_length(title) > 0 and char_length(title) <= 200),
  body text not null check (char_length(body) > 0 and char_length(body) <= 5000),
  recipient_count integer not null default 0,
  dedupe_key text not null,
  created_at timestamptz not null default now()
);

alter table announcements drop constraint if exists chk_announcement_scope_property_alignment;
alter table announcements add constraint chk_announcement_scope_property_alignment
check (
  (scope = 'specific_properties' and property_ids is not null and array_length(property_ids, 1) > 0)
  or
  (scope = 'all_administered' and property_ids is null)
);

create index if not exists idx_announcements_sender_created
  on announcements (sender_profile_id, created_at desc);

create unique index if not exists uq_announcements_dedupe
  on announcements (sender_profile_id, dedupe_key)
  where dedupe_key is not null;

alter table announcements enable row level security;

drop policy if exists announcements_sender_can_read on announcements;
create policy announcements_sender_can_read on announcements
  for select
  using (sender_profile_id = auth.uid());

drop policy if exists announcements_authenticated_can_insert on announcements;
create policy announcements_authenticated_can_insert on announcements
  for insert
  with check (
    sender_profile_id = auth.uid()
    and exists (
      select 1
      from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('owner', 'manager')
    )
  );

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
check (type = any (array[
  'new_ticket',
  'late_rent',
  'ticket_resolved',
  'payment_recorded',
  'lease_updated',
  'document_sent',
  'document_signed',
  'application_reviewed',
  'rent_due_reminder',
  'invite_accepted',
  'achievement_unlocked',
  'owner_message',
  'announcement',
  'lease_expiring_soon',
  'lease_expired',
  'delinquency_escalation',
  'distribution_change_requested',
  'distribution_change_approved',
  'distribution_change_rejected',
  'withdrawal_requested',
  'withdrawal_approved',
  'withdrawal_rejected',
  'withdrawal_completed'
]));
