# Sprint 117 — Minimum Charge Guard for Stripe-backed Payments

## Objective

Block any Stripe-backed payment attempt (card or ACH) when the underlying charge amount is below a sane minimum. Today, attempting to pay a tiny charge ($1, $1.34, etc.) goes through the full server action, contacts Stripe, and surfaces a generic "Payment processing is temporarily unavailable" error if the fee math, application fee math, or Stripe minimums break. We want a fast, explicit guard at the action level that returns a plain-language error before any Stripe traffic.

## Context

- Branch: `main`
- HEAD: post-Sprint 116
- Entry points live in `apps/web/app/actions/charges.ts`:
  - `payWithCard` (line 166)
  - `payWithACH` (later in file — verify exact line)
  - Both call shared `prepareCheckoutContext` (line 54)
- Manual recording path `recordPayment` (line ~318) accepts arbitrary positive cents — this stays UNCHANGED. Owners can still record a $2 cash payment manually.
- Card fee math lives in `apps/web/lib/payment-fees.ts` (`calculateCardFee`)
- Existing rate limiting, validation (`payChargeSchema`), and error envelopes are already in place — guard slots in cleanly between status checks and Stripe calls

### Why $5

- At $1 base, fee-on-fee math forces a 34% effective fee on the tenant — embarrassing
- At $1 base, if the property has a flat management fee ≥ $1, `application_fee_amount` exceeds total → Stripe 400
- $5 is the smallest amount where the fee/management-fee/payout split stays sane and looks reasonable to a tenant
- Constant should live in `lib/payment-fees.ts` as `MIN_ONLINE_PAYMENT_CENTS = 500`

## In Scope

1. New exported constant `MIN_ONLINE_PAYMENT_CENTS = 500` in `apps/web/lib/payment-fees.ts`
2. Guard inside `prepareCheckoutContext` in `apps/web/app/actions/charges.ts` — returns plain-language error if `charge.amount_cents < MIN_ONLINE_PAYMENT_CENTS`
3. Guard placed BEFORE the Stripe configuration check (no point hitting Stripe if amount is too low)
4. Tests covering the new guard

## Out of Scope

- Manual recording (`recordPayment`) — remains `> $0`
- Charge creation — owners can still create small charges; only PAYMENT is blocked
- UI changes to disable the "Pay" button — server-side guard is enough for v1; UI polish can come later
- Changing fee math
- Modifying `payChargeSchema`
- Modifying `calculateCardFee`
- Any unrelated cleanup

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/lib/payment-fees.ts` | Add `export const MIN_ONLINE_PAYMENT_CENTS = 500;` |
| `apps/web/app/actions/charges.ts` | Import constant; guard inside `prepareCheckoutContext` after status checks, before Stripe config check |
| `apps/web/app/actions/__tests__/charges.test.ts` | Tests for the new guard |

## Implementation Requirements

### 1. New Constant (`lib/payment-fees.ts`)

Near the top of the file (after imports / next to `calculateCardFee`):

```typescript
/**
 * Minimum charge amount (in cents) for online (Stripe-backed) payments.
 * Below this, fee-on-fee math becomes embarrassing for the tenant and
 * application_fee math can violate Stripe's `application_fee_amount <= total` rule.
 * Manual cash/check recording is unaffected.
 */
export const MIN_ONLINE_PAYMENT_CENTS = 500;
```

### 2. Guard Inside `prepareCheckoutContext` (`app/actions/charges.ts`)

Import the constant alongside the existing import:

```typescript
import { calculateCardFee, getManagerFeeForProperty, MIN_ONLINE_PAYMENT_CENTS } from "@/lib/payment-fees";
```

Insert the guard inside `prepareCheckoutContext` AFTER the existing `charge.status === "paid"` / `"waived"` checks (around line 97) and BEFORE the lease lookup. The placement matters: we want this to short-circuit before doing any extra DB work or contacting Stripe.

```typescript
if (charge.amount_cents < MIN_ONLINE_PAYMENT_CENTS) {
  return {
    success: false,
    error: `Online payments must be at least $${(MIN_ONLINE_PAYMENT_CENTS / 100).toFixed(2)}. For smaller amounts, please ask your owner or manager to record a cash or check payment.`
  };
}
```

**Important:**
- Use the existing `ActionState` shape (`{ success: false, error: string }`)
- Plain language — no jargon. Tells the user the amount AND the workaround
- Single message string, no internationalization yet
- Do NOT log this as an error — it's user-input validation, not a system fault

### 3. Verify No Regression in `payWithACH`

`payWithACH` shares `prepareCheckoutContext`, so it inherits the guard automatically. Codex MUST verify this by reading the `payWithACH` function and confirming it:
- Calls `prepareCheckoutContext`
- Bails out via the `isCheckoutContext` check the same way `payWithCard` does

If for any reason `payWithACH` does NOT route through `prepareCheckoutContext`, add the same guard there too. Report what you find.

### 4. Tests (`__tests__/charges.test.ts`)

Add tests covering:

1. `payWithCard` with `charge.amount_cents = 499`:
   - Returns `{ success: false, error: <message containing "$5.00"> }`
   - Does NOT call `createStripeCheckoutSession` (mock + assert not called)
   - Does NOT call `getManagerFeeForProperty`, `getOwnerStripeAccountForProperty` AFTER the guard fires (these may be called BEFORE depending on order — adjust assertion to "Stripe checkout session was not created")

2. `payWithCard` with `charge.amount_cents = 500`:
   - Proceeds past the guard (asserts the guard does NOT fire — checkout session creation IS attempted, even if the test mocks it)

3. `payWithCard` with `charge.amount_cents = 10000`:
   - Proceeds normally (existing behavior preserved)

4. (Optional) Same three cases for `payWithACH` if it exists and is testable

If the existing `charges.test.ts` already mocks `createStripeCheckoutSession`, reuse that pattern. Do NOT introduce new mocking infrastructure if existing patterns work.

### 5. Plain Language Verification

The error message must be readable by a 6th grader. Read it out loud:

> "Online payments must be at least $5.00. For smaller amounts, please ask your owner or manager to record a cash or check payment."

✓ Short sentences. ✓ Tells them the limit. ✓ Tells them the alternative. ✓ No jargon.

### 6. No Unrelated Changes

- Do NOT touch `recordPayment`
- Do NOT touch `calculateCardFee`
- Do NOT modify `payChargeSchema`
- Do NOT change rate limiting
- Do NOT add UI changes
- Do NOT add a new migration

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] `apps/web/lib/payment-fees.ts` exports `MIN_ONLINE_PAYMENT_CENTS = 500`
2. [ ] `prepareCheckoutContext` in `apps/web/app/actions/charges.ts` returns `{ success: false, error: "..." }` when `charge.amount_cents < MIN_ONLINE_PAYMENT_CENTS`
3. [ ] Error message contains the literal text `"$5.00"` (not `"500"`, not `"5.0"`, not `"$5"`)
4. [ ] Error message tells user to ask owner/manager to record cash or check for smaller amounts
5. [ ] Guard fires BEFORE Stripe checkout session creation (verified via mock not being called for amounts < $5)
6. [ ] Charges of exactly 500 cents proceed past the guard
7. [ ] Charges of 1000+ cents proceed normally (no behavior change)
8. [ ] `payWithACH` is verified to inherit the guard via `prepareCheckoutContext` (or has its own equivalent guard if it bypasses)
9. [ ] `recordPayment` (manual cash/check path) is UNCHANGED — still allows any amount > 0
10. [ ] Tests exist for: amount=499 blocked, amount=500 allowed, amount=10000 allowed
11. [ ] No new dependencies, no new files beyond test additions
12. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-12] PASS | FAIL each
notes: (any deviations, especially what payWithACH does)
```

## Constraints

- Do NOT modify the manual recording path (`recordPayment`)
- Do NOT change fee calculation logic
- Do NOT lower the threshold below 500 cents — fee math gets ugly below this
- Do NOT add a UI component for this; server-side guard only
- Plain-language error message MUST tell the user the dollar amount AND the workaround
- Place the guard BEFORE Stripe configuration check so we don't waste a Stripe round trip
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
