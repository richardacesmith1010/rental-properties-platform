# Sprint 120 — Platform Health Endpoint for Stripe Connect + Webhooks + Email

## Objective

Extend the existing `/api/health` infrastructure with a deeper Stripe-specific health endpoint that detects exactly the failure mode that caused today's bug: Stripe Connect not enabled at the platform level. Add checks for webhook endpoint registration and email (Resend) configuration too. The result is a single URL the platform admin can hit (or an uptime monitor can ping) to know "is everything actually working?" — beyond just "Stripe API is reachable."

## Context

- Branch: `main`
- HEAD: post-Sprint 119 (commit `bc528d4`)
- Existing infrastructure to extend (NOT replace):
  - `apps/web/app/api/health/route.ts` — basic Supabase + Stripe ping
  - `apps/web/lib/health.ts` — exports `checkSupabase`, `checkStripe`, `buildHealthPayload`, `ServiceHealth` type
- Why a new endpoint instead of adding to `/api/health`:
  - `/api/health` is for uptime monitoring (must stay fast and not 503 on Connect-config issues — the app still works for autopay even if manual checkout breaks)
  - `/api/health/stripe` is for operational confidence: "is the platform configured correctly for new payments?"
- The actual error string we hit on the dead Connect path: `"You can only create new accounts if you've signed up for Connect"` — the new check uses this signal directly

## In Scope

1. New helper functions in `apps/web/lib/health.ts`:
   - `checkStripeConnectEnabled()` — verifies the platform can list connected accounts
   - `checkStripeWebhookRegistered()` — verifies a webhook endpoint exists pointing at the configured domain
   - `checkResendConfigured()` — verifies Resend env vars are set
2. New route `apps/web/app/api/health/stripe/route.ts`:
   - Bearer auth via `HEALTH_CHECK_SECRET` (optional — if unset, endpoint requires no auth so internal `localhost` checks work in dev)
   - Returns `{ ok, checks: {...}, timestamp }` using the existing `ServiceHealth` shape per check
   - Status code 200 if all critical checks pass, 503 otherwise
3. Tests for each new check + the route

## Out of Scope

- Modifying the existing `/api/health` route (leave it alone — uptime monitors point at it)
- Modifying `checkStripe` (basic balance ping stays as-is)
- Public health page UI
- Auto-remediation
- Alerting from this endpoint (Sprint 118 already alerts on actual payment failures)
- Operations dashboard (that's Sprint 122)

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/lib/health.ts` | Add `checkStripeConnectEnabled`, `checkStripeWebhookRegistered`, `checkResendConfigured` helpers |
| `apps/web/app/api/health/stripe/route.ts` | **NEW** — endpoint that aggregates the new checks |
| `apps/web/lib/__tests__/health.test.ts` | Extend with tests for the three new check functions |
| `apps/web/app/api/health/stripe/__tests__/route.test.ts` | **NEW** — endpoint tests |
| `apps/web/lib/env.ts` | Add `HEALTH_CHECK_SECRET` to env capabilities map (optional, soft) |

## Implementation Requirements

### 1. `lib/health.ts` — Add Three New Check Helpers

After the existing `checkStripe` function:

```typescript
/**
 * Detects whether Stripe Connect is enabled on the platform account.
 * Calls /v1/accounts (list) — if 200, Connect is enabled. If the error
 * mentions "signed up for Connect", Connect is NOT enabled.
 */
export async function checkStripeConnectEnabled(): Promise<ServiceHealth> {
  const start = Date.now();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return { ok: false, latencyMs: 0, error: "STRIPE_SECRET_KEY not set" };
  }

  try {
    const response = await fetch("https://api.stripe.com/v1/accounts?limit=1", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store"
    });

    if (response.ok) {
      return { ok: true, latencyMs: Date.now() - start };
    }

    const text = await response.text();
    if (/signed up for Connect/i.test(text)) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: "Stripe Connect not enabled — sign up at https://dashboard.stripe.com/connect"
      };
    }

    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: `Stripe API error: HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Verifies a webhook endpoint is registered with Stripe pointing at our
 * domain. Reads NEXT_PUBLIC_APP_URL to know what to look for.
 */
export async function checkStripeWebhookRegistered(): Promise<ServiceHealth> {
  const start = Date.now();
  const key = process.env.STRIPE_SECRET_KEY;
  const expectedDomain = process.env.NEXT_PUBLIC_APP_URL;

  if (!key) {
    return { ok: false, latencyMs: 0, error: "STRIPE_SECRET_KEY not set" };
  }
  if (!expectedDomain) {
    return { ok: false, latencyMs: 0, error: "NEXT_PUBLIC_APP_URL not set" };
  }

  try {
    const response = await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=20", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store"
    });

    if (!response.ok) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `Stripe API error: HTTP ${response.status}`
      };
    }

    const json = (await response.json()) as { data?: Array<{ url: string; status?: string }> };
    const endpoints = json.data ?? [];
    const matching = endpoints.find(
      (ep) => ep.url.includes(new URL(expectedDomain).host) && ep.status !== "disabled"
    );

    if (!matching) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `No active webhook endpoint registered for ${expectedDomain}`
      };
    }

    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Verifies Resend (email) is configured. Does NOT make a network call —
 * just checks env vars. Email sends fail-soft elsewhere; this is a config check.
 */
export function checkResendConfigured(): ServiceHealth {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    const missing = [];
    if (!apiKey) missing.push("RESEND_API_KEY");
    if (!fromEmail) missing.push("RESEND_FROM_EMAIL");
    return {
      ok: false,
      latencyMs: 0,
      error: `Missing env vars: ${missing.join(", ")}`
    };
  }
  return { ok: true, latencyMs: 0 };
}
```

**Important:**
- All three helpers return the existing `ServiceHealth` shape for consistency
- `checkStripeConnectEnabled` uses the LIST endpoint (not POST) — non-destructive
- `checkStripeWebhookRegistered` matches by host (not exact URL) so `https://domusbase.com/api/webhooks/stripe` matches `domusbase.com`
- `checkResendConfigured` is sync (no fetch needed) — env-only check

### 2. New Route `app/api/health/stripe/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  checkStripeConnectEnabled,
  checkStripeWebhookRegistered,
  checkResendConfigured
} from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Optional Bearer auth — if HEALTH_CHECK_SECRET is set, require it.
  // If unset (e.g., dev), allow unauthenticated.
  const expectedSecret = process.env.HEALTH_CHECK_SECRET;
  if (expectedSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const [connectEnabled, webhookRegistered] = await Promise.all([
    checkStripeConnectEnabled(),
    checkStripeWebhookRegistered()
  ]);
  const resendConfigured = checkResendConfigured();

  const ok = connectEnabled.ok && webhookRegistered.ok && resendConfigured.ok;

  return NextResponse.json(
    {
      ok,
      checks: {
        connectEnabled,
        webhookRegistered,
        resendConfigured
      },
      timestamp: new Date().toISOString()
    },
    { status: ok ? 200 : 503 }
  );
}
```

**Important:**
- Auth is optional — if the env var is missing, the endpoint is open. Document this in the response or via comment.
- All three Stripe checks fire in parallel (Promise.all) — they're independent
- 503 status when ANY check fails — easy for monitoring tools to alert on

### 3. Update `lib/env.ts`

Add `HEALTH_CHECK_SECRET` to the env capabilities map alongside the other secret-style env vars:

```typescript
HEALTH_CHECK_SECRET: Boolean(process.env.HEALTH_CHECK_SECRET)
```

### 4. Tests

#### `lib/__tests__/health.test.ts` (extend existing)

Add tests for each new helper:

**`checkStripeConnectEnabled`:**
- 200 response → `{ ok: true }`
- 400 with body containing "signed up for Connect" → `{ ok: false, error: contains "Connect not enabled" }`
- 500 → `{ ok: false, error: contains "HTTP 500" }`
- Network throw → `{ ok: false, error: contains thrown message }`
- No `STRIPE_SECRET_KEY` → `{ ok: false, error: "STRIPE_SECRET_KEY not set" }`

**`checkStripeWebhookRegistered`:**
- Response with matching domain → `{ ok: true }`
- Response with disabled endpoint at our domain → `{ ok: false }`
- Response with no matching endpoints → `{ ok: false, error: contains "No active webhook" }`
- Missing `NEXT_PUBLIC_APP_URL` → `{ ok: false, error: contains "NEXT_PUBLIC_APP_URL not set" }`

**`checkResendConfigured`:**
- Both env vars set → `{ ok: true }`
- Only `RESEND_API_KEY` set → `{ ok: false, error: contains "RESEND_FROM_EMAIL" }`
- Only `RESEND_FROM_EMAIL` set → `{ ok: false, error: contains "RESEND_API_KEY" }`
- Neither set → `{ ok: false, error: contains both var names }`

#### `app/api/health/stripe/__tests__/route.test.ts` (NEW)

Tests for the route:

- All three checks pass → 200 with `{ ok: true, checks: { connectEnabled: { ok: true }, ... } }`
- One check fails → 503 with `{ ok: false }` and the failing check's `ok: false` visible in payload
- `HEALTH_CHECK_SECRET` set + missing auth header → 401
- `HEALTH_CHECK_SECRET` set + correct Bearer → 200/503 based on checks
- `HEALTH_CHECK_SECRET` unset → no auth required, runs checks normally

Use `jest.mock` to stub the three check functions. Don't actually call Stripe in route tests.

### 5. Plain Language

This is an operational/JSON endpoint, not user-facing UI. The error strings are for operators reading logs — they should be specific and action-oriented:

- ✓ "Stripe Connect not enabled — sign up at https://dashboard.stripe.com/connect"
- ✓ "No active webhook endpoint registered for https://domusbase.com"
- ✓ "Missing env vars: RESEND_API_KEY, RESEND_FROM_EMAIL"

No jargon, but technical specificity is fine here (the audience is YOU, not tenants).

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

After gate passes, manual smoke (do NOT run as part of automated gate):

```bash
curl -i http://localhost:3000/api/health/stripe
```

Expected (in dev with no `HEALTH_CHECK_SECRET`): JSON response with three `ok: true/false` checks.

## Acceptance Criteria

1. [ ] `lib/health.ts` exports `checkStripeConnectEnabled` returning `ServiceHealth`
2. [ ] `checkStripeConnectEnabled` returns `ok: false` with "Connect not enabled" message when Stripe responds with the "signed up for Connect" error
3. [ ] `checkStripeConnectEnabled` returns `ok: true` when Stripe returns 200 from `/v1/accounts`
4. [ ] `lib/health.ts` exports `checkStripeWebhookRegistered` returning `ServiceHealth`
5. [ ] `checkStripeWebhookRegistered` returns `ok: true` only when an enabled (not disabled) endpoint matching `NEXT_PUBLIC_APP_URL`'s host exists
6. [ ] `lib/health.ts` exports `checkResendConfigured` returning `ServiceHealth` synchronously
7. [ ] `checkResendConfigured` lists ALL missing env vars in the error message (not just the first)
8. [ ] `app/api/health/stripe/route.ts` exists and runs the three new checks
9. [ ] Route returns 200 when all three checks pass
10. [ ] Route returns 503 when any check fails
11. [ ] Route requires Bearer auth ONLY when `HEALTH_CHECK_SECRET` is set
12. [ ] Route response includes `{ ok, checks: { connectEnabled, webhookRegistered, resendConfigured }, timestamp }`
13. [ ] Existing `/api/health` route is UNCHANGED
14. [ ] `lib/env.ts` includes `HEALTH_CHECK_SECRET` in capabilities map
15. [ ] Tests cover: all three new check functions across success/failure modes; route across pass/fail/auth states
16. [ ] `gate:web` passes
17. [ ] No new npm dependencies

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-17] PASS | FAIL each
notes: (any deviations)
```

## Constraints

- Do NOT modify the existing `/api/health` route or `checkStripe`/`checkSupabase` helpers
- Do NOT make `checkResendConfigured` async or call the Resend API — env-only check
- Webhook check MUST match by host (not full URL string equality) so we don't break on path variations
- Disabled webhook endpoints MUST be treated as missing (status: !== "disabled")
- Connect check MUST use the LIST endpoint, not POST — no side effects
- All three helpers MUST return the existing `ServiceHealth` shape for consistency
- Bearer auth on the new route MUST be optional — if env var unset, no auth required
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
