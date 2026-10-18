# Manager plan billing — design rev 3 (2026-10-18) — rev 1 → 3 critics → rev 2 → ChatGPT REJECT (12 REQUIRED) → rev 3

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
  `created_at` (then id) among the cycle. Implemented as one SQL function (recursive CTE, depth ≤ 50).
- **Payers of H** = distinct `payer(H, M)` over active rows. Every managed home has ≥ 1 payer. A home counts once per
  payer. **Billable doors(P)** = Σ doors(H) over homes where P is a payer. **Quantity(P)** = 0 if billable doors = 0,
  else `max(billable_doors, 10)`.
- **Team seat:** M has an active row on H and `payer(H, M) ≠ M`.

## 3. Plan state (one SQL function, exact precedence)
1. `comped` — `comped and (comped_until is null or now() < comped_until)`.
2. `past_due` — `past_due_since is not null and now() < past_due_since + 7 days` (writable; wins over Stripe "active").
3. `read_only` — `past_due_since is not null and now() ≥ past_due_since + 7 days` (the cron also cancels, §5).
4. `active` — `subscription_status in ('active','trialing') and past_due_since is null` (Stripe `trialing` = the
   charge-eligibility delay of §4, still "active" to Domus).
5. `no_homes` — 0 billable doors and no team seats (also: no billing row).
6. `team_seat_only` — 0 billable doors, ≥ 1 team seat.
7. `trialing` — `now() < trial_ends_at`.
8. `read_only` — everything else.

## 4. Charge eligibility (server-enforced, Stripe-enforced)
- `manager_billing.charge_eligible_at` = the latest of: `trial_ends_at`; `billing_launched_at + 30 days` (existing
  managers); `comped_until + 30 days` (expired comps); `terms_live_at` (from `BILLING_TERMS_LIVE_AT`, unset = never).
- **Start plan** refuses when `terms_live_at` is unset, and otherwise creates the subscription with
  `subscription_data.trial_end = charge_eligible_at` when that is in the future — **Stripe itself cannot charge before
  it.** Domus treats that Stripe `trialing` as `active` (plan started).

## 5. Stripe: durable intents + idempotency (no lock spans Stripe I/O)
- **Tables:** `manager_billing` (§3/§4 fields + `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`,
  `current_period_end`, `cancel_at_period_end`, `past_due_since`, `desired_quantity`, `synced_quantity`,
  `sync_needed_at`, `sync_claimed_at`, `sync_version int`, `last_stripe_request_id`); `billing_checkout_intents (id,
  manager_profile_id, created_at, stripe_session_id, status)`; `stripe_webhook_events (event_id pk, type, livemode,
  status processing|done, claimed_at, attempts, done_at)`.
- **Sync marking in the database:** triggers on `property_managers`, `units`, `properties` (active/insert/delete) call
  `mark_billing_sync(affected payers before ∪ after)` in the same transaction as the access change — sets
  `sync_needed_at = now()`, `sync_version += 1`. No Stripe call happens inside an access change.
- **Sync worker** (cron every 5 min + a best-effort kick after access actions): claims rows with
  `update … set sync_claimed_at = now() where sync_needed_at is not null and (sync_claimed_at is null or < now()-10 min)
  returning *` (atomic claim). Computes quantity; Stripe `POST /subscriptions/:id` with item quantity, and
  `cancel_at_period_end = (quantity = 0)` — **so a return from 0 doors clears the cancellation** — `proration_behavior
  =none`, `Idempotency-Key: mgr-qty:<sub>:<sync_version>`; on success writes `synced_quantity`, clears
  `sync_needed_at` only if `sync_version` is unchanged (compare-and-set), else leaves it for the next pass. Failure:
  release the claim; retry next pass. Reconciliation report (Claude command): Domus quantity vs Stripe quantity.
- **Customer:** `Idempotency-Key: mgr-cust:<manager_id>` (fixed params: metadata only); compare-and-set
  `stripe_customer_id where … is null`; a lost race reads the winner's id.
- **Checkout:** refuse if a live subscription exists (`active|trialing|past_due|incomplete`); insert a checkout intent
  (unique open intent per manager — a second click returns the same intent); create the session with
  `Idempotency-Key: mgr-checkout:<intent_id>`, `expires_at` +30 min, `subscription_data.metadata.manager_profile_id`,
  `trial_end` per §4; reuse an open session.
- **Duplicate subscription** (webhook sees a second live subscription for the manager): cancel the newer one
  (`Idempotency-Key: mgr-dup:<sub_id>`), log `[billing] duplicate_sub`.
- **Webhooks:** raw body bytes; parse `Stripe-Signature`; accept if **any** `v1` matches (timing-safe) and `|now - t|`
  ≤ 300 s; reject if `event.livemode` ≠ key mode. **Atomic claim:** `insert … (event_id, status 'processing') on
  conflict do nothing`; if no row inserted and the existing row is `processing` and older than 10 min, reclaim it
  (`attempts += 1`); if `done`, return 200. Process; on success set `done`; on failure delete the claim (Stripe retries
  → reprocessed). For every subscription-related event (`checkout.session.completed` subscription mode,
  `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`): **re-fetch** the subscription
  (`GET /v1/subscriptions/:id`); ignore it unless its price is `STRIPE_MANAGER_PRICE_ID` **and** it is the manager's
  current `stripe_subscription_id` (or the first one, which becomes current); write `subscription_status`,
  `current_period_end`, `cancel_at_period_end`; set `past_due_since = coalesce(past_due_since, now())` when Stripe status
  is `past_due|unpaid`; clear it only when status is `active|trialing` **and** the latest invoice is paid. Old or
  duplicate subscriptions never overwrite current state.
- **Past-due cron:** cancels a current subscription 7 days after `past_due_since` (`Idempotency-Key: mgr-pastdue:<sub>`).
- **Account deletion:** a 238b job step cancels the current subscription immediately (`mgr-del:<sub>`) and deletes the
  customer (idempotent).
- Portal config (Claude): payment method + invoices + cancel at period end only. `Stripe-Version` pinned on new calls.
  Persist `Request-Id` on failed billing calls.

## 6. Read-only enforcement
- **6.1 UI (primary):** pages render with the plan state; read-only managers see everything; edit controls disabled with
  "Start your plan to make changes." (web) / "Changes are paused for now." (app).
- **6.2 Database (truth):** `AS RESTRICTIVE` policies `not public.is_read_only_manager()` on every manager-writable
  business table/op (rev 2 §1 list). **Allowlist audited by data effect:** 240a lists, for each allowlisted action, every
  table, bucket and RPC it writes, and proves none is under a restrictive policy (messages tables, profiles, notification
  prefs, AI consent, deletion requests, wipe, billing). **Inventory test** (SQL, in the suite and `/ship` C-checks):
  fails if any table grants INSERT/UPDATE/DELETE to `authenticated` with a policy a manager can satisfy, without a
  restrictive billing policy or an entry in the allowlist-exemption table.
- **6.3 Server backstop:** `requireAuth` reads role + billing row in its existing query; for a manager server action
  (`next-action` header or a form-content-type POST) in `read_only`, throws `ReadOnlyManagerError` (fails open on lookup
  error). The 8 client catch sites show "Changes are paused. Start your plan to make changes."; elsewhere the error page
  is acceptable because 6.1 and 6.2 already apply.
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
  sync triggers, RLS restrictive + inventory test, grants), SQL suite + two-session races (Claude); Codex:
  `lib/manager-billing/*`, Stripe Billing client (idempotency, version, request-id), Start plan / Portal actions (dark),
  webhook branch + atomic claim + signature hardening, sync worker + past-due cron, deletion step.
- **240b (L3):** requireAuth backstop + allowlist + catch sites, plan state in pages + disabled controls, Settings →
  Billing, banners, iPhone suppression, Terms plan text (owner approves), listing + App Review notes + manager demo seed
  (Claude), Test Clock lifecycle walk, owner switch.
