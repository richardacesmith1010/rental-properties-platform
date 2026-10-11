-- Security cleanup (2026-10-10): RLS helper functions are SECURITY DEFINER and were executable by
-- anon (directly and via the PUBLIC grant), i.e. callable at /rest/v1/rpc/* without signing in.
-- The app never reads these tables as anon (public flows use the service role), so anon needs no access.
-- authenticated keeps EXECUTE: RLS policies call these functions as the signed-in user, and each
-- function only answers about auth.uid()'s own access.

do $$
declare f text;
begin
  foreach f in array array[
    'public.can_access_property(uuid)', 'public.can_administer_property(uuid)', 'public.can_view_property(uuid)',
    'public.is_creator_of_account(uuid)', 'public.is_manager_of_account(uuid)', 'public.is_member_of_account(uuid)',
    'public.is_owner_member_of_account(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
