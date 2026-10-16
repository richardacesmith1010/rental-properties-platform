-- Sprint 237f: a signed-in user may read their own profile, CURRENT tenants who have/had a lease on a home they
-- administer (historical leases intentional: rent history needs past tenants), and CURRENT managers with an ACTIVE
-- assignment on a home they administer (inactive assignments intentionally excluded). Replaces two policies that
-- exposed every tenant/manager to any owner. Nested SECURITY DEFINER helpers run as postgres (no FORCE RLS on the
-- tables they read), so nothing recurses into profiles RLS.
create function public.can_view_profile(p_profile_id uuid, p_role text)
returns boolean
language sql stable security definer set search_path = ''
as $f$
  select p_profile_id = auth.uid()
    or (p_role = 'tenant' and exists (
      select 1 from public.leases l join public.units u on u.id = l.unit_id
      where l.tenant_profile_id = p_profile_id and public.can_administer_property(u.property_id)))
    or (p_role = 'manager' and exists (
      select 1 from public.property_managers pm
      where pm.manager_profile_id = p_profile_id and pm.active = true
        and public.can_administer_property(pm.property_id)));
$f$;
revoke execute on function public.can_view_profile(uuid, text) from public, anon;
grant execute on function public.can_view_profile(uuid, text) to authenticated, service_role;

drop policy profiles_select_owner_for_management on public.profiles;
drop policy profiles_select_owner_for_managers on public.profiles;
create policy profiles_select_related on public.profiles
  for select to authenticated using (public.can_view_profile(id, role));

do $$
declare v_fn oid := 'public.can_view_profile(uuid, text)'::regprocedure; v_adm oid := 'public.can_administer_property(uuid)'::regprocedure;
begin
  -- exactly two SELECT-capable policies, both the intended ones, both permissive
  if (select count(*) from pg_policy where polrelid = 'public.profiles'::regclass and polcmd in ('r', '*')) <> 2
     or not exists (select 1 from pg_policy where polrelid = 'public.profiles'::regclass and polname = 'profiles_select_self'
                    and polcmd = 'r' and polpermissive and pg_get_expr(polqual, polrelid) = '(auth.uid() = id)')
     or not exists (select 1 from pg_policy where polrelid = 'public.profiles'::regclass and polname = 'profiles_select_related'
                    and polcmd = 'r' and polpermissive and polroles = array['authenticated'::regrole]::oid[]
                    and pg_get_expr(polqual, polrelid) = 'can_view_profile(id, role)')
     -- helper: definer, owner postgres, empty search_path, stable, boolean, execute only authenticated/service_role
     or not (select prosecdef and proowner = 'postgres'::regrole and provolatile = 's' and prorettype = 'boolean'::regtype
               and proconfig = array['search_path=""'] from pg_proc where oid = v_fn)
     or has_function_privilege('anon', v_fn, 'execute')
     or not has_function_privilege('authenticated', v_fn, 'execute')
     or not has_function_privilege('service_role', v_fn, 'execute')
     or exists (select 1 from aclexplode((select proacl from pg_proc where oid = v_fn)) a where a.grantee = 0)
     -- dependency unchanged in the properties we rely on
     or not (select prosecdef and proowner = 'postgres'::regrole and proconfig = array['search_path=""'] from pg_proc where oid = v_adm)
     -- no FORCE RLS on tables the helpers read
     or exists (select 1 from pg_class where oid in ('public.leases'::regclass, 'public.units'::regclass,
                 'public.property_managers'::regclass, 'public.properties'::regclass, 'public.ownership_accounts'::regclass,
                 'public.ownership_account_members'::regclass, 'public.ownership_account_managers'::regclass)
                 and relforcerowsecurity) then
    raise exception 'sprint237f postcondition failed';
  end if;
end $$;
