-- Phase 6: Allow managers to update maintenance tickets for their assigned properties

drop policy if exists "maintenance_update_owner" on maintenance_tickets;

create policy "maintenance_update_owner_or_manager" on maintenance_tickets
for update using (
  exists (
    select 1 from properties p
    where p.id = maintenance_tickets.property_id
      and p.owner_profile_id = auth.uid()
  )
  or exists (
    select 1 from property_managers pm
    where pm.property_id = maintenance_tickets.property_id
      and pm.manager_profile_id = auth.uid()
      and pm.active = true
  )
);
