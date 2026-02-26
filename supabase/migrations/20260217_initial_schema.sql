-- Initial schema for rental operations platform

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key,
  full_name text not null,
  email text not null unique,
  phone text,
  role text not null check (role in ('owner', 'manager', 'tenant')),
  created_at timestamptz not null default now()
);

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references profiles(id),
  name text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  created_at timestamptz not null default now()
);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  unit_number text not null,
  bedrooms int not null default 0,
  bathrooms numeric(3,1) not null default 1.0,
  monthly_rent_cents int not null,
  occupied boolean not null default false,
  unique(property_id, unit_number)
);

create table if not exists leases (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete restrict,
  tenant_profile_id uuid not null references profiles(id),
  start_date date not null,
  end_date date not null,
  monthly_rent_cents int not null,
  due_day_of_month int not null check (due_day_of_month between 1 and 28),
  deposit_cents int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists rent_charges (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references leases(id) on delete cascade,
  due_date date not null,
  amount_cents int not null,
  status text not null check (status in ('pending', 'paid', 'late')) default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  rent_charge_id uuid not null references rent_charges(id) on delete cascade,
  paid_at timestamptz not null default now(),
  amount_cents int not null,
  method text not null check (method in ('ach', 'card', 'cash', 'check', 'other')),
  reference_note text
);

create table if not exists maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  unit_id uuid references units(id),
  tenant_profile_id uuid references profiles(id),
  title text not null,
  description text not null,
  status text not null check (status in ('open', 'in_progress', 'resolved', 'closed')) default 'open',
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')) default 'medium',
  estimated_cost_cents int,
  actual_cost_cents int,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id),
  unit_id uuid references units(id),
  lease_id uuid references leases(id),
  uploaded_by_profile_id uuid not null references profiles(id),
  document_type text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists communication_logs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  unit_id uuid references units(id),
  profile_id uuid references profiles(id),
  channel text not null check (channel in ('sms', 'email', 'call', 'in_person', 'other')),
  direction text not null check (direction in ('inbound', 'outbound')),
  subject text,
  body text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table properties enable row level security;
alter table units enable row level security;
alter table leases enable row level security;
alter table rent_charges enable row level security;
alter table payments enable row level security;
alter table maintenance_tickets enable row level security;
alter table documents enable row level security;
alter table communication_logs enable row level security;

-- Baseline policy: authenticated users can read rows related to their profile.
-- Tighten this further once role-specific auth logic is implemented.
create policy "profiles_select_self" on profiles
for select using (auth.uid() = id);

create policy "profiles_update_self" on profiles
for update using (auth.uid() = id);
