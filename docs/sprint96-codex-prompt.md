# Sprint 96 — Tenant Payment UX: Card Fee Passthrough + Dashboard Autopay Visibility

## Objective

Improve the tenant payment experience with two changes:
1. Replace the single "Pay with Card" button with two payment options — ACH (disabled/coming soon) and card (fee passed to tenant via Stripe destination charges with `application_fee_amount`)
2. Surface pay/autopay options on the tenant's main dashboard card (PayRentCard) so tenants don't have to dig into the Rent section

## Context

- Branch: `main`
- HEAD: `aedd260`
- Stripe is in live mode (`sk_live_`, `pk_live_`)
- Payments use Stripe Checkout (server-side redirect, no client-side Stripe.js)
- Stripe API is called via raw `fetch()` in `lib/stripe.ts` (no Stripe SDK)
- Current system uses **separate charges and transfers** — the webhook calls `createTransfersForPayment()` to manually create Stripe Transfers after payment
- Card in Stripe Checkout uses `payment_method_types: ['card']`
- Current single "Pay with Card" button is in `charge-row.tsx` lines 312-321
- `createStripeCheckoutSession` does NOT currently accept `payment_method_types`, `application_fee_amount`, or `transfer_data`
- **ACH is deferred to Sprint 97** — Stripe ACH via Checkout fires `checkout.session.async_payment_succeeded` (not `checkout.session.completed`), which requires webhook changes. This sprint adds the card fee passthrough and UI scaffolding only.

### Critical Stripe Connect Architecture Note

**This sprint switches card payments from "separate charges and transfers" to "destination charges."**

Current flow (separate charges and transfers):
```
Tenant pays → Charge on platform account → Webhook manually creates Transfer to owner
```

New flow for card payments (destination charges):
```
Tenant pays → Charge on platform → Stripe auto-transfers (total - application_fee) to owner
```

This requires:
1. Setting `payment_intent_data[transfer_data][destination]` on the Checkout session (owner's Stripe account ID)
2. Setting `payment_intent_data[application_fee_amount]` (fee the platform retains)
3. A **minimal guard** in the webhook to skip manual transfer creation when destination charges already handled the transfer

Non-card payments (autopay, future ACH) continue to use separate charges and transfers. Only the `payWithCard` path uses destination charges.

## In Scope

1. **Two payment buttons per charge** — card with fee (active) and ACH (disabled/coming soon)
2. **Fee calculation logic** using fee-on-fee formula, in a shared utility
3. **Destination charges** for card payments — `transfer_data[destination]` + `application_fee_amount` on Stripe Checkout session
4. **Minimal webhook guard** — skip manual transfer when payment used destination charges (detected via metadata flag)
5. **Dashboard PayRentCard** surfaces autopay setup when not enrolled
6. **Stripe session creation** accepts new params: `paymentMethodTypes`, `applicationFeeAmountCents`, `transferDataDestination`

## Out of Scope

- **ACH payment flow** — deferred to Sprint 97 (requires `checkout.session.async_payment_succeeded` webhook handler)
- Autopay payment method preference (separate sprint)
- Owner-configurable fee rates (hardcode for now)
- Any database migrations
- Changes to autopay processing logic

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/lib/payment-fees.ts` | **NEW** — shared fee calculation utility (single source of truth) |
| `apps/web/lib/stripe.ts` | Add `paymentMethodTypes`, `applicationFeeAmountCents`, and `transferDataDestination` params to `createStripeCheckoutSession` |
| `apps/web/app/actions/charges.ts` | Replace `createCheckoutForCharge` with `payWithCard`; resolve owner Stripe account ID for destination charge |
| `apps/web/lib/stripe-webhook-handlers.ts` | Thread `transferMode` and `baseAmountCents` from handler into `recordPayment`; record base amount for destination charges; skip manual transfers when `transferMode === 'destination'` |
| `apps/web/components/dashboard/charge-row.tsx` | Replace single "Pay with Card" button with card+fee button and disabled ACH placeholder |
| `apps/web/components/dashboard/pay-rent-card.tsx` | Add autopay CTA when tenant has charges but no autopay enrollment; show card payment option + ACH coming soon |
| `apps/web/app/tenant/page.tsx` | Pass `autopayEnrollments` data to `PayRentCard` component |
| `apps/web/components/dashboard/charges-section.tsx` | Pass new payment action props to `ChargeRow` |

## Implementation Requirements

### 1. Shared Fee Calculation Utility (`lib/payment-fees.ts`) — NEW FILE

Create a single source of truth for fee math, imported by both server actions and UI components:

```typescript
/**
 * Card processing fee: 2.9% + $0.30
 * Uses fee-on-fee formula so the collected fee exactly covers Stripe's charge
 * on the inflated total.
 *
 * Formula: totalCents = ceil((baseCents + 30) / (1 - 0.029))
 * feeCents = totalCents - baseCents
 */

const CARD_FEE_RATE = 0.029;
const CARD_FEE_FIXED_CENTS = 30;

export function calculateCardFee(baseCents: number): {
  baseCents: number;
  feeCents: number;
  totalCents: number;
} {
  const totalCents = Math.ceil(
    (baseCents + CARD_FEE_FIXED_CENTS) / (1 - CARD_FEE_RATE)
  );
  const feeCents = totalCents - baseCents;
  return { baseCents, feeCents, totalCents };
}

export function formatCentsAsDollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}
```

This file is the ONLY place fee math lives. Both `charge-row.tsx` and `charges.ts` import from here. No inline fee calculations anywhere.

### 2. Stripe Session: New Params (`lib/stripe.ts`)

Add three optional params to `createStripeCheckoutSession`:

```typescript
export async function createStripeCheckoutSession(params: {
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  transferGroup?: string;
  paymentMethodTypes?: string[];              // NEW
  applicationFeeAmountCents?: number;         // NEW — platform retains this amount
  transferDataDestination?: string;           // NEW — connected account ID for destination charge
}) {
```

In the body construction, add after the existing `transferGroup` block:

```typescript
if (params.paymentMethodTypes?.length) {
  params.paymentMethodTypes.forEach((type, idx) => {
    body.set(`payment_method_types[${idx}]`, type);
  });
}

if (params.transferDataDestination) {
  body.set('payment_intent_data[transfer_data][destination]', params.transferDataDestination);
}

if (params.applicationFeeAmountCents) {
  body.set('payment_intent_data[application_fee_amount]', String(params.applicationFeeAmountCents));
}
```

**Important:** `application_fee_amount` REQUIRES `transfer_data[destination]` to be set. These two params must always be used together. If `applicationFeeAmountCents` is set but `transferDataDestination` is not, throw an error:

```typescript
if (params.applicationFeeAmountCents && !params.transferDataDestination) {
  throw new Error('applicationFeeAmountCents requires transferDataDestination (destination charges)');
}
```

**Note:** When `transfer_data[destination]` is set, do NOT also set `transfer_group`. Destination charges and transfer groups are mutually exclusive in Stripe. The `transferGroup` param should be omitted when `transferDataDestination` is provided.

### 3. Server Action: Replace with `payWithCard` (`app/actions/charges.ts`)

**Remove** `createCheckoutForCharge` entirely. Replace with `payWithCard`:

```typescript
import { calculateCardFee } from '@/lib/payment-fees';
import { getOwnerStripeAccountForProperty } from '@/lib/stripe-connect';

export async function payWithCard(formData: FormData): Promise<ActionState | void> {
  // ... existing validation logic (auth, rate limit, charge lookup, property chain) ...
  // ... all validation from the old createCheckoutForCharge stays identical ...
  // ... property chain: charge → lease → unit → property (already exists) ...

  // Resolve owner's connected Stripe account for destination charge
  const ownerStripeAccount = await getOwnerStripeAccountForProperty(property.id);
  if (!ownerStripeAccount) {
    return { error: "This property is not ready to accept online payments yet." };
  }

  const baseCents = charge.amount_cents;
  const { feeCents, totalCents } = calculateCardFee(baseCents);

  const metadata: Record<string, string> = {
    charge_id: chargeId,
    user_id: userId,
    payment_method: 'card',
    transfer_mode: 'destination',           // FLAG for webhook guard
    processing_fee_cents: String(feeCents),
    base_amount_cents: String(baseCents),
  };

  const session = await createStripeCheckoutSession({
    amountCents: totalCents,
    metadata,
    successUrl: `${appUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/payments/cancel`,
    paymentMethodTypes: ['card'],
    transferDataDestination: ownerStripeAccount,    // Destination charge
    applicationFeeAmountCents: feeCents,             // Platform retains fee
    // NOTE: No transferGroup — not compatible with destination charges
  });

  redirect(session.url);
}
```

**How destination charges work:**
- Stripe charges the tenant `totalCents` ($2,420.49 for $2,350 rent)
- Stripe automatically transfers `totalCents - feeCents` = `baseCents` ($2,350) to the owner's connected account
- Stripe retains `feeCents` ($70.49) on the platform account
- Stripe deducts their processing fee from the platform's retained amount
- The owner receives exactly the base rent amount
- The `transfer_mode: 'destination'` metadata flag tells the webhook to skip manual transfer creation

**Also update** any imports of `createCheckoutForCharge` in other files. Search the entire `apps/web/` directory for references and update them to `payWithCard`.

### 4. Webhook Guard: Skip Manual Transfers + Correct Payment Amount for Destination Charges (`lib/stripe-webhook-handlers.ts`)

**This is a minimal, scoped change with two parts: (A) skip manual transfers, (B) record base amount, not fee-inclusive total.**

#### 4A. Metadata Threading (REQUIRED — do not skip)

In `handleCheckoutSessionCompleted` (around line 530), `session.metadata` is already read for `charge_id` and `user_id`. **Explicitly extract `transfer_mode` and `base_amount_cents` from `session.metadata` and pass them into `recordPayment`:**

```typescript
// In handleCheckoutSessionCompleted:
const transferMode = session.metadata?.transfer_mode ?? null;        // 'destination' or null
const baseAmountCents = session.metadata?.base_amount_cents
  ? parseInt(session.metadata.base_amount_cents, 10)
  : null;
```

Then pass these as new params to `recordPayment`. Add them to `recordPayment`'s params type:

```typescript
// Add to recordPayment's params:
transferMode?: string | null;
baseAmountCents?: number | null;
```

**Do NOT rely on re-reading metadata from a different object inside `recordPayment`.** Thread explicitly from the handler.

#### 4B. Record Base Amount for Destination Charges

Inside `recordPayment`, when `transferMode === 'destination'`, use `baseAmountCents` as the recorded payment amount instead of `session.amount_total`. This ensures:
- The payment record stores the rent amount ($2,350), not the fee-inclusive total ($2,420.49)
- `rent_charges.amount_cents` matches the payment amount
- No amount validation rejects the payment for exceeding the charge amount

```typescript
// Inside recordPayment, before inserting the payment record:
// Fallback: if baseAmountCents is missing/invalid for a destination charge,
// use ctx.charge.amount_cents (the rent charge amount) — never session.amount_total.
const parsedBase = (typeof baseAmountCents === 'number' && baseAmountCents > 0)
  ? baseAmountCents
  : null;
const recordedAmountCents = (transferMode === 'destination')
  ? (parsedBase ?? ctx.charge.amount_cents)
  : amountCents;

// Use recordedAmountCents (not amountCents) for:
// - The payment record insert
// - Any amount validation against the charge
```

#### 4C. Transfer Guard

At the point where `createTransfersForPayment` is called (line 489), add:

```typescript
  // Skip manual transfers for destination charges — Stripe already handled the transfer
  if (transferMode !== 'destination') {
    await createTransfersForPayment(supabase, {
      propertyId: ctx.property.id,
      chargeId: ctx.charge.id,
      amountCents,
      transferGroup,
      paymentMatch
    });
  }
```

**Note:** The `amountCents` passed to `createTransfersForPayment` for non-destination payments remains unchanged (the original `session.amount_total`). Only the payment record uses `recordedAmountCents`.

**Constraints on this change:**
- Do NOT modify ANY other logic in `createTransfersForPayment`
- Do NOT change how autopay payments or future ACH payments are transferred
- The guard checks ONLY for `transferMode === 'destination'`
- All non-destination-charge payments continue through the existing transfer path unchanged
- The only new params to `recordPayment` are `transferMode` and `baseAmountCents` — no other signature changes

### 5. Two Payment Buttons (`charge-row.tsx`)

Replace the single "Pay with Card" form (lines 312-321) with two sections when `isTenantView` is true:

```
┌─────────────────────────────────────────┐
│  Pay with debit or credit card  + fee   │
│  Includes $XX.XX processing fee         │
│  [Pay $X,XXX.XX]                        │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  Pay from bank account           FREE   │
│  Coming soon — no extra fees            │
│  [Coming Soon]  (disabled)              │
└─────────────────────────────────────────┘
```

Requirements:
- **Card button is the active primary option** (since ACH is deferred)
- Card button shows the EXACT total including fee using `calculateCardFee` and `formatCentsAsDollars` from `lib/payment-fees.ts`
- Card button also shows the fee amount separately: "Includes $XX.XX processing fee"
- Card form action = `payWithCard` (imported from actions)
- Card form contains hidden `chargeId` input
- **ACH placeholder is NOT a form** — use a `<div>` with a disabled-styled button (`type="button"`, no form action, no `<form>` wrapper). This prevents accidental submission via keyboard.
- ACH placeholder uses secondary/outline style, grayed out, with text "Coming soon — no extra fees"
- Owner view (`isTenantView === false`) keeps the existing single "Pay now" button unchanged
- Card button uses existing SubmitButton pattern (disables while submitting)
- Import `calculateCardFee, formatCentsAsDollars` from `@/lib/payment-fees`

### 6. Dashboard PayRentCard Autopay CTA (`pay-rent-card.tsx`)

When the tenant has a pending/late charge AND no active autopay enrollment for that lease:

Add below the pay button:
```
───────────── or ─────────────
Set up autopay — never think about rent again.
[Enable Autopay]
```

Requirements:
- Add `autopayEnrollments` to PayRentCardProps (optional array, type: `AutopayEnrollmentView[]`)
- Add `onSetupAutopay` to PayRentCardProps (optional `StatefulAction`)
- Check if the most urgent charge's `leaseId` has an active autopay enrollment
- "Active enrollment" means: an entry exists in the array where `leaseId` matches AND `enabled === true`
- If NO active enrollment AND no paused enrollment: show the autopay CTA with a form that calls `onSetupAutopay`
- If paused enrollment (`enabled === false`): show "Autopay paused — update your card to re-enable" with the re-enable form
- If active enrollment (`enabled === true`): show "Autopay is on" badge (green) with card brand + last4
- Also show the card payment option (with fee) on the dashboard PayRentCard, using the same `payWithCard` action and fee display as charge-row

### 7. Tenant Page Data Plumbing (`app/tenant/page.tsx`)

Pass `autopayEnrollments` and `onSetupAutopay` to the `PayRentCard` component. These are already fetched in the tenant page data — they just need to be threaded through as props.

### 8. Plain Language (CLAUDE.md §18)

All user-facing text must follow the plain language rule:
- "Pay with debit or credit card" (not "Card payment")
- "Includes $XX.XX processing fee" (not "Convenience surcharge applied")
- "Pay from bank account" (not "ACH bank transfer")
- "Coming soon — no extra fees" (not "ACH unavailable")
- "processing fee" (not "convenience fee" or "surcharge")
- "Set up autopay — never think about rent again." (not "Enable automatic recurring payment enrollment")
- "Your card will be charged automatically each month." (not "Recurring billing will be initiated")
- "Autopay paused — update your card to re-enable" (not "Enrollment suspended due to payment method failure")

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] **NEW FILE** `lib/payment-fees.ts` — exports `calculateCardFee` and `formatCentsAsDollars`; uses fee-on-fee formula `ceil((base + 30) / (1 - 0.029))`
2. [ ] `lib/stripe.ts` — `createStripeCheckoutSession` accepts optional `paymentMethodTypes`, `applicationFeeAmountCents`, and `transferDataDestination` params
3. [ ] `lib/stripe.ts` — when `transferDataDestination` is set, includes `payment_intent_data[transfer_data][destination]` in Stripe API call
4. [ ] `lib/stripe.ts` — when `applicationFeeAmountCents` is set, includes `payment_intent_data[application_fee_amount]` in Stripe API call
5. [ ] `lib/stripe.ts` — throws error if `applicationFeeAmountCents` is set without `transferDataDestination`
6. [ ] `lib/stripe.ts` — does NOT set `transfer_group` when `transferDataDestination` is provided (mutually exclusive)
7. [ ] `app/actions/charges.ts` — old `createCheckoutForCharge` removed; replaced by `payWithCard`
8. [ ] `app/actions/charges.ts` — `payWithCard` resolves owner Stripe account via `getOwnerStripeAccountForProperty` and passes it as `transferDataDestination`
9. [ ] `app/actions/charges.ts` — `payWithCard` uses `calculateCardFee` from shared utility, sets `applicationFeeAmountCents` on session
10. [ ] `app/actions/charges.ts` — `payWithCard` includes `transfer_mode: 'destination'`, `processing_fee_cents`, and `base_amount_cents` in metadata
11. [ ] `lib/stripe-webhook-handlers.ts` — `handleCheckoutSessionCompleted` extracts `transfer_mode` and `base_amount_cents` from `session.metadata` and passes them explicitly to `recordPayment` as new params
12. [ ] `lib/stripe-webhook-handlers.ts` — `recordPayment` accepts new optional params `transferMode` and `baseAmountCents`
13. [ ] `lib/stripe-webhook-handlers.ts` — when `transferMode === 'destination'`, payment record uses `baseAmountCents` (not `session.amount_total`) as the stored payment amount; falls back to `ctx.charge.amount_cents` if `baseAmountCents` is missing, NaN, or non-positive
14. [ ] `lib/stripe-webhook-handlers.ts` — guard added before `createTransfersForPayment` call: skips manual transfer when `transferMode === 'destination'`
15. [ ] `lib/stripe-webhook-handlers.ts` — non-destination-charge payments (autopay, future ACH) are completely unaffected — no behavior change
16. [ ] `lib/stripe-webhook-handlers.ts` — NO other changes to `createTransfersForPayment` internals, XP, notifications, or payment recording logic beyond the two additions above
17. [ ] `charge-row.tsx` — tenant view shows card payment button with fee-inclusive total AND fee amount displayed separately
18. [ ] `charge-row.tsx` — tenant view shows disabled ACH placeholder (div with `type="button"`, no form wrapper, not submittable)
19. [ ] `charge-row.tsx` — fee displayed on card button matches server-side calculation exactly (both use `calculateCardFee`)
20. [ ] `charge-row.tsx` — owner view retains single "Pay now" button (unchanged)
21. [ ] `pay-rent-card.tsx` — shows autopay CTA when tenant has charges but no active enrollment (`enabled === true`)
22. [ ] `pay-rent-card.tsx` — shows "Autopay is on" badge with card last4 when enrollment active
23. [ ] `pay-rent-card.tsx` — shows "Autopay paused" state when enrollment exists but `enabled === false`
24. [ ] `pay-rent-card.tsx` — card payment option with fee visible on dashboard card
25. [ ] `tenant/page.tsx` — passes `autopayEnrollments` and `onSetupAutopay` to PayRentCard
26. [ ] All user-facing text follows plain language rules (no jargon, 6th grade reading level)
27. [ ] `gate:web` passes (lint + typecheck + build)
28. [ ] No references to old `createCheckoutForCharge` remain in any file

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-28] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Webhook change is LIMITED to: (1) threading `transferMode` and `baseAmountCents` from `handleCheckoutSessionCompleted` into `recordPayment`, (2) using `baseAmountCents` for the payment record when `transferMode === 'destination'`, (3) skipping `createTransfersForPayment` when `transferMode === 'destination'`. No other webhook behavior changes.
- Do NOT modify `createTransfersForPayment` function internals
- Do NOT modify autopay processing logic (`autopay.ts`, `stripe-autopay.ts`)
- Do NOT create database migrations
- Do NOT modify `auth/callback`, `middleware.ts`, or any auth files
- Do NOT implement ACH payment flow — ACH placeholder must be a non-submittable div, not a form
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
- The user should never need to read instructions to complete any flow. Every step must be self-explanatory.
- Fee calculation MUST use the shared `lib/payment-fees.ts` utility in ALL locations — no inline math.
- `transfer_group` and `transfer_data[destination]` are mutually exclusive — never set both on the same session.
