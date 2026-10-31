-- Sprint 259a: a reproducible record of which Terms of Service and Privacy Policy version each person agreed to.
-- 1. legal_document_versions: each published version and the SHA-256 of its archived text. Append-only. Publishing
--    a version is a reviewed migration that inserts its row, so a published version can never change silently.
-- 2. legal_acceptances: one row per person per version pair, written only by the service role from server code at
--    the click (sign-up form, invite setup, LLC join, /agree). Each row must point at published versions (FK). It holds
--    no name, email or phone: email_hmac is a keyed hash (server secret, versioned by email_hmac_key_version) that
--    proves who agreed after the account is anonymized. role_at_acceptance is a snapshot of profiles.role, not an
--    authorization. People read their own rows. Nobody changes a row.
-- 3. legal_holds + purge_expired_legal_acceptances(): rows stay after account closure (the account-deletion runbook
--    anonymizes profiles, never deletes them) for 10 years after the person's latest deletion request is done, then an
--    owner-approved purge removes rows recorded before that closure, skipping active holds and reopened accounts, and
--    writes an audit row. No client write grants (L-025).
-- 4. profiles_keep_legal_evidence: a real (non-tester) profile that still has agreement records or an active legal
--    hold can't be hard-deleted; the runbook anonymizes it instead. Test accounts (is_tester) stay deletable.

create table if not exists public.legal_document_versions (
  document text not null check (document in ('terms', 'privacy')),
  version text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  published_at timestamptz not null default now(),
  primary key (document, version),
  constraint legal_document_versions_full_key unique (document, version, sha256)
);

comment on table public.legal_document_versions is
  'Sprint 259a: published Terms/Privacy versions and the SHA-256 of each archived text. Append-only; '
  'insert a row (reviewed migration) to publish a new version.';

alter table public.legal_document_versions enable row level security;
revoke all on table public.legal_document_versions from anon, authenticated;

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  terms_document text generated always as ('terms') stored,
  terms_version text not null,
  terms_sha256 text not null,
  privacy_document text generated always as ('privacy') stored,
  privacy_version text not null,
  privacy_sha256 text not null,
  source text not null check (source in ('sign_up', 'invite', 'llc_invite', 'agree_page')),
  role_at_acceptance text not null check (role_at_acceptance in ('owner', 'manager', 'tenant')),
  client text not null check (client in ('web', 'ios_app')),
  email_hmac text not null check (email_hmac ~ '^[0-9a-f]{64}$'),
  email_hmac_key_version smallint not null check (email_hmac_key_version > 0),
  accepted_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  app_commit text null check (app_commit is null or app_commit ~ '^[0-9a-f]{7,40}$'),
  constraint legal_acceptances_one_per_version unique (profile_id, terms_version, privacy_version),
  constraint legal_acceptances_accepted_not_after_recorded check (accepted_at <= recorded_at),
  constraint legal_acceptances_terms_published foreign key (terms_document, terms_version, terms_sha256)
    references public.legal_document_versions (document, version, sha256),
  constraint legal_acceptances_privacy_published foreign key (privacy_document, privacy_version, privacy_sha256)
    references public.legal_document_versions (document, version, sha256)
);

comment on table public.legal_acceptances is
  'Sprint 259a: one row per person per Terms/Privacy version pair they agreed to (published versions only), with '
  'role, client and a keyed email hash. Service-role writes only; append-only (purge only through '
  'purge_expired_legal_acceptances or the profile cascade).';

alter table public.legal_acceptances enable row level security;

revoke all on table public.legal_acceptances from anon, authenticated;
grant select on table public.legal_acceptances to authenticated;

drop policy if exists legal_acceptances_select_own on public.legal_acceptances;
create policy legal_acceptances_select_own on public.legal_acceptances
  for select to authenticated
  using (profile_id = (select auth.uid()));

create table if not exists public.legal_holds (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null check (length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  released_at timestamptz null
);

comment on table public.legal_holds is
  'Sprint 259a: profiles whose legal_acceptances rows must not be purged (open dispute, court order). Service role only.';

alter table public.legal_holds enable row level security;
revoke all on table public.legal_holds from anon, authenticated;

create or replace function public.legal_documents_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'legal_document_versions is append-only (%)', tg_op using errcode = 'P0001';
end;
$$;

create or replace function public.legal_acceptances_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- The profile FK cascade deletes child rows after the profile row is gone.
    if not exists (select 1 from public.profiles p where p.id = old.profile_id) then
      return old;
    end if;
    -- The reviewed purge function (security definer) marks its own transaction; only its owner may use the mark.
    if current_setting('app.legal_acceptances_purge', true) = 'on'
       and current_user = (select pg_catalog.pg_get_userbyid(p.proowner) from pg_catalog.pg_proc p
                            where p.oid = to_regprocedure('public.purge_expired_legal_acceptances(text)')) then
      return old;
    end if;
  end if;
  raise exception 'legal_acceptances is append-only (%)', tg_op using errcode = 'P0001';
end;
$$;

revoke all on function public.legal_documents_append_only() from public, anon, authenticated;
revoke all on function public.legal_acceptances_append_only() from public, anon, authenticated;

drop trigger if exists legal_document_versions_no_update on public.legal_document_versions;
create trigger legal_document_versions_no_update
  before update or delete on public.legal_document_versions
  for each row execute function public.legal_documents_append_only();

drop trigger if exists legal_document_versions_no_truncate on public.legal_document_versions;
create trigger legal_document_versions_no_truncate
  before truncate on public.legal_document_versions
  for each statement execute function public.legal_documents_append_only();

drop trigger if exists legal_acceptances_no_update on public.legal_acceptances;
create trigger legal_acceptances_no_update
  before update on public.legal_acceptances
  for each row execute function public.legal_acceptances_append_only();

drop trigger if exists legal_acceptances_no_direct_delete on public.legal_acceptances;
create trigger legal_acceptances_no_direct_delete
  before delete on public.legal_acceptances
  for each row execute function public.legal_acceptances_append_only();

drop trigger if exists legal_acceptances_no_truncate on public.legal_acceptances;
create trigger legal_acceptances_no_truncate
  before truncate on public.legal_acceptances
  for each statement execute function public.legal_acceptances_append_only();

create or replace function public.profiles_keep_legal_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_tester then
    return old;
  end if;
  if exists (select 1 from public.legal_acceptances la where la.profile_id = old.id)
     or exists (select 1 from public.legal_holds h where h.profile_id = old.id and h.released_at is null) then
    raise exception 'profiles: keep this profile (agreement records or a legal hold); anonymize it instead'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

revoke all on function public.profiles_keep_legal_evidence() from public, anon, authenticated;

drop trigger if exists profiles_keep_legal_evidence on public.profiles;
create trigger profiles_keep_legal_evidence
  before delete on public.profiles
  for each row execute function public.profiles_keep_legal_evidence();

create or replace function public.purge_expired_legal_acceptances(p_approved_by text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_cutoff timestamptz := now() - interval '10 years';
  v_approver text := trim(coalesce(p_approved_by, ''));
begin
  if length(v_approver) not between 3 and 100 or v_approver ~ '[[:cntrl:]]' then
    raise exception 'purge_expired_legal_acceptances: approver must be 3 to 100 plain characters' using errcode = 'P0001';
  end if;
  perform pg_catalog.set_config('app.legal_acceptances_purge', 'on', true);
  -- Anchor: the person's latest deletion request (by requested_at). Only a 'done' one closed before the cutoff
  -- counts; a later request (reopened, withdrawn, open) blocks the purge. Rows recorded after closure stay.
  delete from public.legal_acceptances la
   using (select distinct on (r.profile_id) r.profile_id, r.status, r.handled_at
            from public.account_deletion_requests r
           where r.profile_id is not null
           order by r.profile_id, r.requested_at desc, r.id desc) latest
   where latest.profile_id = la.profile_id
     and latest.status = 'done'
     and latest.handled_at is not null
     and latest.handled_at < v_cutoff
     and la.recorded_at <= latest.handled_at
     and not exists (select 1 from public.legal_holds h
                      where h.profile_id = la.profile_id and h.released_at is null);
  get diagnostics v_count = row_count;
  perform pg_catalog.set_config('app.legal_acceptances_purge', 'off', true);
  insert into public.audit_logs (user_id, action, entity_type, metadata)
  values (null, 'legal_acceptances_purge', 'legal_acceptances',
          jsonb_build_object('rows', v_count, 'approved_by', v_approver, 'closed_before', v_cutoff));
  return v_count;
end;
$$;

revoke all on function public.purge_expired_legal_acceptances(text) from public, anon, authenticated;
grant execute on function public.purge_expired_legal_acceptances(text) to service_role;

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.legal_acceptances'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.legal_document_versions'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.legal_holds'::regclass)
     or has_table_privilege('anon', 'public.legal_acceptances', 'SELECT')
     or has_table_privilege('anon', 'public.legal_acceptances', 'INSERT')
     or has_table_privilege('authenticated', 'public.legal_acceptances', 'INSERT')
     or has_table_privilege('authenticated', 'public.legal_acceptances', 'UPDATE')
     or has_table_privilege('authenticated', 'public.legal_acceptances', 'DELETE')
     or has_table_privilege('authenticated', 'public.legal_acceptances', 'TRUNCATE')
     or not has_table_privilege('authenticated', 'public.legal_acceptances', 'SELECT')
     or exists (select 1 from unnest(array['anon', 'authenticated']) as r(role_name),
                unnest(array['public.legal_document_versions', 'public.legal_holds']) as t(table_name),
                unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as v(privilege)
                where has_table_privilege(r.role_name, t.table_name, v.privilege))
     or has_function_privilege('authenticated', 'public.purge_expired_legal_acceptances(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.purge_expired_legal_acceptances(text)', 'EXECUTE')
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'legal_acceptances') <> 1
     or (select count(*) from pg_trigger where tgrelid = 'public.legal_acceptances'::regclass
         and tgname in ('legal_acceptances_no_update', 'legal_acceptances_no_direct_delete',
                        'legal_acceptances_no_truncate')) <> 3
     or (select count(*) from pg_trigger where tgrelid = 'public.legal_document_versions'::regclass
         and tgname in ('legal_document_versions_no_update', 'legal_document_versions_no_truncate')) <> 2
     or not exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
                    and tgname = 'profiles_keep_legal_evidence') then
    raise exception 'sprint259a postcondition failed';
  end if;
end $$;
