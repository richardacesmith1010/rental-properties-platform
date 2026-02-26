-- Phase 3: allow owners to view tenant profiles for lease assignment

create policy "profiles_select_owner_for_management" on profiles
for select using (
  role = 'tenant'
  and exists (
    select 1
    from properties p
    where p.owner_profile_id = auth.uid()
  )
);
