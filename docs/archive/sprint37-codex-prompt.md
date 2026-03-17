# Sprint 37 — Codex Implementation Prompt

## 1. Objective

Harden all payment paths against amount manipulation, overpayment, negative splits, and missing bounds. No new features — purely defensive security fixes across validation schemas, webhook handlers, and server actions.

## 2. Context

- **Branch**: `main`
- **HEAD**: `c675955`
- **Gate baseline**: 503/503 tests, lint clean, typecheck clean, build clean
- **No migration required** — all changes are application-layer validation
- **Key existing patterns**:
  - `recordManualPaymentSchema` in `lib/validations.ts` — Zod validation for manual payments
  - `updateManagementFeeSchema` in `lib/validations.ts` — Zod validation for fee updates
  - `recordPayment()` in `lib/stripe-webhook-handlers.ts` — webhook payment handler
  - `createTransfersForPayment()` in `lib/stripe-webhook-handlers.ts` — Stripe transfer splitter
  - `recordManualPayment()` in `app/actions/charges.ts` — server action for manual payments
  - `updateManagementFee()` in `app/actions/connect.ts` — server action for fee updates
  - `getCtx()` in `lib/stripe-webhook-handlers.ts` — loads charge + lease + unit + property context

## 3. In Scope

### Part A: Schema Amount Bounds
- Add `.max()` upper bounds to monetary Zod schemas

### Part B: Manual Payment Cap
- Validate manual payment amount ≤ charge amount in server action

### Part C: Management Fee Cap
- Validate management fee ≤ property's highest monthly rent

### Part D: Webhook Amount Validation
- Validate webhook payment amount matches charge amount in DB

### Part E: Negative Split Guard
- Prevent negative `ownerAmount` in transfer splitter

### Part F: Reference Note Sanitization
- Add `.max()` to referenceNote in manual payment schema

## 4. Out of Scope

- Database CHECK constraints (future sprint)
- Stripe webhook auth hooks
- New features or UI changes
- Database migrations
- Test file modifications
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### Modified Files (4)
1. `apps/web/lib/validations.ts`
2. `apps/web/app/actions/charges.ts`
3. `apps/web/app/actions/connect.ts`
4. `apps/web/lib/stripe-webhook-handlers.ts`

## 6. Implementation Requirements

### Part A: Schema Amount Bounds

**Modified file**: `apps/web/lib/validations.ts`

Add `.max()` upper bounds to these monetary schemas:

1. **`recordManualPaymentSchema.amountDollars`** (line 147):
   ```typescript
   // BEFORE:
   amountDollars: z.coerce.number().positive("Amount must be greater than $0."),
   // AFTER:
   amountDollars: z.coerce.number().positive("Amount must be greater than $0.").max(999999.99, "Amount cannot exceed $999,999.99."),
   ```

2. **`updateManagementFeeSchema.managementFeeDollars`** (line 154):
   ```typescript
   // BEFORE:
   managementFeeDollars: z.coerce.number().min(0, "Management fee cannot be negative.")
   // AFTER:
   managementFeeDollars: z.coerce.number().min(0, "Management fee cannot be negative.").max(99999.99, "Management fee cannot exceed $99,999.99.")
   ```

3. **`recordManualPaymentSchema.referenceNote`** (line 149):
   ```typescript
   // BEFORE:
   referenceNote: z.string().optional()
   // AFTER:
   referenceNote: z.string().max(500, "Reference note must be under 500 characters.").optional()
   ```

### Part B: Manual Payment Cap

**Modified file**: `apps/web/app/actions/charges.ts`

In `recordManualPayment()`, after the schema validation succeeds and the charge is fetched from DB, add a validation that the manual payment amount does not exceed the charge amount.

Find the section where the charge is queried (around lines 130-145 where the charge data is fetched). After confirming the charge exists and before inserting the payment, add:

```typescript
const amountCents = Math.round(amountDollars * 100);
if (amountCents > charge.amount_cents) {
  return {
    success: false,
    error: `Payment amount ($${amountDollars.toFixed(2)}) exceeds the charge amount ($${(charge.amount_cents / 100).toFixed(2)}).`
  };
}
```

This prevents an owner/manager from recording a manual payment larger than the actual rent charge.

**IMPORTANT**: Look at the actual code flow to place this check correctly — it must go after the charge is fetched from DB and `amountDollars` is available from the parsed form data, but before the payment is inserted.

### Part C: Management Fee Cap

**Modified file**: `apps/web/app/actions/connect.ts`

In `updateManagementFee()`, after the schema validation and property access check, add a validation that the management fee does not exceed the highest monthly rent for any unit on the property.

After the `canUserAdministerProperty()` check, add:

```typescript
// Fetch highest monthly rent for this property's units
const { data: units } = await admin
  .from("units")
  .select("monthly_rent_cents")
  .eq("property_id", propertyId)
  .order("monthly_rent_cents", { ascending: false })
  .limit(1);

const highestRentCents = units?.[0]?.monthly_rent_cents ?? 0;
const feeCents = Math.round(managementFeeDollars * 100);

if (highestRentCents > 0 && feeCents > highestRentCents) {
  return {
    success: false,
    error: `Management fee ($${managementFeeDollars.toFixed(2)}) cannot exceed the highest unit rent ($${(highestRentCents / 100).toFixed(2)}).`
  };
}
```

This prevents setting a management fee larger than the property's rent, which would cause negative owner amounts in payment splits.

### Part D: Webhook Amount Validation

**Modified file**: `apps/web/lib/stripe-webhook-handlers.ts`

In `recordPayment()`, after the charge context is loaded via `getCtx()` (around line 442-444), add an amount validation:

```typescript
const ctx = await getCtx(supabase, chargeId);
if (!ctx || ctx.charge.status === "paid") {
  return received("charge_already_paid_or_missing");
}

// Validate payment amount does not exceed charge amount
if (amountCents > ctx.charge.amount_cents) {
  console.error(
    `[stripe-webhook] Payment amount (${amountCents}) exceeds charge amount (${ctx.charge.amount_cents}) for charge ${chargeId}`
  );
  return received("amount_exceeds_charge");
}
```

Add `"amount_exceeds_charge"` to the `received()` helper's message mapping if it has one, or just use it as-is if `received()` accepts arbitrary strings. Look at the existing `received()` function to understand the pattern.

**IMPORTANT**: The `received()` helper returns a 200 response (webhooks must return 200 to prevent Stripe retries). The validation logs the error but does NOT return a 400/500 — Stripe would retry indefinitely. This is a silent rejection with a log entry.

### Part E: Negative Split Guard

**Modified file**: `apps/web/lib/stripe-webhook-handlers.ts`

In `createTransfersForPayment()`, at line 212 where `ownerAmount` is calculated:

```typescript
// BEFORE:
const ownerAmount = params.amountCents - managementFee;

// AFTER:
const effectiveFee = Math.min(managementFee, params.amountCents);
const ownerAmount = params.amountCents - effectiveFee;
```

This ensures:
- If management fee > payment amount, fee is capped at payment amount
- `ownerAmount` is always >= 0
- No negative Stripe transfer amounts

Also update the manager transfer section (around line 311-318) to use `effectiveFee`:

```typescript
// BEFORE:
if (managerInfo && managementFee > 0) {
  const managerTransfer = await createStripeTransfer({
    amountCents: managementFee,
    ...
  });

// AFTER:
if (managerInfo && effectiveFee > 0) {
  const managerTransfer = await createStripeTransfer({
    amountCents: effectiveFee,
    ...
  });
```

And update the `paymentUpdate` object to use `effectiveFee`:

```typescript
const paymentUpdate: Record<string, string | number> = { platform_fee_cents: effectiveFee > managementFee ? 0 : managementFee - effectiveFee };
```

Wait — simpler approach. Just change the initial calculation and fee variable:

```typescript
const managementFee = managerInfo?.feeCents ?? 0;
const effectiveFee = Math.min(managementFee, params.amountCents);
const ownerAmount = params.amountCents - effectiveFee;
const paymentUpdate: Record<string, string | number> = { platform_fee_cents: 0 };
```

Then use `effectiveFee` everywhere `managementFee` was used for the actual transfer amount. Keep the original `managementFee` variable only if needed for logging.

### Part F: Reference Note Sanitization

Already handled in Part A (schema `.max(500)` on referenceNote). No additional file changes needed.

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] `recordManualPaymentSchema.amountDollars` has `.max(999999.99)` upper bound
2. [ ] `updateManagementFeeSchema.managementFeeDollars` has `.max(99999.99)` upper bound
3. [ ] `recordManualPaymentSchema.referenceNote` has `.max(500)` length limit
4. [ ] Manual payment server action rejects `amountCents > charge.amount_cents` with clear error message
5. [ ] Management fee server action rejects fee > highest unit rent on property
6. [ ] `recordPayment()` in webhook handlers validates `amountCents <= ctx.charge.amount_cents` and silently rejects overpayments (returns 200, logs error)
7. [ ] `createTransfersForPayment()` caps management fee at payment amount — `ownerAmount` is always >= 0
8. [ ] Manager transfer uses capped `effectiveFee`, not raw `managementFee`
9. [ ] No breaking changes to existing payment flows
10. [ ] `npm run gate:web` passes — all tests, lint, typecheck, build clean

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT apply any database migrations
- Do NOT deploy to Vercel
- Do NOT modify test files, CLAUDE.md, or AGENTS.md
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections — report compact status only
- Webhook handlers must ALWAYS return 200 to Stripe (even on validation failures) to prevent infinite retries
- The `received()` helper pattern must be preserved — don't change its function signature
- Amount comparisons must use integer cents (not floating point dollars)
- All error messages must be user-friendly (dollar amounts formatted, not raw cents)
