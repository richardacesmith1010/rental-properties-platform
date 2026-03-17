# Sprint 40 — Codex Implementation Prompt

## 1. Objective

Harden error recovery and resilience across the app: unified retry utility, Promise.allSettled migration for critical parallel operations, expanded side-effect error logging, and Stripe graceful degradation.

## 2. Context

- **Branch**: `main`
- **HEAD**: `cb0e5a2`
- **Gate baseline**: 509/509 unit tests, lint clean, typecheck clean, build clean
- **Production URL**: `https://domusbase.com`
- **Supabase project**: `vawqdqkaguhdgfhdebqw`
- **Key existing patterns**:
  - `lib/logger.ts` — `logFailedSideEffect()`, `sideEffectError()` for fire-and-forget error capture
  - `lib/supabase-errors.ts` — `isMissingSchemaError()` for schema drift detection
  - `lib/feature-capabilities.ts` — graceful degradation when tables/columns missing
  - `lib/rate-limit.ts` — sliding-window rate limiter
  - Error boundaries at `app/error.tsx`, `app/global-error.tsx`, role-specific error files
  - `components/dashboard/section-error-boundary.tsx` — class component error boundary for dashboard sections
  - 6 `Promise.all()` calls in actions that crash on single-query failure
  - Only 6/36 action files use `sideEffectError()` pattern

## 3. In Scope

### Part A: Unified Retry Utility
- New `lib/retry.ts` with exponential backoff helper

### Part B: Promise.allSettled Migration
- Convert 6 critical `Promise.all()` calls to `Promise.allSettled()` with per-result error handling

### Part C: Expanded Side-Effect Error Logging
- Add `sideEffectError()` wrapping to notification/logging fire-and-forget calls in action files that are missing it

### Part D: Stripe Graceful Degradation
- When Stripe is unreachable or keys are missing, payment-related UI should show a clear "payments unavailable" state instead of crashing

### Part E: Unit Tests
- Tests for retry utility
- Tests for Promise.allSettled error handling in at least one action

## 4. Out of Scope

- External error tracking services (Sentry, Datadog)
- Global `unhandledRejection` handler (Next.js handles this)
- New error boundary components (existing coverage is complete)
- Loading state changes (coverage is complete)
- Database migrations
- E2E test modifications
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (2)
1. `apps/web/lib/retry.ts`
2. `apps/web/lib/__tests__/retry.test.ts`

### Modified Files (8-12)
1. `apps/web/app/actions/withdrawals.ts` — Promise.allSettled migration
2. `apps/web/app/actions/ownership.ts` — Promise.allSettled migration
3. `apps/web/app/actions/maintenance.ts` — Promise.allSettled + expand sideEffectError
4. `apps/web/app/actions/document-packets.ts` — Promise.allSettled migration
5. `apps/web/app/actions/leasing.ts` — Promise.allSettled migration
6. `apps/web/app/actions/account-wipe.ts` — Promise.allSettled migration
7. `apps/web/app/actions/charges.ts` — expand sideEffectError to uncovered side effects
8. `apps/web/app/actions/notifications.ts` — expand sideEffectError
9. `apps/web/app/actions/units.ts` — expand sideEffectError
10. `apps/web/app/actions/properties.ts` — expand sideEffectError
11. `apps/web/app/actions/expenses.ts` — expand sideEffectError
12. `apps/web/components/dashboard/payments-section.tsx` (or equivalent) — Stripe degradation UI

## 6. Implementation Requirements

### Part A: Unified Retry Utility

**New file**: `apps/web/lib/retry.ts`

```typescript
export interface RetryOptions {
  maxAttempts?: number;        // default: 3
  baseDelayMs?: number;        // default: 500
  maxDelayMs?: number;         // default: 5000
  backoffMultiplier?: number;  // default: 2
  retryIf?: (error: unknown) => boolean;  // optional predicate
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 5000,
    backoffMultiplier = 2,
    retryIf
  } = options ?? {};

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (retryIf && !retryIf(error)) {
        throw error;  // non-retryable
      }

      if (attempt === maxAttempts) {
        throw error;  // exhausted
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;  // unreachable, but satisfies TypeScript
}
```

**Key points:**
- Generic return type preserves caller's type
- `retryIf` predicate lets callers skip retries for auth errors, validation errors, etc.
- Exponential backoff with configurable cap
- No external dependencies

### Part B: Promise.allSettled Migration

For each of the 6 `Promise.all()` calls, convert to `Promise.allSettled()` and handle per-result:

**Pattern to follow:**

```typescript
// BEFORE (crashes on any single failure):
const [propertyResult, managersResult, profileResult] = await Promise.all([
  supabase.from("properties").select("*").eq("id", propertyId).single(),
  supabase.from("property_managers").select("*").eq("property_id", propertyId),
  supabase.from("profiles").select("*").eq("id", userId).single()
]);

// AFTER (handles individual failures):
const [propertySettled, managersSettled, profileSettled] = await Promise.allSettled([
  supabase.from("properties").select("*").eq("id", propertyId).single(),
  supabase.from("property_managers").select("*").eq("property_id", propertyId),
  supabase.from("profiles").select("*").eq("id", userId).single()
]);

const propertyResult = propertySettled.status === "fulfilled" ? propertySettled.value : null;
const managersResult = managersSettled.status === "fulfilled" ? managersSettled.value : null;
const profileResult = profileSettled.status === "fulfilled" ? profileSettled.value : null;

// Check for critical failures — some queries may be required vs optional
if (!propertyResult?.data) {
  return { error: "Unable to load property data. Please try again." };
}
```

**IMPORTANT**: Not all parallel queries are equal. For each `Promise.all` site:
- Identify which queries are **required** (action cannot proceed without them) vs **optional** (nice-to-have data)
- Required query failures → return user-facing error message
- Optional query failures → log with `sideEffectError` pattern, continue with null data

**Specific files:**

1. **`withdrawals.ts`** (line ~332): `canUserAdministerOwnershipAccount`, `ownership_accounts.select()`, `getActiveMembers()` — all 3 are required for withdrawal approval. Convert to allSettled, return error if any fail.

2. **`ownership.ts`** (line ~138): `canUserAdministerProperty()`, `canUserAdministerOwnershipAccount()` — both required for permission check. Convert to allSettled, deny access if either fails.

3. **`maintenance.ts`** (line ~101): `properties.select()`, `property_managers.select()`, `profiles.select()` — property is required, managers and profile are optional for notifications. Convert accordingly.

4. **`document-packets.ts`** (lines ~41, ~164): template/lease and signer queries — all required. Convert, return error if any fail.

5. **`leasing.ts`** (line ~286): applicant profile and listing data — both required. Convert, return error if either fails.

6. **`account-wipe.ts`** (lines ~131, ~222): account IDs and property IDs — both required for safe deletion. Convert, return error if either fails.

### Part C: Expanded Side-Effect Error Logging

Find all fire-and-forget async calls (notification sends, logging, analytics) in action files that don't use `sideEffectError()`. Wrap them.

**Pattern:**
```typescript
// BEFORE (silent failure):
void sendNotification(supabase, userId, message);

// AFTER (logged failure):
void sendNotification(supabase, userId, message)
  .catch(sideEffectError("actionName", "send_notification", {
    userId,
    entityType: "notification"
  }));
```

Focus on these action files that are currently missing the pattern:
- `charges.ts`
- `notifications.ts`
- `units.ts`
- `properties.ts`
- `expenses.ts`
- `onboarding.ts`
- `vendors.ts`
- `lease-lifecycle-actions.ts` (verify — may already have some)

Read each file, find fire-and-forget calls (lines with `void someAsyncFn(...)` or bare async calls without await), and add `.catch(sideEffectError(...))`.

### Part D: Stripe Graceful Degradation

Add a Stripe availability check that payment-related components can use:

**In `apps/web/lib/env.ts`**, add:
```typescript
export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  );
}
```

**In payment-related components** (wherever Stripe Elements or payment buttons are rendered), check `isStripeConfigured()` or pass a prop from the server component. If Stripe is not configured, show an informational message instead of attempting to load Stripe JS:

```typescript
// Example pattern for payment sections:
if (!stripeConfigured) {
  return (
    <Alert variant="warning">
      Payment processing is temporarily unavailable. Please try again later.
    </Alert>
  );
}
```

Check these files for Stripe usage and add degradation:
- `apps/web/components/dashboard/payments-section.tsx` (or wherever payment UI lives)
- Any component that imports from `@stripe/stripe-js` or `@stripe/react-stripe-js`
- The connect/onboard flow

**IMPORTANT**: Don't break existing Stripe functionality. Only add a guard that shows a message when Stripe env vars are missing. When they're present, everything works exactly as before.

### Part E: Unit Tests

**New file**: `apps/web/lib/__tests__/retry.test.ts`

Write 6-8 tests:
1. Succeeds on first attempt — no retry
2. Succeeds on second attempt after first failure
3. Throws after exhausting maxAttempts
4. Respects retryIf predicate — doesn't retry non-retryable errors
5. Applies exponential backoff (mock setTimeout, verify delay progression)
6. Respects maxDelayMs cap
7. Works with default options (no options passed)

## 7. Validation Commands to Run

```bash
npm run gate:web
```

Must pass. No E2E changes in this sprint.

## 8. Acceptance Criteria

1. [ ] `withRetry()` utility exists at `lib/retry.ts` with exponential backoff, configurable attempts, and `retryIf` predicate
2. [ ] All 6 `Promise.all()` calls converted to `Promise.allSettled()` with per-result error handling
3. [ ] Required vs optional query failures are distinguished — required failures return user error, optional failures are logged
4. [ ] Fire-and-forget side effects in 6+ additional action files now use `sideEffectError()` pattern
5. [ ] `isStripeConfigured()` helper exists in `lib/env.ts`
6. [ ] Payment UI shows graceful "unavailable" message when Stripe is not configured
7. [ ] Retry utility has 6+ passing unit tests
8. [ ] `npm run gate:web` passes — all 509+ unit tests, lint, typecheck, build clean
9. [ ] No behavioral regressions — existing features work identically when services are available

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
PROMISE_ALL_SITES_CONVERTED: x/6
SIDE_EFFECT_FILES_HARDENED: x files
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT apply any database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections — report compact status only
- Do NOT change behavior when services ARE available — only add degradation when they're NOT
- Do NOT add global unhandledRejection handlers
- The retry utility must NOT be used to wrap Supabase queries by default (Supabase handles its own retries). It's for external service calls (Stripe, Resend, Plaid) and explicit retry scenarios
- Promise.allSettled migration must preserve the exact same success-path behavior — only error paths change
