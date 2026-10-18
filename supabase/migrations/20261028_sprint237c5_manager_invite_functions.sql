-- Sprint 237c-5 (rev 4): atomic grant and revoke for manager invitations.
-- Why (ChatGPT review round 1, REQUIRED 4): granting access and expiring a row were separate requests, so a failure
-- between them could leave a revoked (expired) row whose grant was still active, with no app path to repair it.
-- These two functions do each step in one transaction under a row lock, so every failure leaves a retryable state.
--
-- Callers: apps/web (service role only, via admin.rpc). EXECUTE is revoked from public, anon and authenticated.
-- security invoker: the service role already owns these writes; no definer privileges are added.
-- Guards: property_managers_guard_client (42501 on client homes) raises inside the function and rolls back everything.

begin;

create or replace function public.manager_invite_grant(p_invitation_ids uuid[], p_profile_id uuid)
returns table (property_id uuid, granted boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select i.id, i.property_id, i.status
    from invitations i
    where i.id = any (p_invitation_ids)
      and i.role = 'manager'
      and i.property_id is not null
    order by i.id
    for update
  loop
    if r.status = 'pending' then
      insert into property_managers (property_id, manager_profile_id, active)
      values (r.property_id, p_profile_id, true)
      on conflict on constraint property_managers_pkey do update set active = true;
      property_id := r.property_id; granted := true;
    else
      property_id := r.property_id; granted := false;
    end if;
    return next;
  end loop;
end;
$$;

create or replace function public.manager_invite_revoke(p_invitation_id uuid, p_inviter_id uuid)
returns table (outcome text, profile_id uuid, released boolean, other_live boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  v_profile uuid;
  v_other boolean := false;
  v_released boolean := false;
begin
  select i.id, i.email, i.property_id, i.status, i.invited_profile_id
    into r
  from invitations i
  where i.id = p_invitation_id
    and i.invited_by = p_inviter_id
    and i.role = 'manager'
  for update;

  if not found then
    outcome := 'not_found'; profile_id := null; released := false; other_live := false;
    return next; return;
  end if;
  if r.status = 'expired' then
    outcome := 'already_revoked'; profile_id := r.invited_profile_id; released := false; other_live := false;
    return next; return;
  end if;
  if r.status <> 'pending' then
    outcome := 'accepted'; profile_id := r.invited_profile_id; released := false; other_live := false;
    return next; return;
  end if;

  update invitations
    set status = 'expired', accepted_at = null
  where id = r.id;

  v_profile := r.invited_profile_id;
  if v_profile is null then
    select p.id into v_profile
    from profiles p
    where lower(p.email) = lower(r.email) and p.role = 'manager'
    limit 1;
  end if;

  if v_profile is not null and r.property_id is not null then
    select exists (
      select 1 from invitations o
      where o.id <> r.id
        and o.role = 'manager'
        and lower(o.email) = lower(r.email)
        and o.property_id = r.property_id
        and o.status in ('pending', 'accepted')
    ) into v_other;
    if not v_other then
      update property_managers pm
        set active = false
      where pm.property_id = r.property_id
        and pm.manager_profile_id = v_profile
        and pm.active is distinct from false;
      v_released := found;
    end if;
  end if;

  outcome := 'revoked'; profile_id := v_profile; released := v_released; other_live := v_other;
  return next;
end;
$$;

revoke all on function public.manager_invite_grant(uuid[], uuid) from public, anon, authenticated;
revoke all on function public.manager_invite_revoke(uuid, uuid) from public, anon, authenticated;
grant execute on function public.manager_invite_grant(uuid[], uuid) to service_role;
grant execute on function public.manager_invite_revoke(uuid, uuid) to service_role;

commit;
