# Sprint 129 (v2) — Connect onboarding routes to the rent-collection account (fix mis-route + honest status)

> v2 incorporates the L3 review (verdict on v1: NO-GO). Changes: authority model separated from general administration (managers must NOT gain owner rent-account control); explicit **target-list** routing covering hybrid legacy+account users; "active property" and "connected" defined by exact persisted fields; **fail-closed routing** (a status-query failure must never start a Stripe flow); resume-not-recreate requirement for partial onboarding; production-preservation assertions; deterministic ordering; chooser shows property context; state-specific plain copy; `getExpressDashboardUrl(accountId?)` kept in scope (without it, account-level-connected users get a broken "Manage on Stripe").

## 1. Objective
Fix the two Connect-onboarding defects found during the 2026-07-16 live money test (Sprint 128):
1. **Mis-route:** an owner in any LLC who clicks the generic "Connect Your Bank Account" banner is silently sent into **member-payout** onboarding — their Stripe account lands on `ownership_account_members.payout_stripe_account_id`, which rent routing never reads, so their properties still can't receive rent.
2. **Dishonest status:** the dashboard banner, owner setup checklist, and Settings → Bank read `profiles.stripe_onboarding_complete` only, so a successful ACCOUNT-level connection still shows "not connected."

## 2. Context
- Branch `main`, HEAD `2564521`. Production is LIVE: a real owner is connected and a real paid charge exists.
- Rent money routes via `getOwnerStripeAccountForProperty` (`apps/web/lib/stripe-connect.ts:114`): `properties.owner_account_id` → `ownership_accounts.stripe_account_id` → active **owner-role** members' `profiles.stripe_account_id` → `properties.owner_profile_id` profile. **Member-payout accounts are NOT part of rent routing.**
- Manager fees route separately via the manager's `profiles.stripe_account_id` (`getManagerStripeAccountForProperty`). Managers therefore have a legitimate PROFILE-level connect need — but no authority over owner rent accounts.
- Live state that MUST be preserved: `ownership_accounts` `729c4e55-…` connected (`acct_1TtgYTAUUcWMMedP`); `ownership_account_members` (`5d3ba8b7-…`, profile `1c9319a4-…`) has `payout_stripe_account_id = acct_1TtgLnAP3AuU6GWj`. No code path in this sprint may write either field.
- Mis-route mechanism (three places): `apps/web/app/connect/onboard/page.tsx:66-67` (`effectiveMemberPayout = requestedMemberPayout || (!requestedAccountId && llcMemberships.length > 0)`); `apps/web/components/dashboard/connect-banner.tsx:17-20` (banner href hardcodes `&memberPayout=true` for LLC members); `apps/web/components/dashboard/index.tsx:188-196` (`llcBannerConnected` conflation).
- Profile-only status reads: `apps/web/app/owner/page.tsx:382`, `apps/web/app/settings/page.tsx:148`, `apps/web/components/dashboard/dashboard-home-loader.ts:72-73`.
- Existing helpers: `lib/ownership.ts` (`getOwnershipAccountsForUser`, `canUserAdministerOwnershipAccount`), `lib/property-access.ts`, `app/actions/connect.ts` (three initiate actions + `getExpressDashboardUrl`), `isMissingSchemaError` pattern.

## 3. In scope
1. Status helper `getRentCollectionConnectStatus` (single source of truth, read-only).
2. `/connect/onboard` default routing via an explicit **target list**; member-payout only on explicit request; fail-closed on errors.
3. Banner, setup checklist, Settings → Bank read the honest status; `getExpressDashboardUrl` gains optional `accountId`.
4. Tests for the full matrix below.

## 4. Out of scope
- NO changes to `getOwnerStripeAccountForProperty`, payment/checkout/webhook code, or DB schema.
- NO changes to the three initiate actions' auth/rate-limits/Stripe payloads. ONE narrow exception: if `initiateAccountStripeConnect` does NOT already resume an existing incomplete Stripe account (see 6.4), fix that minimally and flag it.
- NO changes to explicit member-payout entry points (`member-management.tsx`, `distribution-config-panel.tsx`).
- NO deploy (Claude deploys). NO `payments.platform_fee_cents` changes.

## 5. Exact files expected to change
- `apps/web/lib/stripe-connect.ts` (status helper)
- `apps/web/app/connect/onboard/page.tsx` (routing)
- `apps/web/components/dashboard/connect-banner.tsx`
- `apps/web/components/dashboard/index.tsx` (ONLY the banner-driving block ~186-200 + props; god file — touch nothing else)
- `apps/web/app/owner/page.tsx`
- `apps/web/app/settings/page.tsx` + `apps/web/components/settings/bank-settings.tsx`
- `apps/web/components/dashboard/dashboard-home-loader.ts`
- `apps/web/app/actions/connect.ts` (`getExpressDashboardUrl(accountId?)`; resume fix only if 6.4 requires)
- Tests: `apps/web/app/connect/onboard/__tests__/page.test.tsx`, `apps/web/components/__tests__/connect-banner.test.tsx`, `apps/web/lib/__tests__/stripe-connect.test.ts`, home-loader test if one exists
- `apps/web/components/dashboard/welcome-card.tsx` — verify only.

## 6. Implementation requirements

### 6.1 Definitions (exact, no improvisation)
- **Rent-connection authority:** user's `profiles.role === "owner"` AND, per account, user is an ACTIVE member with `member_role = 'owner'` of that `ownership_accounts` row (or its `created_by_profile_id`). General "administration" (e.g., manager assignment) grants NOTHING here. **Managers never see owner rent-account routing or choosers** — a manager hitting `/connect/onboard` gets the existing profile-level flow (their fee payout), unchanged.
- **Account is connected:** `ownership_accounts.stripe_account_id` non-null AND `ownership_accounts.stripe_onboarding_complete = true`. (These are the persisted readiness fields; do not invent new ones.)
- **Profile is connected:** `profiles.stripe_account_id` non-null AND `profiles.stripe_onboarding_complete = true`.
- **Active property:** `properties.active IS DISTINCT FROM false` (legacy null counts as active).
- **Ordering (deterministic everywhere):** accounts sorted by `created_at` asc, then `id` asc. Never rely on DB return order.

### 6.2 Status helper (read-only — it must contain zero writes)
```ts
export interface RentCollectionConnectStatus {
  ok: boolean;                      // false ⇒ status could not be determined (query/schema error)
  connected: boolean;               // every target below is connected (only meaningful when ok)
  accounts: Array<{
    accountId: string;
    accountName: string;
    isConnected: boolean;
    activePropertyCount: number;
    propertyNames: string[];        // up to 3, for the chooser
  }>;
  legacyProfileTarget: boolean;     // user has ≥1 active property with owner_account_id NULL and owner_profile_id = user
  profileConnected: boolean;
  targets: Array<{ kind: "account"; accountId: string } | { kind: "profile" }>; // unconnected, in deterministic order
  primaryTarget: RentCollectionConnectStatus["targets"][number] | null;
}
export async function getRentCollectionConnectStatus(userId: string): Promise<RentCollectionConnectStatus>
```
- `accounts` = accounts where the user has rent-connection authority (6.1).
- **Target list** (the routing contract): unconnected authority-accounts owning ≥1 active property (in order), then unconnected authority-accounts owning zero properties (in order), then the legacy profile target if `legacyProfileTarget && !profileConnected`.
- `connected` = target list empty AND (`accounts.length > 0` OR `legacyProfileTarget` ⇒ their respective connections hold). A user with no accounts and no legacy properties: `connected = profileConnected`.
- Batched queries only (`.in()`), no query-in-loop. On ANY query/schema error: return `ok: false` with safe empties — callers decide (see 6.3 vs 6.5). Log via existing logger; never throw to the page.

### 6.3 `/connect/onboard` routing (fail closed)
When NO `memberPayout=true`:
1. Role manager → existing profile-level `initiateStripeConnect()`, unchanged. No owner routing, no chooser.
2. `accountId` param present (single, valid UUID) → verify rent-connection authority for THAT account (6.1) → `initiateAccountStripeConnect`. Array-valued, malformed, unknown, or unauthorized `accountId` → safe error state (below), ZERO Stripe calls.
3. No params → `getRentCollectionConnectStatus(user.id)`:
   - `ok === false` → **safe error state**: plain-language card "We can't check your payment setup right now. Please try again in a minute." + a "Try again" link back to `/connect/onboard`. **ZERO initiate calls, zero Stripe requests.** (Status DISPLAYS may fail soft to "not connected"; ROUTING must fail closed. This is the rule the v1 review flagged as the worst risk.)
   - Exactly 1 target → route it: `account` → `initiateAccountStripeConnect(accountId)`; `profile` → `initiateStripeConnect()`.
   - ≥2 targets → chooser card "Which account should receive rent?" listing each target: account name + up to 3 property names (+ "and N more"), legacy target labeled "Your personal properties". Hrefs: `/connect/onboard?accountId=<id>` or `/connect/onboard?profile=true` — NEVER `memberPayout`. (`profile=true` param → `initiateStripeConnect()`, owner only.)
   - 0 targets → redirect `/settings?connect=ready`.
4. `memberPayout=true` explicitly → existing member-payout behavior unchanged (its own action already enforces active membership in that exact LLC — assert this in a test, don't reimplement).
- `getActiveLlcMembershipsForUser` must no longer influence the no-param path at all.

### 6.4 Resume, not recreate (protects live/partial accounts)
If the routed account already has `stripe_account_id` but `stripe_onboarding_complete = false`, `initiateAccountStripeConnect` must REUSE that Stripe account (create a fresh account link only) — never create a second Stripe account. Verify this is the current behavior; if it is not, apply the minimal fix inside the action and flag it in the report. Add a test asserting `POST /v1/accounts` is NOT called when an account id already exists.

### 6.5 Banner + checklist + settings honesty
- Thread helper results server-side (`owner/page.tsx`, `settings/page.tsx`) — components stay dumb.
- `connect-banner.tsx`: `connected` = helper `connected`; when helper `ok === false`, show the UNCONNECTED banner copy but keep the default href (routing will fail closed if truly broken). Primary href: `/connect/onboard` or `?accountId=<primaryTarget>`; the `llcMembershipDetected` member-payout href is DELETED from this banner.
- `index.tsx` ~186-200: delete the `llcBannerConnected`/`hasLlcPayoutMembership` conflation; banner driven by the new props only.
- `dashboard-home-loader.ts:72`: checklist step completes when helper `connected === true`.
- `bank-settings.tsx`: connected state from helper. "Manage on Stripe" for account-level connections calls `getExpressDashboardUrl(accountId)`; extend it with optional `accountId` — authorization: rent-connection authority (6.1) for that exact account; no-arg profile behavior preserved byte-for-byte.
- **Copy (state-specific, 6th-grade):** unconnected: "Set up rent payments." · connected: "Rent payments are set up." · per-account pill: "Connected for rent." · chooser heading: "Which account should receive rent?" · Never claim a bank is attached (we only know Stripe onboarding finished).
- 7-step server-action pattern kept; every Supabase result's error checked; no silent returns.

## 7. Validation commands
```bash
npm run gate:web
```
No live Stripe/DB calls in tests. Reset mocks + env between tests.

## 8. Acceptance criteria (binary)
Routing matrix (initiate-action mocks, call-counts asserted):
- [ ] no params + owner + 1 unconnected property-owning account → `initiateAccountStripeConnect(thatId)`; member-payout action count 0.
- [ ] no params + owner + LLC membership + 1 unconnected account → same (LLC does not hijack).
- [ ] no params + owner + account target AND legacy profile target → chooser with BOTH (account named + "Your personal properties").
- [ ] no params + owner + multiple unconnected accounts → chooser; hrefs contain `accountId=`/`profile=true`, never `memberPayout`.
- [ ] no params + owner + accounts exist, zero qualifying properties, all unconnected → routed/choosered (not dead-ended, not profile flow).
- [ ] no params + owner + everything connected → redirect `/settings?connect=ready`; ZERO initiate calls.
- [ ] no params + owner + no accounts + no legacy properties → `initiateStripeConnect()` (new-owner behavior preserved).
- [ ] no params + MANAGER → `initiateStripeConnect()`; owner routing/chooser never rendered.
- [ ] no params + status helper returns `ok:false` → safe error card; ZERO initiate calls, zero Stripe calls.
- [ ] `accountId` malformed / array / unknown / not authorized (incl. manager, inactive member, removed member) → safe error; ZERO Stripe calls.
- [ ] `memberPayout=true&accountId=X` → member-payout action called (existing behavior intact).
- [ ] Resume test (6.4): existing `stripe_account_id` + incomplete → no `POST /v1/accounts`.
Helper tests:
- [ ] connected-math: all connected; one property-owning account unconnected; legacy fallback; hybrid (account + legacy both unconnected → 2 targets, deterministic order); no accounts at all; partial onboarding (id set, complete=false ⇒ NOT connected); missing-schema ⇒ `ok:false`.
- [ ] helper performs zero writes (mock asserts no `.update()`/`.insert()`/`.delete()`).
Production preservation:
- [ ] No test path writes `ownership_accounts.stripe_account_id` or `ownership_account_members.payout_stripe_account_id` except the untouched existing actions.
UI honesty:
- [ ] Banner primary href never contains `memberPayout`; checklist completes on account-level connection with profile flag false; settings Manage works for account-level (authorized) and profile-level (no-arg unchanged).
- [ ] `gate:web` passes; no file outside §5 changed (or deviation flagged).

## 9. Report format (required booleans)
`gate_passed`, `routing_matrix_all_pass`, `llc_no_longer_hijacks_default`, `manager_isolated_from_owner_accounts`, `fail_closed_on_status_error`, `resume_not_recreate_verified`, `helper_read_only`, `banner_checklist_settings_honest`, `member_payout_explicit_only`, `no_resolver_changes`, `tests_updated`.
Files changed + deviations with justification.
`MANUAL_VERIFICATION_PATH` (required):
```
1. Log in as richard.ace.smith@gmail.com (owner; account 729c4e55 IS connected; LLC 5d3ba8b7 member-payout IS connected)
2. /owner → banner shows "Rent payments are set up." (not the connect CTA)
3. /owner → Home checklist → "Connect bank account" complete (6 of 6)
4. /settings → Bank → connected; "Manage on Stripe" opens Express dashboard (account-level)
5. /connect/onboard (no params) → redirect /settings?connect=ready; DB values for 729c4e55.stripe_account_id and the 5d3ba8b7 membership payout id UNCHANGED afterward
6. /connect/onboard?accountId=5d3ba8b7…&memberPayout=true → member-payout flow still reachable explicitly
```
No "Claude prompt" / "next steps for Claude" sections.

## 10. Constraints
- No DB apply. No deploy. No env/secret changes. No edits outside §5 without flagging why.
- REAL production data sits behind every screen touched — a wrong write here corrupts a live Stripe wiring. When in doubt, fail closed and flag.
- If a chooser is shown, the right choice must be obvious without instructions (account names + the properties they collect rent for).
