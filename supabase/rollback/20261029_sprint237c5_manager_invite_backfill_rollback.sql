-- Rollback for 20261029_sprint237c5_manager_invite_backfill.sql: restore status, accepted_at and invited_profile_id of
-- every backed-up row, then drop the backup table. Grants are not touched by the backfill, so none are restored.
begin;
update public.invitations i
  set status = b.status, accepted_at = b.accepted_at, invited_profile_id = b.invited_profile_id
from public.invitations_237c5_backfill_backup b
where b.id = i.id;
drop table if exists public.invitations_237c5_backfill_backup;
commit;
