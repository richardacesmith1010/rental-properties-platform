# Sprint 238g — App Review demo accounts seed (L3: production logins + data) — rev 3 (rev 1 REJECT → rev 2 AWC → all items adopted)

## 1. Objective
Add an idempotent seed that builds a fake App Review owner + tenant graph covering every promise in
`docs/app-store/app-review-notes.md` §5 (lines 259-272). Move shared helpers out of the smoke seed without changing smoke behavior.
Codex writes and tests the code against a fake client only. Claude runs the seed later, after the owner sets the two emails.

## 2. Context
- HEAD `a7a3915`. Needs: app-review-notes §5 and block 1c (`:60-150`; bank `:112-117`, payout `:119-123`);
  `docs/phone-readiness-plan-2026-10-16.md:247-252` (item 8), `:16` (Q10). No `appreview` auth users exist yet (live).
- `scripts/seed-smoke-accounts.mjs` (758 lines) calls `main()` at import (`:758`), so tests cannot import it today.
  Shared candidates: `deterministicUuid :20-26`, `hashPassword :28-30`, `createAdminClient :65-72`, `createSummary/record :74-84`,
  `printSummary :86-93` + `fail :95-99` (hard-code `[smoke-seed]`), `listTargetUsers :101-126`, `ensureProfile :187-241`
  (uses `PROFILE_COMPLETED_AT :5`), `ensureOwnerMembership :320-375`. All other functions are smoke-only.
- `.env.local` also has `SMOKE_TENANT2_EMAIL` and `SMOKE_TENANT3_EMAIL`: the collision check covers every `SMOKE_*EMAIL`.
- App paths below are under `apps/web/`. Rent minimum: `lib/payment-fees.ts:13` (500), `lib/tenant-pay-state.ts:24`.
- Receipt: `lib/payment-history.ts:18-78`, `app/payments/receipt/[chargeId]/page.tsx:37-104` need a non-deleted
  `rent_charges` row and a `payments` row with `reversed_at` null (no `rent_charge_lines` needed).
  Manual payment pattern: `app/actions/charges.ts:303-326` (`recorded_via 'manual'`, then charge `status 'paid'`).
- Cron `generate-charges` (`lib/charge-generation.ts:59-71, :452-476`) adds current + next month charges due on or
  after the lease `created_at` date, skips existing (lease, due_date, 'rent') rows, and marks pending charges `late`
  after grace (`:186-275`). The seed must find charges by that key, never by id alone.
- Bank: Home count `lib/owner-wallet-home.ts:30-52`; rows `components/dashboard/owner-home/needs-you-list.tsx:30-36`
  ("Connect … bank" only without `bank_connections`); page `app/owner/bank/page.tsx:76-97`; `Suggestion` in
  `lib/bank-feed/types.ts:55-58`; `components/bank-feed/review-card.tsx:29-35, 121-125`; rent text `lib/bank-feed/match.ts:70`.
  `answerQueuedBankItem` (`app/actions/bank-feed.ts:230-262`) calls live `resolve_bank_review_item`, which DELETES the
  item; "Not rental" inserts its fingerprint into `bank_skipped_fingerprints`; "Yes" files into `bank_transactions`.
- Messages: `lib/inbox/action-helpers.ts:133-201`; tenant `inbound` (`app/actions/inbox.ts:79-91`), owner `outbound`
  (`:233-249`); subject "Messages with your landlord" (`lib/inbox/thread-title.ts:1`); tenants see threads only with an
  active lease (`lib/inbox.ts:173-231`).
- Repairs: insert `app/actions/maintenance-ticket-actions.ts:77-87`; tenant list by `tenant_profile_id`
  (`lib/maintenance/read.ts:14`). Photos: bucket `maintenance-photos`, path `${ticketId}/${uuid}-${name}.${ext}`,
  metadata insert (`app/actions/maintenance-queries.ts:61-83, :139-166`).
- "Set up rent payments" shows when Stripe is not connected (`components/settings/bank-settings.tsx:61-73`).
  Notifications are off (`lib/notifications-switch.ts:45`); the seed writes rows directly and calls no app code.
- Live schema (read-only check, 2026-10-16):
  - `auth.users` trigger `handle_new_user` creates the profile (role from `user_metadata.role`) and auto-accepts
    pending `invitations` for that email (adds memberships). The seed must refuse if one exists.
  - `rent_charges`: unique `(lease_id, due_date, category) WHERE deleted_at IS NULL`; status pending|paid|late|waived;
    `rent_charges_guard_client_write` returns early for service role. `payments.method` ach|card|cash|check|other.
  - `bank_accounts`: institution 1-80, nickname 1-60, `source` upload|plaid, `mask` ≤ 4, balance fields all null or all
    set, unique `(owner_account_id, institution, nickname)`. `bank_connections` needs a real `plaid_item_id`: never create.
  - `bank_review_items`: FK `(bank_account_id, owner_account_id)` → `bank_accounts(id, owner_account_id)`; unique
    `(bank_account_id, external_id)`; `amount_cents > 0`; description ≤ 200. A BEFORE UPDATE trigger bumps
    `updated_at` (the app's lock), so never send a no-op update.
  - `bank_skipped_fingerprints` CHECK `fingerprint ~ '^[0-9a-f]{64}$'`: a non-hex seed fingerprint breaks "Not rental".
    `bank_transactions` is unique on `(bank_account_id, fingerprint)` and `(bank_account_id, external_id)`.
  - `inbox_threads` partial unique `(property_id, entity_id, subject) WHERE entity_type = 'tenant_profile'`;
    `inbox_messages.channel` in_app|email|sms|system, `direction` inbound|outbound|system.
  - `maintenance_tickets.status` open|in_progress|resolved|closed; `priority` low|medium|high|urgent.
    Bucket `maintenance-photos` is private, 20 MB, any type. `property_expenses`: `category` check, amount > 0.
  - `ownership_accounts`: one individual account per creator. `properties_guard_ownership` needs `owner_profile_id`.

## 3. In scope
Shared helpers, smoke seed import + entry guard, App Review seed (CLI + graph), fake client, tests, one npm script.

## 4. Out of scope
Running any seed; SQL, migrations, RLS; `apps/**` code; App Store text; docs (Claude updates the handoff and
`docs/smoke-accounts.md`); Stripe/Plaid calls; `bank_connections`; notifications; a manager account.

## 5. Exact files expected to change
1. `scripts/lib/seed-helpers.mjs` (new): moved helpers, plus new `ensureRowById`, the dry-run read-only wrapper and `sha256Hex`.
2. `scripts/seed-smoke-accounts.mjs`: import moved helpers; export `runSmokeSeed({ admin, config })`; entry guard.
3. `scripts/seed-appreview-accounts.mjs` (new): CLI, env guards, password file, orchestration (`runAppReviewSeed`).
4. `scripts/lib/appreview-graph.mjs` (new): `ensure*` functions for the demo graph.
5. `scripts/lib/demo-png.mjs` (new): deterministic PNG builder (`node:zlib` + CRC32 table).
6. `scripts/__tests__/helpers/fake-admin.mjs` (new): in-memory admin client that records every call.
7. `scripts/__tests__/seed-smoke-pin.test.mjs` (new) and `scripts/__tests__/seed-appreview.test.mjs` (new).
8. `package.json` (root): add `"test:scripts": "node --test scripts/__tests__/*.test.mjs"` only.

## 6. Implementation requirements
1. **Pin first.** Add only the `runSmokeSeed` export and an entry guard (`import.meta.url === pathToFileURL(process.argv[1]
   ?? "").href`) to the smoke seed; `main()` keeps `loadConfig` + `createAdminClient`, then calls `runSmokeSeed`. Write and
   pass `seed-smoke-pin.test.mjs`, then move helpers. The pin test must not change after the move. Report both runs.
2. **Move verbatim** (add `export`, no edits): `deterministicUuid`, `hashPassword`, `createAdminClient`, `createSummary`,
   `record`, `listTargetUsers`, `ensureOwnerMembership`, `PROFILE_COMPLETED_AT`. Only one defaulted parameter is added to
   `printSummary(summary, prefix = "[smoke-seed]")`, `fail(step, error, prefix = "[smoke-seed]")` and
   `ensureProfile(..., completedAt = PROFILE_COMPLETED_AT)`. Smoke call sites stay unchanged; all else stays in the smoke file.
3. **Guards, before any client call.** `runAppReviewSeed` throws `SeedRefusedError`; the CLI prints
   `[appreview-seed] refused: <rule>` and exits 1. Refuse when:
   - `APPREVIEW_OWNER_EMAIL` or `APPREVIEW_TENANT_EMAIL` is missing or blank, or the two are equal;
   - an email lacks "appreview" (case-insensitive) or equals any env var matching `/^SMOKE_[A-Z0-9_]*EMAIL$/` (trimmed, any case);
   - `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing.
   After reads, refuse when an auth user with a demo email lacks **`app_metadata.appreview_seed === "domus-appreview-v1"`
   and `app_metadata.appreview_role` equal to its role** (admin-only fields; `user_metadata` is user-editable and never
   proves ownership), or a `pending` `invitations` row has `lower(email)` equal to a demo email.
   **Post-create check (invitation race):** the pre-read cannot stop a real invitation inserted between the read and
   `createUser` (`handle_new_user` would accept it). Right after each `createUser`, and before any graph write, read
   `ownership_account_members`, `property_managers`, `leases` and `invitations` (`invited_profile_id` = the new user id). Any
   row → `SeedRefusedError("unexpected access for <role>")`, no graph writes, exit 1; Claude then removes the demo user by
   hand. Residual risk (stated, accepted): detection happens after the trigger ran; nothing is shown to App Review until
   Claude finishes the run and checks it. On later runs the same check allows only the demo graph's own rows.
   The refusal prints only non-secret ids (auth user id, invitation ids, membership/assignment/lease ids) so Claude can
   investigate. The seed never cleans up invitations or access rows itself; Claude follows
   `docs/runbooks/appreview-seed.md` (Claude writes it) to restore the invitation and remove only the unintended access.
   **Order (both users):** (1) read and validate auth identities (`app_metadata`); (2) read invitations and access rows
   and refuse on anything outside the demo graph; (3) only then generate/persist passwords, call `updateUserById`, or
   write the graph. A new user gets the post-create check right after `createUser`, before anything else.
4. **Passwords.** Per role: use `APPREVIEW_<ROLE>_PASSWORD` from env, else that key from the env file, else generate
   `randomBytes(24).toString("base64url") + "-Aa1"` and append `KEY=value\n` (newline first only if the file lacks one;
   never if the key exists) before creating or updating the user, and only after every read-only check in §6.3 passed.
   **File safety:** `lstat` the path: a symlink → refuse; an existing file whose mode allows group/other access
   (`mode & 0o077`) → refuse with "run chmod 600 on the env file"; a new file is created with mode `0o600`. Write
   atomically: read the file, append the new keys in memory, write a temp file in the same folder (mode `0o600`, fsync),
   then rename over the original. An interrupted write leaves the original unchanged; the next run starts again. Never
   remove or change an existing key. Never print, log or throw a password; print only
   `<role> password: saved to apps/web/.env.local (not shown)`
   when this run wrote it, else `<role> password: configured (not shown)`. Dry-run never generates or writes. The file defaults to
   `new URL("../apps/web/.env.local", import.meta.url)`; tests pass a temp path.
5. **Users.** `createUser({ email, password, email_confirm: true, user_metadata: { full_name, role }, app_metadata:
   { appreview_seed, appreview_role, appreview_password_hash } })` (`role` stays in `user_metadata` only because
   `handle_new_user` reads it at creation). `updateUserById` only when the `app_metadata` hash or markers or the name
   differ, and only for a user that passed the `app_metadata` guard. Never call invite, magic-link, OTP, recovery or
   reset methods. Owner "Jordan Demo", tenant "Riley Demo". Then `ensureProfile`.
6. **Graph.** Ids are `deterministicUuid("appreview-…")`; month-keyed rows add `YYYY-MM`. `now` is injectable (UTC);
   `M0` = first day of `now`'s month. Simple rows use the new `ensureRowById` (select by id → insert, or update diffs).
   **Ownership check before any update:** `ensureRowById` takes an `owns(row)` predicate; a row that exists but fails it
   → `SeedRefusedError`, never "repaired". Predicates: account `created_by_profile_id` = demo owner; membership = demo account + owner;
   property = demo account + `owner_profile_id`; unit = demo property; lease = demo unit + demo tenant; charge = demo lease;
   payment = expected demo charge; expense = demo property; bank account = demo account; review item = demo bank account
   + demo account; thread = demo property + demo tenant entity; message = demo thread; ticket = demo tenant + demo unit;
   photo row = demo ticket. Rows found by natural key (charges, thread) are checked the same way.
   - Account "Jordan Demo Homes" (individual) + owner membership, with the smoke-style conflict checks.
   - Property "Sample Lane House": 42 Sample Lane, Springfield, IL 62704, `single_family`. Unit "Main": 2 bed, 1 bath,
     400 cents, occupied. Lease 2026-07-01 to 2028-06-30: 400 cents, due day 1, grace 5, no late fee, deposit 0,
     `collects_outside_domus` false, active.
   - Paid months `M0-3..M0-1` (not before lease start): find by (lease, due_date, 'rent', not deleted). Missing → insert
     `paid`; pending/late → set `paid`; amount ≠ 400 → throw. **Waived → leave as is and never add a payment;** an active
     payment on a waived charge → `SeedRefusedError`. Exactly one non-reversed
     payment of 400 on that charge → existing; none → insert one: 400, `check`, `recorded_via 'manual'`, `paid_at` = due
     date 15:00Z, note "Demo payment"; another amount or more than one → `SeedRefusedError` (never edit a payment).
   - Open month `M0`: insert a `pending` charge only if none exists; never change an existing one (a cron-made one is
     adopted as is). Never touch charges after `M0` (the cron may have made `M0+1`).
   - Expenses for `M0-1`: "Gutter cleaning" (maintenance, 12000, day 10), "Fix porch step" (repair, 6500, day 20), by owner.
   - Bank account "Demo Bank" / "Rent checking": `source 'upload'`, mask "4321", no balance, no connection.
   - Three review items: `posted_on` `M0`, `external_id` `appreview-YYYY-MM-<slug>`, `fingerprint`
     `sha256Hex("appreview|" + bankAccountId + "|" + externalId)` (64 lowercase hex). (a) rent: in, 400, "ZELLE FROM
     RILEY DEMO", `{ text: "Rent from Riley Demo · Sample Lane House", kind: "rent", rentChargeId: <M0 charge>, propertyId }`;
     (b) plumber: out, 8500, "SAMPLE PLUMBING REPAIR", `{ text: "Repair", kind: "expense", propertyId, category: "repair",
     label: "Repair" }`; (c) water: out, 4218, "SAMPLE CITY WATER", same shape with `utility` / "Water". An item already
     filed (`bank_transactions`, same external id) or skipped (`bank_skipped_fingerprints`, same fingerprint) is `existing`.
   - Thread: adopt by (property, `tenant_profile`, tenant id, "Messages with your landlord") or insert (created by tenant).
     Tenant `inbound`: "Hi! The kitchen sink drips. I sent a repair with a photo." Owner `outbound`: "Thanks, Riley.
     A plumber will come this week." Both `in_app`, sender's email; `created_at` on insert only (`now`-2h, `now`-1h).
   - Repair "Kitchen sink drips": "Water drips under the kitchen sink. It started this week.", medium, tenant's unit and
     id; reset to `open` (`resolved_at` null) if changed. Photo `${ticketId}/${photoId}-sink.png`, `image/png`, caption
     "Drip under the sink", by tenant; upload (`upsert: false`) only if no object in `storage.list(ticketId, { search })`
     has a `name` exactly equal to the expected file name (a similar name does not count).
     PNG: 480×360, deterministic, under 50 KB.
   - Stripe: read owner profile + account `stripe_account_id` / `stripe_onboarding_complete`; never write; warn if set.
7. **Idempotent + dry-run.** Compare fields, never timestamps; update only on a difference. Summary lines
   created/updated/existing (would-create/would-update in dry-run), prefix `[appreview-seed]`. `--dry-run` wraps the
   client so insert/update/upsert/delete/rpc/createUser/updateUserById/upload throw; it prints the plan and writes
   nothing. Missing users get placeholder ids `appreview-dryrun-<role>`.
8. **Strict fake (`fake-admin.mjs`):** throws on unknown tables, unsupported builder chains or filters, any `rpc`, any
   write not expected by the test; error handling is proven by injected `{ error }` results that must stop the run with
   no later writes (not by an "inspection detector");
   duplicate keys under the live unique keys listed in §2, storage upload of an existing path with `upsert: false`, and
   `createUser`/`updateUserById` payloads outside the shape in §6.5; any invite/OTP/magic-link/recovery/reset call throws.
9. Check every Supabase error (L-002). Never call `rpc`. Never write `notifications`, `notification_deliveries`,
   `message_deliveries`, `communication_logs` or `audit_logs`. No imports from `apps/`. Demo copy: at most 12 words per
   sentence. Script header: "Claude runs this after the owner sets both emails. Codex never runs it."

## 7. Validation commands
- `node --test scripts/__tests__/*.test.mjs` and `npm run test:scripts` (fake client only; tests pass `env` explicitly
  and never read `process.env` secrets or the real `apps/web/.env.local`).
- `for f in scripts/seed-smoke-accounts.mjs scripts/seed-appreview-accounts.mjs scripts/lib/*.mjs; do node --check "$f"; done`
- `wc -l scripts/*.mjs scripts/lib/*.mjs` (each ≤ 500, **except `scripts/seed-smoke-accounts.mjs`**, which only shrinks
  this sprint; do not move more smoke-only code to hit a number); `awk 'length > 140' scripts/*.mjs scripts/lib/*.mjs` prints nothing.
- `git diff --stat` lists only §5 files. Do NOT run `node scripts/seed-*.mjs` in any mode, against any database.

## 8. Acceptance criteria (test → assertion; file numbers from §5)
1. `seed-smoke-pin.test.mjs` "smoke writes and output are unchanged": exact ordered fake writes (table, op, payload) and
   console lines for a first run, then zero writes on a second run; passes before and after the move (files 1-2, 6-7).
2. `seed-appreview.test.mjs` "refuses unsafe emails before any call": each §6.3 env rule throws with zero fake calls,
   including a `SMOKE_TENANT2_EMAIL` match (file 3).
3. "refuses a non-demo auth user or a pending invitation": no writes (files 3-4).
4. "ids are stable and appreview-only": two runs give identical ids; none equals a smoke-label id (files 1, 4).
5. "dry run writes nothing": zero write calls, env file bytes unchanged, "would create" lines printed (files 1, 3).
6. "second run is a no-op": same `now` → zero writes, only `existing` labels (files 3-4).
7. "next month adds only that month": `now` + 1 month marks the old `M0` charge paid with one payment and adds only the
   new month-keyed items and expenses (file 4).
8. "adopts a cron-made charge": a pre-seeded late `M0-1` charge with a random id becomes paid; no duplicate (file 4).
9. "all demo rent is below the online minimum": unit, lease, charges, payments and the rent item are below the constant
   parsed from `apps/web/lib/payment-fees.ts` (file 4).
10. "passwords are saved once and never printed": keys appended once across two runs; existing values kept; no captured
    stdout/stderr or error text contains a password (file 3).
11. "creates every App Review promise": ≥ 1 paid charge with an active payment; 3 items with 64-hex fingerprints, the rent
    item amount and `rentChargeId` matching the `M0` charge; no `bank_connections` or Stripe-column write; thread subject
    equals the constant parsed from `thread-title.ts` with 1 inbound + 1 outbound `in_app` message; one open ticket whose
    photo is uploaded to `maintenance-photos` as `image/png` with PNG signature and 480×360 IHDR; ≥ 1 expense (files 4-5).
12. "no notifications and no RPC": fake `rpc` throws and is never called; no writes to §6.8 tables; no `apps/` import (3-4).
13. "warns but never writes Stripe": a fake owner with `stripe_account_id` gets a warning and no write to it (file 4).
14. "forged user_metadata is refused": demo email with `user_metadata.appreview_seed` set but no matching `app_metadata`
    → refused, zero writes (file 3).
15. "post-create access aborts": the fake trigger adds a membership on `createUser` → refused before any graph write (3-4).
16. "foreign row at a demo id is refused": each graph level with a row whose parent differs → refused, no update (1, 4).
17. "cron M0 adopted": a cron-made `M0` pending or late charge with a random id is adopted unchanged, no insert (file 4).
18. "cron M0+1 untouched, then adopted": a run leaves `M0+1` alone; with `now` + 1 month that exact row is the new `M0`,
    no duplicate (file 4).
19. "conflicting payment refuses": an active payment of 300 on a demo paid charge → refused, no write (file 4).
20. "env password status is truthful": password only in env → "configured (not shown)", file untouched (file 3).
21. "strict fake catches mistakes": an injected error stops the run with no later writes; an unknown table and an invite
    call each make the run fail (file 6).
22. "existing demo user with foreign access": a marked demo user with an unrelated membership and a changed password
    hash → refused, `updateUserById` never called, no password written (files 3-4).
23. "waived month stays waived": a waived `M0-2` charge → no status change, no payment; with an active payment → refused (4).
24. "password file safety": symlink → refused; mode 0644 → refused; a refusal in §6.3 → file unchanged; an interrupted
    write (fake rename throws) → original bytes unchanged and the rerun succeeds (file 3).
25. "resume after a crash": a run failing after several graph writes, then a rerun, gives the same rows as a clean run,
    with no duplicates (files 3-4).
26. "photo name match is exact": an unrelated object with a similar name does not stop the upload (file 4).
27. "December to January": `now` in December then January keeps month keys, ids and charge lookups consistent (file 4).

## 9. Report format
Status (PASS/FAIL); files changed with line counts; the pin test result before and after the move; test count;
the commands from §7 with results; any deviation, with its reason. Token usage.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Change only §5 files. No new dependencies (`node:crypto`, `node:zlib`, `node:fs`, `node:test` and supabase-js only).
- No SQL, migrations or schema changes. Never run either seed, including `--dry-run`, against production or any database.
- Never read, print or commit `.env.local` values. Use env var names only; never invent emails or URLs (L-012, L-020).
- Lines ≤ 140 characters; every new file ≤ 500 lines (the existing smoke seed only shrinks); smoke behavior pinned (L-014).
