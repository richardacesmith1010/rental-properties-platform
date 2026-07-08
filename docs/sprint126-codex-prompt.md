# Sprint 126 — Honest Connect Health Check + Plain-Language Onboarding Error

## Objective

Fix two related defects exposed on 2026-07-08 while trying to connect an owner's bank:

1. **False-green health check.** `/api/health/stripe`'s `checkStripeConnectEnabled` reports `ok: true` whenever the platform account's `transfers` capability is `active`. But that capability is active even when the platform CANNOT create live connected accounts (Connect platform profile still under review). The check was green all day while `/connect/onboard` failed every time. It must only report green when connected-account creation actually works.

2. **Dead-end owner error.** When Stripe rejects connected-account creation, `/connect/onboard` renders the raw Stripe JSON error ("Unable to start payout onboarding. (Stripe Connect request failed: 400 - { \"error\": ... }"). A real owner sees a wall of JSON. Replace with plain language and log the real error server-side.

## Context

- Branch: `main`
- HEAD: post-Sprint 125 + cron-config hotfix (`4784aec`)
- `apps/web/lib/health.ts` → `checkStripeConnectEnabled()` currently does `GET /v1/account` and returns `ok: (capabilities.transfers === "active")`. This is the false-green source (introduced Sprint 122 as a fix for a DIFFERENT false-green; it traded one wrong signal for another).
- The ONLY reliable signal that live connected-account creation works is to actually attempt `POST /v1/accounts` and see if it succeeds. Read-only signals (`/v1/accounts` list, `/v1/account` capabilities) all return success even when creation is blocked — both have been confirmed misleading in production.
- The onboarding route lives at `apps/web/app/connect/onboard/page.tsx` (and/or a server action it calls — Codex must locate where the Stripe error string is rendered). The raw error currently reaches the user's screen.
- Real error strings observed today (for pattern-matching to friendly copy):
  - `"You can only create new accounts if you've signed up for Connect"`
  - `"Please review the responsibilities of managing losses for connected accounts"`
  - `"You must complete your platform profile to use Connect and create live connected accounts"`

## In Scope

### Part 1 — Honest health check (`apps/web/lib/health.ts`)

Rewrite `checkStripeConnectEnabled` to verify real account-creation capability via a **probe-create-and-delete**, with **caching to bound churn**:

- Attempt `POST /v1/accounts` with a minimal Express account (`type=express`, `country=US`, `capabilities[transfers][requested]=true`).
- On success: immediately `DELETE /v1/accounts/{id}` (best-effort; log if delete fails), return `{ ok: true }`.
- On failure: return `{ ok: false, error: <Stripe message, truncated to ~200 chars> }`.
- **Cache the outcome in-process for 1 hour** (module-level `Map` or timestamp + cached result, same pattern as `platform-alerts.ts` dedupe). If a cached result younger than 1 hour exists, return it WITHOUT hitting Stripe. This prevents an uptime monitor from creating/deleting dozens of probe accounts per hour.
- Missing `STRIPE_SECRET_KEY` → `{ ok: false, error: "STRIPE_SECRET_KEY not set" }` (unchanged).
- Keep the existing `ServiceHealth` return shape.

Rationale to include as a code comment: read-only signals (`/v1/accounts` list, `/v1/account.capabilities.transfers`) both falsely report success when the Connect platform profile is incomplete/under review; a probe-create is the only trustworthy check.

### Part 2 — Plain-language onboarding error (`apps/web/app/connect/onboard/…`)

- Locate where the Stripe error is surfaced to the user on the connect-onboard path.
- Replace the raw JSON/error passthrough with plain language. Map known cases:
  - Platform not ready (any of the three observed strings above, or any `invalid_request_error` mentioning "Connect" / "platform profile" / "responsibilities"): show
    > **Bank connections aren't available yet**
    > We're still finishing setup with our payment provider. This usually takes up to one business day. Please check back soon — you'll be able to connect your bank once it's ready.
  - Any other error: show
    > **We couldn't start your bank setup**
    > Something went wrong on our end. Please try again in a little while. If it keeps happening, contact support.
- **Always** log the real Stripe error server-side via the existing `console.error` / `sideEffectError` pattern so the platform owner can still diagnose (never lose the detail — just don't show JSON to the user).
- Do NOT change the successful onboarding path (when Stripe returns a redirect URL, still redirect).

## Out of Scope

- Changing the Stripe Connect setup itself (that's a Stripe-dashboard/review matter, not code)
- The `/api/health` basic route (leave it)
- `checkStripeWebhookRegistered`, `checkResendConfigured` (leave them)
- Any migration or schema change
- Retry/queue logic

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/lib/health.ts` | Rewrite `checkStripeConnectEnabled` to probe-create+delete with 1-hour cache |
| `apps/web/app/connect/onboard/page.tsx` (and/or the action/component it uses — locate) | Replace raw Stripe error with plain-language copy; log real error server-side |
| `apps/web/lib/__tests__/health.test.ts` | Update `checkStripeConnectEnabled` tests for the probe+cache behavior |
| `apps/web/app/connect/onboard/__tests__/…` or nearest existing test | Cover: platform-not-ready → friendly "not available yet" copy; other error → generic friendly copy; success → redirect preserved |

## Implementation Requirements

### Health check tests
Mock `fetch`:
- POST /v1/accounts returns 200 with `{id}` → `ok: true`; assert a DELETE was issued for that id.
- POST returns 400 with "must complete your platform profile" → `ok: false`, error contains that text.
- Second call within the cache window → returns cached result WITHOUT a new fetch (assert fetch call count unchanged).
- Missing key → `ok: false, "STRIPE_SECRET_KEY not set"`, no fetch.

### Onboarding error tests
- Simulate the action throwing / returning the "platform profile" Stripe error → rendered output contains "aren't available yet" and does NOT contain "invalid_request_error" or raw `{`.
- Simulate a generic error → rendered output contains the generic friendly message.
- Confirm `console.error` (or `sideEffectError`) still receives the real error.

### Plain language
6th-grade reading level. No jargon ("connected account", "payout onboarding", "invalid_request_error" must never reach the user). Read the copy out loud — it should sound like a helpful text, not a stack trace.

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] `checkStripeConnectEnabled` performs a probe `POST /v1/accounts` and `DELETE`s the probe account on success
2. [ ] Returns `ok: true` ONLY when account creation succeeds
3. [ ] Returns `ok: false` with the real Stripe message (truncated) when creation fails
4. [ ] Result is cached in-process for 1 hour; a second call within the window does not hit Stripe
5. [ ] Missing `STRIPE_SECRET_KEY` returns `ok: false` without any fetch
6. [ ] A code comment explains why read-only signals are untrustworthy here
7. [ ] `/connect/onboard` never renders raw Stripe JSON or `invalid_request_error` to the user
8. [ ] Platform-not-ready errors map to the "Bank connections aren't available yet" copy
9. [ ] Other errors map to the generic friendly copy
10. [ ] The real Stripe error is still logged server-side
11. [ ] Successful onboarding still redirects to Stripe (unchanged)
12. [ ] Tests cover health probe+cache and both onboarding error branches
13. [ ] `gate:web` passes
14. [ ] No new dependencies, no migration

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-14] PASS | FAIL each
notes: (where the onboarding error was being rendered; anything notable)
MANUAL_VERIFICATION_PATH:
1. curl -s $APP_URL/api/health/stripe (authed if HEALTH_CHECK_SECRET set) → connectEnabled reflects REAL account-creation ability (currently false, until Stripe review clears)
2. Log in as owner, click "Connect Now" → expect the plain-language "aren't available yet" message, NOT raw JSON
3. Check Vercel logs → the real Stripe error is still recorded server-side
```

## Constraints

- The probe MUST delete the account it creates (no orphan accounts accumulating)
- The probe MUST be cached (≤ 1 real attempt/hour) to avoid account churn
- The user-facing onboarding error MUST NOT contain raw JSON, request IDs, or Stripe error types
- The real error MUST still be logged server-side
- Do NOT alter the success path of onboarding
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
