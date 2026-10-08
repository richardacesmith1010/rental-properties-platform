-- Sprint 202: per-home, per-year tax inputs for an accurate Schedule E style summary.
-- Owners enter Form 1098 mortgage interest, escrow-paid property tax and insurance, and the
-- depreciation amount from their tax preparer. Owner-only (managers excluded). No backfill.
create table public.property_tax_years (
  property_id uuid not null references public.properties(id) on delete cascade,
  tax_year integer not null check (tax_year between 2000 and 2100),
  mortgage_interest_cents bigint not null default 0 check (mortgage_interest_cents >= 0),
  escrow_property_tax_cents bigint not null default 0 check (escrow_property_tax_cents >= 0),
  escrow_insurance_cents bigint not null default 0 check (escrow_insurance_cents >= 0),
  depreciation_cents bigint not null default 0 check (depreciation_cents >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (property_id, tax_year)
);

alter table public.property_tax_years enable row level security;
revoke all on public.property_tax_years from anon, authenticated;
grant select, insert, update on public.property_tax_years to authenticated;
grant all on public.property_tax_years to service_role;

-- Owner members (member_role = 'owner', active) of the property's ownership account only.
create policy property_tax_years_owner_select on public.property_tax_years for select to authenticated
  using (exists (select 1 from public.properties p
    join public.ownership_account_members oam on oam.account_id = p.owner_account_id
    where p.id = property_tax_years.property_id and oam.profile_id = auth.uid()
      and oam.member_role = 'owner' and oam.active = true));
create policy property_tax_years_owner_insert on public.property_tax_years for insert to authenticated
  with check (exists (select 1 from public.properties p
    join public.ownership_account_members oam on oam.account_id = p.owner_account_id
    where p.id = property_tax_years.property_id and oam.profile_id = auth.uid()
      and oam.member_role = 'owner' and oam.active = true));
create policy property_tax_years_owner_update on public.property_tax_years for update to authenticated
  using (exists (select 1 from public.properties p
    join public.ownership_account_members oam on oam.account_id = p.owner_account_id
    where p.id = property_tax_years.property_id and oam.profile_id = auth.uid()
      and oam.member_role = 'owner' and oam.active = true))
  with check (exists (select 1 from public.properties p
    join public.ownership_account_members oam on oam.account_id = p.owner_account_id
    where p.id = property_tax_years.property_id and oam.profile_id = auth.uid()
      and oam.member_role = 'owner' and oam.active = true));
-- No delete policy: values are set to 0 instead of deleted.
