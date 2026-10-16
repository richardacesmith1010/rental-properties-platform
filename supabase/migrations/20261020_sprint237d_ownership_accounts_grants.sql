-- Sprint 237d: ownership_accounts is written only by service_role and SECURITY DEFINER functions.
-- Runs in one transaction (migration runner). Before (live 2026-10-15): anon=arwdDxtm, authenticated=arwdDxtm. After: anon none, authenticated SELECT only.
revoke all on table public.ownership_accounts from anon, authenticated;
grant select on table public.ownership_accounts to authenticated;

do $$
declare v_acl text;
begin
  select relacl::text into v_acl from pg_class where oid = 'public.ownership_accounts'::regclass;
  if has_table_privilege('authenticated', 'public.ownership_accounts', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     or has_table_privilege('anon', 'public.ownership_accounts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     or not has_table_privilege('authenticated', 'public.ownership_accounts', 'SELECT')
     -- a comma list means "any of", so check service_role's needed privileges one by one
     or not has_table_privilege('service_role', 'public.ownership_accounts', 'SELECT')
     or not has_table_privilege('service_role', 'public.ownership_accounts', 'INSERT')
     or not has_table_privilege('service_role', 'public.ownership_accounts', 'UPDATE')
     or not has_table_privilege('service_role', 'public.ownership_accounts', 'DELETE')
     or has_any_column_privilege('authenticated', 'public.ownership_accounts', 'INSERT,UPDATE,REFERENCES')
     or has_any_column_privilege('anon', 'public.ownership_accounts', 'SELECT,INSERT,UPDATE,REFERENCES')
     or exists (select 1 from pg_attribute where attrelid = 'public.ownership_accounts'::regclass
                and attnum > 0 and attacl is not null) then
    raise exception 'sprint237d postcondition failed: %', v_acl;
  end if;
end $$;

