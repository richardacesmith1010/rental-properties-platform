-- Sprint 248a: daily counts only. This function never changes user data.
create table public.retention_reports (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  category text not null,
  rule text not null,
  cutoff date not null,
  eligible_count integer not null,
  oldest_anchor date,
  blocked_count integer not null default 0,
  notes text,
  unique (run_at, category)
);
revoke all on table public.retention_reports from public, anon, authenticated, service_role;
alter table public.retention_reports enable row level security;

create function public.report_retention_candidates()
returns integer language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_run_at timestamptz;
  v_today date;
  v_money_cutoff date;
  v_lease_cutoff date;
  v_repair_cutoff date;
  v_count integer;
begin
  v_run_at := greatest(clock_timestamp(),
    coalesce((select max(run_at) from public.retention_reports), '-infinity'::timestamptz) + interval '1 microsecond');
  v_today := (v_run_at at time zone 'UTC')::date;
  v_money_cutoff := make_date(extract(year from v_today)::int - 8, 12, 31);
  v_lease_cutoff := (v_today - interval '7 years')::date;
  v_repair_cutoff := (v_today - interval '3 years')::date;

  with payment_dates as (
    select p.rent_charge_id, max((p.paid_at at time zone 'UTC')::date) as newest_paid_on,
      sum(case when p.paid_at is null then 1 else 0 end) as undated_payments
    from public.payments p group by p.rent_charge_id
  ), charge_anchors as (
    select c.id, c.lease_id,
      greatest(c.due_date, pd.newest_paid_on, (c.waived_at at time zone 'UTC')::date,
        (c.deleted_at at time zone 'UTC')::date) as anchor,
      coalesce(pd.undated_payments, 0) as undated_payments
    from public.rent_charges c left join payment_dates pd on pd.rent_charge_id = c.id
  ), lease_anchors as (
    select l.id, case when l.lease_status = 'terminated'
      then coalesce((l.terminated_at at time zone 'UTC')::date, l.end_date)
      else l.end_date end as anchor
    from public.leases l
    where l.active = false and l.lease_status in ('expired', 'terminated', 'renewed')
  ), lease_candidates as (
    select la.id, la.anchor,
      exists (select 1 from public.documents d where d.lease_id = la.id)
      or exists (select 1 from public.inspections i where i.lease_id = la.id)
      or exists (select 1 from public.leases successor where successor.renewed_from_lease_id = la.id)
      or exists (select 1 from charge_anchors ca where ca.lease_id = la.id
        and (ca.anchor is null or ca.anchor > v_money_cutoff or ca.undated_payments > 0))
      or exists (select 1 from public.bank_transactions b where b.lease_id = la.id
        and (b.posted_on is null or b.posted_on > v_money_cutoff))
      or exists (select 1 from public.lease_deposit_returns dr where dr.lease_id = la.id
        and (dr.returned_on is null or dr.returned_on > v_money_cutoff))
      or exists (select 1 from public.rent_charge_lines line where line.lease_id = la.id) as blocked
    from lease_anchors la
  ), repair_candidates as (
    select (greatest(t.resolved_at, (select max(h.created_at) from public.maintenance_status_history h
      where h.ticket_id = t.id and h.to_status in ('resolved', 'closed'))) at time zone 'UTC')::date as anchor,
      (select count(*) from public.maintenance_photos photo where photo.ticket_id = t.id) as photo_count
    from public.maintenance_tickets t where t.status in ('resolved', 'closed')
  ), candidates as (
    select 'payments'::text as category, (p.paid_at at time zone 'UTC')::date as anchor,
      false as blocked, 0::bigint as photo_count from public.payments p
    union all select 'rent_charges', ca.anchor, ca.undated_payments > 0, 0::bigint from charge_anchors ca
    union all select 'property_expenses', e.expense_date, false, 0::bigint from public.property_expenses e
    union all select 'bank_transactions', b.posted_on, false, 0::bigint from public.bank_transactions b
    union all select 'manager_payments', coalesce((m.paid_at at time zone 'UTC')::date, m.payment_date),
      false, 0::bigint from public.manager_payments m
    union all select 'partner_payments', pp.paid_on, false, 0::bigint from public.partner_payments pp
    union all select 'lease_deposit_returns', dr.returned_on, false, 0::bigint from public.lease_deposit_returns dr
    union all select 'property_tax_years', make_date(ty.tax_year, 12, 31), false, 0::bigint
      from public.property_tax_years ty
    union all select 'leases', lc.anchor, lc.blocked, 0::bigint from lease_candidates lc
    union all select 'lease_document_packets', la.anchor, false, 0::bigint
      from public.document_packets packet join lease_anchors la on la.id = packet.lease_id
      where la.anchor <= v_lease_cutoff
    union all select 'repairs', r.anchor, false, r.photo_count from repair_candidates r
  ), categories(category, rule, cutoff) as (values
    ('payments', 'tax_year+7', v_money_cutoff),
    ('rent_charges', 'tax_year+7', v_money_cutoff),
    ('property_expenses', 'tax_year+7', v_money_cutoff),
    ('bank_transactions', 'tax_year+7', v_money_cutoff),
    ('manager_payments', 'tax_year+7', v_money_cutoff),
    ('partner_payments', 'tax_year+7', v_money_cutoff),
    ('lease_deposit_returns', 'tax_year+7', v_money_cutoff),
    ('property_tax_years', 'tax_year+7', v_money_cutoff),
    ('leases', 'ended+7y', v_lease_cutoff),
    ('lease_document_packets', 'ended+7y', v_lease_cutoff),
    ('repairs', 'closed+3y', v_repair_cutoff)
  )
  insert into public.retention_reports
    (run_at, category, rule, cutoff, eligible_count, oldest_anchor, blocked_count, notes)
  select v_run_at, k.category, k.rule, k.cutoff,
    sum(case when c.anchor <= k.cutoff then 1 else 0 end)::integer,
    min(case when c.anchor <= k.cutoff then c.anchor end),
    sum(case when c.anchor <= k.cutoff and c.blocked then 1 else 0 end)::integer,
    case when k.category = 'repairs' then 'eligible_photos=' ||
      sum(case when c.anchor <= k.cutoff then c.photo_count else 0 end)::text else null end
  from categories k left join candidates c on c.category = k.category and c.anchor is not null
  group by k.category, k.rule, k.cutoff;
  get diagnostics v_count = row_count;

  delete from public.retention_reports where run_at < v_run_at - interval '400 days';
  return v_count;
end $$;
revoke all on function public.report_retention_candidates()
  from public, anon, authenticated, service_role;

-- cron.schedule upserts by job name. Daily at 09:45 UTC.
select cron.schedule('domus-retention-report', '45 9 * * *',
  $$select public.report_retention_candidates()$$);

-- Rollback (Claude applies only after review):
-- select cron.unschedule('domus-retention-report');
-- drop function public.report_retention_candidates();
-- drop table public.retention_reports;
