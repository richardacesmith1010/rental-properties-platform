-- Sprint 259b rev 6 (ChatGPT rev 3 REQUIRED 1, 4; rev 4 REQUIRED 1; rev 5 REQUIRED 1): accept an LLC invitation in one
-- transaction. The conditional update is the lock: a second accept, a cancel, a resend that rotated the token, or an
-- expiry that changes the row first leaves 0 rows, so the call returns 'not_active' and writes nothing. Concurrent
-- calls serialize on the row lock; READ COMMITTED re-checks the WHERE clause after the competing commit. The update
-- requires the token the server resolved, so an old link fails after a resend even though the row is still pending.
-- Expiry uses clock_timestamp(), the time of the update itself. The person is bound through auth.users (the address
-- the invitation was sent to), never through an argument.
-- Agreement floor (259a): an account created on or after 2026-10-30 (AGREEMENT_REQUIRED_FROM in
-- apps/web/lib/legal-versions.ts) joins only with a record for the Terms and Privacy versions the app passes from
-- LEGAL_DOCUMENTS (the same rule as checkAgreement). Older accounts stay exempt. The database checks the versions it
-- is given; the app decides which versions are current and keeps them in step with checkAgreement.
-- Trust boundary: the only caller (acceptLLCInvitationMembership) passes the id and token of the row it found by the
-- URL token and the id of the server-side identity. Profile and membership writes match the app's earlier upserts
-- (acceptLLCInvitationMembership at fb1abab). Service role only.
-- Rollback: supabase/rollback/20261108_sprint259b_accept_llc_invitation_rollback.sql.
create function public.accept_llc_invitation(
  p_invitation_id uuid, p_invitation_token uuid, p_profile_id uuid, p_full_name text, p_nickname text,
  p_terms_version text, p_privacy_version text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
  v_email text;
begin
  if exists (select 1 from auth.users u
             where u.id = p_profile_id and u.created_at >= timestamptz '2026-10-30 00:00:00+00')
     and not exists (select 1 from public.legal_acceptances a
                     where a.profile_id = p_profile_id
                       and a.terms_version = p_terms_version and a.privacy_version = p_privacy_version) then
    return 'agreement_required';
  end if;

  update public.llc_invitations i
     set status = 'accepted', accepted_at = now()
   where i.id = p_invitation_id
     and i.token = p_invitation_token
     and i.status = 'pending'
     and i.created_at >= clock_timestamp() - interval '7 days'
     and exists (select 1 from auth.users u
                 where u.id = p_profile_id and lower(btrim(u.email)) = lower(btrim(i.email)))
  returning i.ownership_account_id, lower(btrim(i.email)) into v_account, v_email;

  if v_account is null then
    return 'not_active';
  end if;

  insert into public.profiles as p (id, email, full_name, nickname, role, onboarding_completed_at)
  values (p_profile_id, v_email, coalesce(nullif(btrim(p_full_name), ''), split_part(v_email, '@', 1)),
          nullif(btrim(p_nickname), ''), 'owner', now())
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(btrim(p_full_name), ''), p.full_name),
        nickname = coalesce(nullif(btrim(p_nickname), ''), p.nickname),
        role = 'owner',
        onboarding_completed_at = coalesce(p.onboarding_completed_at, excluded.onboarding_completed_at);

  insert into public.ownership_account_members as m
    (account_id, profile_id, member_role, active, can_receive_critical_alerts)
  values (v_account, p_profile_id, 'owner', true, true)
  on conflict (account_id, profile_id) do update
    set member_role = 'owner', active = true, can_receive_critical_alerts = true;

  return 'accepted';
end
$$;

-- One token, one invitation (rev 5 OPTIONAL 2). Tokens are random uuids; the table holds 2 rows (checked 2026-10-30).
create unique index llc_invitations_token_key on public.llc_invitations (token);

comment on function public.accept_llc_invitation(uuid, uuid, uuid, text, text, text, text) is
  'Sprint 259b: single-use LLC invitation acceptance (invitation, profile and membership in one transaction). '
  'Returns accepted, not_active or agreement_required. Service role only.';

revoke all on function public.accept_llc_invitation(uuid, uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.accept_llc_invitation(uuid, uuid, uuid, text, text, text, text) to service_role;

do $$
declare
  sig constant text := 'public.accept_llc_invitation(uuid, uuid, uuid, text, text, text, text)';
begin
  if has_function_privilege('anon', sig, 'execute') or has_function_privilege('authenticated', sig, 'execute')
     or not has_function_privilege('service_role', sig, 'execute') then
    raise exception 'sprint259b accept_llc_invitation privilege postcondition failed';
  end if;
  if to_regclass('public.llc_invitations_token_key') is null then
    raise exception 'sprint259b token uniqueness postcondition failed';
  end if;
end $$;
