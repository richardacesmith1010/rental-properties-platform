# Manager plan billing — design (rev 1, 2026-10-18) — for critic + ChatGPT review (L3, money)

## 0. Owner decisions (2026-10-18, recorded in `docs/agent-handoff.md`)
- Free for self-managing landlords and tenants. **Manager plan: $1.50 per door per month, $15 minimum, billed on the
  website (Stripe).**
- Co-managers: **the inviting manager pays**; co-managers a manager invites are free on those homes (team seats).
- No plan: **30-day free trial, then read-only** until they subscribe. Owners and tenants are never affected.
- Alia (the one real manager today): **free forever** (comped).
- Terms: 30 days' notice before charging anyone; price changes need 30 days' notice.

## 1. Facts this design rests on (research 2026-10-18)
- Apple (guidelines updated 2026-10-16): the iPhone app may show **no price, no subscribe button, no buy link**; managers
  subscribe on domusbase.com; paid managers just sign in (3.1.3(c) business sales). Rent payments stay outside IAP
  (3.1.3(e), Stripe Connect). A US-only external link is legal today (Epic injunction) but left out (future-fee risk).
- Stripe: Domus calls the REST API with `fetch` (no SDK, no pinned `Stripe-Version`). Only Connect + payment Checkout +
  tenant autopay customers exist. **No Billing** (Products, Prices, Subscriptions, Portal, invoices). Webhook route
  `app/api/webhooks/stripe/route.ts:34-63` handles 6 event types; the live endpoint subscribes to 4.
- Data: `profiles.role` is single-valued; 11 managers, 10 are test accounts. `property_managers (property_id,
  manager_profile_id, active, assigned_directly)`; client homes are synced from `ownership_account_managers`. Homes and
  units have only `active`. **10 of 18 homes have no unit rows.** 1 live home is shared by 2 managers.
- `requireAuth` (`app/actions/auth-helpers.ts`) is called 148 times in 56 server-action files.

## 2. Definitions
- **Door:** an active unit on an active home. A home with no unit rows counts as **1 door** (so every managed home costs
  at least one door).
- **Billable doors for manager M:** doors on every active home where M has an active `property_managers` row, **except**
  homes where M is a **team seat**: M's access to that home came from an invitation sent by another manager P
  (`invitations.role = 'manager'`, `invited_by = P`, status `accepted`, same home) and P still has active access there.
  Those doors bill to P. A home counts once per payer even if several of P's team seats share it.
- **Plan quantity sent to Stripe:** `max(billable_doors, 10)` units of one $1.50/month Price → the $15 minimum is exact
  (10 × $1.50) with no special invoice logic.
- **Plan state** (per manager): `trialing` (trial not over) · `active` (Stripe subscription active) · `past_due`
  (Stripe retrying; treated as active for 7 days, then read-only) · `comped` (free; forever or until a date) ·
  `read_only` (trial over, no active plan) · `team_seat_only` (every home M manages is a team seat → never billed,
  never read-only).

## 3. Data (Claude migration, service-role writes only)
- `manager_billing (manager_profile_id pk → profiles, trial_started_at, trial_ends_at, comped boolean default false,
  comped_until timestamptz null, comp_reason text, stripe_customer_id unique null, stripe_subscription_id unique null,
  subscription_status text null, current_period_end timestamptz null, last_quantity int null, updated_at)`.
  RLS on; a manager may SELECT only their own row; no client writes.
- `manager_billable_doors(p_manager uuid) returns table(property_id uuid, doors int)` — security invoker, service role
  only; the single source of truth for §2 (used by the app, the quantity sync and the C-checks).
- `manager_plan_state(p_manager uuid) returns text` — computes §2's state from `manager_billing` + doors + now.
- Trial start: the row is created (trial 30 days) the first time a manager has ≥ 1 billable door. Existing managers at
  launch: trial starts on billing launch day (this is the 30-day notice). Test accounts (`richard.ace.smith+…`,
  `manager@demo.domus.com`) and Alia: `comped = true` (Alia `comp_reason = 'early access, owner 2026-10-18'`).

## 4. Stripe (web only)
- One Product "Domus Manager plan" + one recurring Price ($1.50/month, per unit). Created once by Claude with the live
  key after review; ids stored in env `STRIPE_MANAGER_PRICE_ID` (test and live).
- **Subscribe:** Settings → Billing (web) → Checkout `mode=subscription`, `line_items[0] = {price, quantity}`,
  `customer` (created on first subscribe, `metadata.manager_profile_id`), `client_reference_id`, `subscription_data.metadata`.
  No Stripe trial (Domus already ran the trial).
- **Manage:** Stripe Customer Portal (update card, cancel at period end, invoices). Portal config created by Claude.
- **Quantity sync:** a daily cron + after any access change for M (grant, revoke, accept, home/unit add/remove) →
  `POST /subscriptions/:id` item quantity = §2 quantity, `proration_behavior=none` (changes apply next cycle, so a
  mid-month add never surprises anyone). `last_quantity` prevents no-op calls.
- **Webhooks** (same route, added cases, idempotent by event id): `checkout.session.completed` (mode subscription →
  store ids), `customer.subscription.created|updated|deleted` (status, period end), `invoice.paid`,
  `invoice.payment_failed` (status only; no emails from Domus while notifications are off — Stripe's own receipt and
  failed-payment emails are enabled in Stripe settings instead). Live endpoint must subscribe to these events (Claude
  updates it via API after review).
- Pin `Stripe-Version` on the new Billing calls only (existing calls unchanged).

## 5. Read-only gate (server side, one place)
- `requireAuth(...)` gains one check: when `role === 'manager'` and the request is a **server action** (POST with the
  `Next-Action` header) and `manager_plan_state` is `read_only`, it `redirect("/settings?tab=billing&reason=read-only")`.
  Pages (GET) still render; the manager sees everything.
- Allowlist (actions a read-only manager may still call): billing actions, profile, sign-out, account deletion/export,
  feedback/support, **messages** (reply to tenants/owners — so nobody is stranded), and accepting/declining invites.
  Implemented as `requireAuthAllowReadOnly(...)` used by those actions only.
- Owners and tenants never pass through the plan check. A comped or trialing or active or team-seat-only manager is
  never blocked. `past_due` gets 7 days.
- The gate fails **open** on a plan-lookup error (log `[billing] plan_lookup_failed`), because blocking managers on a
  billing outage is worse than a missed charge.

## 6. UI
- Web Settings → **Billing** (managers only): state, trial end date, billable doors and homes (with team seats listed as
  "Covered by <manager>"), monthly price (`max(doors,10) × $1.50`), Subscribe / Manage buttons.
- Read-only managers: a banner on the manager dashboard "Your free trial ended. You can still see everything. To make
  changes, set up your plan in Settings → Billing." (web).
- **iPhone app (Capacitor):** never shows prices, Subscribe or Manage, and no link out. Billing tab shows "Manager tools
  are set up on your account online." The read-only banner there says "You can still see everything. Changes are paused
  on this account." Detection: the existing native user-agent / Capacitor flag.
- Terms: replace "Domus is free while it is in early access…" with the plan terms (owner-approved wording to follow;
  Claude drafts, 30-day notice kept).

## 7. Undo and money safety
- Subscribe → Portal cancel (end of period). Quantity mistakes self-correct next sync; proration off, so no surprise
  mid-cycle charges. Comp is a row flag, reversible. No refunds automated (owner handles in Stripe).
- Never charge before: owner-approved terms text live + 30 days since billing launch for existing managers.

## 8. Sprints (each: critic → ChatGPT → Codex → review → ship)
- **240a (L3)** migration + `manager_billable_doors` / `manager_plan_state` + comps + SQL tests (Claude); app lib
  `lib/manager-billing/*` (state, quantity), Stripe Billing client, Checkout + Portal actions, webhooks, quantity cron.
- **240b (L3)** read-only gate in `requireAuth` + allowlist, Settings → Billing UI (web), banners, iPhone suppression,
  Terms text. Then Claude creates the live Product/Price/Portal config and webhook events, and walks it in Stripe test mode.

## 9. Open questions for review
1. Is the `requireAuth` + `Next-Action` header gate reliable for every manager write (API routes? client-side Supabase
   writes?) — list any manager write path that bypasses server actions.
2. Team-seat rule edge cases: P loses access; P is themselves a team seat of Q (chains); invitation rows that predate
   237c-5.
3. Is "a home with no units = 1 door" fair and stable?
4. Webhook ordering/idempotency without the Stripe SDK.
