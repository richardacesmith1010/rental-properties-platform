# Sprint 111 — ACH Payment Failure Tenant Notification

## Objective

When a tenant's ACH payment fails (Stripe sends `checkout.session.async_payment_failed`), notify the tenant in-app and via email so they know to retry. Currently, the failure is logged silently — the tenant thinks they paid, and 5 days later their charge is still pending with no explanation.

## Context

- Branch: `main`
- HEAD: post-Sprint 110
- ACH payments through Stripe Checkout take 4-5 business days to clear or fail
- Sprint 97 added `handleAsyncPaymentFailed` to revert charge status from `paid` to `pending` if needed, but left a `TODO` for tenant notification
- Existing `handlePaymentIntentPaymentFailed` (autopay) already notifies the tenant via `queueAutopayFailure` using `type: 'late_rent'` — we'll mirror that pattern for ACH
- The notification system supports in-app + email delivery via `createNotificationWithDelivery`

### TODO Location

`apps/web/lib/stripe-webhook-handlers.ts` line 824:
```typescript
// TODO (future sprint): Send notification to tenant about failed bank account payment.
```

This sprint resolves that TODO.

## In Scope

1. In `handleAsyncPaymentFailed`, send a tenant notification when an ACH payment fails
2. Reuse existing `'late_rent'` notification type for consistency with autopay failure pattern
3. Include charge amount and unit reference in the notification body (using existing helpers)

## Out of Scope

- The second TODO on line 825 (payment record cleanup + transfer reversal) — that's a more complex refund flow, future sprint
- Notifying owners/managers about ACH failure (could be added later, not strictly necessary)
- Adding a new notification type (reuse `'late_rent'`)
- SMS delivery
- Retry buttons or call-to-action UI
- Auto-retry of the ACH payment (Stripe doesn't auto-retry; tenant must initiate)

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/lib/stripe-webhook-handlers.ts` | Add tenant notification in `handleAsyncPaymentFailed`. Replace the first TODO comment with the implementation. Keep the second TODO (record cleanup) for a future sprint. |

## Implementation Requirements

### 1. Notify Tenant in `handleAsyncPaymentFailed`

After the existing logging and status-revert logic (around line 824), but before `return received(...)`, add:

```typescript
// Look up context for the notification (use existing getCtx helper)
const ctxResult = await getCtx(supabase, chargeId);
if (ctxResult.ok) {
  const ctx = ctxResult.ctx;
  if (ctx.tenantProfile?.id) {
    void createNotificationWithDelivery({
      recipientProfileId: ctx.tenantProfile.id,
      recipientEmail: ctx.tenantProfile.email,
      type: "late_rent",
      title: "Bank payment didn't go through",
      body: `Your bank account payment of ${formatCurrency(ctx.charge.amount_cents)} for Unit ${ctx.unit.unit_number} didn't clear. Please try again or use a different payment method.`,
      entityType: "rent_charge",
      entityId: ctx.charge.id
    }).catch(sideEffectError("handleAsyncPaymentFailed", "notify_tenant", {
      userId: ctx.tenantProfile.id,
      entityType: "rent_charge",
      entityId: ctx.charge.id
    }));
  }
} else if (ctxResult.reason === "db_error") {
  console.error(`[stripe-webhook] async_payment_failed: getCtx db_error for charge ${chargeId}`);
}
// Note: if ctxResult.reason === "not_found", we already logged the failure above; skip notification
```

Then keep the remaining TODO comment for the future cleanup work:

```typescript
// TODO (future sprint): If a payment record exists, clean it up and reverse transfers.
return received("async_payment_failed");
```

### 2. Imports

`createNotificationWithDelivery`, `formatCurrency`, `sideEffectError`, and `getCtx` are likely already imported in the file (used by other handlers). Verify imports — only add new imports if missing.

### 3. Plain Language

- Title: "Bank payment didn't go through" (not "ACH async payment failed")
- Body uses dollar amount via `formatCurrency` and unit number — clear, specific, actionable
- "Please try again or use a different payment method" — tells them what to do

### 4. Side-Effect Pattern

Use the existing `void promise.catch(sideEffectError(...))` pattern (same as `queuePaymentNotifications`). This ensures notification failure does NOT crash the webhook — the webhook still returns 200 to Stripe.

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] `handleAsyncPaymentFailed` calls `createNotificationWithDelivery` for the tenant when context resolves successfully
2. [ ] Notification uses `type: "late_rent"` (reuses existing type, no new type added)
3. [ ] Notification title: "Bank payment didn't go through"
4. [ ] Notification body includes the charge amount via `formatCurrency` and unit number
5. [ ] Notification call uses `void` + `.catch(sideEffectError(...))` pattern — does not crash webhook on notification failure
6. [ ] If `getCtx` returns `db_error`, log but do not fail the webhook
7. [ ] If `getCtx` returns `not_found`, skip notification silently (already logged above)
8. [ ] If tenant profile is missing or has no email, no notification is attempted (graceful skip)
9. [ ] First TODO on line 824 (notification) is resolved and removed
10. [ ] Second TODO on line 825 (payment record cleanup + transfer reversal) is preserved unchanged
11. [ ] Existing logic (logging, charge status revert from paid to pending) is unchanged
12. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-12] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Only `apps/web/lib/stripe-webhook-handlers.ts` should be modified
- Do NOT add a new notification type — reuse `late_rent`
- Do NOT modify `recordPayment`, `createTransfersForPayment`, or any other webhook handler
- Do NOT modify the notification system (`createNotificationWithDelivery`, etc.)
- Do NOT touch the second TODO (payment record cleanup) — separate sprint
- Do NOT add owner/manager notifications in this sprint — tenant only
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
