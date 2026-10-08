-- Sprint 207: record WHEN a charge was waived, so historical owner statements ("still owed at month end")
-- don't change when a charge is waived later. Every path that sets status = 'waived' (app, admin, SQL)
-- goes through this trigger. Existing waived rows keep waived_at NULL = "waived at an unknown time";
-- statements treat NULL as waived before any cutoff (never shown as owed).

do $pre$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'rent_charges' and column_name = 'waived_at') then
    raise exception 'preflight: rent_charges.waived_at already exists';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.rent_charges'::regclass and not tgisinternal) then
    raise exception 'preflight: unexpected user triggers on rent_charges';
  end if;
end $pre$;

alter table public.rent_charges add column waived_at timestamptz;

create or replace function public.rent_charges_track_waived_at() returns trigger
language plpgsql set search_path = ''
as $fn$
begin
  if new.status = 'waived' and (tg_op = 'INSERT' or old.status is distinct from 'waived') then
    new.waived_at := now();
  elsif new.status is distinct from 'waived' then
    new.waived_at := null;
  elsif tg_op = 'UPDATE' then
    new.waived_at := old.waived_at; -- stays waived: keep the original time, ignore client values
  end if;
  return new;
end $fn$;

create trigger rent_charges_track_waived_at before insert or update on public.rent_charges
  for each row execute function public.rent_charges_track_waived_at();

revoke execute on function public.rent_charges_track_waived_at() from public, anon, authenticated;
