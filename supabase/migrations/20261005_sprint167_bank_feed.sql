-- Sprint 167: bank feed Phase 1 (statement upload, matching, review, filing).
-- Privacy: only rental items (rent, expense, transfer) are stored in bank_transactions.
-- Personal items the owner rejects are kept only as keyed (HMAC) fingerprints.
-- All writes go through server actions with the service role; owners get read-only RLS.
-- Same-owner-account integrity is enforced by triggers, because service-role writes bypass RLS.

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
  match_text text not null check (char_length(match_text) between 6 and 200),
  action text not null check (action in ('rent', 'expense', 'transfer', 'skip')),
  lease_id uuid references public.leases(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  expense_category text check (expense_category is null or expense_category in (
    'mortgage', 'insurance', 'property_tax', 'hoa', 'repair', 'maintenance', 'utility', 'management_fee', 'legal', 'other'
  )),
  label text check (label is null or char_length(label) <= 80),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint bank_rules_action_shape check (
    (action = 'rent' and direction = 'in' and lease_id is not null and property_id is null and expense_category is null)
    or (action = 'expense' and direction = 'out' and lease_id is null and property_id is not null and expense_category is not null)
    or (action in ('transfer', 'skip') and lease_id is null and property_id is null and expense_category is null)
  )
);
create unique index if not exists bank_rules_unique_match
  on public.bank_rules (owner_account_id, coalesce(bank_account_id, '00000000-0000-0000-0000-000000000000'::uuid), direction, match_text);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  posted_on date not null,
  amount_cents integer not null check (amount_cents > 0),
  direction text not null check (direction in ('in', 'out')),
  description text not null check (char_length(description) <= 300),
  kind text not null check (kind in ('rent', 'expense', 'transfer')),
  property_id uuid references public.properties(id) on delete cascade,
  lease_id uuid references public.leases(id) on delete cascade,
  rent_charge_id uuid references public.rent_charges(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete cascade,
  expense_id uuid references public.property_expenses(id) on delete cascade,
  created_record boolean not null default false,
  prior_charge_status text check (prior_charge_status is null or prior_charge_status in ('pending', 'late')),
  matched_by text not null check (matched_by in ('rule', 'auto', 'owner')),
  rule_id uuid references public.bank_rules(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bank_account_id, fingerprint),
  constraint bank_transactions_kind_shape check (
    (kind = 'rent' and direction = 'in' and property_id is not null and lease_id is not null
      and rent_charge_id is not null and expense_id is null
      and (created_record = false or (payment_id is not null and prior_charge_status is not null)))
    or (kind = 'expense' and direction = 'out' and property_id is not null and expense_id is not null
      and lease_id is null and rent_charge_id is null and payment_id is null and prior_charge_status is null)
    or (kind = 'transfer' and property_id is null and lease_id is null and rent_charge_id is null
      and payment_id is null and expense_id is null and created_record = false and prior_charge_status is null)
  )
);
create index if not exists bank_transactions_account_posted on public.bank_transactions (bank_account_id, posted_on desc);
create index if not exists bank_transactions_property_posted on public.bank_transactions (property_id, posted_on desc);

create table if not exists public.bank_skipped_fingerprints (
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (bank_account_id, fingerprint)
);

-- Integrity: every reference must belong to the same ownership account.
create or replace function public.bank_rules_check_integrity()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.bank_account_id is not null and not exists (
    select 1 from bank_accounts ba where ba.id = new.bank_account_id and ba.owner_account_id = new.owner_account_id
  ) then raise exception 'bank_rules: bank account belongs to another ownership account'; end if;
  if new.property_id is not null and not exists (
    select 1 from properties p where p.id = new.property_id and p.owner_account_id = new.owner_account_id
  ) then raise exception 'bank_rules: property belongs to another ownership account'; end if;
  if new.lease_id is not null and not exists (
    select 1 from leases l join units u on u.id = l.unit_id join properties p on p.id = u.property_id
    where l.id = new.lease_id and p.owner_account_id = new.owner_account_id
  ) then raise exception 'bank_rules: lease belongs to another ownership account'; end if;
  return new;
end $$;

create or replace function public.bank_transactions_check_integrity()
returns trigger language plpgsql set search_path = public as $$
declare v_account uuid;
begin
  select ba.owner_account_id into v_account from bank_accounts ba where ba.id = new.bank_account_id;
  if v_account is null then raise exception 'bank_transactions: unknown bank account'; end if;
  if new.property_id is not null and not exists (
    select 1 from properties p where p.id = new.property_id and p.owner_account_id = v_account
  ) then raise exception 'bank_transactions: property belongs to another ownership account'; end if;
  if new.lease_id is not null and not exists (
    select 1 from leases l join units u on u.id = l.unit_id where l.id = new.lease_id and u.property_id = new.property_id
  ) then raise exception 'bank_transactions: lease is not on this property'; end if;
  if new.rent_charge_id is not null and not exists (
    select 1 from rent_charges rc where rc.id = new.rent_charge_id and rc.lease_id = new.lease_id
  ) then raise exception 'bank_transactions: rent charge is not on this lease'; end if;
  if new.payment_id is not null and not exists (
    select 1 from payments pm where pm.id = new.payment_id and pm.rent_charge_id = new.rent_charge_id
  ) then raise exception 'bank_transactions: payment is not on this rent charge'; end if;
  if new.expense_id is not null and not exists (
    select 1 from property_expenses e where e.id = new.expense_id and e.property_id = new.property_id
  ) then raise exception 'bank_transactions: expense is not on this property'; end if;
  if new.rule_id is not null and not exists (
    select 1 from bank_rules r where r.id = new.rule_id and r.owner_account_id = v_account
  ) then raise exception 'bank_transactions: rule belongs to another ownership account'; end if;
  return new;
end $$;

drop trigger if exists bank_rules_integrity on public.bank_rules;
create trigger bank_rules_integrity before insert or update on public.bank_rules
  for each row execute function public.bank_rules_check_integrity();
drop trigger if exists bank_transactions_integrity on public.bank_transactions;
create trigger bank_transactions_integrity before insert or update on public.bank_transactions
  for each row execute function public.bank_transactions_check_integrity();

revoke execute on function public.bank_rules_check_integrity() from public, anon, authenticated;
revoke execute on function public.bank_transactions_check_integrity() from public, anon, authenticated;

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
revoke select on public.bank_skipped_fingerprints from authenticated;
