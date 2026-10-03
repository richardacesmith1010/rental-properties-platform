-- Security stopgap (2026-10-02): award_xp / update_streak are SECURITY DEFINER and were
-- executable by anon + authenticated, letting anyone write XP/streak rows for any user.
-- The app calls them only via the service-role client, so revoking public access is safe.
-- Sprint 141 drops both functions entirely.
-- Rollback: GRANT EXECUTE ON FUNCTION ... TO anon, authenticated;
REVOKE ALL ON FUNCTION public.award_xp(uuid, text, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_streak(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_xp(uuid, text, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_streak(uuid, text) TO service_role;
