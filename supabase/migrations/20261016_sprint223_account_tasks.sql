create table public.account_tasks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ownership_accounts(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  frequency text not null check (frequency in ('monthly', 'quarterly', 'yearly', 'as_needed')),
  next_due_on date,
  owner_partner_id uuid,
  last_done_on date,
  last_done_by_profile_id uuid references public.profiles(id),
  active boolean not null default true,
  created_by_profile_id uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((frequency = 'as_needed') = (next_due_on is null)),
  foreign key (owner_partner_id, account_id) references public.account_partners(id, account_id)
    on delete set null (owner_partner_id)
);

alter table public.account_tasks enable row level security;
create policy account_tasks_select on public.account_tasks for select to authenticated
  using (public.is_owner_member_of_account(account_id));
create policy account_tasks_delete on public.account_tasks for delete to authenticated
  using (public.is_owner_member_of_account(account_id));
create policy account_tasks_insert on public.account_tasks for insert to authenticated
  with check (public.is_owner_member_of_account(account_id) and public.is_llc_account(account_id)
    and created_by_profile_id = auth.uid());
create policy account_tasks_update on public.account_tasks for update to authenticated
  using (public.is_owner_member_of_account(account_id) and public.is_llc_account(account_id))
  with check (public.is_owner_member_of_account(account_id) and public.is_llc_account(account_id));

revoke all on public.account_tasks from anon, authenticated;
grant select, insert, delete on public.account_tasks to authenticated;
grant update (title, frequency, next_due_on, owner_partner_id, active, last_done_on)
  on public.account_tasks to authenticated;

create function public.account_tasks_done_by() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.last_done_by_profile_id := auth.uid();
  return new;
end;
$$;
create trigger account_tasks_done_by before update of last_done_on on public.account_tasks
  for each row execute function public.account_tasks_done_by();

-- Table-level INSERT grants must not permit a caller to forge completion metadata.
create function public.account_tasks_init_done_by() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.last_done_on := null;
  new.last_done_by_profile_id := null;
  return new;
end;
$$;
create trigger account_tasks_init_done_by before insert on public.account_tasks
  for each row execute function public.account_tasks_init_done_by();
