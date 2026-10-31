-- Sprint 259b: LLC invitation tokens were readable by every active member of the LLC (policy "LLC members can view
-- invitations" plus a SELECT grant on every column, token included), and a token lets its holder create the invitee's
-- login at /join-llc. The app reads and writes llc_invitations only with the service role: every query in
-- apps/web/app/actions/llc-invitations.ts and apps/web/lib/llc-invitations.ts uses createAdminClient(), and no database
-- function references the table (checked 2026-10-30). So clients need no access at all.
-- 1. Remove every client privilege and the three client policies (RLS stays on; the service role bypasses it).
-- 2. Rotate the token of every pending invitation, so a copy read before today is useless (live: 1 pending, expired).

revoke all on table public.llc_invitations from anon, authenticated;

drop policy if exists "LLC members can view invitations" on public.llc_invitations;
drop policy if exists "LLC admins can create invitations" on public.llc_invitations;
drop policy if exists "LLC admins can update invitations" on public.llc_invitations;

alter table public.llc_invitations enable row level security;

update public.llc_invitations set token = gen_random_uuid() where status = 'pending';

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.llc_invitations'::regclass)
     or exists (select 1 from information_schema.column_privileges
                where table_schema = 'public' and table_name = 'llc_invitations'
                  and grantee in ('anon', 'authenticated'))
     or exists (select 1 from information_schema.role_table_grants
                where table_schema = 'public' and table_name = 'llc_invitations'
                  and grantee in ('anon', 'authenticated'))
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'llc_invitations') <> 0
     or not has_table_privilege('service_role', 'public.llc_invitations', 'SELECT') then
    raise exception 'sprint259b postcondition failed';
  end if;
end $$;
