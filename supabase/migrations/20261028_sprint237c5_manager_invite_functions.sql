-- Sprint 237c-5 (rev 6): atomic, serialized access changes for manager invitations.
-- Rev 4 (ChatGPT round 1) made grant and revoke single transactions. Rev 5 (ChatGPT round 2) adds:
--   R1 one shared lock per (home, manager profile), taken by every function before it reads or changes access, so two
--      concurrent final revokes (or a grant racing a revoke) cannot both see the other row as live;
--   R2 identity binding: grant only for rows of this inviter whose invited_profile_id is the given profile (a null id is
--      bound only to the manager profile with that row's email); a missing or mismatched id raises and rolls back all;
--   R3 acceptance only with access: rows turn accepted only when the grant for that home is active (manager_invite_accept)
--      or in the same transaction that grants it (manager_invite_grant with p_accept).
-- Rev 6 (ChatGPT round 3): property_managers.assigned_directly records where access came from. true = added directly
--   (an owner's confirmed-manager add, client-account sync, the trigger, every row that existed before this migration);
--   false = created by an invitation grant. Revoke removes only invitation-created access (false) when no other live
--   invitation remains; a direct add made at any time is never removed by revoking an invitation.
--   Writers audited 2026-10-18: apps/web invitations.ts (replaced by these functions), account-wipe.ts (deletes rows),
--   handle_new_user, add_client_home, ownership_account_managers_sync (client homes; cannot be invited). All but these
--   functions use the default (true).
-- Lock protocol: advisory transaction locks keyed 'domus.manager_access:<property_id>:<profile_id>', always taken in
-- ascending key order and always before any row lock, so concurrent calls never deadlock on each other.
-- All five functions are security invoker, search_path public, EXECUTE for service_role only (apps/web admin client).
-- Guards: property_managers_guard_client (42501 on client homes) raises inside a function and rolls back everything.

begin;

alter table public.property_managers
  add column if not exists assigned_directly boolean not null default true;

comment on column public.property_managers.assigned_directly is
  'true: access added directly (owner add, client sync, trigger, pre-2026-10-28 rows). false: created by a manager '
  'invitation grant; only these are removed when the last live invitation for that home is revoked (sprint 237c-5).';

create or replace function public.manager_access_lock(p_keys text[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  k text;
begin
  for k in select distinct x from unnest(p_keys) as x where x is not null order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended('domus.manager_access:' || k, 0));
  end loop;
end;
$$;

-- Grants for a confirmed manager with no invitation row (inviteManager §6.3). Returns which homes were newly added.
create or replace function public.manager_grant_homes(p_profile_id uuid, p_property_ids uuid[])
returns table (property_id uuid, added boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  h uuid;
  was_active boolean;
begin
  if p_profile_id is null then
    raise exception 'manager_grant_homes: profile required' using errcode = '22023';
  end if;
  perform manager_access_lock(array(select x::text || ':' || p_profile_id::text from unnest(p_property_ids) as x));
  for h in select distinct x from unnest(p_property_ids) as x where x is not null order by 1 loop
    select pm.active into was_active
    from property_managers pm
    where pm.property_id = h and pm.manager_profile_id = p_profile_id;
    insert into property_managers as pm (property_id, manager_profile_id, active, assigned_directly)
    values (h, p_profile_id, true, true)
    on conflict on constraint property_managers_pkey do update set active = true, assigned_directly = true;
    property_id := h;
    added := coalesce(was_active, false) = false;
    return next;
  end loop;
end;
$$;

-- Send / Resend: grant (and optionally accept) this inviter's pending rows for one manager profile.
create or replace function public.manager_invite_grant(
  p_invitation_ids uuid[], p_profile_id uuid, p_inviter_id uuid, p_accept boolean default false)
returns table (invitation_id uuid, property_id uuid, outcome text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_email text;
  v_ids uuid[];
  v_found int;
  r record;
begin
  select lower(p.email) into v_email from profiles p where p.id = p_profile_id and p.role = 'manager';
  if v_email is null then
    raise exception 'manager_invite_grant: profile is not a manager' using errcode = '22023';
  end if;
  select array(select distinct x from unnest(p_invitation_ids) as x where x is not null) into v_ids;
  if cardinality(v_ids) = 0 then
    raise exception 'manager_invite_grant: no invitation ids' using errcode = '22023';
  end if;

  select count(*) into v_found
  from invitations i
  where i.id = any (v_ids)
    and i.role = 'manager'
    and i.invited_by = p_inviter_id
    and i.property_id is not null
    and (i.invited_profile_id = p_profile_id or (i.invited_profile_id is null and lower(i.email) = v_email));
  if v_found <> cardinality(v_ids) then
    raise exception 'manager_invite_grant: invitation missing or not bound to this profile' using errcode = 'P0002';
  end if;

  perform manager_access_lock(array(
    select i.property_id::text || ':' || p_profile_id::text from invitations i where i.id = any (v_ids)));

  for r in
    select i.id, i.property_id, i.status, i.invited_profile_id
    from invitations i
    where i.id = any (v_ids)
    order by i.id
    for update
  loop
    if r.invited_profile_id is not null and r.invited_profile_id <> p_profile_id then
      raise exception 'manager_invite_grant: invitation bound to another profile' using errcode = 'P0002';
    end if;
    invitation_id := r.id;
    property_id := r.property_id;
    if r.status = 'pending' then
      insert into property_managers as pm (property_id, manager_profile_id, active, assigned_directly)
      values (r.property_id, p_profile_id, true, false)
      on conflict on constraint property_managers_pkey do update
        set active = true,
            assigned_directly = case when pm.active then pm.assigned_directly else false end;
      update invitations
        set invited_profile_id = p_profile_id,
            status = case when p_accept then 'accepted' else status end,
            accepted_at = case when p_accept then now() else accepted_at end
      where id = r.id;
      outcome := case when p_accept then 'accepted' else 'granted' end;
    elsif r.status = 'accepted' then
      outcome := 'already_accepted';
    else
      outcome := 'not_pending';
    end if;
    return next;
  end loop;
end;
$$;

-- Revoke one of this inviter's rows: expire it and remove access unless another live row still gives that home.
create or replace function public.manager_invite_revoke(p_invitation_id uuid, p_inviter_id uuid)
returns table (outcome text, profile_id uuid, released boolean, other_live boolean, kept_direct boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  v_profile uuid;
  v_status text;
  v_other boolean := false;
  v_released boolean := false;
  v_direct boolean := false;
begin
  select i.id, i.email, i.property_id, i.invited_profile_id
    into r
  from invitations i
  where i.id = p_invitation_id and i.invited_by = p_inviter_id and i.role = 'manager';
  if not found then
    outcome := 'not_found'; profile_id := null; released := false; other_live := false; kept_direct := false;
    return next; return;
  end if;

  v_profile := r.invited_profile_id;
  if v_profile is null then
    select p.id into v_profile from profiles p
    where lower(p.email) = lower(r.email) and p.role = 'manager'
    limit 1;
  end if;
  if r.property_id is not null and v_profile is not null then
    perform manager_access_lock(array[r.property_id::text || ':' || v_profile::text]);
  end if;

  select i.status into v_status
  from invitations i
  where i.id = p_invitation_id
  for update;
  if v_status = 'expired' then
    outcome := 'already_revoked'; profile_id := v_profile; released := false; other_live := false; kept_direct := false;
    return next; return;
  end if;
  if v_status <> 'pending' then
    outcome := 'accepted'; profile_id := v_profile; released := false; other_live := false; kept_direct := false;
    return next; return;
  end if;

  update invitations set status = 'expired', accepted_at = null where id = p_invitation_id;

  if v_profile is not null and r.property_id is not null then
    select exists (
      select 1 from invitations o
      where o.id <> p_invitation_id
        and o.role = 'manager'
        and lower(o.email) = lower(r.email)
        and o.property_id = r.property_id
        and o.status in ('pending', 'accepted')
    ) into v_other;
    if not v_other then
      select coalesce(pm.active and pm.assigned_directly, false) into v_direct
      from property_managers pm
      where pm.property_id = r.property_id and pm.manager_profile_id = v_profile;
      v_direct := coalesce(v_direct, false);
      if not v_direct then
        update property_managers pm
          set active = false
        where pm.property_id = r.property_id
          and pm.manager_profile_id = v_profile
          and pm.assigned_directly = false
          and pm.active is distinct from false;
        v_released := found;
      end if;
    end if;
  end if;

  outcome := 'revoked'; profile_id := v_profile; released := v_released; other_live := v_other; kept_direct := v_direct;
  return next;
end;
$$;

-- Sign-in (and join-page "already signed in"): accept this manager's pending rows only where access is active.
-- Rows whose grant failed stay pending, so the inviter still sees Resend (which grants and accepts).
create or replace function public.manager_invite_accept(p_profile_id uuid)
returns table (invitation_id uuid, property_id uuid, outcome text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_email text;
  r record;
begin
  select lower(p.email) into v_email from profiles p where p.id = p_profile_id and p.role = 'manager';
  if v_email is null then
    return;
  end if;
  perform manager_access_lock(array(
    select i.property_id::text || ':' || p_profile_id::text
    from invitations i
    where i.role = 'manager' and i.status = 'pending' and i.property_id is not null
      and (i.invited_profile_id = p_profile_id or (i.invited_profile_id is null and lower(i.email) = v_email))));
  for r in
    select i.id, i.property_id
    from invitations i
    where i.role = 'manager' and i.status = 'pending' and i.property_id is not null
      and (i.invited_profile_id = p_profile_id or (i.invited_profile_id is null and lower(i.email) = v_email))
    order by i.id
    for update
  loop
    invitation_id := r.id;
    property_id := r.property_id;
    if exists (select 1 from property_managers pm
               where pm.property_id = r.property_id and pm.manager_profile_id = p_profile_id and pm.active) then
      update invitations
        set status = 'accepted', accepted_at = now(), invited_profile_id = p_profile_id
      where id = r.id;
      outcome := 'accepted';
    else
      outcome := 'no_access';
    end if;
    return next;
  end loop;
end;
$$;

revoke all on function public.manager_access_lock(text[]) from public, anon, authenticated;
revoke all on function public.manager_grant_homes(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.manager_invite_grant(uuid[], uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.manager_invite_revoke(uuid, uuid) from public, anon, authenticated;
revoke all on function public.manager_invite_accept(uuid) from public, anon, authenticated;
grant execute on function public.manager_access_lock(text[]) to service_role;
grant execute on function public.manager_grant_homes(uuid, uuid[]) to service_role;
grant execute on function public.manager_invite_grant(uuid[], uuid, uuid, boolean) to service_role;
grant execute on function public.manager_invite_revoke(uuid, uuid) to service_role;
grant execute on function public.manager_invite_accept(uuid) to service_role;

commit;
