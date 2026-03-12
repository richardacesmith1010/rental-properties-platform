# Sprint 14 — Tenant Autopay

## Objective
Add automatic rent payment for tenants. Tenants save a payment method via Stripe Checkout (setup mode), then the system automatically charges due rent on the due date via off-session PaymentIntents. Failed payments retry once after 3 days, then disable autopay and notify the tenant to update their payment method.

## Context
- Branch: `main`
- HEAD: `0171b94`
- Supabase project: `vawqdqkaguhdgfhdebqw`
- DB migration already applied: `stripe_customer_id` (text, nullable) added to `profiles`. New table `autopay_enrollments` created with columns: `id`, `lease_id` (unique), `tenant_profile_id`, `stripe_payment_method_id`, `payment_method_type`, `last4`, `brand`, `enabled`, `retry_count`, `last_failed_at`, `created_at`, `updated_at`. RLS policies active (tenant own-row + service_role full).
- Deploy URL: `https://domusbase.com`
- Existing Stripe integration uses raw `fetch()` to Stripe API (no SDK). Maintain this pattern.
- Existing `createStripeCheckoutSession()` uses `mode: "payment"`. Autopay setup uses `mode: "setup"`.
- Existing webhook handles `checkout.session.completed` and `account.updated`. This sprint adds `payment_intent.succeeded` and `payment_intent.payment_failed`.
- Existing cron at `app/api/cron/generate-charges/route.ts` calls `generateMonthlyChargesForAllOwnersWithClient()` then `sendRentDueReminders()`. Autopay processing inserts between these.

## In Scope
1. Stripe autopay library (customer creation, setup checkout, off-session PaymentIntent)
2. Server actions for autopay enrollment and disabling
3. Autopay return page (saves enrollment after Stripe setup checkout)
4. Webhook handlers for `payment_intent.succeeded` and `payment_intent.payment_failed`
5. Cron autopay processing (charge saved cards on due dates)
6. Tenant UI (autopay card in charges section, settings integration)

## Out of Scope
- Stripe SDK migration (keep raw `fetch()`)
- Stripe Subscriptions (using SetupIntents + off-session PaymentIntents instead)
- ACH/bank account autopay (card only for now)
- Pricing tiers / Stripe Billing (Sprint 15+)
- Mobile app changes
- Refunds
- Adding webhook events to Stripe Dashboard (user action, post-deploy)

## Exact Files Expected to Change

### New Files
- `apps/web/lib/autopay.ts` — Stripe autopay API helpers (customer, setup session, payment intent)
- `apps/web/app/actions/autopay.ts` — Server actions: setupAutopay, disableAutopay, getAutopayEnrollments
- `apps/web/app/autopay/return/page.tsx` — Return page after Stripe setup checkout
- `apps/web/components/dashboard/autopay-card.tsx` — Per-lease autopay status card

### Modified Files
- `apps/web/lib/stripe.ts` — Add `StripePaymentIntent` type interface
- `apps/web/app/api/webhooks/stripe/route.ts` — Add `payment_intent.succeeded` and `payment_intent.payment_failed` handlers
- `apps/web/lib/charges.ts` — Add `processAutopayCharges()` function
- `apps/web/app/api/cron/generate-charges/route.ts` — Call `processAutopayCharges()` after charge generation
- `apps/web/components/dashboard/charges-section.tsx` — Render AutopayCard for tenants, success banner
- `apps/web/app/tenant/page.tsx` — Fetch autopay enrollments, pass to charges section
- `apps/web/app/settings/page.tsx` — Add Payment Methods section for tenants
- `apps/web/lib/validations.ts` — Add `setupAutopaySchema`, `disableAutopaySchema`
- `apps/web/app/actions/index.ts` — Export `setupAutopay`, `disableAutopay`

## Implementation Requirements

### Part A: Stripe Autopay Library

**Create `apps/web/lib/autopay.ts`**

All functions use raw `fetch()` to Stripe API, same pattern as `lib/stripe.ts`. Import `getStripeSecretKey` from `@/lib/stripe`.

```typescript
// 1. Create a Stripe Customer
export async function createStripeCustomer(
  email: string,
  name: string
): Promise<{ id: string }>
// POST https://api.stripe.com/v1/customers
// Body: email, name
// Returns: { id: string }

// 2. Create Checkout Session in setup mode
export async function createSetupCheckoutSession(params: {
  customerId: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<{ id: string; url: string | null }>
// POST https://api.stripe.com/v1/checkout/sessions
// Body: mode=setup, customer=customerId, success_url (append ?setup_intent={SETUP_INTENT_ID}&lease_id={lease_id}), cancel_url, metadata
// Returns: { id, url }

// 3. Retrieve a SetupIntent
export async function retrieveSetupIntent(
  setupIntentId: string
): Promise<{ id: string; payment_method: string; status: string }>
// GET https://api.stripe.com/v1/setup_intents/{setupIntentId}

// 4. Get payment method details
export async function getPaymentMethod(
  paymentMethodId: string
): Promise<{ id: string; type: string; card?: { last4: string; brand: string } }>
// GET https://api.stripe.com/v1/payment_methods/{paymentMethodId}

// 5. Create off-session PaymentIntent (for autopay charging)
export async function createOffSessionPaymentIntent(params: {
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  metadata: Record<string, string>;
  transferGroup: string;
}): Promise<{ id: string; status: string }>
// POST https://api.stripe.com/v1/payment_intents
// Body: amount, currency=usd, customer, payment_method, off_session=true, confirm=true,
//       metadata entries, transfer_group
// Returns: { id, status }
```

### Part B: Server Actions

**Create `apps/web/app/actions/autopay.ts`**

Follow the existing action pattern from `charges.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth";
import { createStripeCustomer, createSetupCheckoutSession } from "@/lib/autopay";
import { parseFormData, setupAutopaySchema, disableAutopaySchema } from "@/lib/validations";
import type { ActionState } from "./shared";

// setupAutopay: Takes leaseId from FormData
// 1) Auth: get user, verify role is tenant
// 2) Validate: parseFormData(setupAutopaySchema, formData)
// 3) Verify tenant is on this lease (query leases table)
// 4) Get-or-create Stripe Customer:
//    - Check profiles.stripe_customer_id
//    - If null: call createStripeCustomer(user.email, profile.full_name)
//    - Upsert stripe_customer_id on profiles using admin client
// 5) Create Checkout Session in setup mode:
//    - successUrl: `${appUrl}/autopay/return?setup_intent={SETUP_INTENT_ID}&lease_id=${leaseId}`
//    - cancelUrl: `${appUrl}/tenant`
//    - metadata: { lease_id: leaseId, user_id: user.id }
// 6) Redirect to session.url
export async function setupAutopay(formData: FormData) { ... }

// disableAutopay: Takes enrollmentId from FormData
// 1) Auth: get user
// 2) Validate: parseFormData(disableAutopaySchema, formData)
// 3) Verify enrollment belongs to this user (admin client query)
// 4) Set enabled = false, updated_at = now()
// 5) Revalidate /tenant, /settings
// Returns ActionState
export async function disableAutopay(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> { ... }

// getAutopayEnrollments: Not a form action, called from pages
// Query autopay_enrollments for this tenant, join with lease + unit + property for labels
// Returns array of { id, leaseId, propertyLabel, last4, brand, paymentMethodType, enabled, retryCount }
export async function getAutopayEnrollments(userId: string): Promise<AutopayEnrollment[]> { ... }
```

**Modify `apps/web/lib/validations.ts`** — Add:
```typescript
export const setupAutopaySchema = z.object({
  leaseId: z.string().uuid()
});

export const disableAutopaySchema = z.object({
  enrollmentId: z.string().uuid()
});
```

**Modify `apps/web/app/actions/index.ts`** — Add:
```typescript
export { setupAutopay } from "./autopay";
export { disableAutopay } from "./autopay";
```

### Part C: Autopay Return Page

**Create `apps/web/app/autopay/return/page.tsx`**

Server component (follow `app/connect/return/page.tsx` pattern):

```typescript
// 1) Auth: getAuthenticatedUser()
// 2) Read searchParams: setup_intent, lease_id
// 3) Call retrieveSetupIntent(setup_intent) to get payment_method ID
// 4) Call getPaymentMethod(payment_method) to get last4, brand, type
// 5) Upsert into autopay_enrollments using admin client:
//    - ON CONFLICT (lease_id) DO UPDATE to handle re-enrollment
//    - Set: stripe_payment_method_id, payment_method_type, last4, brand, enabled=true, retry_count=0, last_failed_at=null, updated_at=now()
// 6) redirect("/tenant?autopay=enrolled")
```

If setup_intent is missing or retrieval fails, redirect to `/tenant?autopay=error`.

### Part D: Webhook Expansion

**Modify `apps/web/app/api/webhooks/stripe/route.ts`**

Add after the `account.updated` handler block:

**Handler for `payment_intent.succeeded`:**
```typescript
if (event.type === "payment_intent.succeeded") {
  const pi = event.data.object;
  const chargeId = pi.metadata?.charge_id;
  const userId = pi.metadata?.user_id;
  const isAutopay = pi.metadata?.autopay === "true";
  const amountReceived = typeof pi.amount_received === "number" ? pi.amount_received : null;

  if (!chargeId || !userId || !amountReceived || !isAutopay) {
    return NextResponse.json({ received: true });
  }

  // Idempotency: check if payment already recorded for this PI
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_payment_intent_id", pi.id)
    .maybeSingle();
  if (existingPayment) {
    return NextResponse.json({ received: true, status: "already_recorded" });
  }

  // Same charge→lease→unit→property walk as checkout.session.completed
  // Record payment with method: "autopay"
  // Mark charge as paid
  // Create transfers (owner + manager) using same transfer_group pattern
  // Reset enrollment retry_count to 0
  // Notifications to tenant + owner members
  // Award XP (check on-time vs late using due_date)
}
```

**Handler for `payment_intent.payment_failed`:**
```typescript
if (event.type === "payment_intent.payment_failed") {
  const pi = event.data.object;
  const chargeId = pi.metadata?.charge_id;
  const leaseId = pi.metadata?.lease_id;
  const isAutopay = pi.metadata?.autopay === "true";

  if (!chargeId || !leaseId || !isAutopay) {
    return NextResponse.json({ received: true });
  }

  // Increment retry_count and set last_failed_at on the enrollment
  const { data: enrollment } = await supabase
    .from("autopay_enrollments")
    .select("id, retry_count, tenant_profile_id")
    .eq("lease_id", leaseId)
    .eq("enabled", true)
    .maybeSingle();

  if (!enrollment) {
    return NextResponse.json({ received: true });
  }

  const newRetryCount = enrollment.retry_count + 1;

  if (newRetryCount >= 2) {
    // Disable autopay
    await supabase
      .from("autopay_enrollments")
      .update({ enabled: false, retry_count: newRetryCount, last_failed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", enrollment.id);

    // Notify tenant: autopay disabled
    // Get tenant profile for email
    // createNotificationWithDelivery: type "late_rent", title "Autopay Disabled", body "Your automatic payment failed twice. Please update your payment method in Settings."
  } else {
    await supabase
      .from("autopay_enrollments")
      .update({ retry_count: newRetryCount, last_failed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", enrollment.id);

    // Notify tenant: payment failed, will retry
    // createNotificationWithDelivery: type "late_rent", title "Autopay Payment Failed", body "We'll retry your payment in 3 days. Ensure your payment method is up to date."
  }

  // Notify owner members about the failure
  // Get property_id through charge→lease→unit chain
  // notifyOwnerMembersForProperty: type "late_rent", title "Autopay Failed", body "Automatic payment failed for [unit]."
}
```

### Part E: Cron Autopay Processing

**Modify `apps/web/lib/charges.ts`** — Add exported function:

```typescript
export async function processAutopayCharges(
  supabase: SupabaseClient
): Promise<{ processed: number; succeeded: number; failed: number; skipped: number }> {
  // 1) Query all enabled autopay enrollments
  const { data: enrollments } = await supabase
    .from("autopay_enrollments")
    .select("id, lease_id, tenant_profile_id, stripe_payment_method_id, retry_count, last_failed_at")
    .eq("enabled", true);

  let processed = 0, succeeded = 0, failed = 0, skipped = 0;

  for (const enrollment of enrollments ?? []) {
    try {
      // 2) Find pending charges for this lease that are due today or overdue
      const today = new Date().toISOString().slice(0, 10);
      const { data: charges } = await supabase
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, status")
        .eq("lease_id", enrollment.lease_id)
        .in("status", ["pending", "late"])
        .lte("due_date", today);

      if (!charges || charges.length === 0) {
        // Also check retry: if retry_count > 0 and last_failed_at > 3 days ago
        // Query for charges that failed before
        continue;
      }

      // 3) For each charge, check no existing payment
      for (const charge of charges) {
        try {
          const { data: existingPayment } = await supabase
            .from("payments")
            .select("id")
            .eq("rent_charge_id", charge.id)
            .maybeSingle();

          if (existingPayment) {
            skipped++;
            continue;
          }

          // 4) Get tenant's stripe_customer_id
          const { data: profile } = await supabase
            .from("profiles")
            .select("stripe_customer_id")
            .eq("id", enrollment.tenant_profile_id)
            .single();

          if (!profile?.stripe_customer_id) {
            skipped++;
            continue;
          }

          // 5) Check owner has Stripe connected
          // Walk charge→lease→unit→property to get property_id
          const { data: lease } = await supabase
            .from("leases")
            .select("unit_id")
            .eq("id", charge.lease_id)
            .single();
          const { data: unit } = await supabase
            .from("units")
            .select("property_id")
            .eq("id", lease!.unit_id)
            .single();

          const ownerAccount = await getOwnerStripeAccountForProperty(unit!.property_id);
          if (!ownerAccount) {
            skipped++;
            continue;
          }

          // 6) Create off-session PaymentIntent
          processed++;
          const pi = await createOffSessionPaymentIntent({
            customerId: profile.stripe_customer_id,
            paymentMethodId: enrollment.stripe_payment_method_id,
            amountCents: charge.amount_cents,
            metadata: {
              charge_id: charge.id,
              user_id: enrollment.tenant_profile_id,
              lease_id: enrollment.lease_id,
              autopay: "true"
            },
            transferGroup: `charge_${charge.id}`
          });

          if (pi.status === "succeeded") {
            succeeded++;
          }
          // If requires_action or other status, Stripe will send webhook
        } catch (chargeError) {
          console.error(`[autopay] Failed to process charge ${charge.id}:`, chargeError);
          failed++;
        }
      }
    } catch (enrollmentError) {
      console.error(`[autopay] Failed to process enrollment ${enrollment.id}:`, enrollmentError);
      failed++;
    }
  }

  return { processed, succeeded, failed, skipped };
}
```

Import `getOwnerStripeAccountForProperty` from `@/lib/stripe-connect` and `createOffSessionPaymentIntent` from `@/lib/autopay`.

**Modify `apps/web/app/api/cron/generate-charges/route.ts`:**
```typescript
// After generateMonthlyChargesForAllOwnersWithClient(adminClient):
import { processAutopayCharges } from "@/lib/charges";

// Add between charge generation and reminders:
let autopaySummary = "Autopay skipped";
try {
  autopaySummary = await processAutopayCharges(adminClient);
} catch (error) {
  console.error("Autopay processing failed:", error);
  autopaySummary = "Autopay failed";
}

// Include in response:
return NextResponse.json({ ok: true, summary, autopaySummary, reminderSummary });
```

### Part F: Tenant UI

**Create `apps/web/components/dashboard/autopay-card.tsx`**

Client component ("use client"):

```typescript
interface AutopayCardProps {
  leaseId: string;
  propertyLabel: string;
  enrollment: {
    id: string;
    last4: string;
    brand: string | null;
    paymentMethodType: string;
    enabled: boolean;
    retryCount: number;
  } | null;
}
```

States:
- **Enrolled + enabled**: Emerald border card. Shows "✓ Autopay Active" + "•••• {last4}" + brand. "Disable" button calls `disableAutopay` action.
- **Enrolled + disabled**: Amber border card. Shows "Autopay Paused" + warning text. "Re-enable" button goes through setup flow again (calls `setupAutopay`).
- **Not enrolled**: Violet dashed-border card. Shows "Enable Autopay" with description "Automatically pay rent on the due date." Button calls `setupAutopay` action.

Use `useActionState` for the disable action (same pattern as record-payment form in charges-section).

**Modify `apps/web/components/dashboard/charges-section.tsx`:**
- Accept new prop: `autopayEnrollments` (array of enrollment objects)
- At the top of the charges section (before the filter tabs), for tenant role only:
  - Get unique lease IDs from charges
  - Render one `AutopayCard` per lease, matching enrollment by lease_id
- Add success banner: if URL has `?autopay=enrolled`, show emerald alert "Autopay enabled! Your rent will be charged automatically on the due date."

**Modify `apps/web/app/tenant/page.tsx`:**
- Import `getAutopayEnrollments` from `@/app/actions/autopay`
- Call `getAutopayEnrollments(user.id)` alongside existing data fetches
- Pass `autopayEnrollments` to the dashboard data / charges section

### Part G: Settings Integration

**Modify `apps/web/app/settings/page.tsx`:**
- Import `getAutopayEnrollments` from `@/app/actions/autopay`
- For tenant role, fetch enrollments
- Add "Payment Methods" section (after Profile section, before Appearance):

```tsx
{role === "tenant" ? (
  <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
    <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
      Payment Methods
    </h2>
    <div className="mt-3 space-y-3">
      {enrollments.map((enrollment) => (
        <AutopayCard
          key={enrollment.id}
          leaseId={enrollment.leaseId}
          propertyLabel={enrollment.propertyLabel}
          enrollment={enrollment}
        />
      ))}
      {enrollments.length === 0 && (
        <p className="text-sm text-zinc-500">No autopay enrollments yet. Enable autopay from your Charges section.</p>
      )}
    </div>
  </section>
) : null}
```

## Validation Commands

```bash
npm run gate:web        # Must pass: lint, typecheck, build, 228+ tests
```

## Acceptance Criteria

1. `profiles.stripe_customer_id` column exists in Supabase (already applied)
2. `autopay_enrollments` table exists with RLS policies (already applied)
3. `lib/autopay.ts` exports `createStripeCustomer`, `createSetupCheckoutSession`, `retrieveSetupIntent`, `getPaymentMethod`, `createOffSessionPaymentIntent` — all using raw `fetch()` to Stripe API
4. `setupAutopay` action: validates tenant role, verifies tenant on lease, gets-or-creates Stripe Customer, creates setup Checkout Session, redirects to Stripe
5. `disableAutopay` action: validates ownership, sets `enabled = false`, returns ActionState
6. `getAutopayEnrollments` returns enrollment data with property labels for a tenant
7. `/autopay/return` page: reads `setup_intent` from URL, retrieves payment method details, upserts enrollment, redirects to `/tenant?autopay=enrolled`
8. Webhook `payment_intent.succeeded` handler: records payment (method "autopay"), marks charge paid, creates owner+manager transfers, resets retry_count, notifications + XP
9. Webhook `payment_intent.payment_failed` handler: increments retry_count, disables after 2 failures, notifies tenant and owner members
10. `processAutopayCharges()` in `lib/charges.ts`: queries enabled enrollments, finds due/overdue pending charges, creates off-session PaymentIntents with per-charge fault isolation
11. Cron route calls `processAutopayCharges()` between charge generation and reminders
12. `AutopayCard` component renders 3 states: enrolled+enabled, enrolled+disabled, not-enrolled
13. `charges-section.tsx` renders AutopayCard for tenant role at top of section
14. `tenant/page.tsx` fetches and passes autopay enrollment data
15. `settings/page.tsx` shows "Payment Methods" section for tenants with enrollment list
16. `validations.ts` has `setupAutopaySchema` and `disableAutopaySchema`
17. `actions/index.ts` exports `setupAutopay` and `disableAutopay`
18. `npm run gate:web` passes (lint + typecheck + build + tests)

## Report Format

```
gate_pass: boolean
lint_clean: boolean
build_clean: boolean
tests_pass: boolean
test_count: number
files_created: string[]
files_modified: string[]
commit_sha: string
```

## Constraints
- Do NOT apply any database migrations — already done via Supabase MCP
- Do NOT deploy — Claude handles deployment
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Maintain raw `fetch()` to Stripe API — no Stripe SDK
- All notifications fire-and-forget (`.catch(() => {})`)
- All XP awards fire-and-forget (`.catch(() => {})`)
- Use admin client (`createAdminClient()`) for all webhook and cron mutations
- Use regular client (`createClient()`) for tenant-facing reads where RLS applies
