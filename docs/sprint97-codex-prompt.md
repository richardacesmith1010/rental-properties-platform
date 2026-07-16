# Sprint 97 — ACH Payment Support + Tenant Empty State Fix

## Objective

Enable tenants to pay rent via bank account (ACH) at no extra fee, and fix the misleading "No payments due" empty state for tenants without a lease.

## Context

- Branch: `main`
- HEAD: `446e03a` (Sprint 96)
- Stripe is in live mode (`sk_live_`, `pk_live_`)
- Sprint 96 shipped card payments with destination charges + fee passthrough
- ACH placeholder buttons exist in `charge-row.tsx` (lines 350-370) and `pay-rent-card.tsx` (lines 216-232) — currently disabled with "Coming Soon"
- The webhook route (`api/webhooks/stripe/route.ts`) handles 4 events; `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed` are NOT handled
- `handleCheckoutSessionCompleted` exits early when `payment_status !== 'paid'` (line 614) — ACH sessions complete with `payment_status: 'unpaid'`, so they silently drop
- `handleCheckoutSessionCompleted` currently hardcodes `method: "card"` — this must be changed to read from `session.metadata.payment_method` so instant ACH payments are recorded with the correct method
- ACH uses **separate charges and transfers** (NOT destination charges) — no fee to retain, full amount transfers to owner
- `createStripeCheckoutSession` already accepts `paymentMethodTypes` (Sprint 96)

### ACH Payment Lifecycle in Stripe Checkout

```
Tenant clicks "Pay from bank account"
  → Stripe Checkout session with payment_method_types: ['us_bank_account']
  → Tenant enters bank details or uses Instant Verification
  → checkout.session.completed fires with payment_status: 'unpaid' (NOT 'paid')
  → 4-5 business days pass
  → checkout.session.async_payment_succeeded fires (payment cleared)
     OR checkout.session.async_payment_failed fires (payment bounced)
```

**Key:** We must NOT mark the charge as paid on `checkout.session.completed` for ACH. We mark it as paid only when `async_payment_succeeded` fires.

## In Scope

1. **New server action `payWithACH`** — creates Stripe Checkout session restricted to `us_bank_account`, no fee, uses separate charges + transfers
2. **New webhook handlers** for `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`
3. **Enable ACH placeholder buttons** in `charge-row.tsx` and `pay-rent-card.tsx`
4. **Payment success page** — handle "processing" state for ACH (show "Payment processing — this usually takes 4-5 business days")
5. **Tenant empty state fix** — distinguish "no lease" from "no charges yet"

## Out of Scope

- Destination charges for ACH (not needed — no fee to retain)
- ACH microdeposit verification UI (Stripe handles this in Checkout)
- ACH refund/reversal handling (future sprint)
- Owner-configurable ACH settings
- Any database migrations

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/app/actions/charges.ts` | Add `payWithACH` server action |
| `apps/web/app/api/webhooks/stripe/route.ts` | Add cases for `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed` |
| `apps/web/lib/stripe-webhook-handlers.ts` | Add `handleAsyncPaymentSucceeded` and `handleAsyncPaymentFailed` handlers |
| `apps/web/components/dashboard/charge-row.tsx` | Enable ACH button, wire to `payWithACH` action |
| `apps/web/components/dashboard/pay-rent-card.tsx` | Enable ACH button, wire to `payWithACH` action |
| `apps/web/components/dashboard/charges-section.tsx` | Pass `payWithACH` action prop to `ChargeRow` |
| `apps/web/app/tenant/page.tsx` | Pass `payWithACH` action; fix empty state logic |
| `apps/web/app/payments/success/page.tsx` | Handle `payment_status: 'processing'` state for ACH |

## Implementation Requirements

### 1. Server Action: `payWithACH` (`app/actions/charges.ts`)

Add alongside existing `payWithCard`:

```typescript
export async function payWithACH(formData: FormData): Promise<ActionState | void> {
  // Same validation as payWithCard:
  // auth, rate limit, charge lookup, lease → unit → property chain,
  // Stripe configured check, owner Stripe account check

  const baseCents = charge.amount_cents;

  const metadata: Record<string, string> = {
    charge_id: chargeId,
    user_id: userId,
    payment_method: 'ach',
    // NO transfer_mode — ACH uses separate charges + transfers
    // NO processing_fee_cents — ACH is free
    base_amount_cents: String(baseCents),
  };

  const session = await createStripeCheckoutSession({
    amountCents: baseCents,                    // No fee — exact rent amount
    metadata,
    successUrl: `${appUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}&method=ach`,
    cancelUrl: `${appUrl}/payments/cancel`,
    transferGroup: `charge_${chargeId}`,       // Separate charges + transfers (NOT destination)
    paymentMethodTypes: ['us_bank_account'],
    // NO transferDataDestination — uses manual transfers via webhook
    // NO applicationFeeAmountCents — no fee for ACH
  });

  redirect(session.url);
}
```

**Key differences from `payWithCard`:**
- No fee calculation
- `paymentMethodTypes: ['us_bank_account']` (not `['card']`)
- Uses `transferGroup` (separate charges + transfers), NOT `transferDataDestination`
- No `transfer_mode: 'destination'` in metadata
- Success URL includes `method=ach` query param for the success page

### 2. Webhook: Async Payment Handlers

#### 2A. Route: Add new cases (`api/webhooks/stripe/route.ts`)

Add two new cases to the existing switch statement (before the `default`):

```typescript
case "checkout.session.async_payment_succeeded":
  return handleAsyncPaymentSucceeded(supabase, event.data.object);
case "checkout.session.async_payment_failed":
  return handleAsyncPaymentFailed(supabase, event.data.object);
```

Import the new handlers from `stripe-webhook-handlers.ts`.

#### 2B. Handler: `handleAsyncPaymentSucceeded` (`lib/stripe-webhook-handlers.ts`)

This handler fires when an ACH payment clears (4-5 business days after checkout). It follows the same pattern as `handleCheckoutSessionCompleted` but WITHOUT the `payment_status === 'paid'` check:

```typescript
export async function handleAsyncPaymentSucceeded(
  supabase: AdminClient,
  session: StripeCheckoutSession
) {
  const chargeId = session.metadata?.charge_id;
  const userId = session.metadata?.user_id;
  const amountCents = session.amount_total;

  if (!chargeId || !userId || !amountCents) {
    return received();
  }

  // ACH uses separate charges + transfers — transferMode is null
  return recordPayment({
    supabase,
    chargeId,
    userId,
    amountCents,
    paymentMatch: { column: "stripe_checkout_session_id", value: session.id },
    method: "ach",
    stripeCheckoutSessionId: session.id,
    requireAuthorizedUser: true,
    transferMode: null,          // NOT destination charges
    baseAmountCents: null,       // No fee adjustment needed
  });
}
```

**Important:** This calls the SAME `recordPayment` function used by `handleCheckoutSessionCompleted`. Since `transferMode` is `null`, the existing code will:
- Record the payment with the full `amountCents` (no fee adjustment)
- Call `createTransfersForPayment` (separate charges + transfers path)
- Send notifications and award XP as normal

**Idempotency:** Guaranteed by the existing `stripe_checkout_session_id` unique constraint in the `payments` table. If Stripe retries `async_payment_succeeded`, `recordPayment` returns `'already_recorded'` and no duplicate payment or transfer is created. Do NOT add additional deduplication logic.

#### 2C. Handler: `handleAsyncPaymentFailed` (`lib/stripe-webhook-handlers.ts`)

This fires when an ACH payment bounces or is returned:

```typescript
export async function handleAsyncPaymentFailed(
  supabase: AdminClient,
  session: StripeCheckoutSession
) {
  const chargeId = session.metadata?.charge_id;
  const userId = session.metadata?.user_id;

  if (!chargeId || !userId) {
    return received();
  }

  // Log the failure
  console.error(
    `[stripe-webhook] ACH payment failed for charge ${chargeId}, user ${userId}, session ${session.id}`
  );

  // Ensure the charge is NOT marked as paid (it shouldn't be, but guard against race conditions)
  const { data: charge } = await supabase
    .from("rent_charges")
    .select("status")
    .eq("id", chargeId)
    .maybeSingle();

  if (charge?.status === "paid") {
    // This shouldn't happen for ACH, but if it does, revert to pending
    const { error } = await supabase
      .from("rent_charges")
      .update({ status: "pending" })
      .eq("id", chargeId);
    if (error) {
      console.error(`[stripe-webhook] Failed to revert charge ${chargeId}:`, error);
    } else {
      console.error(
        `[stripe-webhook] Reverted charge ${chargeId} from paid to pending after ACH failure`
      );
    }
  }

  // TODO (future sprint): Send notification to tenant about failed ACH payment
  // TODO (future sprint): If a payment record exists (race condition), clean it up and reverse transfers
  // For now, the charge simply remains in pending/late status

  return received("async_payment_failed");
}
```

#### 2D. Update `handleCheckoutSessionCompleted` — Fix hardcoded method + ACH logging

**Two changes to this function:**

**Change 1: Derive payment method from metadata (not hardcoded).**

The existing code hardcodes `method: "card"` when calling `recordPayment`. This is incorrect for instant ACH payments where `payment_status === 'paid'` on session completion. Replace with:

```typescript
const method = session.metadata?.payment_method === 'ach' ? 'ach' : 'card';
```

Use this `method` variable in the `recordPayment` call instead of the hardcoded `"card"` string. This is safe because Sprint 96 already sets `payment_method: 'card'` in metadata, and Sprint 97's `payWithACH` sets `payment_method: 'ach'`.

**Change 2: Add log for ACH sessions that exit early.**

Currently line 614 returns early when `payment_status !== 'paid'`. This is correct — we do NOT want to record payment for non-instant ACH on `checkout.session.completed`. But add a log so we know it's intentional:

```typescript
if (!chargeId || !userId || session.payment_status !== "paid" || !amountCents) {
  // For ACH (payment_status === 'unpaid'), this is expected.
  // Payment will be recorded when async_payment_succeeded fires.
  if (session.payment_status !== "paid" && session.metadata?.payment_method === "ach") {
    console.log(
      `[stripe-webhook] ACH session ${session.id} completed with status '${session.payment_status}' — awaiting async confirmation`
    );
  }
  return received();
}
```

Note: The log checks `session.metadata?.payment_method === "ach"` rather than a specific `payment_status` value, because Stripe may send `'unpaid'` or other non-`'paid'` statuses depending on the ACH verification path.

### 3. Enable ACH Buttons

#### 3A. `charge-row.tsx` (lines 350-370)

Replace the disabled ACH placeholder with an active form:

- Remove `opacity-80` from container div
- Wrap button in a `<form>` with `action={onPayWithACH}`
- Add `<input type="hidden" name="chargeId" value={charge.id} />`
- Change button from `<Button disabled>` to `<SubmitButton>` (same pattern as card button)
- Change button text from "Coming Soon" to `"Pay ${formatCentsAsDollars(charge.amountCents)}"` (base amount, no fee)
- Change description text from "Coming soon — no extra fees" to "No extra fees"
- Keep "FREE" badge
- Add `onPayWithACH` to `ChargeRowProps` (optional — only present in tenant view)

#### 3B. `pay-rent-card.tsx` (lines 216-232)

Same changes as charge-row:

- Remove `opacity-80`
- Wrap in `<form>` with `action={onPayWithACH}`
- Add hidden `chargeId` input
- Enable button, change text to show amount
- Update description text
- Add `onPayWithACH` to `PayRentCardProps` (optional)

#### 3C. `charges-section.tsx`

Pass `onPayWithACH` prop through to `ChargeRow`.

#### 3D. `tenant/page.tsx`

Pass `payWithACH` action to `PayRentCard` and through to `ChargesSection` → `ChargeRow`.

### 4. Payment Success Page: ACH Processing State (`payments/success/page.tsx`)

When the URL contains `method=ach`:

- Show a **Clock icon** (not CheckCircle)
- Heading: "Payment processing"
- Body: "Your bank is processing this payment. This usually takes 4-5 business days. We'll update your account when it clears."
- Do NOT auto-redirect (ACH takes days — there's nothing to wait for)
- Show a "Back to Dashboard" button instead

When `method` is absent (card payment): keep existing behavior unchanged.

### 5. Tenant Empty State Fix

In `apps/web/app/tenant/page.tsx` (or the component that renders the "No payments due" message):

Currently, when a tenant has no charges, they see:
> "You're all set — No payments due right now"

This is misleading if the tenant has no lease at all. Fix:

**If tenant has no active lease:** Show:
> "Your landlord hasn't set up your lease yet. Once it's ready, your rent will show up here."

**If tenant has an active lease but no pending charges:** Show the existing message:
> "You're all set — No payments due right now"

To distinguish: check if the tenant has any lease with `active === true` (already fetched in tenant page data) vs charges being empty. An expired or terminated lease does not count. Thread the active lease existence flag to `PayRentCard`.

### 6. Plain Language (CLAUDE.md §18)

- "Pay from bank account" (not "ACH transfer")
- "No extra fees" (not "Zero processing surcharge")
- "Payment processing" (not "Asynchronous payment confirmation pending")
- "This usually takes 4-5 business days" (not "Settlement period for ACH debit transactions")
- "Your landlord hasn't set up your lease yet" (not "No active lease record found in the system")

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] `app/actions/charges.ts` — `payWithACH` exported; creates session with `payment_method_types: ['us_bank_account']`, no fee, uses `transferGroup` (not destination charges)
2. [ ] `app/actions/charges.ts` — `payWithACH` metadata includes `payment_method: 'ach'` and `base_amount_cents`; does NOT include `transfer_mode: 'destination'`
3. [ ] `app/actions/charges.ts` — `payWithACH` success URL includes `method=ach` query param
4. [ ] `api/webhooks/stripe/route.ts` — handles `checkout.session.async_payment_succeeded` event
5. [ ] `api/webhooks/stripe/route.ts` — handles `checkout.session.async_payment_failed` event
6. [ ] `lib/stripe-webhook-handlers.ts` — `handleAsyncPaymentSucceeded` calls `recordPayment` with `method: 'ach'`, `transferMode: null`
7. [ ] `lib/stripe-webhook-handlers.ts` — `handleAsyncPaymentSucceeded` uses same `recordPayment` function as checkout.session.completed (not a separate path)
8. [ ] `lib/stripe-webhook-handlers.ts` — `handleAsyncPaymentFailed` logs the failure, ensures charge status is NOT 'paid', includes TODO comments for future payment record cleanup and tenant notification
9. [ ] `lib/stripe-webhook-handlers.ts` — `handleCheckoutSessionCompleted` derives `method` from `session.metadata.payment_method` — does NOT hardcode `'card'`
10. [ ] `lib/stripe-webhook-handlers.ts` — `handleCheckoutSessionCompleted` logs ACH sessions (where `metadata.payment_method === 'ach'` and `payment_status !== 'paid'`) instead of silently dropping
11. [ ] `charge-row.tsx` — ACH button enabled, wrapped in form with `payWithACH` action, shows base amount with no fee
12. [ ] `charge-row.tsx` — ACH button shows "FREE" badge and "No extra fees" description
13. [ ] `pay-rent-card.tsx` — ACH button enabled with same behavior as charge-row
14. [ ] `payments/success/page.tsx` — when `method=ach`, shows "Payment processing" with 4-5 business days message and "Back to Dashboard" button (no auto-redirect)
15. [ ] `payments/success/page.tsx` — card payments retain existing behavior unchanged
16. [ ] Tenant empty state — tenant with no active lease (`active === true`) sees "Your landlord hasn't set up your lease yet"
17. [ ] Tenant empty state — tenant with lease but no charges sees "No payments due right now" (existing)
18. [ ] All user-facing text follows plain language rules
19. [ ] `gate:web` passes (lint + typecheck + build)

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-19] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT modify `payWithCard` or destination charge logic (Sprint 96)
- Do NOT modify `createTransfersForPayment` internals
- Do NOT modify autopay processing logic
- Do NOT create database migrations
- Do NOT modify auth files
- ACH payments use **separate charges and transfers** — NOT destination charges
- `handleAsyncPaymentSucceeded` must reuse `recordPayment` — do NOT create a separate payment recording path
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
