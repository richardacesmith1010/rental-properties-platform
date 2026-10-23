-- Sprint 255a: run an owner data wipe as ONE transaction.
-- The app (service role only) reads the deletion scope, then sends the ordered list of
-- operations here. Every operation runs inside this function's transaction: any error rolls
-- back the whole wipe (today a mid-wipe error leaves a partial deletion).
-- Identifiers are checked against a fixed allowlist and quoted with %I; values are quoted
-- with %L. Every operation needs at least one 'in' or 'eq' filter (no unfiltered deletes).
-- A missing table/column is skipped (parity with the app's isMissingSchemaError skip).

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
    "properties": ["id"],
    "property_expenses": ["id", "property_id"],
    "property_files": ["id"],
    "property_managers": ["property_id"],
    "rent_charges": ["id"],
    "rental_applications": ["id"],
    "rental_listings": ["id"],
    "screening_reports": ["application_id"],
    "units": ["id"],
    "vendors": ["property_id"],
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
  v_sql text;
  v_rows bigint;
  v_results jsonb := '[]'::jsonb;
begin
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'account_wipe_apply: ops must be an array' using errcode = '22023';
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
    for v_filter in select value from jsonb_array_elements(v_op->'filters') loop
      v_column := v_filter->>'column';
      if v_column is null or not ((v_allowed->v_table) ? v_column) then
        raise exception 'account_wipe_apply: column not allowed (%)', v_label using errcode = '42501';
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
          v_conditions := v_conditions || format('%I::text = any (%L::text[])', v_column, v_values);
          v_has_key_filter := true;
        when 'eq' then
          if jsonb_typeof(v_filter->'value') <> 'string' then
            raise exception 'account_wipe_apply: eq value must be a string (%)', v_label using errcode = '22023';
          end if;
          v_conditions := v_conditions || format('%I::text = %L', v_column, v_filter->>'value');
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
  'Sprint 255a: applies an owner data wipe plan (ordered, allowlisted deletes plus units.occupied reset) in one transaction. service_role only.';
