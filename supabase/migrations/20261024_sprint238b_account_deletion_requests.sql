-- Sprint 238b: queue for in-app "Delete my account" requests (App Store 5.1.1(v)). Source of truth for the manual runbook
-- (docs/runbooks/account-deletion.md). Server actions write it with the service-role client after requireAuth; clients
-- get no grants at all (L-025). Owner decision 2026-10-16: build the code part now; runbook hardened before first use.

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid null references public.profiles(id) on delete set null,
  email_at_request text null,
  role_at_request text not null check (role_at_request in ('owner', 'manager', 'tenant')),
  requested_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'done', 'withdrawn')),
  handled_at timestamptz null,
  confirmation_sent_at timestamptz null
);

comment on table public.account_deletion_requests is
  'In-app account deletion requests. PII lifecycle: when a request is done, the runbook clears profile_id and '
  'email_at_request and keeps id, role, timestamps and status.';

create unique index account_deletion_requests_one_open
  on public.account_deletion_requests (profile_id) where status = 'open';

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;

do $$
begin
  if has_table_privilege('anon', 'public.account_deletion_requests', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.account_deletion_requests', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'client grant on account_deletion_requests';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.account_deletion_requests'::regclass) then
    raise exception 'RLS is off on account_deletion_requests';
  end if;
end $$;
