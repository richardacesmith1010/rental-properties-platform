-- Sprint 237g: signed-in (authenticated) clients keep only the table writes the app performs with the user's own
-- Supabase client (code map 2026-10-16); anon keeps no table writes; nobody on the client side keeps TRUNCATE,
-- REFERENCES, TRIGGER or MAINTAIN. service_role and SECURITY DEFINER functions are unaffected. SELECT is unchanged
-- (RLS still decides which rows are visible). New tables created by postgres no longer get client write grants.
do $$
declare
  t record;
  keep text[];
  op text;
  keep_map constant jsonb := '{
    "account_partners": ["INSERT","UPDATE"],
    "account_tasks": ["INSERT","UPDATE"],
    "application_events": ["INSERT"],
    "automation_rules": ["INSERT","UPDATE"],
    "document_packets": ["INSERT","UPDATE"],
    "document_templates": ["INSERT","UPDATE","DELETE"],
    "expense_partner_attributions": ["INSERT","UPDATE","DELETE"],
    "inbox_threads": ["INSERT"],
    "leases": ["INSERT","UPDATE"],
    "maintenance_status_history": ["INSERT"],
    "maintenance_tickets": ["INSERT","UPDATE"],
    "manager_payment_configs": ["INSERT","UPDATE"],
    "notifications": ["UPDATE"],
    "partner_payments": ["INSERT","UPDATE","DELETE"],
    "properties": ["UPDATE"],
    "rent_charges": ["INSERT","UPDATE"],
    "rent_increase_history": ["INSERT"],
    "rental_applications": ["INSERT","UPDATE"],
    "rental_listings": ["INSERT","UPDATE"],
    "screening_reports": ["INSERT"],
    "units": ["INSERT","UPDATE"],
    "vendors": ["INSERT"]
  }'::jsonb;
begin
  for t in select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('revoke insert, update, delete, truncate, references, trigger, maintain on table public.%I from anon', t.relname);
    execute format('revoke truncate, references, trigger, maintain on table public.%I from authenticated', t.relname);
    keep := coalesce(array(select jsonb_array_elements_text(keep_map -> t.relname)), '{}');
    foreach op in array array['INSERT', 'UPDATE', 'DELETE'] loop
      -- revoking table-level UPDATE also removes column-level UPDATE grants, so only revoke ops the app does not use
      if not (op = any(keep)) then
        execute format('revoke %s on table public.%I from authenticated', op, t.relname);
      end if;
    end loop;
  end loop;
end $$;

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger, maintain on tables from anon, authenticated;

-- Postcondition: every public table's client write privileges are exactly the keep map; anon writes nothing.
do $$
declare
  t record; bad text := '';
  keep_tables constant jsonb := '{
    "account_partners": ["INSERT","UPDATE"], "account_tasks": ["INSERT","UPDATE"], "application_events": ["INSERT"],
    "automation_rules": ["INSERT","UPDATE"], "document_packets": ["INSERT","UPDATE"],
    "document_templates": ["INSERT","UPDATE","DELETE"], "expense_partner_attributions": ["INSERT","UPDATE","DELETE"],
    "inbox_threads": ["INSERT"], "leases": ["INSERT","UPDATE"], "maintenance_status_history": ["INSERT"],
    "maintenance_tickets": ["INSERT","UPDATE"], "manager_payment_configs": ["INSERT","UPDATE"], "notifications": ["UPDATE"],
    "partner_payments": ["INSERT","UPDATE","DELETE"], "properties": ["UPDATE"], "rent_charges": ["INSERT","UPDATE"],
    "rent_increase_history": ["INSERT"], "rental_applications": ["INSERT","UPDATE"], "rental_listings": ["INSERT","UPDATE"],
    "screening_reports": ["INSERT"], "units": ["INSERT","UPDATE"], "vendors": ["INSERT"]
  }'::jsonb;
  allowed text[]; op text; has boolean;
begin
  for t in select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    allowed := coalesce(array(select jsonb_array_elements_text(keep_tables -> t.relname)), '{}');
    foreach op in array array['INSERT', 'UPDATE', 'DELETE'] loop
      has := has_table_privilege('authenticated', t.oid, op)
             or (op in ('INSERT', 'UPDATE') and has_any_column_privilege('authenticated', t.oid, op));
      -- a kept op may be granted (table or column level); a non-kept op must be absent
      if has and not (op = any(allowed)) then bad := bad || t.relname || ':auth:' || op || ' '; end if;
      if has_table_privilege('anon', t.oid, op)
         or (op in ('INSERT', 'UPDATE') and has_any_column_privilege('anon', t.oid, op)) then
        bad := bad || t.relname || ':anon:' || op || ' ';
      end if;
    end loop;
    if has_table_privilege('authenticated', t.oid, 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       or has_table_privilege('anon', t.oid, 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') then
      bad := bad || t.relname || ':other ';
    end if;
  end loop;
  if exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
             where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'r'
               and a.grantee in ('anon'::regrole, 'authenticated'::regrole) and a.privilege_type <> 'SELECT') then
    bad := bad || 'default_acl ';
  end if;
  if bad <> '' then raise exception 'sprint237g postcondition failed: %', bad; end if;
end $$;
