# Sprint 98 — Unified Manager Payment System

## Objective

Unify the two disconnected manager payment systems into a single, consistent flow where `manager_payment_configs` is the sole source of truth for fee calculation, manager fees are frozen at payment initiation in metadata, and both card (destination charges) and ACH (separate charges + transfers) correctly deduct and transfer manager fees.

## Context

- Branch: `main`
- HEAD: `7a2dde4` (Sprint 97)
- Stripe is in live mode
- **Two manager payment systems currently exist:**
  - **System A (webhook):** reads `properties.management_fee_cents`, auto-deducts during `createTransfersForPayment`. Only works for ACH (separate charges + transfers). Skipped entirely for card (destination charges, `transferMode === 'destination'`).
  - **System B (dashboard):** reads `manager_payment_configs` (% or flat), requires manual "Generate This Month" + "Mark Paid". Does NOT create Stripe transfers.
- Sprint 96 introduced destination charges for card payments — `createTransfersForPayment` is skipped, so **managers get $0 on card payments** even if a fee is configured.
- Sprint 97 added ACH — uses separate charges + transfers, so System A works for ACH but still reads from the wrong source (`properties.management_fee_cents` which is 0 for "1st Home").
- Live data: Alia Sanders is the manager for "1st Home" at 9% ($211.50/month). Config exists in `manager_payment_configs`. But `properties.management_fee_cents = 0` and Alia has no Stripe account connected.

### Key Financial Invariants

- **Tenant's total DOES NOT change** when manager fee is added to `application_fee_amount`. The fee comes from the owner's share, not the tenant's pocket.
- **Both card and ACH must freeze `manager_fee_cents` in session metadata at payment initiation.** Webhook logic uses this frozen value — never recalculates from config (except as fallback for legacy payments created before this sprint).
- **Owner payout and manager payout must use the same fee value for a given payment.** No split where owner is charged one amount and manager receives a different amount.
- **No Stripe transfers to manager if manager is not Stripe-onboarded.** Owner gets full rent. Fee tracked as owed only.

## In Scope

1. **`manager_payment_configs` as single source of truth** — replace `properties.management_fee_cents` reads
2. **Card payments: include manager fee in `application_fee_amount`** — owner receives `rent - manager_fee`, platform retains `card_processing_fee + manager_fee`, platform transfers `manager_fee` to manager
3. **ACH payments: freeze manager fee in metadata** — webhook reads from metadata, deducts from owner transfer
4. **Idempotent manager transfer for destination charges** — check `payments.manager_transfer_id` before creating
5. **Manager not onboarded: skip deduction, track as owed** — owner gets full rent, fee logged but no money moves
6. **Deprecate `properties.management_fee_cents`** — stop reading it as primary source; keep as fallback for properties without a `manager_payment_configs` entry

## Out of Scope

- Database migrations (no schema changes)
- Manager Stripe Connect onboarding flow changes
- Manager notification emails
- Backlog settlement for past owed fees
- Changes to the Manager Payments dashboard UI (System B)
- Autopay flow changes
- Owner approval workflow for fee changes
- Removing `properties.management_fee_cents` column

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/lib/stripe-connect.ts` | Modify `getManagerStripeAccountForProperty` to read from `manager_payment_configs` first, fall back to `properties.management_fee_cents` |
| `apps/web/app/actions/charges.ts` | Modify `payWithCard`: look up manager fee, add to `applicationFeeAmountCents`, store `manager_fee_cents` in metadata. Modify `payWithACH`: look up manager fee, store `manager_fee_cents` in metadata. |
| `apps/web/lib/stripe-webhook-handlers.ts` | After destination charge payment: create manager transfer from platform if `manager_fee_cents` in metadata and manager is onboarded. Add idempotency guard. |
| `apps/web/lib/payment-fees.ts` | Add `getManagerFeeForProperty` helper that reads from `manager_payment_configs` |

## Implementation Requirements

### 1. Manager Fee Lookup Helper (`lib/payment-fees.ts`)

Add a new exported function to the existing shared utility file:

```typescript
import { createAdminClient } from '@/lib/supabase-admin'; // or appropriate import

export async function getManagerFeeForProperty(
  propertyId: string,
  rentAmountCents: number
): Promise<{ feeCents: number; managerProfileId: string | null }> {
  const supabase = createAdminClient();

  // Primary source: manager_payment_configs
  const { data: config } = await supabase
    .from('manager_payment_configs')
    .select('manager_profile_id, payment_type, percentage_rate, flat_amount_cents, base_rent_cents, active')
    .eq('property_id', propertyId)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (config) {
    const feeCents = config.payment_type === 'flat'
      ? (config.flat_amount_cents ?? 0)
      : Math.round((config.base_rent_cents ?? rentAmountCents) * ((config.percentage_rate ?? 0) / 100));
    return { feeCents: Math.max(feeCents, 0), managerProfileId: config.manager_profile_id };
  }

  // Fallback: properties.management_fee_cents (deprecated)
  const { data: property } = await supabase
    .from('properties')
    .select('management_fee_cents')
    .eq('id', propertyId)
    .maybeSingle();

  const fallbackFee = Math.max(property?.management_fee_cents ?? 0, 0);
  return { feeCents: fallbackFee, managerProfileId: null };
}
```

This function is the ONLY place manager fee calculation happens for rent payments. Both `payWithCard` and `payWithACH` call it. The webhook reads from the frozen metadata value — it does NOT call this function (except for legacy fallback).

### 2. Update `getManagerStripeAccountForProperty` (`lib/stripe-connect.ts`)

Modify the existing function (lines 193-229) to use the new `getManagerFeeForProperty` result instead of reading `properties.management_fee_cents` directly.

Alternatively, keep `getManagerStripeAccountForProperty` as-is (it's still used by the webhook for ACH transfers) but change its fee source:

```typescript
// In getManagerStripeAccountForProperty, replace:
//   const { data: property } = await supabase
//     .from('properties')
//     .select('id, management_fee_cents')
//     ...

// With: Read from manager_payment_configs first
const { data: config } = await supabase
  .from('manager_payment_configs')
  .select('payment_type, percentage_rate, flat_amount_cents, base_rent_cents, active')
  .eq('property_id', propertyId)
  .eq('active', true)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

let feeCents = 0;
if (config) {
  feeCents = config.payment_type === 'flat'
    ? (config.flat_amount_cents ?? 0)
    : Math.round((config.base_rent_cents ?? 0) * ((config.percentage_rate ?? 0) / 100));
} else {
  // Fallback: deprecated properties.management_fee_cents
  const { data: property } = await supabase
    .from('properties')
    .select('management_fee_cents')
    .eq('id', propertyId)
    .maybeSingle();
  feeCents = property?.management_fee_cents ?? 0;
}

if (feeCents <= 0) return null;
// ... rest of function unchanged (fetch manager assignment, get Stripe profile)
```

**Important:** The `getManagerStripeAccountForProperty` function is still called by `createTransfersForPayment` for ACH payments. But for ACH, the webhook should now prefer the `manager_fee_cents` from metadata over what this function returns. See section 4 below.

### 3. Freeze Manager Fee in Server Actions (`app/actions/charges.ts`)

#### 3A. `payWithCard` (modify existing, around lines 170-190)

After calculating the card processing fee, look up the manager fee and add it to `applicationFeeAmountCents`:

```typescript
import { getManagerFeeForProperty } from '@/lib/payment-fees';

// Inside payWithCard, after existing validation and fee calculation:
const baseCents = charge.amount_cents;
const { feeCents: cardFeeCents, totalCents } = calculateCardFee(baseCents);

// NEW: Look up manager fee
const managerFee = await getManagerFeeForProperty(property.id, baseCents);
const managerFeeCents = managerFee.feeCents;

// Check if manager can receive the transfer (has Stripe account)
const managerStripeAccount = managerFeeCents > 0
  ? await getManagerStripeAccountForProperty(property.id)
  : null;
const managerOnboarded = managerStripeAccount !== null;

// If manager is NOT onboarded, do NOT include manager fee in application_fee
// Owner gets full rent. Fee tracked as owed only.
const effectiveManagerFee = managerOnboarded ? managerFeeCents : 0;

const applicationFee = cardFeeCents + effectiveManagerFee;

const metadata: Record<string, string> = {
  charge_id: chargeId,
  user_id: userId,
  payment_method: 'card',
  transfer_mode: 'destination',
  processing_fee_cents: String(cardFeeCents),
  base_amount_cents: String(baseCents),
  manager_fee_cents: String(effectiveManagerFee),       // NEW: frozen manager fee
  manager_fee_full_cents: String(managerFeeCents),      // NEW: full fee (even if not deducted)
};

const session = await createStripeCheckoutSession({
  amountCents: totalCents,                              // UNCHANGED — tenant pays same amount
  metadata,
  successUrl: `${appUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
  cancelUrl: `${appUrl}/payments/cancel`,
  paymentMethodTypes: ['card'],
  transferDataDestination: ownerStripeAccount,
  applicationFeeAmountCents: applicationFee,            // NOW includes manager fee
});
```

**Key invariant:** `totalCents` (what the tenant pays) does NOT change. `applicationFee` increases, which means the owner receives less. The tenant is unaffected.

**`manager_fee_cents`** = the fee actually being deducted and transferred (0 if manager not onboarded).
**`manager_fee_full_cents`** = the fee that WOULD be deducted if manager were onboarded (for ledger/owed tracking).

#### 3B. `payWithACH` (modify existing, around lines 220-235)

Add manager fee to metadata:

```typescript
// Inside payWithACH, after existing validation:
const baseCents = charge.amount_cents;

// NEW: Look up manager fee
const managerFee = await getManagerFeeForProperty(property.id, baseCents);
const managerFeeCents = managerFee.feeCents;

const managerStripeAccount = managerFeeCents > 0
  ? await getManagerStripeAccountForProperty(property.id)
  : null;
const managerOnboarded = managerStripeAccount !== null;
const effectiveManagerFee = managerOnboarded ? managerFeeCents : 0;

const metadata: Record<string, string> = {
  charge_id: chargeId,
  user_id: userId,
  payment_method: 'ach',
  base_amount_cents: String(baseCents),
  manager_fee_cents: String(effectiveManagerFee),       // NEW: frozen manager fee
  manager_fee_full_cents: String(managerFeeCents),      // NEW: full fee for ledger
};

const session = await createStripeCheckoutSession({
  amountCents: baseCents,                               // UNCHANGED — no fee for ACH
  metadata,
  successUrl: `${appUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}&method=ach`,
  cancelUrl: `${appUrl}/payments/cancel`,
  transferGroup: `charge_${chargeId}`,
  paymentMethodTypes: ['us_bank_account'],
});
```

### 4. Webhook: Manager Transfer for Destination Charges + Metadata-Driven ACH (`lib/stripe-webhook-handlers.ts`)

#### 4A. Extract manager fee from metadata (all paths)

In `handleCheckoutSessionCompleted` (around line 609-612 where `transferMode` and `baseAmountCents` are extracted), add:

```typescript
const managerFeeCents = session.metadata?.manager_fee_cents
  ? parseInt(session.metadata.manager_fee_cents, 10)
  : null;
```

Pass `managerFeeCents` to `recordPayment` as a new optional param.

In `handleAsyncPaymentSucceeded`, do the same extraction and pass it through.

Add `managerFeeCents?: number | null` to `recordPayment`'s params type.

#### 4B. Destination charge: create manager transfer from platform

After the existing `transferMode` guard (line 500-508), add the manager transfer logic for destination charges:

```typescript
if (transferMode !== "destination") {
  // Existing: ACH path — createTransfersForPayment handles everything
  // BUT: if managerFeeCents is in metadata, pass it through so the webhook
  // uses the frozen value instead of recalculating from config
  await createTransfersForPayment(supabase, {
    propertyId: ctx.property.id,
    chargeId: ctx.charge.id,
    amountCents: recordedAmountCents,
    transferGroup,
    paymentMatch,
    managerFeeCentsOverride: managerFeeCents,   // NEW param
  });
} else {
  // Destination charge: Stripe already transferred (rent - manager_fee) to owner.
  // Platform retained (card_processing_fee + manager_fee).
  // Now create the manager transfer from platform.
  if (managerFeeCents && managerFeeCents > 0) {
    // Idempotency: check if manager_transfer_id already exists
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("manager_transfer_id")
      .eq(paymentMatch.column, paymentMatch.value)
      .maybeSingle();

    if (!existingPayment?.manager_transfer_id) {
      // Resolve manager's Stripe account
      const managerInfo = await getManagerStripeAccountForProperty(ctx.property.id);
      if (managerInfo?.accountId) {
        try {
          const managerTransfer = await createStripeTransfer({
            amountCents: managerFeeCents,
            destination: managerInfo.accountId,
            description: `Management fee for charge ${ctx.charge.id.slice(0, 8)}`
          });
          await supabase
            .from("payments")
            .update({ manager_transfer_id: managerTransfer.id })
            .eq(paymentMatch.column, paymentMatch.value);
        } catch (transferError) {
          console.error(
            `[stripe-webhook] Manager transfer failed for charge ${ctx.charge.id}:`,
            transferError
          );
        }
      }
    }
  }
}
```

**Idempotency:** The `existingPayment?.manager_transfer_id` check prevents duplicate transfers on webhook retry. If the field is already set, we skip.

**No transfer group:** Destination charges don't use transfer groups. The manager transfer is a standalone platform-to-connected-account transfer.

#### 4C. ACH path: use frozen metadata fee

Add `managerFeeCentsOverride` as an optional param to `createTransfersForPayment` (line 202):

```typescript
async function createTransfersForPayment(
  supabase: AdminClient,
  params: {
    propertyId: string;
    chargeId: string;
    amountCents: number;
    transferGroup: string;
    paymentMatch: Match;
    managerFeeCentsOverride?: number | null;   // NEW
  }
) {
```

Inside the function, use the override if present:

```typescript
// Replace line 213:
// const managementFee = Math.max(managerInfo?.feeCents ?? 0, 0);
// With:
const managementFee = typeof params.managerFeeCentsOverride === 'number'
  ? Math.max(params.managerFeeCentsOverride, 0)
  : Math.max(managerInfo?.feeCents ?? 0, 0);
```

This means:
- **New payments (with metadata):** Use the frozen fee from metadata. Consistent with what was calculated at payment initiation.
- **Legacy payments (no metadata):** Fall back to `getManagerStripeAccountForProperty` which now reads from `manager_payment_configs`. Consistent with the new source of truth.

### 5. Plain Language (CLAUDE.md §18)

No new user-facing text in this sprint — all changes are backend. Existing UI text unchanged.

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] `lib/payment-fees.ts` — `getManagerFeeForProperty` exported; reads from `manager_payment_configs` first, falls back to `properties.management_fee_cents`
2. [ ] `lib/stripe-connect.ts` — `getManagerStripeAccountForProperty` reads fee from `manager_payment_configs` first, falls back to `properties.management_fee_cents`
3. [ ] `app/actions/charges.ts` — `payWithCard` calls `getManagerFeeForProperty`, stores `manager_fee_cents` and `manager_fee_full_cents` in metadata
4. [ ] `app/actions/charges.ts` — `payWithCard` adds `effectiveManagerFee` to `applicationFeeAmountCents` (card processing fee + manager fee)
5. [ ] `app/actions/charges.ts` — `payWithCard` does NOT change `totalCents` (tenant pays same amount regardless of manager fee)
6. [ ] `app/actions/charges.ts` — `payWithCard` sets `effectiveManagerFee = 0` when manager is not Stripe-onboarded (owner gets full rent)
7. [ ] `app/actions/charges.ts` — `payWithACH` calls `getManagerFeeForProperty`, stores `manager_fee_cents` and `manager_fee_full_cents` in metadata
8. [ ] `app/actions/charges.ts` — `payWithACH` does NOT change `amountCents` (tenant pays same amount)
9. [ ] `lib/stripe-webhook-handlers.ts` — `handleCheckoutSessionCompleted` extracts `manager_fee_cents` from metadata and passes to `recordPayment`
10. [ ] `lib/stripe-webhook-handlers.ts` — `handleAsyncPaymentSucceeded` extracts `manager_fee_cents` from metadata and passes to `recordPayment`
11. [ ] `lib/stripe-webhook-handlers.ts` — for destination charges (`transferMode === 'destination'`): creates manager transfer from platform when `managerFeeCents > 0` and manager is Stripe-onboarded
12. [ ] `lib/stripe-webhook-handlers.ts` — manager transfer for destination charges is idempotent: checks `payments.manager_transfer_id` before creating, skips if already set
13. [ ] `lib/stripe-webhook-handlers.ts` — manager transfer failure is caught and logged, does NOT crash the webhook
14. [ ] `lib/stripe-webhook-handlers.ts` — `createTransfersForPayment` accepts `managerFeeCentsOverride` param; uses it when present instead of recalculating from config
15. [ ] `lib/stripe-webhook-handlers.ts` — when `managerFeeCentsOverride` is null/undefined, falls back to existing fee resolution (now reads from `manager_payment_configs` via updated `getManagerStripeAccountForProperty`)
16. [ ] Existing autopay payment flow is completely unaffected
17. [ ] Existing card payment tenant total is unchanged (fee-on-fee formula not modified)
18. [ ] Existing ACH payment tenant total is unchanged (no fee)
19. [ ] Owner payout math for card: owner receives `totalCents - (cardFeeCents + effectiveManagerFee)` = `baseCents - effectiveManagerFee`
20. [ ] Owner payout math for ACH: owner receives `baseCents - effectiveManagerFee` via `createTransfersForPayment`
21. [ ] Manager transfer is created exactly once per payment, even if webhook is retried
22. [ ] `gate:web` passes (lint + typecheck + build)

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-22] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT modify the fee-on-fee card processing fee formula (`calculateCardFee`)
- Do NOT change what the tenant pays — `totalCents` for card and `amountCents` for ACH must remain unchanged
- Do NOT create database migrations
- Do NOT modify autopay processing logic (`autopay.ts`, `stripe-autopay.ts`)
- Do NOT modify auth files or middleware
- Do NOT modify the Manager Payments dashboard UI (System B) — that's a separate sprint
- Do NOT hold manager funds on the platform when manager is not onboarded — set `effectiveManagerFee = 0` and let owner keep full rent
- Do NOT recalculate manager fee at webhook time for payments that have `manager_fee_cents` in metadata — use the frozen value
- Fallback recalculation from config is ONLY for legacy payments where metadata is missing
- The `managerFeeCentsOverride` param in `createTransfersForPayment` must be optional and backward-compatible — existing callers without it continue working
- Manager transfer creation MUST be idempotent. The `payments.manager_transfer_id` check is REQUIRED and must not be removed, bypassed, or altered.
- When `manager_fee_cents` exists in metadata, it MUST be used as the single source of truth. Recalculation from config is strictly forbidden in this case.
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
