-- Rollback for 20261024_sprint238b_account_deletion_requests.sql (Sprint 238b). Claude-only; not a migration. Run manually
-- as postgres only if 238b must be undone. Revert the 238b app code first: while the table is missing, the button shows
-- "We could not send your request. Please try again." and signs no one out.
-- Open requests are promises to users (deleted within 30 days), so this script refuses to run while any exist. Finish or
-- withdraw them with docs/runbooks/account-deletion.md first. Done rows hold no email or profile link after the runbook;
-- withdrawn rows keep profile_id. Export closed rows first if their history is still wanted. Dropping the table also drops the
-- account_deletion_requests_one_open index and its RLS setting. Safe to run twice.
begin;

do $$
begin
  if to_regclass('public.account_deletion_requests') is null then
    raise notice 'public.account_deletion_requests does not exist; nothing to roll back';
    return;
  end if;

  -- Block new requests between the check and the drop (held until commit).
  lock table public.account_deletion_requests in access exclusive mode;

  if exists (select 1 from public.account_deletion_requests where status = 'open') then
    raise exception 'account_deletion_requests has % open request(s); finish or withdraw them before rolling back',
      (select count(*) from public.account_deletion_requests where status = 'open');
  end if;

  raise notice 'dropping account_deletion_requests with % closed row(s)',
    (select count(*) from public.account_deletion_requests);
end $$;

drop table if exists public.account_deletion_requests;

commit;
