# Sprint 114 — ACH Failure: Payment Record Cleanup + Transfer Reversal

## Objective

Resolve the second TODO in `handleAsyncPaymentFailed`: when an ACH payment fails AFTER a payment record was somehow created (race condition or edge case), reverse any Stripe transfers and mark the payment record as reversed. This is a defensive guard — under normal flow, payment records are NEVER created until `async_payment_succeeded` fires, but if state diverges, this handles it cleanly.

## Context

- Branch: `main`
- HEAD: post-Sprint 113
- `handleAsyncPaymentFailed` (in `lib/stripe-webhook-handlers.ts` ~line 788) currently:
  - Logs the failure
  - Reverts charge status from `paid` to `pending` if it was set
  - Notifies the tenant (Sprint 111)
  - Has TODO: "If a payment record exists, clean it up and reverse transfers"
- Under normal ACH flow, this code path NEVER hits a payment record — payments are recorded only on `async_payment_succeeded`. But if state diverges (webhook ordering issue at Stripe, manual DB edit, retry race), we should handle it.
- The `payments` table has `stripe_transfer_id` and `manager_transfer_id` columns from Sprint 96 — both refer to Stripe Transfer IDs that may need reversing.

### Stripe Transfer Reversal API

Reversal endpoint: `POST https://api.stripe.com/v1/transfers/{TRANSFER_ID}/reversals`
Returns a reversal object. Reverses the transfer by returning funds to the platform. Idempotent if the same `Idempotency-Key` is used.

Docs: https://stripe.com/docs/api/transfer_reversals/create

## In Scope

1. Add `reversed_at` timestamp column to `payments` table (migration)
2. Add `createStripeTransferReversal` helper in `lib/stripe.ts`
3. In `handleAsyncPaymentFailed`, after the existing logic:
   - Look up any payment record matching `stripe_checkout_session_id`
   - If found:
     - Log a `RECONCILIATION:` warning (should not happen in normal flow)
     - Attempt to reverse `stripe_transfer_id` via Stripe API
     - Attempt to reverse `manager_transfer_id` via Stripe API
     - Update the payment row's `reversed_at` to the current timestamp
4. Tests

## Out of Scope

- Refunds to the tenant (Stripe handles ACH refunds automatically when the payment fails — there's no money to refund because it never cleared)
- New notification types
- UI for showing reversed payments
- Modifying the normal-flow recording path (`recordPayment`)
- Owner/manager notifications about the reversal
- Bulk-reversal tools or admin UI

## Database Migration

**Migration file:** `20260505_sprint114_payments_reversed_at.sql`

```sql
-- Sprint 114: track when an ACH payment record was reversed due to async failure
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reversed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_payments_reversed_at
  ON payments (reversed_at)
  WHERE reversed_at IS NOT NULL;
```

The partial index keeps it cheap — almost no rows will be reversed.

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `supabase/migrations/20260505_sprint114_payments_reversed_at.sql` | **NEW** — adds `reversed_at` column + partial index |
| `apps/web/lib/stripe.ts` | Add `createStripeTransferReversal` helper |
| `apps/web/lib/stripe-webhook-handlers.ts` | In `handleAsyncPaymentFailed`, add cleanup logic after existing logic; remove the second TODO comment |
| `apps/web/lib/__tests__/stripe-webhook-handlers.test.ts` | Tests for the cleanup path (payment exists with transfers → reversal called → reversed_at set) |

## Implementation Requirements

### 1. New Stripe Helper (`lib/stripe.ts`)

Add after `createStripeTransfer`:

```typescript
export async function createStripeTransferReversal(params: {
  transferId: string;
  amountCents?: number;  // optional — omit to reverse the full amount
  description?: string;
  idempotencyKey?: string;
}): Promise<{ id: string }> {
  const secretKey = getStripeSecretKey();
  const body = new URLSearchParams();
  if (typeof params.amountCents === "number") {
    body.set("amount", String(params.amountCents));
  }
  if (params.description) {
    body.set("description", params.description);
  }

  const response = await fetch(
    `https://api.stripe.com/v1/transfers/${encodeURIComponent(params.transferId)}/reversals`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {})
      },
      body: body.toString(),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stripe transfer reversal failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as { id: string };
  return { id: json.id };
}
```

### 2. Cleanup Logic in `handleAsyncPaymentFailed`

In `lib/stripe-webhook-handlers.ts`, after the tenant notification logic added in Sprint 111 but BEFORE `return received("async_payment_failed")`, add:

```typescript
// Defensive cleanup: under normal ACH flow, no payment record should exist here
// because payments are only recorded on async_payment_succeeded. If one exists,
// reverse any transfers and mark the payment as reversed.
const { data: existingPayment } = await supabase
  .from("payments")
  .select("id, stripe_transfer_id, manager_transfer_id, reversed_at")
  .eq("stripe_checkout_session_id", session.id)
  .maybeSingle();

if (existingPayment && !existingPayment.reversed_at) {
  console.error(
    `[stripe-webhook] RECONCILIATION: payment record ${existingPayment.id} exists for failed ACH session ${session.id} — reversing transfers`
  );

  // Reverse owner/distribution transfer if present
  if (existingPayment.stripe_transfer_id) {
    try {
      await createStripeTransferReversal({
        transferId: existingPayment.stripe_transfer_id,
        description: `Reversal: ACH payment failed for charge ${chargeId.slice(0, 8)}`,
        idempotencyKey: `reversal:owner:${existingPayment.id}`
      });
    } catch (err) {
      console.error(
        `[stripe-webhook] RECONCILIATION: failed to reverse owner transfer ${existingPayment.stripe_transfer_id}:`,
        err
      );
    }
  }

  // Reverse manager transfer if present
  if (existingPayment.manager_transfer_id) {
    try {
      await createStripeTransferReversal({
        transferId: existingPayment.manager_transfer_id,
        description: `Reversal: ACH payment failed for charge ${chargeId.slice(0, 8)}`,
        idempotencyKey: `reversal:manager:${existingPayment.id}`
      });
    } catch (err) {
      console.error(
        `[stripe-webhook] RECONCILIATION: failed to reverse manager transfer ${existingPayment.manager_transfer_id}:`,
        err
      );
    }
  }

  // Mark payment as reversed (whether or not transfers succeeded — we tried)
  const { error: updateError } = await supabase
    .from("payments")
    .update({ reversed_at: new Date().toISOString() })
    .eq("id", existingPayment.id);
  if (updateError) {
    console.error(
      `[stripe-webhook] RECONCILIATION: failed to mark payment ${existingPayment.id} as reversed:`,
      updateError
    );
  }
}

// Remove the existing TODO comment about cleanup
return received("async_payment_failed");
```

**Important:**
- Use idempotency keys based on payment.id so retries don't double-reverse
- Catch errors per transfer — one reversal failure shouldn't block the other
- Always attempt to mark `reversed_at` even if transfer reversals failed (so we have audit trail)
- Keep the existing tenant notification (Sprint 111) BEFORE this cleanup
- The cleanup is best-effort, fire-after, and doesn't change the webhook's success response

### 3. Verify No New Imports Needed

`createStripeTransferReversal` will need to be added to the imports in `stripe-webhook-handlers.ts`. Verify the import statement at the top of the file.

### 4. Plain Language

No user-facing text in this sprint — all changes are operational/internal. Logging uses `RECONCILIATION:` prefix for monitoring.

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] Migration creates `payments.reversed_at` column (timestamptz, nullable)
2. [ ] Migration creates partial index `idx_payments_reversed_at WHERE reversed_at IS NOT NULL`
3. [ ] `lib/stripe.ts` exports `createStripeTransferReversal` with optional `amountCents` and `idempotencyKey` params
4. [ ] `createStripeTransferReversal` posts to `/v1/transfers/{id}/reversals` with proper auth and body encoding
5. [ ] In `handleAsyncPaymentFailed`: looks up payment by `stripe_checkout_session_id`
6. [ ] If payment exists and not already reversed: logs `RECONCILIATION:` warning
7. [ ] If `stripe_transfer_id` exists: attempts reversal with idempotency key `reversal:owner:{paymentId}`
8. [ ] If `manager_transfer_id` exists: attempts reversal with idempotency key `reversal:manager:{paymentId}`
9. [ ] Per-transfer errors are caught and logged — do not block the other reversal or the row update
10. [ ] Payment row is updated with `reversed_at = now()` whether or not reversals succeeded
11. [ ] Update error is logged with `RECONCILIATION:` prefix
12. [ ] Second TODO comment ("If a payment record exists...") is removed
13. [ ] Existing tenant notification (Sprint 111) still fires BEFORE the cleanup
14. [ ] Existing charge-status revert logic is unchanged
15. [ ] Tests cover: payment exists → reversals attempted; payment exists already reversed → no-op; no payment → no-op
16. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
migration_file: [name]
files_changed: [list]
acceptance_criteria: [1-16] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT change the normal-flow payment recording (`recordPayment`)
- Do NOT modify autopay or destination-charge logic
- Do NOT add user-facing UI for reversed payments
- Do NOT alter charge-status logic (already handled in existing code)
- Do NOT add additional notifications beyond what already exists
- Reversal attempts MUST use per-payment idempotency keys to prevent double-reversal on webhook retry
- Per-transfer errors MUST be caught — never let a reversal failure crash the webhook
- Always mark `reversed_at` even if transfer reversals fail (audit trail matters)
- Log all RECONCILIATION events with the `RECONCILIATION:` prefix for monitoring
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
