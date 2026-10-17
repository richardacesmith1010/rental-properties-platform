# Sprint 238k attacker test: Storage policy lockdown

Migration: `supabase/migrations/20261027_sprint238k_storage_policy_lockdown.sql`
Rollback: `supabase/rollback/20261027_sprint238k_rollback.sql`

## What it proves

User B is any new sign-up. User A is a landlord. The test checks what B (and a visitor who is not signed in)
can do to Storage rows on the `property-files` and `profile-avatars` buckets through a user session.
It also checks that the service role, the only path the app uses, keeps working.

## When to run it

| When | Expected first line of the report |
|---|---|
| BEFORE apply (holes visible) | `mode=before-apply open=9/9 closed=0/9: PASS before-apply: every hole is OPEN, as expected` |
| AFTER apply (holes closed) | `mode=after-apply open=0/9 closed=9/9: PASS after-apply: every hole is CLOSED` |
| After running the rollback | the BEFORE line again (the rollback reopens every hole) |

Run it BEFORE apply first. If the BEFORE run does not show 9/9 OPEN, the test cannot prove anything: stop and fix it.
Then apply the migration and run it AFTER. Paste both report lines into the handoff.

## How to run it

- Run the SQL below as `postgres`: the Supabase SQL editor, or `execute_sql` from the Supabase connector.
- It is one statement (one `do` block). It needs no `begin` or `rollback`.
- It always ends with an error that starts `238K REPORT (all changes rolled back)`. That error is the report.
  Raising it rolls back every seeded row, probe write and setting, so nothing stays behind.
- Any other error means the test itself broke. Nothing was changed. Fix the test, not the policies.
- A `FAIL (the test itself broke ...)` verdict, or any `ERROR` or `BROKEN` line, also means the test broke.
- User A and user B are random ids made inside the test. No real account or real file is touched.

## Why the obvious checks lie

1. Both buckets are empty (0 objects on 2026-10-16). An unseeded read returns 0 rows with or without the policies.
   The test seeds one object per bucket as `postgres` first.
2. A direct SQL `DELETE` on `storage.objects` is always refused by trigger `protect_objects_delete`
   (`storage.protect_delete()`), with SQLSTATE 42501, the same code as an RLS denial. The Storage API sets
   `storage.allow_delete_query = 'true'`, so through the API only RLS decides. The delete probes set that flag.
   The 2026-10-16 handoff note "delete refused by table privilege" was this trigger, not a privilege.
   `anon` and `authenticated` hold DELETE, INSERT, SELECT and UPDATE on `storage.objects`.
3. An insert counts as CLOSED only on the message `new row violates row-level security policy ...`, not on any 42501.
4. The claims must carry `role`. The property-files policies call `auth.role()`, which reads `claims ->> 'role'`.
   With `sub` alone, P1 returns 0 even before apply, so the hole would look closed while it is open.
   The test also blanks the legacy `request.jwt.claim.sub` and `request.jwt.claim.role` settings, which
   `auth.uid()` and `auth.role()` read first.
5. The migration's own check only matches policy text. This test checks behavior.

## Probes

| Probe | Before apply | After apply |
|---|---|---|
| P1 B reads A's property file | OPEN (1 row) | CLOSED (0 rows) |
| P2 B adds a file to A's property-files folder | OPEN (insert works) | CLOSED (RLS violation message) |
| P3 B deletes A's property file (Storage API path) | OPEN (1 row) | CLOSED (0 rows) |
| P4 B reads A's avatar | OPEN (public read) | CLOSED |
| P5 B reads its own avatar folder (lets B mint share links) | OPEN | CLOSED |
| P6 B uploads a file to its own avatar folder (free hosting) | OPEN | CLOSED (RLS violation message) |
| P7 B overwrites its own avatar object | OPEN (1 row) | CLOSED (0 rows) |
| P8 B deletes its own avatar object (Storage API path) | OPEN (1 row) | CLOSED (0 rows) |
| P9 anon reads A's avatar | OPEN (public read) | CLOSED |

Controls (must say `ok` in both states):
- The service role reads the 3 seeded objects, uploads a property file and an avatar, updates and deletes its
  object. This pins the app's own path (every app Storage call uses `createAdminClient()`; L-014).
- B's claims took effect: `auth.uid()` is B and `auth.role()` is `authenticated`.
- A direct SQL delete is refused by `protect_objects_delete`. This is why P3 and P8 set the flag.
- A's avatar still exists at the end, so a 0-row read came from RLS, not from a missing row.
- After apply, A's property file survives B's delete attempt.

## The test (SQL)

```sql
do $attack$
declare
  a uuid := gen_random_uuid();  -- user A (the landlord being attacked): a random id, not a real account
  b uuid := gen_random_uuid();  -- user B (the attacker, any new sign-up): a random id, not a real account
  pf_a uuid;                    -- A's property file
  av_a uuid;                    -- A's avatar
  av_b uuid;                    -- B's own avatar
  svc uuid;                     -- object written by the service role (the app's path)
  applied boolean;
  n integer;
  st text;
  labels text[] := '{}';
  states text[] := '{}';
  ctl_labels text[] := '{}';
  ctl_ok boolean[] := '{}';
  open_n integer := 0;
  closed_n integer := 0;
  error_n integer := 0;
  ctl_bad integer := 0;
  report text;
  verdict text;
  i integer;
begin
  -- 0. Which state is live? "applied" = no storage.objects policy mentions either bucket.
  applied := not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(property-files|profile-avatars)');

  -- 1. Seed as postgres (bypasses RLS). Without seeded rows every read probe returns 0 in both states.
  insert into storage.objects (bucket_id, name) values ('property-files', a || '/238k-lease.pdf') returning id into pf_a;
  insert into storage.objects (bucket_id, name) values ('profile-avatars', a || '/avatar.png') returning id into av_a;
  insert into storage.objects (bucket_id, name) values ('profile-avatars', b || '/avatar.png') returning id into av_b;
  -- auth.uid() and auth.role() read these legacy settings first; blank them so only request.jwt.claims counts.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);

  -- 2. Controls: the app's own path (service role) keeps working in both states (L-014 pin).
  set local role service_role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select count(*) into n from storage.objects where id in (pf_a, av_a, av_b);
  ctl_labels := array_append(ctl_labels, 'service role reads the 3 seeded objects');
  ctl_ok := array_append(ctl_ok, n = 3);
  insert into storage.objects (bucket_id, name) values ('property-files', a || '/238k-svc.pdf') returning id into svc;
  insert into storage.objects (bucket_id, name) values ('profile-avatars', a || '/avatar.jpg');
  ctl_labels := array_append(ctl_labels, 'service role uploads a property file and an avatar');
  ctl_ok := array_append(ctl_ok, svc is not null);
  update storage.objects set metadata = '{"probe":"238k"}'::jsonb where id = svc;
  get diagnostics n = row_count;
  ctl_labels := array_append(ctl_labels, 'service role updates its object');
  ctl_ok := array_append(ctl_ok, n = 1);
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where id = svc;
  get diagnostics n = row_count;
  perform set_config('storage.allow_delete_query', 'false', true);
  ctl_labels := array_append(ctl_labels, 'service role deletes its object');
  ctl_ok := array_append(ctl_ok, n = 1);
  reset role;

  -- 3. Probes as user B. role must be in the claims: the property-files policies call auth.role().
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  ctl_labels := array_append(ctl_labels, 'B claims took effect (auth.uid() = B, auth.role() = authenticated)');
  ctl_ok := array_append(ctl_ok, auth.uid() = b and auth.role() = 'authenticated');

  -- Control: a direct SQL delete is always refused by trigger protect_objects_delete (42501, same code as RLS).
  -- That is why the delete probes below set storage.allow_delete_query, as the Storage API does.
  begin
    delete from storage.objects where id = pf_a;
    st := 'no trigger';
  exception when others then
    st := sqlerrm;
  end;
  ctl_labels := array_append(ctl_labels, 'direct SQL delete is refused by protect_objects_delete');
  ctl_ok := array_append(ctl_ok, st like 'Direct deletion from storage tables is not allowed%');

  -- P1. B reads A's property file.
  select count(*) into n from storage.objects where id = pf_a;
  labels := array_append(labels, 'P1 B reads A''s property file');
  states := array_append(states, case when n > 0 then 'OPEN' else 'CLOSED' end);

  -- P2. B adds a file to A's property-files folder. CLOSED only on the RLS message, not on any 42501.
  begin
    insert into storage.objects (bucket_id, name) values ('property-files', a || '/238k-planted.pdf');
    st := 'OPEN';
  exception when others then
    st := case when sqlstate = '42501' and sqlerrm like 'new row violates row-level security policy%' then 'CLOSED'
      else 'ERROR ' || sqlstate || ': ' || sqlerrm end;
  end;
  labels := array_append(labels, 'P2 B adds a file to A''s property-files folder');
  states := array_append(states, st);

  -- P3. B deletes A's property file the way the Storage API does (flag on, so only RLS decides).
  begin
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.objects where id = pf_a;
    get diagnostics n = row_count;
    perform set_config('storage.allow_delete_query', 'false', true);
    st := case when n > 0 then 'OPEN' else 'CLOSED' end;
  exception when others then
    st := 'ERROR ' || sqlstate || ': ' || sqlerrm;
  end;
  labels := array_append(labels, 'P3 B deletes A''s property file (Storage API path)');
  states := array_append(states, st);

  -- P4. B reads A's avatar.
  select count(*) into n from storage.objects where id = av_a;
  labels := array_append(labels, 'P4 B reads A''s avatar');
  states := array_append(states, case when n > 0 then 'OPEN' else 'CLOSED' end);

  -- P5. B reads its own avatar folder (needed to mint signed links to hosted files).
  select count(*) into n from storage.objects where id = av_b;
  labels := array_append(labels, 'P5 B reads its own avatar folder');
  states := array_append(states, case when n > 0 then 'OPEN' else 'CLOSED' end);

  -- P6. B uploads any file to its own avatar folder (free file hosting).
  begin
    insert into storage.objects (bucket_id, name) values ('profile-avatars', b || '/238k-hosted.bin');
    st := 'OPEN';
  exception when others then
    st := case when sqlstate = '42501' and sqlerrm like 'new row violates row-level security policy%' then 'CLOSED'
      else 'ERROR ' || sqlstate || ': ' || sqlerrm end;
  end;
  labels := array_append(labels, 'P6 B uploads a file to its own avatar folder');
  states := array_append(states, st);

  -- P7. B overwrites its own avatar object.
  begin
    update storage.objects set metadata = '{"probe":"238k"}'::jsonb where id = av_b;
    get diagnostics n = row_count;
    st := case when n > 0 then 'OPEN' else 'CLOSED' end;
  exception when others then
    st := 'ERROR ' || sqlstate || ': ' || sqlerrm;
  end;
  labels := array_append(labels, 'P7 B overwrites its own avatar object');
  states := array_append(states, st);

  -- P8. B deletes its own avatar object (Storage API path).
  begin
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.objects where id = av_b;
    get diagnostics n = row_count;
    perform set_config('storage.allow_delete_query', 'false', true);
    st := case when n > 0 then 'OPEN' else 'CLOSED' end;
  exception when others then
    st := 'ERROR ' || sqlstate || ': ' || sqlerrm;
  end;
  labels := array_append(labels, 'P8 B deletes its own avatar object (Storage API path)');
  states := array_append(states, st);
  reset role;

  -- P9. Anon (no sign-in at all) reads A's avatar.
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from storage.objects where id = av_a;
  labels := array_append(labels, 'P9 anon reads A''s avatar');
  states := array_append(states, case when n > 0 then 'OPEN' else 'CLOSED' end);
  reset role;

  -- 4. Seed checks as postgres: a 0-row read must come from RLS, not from a missing row.
  select count(*) into n from storage.objects where id = av_a;
  ctl_labels := array_append(ctl_labels, 'A''s avatar still exists after the probes');
  ctl_ok := array_append(ctl_ok, n = 1);
  select count(*) into n from storage.objects where id = pf_a;
  ctl_labels := array_append(ctl_labels, 'A''s property file survives B''s delete (checked after apply only)');
  ctl_ok := array_append(ctl_ok, (not applied) or n = 1);

  -- 5. Verdict. Before apply every probe must be OPEN; after apply every probe must be CLOSED.
  report := '';
  for i in 1 .. cardinality(labels) loop
    report := report || E'\n' || states[i] || '  ' || labels[i];
    if states[i] = 'OPEN' then open_n := open_n + 1;
    elsif states[i] = 'CLOSED' then closed_n := closed_n + 1;
    else error_n := error_n + 1; end if;
  end loop;
  for i in 1 .. cardinality(ctl_labels) loop
    if ctl_ok[i] is not true then ctl_bad := ctl_bad + 1; end if;
    report := report || E'\n' || case when ctl_ok[i] is true then 'ok      ' else 'BROKEN  ' end || 'control: ' || ctl_labels[i];
  end loop;
  verdict := case
    when error_n > 0 or ctl_bad > 0 then 'FAIL (the test itself broke; fix the test, not the policies)'
    when not applied and open_n = cardinality(labels) then 'PASS before-apply: every hole is OPEN, as expected'
    when applied and closed_n = cardinality(labels) then 'PASS after-apply: every hole is CLOSED'
    when applied then 'FAIL after-apply: a hole is still OPEN'
    else 'FAIL before-apply: some probes are CLOSED (partial lockdown or drift; re-read pg_policies)'
  end;
  -- Always end in an error so every seed, probe write and setting above is rolled back.
  raise exception using message = format('238K REPORT (all changes rolled back) mode=%s open=%s/%s closed=%s/%s: %s%s',
    case when applied then 'after-apply' else 'before-apply' end,
    open_n, cardinality(labels), closed_n, cardinality(labels), verdict, report);
end
$attack$;
```

## After apply: app check

Run one real round trip through the app as a test account (scripted sign-in from `apps/web/.env.local`,
`SMOKE_OWNER_*`; never type a password into a page):
1. Upload one small PDF to a property's documents (`uploadPropertyFile` in `apps/web/app/actions/document-templates.ts:123`, re-exported by `documents.ts`).
2. Open it again, which uses a signed URL from `apps/web/lib/assets.ts`.
3. Delete it in the app so the test file does not stay behind.

This proves the migration header claim that the lockdown changes nothing the app does.
Avatar images were already broken before 238k: the app builds public URLs for a private bucket
(`apps/web/lib/auth.ts:140`, `apps/web/app/actions/profile.ts:77`). A broken avatar is not a 238k regression
and not a reason to run the rollback.

## Dry-run evidence (2026-10-16, project vawqdqkaguhdgfhdebqw, all rolled back)

1. Test as written, live (before apply):
   `mode=before-apply open=9/9 closed=0/9: PASS before-apply`; all 8 controls ok.
2. Migration body plus the migration's checks plus the test, in one block:
   `mode=after-apply open=0/9 closed=9/9: PASS after-apply`; all 8 controls ok.
3. Migration body plus rollback body plus the rollback check, in one block: 0 policies on `storage.objects` after
   the migration. After the rollback, `pg_policies` text was identical to live
   (name, cmd, roles, permissive, qual, with_check).
4. Live state re-read afterwards: 8 policies, 0 objects in either bucket (unchanged).

After apply, storage.objects has no policies at all (these eight were the only ones live). RLS stays on, so clients
get nothing from any bucket. Future direct uploads (238j-2) must use admin-minted signed upload URLs
(`createSignedUploadUrl`). Never re-add user-session policies.
