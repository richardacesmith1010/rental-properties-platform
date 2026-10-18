# Manager plan billing — design rev 2 (2026-10-18) — rev 1 → 3 critics (6 blockers, ~20 should-fix) → rev 2

## 0. Owner decisions (2026-10-18, `docs/agent-handoff.md`)
- Free for self-managing landlords and tenants. **Manager plan: $1.50/door/month, $15 minimum, billed on the website.**
- Co-managers: **the inviting manager pays** (team seats). No plan: **30-day trial, then read-only**. Alia: **free forever**.
- Terms: 30 days' notice before charging; 30 days' notice before price changes.
- Claude decisions (recorded): two managers an **owner** adds directly to one home are separate businesses → each pays for
  it. A read-only manager may still message, edit their profile, change notification settings, use Ask Domus consent,
  delete or wipe their own account, and run the five read actions in §5.4.

## 1. Facts (research + critics, verified 2026-10-18)
- Apple (guidelines 2026-10-16): iPhone app shows **no price, no subscribe button, no link out**; managers subscribe on the
  web (3.1.3(c) business sales; risk: written for organizations — fallback is IAP if rejected). Rent stays 3.1.3(e).
- The app's web view sends `DomusApp/1` in the user agent (`capacitor.config.ts:25`; `lib/native-app-server.ts:7`).
  `checkout.stripe.com` opens inside the app (`NavigationPolicy.swift:9-11`); `billing.stripe.com` would open Safari.
  In-app paths to a future price: `/login` logo → `/marketing`; `/terms` linked from help menu, sign-up, account settings.
- Stripe: REST via `fetch`, no SDK, no pinned version, no Billing, no idempotency keys, no processed-events table.
  Webhook signature check reads one `v1` and compares non-constant-time. `handleCheckoutSessionCompleted` returns
  "received" for sessions without `charge_id` (`lib/stripe-webhook-handlers.ts:973-980`).
- `inviteManager` → existing confirmed manager uses `manager_grant_homes` (no invitation row, `assigned_directly=true`,
  `app/actions/invitations.ts:90-92`); new invitee rows are `pending` with **active access** until sign-in.
- Managers can write directly through PostgREST under RLS (`can_administer_property`): `properties` UPDATE (incl.
  `active`), INSERT on `units`, `leases`, `rent_charges`, `vendors`, `inbox_threads`, `rent_increase_history`,
  `maintenance_status_history`, `screening_reports`; INSERT/UPDATE on `document_packets`, `rental_listings`,
  `rental_applications`, `automation_rules`; I/U/D on `document_templates`. No storage write policies exist.
- Next 15.5 treats a POST with `next-action` **or** a form content type as a server action. Five manager **reads** run as
  server actions (§5.4). 8 client components catch action errors and would swallow a `redirect()`.
- `requireAuth` already does `auth.getUser` + an uncached `profiles.select("role")`.
- Live: 11 managers (10 test + Alia's), 10/18 homes have no unit rows, 0 inactive units, 1 home with 2 managers.

## 2. Definitions
- **Doors of a home H** (active): `greatest(1, count(active units of H))`. Inactive homes: 0.
- **Grant source:** new column `property_managers.granted_by uuid null` — the manager whose action gave the access
  (set by `manager_invite_grant` and `manager_grant_homes` when the caller is a manager); `null` for owner adds, client
  sync, trigger, and every row before this migration.
- **Team seat:** M is a team seat on H iff `pm(H,M).active` and `pm.granted_by = P`, P's role is `manager`, and P is a
  payer of H. **Payers of H** = managers with an active row on H who are not team seats there. If that set is empty
  (the inviter left, a chain whose root left, or a cycle), the payer is the active manager with the earliest grant on H
  (`created_at`, then id). Every managed home has ≥ 1 payer; a home counts **once per payer**.
- **Billable doors of M** = sum of doors over homes where M is a payer. **Quantity** = 0 when billable doors = 0, else
  `max(billable_doors, 10)` (the $15 minimum = 10 × $1.50).
- **Plan state** (precedence top-down): `comped` (flag, until `comped_until` if set) → `active` (subscription active) →
  `past_due` (≤ 7 days since `past_due_since`) → `no_homes` (0 billable doors and no team seats) → `team_seat_only` (0
  billable doors, ≥ 1 team seat) → `trialing` (now < `trial_ends_at`) → `read_only`. A manager with no billing row is
  `no_homes` until a row exists (never read-only).

## 3. Data (Claude migration)
- `manager_billing (manager_profile_id pk → profiles, trial_started_at, trial_ends_at, comped bool default false,
  comped_until, comp_reason, stripe_customer_id unique, stripe_subscription_id unique, subscription_status,
  current_period_end, past_due_since, last_quantity, updated_at)`. `revoke all … from public, anon, authenticated`;
  `grant select` to authenticated; RLS: a manager selects only their own row. Writes: service role only.
- `stripe_webhook_events (event_id pk, type, livemode, created, processed_at)` — insert **after** a successful write.
- `property_managers.granted_by` (+ the two 237c-5 functions set it; the grant-from-invite path passes the inviter).
- Functions (security invoker, `revoke execute … from public, anon, authenticated`, grant service_role):
  `manager_billable_doors(p_manager)`, `manager_plan_state(p_manager)`, `manager_billing_payers(p_property)`.
  Plus `is_read_only_manager()` — **security definer**, keyed on `auth.uid()`, used by RLS (§5.2); fails closed.
- Trial row: created by service code only, `insert … on conflict do nothing` under the per-manager advisory lock
  `domus.manager_billing:<id>`, the first time M has ≥ 1 billable door **and has signed in** (`last_sign_in_at` not
  null). Never deleted or reset. Existing managers at launch: trial starts on billing launch day (= 30-day notice).
- Comps by **fixed profile ids** in the migration (the 10 test managers, Alia with `comp_reason 'early access, owner
  2026-10-18'`). Seed scripts that create managers insert a comp row. Turning a comp on cancels any subscription at period
  end; when `comped_until` passes the manager gets a fresh 14-day trial (no instant read-only).

## 4. Stripe (web only, `Stripe-Version` pinned on new calls)
- One Product + one Price ($1.50/month per unit); ids in `STRIPE_MANAGER_PRICE_ID` (test + live). Created by Claude after
  review. Customer Portal config: payment method + invoices + **cancel at period end only** (no quantity/plan changes).
- **Start plan** (web action): refuses when the app user agent is present, when `BILLING_TERMS_VERSION` is not set (terms
  not live), when state is `comped`/`active`/`past_due`/`no_homes`/`team_seat_only`, or at 0 billable doors. Under the
  per-manager lock: create the customer once (`Idempotency-Key: mgr-cust-<id>`, compare-and-set
  `stripe_customer_id`); reuse an open Checkout session; else create `mode=subscription`, `quantity`, `expires_at`
  +30 min, `subscription_data.metadata.manager_profile_id`, no Stripe trial.
- **Change card or plan** (Portal): same refusals for the app user agent and comped.
- **Webhooks** (same route; branch on `session.mode === 'subscription'` and on subscription event types **before** the
  rent handlers): verify every `v1` signature with a timing-safe compare; reject `livemode` ≠ key mode; skip events
  already in `stripe_webhook_events`; for `checkout.session.completed` (subscription) and `customer.subscription.*`
  **re-fetch** `GET /v1/subscriptions/:id` and write that state (order-proof); ignore subscriptions whose price is not
  ours; map the manager from `metadata.manager_profile_id`; a second live subscription for the same manager → cancel the
  newer one, log `[billing] duplicate_sub`. `invoice.paid` clears `past_due_since`; `invoice.payment_failed` sets it.
  Status `incomplete|incomplete_expired|unpaid|paused|canceled` → not active. Live endpoint event list updated by Claude.
- **Quantity sync** (daily cron + after every access change for **every payer it affects**: grants, revokes, accepts at
  the callback, owner unit/home add/remove/activate): under the per-manager lock, recompute and send the full quantity
  (`proration_behavior=none`); quantity 0 → `cancel_at_period_end=true`. Webhooks never write `last_quantity`.
- **Past due:** our cron cancels a subscription 7 days after `past_due_since` (no reliance on Stripe retry settings).
- **Account deletion:** add a `manager_billing` step to the 238b deletion job: cancel the subscription immediately and
  delete the customer (idempotent). Runbook updated by Claude.

## 5. Read-only enforcement
- **5.1 UI (primary):** pages get the plan state at render. Read-only managers see everything; edit controls are
  disabled with "Start your plan to make changes." (web) / "Changes are paused for now." (app).
- **5.2 Database (truth):** for each manager-writable table/op in §1, an `AS RESTRICTIVE` policy `with check (not
  public.is_read_only_manager())` (and `using` for update/delete). Drop `active` from the `properties` UPDATE column
  grant for `authenticated` (an action changes it). Messages tables (`inbox_threads`) excluded per §0.
- **5.3 Server backstop:** `requireAuth` reads `role` + the billing row in the **same** query it already makes. If the
  role is manager, the request is a server action (`next-action` header **or** a `multipart/form-data` /
  `application/x-www-form-urlencoded` POST) and the state is `read_only`, it **returns early with an error the action
  can't proceed past**: `redirect("/manager?paused=1")` is not used (it loses drafts and 8 client catches swallow it);
  instead `requireAuth` throws a typed `ReadOnlyManagerError`. Not every action turns thrown errors into
  `{ success:false, error }` (unverified across 56 files), so a crafted or mid-session request may land on the app's
  error page; that is acceptable only because §5.1 already disables every edit control and §5.2 enforces in the
  database. The 8 client `catch` sites show "Changes are paused. Start your plan to make changes." for this error type.
  Allowlisted actions call `requireAuthAllowReadOnly`.
  Fails **open** on a lookup error (log `[billing] plan_lookup_failed`); RLS (5.2) fails closed — deliberate.
- **5.4 Allowlist** (exact exports): `inbox.ts` `createInboxThread`, `sendMessageToTenant`, `sendInboxMessage`;
  `profile.ts` `completeOnboarding`, `updateProfile`, `uploadAvatar`; `account-deletion-request.ts`
  `requestAccountDeletion`; `account-wipe.ts` (manager self-wipe); `notifications.ts` dismiss / mark read / clear all /
  mark all read / `saveNotificationPreference` (not `sendBatchPaymentReminder`); `notification-preferences.ts` (3);
  `ai-consent.ts` (2); reads `tenant-activity.ts` `getTenantActivityLog`, `announcements.ts`
  `getEstimatedRecipientCount`, `owner-statement.ts` `getOwnerStatementSummary`, `connect.ts` `getExpressDashboardUrl`;
  billing actions. `signOut`, `submitFeedback`, password (browser client) need nothing.

## 6. UI and copy (≤ 12 words per sentence)
- Web Settings → **Billing** (managers; `?tab=billing` added): trial "Free trial ends Nov 17." · active "Your plan is on."
  · past due "Your card didn't go through. Update it by Nov 24." · comped "Free for you. No card needed." · read-only
  "Your free trial ended. Start your plan to make changes." · team seat "Alia pays for these homes. You pay nothing." ·
  price "You have 4 doors. Your price is $15 a month." / "Each door is $1.50. The lowest price is $15." · per home
  "<manager> pays for this home." · buttons **Start plan**, **Change card or plan**.
- Web read-only banner: "Your free trial ended. You can still see everything." + **Start plan** button (straight to
  Billing). App banner: "You can still see everything. Changes are paused for now." No button, no link.
- **iPhone app (server-side, `DomusApp/1`):** no Billing tab; no prices on `/marketing` or `/terms` (shows "Plan prices
  are on our website." — no link); Start plan / Portal actions refuse. Listing text: "Free for landlords and tenants."
  App Review notes per research (§1); the App Review demo accounts stay owner/tenant (no manager).

## 7. Undo and money safety
- Never charge before: owner-approved Terms with plan text live (`BILLING_TERMS_VERSION` set) **and** 30 days since
  billing launch for existing managers. Comped/test/Alia never reach Checkout. Cancel = Portal (period end) or quantity 0.
  Proration off. No automatic refunds (owner handles in Stripe).

## 8. Sprints
- **240a (L3, DB + Stripe core):** migration (§3, `granted_by`, RLS restrictive §5.2, grants), SQL suite + two-session
  race (lock, trial creation, payer resolution), comps by id (Claude); `lib/manager-billing/*`, Stripe Billing client,
  Start plan / Portal actions, webhook branch + events table, quantity sync + past-due cron, deletion step (Codex).
- **240b (L3, gate + UI):** `requireAuth` backstop + allowlist + 8 catches, plan state in pages + disabled controls,
  Settings → Billing, banners, iPhone suppression (Billing tab, marketing/terms prices), Terms plan text (owner approves),
  listing + App Review notes (Claude). Then Claude creates the Stripe Product/Price/Portal config and webhook events
  (test mode first), walks it, and the owner approves going live.
