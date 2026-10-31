-- Sprint 259b D4 helper (temporary, never a migration; ChatGPT rev 5 REQUIRED 2, rev 6 REQUIRED 1). It holds one
-- invitation's row lock so the concurrency script's racers queue behind it (real row-lock contention).
-- Why `public`: the racers and the holder must be separate API sessions, and the API only reaches exposed schemas.
-- Guards: EXECUTE for service_role only (checked below, in the same transaction as the create); it locks only
-- synthetic fixtures (an @example.invalid invitation sent by a tester); it refuses to run after its expiry. Replace
-- EXPIRES_AT with the creation time + 2 hours before running.
-- D4 order (Claude): run this whole file as one execute_sql call → node supabase/tests/sprint259b_accept_concurrency.mjs
-- → ALWAYS run the drop below, pass or fail → verify the function is gone and the script reported leftovers 0.
-- Any failure, including a failed drop or leftover fixtures, fails D4 and blocks the code that lifts the hold.
create function public.zz_test_259b_hold(p_invitation_id uuid, p_ms integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if clock_timestamp() > timestamptz 'EXPIRES_AT' then
    raise exception 'zz_test_259b_hold expired; drop it';
  end if;
  if not exists (select 1 from public.llc_invitations i join public.profiles p on p.id = i.invited_by
                 where i.id = p_invitation_id and p.is_tester and i.email like '%@example.invalid') then
    raise exception 'zz_test_259b_hold locks test fixtures only';
  end if;
  perform 1 from public.llc_invitations where id = p_invitation_id for update;
  perform pg_catalog.pg_sleep(least(greatest(p_ms, 0), 5000) / 1000.0);
end $$;
revoke all on function public.zz_test_259b_hold(uuid, integer) from public, anon, authenticated;
grant execute on function public.zz_test_259b_hold(uuid, integer) to service_role;
do $$
begin
  if has_function_privilege('anon', 'public.zz_test_259b_hold(uuid, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.zz_test_259b_hold(uuid, integer)', 'execute') then
    raise exception 'zz_test_259b_hold privilege check failed';
  end if;
end $$;
-- After the run (separate call, always): drop function if exists public.zz_test_259b_hold(uuid, integer);
-- Then verify: select count(*) from pg_proc where proname = 'zz_test_259b_hold'; -- must be 0
