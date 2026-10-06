-- Sprint 174 (Security & privacy): reduce the anonymous attack surface.
-- 1) handle_new_user() is an auth trigger function; nobody should call it through /rest/v1/rpc.
--    Triggers still fire regardless of EXECUTE grants.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2) The app never uses GraphQL (supabase-js REST only; verified by grep 2026-10-05).
--    Removing pg_graphql closes the /graphql/v1 endpoint that exposed 59 tables' schema to anon.
--    Reversible: `create extension pg_graphql;`
drop extension if exists pg_graphql;

-- Accepted (documented in docs/scorecard.md, not changed here):
-- * can_access_property / can_administer_property / can_view_property / is_*_of_account are SECURITY DEFINER
--   helpers used by ~90 RLS policies scoped TO public. They only answer "can the CURRENT user …" via auth.uid(),
--   so for anon they return false and reveal nothing. Revoking anon EXECUTE would make anon queries on those
--   tables error instead of returning nothing. Re-scoping those policies TO authenticated is a separate, larger change.
-- * pg_net lives in the public schema (Supabase-managed); moving it is not worth the risk.
