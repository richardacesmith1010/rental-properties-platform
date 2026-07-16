# Sprint 127 (v2) — Fix Connect health-check false-negative + lock down health endpoint

> v2 incorporates an independent L3 review. Changes vs v1: shared params must be a **factory returning a fresh object** (not a mutable singleton); probe cleanup must run in **`finally`** and failed deletion makes the probe **unhealthy**; environment detection is **fail-closed by default** (local dev defined narrowly); auth uses a **timing-safe** compare with strict bearer parsing; **no health/Stripe call** on any rejected request; **`Cache-Control: no-store`** on all responses; explicit **"Codex must not touch the secret"** rule.

## 1. Objective
Fix two defects on the Stripe Connect health path:
1. `checkStripeConnectEnabled()` probes with a `transfers`-only capability combo that this platform is not approved for, so `GET /api/health/stripe` returns a **false 503** even though real onboarding works.
2. `/api/health/stripe` **fails open** (public access) in production because `HEALTH_CHECK_SECRET` is unset.

## 2. Context
- Branch `main`, HEAD `1e1f292`.
- Platform Stripe account `acct_1T2AgdA8rwK8f30F` is **live-approved** for Connect.
- **Verified live (2026-07-12):** creating an Express account with the real onboarding payload (`type=express`, `country=US`, `card_payments`+`transfers` requested, `mcc=6513`, business url) **succeeds** (create-then-delete test passed).
- Probe today: `apps/web/lib/health.ts:173-176` sets only `capabilities[transfers][requested]=true` → Stripe error *"…transfers capability without the card_payments capability."*
- Real path: `apps/web/lib/stripe-connect.ts:33-40` requests both capabilities + business_profile.
- Route auth: `apps/web/app/api/health/stripe/route.ts:11-20` — `if (expectedSecret) {…}` means **unset secret ⇒ no auth ⇒ public**.

## 3. In scope
- Introduce ONE shared **factory** for Express account-creation params in `stripe-connect.ts`; use it in BOTH `createExpressAccount` and the health probe.
- Fix the probe to request the real capability set, and harden its create→delete cleanup.
- Make the route **fail closed** everywhere except explicit local dev.
- Update/extend tests to cover the full matrix.

## 4. Out of scope
- No change to the functional onboarding flow (`connect.ts`, `/connect/*`) beyond swapping duplicated param construction for the shared factory.
- No account type/country/capability/MCC/URL behavior change. No DB/migration. No change to the 1-hour probe cache. No deploy.
- **Codex must NOT create, modify, print, fetch, rotate, or deploy `HEALTH_CHECK_SECRET`, and must not touch `.env*`, Vercel config, or deploy scripts.** A separate operator configures the secret. Until then the endpoint must safely return 503.

## 5. Exact files expected to change
- `apps/web/lib/stripe-connect.ts`
- `apps/web/lib/health.ts`
- `apps/web/app/api/health/stripe/route.ts`
- `apps/web/lib/__tests__/health.test.ts`
- `apps/web/app/api/health/stripe/__tests__/route.test.ts`
- `apps/web/lib/__tests__/stripe-connect.test.ts`
Touch anything else only if a test import strictly requires it — and explain why.

## 6. Implementation requirements

### 6.1 Shared params factory (single source of truth)
- Add a typed factory, e.g. `buildExpressAccountParams(url: string)`, that **returns a fresh object on every call** (no exported mutable singleton — callers/tests must never be able to mutate shared nested state).
- It is the ONLY place in scoped code defining: `type: "express"`, `country: "US"`, `capabilities.card_payments.requested`, `capabilities.transfers.requested`, `business_profile.mcc: "6513"`, and the `business_profile.url` structure.
- If onboarding derives the URL dynamically, the factory takes the final URL as an argument (own the payload structure, not URL discovery).
- `createExpressAccount` must produce a **structurally identical** payload to before (aside from sourcing params from the factory). The probe uses the same factory.

### 6.2 Probe correctness + cleanup (`checkStripeConnectEnabled`)
- Create the Express account via the factory → now requests BOTH `card_payments` and `transfers` (verified to succeed live).
- Capture the created account ID immediately after creation.
- **Perform deletion in a `finally` block** so cleanup is attempted on every post-creation path (assertion throws, unexpected response, logging throws, future refactor).
- Cleanup is successful **only when Stripe confirms `deleted === true`**. A thrown/missing/malformed delete result, or `deleted !== true`, makes the probe **unhealthy**.
- If cleanup can't be confirmed, log a safe error including the orphaned account ID — **never** log Stripe keys, `HEALTH_CHECK_SECRET`, or authorization headers.
- Every code path returns a deterministic boolean; no silent `return`. Do not surface raw Stripe error text to callers (keep the existing generic/truncated message).
- Keep the existing 1-hour cache behavior unchanged.

### 6.3 Route: fail closed outside explicit local dev
- Define local dev **narrowly**: unauthenticated access is allowed ONLY when `process.env.VERCEL_ENV === undefined && process.env.NODE_ENV !== "production"`.
- Treat **every other case as protected (fail closed)**: `VERCEL_ENV` of `production`, `preview`, any unexpected non-empty value, OR `VERCEL_ENV` undefined with `NODE_ENV==="production"`.
  - Do NOT write `if (VERCEL_ENV==="production"||"preview") …` and leave other values unauthenticated — that would make unknown envs public.
- Protected + secret missing/empty → **503** with the exact body `{ error: "health check not configured" }`; do NOT call `checkStripeConnectEnabled()` or Stripe.
- Protected + secret set → require `Authorization: Bearer <token>`. Missing / malformed / empty / extra-material / wrong token → **401**, and do NOT call the health check.
  - Compare tokens with a **timing-safe** comparison; check byte length first (Node `timingSafeEqual` throws on unequal lengths). Never log the token or secret.
- Local dev → allow without auth even if a secret happens to be set (chosen default; assert it in tests).
- Only a valid authenticated request may invoke `checkStripeConnectEnabled()`.
- Add/preserve **`Cache-Control: no-store`** on ALL route responses.
- Preserve the existing healthy/unhealthy response contracts apart from the new unconfigured 503 body.

## 7. Validation commands
```bash
npm run gate:web
```
Tests must make **no live Stripe calls** (mock the Stripe layer). Restore all mutated env vars after each test; reset mocks/module state so order can't affect results.

## 8. Acceptance criteria (binary)
- `gate:web` passes.
- Probe requests both `card_payments` and `transfers` (asserted).
- Params defined once in the factory; both `createExpressAccount` and the probe use it; repeated factory calls return **distinct** objects (mutation of one doesn't affect another); both callers pass structurally identical params for the same URL.
- Probe cleanup runs in `finally`; failed/unconfirmed deletion ⇒ probe unhealthy; orphan ID logged without secrets.
- Route matrix (all asserted, health fn call-count checked):
  - `VERCEL_ENV=production`, secret unset → 503 "health check not configured", health fn **not** called.
  - `VERCEL_ENV=preview`, secret unset → same.
  - unexpected non-empty `VERCEL_ENV`, secret unset → same fail-closed.
  - `VERCEL_ENV` undefined + `NODE_ENV=production`, secret unset → same fail-closed.
  - protected + secret set + missing/malformed/empty/wrong bearer → 401, health fn **not** called.
  - protected + secret set + correct bearer → health fn called exactly once.
  - `VERCEL_ENV` undefined + `NODE_ENV≠production` (with or without secret) → unauthenticated allowed, health fn called.
  - all responses include `Cache-Control: no-store`.
- No live Stripe request in any test; no env/deploy/secret config modified.

## 9. Report format (required booleans)
`gate_passed`, `probe_requests_both_capabilities`, `params_factory_single_source`, `factory_returns_fresh_object`, `probe_cleanup_in_finally`, `failed_delete_marks_unhealthy`, `route_fails_closed_by_default`, `bearer_parsing_strict_timing_safe`, `no_stripe_call_on_reject`, `cache_control_no_store`, `tests_cover_full_matrix`, `no_live_stripe_in_tests`.
Plus: files changed, exact tests run + results, and any deviations with justification. Report status booleans only — **no "Claude prompt" / "next steps for Claude" sections.**

## 10. Constraints
No DB apply. No deploy. No env-var/secret/Vercel config changes. No edits outside §5 without flagging why. Assume secret + monitor configuration happen separately; the code must be safe (503) until then.
