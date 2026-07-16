# Sprint 112 — Manager Fee Notification on Transfer

## Objective

When a manager fee transfer succeeds, notify the manager in-app + email so they know money landed. Currently, Alia (and any future PM) gets no signal when her share transfers — she has to check her bank or the dashboard.

## Context

- Branch: `main`
- HEAD: post-Sprint 111
- Manager fee transfers happen in TWO places in `stripe-webhook-handlers.ts`:
  1. Inside `createTransfersForPayment` (around line 328) — ACH path / separate charges + transfers
  2. Inside `recordPayment` for destination charges (around line 531) — card path (Sprint 98)
- Both paths produce a successful Stripe Transfer with `manager_transfer_id`. Neither currently notifies the manager.
- A Sprint 98 TODO documents this gap.

### Existing Helper

`getManagerStripeAccountForProperty` (in `lib/stripe-connect.ts` line 194) already resolves the manager. It queries `property_managers`, then fetches the manager profile, but currently only returns `{ accountId, feeCents }`. We need the manager's profile ID to send the notification.

**Update the helper** to also return `managerProfileId` so callers can notify them.

### Notification Type

Reuse the existing `payment_recorded` notification type — no schema change needed. The title/body distinguish manager-side ("Management fee received") from tenant-side ("Payment Received").

## In Scope

1. Update `getManagerStripeAccountForProperty` to return `managerProfileId` alongside `accountId` and `feeCents`
2. After successful manager Stripe transfer in BOTH paths (ACH and card), send the manager a notification
3. Notification title: "Management fee received"
4. Notification body includes amount + property name + unit number

## Out of Scope

- Adding a new notification type (reuse `payment_recorded`)
- Notifying when a manager transfer FAILS (separate concern; logging exists)
- SMS or push notifications
- Notifications for owner payouts (separate sprint if requested)
- Modifying autopay flow or distribution logic

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/lib/stripe-connect.ts` | Update `getManagerStripeAccountForProperty` return type to include `managerProfileId`; populate it from existing query |
| `apps/web/lib/stripe-webhook-handlers.ts` | After successful manager transfer in BOTH paths (ACH + destination), call `createNotificationWithDelivery` for the manager |
| `apps/web/lib/__tests__/stripe-webhook-handlers.test.ts` (existing or new) | Test: manager notification fires when transfer succeeds; does not fire when no manager fee |

## Implementation Requirements

### 1. Update Helper Return Type (`lib/stripe-connect.ts`)

Current signature (line 194-228):
```typescript
export async function getManagerStripeAccountForProperty(
  propertyId: string,
  rentAmountCents = 0
): Promise<{ accountId: string; feeCents: number } | null>
```

Updated signature:
```typescript
export async function getManagerStripeAccountForProperty(
  propertyId: string,
  rentAmountCents = 0
): Promise<{ accountId: string; feeCents: number; managerProfileId: string } | null>
```

Implementation: the function already resolves `managerProfileId` internally (line 204-218). Just include it in the return:

```typescript
return {
  accountId: profile.stripe_account_id,
  feeCents: feeInfo.feeCents,
  managerProfileId
};
```

**Verify:** all existing callers of `getManagerStripeAccountForProperty` should still compile. The new field is additive — no caller breaks.

### 2. Notify Manager After ACH Transfer (`createTransfersForPayment`)

In `stripe-webhook-handlers.ts` around line 328-335 (where `manager_transfer_id` is set after successful Stripe transfer), add a notification after the assignment:

```typescript
if (managerInfo && effectiveFee > 0) {
  const managerTransfer = await createStripeTransfer({
    amountCents: effectiveFee,
    destination: managerInfo.accountId,
    transferGroup: params.transferGroup,
    description: `Management fee for charge ${params.chargeId.slice(0, 8)}`
  });
  paymentUpdate.manager_transfer_id = managerTransfer.id;

  // NEW: Notify the manager
  notifyManagerOfFeeTransfer(supabase, {
    managerProfileId: managerInfo.managerProfileId,
    amountCents: effectiveFee,
    propertyId: params.propertyId,
    chargeId: params.chargeId
  });
}
```

### 3. Notify Manager After Destination Charge Transfer (`recordPayment`)

In the destination-charge branch (around line 524-555 where the card path creates the manager transfer), add the same notification after the successful update:

```typescript
const { error: updateError } = await supabase
  .from("payments")
  .update({ manager_transfer_id: managerTransfer.id })
  .eq(paymentMatch.column, paymentMatch.value);
if (updateError) {
  console.error("[stripe-webhook] update manager transfer metadata:", updateError);
}

// NEW: Notify the manager
notifyManagerOfFeeTransfer(supabase, {
  managerProfileId: managerInfo.managerProfileId,
  amountCents: managerFeeCents,
  propertyId: ctx.property.id,
  chargeId: ctx.charge.id
});
```

### 4. Shared Helper Function

Add a private function in `stripe-webhook-handlers.ts` near other notification helpers (e.g., near `queuePaymentNotifications` around line 351):

```typescript
function notifyManagerOfFeeTransfer(
  supabase: AdminClient,
  params: {
    managerProfileId: string;
    amountCents: number;
    propertyId: string;
    chargeId: string;
  }
) {
  void (async () => {
    // Look up manager email + property/unit context for body text
    const [{ data: managerProfile }, { data: property }] = await Promise.all([
      supabase.from("profiles").select("email").eq("id", params.managerProfileId).maybeSingle(),
      supabase.from("properties").select("name").eq("id", params.propertyId).maybeSingle()
    ]);

    const propertyName = property?.name ?? "your property";

    await createNotificationWithDelivery({
      recipientProfileId: params.managerProfileId,
      recipientEmail: managerProfile?.email ?? null,
      type: "payment_recorded",
      title: "Management fee received",
      body: `Your management fee of ${formatCurrency(params.amountCents)} for ${propertyName} was sent to your bank.`,
      entityType: "rent_charge",
      entityId: params.chargeId
    });
  })().catch(sideEffectError("notifyManagerOfFeeTransfer", "notify_manager", {
    userId: params.managerProfileId,
    entityType: "rent_charge",
    entityId: params.chargeId
  }));
}
```

The `void (async () => {})()` pattern keeps this fire-and-forget — webhook does not wait for or fail on notification errors.

### 5. Plain Language

- Title: "Management fee received" (not "Manager Stripe Transfer Completed")
- Body: "Your management fee of $X for [Property] was sent to your bank." — clear, specific, actionable

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] `getManagerStripeAccountForProperty` return type includes `managerProfileId: string`
2. [ ] All existing callers of `getManagerStripeAccountForProperty` still compile (additive change)
3. [ ] After successful manager transfer in `createTransfersForPayment`, manager notification fires
4. [ ] After successful manager transfer in destination-charge path of `recordPayment`, manager notification fires
5. [ ] Notification uses `type: "payment_recorded"` (no new type added)
6. [ ] Notification title: "Management fee received"
7. [ ] Notification body includes amount via `formatCurrency` and property name
8. [ ] `notifyManagerOfFeeTransfer` uses fire-and-forget pattern with `sideEffectError` — webhook does not fail on notification error
9. [ ] Notification does NOT fire when no manager fee is configured (managerInfo is null)
10. [ ] Notification does NOT fire when the Stripe transfer fails (only after success)
11. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-11] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT add a new notification type (reuse `payment_recorded`)
- Do NOT modify autopay flow, distribution logic, or transfer logic
- Do NOT modify `createNotificationWithDelivery` itself
- Notification MUST be fire-and-forget — webhook return value unaffected
- Notification fires ONLY after successful Stripe transfer — never before, never on failure
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
