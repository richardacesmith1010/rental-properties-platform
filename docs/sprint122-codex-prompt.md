# Sprint 122 — HOTFIX: Fix `checkStripeConnectEnabled` False Positive

## Objective

Sprint 120's `checkStripeConnectEnabled` reports `ok: true` when Stripe Connect is NOT actually usable. The check uses `GET /v1/accounts?limit=1`, which returns 200 even when Connect signup is incomplete — because LIST works for any platform with a valid secret key, while POST (account creation) requires full Connect signup. The result: `/api/health/stripe` says "everything green" while `/connect/onboard` still fails with "You can only create new accounts if you've signed up for Connect."

Fix the check to use a signal that actually correlates with payment-flow success: the platform account's `transfers` capability.

## Context

- Branch: `main`
- HEAD: post-Sprint 121 (commit `1bf7ccb`)
- Bug discovered during the Sprint 117–121 walk-through (the new CLAUDE.md §19 protocol working as designed):
  - `curl https://domusbase.com/api/health/stripe` → 200, `connectEnabled: ok: true`
  - `https://domusbase.com/connect/onboard` → "Unable to start bank connection. Stripe Connect request failed: 400 - You can only create new accounts if you've signed up for Connect"
  - The check picks the wrong signal
- Direct application of L-008: the data was visible (the actual error mentions Connect signup explicitly), and Sprint 120's check should detect that exact case

### Why `capabilities.transfers` is the right signal

`GET /v1/account` (singular — the platform's own account, no ID needed) returns:

```json
{
  "id": "acct_xxx",
  "details_submitted": true,
  "capabilities": {
    "card_payments": "active",
    "transfers": "active"
  }
}
```

The `transfers` capability becomes `"active"` only when Connect is fully signed up at the platform level. Before that it's `"inactive"` or absent. Since Domus uses destination charges (which require `transfers`), this is the exact signal we need.

## In Scope

1. Replace the implementation of `checkStripeConnectEnabled` in `apps/web/lib/health.ts`:
   - Call `GET /v1/account` (singular)
   - Check `capabilities.transfers === "active"`
   - On non-active or missing: return `ok: false` with message indicating Connect needs signup
2. Update unit tests in `apps/web/lib/__tests__/health.test.ts` to match the new behavior
3. Verify the check correctly distinguishes:
   - Connect fully signed up → `ok: true`
   - Connect not signed up → `ok: false` with "Connect not enabled — sign up at https://dashboard.stripe.com/connect"
   - 5xx / network error → throws (same as before)
   - Missing secret key → `ok: false` with "STRIPE_SECRET_KEY not set" (same as before)

## Out of Scope

- Modifying the route at `apps/web/app/api/health/stripe/route.ts`
- Modifying `checkStripeWebhookRegistered` or `checkResendConfigured`
- Modifying the existing `/api/health` route or `checkStripe` (basic balance ping stays)
- Adding new env vars
- Adding new endpoints

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/lib/health.ts` | Rewrite `checkStripeConnectEnabled` body to call `/v1/account` and check `capabilities.transfers` |
| `apps/web/lib/__tests__/health.test.ts` | Update mocks and assertions for the new fetch URL + response shape |

## Implementation Requirements

### 1. New `checkStripeConnectEnabled` Body

Replace the existing implementation:

```typescript
/**
 * Detects whether Stripe Connect is fully enabled on the platform account.
 * Calls GET /v1/account (singular = the platform account itself) and verifies
 * capabilities.transfers === "active". This is the only signal that actually
 * correlates with destination-charge success: LIST endpoints return 200 even
 * when Connect signup isn't complete, but the transfers capability only goes
 * active when the platform has finished Connect signup end-to-end.
 */
export async function checkStripeConnectEnabled(): Promise<ServiceHealth> {
  const start = Date.now();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return { ok: false, latencyMs: 0, error: "STRIPE_SECRET_KEY not set" };
  }

  try {
    const response = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store"
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `Stripe API error: HTTP ${response.status} ${text.slice(0, 120)}`
      };
    }

    const json = (await response.json()) as {
      capabilities?: Record<string, string>;
      details_submitted?: boolean;
    };

    const transfersCapability = json.capabilities?.transfers;
    if (transfersCapability !== "active") {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `Stripe Connect not fully enabled (transfers capability: ${transfersCapability ?? "missing"}) — finish signup at https://dashboard.stripe.com/connect`
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
```

**Important:**
- Endpoint changed from `/v1/accounts?limit=1` to `/v1/account` (singular, no path params)
- Check is `capabilities.transfers === "active"` — anything else (`"inactive"`, `"pending"`, missing) is `ok: false`
- Error message includes the actual capability state for diagnostic clarity
- Throw behavior on non-200 unchanged — gives ops a way to distinguish "down" from "misconfigured"

### 2. Updated Tests in `health.test.ts`

Replace any existing tests for `checkStripeConnectEnabled` with these cases:

```typescript
describe("checkStripeConnectEnabled", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_xxx";
  });

  it("returns ok=true when transfers capability is active", async () => {
    mockFetchOk({ capabilities: { transfers: "active", card_payments: "active" } });
    const result = await checkStripeConnectEnabled();
    expect(result.ok).toBe(true);
  });

  it("returns ok=false when transfers capability is inactive", async () => {
    mockFetchOk({ capabilities: { transfers: "inactive" } });
    const result = await checkStripeConnectEnabled();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/transfers capability: inactive/);
    expect(result.error).toMatch(/dashboard\.stripe\.com\/connect/);
  });

  it("returns ok=false when transfers capability is pending", async () => {
    mockFetchOk({ capabilities: { transfers: "pending" } });
    const result = await checkStripeConnectEnabled();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/transfers capability: pending/);
  });

  it("returns ok=false when capabilities object is missing", async () => {
    mockFetchOk({ details_submitted: true });
    const result = await checkStripeConnectEnabled();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/transfers capability: missing/);
  });

  it("returns ok=false on 5xx", async () => {
    mockFetch500();
    const result = await checkStripeConnectEnabled();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/HTTP 500/);
  });

  it("returns ok=false when secret key missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const result = await checkStripeConnectEnabled();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("STRIPE_SECRET_KEY not set");
  });
});
```

Codex must adapt to the existing fetch-mocking pattern in `health.test.ts`. If the file uses `global.fetch = jest.fn().mockResolvedValueOnce(...)`, follow that style. If it uses MSW or similar, follow that.

### 3. Plain-Language Verification

Read the new error message out loud:
> "Stripe Connect not fully enabled (transfers capability: inactive) — finish signup at https://dashboard.stripe.com/connect"

Includes: the diagnosis, the actual state, and the action to take. Pass.

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

After gate passes, manual smoke (Claude will run after deploy):

```bash
curl -s https://domusbase.com/api/health/stripe | python3 -m json.tool
```

Expected on the current production state (Connect not signed up): `connectEnabled.ok` should now be `false` with the correct diagnostic message. Once Connect is signed up, it should flip to `true`.

## Acceptance Criteria

1. [ ] `checkStripeConnectEnabled` calls `GET /v1/account` (singular), not `/v1/accounts?limit=1`
2. [ ] Check verifies `capabilities.transfers === "active"`
3. [ ] When transfers is `"inactive"`, returns `ok: false` with error mentioning "transfers capability: inactive"
4. [ ] When transfers is `"pending"`, returns `ok: false` with error mentioning "transfers capability: pending"
5. [ ] When capabilities object missing entirely, returns `ok: false` with error mentioning "transfers capability: missing"
6. [ ] When transfers is `"active"`, returns `ok: true`
7. [ ] Error message includes the link `https://dashboard.stripe.com/connect`
8. [ ] Non-200 responses return `ok: false` with HTTP status (no throw)
9. [ ] Network errors are caught and returned as `ok: false`
10. [ ] Missing secret key returns `ok: false` with "STRIPE_SECRET_KEY not set"
11. [ ] Tests updated to cover all six cases above
12. [ ] No other helpers or routes modified
13. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-13] PASS | FAIL each
notes: (any deviations)
MANUAL_VERIFICATION_PATH: backend-only
VERIFICATION_COMMANDS:
- curl -s https://domusbase.com/api/health/stripe | python3 -m json.tool
  → connectEnabled.ok reflects actual platform Connect signup state (false until signup complete, true after)
```

## Constraints

- Do NOT modify the route at `apps/web/app/api/health/stripe/route.ts`
- Do NOT modify `checkStripeWebhookRegistered` or `checkResendConfigured`
- Do NOT add new endpoints or env vars
- Endpoint MUST be `/v1/account` (singular), NOT `/v1/accounts` (plural list)
- Capability check MUST be strict equality with `"active"` — any other value is `ok: false`
- Error messages MUST be plain language and include the dashboard URL
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
