-- Phase 10: V2 Phase A foundations (Leasing pipeline + Inbox threads + Automation runtime)

-- ─────────────────────────────────────────────────────────────────────────────
-- Leasing pipeline
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists rental_listings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  created_by_profile_id uuid not null references profiles(id) on delete restrict,
  status text not null check (status in ('draft', 'published', 'paused', 'archived')) default 'draft',
  headline text not null,
  description text,
  asking_rent_cents int not null check (asking_rent_cents > 0),
  available_on date,
  bedroom_count numeric(4,1),
  bathroom_count numeric(4,1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rental_applications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references rental_listings(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  applicant_email text not null,
  applicant_name text,
  applicant_phone text,
  status text not null check (status in ('submitted', 'in_review', 'approved', 'rejected', 'withdrawn')) default 'submitted',
  submitted_at timestamptz not null default now(),
  reviewed_by_profile_id uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  notes text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists screening_reports (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references rental_applications(id) on delete cascade,
  provider text not null,
  external_report_id text,
  status text not null check (status in ('pending', 'completed', 'failed')) default 'pending',
  summary text,
  score int,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references rental_applications(id) on delete cascade,
  event_type text not null,
  actor_profile_id uuid references profiles(id) on delete set null,
  message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_rental_listings_property on rental_listings(property_id, created_at desc);
create index if not exists idx_rental_listings_status on rental_listings(status);
create index if not exists idx_rental_applications_listing on rental_applications(listing_id, submitted_at desc);
create index if not exists idx_rental_applications_property on rental_applications(property_id, status);
create index if not exists idx_rental_applications_email on rental_applications(lower(applicant_email));
create index if not exists idx_screening_reports_application on screening_reports(application_id, created_at desc);
create index if not exists idx_application_events_application on application_events(application_id, created_at desc);

alter table rental_listings enable row level security;
alter table rental_applications enable row level security;
alter table screening_reports enable row level security;
alter table application_events enable row level security;

drop policy if exists "rental_listings_select_access" on rental_listings;
create policy "rental_listings_select_access" on rental_listings
for select using (public.can_access_property(property_id));

drop policy if exists "rental_listings_insert_admin" on rental_listings;
create policy "rental_listings_insert_admin" on rental_listings
for insert with check (
  created_by_profile_id = auth.uid()
  and public.can_administer_property(property_id)
);

drop policy if exists "rental_listings_update_admin" on rental_listings;
create policy "rental_listings_update_admin" on rental_listings
for update using (public.can_administer_property(property_id));

drop policy if exists "rental_listings_delete_admin" on rental_listings;
create policy "rental_listings_delete_admin" on rental_listings
for delete using (public.can_administer_property(property_id));

drop policy if exists "rental_applications_select_access" on rental_applications;
create policy "rental_applications_select_access" on rental_applications
for select using (
  public.can_access_property(property_id)
  or lower(applicant_email) = lower(coalesce((select email from profiles where id = auth.uid()), ''))
);

drop policy if exists "rental_applications_insert_access" on rental_applications;
create policy "rental_applications_insert_access" on rental_applications
for insert with check (
  public.can_administer_property(property_id)
  or lower(applicant_email) = lower(coalesce((select email from profiles where id = auth.uid()), ''))
);

drop policy if exists "rental_applications_update_admin" on rental_applications;
create policy "rental_applications_update_admin" on rental_applications
for update using (public.can_administer_property(property_id));

drop policy if exists "rental_applications_delete_admin" on rental_applications;
create policy "rental_applications_delete_admin" on rental_applications
for delete using (public.can_administer_property(property_id));

drop policy if exists "screening_reports_select_admin" on screening_reports;
create policy "screening_reports_select_admin" on screening_reports
for select using (
  exists (
    select 1
    from rental_applications ra
    where ra.id = screening_reports.application_id
      and public.can_administer_property(ra.property_id)
  )
);

drop policy if exists "screening_reports_insert_admin" on screening_reports;
create policy "screening_reports_insert_admin" on screening_reports
for insert with check (
  exists (
    select 1
    from rental_applications ra
    where ra.id = screening_reports.application_id
      and public.can_administer_property(ra.property_id)
  )
);

drop policy if exists "screening_reports_update_admin" on screening_reports;
create policy "screening_reports_update_admin" on screening_reports
for update using (
  exists (
    select 1
    from rental_applications ra
    where ra.id = screening_reports.application_id
      and public.can_administer_property(ra.property_id)
  )
);

drop policy if exists "application_events_select_access" on application_events;
create policy "application_events_select_access" on application_events
for select using (
  exists (
    select 1
    from rental_applications ra
    where ra.id = application_events.application_id
      and (
        public.can_access_property(ra.property_id)
        or lower(ra.applicant_email) = lower(coalesce((select email from profiles where id = auth.uid()), ''))
      )
  )
);

drop policy if exists "application_events_insert_access" on application_events;
create policy "application_events_insert_access" on application_events
for insert with check (
  exists (
    select 1
    from rental_applications ra
    where ra.id = application_events.application_id
      and (
        public.can_administer_property(ra.property_id)
        or lower(ra.applicant_email) = lower(coalesce((select email from profiles where id = auth.uid()), ''))
      )
  )
  and (actor_profile_id is null or actor_profile_id = auth.uid())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Inbox threads + message delivery tracking
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists inbox_threads (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  subject text not null,
  created_by_profile_id uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inbox_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references inbox_threads(id) on delete cascade,
  sender_profile_id uuid references profiles(id) on delete set null,
  sender_email text,
  body text not null,
  channel text not null check (channel in ('in_app', 'email', 'sms', 'system')),
  direction text not null check (direction in ('inbound', 'outbound', 'system')),
  created_at timestamptz not null default now()
);

create table if not exists message_deliveries (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references inbox_messages(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'sms')),
  status text not null check (status in ('pending', 'sent', 'failed')),
  provider_ref text,
  error_message text,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_inbox_threads_property on inbox_threads(property_id, updated_at desc);
create index if not exists idx_inbox_threads_entity on inbox_threads(entity_type, entity_id);
create index if not exists idx_inbox_messages_thread on inbox_messages(thread_id, created_at asc);
create index if not exists idx_message_deliveries_message on message_deliveries(message_id, attempted_at desc);

alter table inbox_threads enable row level security;
alter table inbox_messages enable row level security;
alter table message_deliveries enable row level security;

drop policy if exists "inbox_threads_select_access" on inbox_threads;
create policy "inbox_threads_select_access" on inbox_threads
for select using (public.can_access_property(property_id));

drop policy if exists "inbox_threads_insert_access" on inbox_threads;
create policy "inbox_threads_insert_access" on inbox_threads
for insert with check (
  created_by_profile_id = auth.uid()
  and public.can_access_property(property_id)
);

drop policy if exists "inbox_threads_update_admin" on inbox_threads;
create policy "inbox_threads_update_admin" on inbox_threads
for update using (public.can_administer_property(property_id));

drop policy if exists "inbox_messages_select_access" on inbox_messages;
create policy "inbox_messages_select_access" on inbox_messages
for select using (
  exists (
    select 1
    from inbox_threads it
    where it.id = inbox_messages.thread_id
      and public.can_access_property(it.property_id)
  )
);

drop policy if exists "inbox_messages_insert_access" on inbox_messages;
create policy "inbox_messages_insert_access" on inbox_messages
for insert with check (
  exists (
    select 1
    from inbox_threads it
    where it.id = inbox_messages.thread_id
      and public.can_access_property(it.property_id)
  )
  and (sender_profile_id is null or sender_profile_id = auth.uid())
);

drop policy if exists "message_deliveries_select_access" on message_deliveries;
create policy "message_deliveries_select_access" on message_deliveries
for select using (
  exists (
    select 1
    from inbox_messages im
    join inbox_threads it on it.id = im.thread_id
    where im.id = message_deliveries.message_id
      and public.can_access_property(it.property_id)
  )
);

drop policy if exists "message_deliveries_insert_admin" on message_deliveries;
create policy "message_deliveries_insert_admin" on message_deliveries
for insert with check (
  exists (
    select 1
    from inbox_messages im
    join inbox_threads it on it.id = im.thread_id
    where im.id = message_deliveries.message_id
      and public.can_administer_property(it.property_id)
  )
);

drop policy if exists "message_deliveries_update_admin" on message_deliveries;
create policy "message_deliveries_update_admin" on message_deliveries
for update using (
  exists (
    select 1
    from inbox_messages im
    join inbox_threads it on it.id = im.thread_id
    where im.id = message_deliveries.message_id
      and public.can_administer_property(it.property_id)
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Automation templates + property-level rules + run log
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists automation_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  role_scope text not null check (role_scope in ('owner', 'manager', 'both')),
  enabled_by_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  template_id uuid not null references automation_templates(id) on delete cascade,
  created_by_profile_id uuid not null references profiles(id) on delete restrict,
  active boolean not null default true,
  config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, template_id)
);

create table if not exists automation_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references automation_rules(id) on delete cascade,
  trigger_type text not null,
  trigger_ref_id uuid,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  result_summary text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_templates_key on automation_templates(key);
create index if not exists idx_automation_rules_property on automation_rules(property_id, active);
create index if not exists idx_automation_rules_template on automation_rules(template_id);
create index if not exists idx_automation_runs_rule on automation_runs(rule_id, created_at desc);
create index if not exists idx_automation_runs_status on automation_runs(status, created_at desc);

alter table automation_templates enable row level security;
alter table automation_rules enable row level security;
alter table automation_runs enable row level security;

drop policy if exists "automation_templates_select_authenticated" on automation_templates;
create policy "automation_templates_select_authenticated" on automation_templates
for select using (auth.role() = 'authenticated');

drop policy if exists "automation_rules_select_admin" on automation_rules;
create policy "automation_rules_select_admin" on automation_rules
for select using (public.can_administer_property(property_id));

drop policy if exists "automation_rules_insert_admin" on automation_rules;
create policy "automation_rules_insert_admin" on automation_rules
for insert with check (
  created_by_profile_id = auth.uid()
  and public.can_administer_property(property_id)
);

drop policy if exists "automation_rules_update_admin" on automation_rules;
create policy "automation_rules_update_admin" on automation_rules
for update using (public.can_administer_property(property_id));

drop policy if exists "automation_rules_delete_admin" on automation_rules;
create policy "automation_rules_delete_admin" on automation_rules
for delete using (public.can_administer_property(property_id));

drop policy if exists "automation_runs_select_admin" on automation_runs;
create policy "automation_runs_select_admin" on automation_runs
for select using (
  exists (
    select 1
    from automation_rules ar
    where ar.id = automation_runs.rule_id
      and public.can_administer_property(ar.property_id)
  )
);

drop policy if exists "automation_runs_insert_admin" on automation_runs;
create policy "automation_runs_insert_admin" on automation_runs
for insert with check (
  exists (
    select 1
    from automation_rules ar
    where ar.id = automation_runs.rule_id
      and public.can_administer_property(ar.property_id)
  )
);

drop policy if exists "automation_runs_update_admin" on automation_runs;
create policy "automation_runs_update_admin" on automation_runs
for update using (
  exists (
    select 1
    from automation_rules ar
    where ar.id = automation_runs.rule_id
      and public.can_administer_property(ar.property_id)
  )
);

insert into automation_templates (key, name, description, role_scope, enabled_by_default)
values
  ('late_rent_sequence', 'Late Rent Sequence', 'Notify tenant and log escalation checkpoints when a charge becomes late.', 'both', true),
  ('lease_renewal_sequence', 'Lease Renewal Sequence', 'Create staged reminders and renewal packet tasks ahead of lease expiry.', 'owner', false),
  ('new_ticket_sla', 'Maintenance SLA Sequence', 'Apply SLA checkpoints and escalation reminders for maintenance tickets.', 'both', true),
  ('move_in_sequence', 'Move-in Sequence', 'Track move-in readiness and first billing/document milestones.', 'both', false),
  ('move_out_sequence', 'Move-out Sequence', 'Track move-out inspection, closeout docs, and final balance workflow.', 'owner', false),
  ('manager_vendor_followup', 'Vendor Follow-up Sequence', 'Trigger follow-up when assigned ticket response is delayed.', 'manager', false)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  role_scope = excluded.role_scope,
  enabled_by_default = excluded.enabled_by_default;
