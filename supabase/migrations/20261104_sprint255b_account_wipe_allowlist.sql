-- Sprint 255b: widen the account_wipe_apply allowlist so wipes cover every owner table.
-- Adds: vendors.id, preventive_maintenance_schedules.property_id, documents (lease_id, property_id,
-- unit_id), inspections.lease_id, communication_logs (property_id, unit_id). Vendor-referencing rows are
-- never deleted by vendor id: they go only through the owner's own tickets/properties, so a reference
-- from outside the wipe scope makes the vendor delete fail and the whole wipe roll back. Superset only: vendors.property_id stays allowed so the
-- 255a app revision keeps working until 255b is deployed (it is a missing column, so it is skipped).
-- Function body is otherwise identical to 255a.

create or replace function public.account_wipe_apply(p_ops jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- table -> columns that may appear in filters
  v_allowed constant jsonb := '{
    "account_delete_requests": ["ownership_account_id"],
    "account_delete_votes": ["request_id"],
    "account_rename_requests": ["ownership_account_id"],
    "account_rename_votes": ["request_id"],
    "application_events": ["application_id"],
    "automation_rules": ["id"],
    "automation_runs": ["rule_id"],
    "autopay_enrollments": ["lease_id"],
    "distribution_change_requests": ["ownership_account_id"],
    "distribution_change_votes": ["request_id"],
    "document_packets": ["id"],
    "document_signers": ["packet_id"],
    "document_templates": ["id"],
    "inbox_messages": ["id"],
    "inbox_threads": ["id"],
    "invitations": ["id", "email", "invited_by", "invited_profile_id", "ownership_account_id", "property_id", "role"],
    "leases": ["id"],
    "communication_logs": ["property_id", "unit_id"],
    "documents": ["lease_id", "property_id", "unit_id"],
    "inspections": ["lease_id"],
    "maintenance_assignments": ["ticket_id"],
    "maintenance_photos": ["id"],
    "maintenance_tickets": ["id", "property_id", "tenant_profile_id"],
    "manager_payment_configs": ["property_id"],
    "manager_payments": ["property_id"],
    "message_deliveries": ["message_id"],
    "notification_deliveries": ["notification_id"],
    "notification_preferences": ["profile_id"],
    "notifications": ["id"],
    "ownership_account_members": ["account_id", "profile_id"],
    "ownership_accounts": ["id"],
    "payment_distributions": ["account_id", "payment_id"],
    "payments": ["id"],
    "preventive_maintenance_schedules": ["property_id"],
    "properties": ["id"],
    "property_expenses": ["id", "property_id"],
    "property_files": ["id"],
    "property_managers": ["property_id"],
    "rent_charges": ["id"],
    "rental_applications": ["id"],
    "rental_listings": ["id"],
    "screening_reports": ["application_id"],
    "units": ["id"],
    "vendors": ["id", "property_id"],
    "withdrawal_requests": ["ownership_account_id"],
    "withdrawal_votes": ["request_id"]
  }'::jsonb;
  v_op jsonb;
  v_filter jsonb;
  v_index integer := 0;
  v_table text;
  v_kind text;
  v_label text;
  v_column text;
  v_values text[];
  v_conditions text[];
  v_has_key_filter boolean;
  v_type text;
  v_missing boolean;
  v_sql text;
  v_rows bigint;
  v_results jsonb := '[]'::jsonb;
begin
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'account_wipe_apply: ops must be an array' using errcode = '22023';
  end if;
  if octet_length(p_ops::text) > 1000000 then
    raise exception 'account_wipe_apply: payload too large' using errcode = '22023';
  end if;
  if jsonb_array_length(p_ops) > 500 then
    raise exception 'account_wipe_apply: too many operations' using errcode = '22023';
  end if;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    v_index := v_index + 1;
    v_table := v_op->>'table';
    v_kind := v_op->>'kind';
    v_label := coalesce(v_op->>'label', 'operation ' || v_index);

    if v_table is null or not (v_allowed ? v_table) then
      raise exception 'account_wipe_apply: table not allowed (%)', v_label using errcode = '42501';
    end if;
    if v_kind is null or v_kind not in ('delete', 'update') then
      raise exception 'account_wipe_apply: kind not allowed (%)', v_label using errcode = '22023';
    end if;
    if v_kind = 'update' and not (
      v_table = 'units' and v_op->'set' = '{"occupied": false}'::jsonb
    ) then
      raise exception 'account_wipe_apply: update not allowed (%)', v_label using errcode = '42501';
    end if;
    if jsonb_typeof(v_op->'filters') <> 'array' or jsonb_array_length(v_op->'filters') = 0 then
      raise exception 'account_wipe_apply: filters required (%)', v_label using errcode = '22023';
    end if;

    v_conditions := array[]::text[];
    v_has_key_filter := false;
    v_missing := to_regclass('public.' || quote_ident(v_table)) is null;
    for v_filter in select value from jsonb_array_elements(v_op->'filters') loop
      v_column := v_filter->>'column';
      if v_column is null or not ((v_allowed->v_table) ? v_column) then
        raise exception 'account_wipe_apply: column not allowed (%)', v_label using errcode = '42501';
      end if;
      v_type := null;
      if not v_missing then
        select pg_catalog.format_type(a.atttypid, a.atttypmod) into v_type
          from pg_catalog.pg_attribute a
         where a.attrelid = to_regclass('public.' || quote_ident(v_table))
           and a.attname = v_column and a.attnum > 0 and not a.attisdropped;
        if v_type is null then
          v_missing := true;
        elsif v_filter->>'op' in ('in', 'eq') and v_type not in ('uuid', 'text') then
          raise exception 'account_wipe_apply: column type not supported (%)', v_label using errcode = '42804';
        end if;
      end if;
      case v_filter->>'op'
        when 'in' then
          if jsonb_typeof(v_filter->'values') <> 'array' or exists (
            select 1 from jsonb_array_elements(v_filter->'values') e where jsonb_typeof(e) <> 'string'
          ) then
            raise exception 'account_wipe_apply: in values must be strings (%)', v_label using errcode = '22023';
          end if;
          select coalesce(array_agg(e), array[]::text[]) into v_values
            from jsonb_array_elements_text(v_filter->'values') e;
          v_conditions := v_conditions || format('%I = any (%L::%s[])', v_column, v_values, coalesce(v_type, 'text'));
          v_has_key_filter := true;
        when 'eq' then
          if jsonb_typeof(v_filter->'value') <> 'string' then
            raise exception 'account_wipe_apply: eq value must be a string (%)', v_label using errcode = '22023';
          end if;
          v_conditions := v_conditions || format('%I = %L::%s', v_column, v_filter->>'value', coalesce(v_type, 'text'));
          v_has_key_filter := true;
        when 'not_null' then
          v_conditions := v_conditions || format('%I is not null', v_column);
        else
          raise exception 'account_wipe_apply: filter op not allowed (%)', v_label using errcode = '22023';
      end case;
    end loop;

    if not v_has_key_filter then
      raise exception 'account_wipe_apply: an in or eq filter is required (%)', v_label using errcode = '22023';
    end if;

    if v_missing then
      v_results := v_results || jsonb_build_object('label', v_label, 'skipped', true);
      continue;
    end if;

    if v_kind = 'delete' then
      v_sql := format('delete from public.%I where %s', v_table, array_to_string(v_conditions, ' and '));
    else
      v_sql := format('update public.%I set occupied = false where %s', v_table, array_to_string(v_conditions, ' and '));
    end if;

    begin
      execute v_sql;
      get diagnostics v_rows = row_count;
      v_results := v_results || jsonb_build_object('label', v_label, 'rows', v_rows);
    exception
      when undefined_table or undefined_column then
        v_results := v_results || jsonb_build_object('label', v_label, 'skipped', true);
    end;
  end loop;

  return jsonb_build_object('operations', v_index, 'results', v_results);
end;
$$;

revoke all on function public.account_wipe_apply(jsonb) from public;
revoke all on function public.account_wipe_apply(jsonb) from anon;
revoke all on function public.account_wipe_apply(jsonb) from authenticated;
grant execute on function public.account_wipe_apply(jsonb) to service_role;

comment on function public.account_wipe_apply(jsonb) is
  'Sprint 255a/255b: applies an owner data wipe plan (ordered, allowlisted deletes plus units.occupied reset) in one transaction. service_role only.';

-- Sprint 255b (ChatGPT rev 2): transaction-time scope guard. The app passes the scope it loaded
-- ({ user_id, account_ids, property_ids }). Inside the same transaction this locks those accounts,
-- their memberships and properties, re-checks that the user is still the ONLY active owner of every
-- account and that every property still belongs to one of them, then applies the plan. Any change since
-- the scope was loaded raises 40001 and nothing is deleted. Concurrent membership inserts and property
-- ownership changes block on these locks until the wipe finishes.
create or replace function public.account_wipe_apply(p_ops jsonb, p_guard jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid;
  v_accounts uuid[];
  v_properties uuid[];
begin
  if p_guard is null or jsonb_typeof(p_guard) <> 'object'
     or jsonb_typeof(p_guard->'account_ids') <> 'array' or jsonb_typeof(p_guard->'property_ids') <> 'array' then
    raise exception 'account_wipe_apply: guard must be an object with account_ids and property_ids' using errcode = '22023';
  end if;
  v_user := (p_guard->>'user_id')::uuid;
  if v_user is null then
    raise exception 'account_wipe_apply: guard user_id required' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct e::uuid), array[]::uuid[]) into v_accounts
    from jsonb_array_elements_text(p_guard->'account_ids') e;
  select coalesce(array_agg(distinct e::uuid), array[]::uuid[]) into v_properties
    from jsonb_array_elements_text(p_guard->'property_ids') e;

  perform 1 from public.ownership_accounts where id = any (v_accounts) order by id for update;
  perform 1 from public.ownership_account_members where account_id = any (v_accounts)
    order by account_id, profile_id for update;
  perform 1 from public.properties where id = any (v_properties) order by id for update;

  if (select count(*) from public.ownership_accounts where id = any (v_accounts)) <> cardinality(v_accounts)
     or exists (
       select 1 from unnest(v_accounts) a(id)
        where not exists (
          select 1 from public.ownership_account_members m
           where m.account_id = a.id and m.profile_id = v_user and m.member_role = 'owner' and m.active))
     or exists (
       select 1 from public.ownership_account_members m
        where m.account_id = any (v_accounts) and m.member_role = 'owner' and m.active and m.profile_id <> v_user)
     or (select count(*) from public.properties where id = any (v_properties)) <> cardinality(v_properties)
     or exists (
       select 1 from public.properties p
        where p.id = any (v_properties) and not (p.owner_account_id = any (v_accounts))) then
    raise exception 'account_wipe_apply: wipe scope changed' using errcode = '40001';
  end if;

  return public.account_wipe_apply(p_ops);
end;
$$;

revoke all on function public.account_wipe_apply(jsonb, jsonb) from public;
revoke all on function public.account_wipe_apply(jsonb, jsonb) from anon;
revoke all on function public.account_wipe_apply(jsonb, jsonb) from authenticated;
grant execute on function public.account_wipe_apply(jsonb, jsonb) to service_role;

comment on function public.account_wipe_apply(jsonb, jsonb) is
  'Sprint 255b: account_wipe_apply with a transaction-time sole-owner scope guard (locks + re-check, 40001 on change). service_role only.';
