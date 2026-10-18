# Manager plan billing — design rev 4 (2026-10-18) — rev 1 → 3 critics → rev 2 → ChatGPT REJECT (12) → rev 3 → REJECT (7) → rev 4

## 0. Owner decisions (2026-10-18, `docs/agent-handoff.md`)
- Free for self-managing landlords and tenants. **Manager plan: $1.50/door/month, $15 minimum, billed on the website.**
- Co-managers: **the inviting manager pays** (team seats). **Downstream: the original payer pays** — a whole team on a
  home costs its payer once, whoever invited whom. No plan: **30-day trial, then read-only**. Alia: **free forever**.
- Terms: 30 days' notice before charging; 30 days' notice before price changes.
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
  `unresolved` chain (bills no one, §2 overflow). A home counts once per payer. **Billable doors(P)** = Σ doors(H) over homes where P is a payer. **Reported doors(P)** = billable doors (the
  metered price in §5.1 applies the $15 minimum; 0 doors for a whole period → cancel at period end, §3).
- **Team seat:** M has an active row on H and `payer(H, M) ≠ M`.

## 3. Entitlement and plan state (one SQL function, exact precedence)
- **Paid-through:** `entitled_until = current_period_end` while Stripe status is `active|trialing|past_due`, including
  `cancel_at_period_end = true` (the manager paid for this period). After cancellation completes (`canceled`), it stays
  the last `current_period_end`. A comp never extends it.
1. `terminated` — `terminated_at is not null` (account deletion; §5.7). No billing action, no access change by billing.
2. `comped` — `comped and (comped_until is null or now() < comped_until)`.
3. `past_due` — `past_due_since is not null and now() < past_due_since + 7 days` (writable).
4. `read_only` — `past_due_since is not null and now() ≥ past_due_since + 7 days` (the cron cancels collection, §5.5).
5. `paid` — `now() < entitled_until` (covers active, trialing-delay, and cancel-at-period-end until the period ends).
6. `no_homes` — 0 billable doors and no team seats (also: no billing row).
7. `team_seat_only` — 0 billable doors, ≥ 1 team seat.
8. `trialing` — `now() < trial_ends_at`.
9. `read_only` — everything else.
- **Comp transitions:** comp ON for a subscriber → set `cancel_at_period_end = true` at once (collection stops after the
  period already paid); state is `comped` immediately. Comp OFF (or `comped_until` passes) → fresh 30-day trial
  (§4 eligibility applies). Collection after a comp needs a new **Start plan**.
- **Zero doors:** quantity is never sent (§5); at period close the daily job sets `cancel_at_period_end = true` if the
  manager had 0 billable doors for the whole period, and clears it if doors returned before the period ended.

## 4. Charge eligibility (server-enforced, Stripe-enforced)
- `manager_billing.charge_eligible_at` = the latest of: `trial_ends_at`; `billing_launched_at + 30 days` (existing
  managers); `comped_until + 30 days` (expired comps); `terms_live_at` (from `BILLING_TERMS_LIVE_AT`, unset = never).
- **Start plan** refuses when `terms_live_at` is unset, and otherwise creates the subscription with
  `subscription_data.trial_end = charge_eligible_at` when that is in the future — **Stripe itself cannot charge before
  it.** Domus treats that Stripe `trialing` as `paid` (plan started, `entitled_until` = trial end).
- **Price changes (G):** Stripe Prices are immutable; a new price is a new Price. Table `price_change_notices
  (manager_profile_id, from_price_id, to_price_id, notified_at, channel, effective_at)` with `effective_at = notified_at
  + 30 days`; `notified_at` is written only when a notice is actually shown in the app or delivered by email to **that**
  manager (per-account proof; Terms publication alone does not count). A job moves a subscription to the new price only
  when `now() ≥ effective_at`; without a notice row it never moves. A retired price keeps billing existing subscribers
  until their own effective date. No price change is planned; the table and job ship with 240b, unused.

## 5. Stripe (rev 4: metered "last" usage — no subscription quantity writes)
- **5.1 Price model:** one Billing **Meter** (`event_name = domus_manager_doors`, `default_aggregation.formula = last`,
  customer mapping by id; API `2025-03-31` or later). One metered **Price** on it, `billing_scheme = tiered`,
  `tiers_mode = graduated`: tier 1 `up_to 10`, `flat_amount 1500`, `unit_amount 0`; tier 2 `up_to inf`,
  `unit_amount 150`. → 1-10 doors = $15, 11 doors = $16.50, ... Usage is billed **in arrears** at period end on the
  last reported door count — the owner-approved once-per-cycle model.
- **5.2 Reporting (single writer, ordered):** one daily job (and a final run 1 hour before `current_period_end`) per
  current subscription. It takes a **DB lease** `update manager_billing set report_lease_token = gen_random_uuid(),
  report_lease_until = now() + 5 min where … and (report_lease_until is null or report_lease_until < now()) returning
  report_lease_token`; only the holder reports. Stripe calls use a **20 s timeout** (≪ 5 min lease), so a stale writer's
  request is finished or abandoned long before another lease is granted; the daily cadence means two reports for one
  manager never overlap in practice. Meter event: `{event_name, payload: {stripe_customer_id, value: billable_doors},
  timestamp: <computed_at>, identifier: "doors:<manager>:<subscription>:<YYYY-MM-DD>"}` — Stripe rejects a duplicate
  identifier (≥ 24 h), and the day-keyed identifier makes a same-day retry a no-op. After each report: write
  `last_reported_doors`, `last_reported_at` with compare-and-set on the lease token. **Verify:** a reconciliation report
  (Claude command + C5) compares Domus door counts with Stripe meter event summaries for the current period; drift
  still unresolved 24 h before period end raises `[billing] usage_drift` (Sentry).
- **5.3 Pre-build C-check (Claude, Stripe test mode, before 240a dispatch):** prove (a) `last` uses the latest event
  in the period when events arrive out of timestamp order (and record which ordering applies); (b) graduated tier-1
  `flat_amount` with usage 0 vs 1 (does 0 bill $15?); (c) duplicate identifier → 400; (d) metered price + `trial_end`
  bills nothing for the trial. If (a) is arrival-order, §5.2's single writer already satisfies it; if (b) bills $15 at
  0, §3's zero-door cancel stands as written.
- **5.4 Checkout intent state machine:** `billing_checkout_intents (id, manager_profile_id, status pending|open|completed
  |expired|failed, idempotency_key, stripe_session_id, session_url, params_hash, created_at, updated_at)`; one row with
  status `pending|open` per manager (partial unique index). Start plan: if an `open` intent's session is unexpired →
  return its URL. If a `pending` intent exists (a create that timed out) → re-call Stripe with **the same
  idempotency key and identical params** (metered line item has no quantity, so params are stable) → Stripe returns the
  original session → save as `open`. If params must differ (e.g. `charge_eligible_at` changed) → expire the old
  session (`POST /checkout/sessions/:id/expire`) and mark the intent `failed`, then a new intent. Webhooks:
  `checkout.session.completed` → `completed`; `checkout.session.expired` → `expired`. A cron fails `pending` intents
  older than 1 h. **Orphan recovery** (daily): list subscriptions on our price per customer; attach the oldest live one
  to a manager with none; cancel any other (`mgr-dup:<sub>`), log `[billing] orphan_sub`.
- **5.5 Webhooks** (rev 3 rules kept): raw body, any valid `v1`, timing-safe, ±300 s, livemode check; atomic claim
  table with stale reclaim; re-fetch the subscription; act only on our price and the manager's current subscription;
  `past_due_since` from Stripe status; never touch a `terminated` row (§5.7) except to cancel. **Past-due cron**
  cancels collection 7 days after `past_due_since` (`mgr-pastdue:<sub>`).
- **5.6 Customer creation** under compare-and-set (`mgr-cust:<manager>`); refused when `terminated`.
- **5.7 Termination fence (account deletion, F):** the 238b deletion job **first** sets `manager_billing.terminated_at`
  (one UPDATE). Every billing write path includes `terminated_at is null` in its own UPDATE/INSERT predicate, so a
  checkout, customer create, report or webhook write that loses the race changes nothing. Then the job: lists **all**
  subscriptions of the customer and cancels each immediately (`mgr-del:<sub>`), expires open checkout sessions, marks
  intents `failed`, deletes the customer. Late webhooks for a terminated manager only record the event and, if a live
  subscription appears, cancel it; they never restore access or rows.
- Portal config: payment method + invoices + cancel at period end only. `Stripe-Version` pinned; `Request-Id` stored on
  failures.

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
  else the test fails. `requireManagerWrite` throws `ReadOnlyManagerError`; it fails **open** on a plan-lookup error
  (logged), while RLS (6.2) fails closed for direct writes. The 8 client catch sites show "Changes are paused. Start your
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
- `BILLING_ENABLED` env (default off): when off, no trial rows, no gate, no billing UI, no Stripe calls; triggers only
  mark sync rows. 240a ships dark. Turn on only after 240b, Terms with plan text live (`BILLING_TERMS_LIVE_AT`), the
  live Stripe Product/Price/Portal/webhook config, and a full lifecycle test with Stripe **Test Clocks** (trial end →
  charge-eligible → paid → failed → 7-day read-only → recovery → zero doors → back → cancel → deletion). Owner approves
  the switch.

## 9. Sprints
- **240a (L3):** migration (tables, `granted_by` + 237c-5 function updates, payer/doors/state/eligibility functions,
  RLS restrictive + inventory test, grants), SQL suite + two-session races (Claude); Codex:
  `lib/manager-billing/*`, Stripe Billing client (idempotency, version, request-id), Start plan / Portal actions (dark),
  webhook branch + atomic claim + signature hardening, daily usage reporter (lease) + reconciliation + past-due cron,
  checkout-intent state machine + orphan recovery, termination fence + deletion step, `requireManagerWrite` + guard test.
- **240b (L3):** requireAuth backstop + allowlist + catch sites, plan state in pages + disabled controls, Settings →
  Billing, banners, iPhone suppression, Terms plan text (owner approves), listing + App Review notes + manager demo seed
  (Claude), Test Clock lifecycle walk, owner switch.
