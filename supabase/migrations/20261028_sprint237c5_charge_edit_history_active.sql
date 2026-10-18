-- Sprint 237c-5b: a revoked manager must not read a home's charge edit history.
-- Found 2026-10-17 by the 237c-5 completeness critic; live policy re-read 2026-10-18 (L-012).
--
-- 237c-5b Revoke sets property_managers.active = false and keeps the Auth user (D4), so a revoked invitee can still get
-- a session (Forgot password; Create account re-sends a confirm link). Every other policy and definer that reads
-- property_managers checks pm.active = true (maintenance_tickets, vendors, tenant_activity_log, can_administer_property,
-- can_view_profile, is_manager_of_account, owner_administered_property_ids). This one did not.
-- Live 2026-10-18: authenticated has SELECT only on charge_edit_history (no INSERT/UPDATE/DELETE grant); RLS on.
-- 0 inactive property_managers rows exist today, so nobody loses access they should have.
--
-- Change: the same SELECT policy, roles {public}, plus "and pm.active = true". Nothing else.

begin;

drop policy if exists "Property owners can view charge edits" on public.charge_edit_history;

create policy "Property owners can view charge edits"
  on public.charge_edit_history
  for select
  using (
    exists (
      select 1
      from rent_charges rc
      join leases l on l.id = rc.lease_id
      join units u on u.id = l.unit_id
      join properties p on p.id = u.property_id
      where rc.id = charge_edit_history.charge_id
        and (
          p.owner_profile_id = auth.uid()
          or exists (
            select 1
            from property_managers pm
            where pm.property_id = p.id
              and pm.manager_profile_id = auth.uid()
              and pm.active = true
          )
        )
    )
  );

commit;
