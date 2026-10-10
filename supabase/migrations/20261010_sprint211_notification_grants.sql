-- Sprint 211: lock down direct writes to notification tables.
-- Only the server (service role) creates, changes or deletes notifications.
-- Signed-in users may only mark their own notifications read (RLS notifications_update_self
-- already limits rows to recipient_profile_id = auth.uid()).

revoke insert, update, delete on public.notifications from anon, authenticated;
revoke insert, update, delete on public.notification_deliveries from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
