# Sprint 99 — Payment Execution Hardening

## Objective

Fix critical execution-layer issues in the payment webhook where money can move via Stripe transfers but database state becomes inconsistent. These are surgical safety fixes — no new features, no redesign.

## Context

- Branch: `main`
- HEAD: `2ae140c` (Sprint 98)
- Hardening Pass 1 identified 3 critical and 2 high issues in `lib/stripe-webhook-handlers.ts`
- All issues are in the payment execution path: `recordPayment` → `markChargePaid` → `createTransfersForPayment`
- These functions run inside Stripe webhook handlers — if they return 200, Stripe will NOT retry
- If they throw or return 500, Stripe WILL retry (up to ~72 hours)

### The Core Problem

The current code follows this pattern in multiple places:

```
DB write fails → log error → continue execution → create Stripe transfer → return 200
```

This means:
- Stripe transfers happen even when DB state is wrong
- Stripe won't retry because webhook returned 200
- DB and Stripe are permanently out of sync

### What Correct Behavior Looks Like

```
DB write fails → stop execution → return 500 → Stripe retries → eventual consistency
```

OR for non-critical writes:

```
DB write fails → log error → persist what we can → return 200 (payment was recorded)
```

The rule: **payment recording and charge status are critical. Transfers and notifications are best-effort.** If a payment can't be recorded or a charge can't be marked paid, STOP. If a transfer can't be tracked, persist what you have and continue.

## In Scope

1. `markChargePaid` returns success/failure; `recordPayment` stops if it fails
2. `createTransfersForPayment` persists partial transfer IDs in a `finally` block
3. `getCtx` distinguishes DB errors from missing data; webhook returns 500 on DB failure
4. Notification uses `recordedAmountCents` instead of `amountCents`
5. Consistent error handling pattern across all payment-critical mutations

## Out of Scope

- UI changes
- New features
- Stripe API changes
- Database migrations
- Autopay enrollment/setup logic
- Fee calculation changes (Sprint 96/97/98)
- Manager payment config changes (Sprint 98)
- `handleAccountUpdated`, `handlePaymentIntentPaymentFailed` (non-payment-recording paths)

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/lib/stripe-webhook-handlers.ts` | All 5 fixes — this is the only file that changes |

## Implementation Requirements

### 1. `markChargePaid` Must Return Success/Failure

**Current (line 184-189):**
```typescript
async function markChargePaid(supabase: AdminClient, chargeId: string) {
  const { error } = await supabase.from("rent_charges").update({ status: "paid" }).eq("id", chargeId);
  if (error) {
    console.error("[stripe-webhook] markChargePaid:", error);
  }
}
```

**Fix:**
```typescript
async function markChargePaid(supabase: AdminClient, chargeId: string): Promise<boolean> {
  const { error } = await supabase.from("rent_charges").update({ status: "paid" }).eq("id", chargeId);
  if (error) {
    console.error("[stripe-webhook] markChargePaid:", error);
    return false;
  }
  return true;
}
```

**Then in `recordPayment` (line 504), replace:**
```typescript
await markChargePaid(supabase, ctx.charge.id);
```

**With:**
```typescript
const chargePaid = await markChargePaid(supabase, ctx.charge.id);
if (!chargePaid) {
  // Critical: charge status not updated. Do NOT proceed to transfers.
  // Return 500 so Stripe retries the webhook.
  console.error(`[stripe-webhook] CRITICAL: markChargePaid failed for charge ${ctx.charge.id}. Aborting transfers.`);
  return new NextResponse(
    JSON.stringify({ error: "charge_status_update_failed" }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}
```

**Why return 500 instead of `received()`:** `received()` returns 200, which tells Stripe "all good, don't retry." But the charge is still pending while a payment record exists. Returning 500 tells Stripe to retry. On retry, `insertPaymentRecord` will return `"already_recorded"` (idempotent), and `markChargePaid` will attempt the update again.

**Wait — there's a problem with this approach.** If the payment record was already inserted (line 485-495) before `markChargePaid` fails, the retry will hit `existingPayment` check (line 453-460) and return `"already_recorded"` before reaching `markChargePaid` again.

**Correct fix:** Move the `existingPayment` early-return check to AFTER `markChargePaid` verification. OR: add a secondary path — when `existingPayment` is found, verify the charge status is `"paid"`. If not, attempt `markChargePaid` again:

```typescript
// At the top of recordPayment (lines 453-460), replace:
const { data: existingPayment } = await supabase
  .from("payments")
  .select("id")
  .eq(paymentMatch.column, paymentMatch.value)
  .maybeSingle();
if (existingPayment) {
  return received("already_recorded");
}

// With:
const { data: existingPayment } = await supabase
  .from("payments")
  .select("id")
  .eq(paymentMatch.column, paymentMatch.value)
  .maybeSingle();
if (existingPayment) {
  // Payment exists. Verify charge is marked paid (may have failed on prior attempt).
  const ctx = await getCtx(supabase, chargeId);
  if (ctx && ctx.charge.status !== "paid") {
    const repaired = await markChargePaid(supabase, ctx.charge.id);
    if (!repaired) {
      // Still can't mark paid. Return 500 so Stripe retries again.
      return new NextResponse(
        JSON.stringify({ error: "charge_status_repair_failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    console.log(`[stripe-webhook] Repaired charge ${chargeId} status to paid on retry`);
  }
  return received("already_recorded");
}
```

This ensures that even on webhook retry, the charge status gets repaired if the previous attempt failed after recording the payment but before marking the charge paid.

**In the repair path, `getCtx` uses the new discriminated return type.** If `db_error`, return 500. If `not_found`, return `received('already_recorded')`. If charge is already `'paid'`, return `received('already_recorded')` immediately without further mutation.

### 2. `createTransfersForPayment` Must Persist Partial State

**Current (lines 203-348):** The `paymentUpdate` object accumulates `stripe_transfer_id` and `manager_transfer_id` during execution. The DB write happens at lines 338-343 inside the `try` block. If any transfer throws, the outer `catch` (lines 345-347) fires and the DB write never executes — even though some transfers succeeded.

**Fix:** Move the DB write to a `finally` block:

```typescript
async function createTransfersForPayment(supabase, params) {
  const paymentUpdate: Record<string, string | number> = { platform_fee_cents: 0 };
  let firstTransferId: string | null = null;

  try {
    // ... existing transfer logic (unchanged) ...
    // ... all the owner/member/manager transfer creation ...
    // ... paymentUpdate accumulates transfer IDs as before ...
  } catch (transferError) {
    console.error("[stripe-webhook] Transfer creation failed:", transferError);
  } finally {
    // Always persist whatever transfer IDs we collected, even on partial failure
    if (firstTransferId) {
      paymentUpdate.stripe_transfer_id = firstTransferId;
    }
    // Only write if we have something to record
    if (Object.keys(paymentUpdate).length > 1 || firstTransferId) {
      const { error } = await supabase
        .from("payments")
        .update(paymentUpdate)
        .eq(params.paymentMatch.column, params.paymentMatch.value);
      if (error) {
        console.error("[stripe-webhook] update payment transfer metadata:", error);
      }
    }
  }
}
```

**If the `payments.update` inside `finally` fails, log with prefix `[stripe-webhook] RECONCILIATION:` to flag a reconciliation-critical failure.** This distinguishes it from routine errors and enables monitoring/alerting.

**Important:** The `firstTransferId` and `paymentUpdate` variables must be declared OUTSIDE the `try` block (they already are at lines 230-231). The manager transfer ID assignment (line 335: `paymentUpdate.manager_transfer_id = managerTransfer.id`) stays inside the try — it only executes if the manager transfer succeeds. The `finally` block writes whatever was collected.

**Also move** the `if (firstTransferId)` assignment (current line 325-326) from inside the try block's tail to inside the transfer creation logic where it already is. The `finally` block just does the DB write.

### 3. `getCtx` Must Distinguish DB Errors from Missing Data

**Current (lines 69-115):** Each query destructures `{ data }` and ignores `{ error }`. If the DB is unreachable, `data` is null, and `getCtx` returns null — same as "charge doesn't exist."

**Fix:** Return a discriminated result:

```typescript
type CtxResult =
  | { ok: true; ctx: Ctx }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "db_error"; error: unknown };

async function getCtx(supabase: AdminClient, chargeId: string): Promise<CtxResult> {
  const { data: charge, error: chargeError } = await supabase
    .from("rent_charges")
    .select("id, lease_id, status, due_date, amount_cents")
    .eq("id", chargeId)
    .maybeSingle();
  if (chargeError) {
    console.error("[stripe-webhook] getCtx charge query failed:", chargeError);
    return { ok: false, reason: "db_error", error: chargeError };
  }
  if (!charge) {
    return { ok: false, reason: "not_found" };
  }

  const { data: lease, error: leaseError } = await supabase
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .eq("id", charge.lease_id)
    .maybeSingle();
  if (leaseError) {
    console.error("[stripe-webhook] getCtx lease query failed:", leaseError);
    return { ok: false, reason: "db_error", error: leaseError };
  }
  if (!lease) {
    return { ok: false, reason: "not_found" };
  }

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("id, property_id, unit_number")
    .eq("id", lease.unit_id)
    .maybeSingle();
  if (unitError) {
    console.error("[stripe-webhook] getCtx unit query failed:", unitError);
    return { ok: false, reason: "db_error", error: unitError };
  }
  if (!unit) {
    return { ok: false, reason: "not_found" };
  }

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id, owner_account_id")
    .eq("id", unit.property_id)
    .maybeSingle();
  if (propertyError) {
    console.error("[stripe-webhook] getCtx property query failed:", propertyError);
    return { ok: false, reason: "db_error", error: propertyError };
  }
  if (!property) {
    return { ok: false, reason: "not_found" };
  }

  const { data: tenantProfile } = lease.tenant_profile_id
    ? await supabase
        .from("profiles")
        .select("id, email")
        .eq("id", lease.tenant_profile_id)
        .maybeSingle()
    : { data: null };
  // Tenant profile is non-critical — don't fail on error

  return { ok: true, ctx: { charge, lease, unit, property, tenantProfile } };
}
```

**Then in `recordPayment` (line 462), replace:**
```typescript
const ctx = await getCtx(supabase, chargeId);
if (!ctx || ctx.charge.status === "paid") {
  return received("charge_already_paid_or_missing");
}
```

**With:**
```typescript
const ctxResult = await getCtx(supabase, chargeId);
if (!ctxResult.ok) {
  if (ctxResult.reason === "db_error") {
    // DB failure — return 500 so Stripe retries
    console.error(`[stripe-webhook] CRITICAL: getCtx DB failure for charge ${chargeId}`);
    return new NextResponse(
      JSON.stringify({ error: "db_error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  return received("charge_not_found");
}
const ctx = ctxResult.ctx;
if (ctx.charge.status === "paid") {
  return received("charge_already_paid");
}
```

**Also update** the `already_recorded` repair path (from fix #1) to use the new `getCtx` return type.

### 4. Notification Amount Fix

**Current (line 558):**
```typescript
queuePaymentNotifications(ctx, amountCents);
```

**Fix:**
```typescript
queuePaymentNotifications(ctx, recordedAmountCents);
```

`recordedAmountCents` is the base rent amount for destination charges, or the full `amountCents` for ACH/autopay. This ensures the tenant notification says "Your payment of $2,350" (the rent), not "$2,420.50" (rent + card fee).

### 5. Import NextResponse

The `recordPayment` function currently returns `received()` (which uses `NextResponse.json`). The new 500 returns use `new NextResponse(...)`. Verify that `NextResponse` is already imported at line 1 — it is. No additional import needed.

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] `markChargePaid` returns `boolean` — `true` on success, `false` on failure
2. [ ] `recordPayment` checks `markChargePaid` return value; if `false`, returns HTTP 500 response (not 200)
3. [ ] On webhook retry after `markChargePaid` failure: existing payment is detected, charge status is repaired to "paid", returns 200
4. [ ] `createTransfersForPayment` writes `paymentUpdate` to DB in a `finally` block — partial transfer IDs are persisted even on failure
5. [ ] `getCtx` returns discriminated result: `{ ok: true, ctx }` or `{ ok: false, reason: "not_found" | "db_error" }`
6. [ ] `recordPayment` returns HTTP 500 when `getCtx` returns `db_error` — Stripe will retry
7. [ ] `recordPayment` returns 200 with `"charge_not_found"` when `getCtx` returns `not_found` — no retry needed
8. [ ] `queuePaymentNotifications` called with `recordedAmountCents` (not `amountCents`)
9. [ ] All existing payment flows (card, ACH, autopay) continue to work — no behavior change for happy path
10. [ ] No new features introduced — changes are limited to error handling and state consistency
11. [ ] `gate:web` passes (lint + typecheck + build)

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-11] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- ONLY modify `apps/web/lib/stripe-webhook-handlers.ts` — no other files
- Do NOT change Stripe API calls, fee calculations, or session creation
- Do NOT change the payment recording logic (`insertPaymentRecord`) — it's already idempotent
- Do NOT change transfer amount calculations or distribution logic
- Do NOT change autopay enrollment/failure handling
- Do NOT change `handleAccountUpdated` or `handlePaymentIntentPaymentFailed`
- Do NOT introduce database migrations
- The `finally` block in `createTransfersForPayment` must ONLY write to DB — no Stripe API calls in finally
- HTTP 500 responses must include a JSON body with an `error` field for debugging
- If other internal callers of `getCtx` in `stripe-webhook-handlers.ts` require type-shape adaptation, that is allowed, but their behavior must remain unchanged.
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
