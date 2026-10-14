-- Sprint 230: data-retention policy §3 — bank items waiting for an answer are kept at most 90 days.
-- Age counts from when the item entered the queue (created_at), not the bank's posted date, so a
-- first sync that pulls old history still gives the owner 90 days to answer.
-- Each deleted item leaves only its HMAC fingerprint in bank_skipped_fingerprints (same as "No"),
-- so the next bank sync does not add it back.

create function public.purge_stale_bank_review_items()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with gone as (
    delete from public.bank_review_items
      where created_at < now() - interval '90 days'
      returning bank_account_id, fingerprint
  ), tomb as (
    insert into public.bank_skipped_fingerprints(bank_account_id, fingerprint)
      select distinct bank_account_id, fingerprint from gone
      on conflict do nothing
  )
  select count(*) into v_count from gone;
  return v_count;
end $$;
revoke all on function public.purge_stale_bank_review_items()
  from public, anon, authenticated, service_role;

-- cron.schedule upserts by job name, so re-running this migration is safe. Daily at 09:30 UTC.
select cron.schedule(
  'domus-purge-stale-bank-review-items',
  '30 9 * * *',
  $$select public.purge_stale_bank_review_items();$$
);
