# Manager plan billing — design rev 5 (2026-10-18) — … → rev 4 (metered) REJECT (8) → owner: Domus-run monthly invoices → rev 5

## 0. Owner decisions (2026-10-18, `docs/agent-handoff.md`)
- Free for self-managing landlords and tenants. **Manager plan: $1.50/door/month, $15 minimum, billed on the website.**
- Co-managers: **the inviting manager pays** (team seats). **Downstream: the original payer pays** — a whole team on a
  home costs its payer once, whoever invited whom. No plan: **30-day trial, then read-only**. Alia: **free forever**.
- Terms: 30 days' notice before charging; 30 days' notice before price changes.
- **Mechanism (owner, 2026-10-18): Domus-run monthly invoices from a fixed monthly snapshot** — no Stripe subscription,
  no meter. Claude decisions inside it: calendar months (UTC); doors counted at the end of the month; only full months
  are billed (the first billed month is the first one that starts on or after `charge_eligible_at`); billing in arrears
  (the invoice for October is made on November 1).
- Claude decisions (recorded): managers an **owner** adds directly to one home are separate businesses → each pays. A
  read-only manager may still message, edit their profile and notification settings, give Ask Domus consent, delete or
  wipe their own account, use billing, and run the five read actions in §6.4. When a temporary comp ends, the manager
  gets a fresh **30-day** trial (the notice period; no other trial length exists).

## 1. Facts (research + critics + ChatGPT, verified 2026-10-18)
- **Apple:** primary rationale **3.1.3(f)** — a free stand-alone companion to a paid web tool needs no IAP "provided
  there is no purchasing inside the app, or calls to action for purchase outside of the app" (the listed services are
  examples). 3.1.3(c) is secondary. The iPhone app shows **no price, no billing tab, no checkout, no portal, no buy CTA,
  no link out**; billing actions refuse the `DomusApp/1` user agent. App Review gets a **manager demo account** (comped)
  and notes explaining the web-only plan. Rent stays 3.1.3(e).
- The app web view sends `DomusApp/1` (`capacitor.config.ts:25`; `lib/native-app-server.ts:7`). In-app paths to a future
  price: `/login` logo → `/marketing`; `/terms` (help menu, sign-up, account settings).
- Stripe: REST via `fetch`, no SDK/version/idempotency/Billing/events table. One live webhook endpoint (4 events today).
- `inviteManager` → existing manager uses `manager_grant_homes` (no invitation row); new invitee rows are `pending`
  with active access until sign-in (237c-5).
- Managers can write directly via PostgREST under RLS on 14 tables (rev 2 §1 list); no storage write policies exist.
- Supabase server code uses PostgREST/RPC over HTTP: a Postgres advisory lock lives only inside one RPC transaction and
  **cannot span a Stripe request**. Concurrency therefore uses durable state + Stripe idempotency (§5).

## 2. Definitions
- **Doors of home H** (active home): `greatest(1, count(active units))`; inactive home: 0.
- **Grant source:** `property_managers.granted_by uuid null` = the manager whose action created or reactivated the row
  (set by `manager_invite_grant` / `manager_grant_homes` when the caller is a manager; never overwritten on an already
  active row); `null` for owner adds, client sync, the trigger, and all rows before this migration.
- **Payer of a row** `payer(H, M)`: walk `granted_by` up from M on H while the granter has an active row on H and role
  `manager`; the first row with `granted_by` null, or whose granter no longer qualifies, is the **root**; the root's
  manager pays. A revisited manager (cycle) stops the walk; the payer is then the manager with the earliest
  `created_at` (then id) among the cycle. Implemented as one SQL function (recursive CTE). **Overflow / invalid chain
  (rev 4):** if the walk exceeds 50 steps, or hits a row it cannot resolve (missing profile, non-manager granter that is
  not null), the function returns payer **NULL with reason `unresolved`** — that home bills **no one** (never a guessed
  payer), is listed by the C5 diagnostic and logged `[billing] payer_unresolved`. Tests pin chains of 50 (resolves) and
  51 (unresolved), a cycle, an inactive middle link, and a reactivated row (its `granted_by` is the reactivating actor).
- **Payers of H** = distinct `payer(H, M)` over active rows. Every managed home has ≥ 1 payer, except an
  `unresolved` chain (bills no one, §2 overflow). A home counts once per payer. **Billable doors(P)** = Σ doors(H) over homes where P is a
  payer. Monthly amount: §5.3 ($15 minimum; 0 doors →
  no invoice).
- **Team seat:** M has an active row on H and `payer(H, M) ≠ M`.

## 3. Three separate things (round 3 REQUIRED 3)
- **Enrollment:** the manager saved a card (Checkout `mode=setup`) and it is the customer's default payment method.
- **Coverage of a month:** that month's snapshot is `paid`, `zero` (0 doors), `comped`, or `not_billed` (before the
  first billed month). Coverage is history; it never grants write access by itself.
- **Write entitlement (plan state, one SQL function, precedence):**
  1. `terminated` — `terminated_at` set (account deletion, §5.8). 2. `comped` — comp flag (until `comped_until`).
  3. `read_only` — any snapshot `invoiced` whose invoice is unpaid **7 days after its due date** (`past_due_since + 7
  days ≤ now()`). 4. `past_due` — an unpaid invoice within those 7 days (writable). 5. `enrolled` — card on file.
  6. `no_homes` — 0 billable doors, no team seats. 7. `team_seat_only` — 0 billable doors, ≥ 1 team seat.
  8. `trialing` — `now() < trial_ends_at`. 9. `read_only`.
  Paying the late invoice (hosted invoice page or a new card in the Portal) clears `past_due_since` → back to
  `enrolled`. Comp ON voids nothing already paid; it stops future snapshots from billing (status `comped`).

## 4. Charge eligibility and price changes
- `charge_eligible_at` = latest of `trial_ends_at`, `billing_launched_at + 30 days`, `comped_until + 30 days`,
  `terms_live_at` (`BILLING_TERMS_LIVE_AT`, unset = never). **No snapshot may bill a month that starts before it**
  (status `not_billed`) — enforced in the snapshot function, not the UI.
- Price changes: `price_change_notices` from rev 4 (per-account `notified_at`, `effective_at = notified_at + 30 days`).
  A snapshot uses the price in effect for **that manager** at the start of the month. No change planned.

## 5. Monthly snapshot → one invoice
- **5.1 Snapshot (immutable, identifiable):** `manager_billing_periods (id, manager_profile_id, period 'YYYY-MM',
  snapshot_at, billable_doors, homes_json, unit_price_cents, minimum_cents, amount_cents, status pending|zero|comped
  |not_billed|terminated|invoiced|paid|void|uncollectible, stripe_invoice_id, stripe_invoice_item_id, step, attempts,
  last_error, past_due_since)`, `unique (manager_profile_id, period)`. Created by `create_billing_snapshot(manager,
  period)` with `insert … on conflict do nothing` — the **first** snapshot for a manager-month wins forever. A trigger
  forbids changing `billable_doors`, `homes_json`, prices or `amount_cents` after insert (only status/step/ids/errors
  move). `homes_json` lists each home, its doors and why it is billed (payer evidence) — the audit record.
- **5.2 Cutoff (round 3 REQUIRED 1):** the snapshot for month M is taken by the job at or after **00:00 UTC on day 1
  of M+1** and counts doors **as of that instant** (end of M), using `manager_billable_doors(manager)` evaluated in one
  statement. A manager first eligible mid-month is `not_billed` for that month.
- **5.3 Amount:** 0 billable doors → `amount 0`, status `zero`, **no invoice** (no stray $15). Otherwise
  `amount = max(doors, 10) × unit_price` (`$15` minimum). Comped → `comped`, no invoice. Terminated → `terminated`.
- **5.4 Invoice (retryable, resumable):** for `pending` rows with amount > 0, the job (daily from day 1 until done)
  runs steps, each with its own Idempotency-Key derived from the snapshot id, saving the id after each:
  (1) `POST /v1/invoices` (`customer`, `collection_method=charge_automatically`, `auto_advance=false`,
  `pending_invoice_items_behavior=exclude`, `metadata.snapshot_id`, `metadata.period`) — key `mgr-inv:<snapshot>`;
  (2) `POST /v1/invoiceitems` (`invoice`, `amount=amount_cents`, `currency=usd`, description "Domus Manager plan —
  October 2026 — 12 doors") — key `mgr-ii:<snapshot>`; (3) `POST /v1/invoices/:id/finalize` — key `mgr-fin:<snapshot>`;
  (4) `POST /v1/invoices/:id/pay` — key `mgr-pay:<snapshot>`. Params are fixed by the immutable snapshot, so a retry
  sends identical params. A row is claimed with a lease (`step_lease_until`, 5 min; Stripe timeout 20 s). After step 4
  status `invoiced`; `invoice.paid` → `paid`. Nothing in this path mutates anything shared between two snapshots, so
  no cross-request ordering exists to protect (each snapshot owns its own invoice).
- **5.5 Webhooks:** rev 3 signature rules (raw body, any valid `v1`, timing-safe, ±300 s, livemode) and the atomic
  claim table with stale reclaim. Handle `invoice.paid`, `invoice.payment_failed`, `invoice.voided`,
  `invoice.marked_uncollectible`, `checkout.session.completed` (setup mode), `setup_intent.succeeded`,
  `payment_method.detached`. Match an invoice **only** by `metadata.snapshot_id` and the stored `stripe_invoice_id`;
  re-fetch the invoice (`GET /v1/invoices/:id`) and write its status. `past_due_since = coalesce(…, due/attempt
  failed time)` on failure; cleared on paid. Unknown or foreign invoices are ignored.
- **5.6 Card on file (Start plan):** web only; refuses `DomusApp/1`, `terms_live_at` unset, `comped`, `terminated`.
  Customer created once (`mgr-cust:<manager>`, compare-and-set). Checkout `mode=setup`, `customer`,
  `setup_intent_data.metadata.manager_profile_id`, `expires_at` +30 min, through the checkout-intent state machine of
  rev 4 §5.4 (same-key recovery, expire-and-replace). On completion set the default payment method; state `enrolled`.
  Portal: payment methods + invoice history only.
- **5.7 Unresolved payer chains (round 3 REQUIRED 6):** an unresolved chain removes only **that chain's** obligation on
  that home; independent payers on the same home (owner-added managers, other resolved chains) still bill it. The
  snapshot's `homes_json` marks the unresolved home; the C5 diagnostic lists it for Claude.
- **5.8 Termination fence:** deletion sets `terminated_at` first; snapshot/invoice/customer/checkout writes predicate on
  `terminated_at is null`; then the job voids every open (draft or unpaid) Domus invoice of the customer, expires open
  checkout sessions, deletes the customer. Late webhooks only record; they never restore.
- **5.9 Test-mode proof (round 3 REQUIRED 7, before 240a dispatch):** with Stripe Test Clocks: setup-mode Checkout saves
  a default card; invoice create → item → finalize → pay succeeds; each step retried with the same key returns the same
  object; a declined card → `invoice.payment_failed` → `past_due_since`; 7 days → read-only; paying the hosted invoice →
  paid → `enrolled`; 0-door month → no invoice; terminated → voided. Results recorded in this doc.
- **5.10 API version (round 3 REQUIRED 8):** no subscription or `current_period_*` fields are used anywhere; billing
  calls pin one `Stripe-Version` (the latest at build time, recorded) on invoices, items, customers, setup Checkout and
  the Portal.

## 6. Read-only enforcement
- **6.1 UI (primary):** pages render with the plan state; read-only managers see everything; edit controls disabled with
  "Start your plan to make changes." (web) / "Changes are paused for now." (app).
- **6.2 Database (truth):** `AS RESTRICTIVE` policies `not public.is_read_only_manager()` on every manager-writable
  business table/op (rev 2 §1 list). **Allowlist audited by data effect:** 240a lists, for each allowlisted action, every
  table, bucket and RPC it writes, and proves none is under a restrictive policy (messages tables, profiles, notification
  prefs, AI consent, deletion requests, wipe, billing). **Inventory test** (SQL, in the suite and `/ship` C-checks):
  fails if any table grants INSERT/UPDATE/DELETE to `authenticated` with a policy a manager can satisfy, without a
  restrictive billing policy or an entry in the allowlist-exemption table.
- **6.3 Server enforcement (D, explicit per operation):** every manager-callable mutation that writes with service-role
  credentials or privileged SQL calls `requireManagerWrite(userId)` (or, for allowlisted actions, nothing extra). No
  request-header heuristics. **Inventory (240a, Claude + Codex):** every exported server action, API route
  (`POST|PUT|PATCH|DELETE`), cron-triggerable endpoint and RPC reachable by a manager session, with what it writes.
  **Guard test (future-proof):** a static test walks `app/actions/**/*.ts` and `app/api/**/route.ts`; any export reachable
  by role `manager` that writes must call `requireManagerWrite` or be listed in `billing-allowlist.ts` with a reason —
  else the test fails. `requireManagerWrite` throws `ReadOnlyManagerError`; on a plan-lookup error it fails **closed**
  (round 3 REQUIRED 5): the write is refused with "We could not check your plan. Try again in a minute." and
  `[billing] plan_lookup_failed` alerts (Sentry). Allowlisted actions never call it, so messages, profile, settings,
  billing and deletion keep working during a billing outage. RLS (6.2) also fails closed. The 8 client catch sites show "Changes are
  paused. Start your
  plan to make changes."
- **6.4 Allowlist** (exact exports): as rev 2 §5.4 (messages ×3, profile ×3, deletion request, self-wipe, notification
  ×5 + preferences ×3, AI consent ×2, the five reads, billing actions).

## 7. UI and copy (≤ 12 words per sentence; rev 2 §6 copy unchanged)
- Web Settings → Billing, banners, buttons **Start plan** / **Change card or plan** as rev 2. During the Stripe delay:
  "Your plan starts Nov 17. No charge before then."
- iPhone (`DomusApp/1`, server-side): no Billing tab, no prices on `/marketing` or `/terms` ("Plan prices are on our
  website." — no link), billing actions refuse. Listing: "Free for landlords and tenants." App Review: comped manager
  demo account + notes citing 3.1.3(f).

## 8. Rollout (dark until complete)
- `BILLING_ENABLED` env (default off): when off, no trial rows, no gate, no billing UI, no Stripe calls; the snapshot job
  does nothing. 240a ships dark. Turn on only after 240b, Terms with plan text live (`BILLING_TERMS_LIVE_AT`), the
  live Stripe Portal + webhook config, and the §5.9 Test Clock lifecycle proof. Owner approves the switch.

## 9. Sprints
- **240a (L3):** migration (tables, `granted_by` + 237c-5 function updates, payer/doors/state/eligibility functions,
  RLS restrictive + inventory test, grants), SQL suite + two-session races (Claude); Codex:
  `lib/manager-billing/*`, Stripe invoices client (idempotency, version, request-id), Start plan (setup Checkout) / Portal (dark),
  webhook branch + atomic claim + signature hardening, monthly snapshot + resumable invoice job (lease) + C5 report,
  checkout-intent state machine (setup mode), termination fence + deletion step, `requireManagerWrite` + guard test.
- **240b (L3):** requireAuth backstop + allowlist + catch sites, plan state in pages + disabled controls, Settings →
  Billing, banners, iPhone suppression, Terms plan text (owner approves), listing + App Review notes + manager demo seed
  (Claude), Test Clock lifecycle walk, owner switch.
