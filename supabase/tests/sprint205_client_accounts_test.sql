-- Sprint 205 adversarial checks. Run AFTER the migration (or appended to it for a dry run).
-- Always ends with RAISE, so every write rolls back. Expect every Tn to read 'ok' / true as noted:
-- T2 true/true, T5 1, T8 0, T8b 0, T8c 2, T12 true, T13 false, T18 false/true/true, T14 false/false/true, T16 1, T21 1.
-- (T13b is NULL by design: managers read leases via the service role; T13 updated_at can't move inside one transaction.)
do $t$
declare
  mgr uuid := '062e5fa4-dbdb-4987-8343-d601ca6819b9';
  own uuid := 'a2f5e6af-76a9-4bb8-bba4-2588465bcabb';
  ten uuid := 'ae34728d-5da4-4268-9a87-04056e214805';
  sp uuid; sacct uuid; a uuid; b uuid; ha uuid; hb uuid; u uuid; l uuid; n int; x boolean; r text := ''; ts1 timestamptz; ts2 timestamptz;
begin
  select pm.property_id, p.owner_account_id into sp, sacct from public.property_managers pm join public.properties p on p.id = pm.property_id
    where pm.manager_profile_id = mgr and pm.active limit 1;
  -- service role setup
  set local role service_role;
  a := public.create_client_account(mgr, 'individual', 'Test Client A', 'A@Example.com');
  b := public.create_client_account(mgr, 'llc', 'Test Client B', null);
  ha := public.add_client_home(mgr, a, 'A Home', '1 A St', 'Denver', 'co', '80202', 'single_family');
  hb := public.add_client_home(mgr, b, 'B Home', '2 B St', 'Denver', 'CO', '80203', null);
  r := r || 'T0 flag_after=' || coalesce(nullif(current_setting('domus.client_sync', true), ''), 'off') || '; ';
  select (oa.created_by_profile_id is null and oa.managed_client and oa.claim_state = 'unclaimed' and oa.client_contact_email = 'a@example.com'
          and (select owner_profile_id is null from public.properties where id = ha)
          and exists (select 1 from public.property_managers where property_id = ha and manager_profile_id = mgr and active)
          and (select state from public.properties where id = ha) = 'CO')
    into x from public.ownership_accounts oa where oa.id = a;
  r := r || 'T1 shape=' || coalesce(x::text,'NULL') || '; ';
  begin perform public.add_client_home(mgr, a, 'X', '1', 'Denver', 'CO', 'abc', null); r := r || 'T1b FAIL; ';
  exception when others then r := r || 'T1b ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin perform public.add_client_home(own, a, 'X', '1 St', 'Denver', 'CO', '80202', null); r := r || 'T1c FAIL; ';
  exception when others then r := r || 'T1c ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin insert into public.ownership_account_members (account_id, profile_id, member_role) values (a, own, 'owner'); r := r || 'T9 FAIL; ';
  exception when others then r := r || 'T9 ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin update public.property_managers set active = false where property_id = ha; r := r || 'T10 FAIL; ';
  exception when others then r := r || 'T10 ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin insert into public.property_managers (property_id, manager_profile_id, active) values (ha, own, true); r := r || 'T10b FAIL; ';
  exception when others then r := r || 'T10b ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin update public.ownership_accounts set stripe_account_id = 'acct_x' where id = a; r := r || 'T11 FAIL; ';
  exception when others then r := r || 'T11 ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin update public.ownership_accounts set claim_state = 'claimed' where id = a; r := r || 'T11b FAIL; ';
  exception when others then r := r || 'T11b ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin insert into public.ownership_accounts (account_type, display_name, managed_client, claim_state) values ('individual', 'x', true, 'unclaimed'); r := r || 'T11c FAIL; ';
  exception when others then r := r || 'T11c ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin insert into public.properties (owner_profile_id, owner_account_id, name, address_line1, city, state, postal_code) values (null, sacct, 'x', '1', 'D', 'CO', '80202'); r := r || 'T17 FAIL; ';
  exception when others then r := r || 'T17 ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin update public.properties set owner_profile_id = own where id = ha; r := r || 'T17b FAIL; ';
  exception when others then r := r || 'T17b ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin insert into public.properties (owner_profile_id, owner_account_id, name, address_line1, city, state, postal_code) values (null, a, 'x', '1', 'D', 'CO', '80202'); r := r || 'T17c FAIL; ';
  exception when others then r := r || 'T17c ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin insert into public.invitations (email, full_name, role, property_id, invited_by) values ('m@example.com', 'M', 'manager', ha, mgr); r := r || 'T19 FAIL; ';
  exception when others then r := r || 'T19 ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin insert into public.invitations (email, full_name, role, ownership_account_id, invited_by) values ('o@example.com', 'O', 'owner', a, mgr); r := r || 'T19b FAIL; ';
  exception when others then r := r || 'T19b ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  insert into public.invitations (email, full_name, role, property_id, invited_by) values ('t@example.com', 'T', 'tenant', ha, mgr);
  r := r || 'T19c tenant_invite ok; ';
  insert into public.units (property_id, unit_number, monthly_rent_cents) values (ha, '1', 100000) returning id into u;
  insert into public.leases (unit_id, tenant_profile_id, start_date, end_date, monthly_rent_cents, due_day_of_month, collects_outside_domus)
    values (u, ten, '2026-11-01', '2027-10-31', 100000, 1, false) returning id into l;
  select collects_outside_domus into x from public.leases where id = l; r := r || 'T12 outside=' || coalesce(x::text,'NULL') || '; ';
  reset role;
  -- authenticated manager
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || 'T2 admin_ha=' || coalesce(public.can_administer_property(ha)::text,'NULL') || ' admin_hb=' || coalesce(public.can_administer_property(hb)::text,'NULL') || '; ';
  begin update public.properties set owner_profile_id = mgr where id = ha; get diagnostics n = row_count; r := r || 'T3 FAIL rows=' || coalesce(n::text,'NULL') || '; ';
  exception when others then r := r || 'T3 ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin update public.properties set owner_profile_id = mgr where id = sp; get diagnostics n = row_count; r := r || 'T4 FAIL rows=' || coalesce(n::text,'NULL') || '; ';
  exception when others then r := r || 'T4 ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin update public.properties set owner_account_id = a where id = sp; get diagnostics n = row_count; r := r || 'T4b FAIL rows=' || coalesce(n::text,'NULL') || '; ';
  exception when others then r := r || 'T4b ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  update public.properties set name = 'A Home 2' where id = ha; get diagnostics n = row_count; r := r || 'T5 rename_rows=' || coalesce(n::text,'NULL') || '; ';
  begin insert into public.property_managers (property_id, manager_profile_id, active) values (ha, own, true); r := r || 'T6 FAIL; ';
  exception when others then r := r || 'T6 ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin insert into public.ownership_account_members (account_id, profile_id, member_role) values (a, mgr, 'owner'); r := r || 'T7 FAIL; ';
  exception when others then r := r || 'T7 ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin update public.ownership_accounts set claim_state = 'claimed' where id = a; get diagnostics n = row_count; r := r || 'T8 rows=' || coalesce(n::text,'NULL') || '; ';
  exception when others then r := r || 'T8 ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  select count(*) into n from public.ownership_accounts where id = a; r := r || 'T8b acct_visible=' || coalesce(n::text,'NULL') || '; ';
  select count(*) into n from public.ownership_account_managers where account_id in (a, b); r := r || 'T8c links_visible=' || coalesce(n::text,'NULL') || '; ';
  begin insert into public.property_tax_years (property_id, tax_year) values (ha, 2026); r := r || 'T15 FAIL; ';
  exception when others then r := r || 'T15 ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  begin perform public.create_client_account(mgr, 'individual', 'x', null); r := r || 'T20 FAIL; ';
  exception when others then r := r || 'T20 ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  update public.leases set collects_outside_domus = false where id = l;
  select collects_outside_domus into x from public.leases where id = l; r := r || 'T13b outside_after_user_update=' || coalesce(x::text,'NULL') || '; ';
  reset role;
  -- deactivate client A link
  set local role service_role;
  select updated_at into ts1 from public.ownership_account_managers where account_id = a;
  perform pg_sleep(0.01);
  update public.ownership_account_managers set active = false where account_id = a and manager_profile_id = mgr;
  select updated_at into ts2 from public.ownership_account_managers where account_id = a;
  select active into x from public.property_managers where property_id = ha and manager_profile_id = mgr;
  r := r || 'T13 pm_active_after_deactivate=' || coalesce(x::text,'NULL') || ' updated_at_bumped=' || coalesce((ts2 > ts1)::text,'NULL') || '; ';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || 'T18 after_deact admin_ha=' || coalesce(public.can_administer_property(ha)::text,'NULL') || ' admin_hb=' || public.can_administer_property(hb)
        || ' admin_smoke=' || coalesce(public.can_administer_property(sp)::text,'NULL') || '; ';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || 'T14 owner admin_ha=' || coalesce(public.can_administer_property(ha)::text,'NULL') || ' admin_hb=' || public.can_administer_property(hb)
        || ' admin_own_smoke=' || coalesce(public.can_administer_property(sp)::text,'NULL') || '; ';
  update public.properties set name = name where id = sp; get diagnostics n = row_count; r := r || 'T16 owner_rename_rows=' || coalesce(n::text,'NULL') || '; ';
  begin update public.properties set owner_profile_id = mgr where id = sp; r := r || 'T16b FAIL; ';
  exception when others then r := r || 'T16b ok ' || sqlstate || ' ' || left(sqlerrm, 45) || '; '; end;
  reset role;
  set local role service_role;
  delete from public.properties where id = hb; get diagnostics n = row_count; r := r || 'T21 cascade_delete_rows=' || coalesce(n::text,'NULL') || '; ';
  reset role;
  raise exception 'RESULTS: %', r;
end $t$;
