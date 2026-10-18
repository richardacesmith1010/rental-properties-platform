-- Rollback for 20261028_sprint237c5_charge_edit_history_active.sql: restore the live policy text read 2026-10-18
-- (no pm.active check).

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
          )
        )
    )
  );

commit;
