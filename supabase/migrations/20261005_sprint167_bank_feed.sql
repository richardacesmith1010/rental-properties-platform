-- Sprint 167: bank feed Phase 1 (statement upload, matching, review, filing).
-- Privacy: only rental items (rent, expense, transfer) are stored in bank_transactions.
-- Personal items the owner rejects are kept only as one-way fingerprints.
-- All writes go through server actions with the service role; owners get read-only RLS.

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.ownership_accounts(id) on delete cascade,
  institution text not null check (institution in ('fidelity', 'navy_federal', 'other')),
  nickname text not null check (char_length(nickname) between 1 and 60),
  source text not null default 'upload' check (source in ('upload', 'plaid')),
  last_import_at timestamptz,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (owner_account_id, institution, nickname)
);

create table if not exists public.bank_rules (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.ownership_accounts(id) on delete cascade,
  bank_account_id uuid references public.bank_accounts(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  match_text text not null check (char_length(match_text) between 3 and 200),
  action text not null check (action in ('rent', 'expense', 'transfer', 'skip')),
  lease_id uuid references public.leases(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  expense_category text,
  label text check (label is null or char_length(label) <= 80),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (action <> 'rent' or lease_id is not null),
  check (action <> 'expense' or (property_id is not null and expense_category is not null))
);
create unique index if not exists bank_rules_unique_match
  on public.bank_rules (owner_account_id, coalesce(bank_account_id, '00000000-0000-0000-0000-000000000000'::uuid), direction, match_text);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  fingerprint text not null check (char_length(fingerprint) = 64),
  posted_on date not null,
  amount_cents integer not null check (amount_cents > 0),
  direction text not null check (direction in ('in', 'out')),
  description text not null check (char_length(description) <= 300),
  kind text not null check (kind in ('rent', 'expense', 'transfer')),
  property_id uuid references public.properties(id) on delete cascade,
  lease_id uuid references public.leases(id) on delete set null,
  rent_charge_id uuid references public.rent_charges(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  expense_id uuid references public.property_expenses(id) on delete set null,
  created_record boolean not null default false,
  matched_by text not null check (matched_by in ('rule', 'owner')),
  rule_id uuid references public.bank_rules(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bank_account_id, fingerprint),
  check (kind = 'transfer' or property_id is not null)
);
create index if not exists bank_transactions_account_posted on public.bank_transactions (bank_account_id, posted_on desc);
create index if not exists bank_transactions_property_posted on public.bank_transactions (property_id, posted_on desc);

create table if not exists public.bank_skipped_fingerprints (
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  fingerprint text not null check (char_length(fingerprint) = 64),
  created_at timestamptz not null default now(),
  primary key (bank_account_id, fingerprint)
);

alter table public.bank_accounts enable row level security;
alter table public.bank_rules enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.bank_skipped_fingerprints enable row level security;

create policy bank_accounts_select_owner on public.bank_accounts
  for select to authenticated using (public.is_owner_member_of_account(owner_account_id));
create policy bank_rules_select_owner on public.bank_rules
  for select to authenticated using (public.is_owner_member_of_account(owner_account_id));
create policy bank_transactions_select_owner on public.bank_transactions
  for select to authenticated using (exists (
    select 1 from public.bank_accounts ba
    where ba.id = bank_transactions.bank_account_id and public.is_owner_member_of_account(ba.owner_account_id)
  ));
-- bank_skipped_fingerprints: no client policies (service role only).

revoke all on public.bank_accounts, public.bank_rules, public.bank_transactions, public.bank_skipped_fingerprints from anon;
revoke insert, update, delete on public.bank_accounts, public.bank_rules, public.bank_transactions, public.bank_skipped_fingerprints from authenticated;
