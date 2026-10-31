-- Rollback for Sprint 259b (20261107_sprint259b_llc_invitations_client_access.sql). Restores the client SELECT grant
-- and the three policies exactly as they were live on 2026-10-30 (pg_policy, read before the change; L-012). This
-- re-opens the token exposure: use only if the 259b change breaks something that can't be fixed forward.
-- Rotated tokens can't be restored; affected invitees need a resend.
-- Prefer re-adding Sprint 259a's code hold (isLlcInvitesPaused) over running this file; it is never automatic.
-- Snapshot before the change (2026-10-30): RLS on; anon and authenticated held SELECT on every column (no other
-- client privileges); three PERMISSIVE policies for role PUBLIC: SELECT "LLC members can view invitations", INSERT
-- "LLC admins can create invitations", UPDATE "LLC admins can update invitations" (definitions below, verbatim).
grant select on table public.llc_invitations to anon, authenticated;

create policy "LLC members can view invitations" on public.llc_invitations
  for select
  using (exists (select 1 from ownership_account_members m
                 where m.account_id = llc_invitations.ownership_account_id
                   and m.profile_id = auth.uid() and m.active = true));

create policy "LLC admins can create invitations" on public.llc_invitations
  for insert
  with check ((invited_by = auth.uid()) and exists (select 1 from ownership_account_members m
              where m.account_id = llc_invitations.ownership_account_id and m.profile_id = auth.uid()
                and m.active = true and m.member_role = any (array['owner'::text, 'admin'::text])));

create policy "LLC admins can update invitations" on public.llc_invitations
  for update
  using (exists (select 1 from ownership_account_members m
                 where m.account_id = llc_invitations.ownership_account_id and m.profile_id = auth.uid()
                   and m.active = true and m.member_role = any (array['owner'::text, 'admin'::text])));
