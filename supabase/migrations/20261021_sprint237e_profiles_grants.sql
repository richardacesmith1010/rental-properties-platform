-- Sprint 237e: profiles is written only by service_role and SECURITY DEFINER functions (handle_new_user).
-- Before (live 2026-10-16): anon=arwdDxtm, authenticated=arwdDxtm. After: anon and authenticated SELECT only.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;

do $$
declare v_acl text;
begin
  select relacl::text into v_acl from pg_class where oid = 'public.profiles'::regclass;
  if has_table_privilege('authenticated', 'public.profiles', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     or has_table_privilege('anon', 'public.profiles', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     or not has_table_privilege('authenticated', 'public.profiles', 'SELECT')
     or not has_table_privilege('anon', 'public.profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.profiles', 'INSERT')
     or not has_table_privilege('service_role', 'public.profiles', 'UPDATE')
     or not has_table_privilege('service_role', 'public.profiles', 'DELETE')
     or has_any_column_privilege('authenticated', 'public.profiles', 'INSERT,UPDATE,REFERENCES')
     or has_any_column_privilege('anon', 'public.profiles', 'INSERT,UPDATE,REFERENCES')
     or exists (select 1 from pg_attribute where attrelid = 'public.profiles'::regclass
                and attnum > 0 and attacl is not null) then
    raise exception 'sprint237e postcondition failed: %', v_acl;
  end if;
end $$;
