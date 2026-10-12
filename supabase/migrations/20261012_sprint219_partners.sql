create or replace function public.is_active_owner_member(p_account_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ownership_account_members m
    where m.account_id = p_account_id and m.profile_id = p_profile_id
      and m.active and m.member_role = 'owner'
  );
$$;
revoke all on function public.is_active_owner_member(uuid, uuid) from public, anon;
grant execute on function public.is_active_owner_member(uuid, uuid) to authenticated;

create or replace function public.expense_in_account(p_expense_id uuid, p_account_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.property_expenses e
    join public.properties p on p.id = e.property_id
    join public.ownership_accounts a on a.id = p.owner_account_id
    where e.id = p_expense_id and a.id = p_account_id and a.account_type = 'llc'
  );
$$;
revoke all on function public.expense_in_account(uuid, uuid) from public, anon;
grant execute on function public.expense_in_account(uuid, uuid) to authenticated;

create or replace function public.is_llc_account(p_account_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ownership_accounts a
    where a.id = p_account_id and a.account_type = 'llc'
  );
$$;
revoke all on function public.is_llc_account(uuid) from public, anon;
grant execute on function public.is_llc_account(uuid) to authenticated;

create table public.account_partners (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ownership_accounts(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  profile_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, account_id)
);
create unique index account_partners_profile_unique on public.account_partners(account_id, profile_id)
  where profile_id is not null;
create unique index account_partners_active_name_unique on public.account_partners(account_id, lower(trim(display_name)))
  where active;

create table public.partner_payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ownership_accounts(id) on delete cascade,
  from_partner_id uuid,
  to_partner_id uuid,
  amount_cents integer not null check (amount_cents > 0),
  paid_on date not null,
  kind text not null check (kind in ('reimbursement', 'manager_fee', 'settle_up', 'other')),
  status text not null default 'done' check (status in ('done', 'planned')),
  note text check (note is null or length(note) <= 200),
  created_by_profile_id uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  check (from_partner_id is not null or to_partner_id is not null),
  check (from_partner_id is distinct from to_partner_id),
  foreign key (from_partner_id, account_id) references public.account_partners(id, account_id),
  foreign key (to_partner_id, account_id) references public.account_partners(id, account_id)
);

create table public.expense_partner_attributions (
  expense_id uuid primary key references public.property_expenses(id) on delete cascade,
  account_id uuid not null references public.ownership_accounts(id) on delete cascade,
  partner_id uuid not null,
  created_by_profile_id uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (partner_id, account_id) references public.account_partners(id, account_id)
);

alter table public.property_expenses drop constraint property_expenses_category_check;
alter table public.property_expenses add constraint property_expenses_category_check
  check (category in ('mortgage', 'insurance', 'property_tax', 'hoa', 'repair', 'maintenance',
    'utility', 'management_fee', 'legal', 'other', 'improvement'));

alter table public.account_partners enable row level security;
alter table public.partner_payments enable row level security;
alter table public.expense_partner_attributions enable row level security;

create policy account_partners_select on public.account_partners for select to authenticated
  using (public.is_owner_member_of_account(account_id));
create policy account_partners_delete on public.account_partners for delete to authenticated
  using (public.is_owner_member_of_account(account_id));
create policy account_partners_insert on public.account_partners for insert to authenticated
  with check (public.is_owner_member_of_account(account_id) and public.is_llc_account(account_id)
    and (profile_id is null or public.is_active_owner_member(account_id, profile_id)));
create policy account_partners_update on public.account_partners for update to authenticated
  using (public.is_owner_member_of_account(account_id))
  with check (public.is_owner_member_of_account(account_id) and public.is_llc_account(account_id)
    and (profile_id is null or public.is_active_owner_member(account_id, profile_id)));

create policy partner_payments_select on public.partner_payments for select to authenticated
  using (public.is_owner_member_of_account(account_id));
create policy partner_payments_delete on public.partner_payments for delete to authenticated
  using (public.is_owner_member_of_account(account_id));
create policy partner_payments_insert on public.partner_payments for insert to authenticated
  with check (public.is_owner_member_of_account(account_id) and public.is_llc_account(account_id)
    and created_by_profile_id = auth.uid());
create policy partner_payments_update on public.partner_payments for update to authenticated
  using (public.is_owner_member_of_account(account_id) and public.is_llc_account(account_id))
  with check (public.is_owner_member_of_account(account_id) and public.is_llc_account(account_id));

create policy expense_partner_attributions_select on public.expense_partner_attributions for select to authenticated
  using (public.is_owner_member_of_account(account_id));
create policy expense_partner_attributions_delete on public.expense_partner_attributions for delete to authenticated
  using (public.is_owner_member_of_account(account_id));
create policy expense_partner_attributions_insert on public.expense_partner_attributions for insert to authenticated
  with check (public.is_owner_member_of_account(account_id) and public.expense_in_account(expense_id, account_id)
    and created_by_profile_id = auth.uid());
create policy expense_partner_attributions_update on public.expense_partner_attributions for update to authenticated
  using (public.is_owner_member_of_account(account_id) and public.expense_in_account(expense_id, account_id))
  with check (public.is_owner_member_of_account(account_id) and public.expense_in_account(expense_id, account_id));

-- Supabase default privileges give every client role full rights on new public tables.
-- Revoke them so the column-level UPDATE grants below are the only update path.
revoke all on public.account_partners, public.partner_payments, public.expense_partner_attributions
  from anon, authenticated;
grant select, insert, delete on public.account_partners, public.partner_payments,
  public.expense_partner_attributions to authenticated;
grant update (display_name, profile_id, active) on public.account_partners to authenticated;
grant update (from_partner_id, to_partner_id, amount_cents, paid_on, kind, status, note)
  on public.partner_payments to authenticated;
grant update (partner_id) on public.expense_partner_attributions to authenticated;

insert into public.account_partners (account_id, display_name, profile_id)
select m.account_id, coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)), m.profile_id
from public.ownership_account_members m
join public.ownership_accounts a on a.id = m.account_id and a.account_type = 'llc'
join public.profiles p on p.id = m.profile_id
where m.active and m.member_role = 'owner'
on conflict do nothing;
