-- Sprint 259b D4 helper (temporary, never a migration): holds one invitation's row lock so the concurrency script's
-- racers queue behind it (real row-lock contention, ChatGPT rev 5 REQUIRED 2). Create it right before
-- `node supabase/tests/sprint259b_accept_concurrency.mjs`, and drop it right after with the last line below.
-- Service role only; it writes nothing and returns nothing.
create function public.zz_test_259b_hold(p_invitation_id uuid, p_ms integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.llc_invitations where id = p_invitation_id for update;
  perform pg_catalog.pg_sleep(least(greatest(p_ms, 0), 5000) / 1000.0);
end $$;
revoke all on function public.zz_test_259b_hold(uuid, integer) from public, anon, authenticated;
grant execute on function public.zz_test_259b_hold(uuid, integer) to service_role;
-- After the run (separately): drop function public.zz_test_259b_hold(uuid, integer);
