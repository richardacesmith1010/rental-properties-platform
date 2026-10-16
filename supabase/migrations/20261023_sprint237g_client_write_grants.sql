-- Sprint 237g (rev 3): signed-in (authenticated) clients keep only the table writes the app performs with the user's own
-- Supabase client (code map 2026-10-16); anon keeps no table writes; nobody on the client side keeps TRUNCATE,
-- REFERENCES, TRIGGER or MAINTAIN. service_role and SECURITY DEFINER functions are unaffected. SELECT is unchanged
-- (RLS still decides which rows are visible). New tables created by postgres no longer get client write grants.
-- Preflight (rev 3): the live anon/authenticated table+column ACLs must still match the 2026-10-16 baseline that the
-- rollback file was generated from (948 entries). If they drifted, abort and regenerate the rollback snapshot.
do $$
declare v text;
begin
  select md5(string_agg(x, ',' order by x)) into v from (
    select c.relname || ':' || a.grantee::regrole::text || ':' || a.privilege_type x
    from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
    where n.nspname = 'public' and c.relkind in ('r','p') and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
    union all
    select c.relname || '.' || att.attname || ':' || a.grantee::regrole::text || ':' || a.privilege_type
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute att on att.attrelid = c.oid and att.attnum > 0 and att.attacl is not null, aclexplode(att.attacl) a
    where n.nspname = 'public' and c.relkind in ('r','p') and a.grantee in ('anon'::regrole, 'authenticated'::regrole)) s;
  if v is distinct from 'e2776adb1cd220f3233cf372338e6753' then
    raise exception 'sprint237g preflight: ACL baseline drifted (%); regenerate supabase/rollback/20261023_sprint237g_rollback.sql', v;
  end if;
end $$;

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

-- Column-limited UPDATE on the core tables: only the columns the app's user-client updates write (code map
-- 2026-10-16). Revoking table-level UPDATE first removes any column grants; none existed on these five tables.
revoke update on table public.leases, public.units, public.rent_charges, public.properties, public.maintenance_tickets
  from authenticated;
grant update (lease_status, active, termination_reason, terminated_at, end_date, due_day_of_month, monthly_rent_cents,
              deposit_cents, grace_period_days, late_fee_cents, collects_outside_domus) on table public.leases to authenticated;
grant update (unit_number, bedrooms, bathrooms, monthly_rent_cents, occupied, active) on table public.units to authenticated;
grant update (status) on table public.rent_charges to authenticated;
grant update (name, address_line1, city, state, postal_code, active, owner_account_id) on table public.properties
  to authenticated;
grant update (status, resolved_at, actual_cost_cents) on table public.maintenance_tickets to authenticated;

-- rev 3: values guard for direct client writes to rent_charges. Column grants limit WHICH columns change; this limits
-- WHAT values a signed-in client may write directly. The app's only user-client writes are (a) pending -> late status
-- (charge-generation.ts:268) and (b) inserting a pending late fee for an open rent charge on the same lease with that
-- lease's late fee and the parent's due date (charge-generation.ts:296-318). service_role and SECURITY DEFINER functions
-- (current_user = postgres) are unaffected.
create function public.guard_client_rent_charge_write()
returns trigger
language plpgsql security invoker set search_path = ''
as $f$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.category is distinct from 'late_fee' or new.status is distinct from 'pending' or new.parent_charge_id is null
       or new.deleted_at is not null or new.waived_at is not null or new.tenant_reported_paid_at is not null
       or not exists (
         select 1 from public.rent_charges p join public.leases l on l.id = p.lease_id
         where p.id = new.parent_charge_id and p.lease_id = new.lease_id and p.category = 'rent'
           and p.status in ('pending', 'late') and p.due_date = new.due_date and p.deleted_at is null
           and l.late_fee_cents = new.amount_cents) then
      raise exception 'rent_charges: clients may only add the late fee for an open rent charge' using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status and not (old.status = 'pending' and new.status = 'late') then
      raise exception 'rent_charges: clients may only change status from pending to late' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$f$;
revoke execute on function public.guard_client_rent_charge_write() from public, anon, authenticated;
create trigger rent_charges_guard_client_write
  before insert or update on public.rent_charges
  for each row execute function public.guard_client_rent_charge_write();

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger, maintain on tables from anon, authenticated;

-- Postcondition (raises on any mismatch): both sides of the allowlist, the exact column lists, the 22-table write set,
-- every relation kind in public, and no default ACL (schema or global) that hands client writes to new tables.
do $$
declare
  t record; bad text := ''; op text; has boolean; allowed text[]; n int;
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
  col_tables constant jsonb := '{
    "leases": ["active","collects_outside_domus","deposit_cents","due_day_of_month","end_date","grace_period_days",
               "late_fee_cents","lease_status","monthly_rent_cents","terminated_at","termination_reason"],
    "units": ["active","bathrooms","bedrooms","monthly_rent_cents","occupied","unit_number"],
    "rent_charges": ["status"],
    "properties": ["active","address_line1","city","name","owner_account_id","postal_code","state"],
    "maintenance_tickets": ["actual_cost_cents","resolved_at","status"]
  }'::jsonb;
begin
  if exists (select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace
             where s.nspname = 'public' and c.relkind in ('v', 'm', 'f')) then
    bad := bad || 'unexpected_view_or_foreign_relation ';
  end if;
  for t in select c.oid, c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind in ('r', 'p') loop
    allowed := coalesce(array(select jsonb_array_elements_text(keep_tables -> t.relname)), '{}');
    foreach op in array array['INSERT', 'UPDATE', 'DELETE'] loop
      has := has_table_privilege('authenticated', t.oid, op)
             or (op in ('INSERT', 'UPDATE') and has_any_column_privilege('authenticated', t.oid, op));
      if has and not (op = any(allowed)) then bad := bad || t.relname || ':extra:' || op || ' '; end if;
      if not has and op = any(allowed) then bad := bad || t.relname || ':missing:' || op || ' '; end if;
      if has_table_privilege('anon', t.oid, op)
         or (op in ('INSERT', 'UPDATE') and has_any_column_privilege('anon', t.oid, op)) then
        bad := bad || t.relname || ':anon:' || op || ' ';
      end if;
    end loop;
    if has_table_privilege('authenticated', t.oid, 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       or has_table_privilege('anon', t.oid, 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') then
      bad := bad || t.relname || ':other ';
    end if;
    if col_tables ? t.relname then
      if has_table_privilege('authenticated', t.oid, 'UPDATE') then bad := bad || t.relname || ':table_level_update '; end if;
      if (select coalesce(array_agg(a.attname::text order by a.attname), '{}') from pg_attribute a
           where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
             and has_column_privilege('authenticated', t.oid, a.attname, 'UPDATE'))
         is distinct from array(select jsonb_array_elements_text(col_tables -> t.relname) order by 1) then
        bad := bad || t.relname || ':update_columns ';
      end if;
    end if;
  end loop;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind in ('r', 'p')
     and (has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE')
          or has_any_column_privilege('authenticated', c.oid, 'INSERT,UPDATE'));
  if n <> 22 then bad := bad || 'write_table_count=' || n || ' '; end if;
  if exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
             where d.defaclobjtype = 'r' and (d.defaclnamespace = 'public'::regnamespace and d.defaclrole = 'postgres'::regrole
                                             or d.defaclnamespace = 0)
               and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole) and a.privilege_type <> 'SELECT') then
    bad := bad || 'default_acl ';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.rent_charges'::regclass
                 and tgname = 'rent_charges_guard_client_write' and tgenabled = 'O') then
    bad := bad || 'rent_charges_guard_missing ';
  end if;
  if bad <> '' then raise exception 'sprint237g postcondition failed: %', bad; end if;
end $$;
