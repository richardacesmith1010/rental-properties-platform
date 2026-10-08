-- Sprint 207: record WHEN a charge was (most recently) waived. Owner statements use it so a charge that is
-- waived LATER still shows as owed in earlier months. Policy (chosen by Claude 2026-10-09; owner can change): statements
-- are restatements from current records; corrections (un-waiving, amount edits, deletions) can change past months.
-- Every path that sets status = 'waived' goes through this trigger; clients cannot set waived_at themselves.
-- Existing waived rows keep waived_at NULL = "waived at an unknown time" (treated as waived before any cutoff).
-- Live check 2026-10-09: rent_charges has no user triggers today (rent rules are triggers on leases).

do $pre$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'rent_charges' and column_name = 'waived_at') then
    raise exception 'preflight: rent_charges.waived_at already exists';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.rent_charges'::regclass
             and tgname = 'rent_charges_track_waived_at') then
    raise exception 'preflight: rent_charges_track_waived_at already exists';
  end if;
end $pre$;

alter table public.rent_charges add column waived_at timestamptz;

create or replace function public.rent_charges_track_waived_at() returns trigger
language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    new.waived_at := case when new.status = 'waived' then now() else null end;
    return new;
  end if;
  -- UPDATE
  if new.status = 'waived' and old.status is distinct from 'waived' then
    new.waived_at := now();                 -- became waived
  elsif new.status = 'waived' then
    new.waived_at := old.waived_at;         -- stays waived: keep the original time, ignore client values
  else
    new.waived_at := null;                  -- not waived (un-waiving restates past months by policy)
  end if;
  return new;
end $fn$;

create trigger rent_charges_track_waived_at before insert or update on public.rent_charges
  for each row execute function public.rent_charges_track_waived_at();

revoke execute on function public.rent_charges_track_waived_at() from public, anon, authenticated;
