create table public.rent_charge_lines (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references public.leases(id) on delete cascade,
  charge_id uuid references public.rent_charges(id) on delete cascade,
  kind text not null check (kind in ('utility', 'credit')),
  label text not null check (length(trim(label)) between 1 and 60),
  amount_cents integer not null check (
    (kind = 'utility' and amount_cents > 0) or (kind = 'credit' and amount_cents < 0)
  ),
  source_expense_id uuid references public.property_expenses(id) on delete set null,
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  attached_at timestamptz
);
create unique index rent_charge_lines_expense_unique
  on public.rent_charge_lines(source_expense_id) where source_expense_id is not null;
create index rent_charge_lines_waiting on public.rent_charge_lines(lease_id) where charge_id is null;
alter table public.rent_charge_lines enable row level security;
revoke all on public.rent_charge_lines from anon, authenticated;

create function public.lease_line_visible_to_caller(p_lease_id uuid, p_charge_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.leases l join public.units u on u.id = l.unit_id
    where l.id = p_lease_id and (
      public.can_administer_property(u.property_id)
      or (p_charge_id is not null and l.tenant_profile_id = auth.uid())
    )
  );
$$;
revoke all on function public.lease_line_visible_to_caller(uuid, uuid) from public, anon;
grant execute on function public.lease_line_visible_to_caller(uuid, uuid) to authenticated;
create policy rent_charge_lines_read on public.rent_charge_lines for select to authenticated
  using (public.lease_line_visible_to_caller(lease_id, charge_id));
grant select on public.rent_charge_lines to authenticated;

create function public.add_rent_charge_line(
  p_lease_id uuid, p_kind text, p_label text, p_amount_cents integer,
  p_source_expense_id uuid, p_actor_profile_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_rent integer; v_property uuid; v_expense_property uuid; v_category text; v_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rent_charge_lines:' || p_lease_id::text, 0));
  select l.monthly_rent_cents, u.property_id into v_rent, v_property
  from public.leases l join public.units u on u.id = l.unit_id where l.id = p_lease_id;
  if v_rent is null then raise exception 'lease_not_found'; end if;
  if p_kind not in ('utility', 'credit') or p_amount_cents is null or
     (p_kind = 'utility' and p_amount_cents <= 0) or
     (p_kind = 'credit' and (p_amount_cents >= 0 or
       pg_catalog.abs(p_amount_cents::bigint) >= v_rent::bigint)) then
    raise exception 'invalid_line_amount';
  end if;
  if p_source_expense_id is not null then
    select e.property_id, e.category into v_expense_property, v_category
    from public.property_expenses e where e.id = p_source_expense_id;
    if v_expense_property is distinct from v_property or v_category is distinct from 'utility' then
      raise exception 'invalid_source_expense';
    end if;
  end if;
  insert into public.rent_charge_lines
    (lease_id, kind, label, amount_cents, source_expense_id, created_by_profile_id)
  values (p_lease_id, p_kind, p_label, p_amount_cents, p_source_expense_id, p_actor_profile_id)
  on conflict (source_expense_id) where source_expense_id is not null do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.rent_charge_lines where source_expense_id = p_source_expense_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.add_rent_charge_line(uuid, text, text, integer, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.add_rent_charge_line(uuid, text, text, integer, uuid, uuid) to service_role;

create function public.remove_rent_charge_line(p_line_id uuid, p_actor_profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_lease_id uuid; v_charge_id uuid;
begin
  select lease_id into v_lease_id from public.rent_charge_lines where id = p_line_id;
  if v_lease_id is null then raise exception 'line_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rent_charge_lines:' || v_lease_id::text, 0));
  select charge_id into v_charge_id from public.rent_charge_lines where id = p_line_id for update;
  if not found then raise exception 'line_not_found'; end if;
  if v_charge_id is not null then raise exception 'line_attached'; end if;
  delete from public.rent_charge_lines where id = p_line_id and charge_id is null;
end;
$$;
revoke all on function public.remove_rent_charge_line(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_rent_charge_line(uuid, uuid) to service_role;

create function public.create_rent_charge_with_lines(p_lease_id uuid, p_due_date date, p_rent_cents integer)
returns table(charge_id uuid, created boolean) language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_newest date; v_total bigint; v_line record; v_selected uuid[] := '{}'; v_claimed bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rent_charge_lines:' || p_lease_id::text, 0));
  select max(c.due_date) into v_newest from public.rent_charges c
    where c.lease_id = p_lease_id and c.category = 'rent' and c.deleted_at is null;
  insert into public.rent_charges(lease_id, due_date, amount_cents, status, category)
    values (p_lease_id, p_due_date, p_rent_cents, 'pending', 'rent')
    on conflict (lease_id, due_date, category) where deleted_at is null do nothing
    returning id into v_id;
  if v_id is null then
    select c.id into v_id from public.rent_charges c where c.lease_id = p_lease_id
      and c.due_date = p_due_date and c.category = 'rent' and c.deleted_at is null;
    return query select v_id, false;
    return;
  end if;
  if v_newest is null or v_newest <= p_due_date then
    v_total := p_rent_cents::bigint;
    for v_line in select l.id, l.amount_cents from public.rent_charge_lines l
      where l.lease_id = p_lease_id and l.charge_id is null and l.kind = 'utility'
      order by l.created_at, l.id loop
      v_selected := pg_catalog.array_append(v_selected, v_line.id);
      v_total := v_total + v_line.amount_cents::bigint;
    end loop;
    for v_line in select l.id, l.amount_cents from public.rent_charge_lines l
      where l.lease_id = p_lease_id and l.charge_id is null and l.kind = 'credit'
      order by l.created_at, l.id loop
      if v_total + v_line.amount_cents::bigint > 0 then
        v_selected := pg_catalog.array_append(v_selected, v_line.id);
        v_total := v_total + v_line.amount_cents::bigint;
      end if;
    end loop;
    if v_total <= 0 or v_total > 2147483647 then raise exception 'charge_total_out_of_range'; end if;
    with claimed as (
      update public.rent_charge_lines l set charge_id = v_id, attached_at = now()
      where l.lease_id = p_lease_id and l.charge_id is null and l.id = any(v_selected)
      returning l.amount_cents
    ) select coalesce(sum(amount_cents::bigint), 0) into v_claimed from claimed;
    v_total := p_rent_cents::bigint + v_claimed;
    if v_total <= 0 or v_total > 2147483647 then raise exception 'charge_total_out_of_range'; end if;
    update public.rent_charges set amount_cents = v_total::integer where id = v_id;
  end if;
  return query select v_id, true;
end;
$$;
revoke all on function public.create_rent_charge_with_lines(uuid, date, integer)
  from public, anon, authenticated;
grant execute on function public.create_rent_charge_with_lines(uuid, date, integer) to service_role;
