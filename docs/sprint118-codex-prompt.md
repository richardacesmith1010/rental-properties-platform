# Sprint 118 — Honest Errors for Stripe Payment Failures

## Objective

Replace the generic "Payment processing is temporarily unavailable" error with a categorized response that:
1. Tells the tenant something actionable based on what actually went wrong
2. Notifies the property owner when their Stripe account is the cause (so they can reconnect)
3. Alerts the platform admin when the failure is platform-level (so the admin finds out within minutes, not after a complaint)

Today, every Stripe failure — owner's account deleted, Connect not enabled, transient network blip, missing webhook secret — produces the same opaque error to the tenant. Owners and the platform admin don't find out until someone complains. This sprint fixes that.

## Context

- Branch: `main`
- HEAD: post-Sprint 117 (commit `24d313f`)
- Catch blocks live in `apps/web/app/actions/charges.ts`:
  - `payWithCard` line ~235 → returns `PAYMENTS_UNAVAILABLE_MESSAGE`
  - `payWithACH` line ~310 → returns `PAYMENTS_UNAVAILABLE_MESSAGE`
- Existing infrastructure to reuse:
  - `notifyOwnerMembersForProperty` in `apps/web/lib/notifications.ts` line 329
  - Resend email via `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (see `apps/web/lib/env.ts`)
  - `sideEffectError` logger in `apps/web/lib/logger.ts`
- Real Stripe error patterns observed in production:
  - `"No such destination: 'acct_xxx'"` → owner's Stripe account is invalid (deleted or never existed)
  - `"You can only create new accounts if you've signed up for Connect"` → platform's Connect setup is incomplete
  - `"fetch failed"`, `"Stripe ... failed: 5xx"` → transient network/Stripe outage
  - Anything else → unknown/generic

## In Scope

1. **New module** `apps/web/lib/stripe-errors.ts`:
   - `StripeErrorCategory` type
   - `categorizeStripeError(error: unknown): StripeErrorCategory` — pattern-match the error message
   - `userMessageForCategory(category: StripeErrorCategory): string` — plain-language tenant message
2. **New module** `apps/web/lib/platform-alerts.ts`:
   - `sendPlatformAlert(params: { subject, body, dedupeKey })` — emails the platform admin via Resend with built-in dedupe (1 alert per `dedupeKey` per hour)
3. **New env capability** in `apps/web/lib/env.ts`:
   - Read `PLATFORM_ALERT_EMAIL`; if missing, fall back to `RESEND_FROM_EMAIL`
4. **Wire categorization into catch blocks** of `payWithCard` and `payWithACH`:
   - Use `userMessageForCategory` for the tenant response
   - For `owner_not_connected`: notify owner via `notifyOwnerMembersForProperty`
   - For `platform_misconfigured`: send platform alert
   - For `transient` and `unknown`: log only (existing behavior)
5. **Tests** for the new module and the integration

## Out of Scope

- Refund flow
- Owner-facing UI banner ("your bank had an issue")
- Stale account daily cron (that's Sprint 119)
- Retry queues
- Modifying webhook handlers
- Changing successful payment flow
- Platform alert UI dashboard

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/lib/stripe-errors.ts` | **NEW** — category type, `categorizeStripeError`, `userMessageForCategory` |
| `apps/web/lib/platform-alerts.ts` | **NEW** — `sendPlatformAlert` with in-memory dedupe |
| `apps/web/lib/env.ts` | Add `PLATFORM_ALERT_EMAIL` to env capabilities map |
| `apps/web/app/actions/charges.ts` | Replace `PAYMENTS_UNAVAILABLE_MESSAGE` returns in both catch blocks with categorized handling |
| `apps/web/lib/notifications.ts` | Add `notifyOwnerOfStripeIssue` helper (small wrapper around `notifyOwnerMembersForProperty`) |
| `apps/web/lib/__tests__/stripe-errors.test.ts` | **NEW** — unit tests for categorizer + messages |
| `apps/web/lib/__tests__/platform-alerts.test.ts` | **NEW** — unit tests for dedupe + email send |
| `apps/web/app/actions/__tests__/charges.test.ts` | Extend — assert correct message + side effects per category |

## Implementation Requirements

### 1. `lib/stripe-errors.ts` — Categorizer

```typescript
export type StripeErrorCategory =
  | "transient"
  | "owner_not_connected"
  | "platform_misconfigured"
  | "unknown";

const TRANSIENT_PATTERNS = [
  /fetch failed/i,
  /network/i,
  /timeout/i,
  /timed out/i,
  /econnreset/i,
  /socket/i,
  /Stripe .* failed: 5\d\d/i
];

const OWNER_NOT_CONNECTED_PATTERNS = [
  /No such destination/i,
  /resource_missing.*destination/i,
  /destination.*does not exist/i,
  /account_invalid/i
];

const PLATFORM_MISCONFIGURED_PATTERNS = [
  /signed up for Connect/i,
  /Connect.*not.*enabled/i,
  /platform.*not.*configured/i
];

export function categorizeStripeError(error: unknown): StripeErrorCategory {
  const message = error instanceof Error ? error.message : String(error);
  if (PLATFORM_MISCONFIGURED_PATTERNS.some((p) => p.test(message))) {
    return "platform_misconfigured";
  }
  if (OWNER_NOT_CONNECTED_PATTERNS.some((p) => p.test(message))) {
    return "owner_not_connected";
  }
  if (TRANSIENT_PATTERNS.some((p) => p.test(message))) {
    return "transient";
  }
  return "unknown";
}

export function userMessageForCategory(category: StripeErrorCategory): string {
  switch (category) {
    case "transient":
      return "Our payment processor is having trouble right now. Please try again in a few minutes.";
    case "owner_not_connected":
      return "We can't connect to your owner's bank right now. We've notified them — please try again in a few hours, or message your property manager.";
    case "platform_misconfigured":
      return "Online payments are being set up. We've been notified and will fix this as fast as we can. Please try again later.";
    case "unknown":
      return "Something went wrong with your payment. Please try again, or message your property manager.";
  }
}
```

**Important:**
- Patterns ordered by specificity: platform check first (most specific), then owner, then transient, then fallback
- All patterns must use `i` flag for case-insensitivity
- Plain-language messages, max 12 words per sentence

### 2. `lib/platform-alerts.ts` — Platform Admin Email

```typescript
import { sendEmail } from "./email"; // or wherever Resend is wrapped — verify existing helper
// If no shared email helper exists, call Resend directly via the same pattern used elsewhere

const DEDUPE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const recentAlerts = new Map<string, number>();

function isInDedupeWindow(dedupeKey: string): boolean {
  const last = recentAlerts.get(dedupeKey);
  if (!last) return false;
  return Date.now() - last < DEDUPE_WINDOW_MS;
}

function markAlerted(dedupeKey: string): void {
  recentAlerts.set(dedupeKey, Date.now());
}

export async function sendPlatformAlert(params: {
  subject: string;
  body: string;
  dedupeKey: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (isInDedupeWindow(params.dedupeKey)) {
    return { sent: false, reason: "deduped" };
  }

  const to = process.env.PLATFORM_ALERT_EMAIL || process.env.RESEND_FROM_EMAIL;
  if (!to) {
    return { sent: false, reason: "no_recipient_configured" };
  }

  try {
    await sendEmail({
      to,
      subject: `[Domus Platform Alert] ${params.subject}`,
      body: params.body
    });
    markAlerted(params.dedupeKey);
    return { sent: true };
  } catch (error) {
    console.error("[platform-alerts] failed to send:", error);
    return { sent: false, reason: "send_failed" };
  }
}
```

**Codex MUST:**
- Search the codebase for the existing email helper (`grep -r "sendEmail\|resend" apps/web/lib`)
- Use whatever pattern already exists for sending email via Resend
- If there's no shared helper, write the Resend call inline using the same pattern used in the webhook handlers or notifications module
- Process-level Map is fine for in-memory dedupe (Vercel functions are short-lived, but a 1-hour window covers most retry storms)

### 3. `lib/env.ts` — Add `PLATFORM_ALERT_EMAIL`

Inside the existing capabilities/configured map, add:

```typescript
PLATFORM_ALERT_EMAIL: Boolean(process.env.PLATFORM_ALERT_EMAIL)
```

Place it next to the existing `RESEND_*` entries. This is a soft-optional env var — if unset, `sendPlatformAlert` falls back to `RESEND_FROM_EMAIL`.

### 4. `lib/notifications.ts` — Owner Notification Helper

Add after `notifyOwnerMembersForProperty`:

```typescript
export async function notifyOwnerOfStripeIssue(params: {
  propertyId: string;
  category: "owner_not_connected" | "transient" | "platform_misconfigured" | "unknown";
}): Promise<void> {
  if (params.category !== "owner_not_connected") {
    return; // only notify owner for issues they can fix
  }

  await notifyOwnerMembersForProperty({
    propertyId: params.propertyId,
    title: "Bank connection issue",
    body: "We tried to send a tenant payment to your bank but it didn't go through. Please reconnect your bank in Settings.",
    category: "stripe_issue", // or whatever the existing category convention is — verify
    deepLink: "/connect/onboard"
  });
}
```

**Codex MUST verify** the actual signature of `notifyOwnerMembersForProperty` and adapt the call to match. If `category` and `deepLink` aren't supported, omit them.

### 5. `app/actions/charges.ts` — Wire It Up

Replace the catch block in `payWithCard` (currently at line 235-242):

```typescript
} catch (error) {
  sideEffectError("payWithCard", "start_stripe_checkout", {
    userId,
    entityType: "rent_charge",
    entityId: charge.id
  })(error);

  const category = categorizeStripeError(error);

  // Side effects (fire-and-forget — don't block the user response)
  if (category === "owner_not_connected") {
    notifyOwnerOfStripeIssue({ propertyId, category }).catch((err) =>
      console.error("[payWithCard] failed to notify owner:", err)
    );
  } else if (category === "platform_misconfigured") {
    sendPlatformAlert({
      subject: "Stripe Connect platform issue",
      body: `payWithCard failed for charge ${charge.id} (property ${propertyId}). Error: ${error instanceof Error ? error.message : String(error)}`,
      dedupeKey: `platform_misconfigured:payWithCard`
    }).catch((err) => console.error("[payWithCard] failed to send platform alert:", err));
  }

  return { success: false, error: userMessageForCategory(category) };
}
```

Apply the same pattern to `payWithACH` (line ~310). Use `dedupeKey: "platform_misconfigured:payWithACH"` to allow separate dedupe per action.

**Important:**
- Keep the existing `sideEffectError` log call — categorization is additive
- Side-effect notifications are `.catch`-wrapped so they never break the user response
- The `PAYMENTS_UNAVAILABLE_MESSAGE` constant can be removed once no callers reference it (verify with grep before deleting)

### 6. Tests

#### `lib/__tests__/stripe-errors.test.ts`

```typescript
import { categorizeStripeError, userMessageForCategory } from "../stripe-errors";

describe("categorizeStripeError", () => {
  it("identifies platform misconfiguration errors", () => {
    const cases = [
      "You can only create new accounts if you've signed up for Connect",
      "Stripe Connect not enabled",
      "Platform is not configured for Connect"
    ];
    cases.forEach((msg) => {
      expect(categorizeStripeError(new Error(msg))).toBe("platform_misconfigured");
    });
  });

  it("identifies owner-not-connected errors", () => {
    const cases = [
      "No such destination: 'acct_xxx'",
      "resource_missing: destination does not exist",
      "account_invalid"
    ];
    cases.forEach((msg) => {
      expect(categorizeStripeError(new Error(msg))).toBe("owner_not_connected");
    });
  });

  it("identifies transient errors", () => {
    const cases = ["fetch failed", "network timeout", "Stripe API failed: 503"];
    cases.forEach((msg) => {
      expect(categorizeStripeError(new Error(msg))).toBe("transient");
    });
  });

  it("falls back to unknown for unrecognized errors", () => {
    expect(categorizeStripeError(new Error("some weird error"))).toBe("unknown");
  });

  it("handles non-Error inputs", () => {
    expect(categorizeStripeError("plain string")).toBe("unknown");
    expect(categorizeStripeError(null)).toBe("unknown");
    expect(categorizeStripeError(undefined)).toBe("unknown");
  });
});

describe("userMessageForCategory", () => {
  it("returns plain-language messages with no jargon", () => {
    const transient = userMessageForCategory("transient");
    expect(transient).toMatch(/try again/i);
    expect(transient).not.toMatch(/internal|HTTP|API|stack/i);

    const ownerIssue = userMessageForCategory("owner_not_connected");
    expect(ownerIssue).toMatch(/owner|manager/i);

    const platformIssue = userMessageForCategory("platform_misconfigured");
    expect(platformIssue).toMatch(/being set up/i);
  });
});
```

#### `lib/__tests__/platform-alerts.test.ts`

```typescript
import { sendPlatformAlert } from "../platform-alerts";

// Mock the email sender
jest.mock("../email", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined)
}));

describe("sendPlatformAlert", () => {
  beforeEach(() => {
    process.env.PLATFORM_ALERT_EMAIL = "admin@example.com";
    jest.clearAllMocks();
  });

  it("sends email with prefixed subject", async () => {
    const result = await sendPlatformAlert({
      subject: "Test issue",
      body: "Body text",
      dedupeKey: "test:1"
    });
    expect(result.sent).toBe(true);
    // Assert sendEmail called with subject "[Domus Platform Alert] Test issue"
  });

  it("dedupes within 1-hour window", async () => {
    await sendPlatformAlert({ subject: "X", body: "Y", dedupeKey: "dedup_key" });
    const second = await sendPlatformAlert({ subject: "X", body: "Y", dedupeKey: "dedup_key" });
    expect(second.sent).toBe(false);
    expect(second.reason).toBe("deduped");
  });

  it("returns no_recipient_configured when env vars are missing", async () => {
    delete process.env.PLATFORM_ALERT_EMAIL;
    delete process.env.RESEND_FROM_EMAIL;
    const result = await sendPlatformAlert({
      subject: "X",
      body: "Y",
      dedupeKey: "no_recipient_test"
    });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("no_recipient_configured");
  });

  it("falls back to RESEND_FROM_EMAIL when PLATFORM_ALERT_EMAIL is unset", async () => {
    delete process.env.PLATFORM_ALERT_EMAIL;
    process.env.RESEND_FROM_EMAIL = "fallback@example.com";
    const result = await sendPlatformAlert({
      subject: "X",
      body: "Y",
      dedupeKey: "fallback_test"
    });
    expect(result.sent).toBe(true);
    // Assert sendEmail called with to: "fallback@example.com"
  });
});
```

#### `app/actions/__tests__/charges.test.ts`

Extend with cases verifying:
- When Stripe throws "No such destination" → tenant gets `owner_not_connected` message + owner notification was attempted
- When Stripe throws "signed up for Connect" → tenant gets `platform_misconfigured` message + platform alert was attempted
- When Stripe throws "fetch failed" → tenant gets `transient` message + no notifications fire
- When Stripe throws an unknown error → tenant gets `unknown` message + no notifications fire

Mock both `notifyOwnerOfStripeIssue` and `sendPlatformAlert` to avoid side effects in tests.

### 7. Plain Language Verification

Read each user-facing message out loud. They should sound like a friendly text from a competent friend, not a corporate apology:

- ✓ "Our payment processor is having trouble right now. Please try again in a few minutes."
- ✓ "We can't connect to your owner's bank right now. We've notified them — please try again in a few hours, or message your property manager."
- ✓ "Online payments are being set up. We've been notified and will fix this as fast as we can. Please try again later."
- ✓ "Something went wrong with your payment. Please try again, or message your property manager."

No "processing", "transaction", "merchant", or "facility." Every message tells the user what to do next.

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] `apps/web/lib/stripe-errors.ts` exports `StripeErrorCategory`, `categorizeStripeError`, `userMessageForCategory`
2. [ ] `categorizeStripeError` correctly classifies: platform misconfig, owner not connected, transient, unknown
3. [ ] `userMessageForCategory` returns plain-language messages (no jargon, max 12 words per sentence)
4. [ ] `apps/web/lib/platform-alerts.ts` exports `sendPlatformAlert` with `{ sent, reason? }` return shape
5. [ ] `sendPlatformAlert` dedupes per `dedupeKey` within a 1-hour window
6. [ ] `sendPlatformAlert` reads `PLATFORM_ALERT_EMAIL` first, falls back to `RESEND_FROM_EMAIL`
7. [ ] `sendPlatformAlert` returns `{ sent: false, reason: "no_recipient_configured" }` when both env vars are missing
8. [ ] `apps/web/lib/env.ts` includes `PLATFORM_ALERT_EMAIL` in capabilities map
9. [ ] `apps/web/lib/notifications.ts` exports `notifyOwnerOfStripeIssue` that only fires for `owner_not_connected`
10. [ ] `payWithCard` catch block uses `categorizeStripeError` + `userMessageForCategory` and triggers correct side effect per category
11. [ ] `payWithACH` catch block uses the same categorization with distinct platform-alert dedupe key
12. [ ] Side effects are `.catch`-wrapped so notification failures never break the user response
13. [ ] Existing `sideEffectError` log call is preserved in both catch blocks
14. [ ] Tests cover: all four categories in categorizer, all four user messages, dedupe behavior, env var fallback
15. [ ] `gate:web` passes
16. [ ] No new dependencies added (Resend already wired)

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-16] PASS | FAIL each
notes: (any deviations, especially what email helper you used)
```

## Constraints

- Do NOT modify successful payment flow
- Do NOT modify webhook handlers
- Do NOT change `prepareCheckoutContext` (Sprint 117 just added a guard there)
- Do NOT add UI components — server-side only
- Do NOT add new npm dependencies
- Plain-language messages MUST tell the tenant what to do next
- Side effects (notifications, alerts) MUST be `.catch`-wrapped — they cannot break the response
- Process-level dedupe Map is fine; do NOT add Redis or persistent storage
- Categorization patterns MUST be ordered by specificity (platform → owner → transient → unknown)
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
