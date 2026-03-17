# Sprint 34 — Codex Implementation Prompt

## 1. Objective

Harden security and correctness of Sprint 31–33 features (withdrawal execution, approval workflows, account wipe), fix notification CTAs, and split 3 god files (>800 lines) for maintainability.

## 2. Context

- **Branch**: `main`
- **HEAD**: `55c3dd2`
- **Gate baseline**: 503/503 tests, lint clean, typecheck clean, build clean
- **Supabase project**: `vawqdqkaguhdgfhdebqw` (migration NOT applied — Claude will apply after verification)
- **Migration file already on disk**: `supabase/migrations/20260316_sprint34_withdrawal_hardening.sql` — expands status CHECK constraint + adds `stripe_transfer_id` column to `withdrawal_requests`
- **Key existing patterns**:
  - `requireAuth()` in `actions/auth-helpers.ts`
  - `checkRateLimit()` in `lib/rate-limit.ts`
  - `canUserAdministerOwnershipAccount()` in `lib/ownership.ts`
  - `isMissingSchemaError()` in `lib/supabase-errors.ts`
  - `createAdminClient()` in `lib/supabase/admin.ts`
  - `notifyAccountMembers()` in `lib/notifications.ts`
  - `createStripeTransfer()` in `lib/stripe.ts`
  - `formatCurrency()` in `lib/format.ts`
  - `applyDistributionConfig()` in `lib/distributions.ts`
  - `resolveWithdrawal()` in `lib/withdrawals.ts`
  - `resolveRequest()` in `lib/distribution-approvals.ts`

## 3. In Scope

### Part A: Withdrawal Execution Safety (CRITICAL)
- Rewrite `executeApprovedWithdrawal` with optimistic locking + Stripe idempotency key
- Add `idempotencyKey` parameter to `createStripeTransfer` in `lib/stripe.ts`
- Expand `WithdrawalRequestDTO.status` to include `"executing"` and `"failed"`
- Add `stripe_transfer_id` to `WithdrawalRequestDTO` and withdrawal select query
- Handle `"executing"` and `"failed"` statuses in withdrawal-request-card.tsx

### Part B: Email Filter Injection Fix (CRITICAL)
- Replace `.or()` string construction in `fullAccountWipe` with parameterized queries

### Part C: Approval Resolution Race Conditions (HIGH)
- Add optimistic lock (`.eq("status", "pending")`) to `resolveWithdrawal()` and `resolveRequest()`
- Fix `resolveRequest()` to not commit "approved" status if `applyDistributionConfig()` fails

### Part D: Notification CTA Deep Links (HIGH)
- Add 7 switch cases for Sprint 32 notification types

### Part E: DRY Member Helpers + Parallel Awaits
- Extract shared `getActiveMembers()` helper
- Parallelize independent sequential DB reads in `executeApprovedWithdrawal`

### Part F: Split God Files
- `lib/reports.ts` (824 lines) → 4 domain modules + barrel
- `app/api/webhooks/stripe/route.ts` (836 lines) → route + handlers lib
- `components/dashboard/index.tsx` (917 lines) → 3 modules

## 4. Out of Scope

- Test file modifications
- CLAUDE.md / AGENTS.md edits
- Applying the migration to Supabase (Claude does this)
- Deploying to Vercel (Claude does this)
- New npm dependencies
- Plaid webhooks
- Dashboard context refactoring

## 5. Exact Files Expected to Change

### New Files (8 — migration already exists on disk)
1. `apps/web/lib/ownership-members.ts`
2. `apps/web/lib/reports-rent-roll.ts`
3. `apps/web/lib/reports-delinquency.ts`
4. `apps/web/lib/reports-ledger.ts`
5. `apps/web/lib/reports-pnl.ts`
6. `apps/web/lib/stripe-webhook-handlers.ts`
7. `apps/web/components/dashboard/dashboard-data-loader.tsx`
8. `apps/web/components/dashboard/dashboard-layout.tsx`

### Modified Files (11)
1. `apps/web/app/actions/withdrawals.ts`
2. `apps/web/app/actions/account-wipe.ts`
3. `apps/web/lib/withdrawals.ts`
4. `apps/web/lib/distribution-approvals.ts`
5. `apps/web/lib/notifications.ts`
6. `apps/web/app/actions/distribution-approvals.ts`
7. `apps/web/lib/reports.ts`
8. `apps/web/app/api/webhooks/stripe/route.ts`
9. `apps/web/components/dashboard/index.tsx`
10. `apps/web/components/dashboard/withdrawal-request-card.tsx`
11. `apps/web/lib/stripe.ts`

## 6. Implementation Requirements

### Part A: Withdrawal Execution Safety

#### A.1: Add idempotency key to `createStripeTransfer` (`lib/stripe.ts`)

Current signature:
```typescript
export async function createStripeTransfer(params: {
  amountCents: number;
  destination: string;
  transferGroup?: string;
  description?: string;
}): Promise<{ id: string; amount: number }>
```

Add `idempotencyKey?: string` to the params. When provided, include it as the `Idempotency-Key` header in the fetch call:
```typescript
headers: {
  Authorization: `Bearer ${secretKey}`,
  "Content-Type": "application/x-www-form-urlencoded",
  ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {})
}
```

#### A.2: Expand `WithdrawalRequestDTO` (`lib/withdrawals.ts`)

Update the status union:
```typescript
status: "pending" | "approved" | "rejected" | "cancelled" | "completed" | "executing" | "failed";
```

Add `stripeTransferId` field:
```typescript
export interface WithdrawalRequestDTO {
  // ... existing fields ...
  stripeTransferId: string | null;
}
```

Update `WithdrawalRow` interface to match:
```typescript
interface WithdrawalRow {
  // ... existing fields ...
  stripe_transfer_id: string | null;
}
```

Update the select query in `resolveWithdrawal` to include `stripe_transfer_id`.
Map it in the DTO builder: `stripeTransferId: requestRow.stripe_transfer_id ?? null`.

Also update `getPendingWithdrawals` and `getWithdrawalHistory` select queries if they exist.

#### A.3: Add optimistic lock to `resolveWithdrawal` (`lib/withdrawals.ts`)

Current code (~line 206):
```typescript
const { error: updateError } = await admin
  .from("withdrawal_requests")
  .update({ status: nextStatus, resolved_at: resolvedAt, votes_received: votes.length })
  .eq("id", requestId);
```

Change to:
```typescript
const { data: updated, error: updateError } = await admin
  .from("withdrawal_requests")
  .update({ status: nextStatus, resolved_at: resolvedAt, votes_received: votes.length })
  .eq("id", requestId)
  .eq("status", "pending")  // optimistic lock — only transition if still pending
  .select("id")
  .maybeSingle();

if (updateError) {
  if (!isMissingSchemaError(updateError)) {
    console.error("resolveWithdrawal update error:", updateError);
  }
  return null;
}

// If another concurrent voter already resolved, just return current DTO
if (!updated) {
  // Re-fetch current state and return it
  // (skip the notification — it was already sent by the first resolver)
}
```

#### A.4: Rewrite `executeApprovedWithdrawal` (`actions/withdrawals.ts`)

Replace the current implementation (lines 257–389) with this flow:

```typescript
export async function executeApprovedWithdrawal(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { user } = await requireAuth("owner");

    if (!checkRateLimit(`executeWithdrawal:${user.id}`, 5, 60_000).allowed) {
      return { success: false, error: "Too many requests." };
    }

    const withdrawalId = formData.get("withdrawalId");
    if (typeof withdrawalId !== "string" || withdrawalId.trim().length === 0) {
      return { success: false, error: "Missing withdrawal ID." };
    }

    const admin = createAdminClient();

    // 1. Fetch withdrawal
    const { data: withdrawal, error: fetchError } = await admin
      .from("withdrawal_requests")
      .select("id, ownership_account_id, requested_by, amount_cents, status")
      .eq("id", withdrawalId)
      .maybeSingle();
    // Handle errors, verify found

    if (!withdrawal) return { success: false, error: "Withdrawal request not found." };

    // 2. Verify status allows execution
    if (withdrawal.status !== "approved" && withdrawal.status !== "failed") {
      return { success: false, error: "Only approved or failed withdrawals can be executed." };
    }

    // 3. OPTIMISTIC LOCK — claim the withdrawal by transitioning to "executing"
    const { data: claimed, error: claimError } = await admin
      .from("withdrawal_requests")
      .update({ status: "executing" })
      .eq("id", withdrawalId)
      .in("status", ["approved", "failed"])  // only if still in executable state
      .select("id")
      .maybeSingle();

    if (claimError) {
      if (isMissingSchemaError(claimError)) return { success: false, error: SCHEMA_ERROR_MESSAGE };
      return { success: false, error: "Unable to process this withdrawal." };
    }
    if (!claimed) {
      return { success: false, error: "This withdrawal is already being processed by another admin." };
    }

    // 4. Permission check + fetch account + fetch member payout account (PARALLEL)
    const [canAdmin, accountResult, membershipResult] = await Promise.all([
      canUserAdministerOwnershipAccount(user.id, withdrawal.ownership_account_id),
      admin
        .from("ownership_accounts")
        .select("display_name, stripe_account_id")
        .eq("id", withdrawal.ownership_account_id)
        .maybeSingle(),
      admin
        .from("ownership_account_members")
        .select("payout_stripe_account_id")
        .eq("account_id", withdrawal.ownership_account_id)
        .eq("profile_id", withdrawal.requested_by)
        .eq("active", true)
        .maybeSingle()
    ]);

    if (!canAdmin) {
      // Roll back to "approved" since we can't execute
      await admin.from("withdrawal_requests").update({ status: "approved" }).eq("id", withdrawalId);
      return { success: false, error: "Access denied." };
    }

    // Validate account and membership results (handle errors, check null)
    // If validation fails, roll back status to previous state (approved or failed)
    const ownershipAccount = accountResult.data;
    const membership = membershipResult.data;

    if (!ownershipAccount?.stripe_account_id) {
      await admin.from("withdrawal_requests").update({ status: "approved" }).eq("id", withdrawalId);
      return { success: false, error: "This LLC does not have a connected Stripe account." };
    }
    if (!membership?.payout_stripe_account_id) {
      await admin.from("withdrawal_requests").update({ status: "approved" }).eq("id", withdrawalId);
      return { success: false, error: "The requester must connect a payout account first." };
    }

    // 5. Create Stripe transfer with idempotency key
    try {
      const transfer = await createStripeTransfer({
        amountCents: withdrawal.amount_cents,
        destination: membership.payout_stripe_account_id,
        transferGroup: `withdrawal:${withdrawal.id}`,
        description: `Withdrawal payout for ${ownershipAccount.display_name ?? "ownership account"}`,
        idempotencyKey: `withdrawal:${withdrawalId}`
      });

      // 6. SUCCESS — mark completed with transfer ID
      const { error: completeError } = await admin
        .from("withdrawal_requests")
        .update({
          status: "completed",
          stripe_transfer_id: transfer.id,
          resolved_at: new Date().toISOString()
        })
        .eq("id", withdrawalId);

      if (completeError) {
        if (isMissingSchemaError(completeError)) return { success: false, error: SCHEMA_ERROR_MESSAGE };
        console.error("executeApprovedWithdrawal complete error:", completeError);
        return { success: false, error: "Payout sent, but status could not be updated." };
      }

      // 7. Notify and revalidate
      await notifyAccountMembers({ ... });
      revalidatePath("/owner");
      return { success: true, message: `Payout executed (${transfer.id}).` };
    } catch (stripeError) {
      // STRIPE FAILURE — mark as "failed"
      await admin
        .from("withdrawal_requests")
        .update({ status: "failed" })
        .eq("id", withdrawalId);

      console.error("executeApprovedWithdrawal stripe error:", stripeError);
      return {
        success: false,
        error: stripeError instanceof Error
          ? `Transfer failed: ${stripeError.message}. The withdrawal has been marked as failed.`
          : "Transfer failed. The withdrawal has been marked as failed for review."
      };
    }
  } catch (error) {
    console.error("executeApprovedWithdrawal error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unable to execute the payout." };
  }
}
```

#### A.5: Update withdrawal card (`withdrawal-request-card.tsx`)

1. Update `statusVariant()` to handle new statuses:
```typescript
case "executing":
  return "warning" as const;
case "failed":
  return "destructive" as const;
```

2. Add a new condition in the card body (after the existing `request.status === "approved"` block):
```typescript
// For "failed" status — show retry button
request.status === "failed" && isAdmin && onExecuteApprovedWithdrawal ? (
  <div className="space-y-2">
    <Alert variant="error" className="text-xs font-normal">
      The previous payout attempt failed. You can retry the payout.
    </Alert>
    <ExecuteWithdrawalForm
      request={request}
      onExecuteApprovedWithdrawal={onExecuteApprovedWithdrawal}
    />
  </div>
) : request.status === "executing" ? (
  <Alert variant="info" className="text-xs font-normal">
    Payout is currently being processed…
  </Alert>
)
```

### Part B: Email Filter Injection Fix (`account-wipe.ts`)

In `fullAccountWipe`, replace the `.or()` invitations delete block (~lines 582–597) with separate parameterized deletes:

```typescript
// Delete invitations by property
if (scope.propertyIds.length > 0) {
  await executeMutation(
    admin.from("invitations").delete().in("property_id", scope.propertyIds),
    "Delete invitations by property"
  );
}
// Delete invitations by ownership account
if (scope.accountIds.length > 0) {
  await executeMutation(
    admin.from("invitations").delete().in("ownership_account_id", scope.accountIds),
    "Delete invitations by account"
  );
}
// Delete invitations by email (parameterized — safe)
if (auth.email) {
  await executeMutation(
    admin.from("invitations").delete().eq("email", auth.email.toLowerCase()),
    "Delete invitations by email"
  );
}
// Delete invitations by relationship to user
await executeMutation(
  admin.from("invitations").delete().eq("invited_by", auth.userId),
  "Delete invitations by inviter"
);
await executeMutation(
  admin.from("invitations").delete().eq("invited_profile_id", auth.userId),
  "Delete invitations by invitee"
);
```

Remove the old `.or()` block entirely.

### Part C: Approval Resolution Race Conditions

#### C.1: Fix `resolveRequest()` in `lib/distribution-approvals.ts`

Current code (~lines 231–251) applies config THEN updates status. This means if two concurrent resolvers run, both apply config. Also, if `applyDistributionConfig` fails, it returns `null` but the request stays pending forever.

**New flow**:
1. Check votes → determine `nextStatus`
2. If `nextStatus === "approved"`:
   a. First, try the optimistic-lock status update: `.update({ status: "approved", ... }).eq("id", requestId).eq("status", "pending").select("id").maybeSingle()`
   b. If `!updated` (another voter already resolved), skip config apply, just return current DTO
   c. If `updated`, THEN call `applyDistributionConfig()`
   d. If `applyDistributionConfig()` fails, roll back status to "pending": `.update({ status: "pending", resolved_at: null }).eq("id", requestId)`. Log the error and return `null`.
3. If `nextStatus === "rejected"`:
   a. Same optimistic lock: `.eq("status", "pending")`

#### C.2: Fix `resolveWithdrawal()` in `lib/withdrawals.ts`

(Already described in Part A.3 above — add `.eq("status", "pending")` to the update, handle no-op gracefully.)

### Part D: Notification CTA Deep Links (`lib/notifications.ts`)

In the `getNotificationCta` switch statement (~line 80), add before `default`:

```typescript
case "distribution_change_requested":
case "distribution_change_approved":
case "distribution_change_rejected":
  return { text: "View Account", url: `${baseUrl}/owner` };
case "withdrawal_requested":
case "withdrawal_approved":
case "withdrawal_rejected":
case "withdrawal_completed":
  return { text: "View Account", url: `${baseUrl}/owner` };
```

### Part E: DRY + Parallel Awaits

#### E.1: New `lib/ownership-members.ts`

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";

const SCHEMA_ERROR_MESSAGE = "This feature requires a database update. Please try again later.";

export async function getActiveMembers(
  accountId: string
): Promise<{ members: { profileId: string }[] } | { error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ownership_account_members")
    .select("profile_id")
    .eq("account_id", accountId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingSchemaError(error)) {
      return { error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("getActiveMembers error:", error);
    return { error: "Unable to load account members." };
  }
  return { members: (data ?? []).map((row) => ({ profileId: row.profile_id })) };
}
```

#### E.2: Update `actions/withdrawals.ts`

Remove the local `getActiveMemberCount` function (~lines 18–38). Import from shared:
```typescript
import { getActiveMembers } from "@/lib/ownership-members";
```

Replace usage: `getActiveMemberCount(accountId)` → `getActiveMembers(accountId)`, then use `.members.length` for the count.

#### E.3: Update `actions/distribution-approvals.ts`

Remove the local `getActiveMemberIds` function (~lines 44–67). Import from shared:
```typescript
import { getActiveMembers } from "@/lib/ownership-members";
```

Replace usage: `getActiveMemberIds(accountId)` → `getActiveMembers(accountId)`, then use `.members.map(m => m.profileId)` for the IDs.

#### E.4: Parallelize in `executeApprovedWithdrawal`

(Already shown in Part A.4 above — the `Promise.all` for canAdmin + account + membership.)

### Part F: Split God Files

#### F.1: Split `lib/reports.ts` (824 lines)

Look at the exports:
- `RentRollItem`, `getRentRollReport` → `reports-rent-roll.ts`
- `DelinquencyItem`, `bucketDelinquencyDays`, `getDelinquencyReport`, `ReceivableItem`, `getReceivablesReport` → `reports-delinquency.ts`
- `TenantLedgerEntry`, `TenantLedger`, `getTenantLedgerReport` → `reports-ledger.ts`
- `MonthlyPnLRow`, `TaxSummaryRow`, `mapExpenseCategoryToTaxField`, `getMonthlyPnLReport`, `getTaxSummaryReport` → `reports-pnl.ts`

Each new file needs its own imports (`createAdminClient`, `getAdministeredPropertyIds`, `isMissingSchemaError`).

**CRITICAL**: `reports.ts` becomes a barrel re-export:
```typescript
export * from "./reports-rent-roll";
export * from "./reports-delinquency";
export * from "./reports-ledger";
export * from "./reports-pnl";
```

No consumer import changes needed — everything still works via `@/lib/reports`.

#### F.2: Split `app/api/webhooks/stripe/route.ts` (836 lines)

Create `apps/web/lib/stripe-webhook-handlers.ts`. Extract ALL event handler functions (anything like `handlePaymentIntentSucceeded`, `handleChargeRefunded`, `handleInvoicePaid`, etc.) into this file.

The route file retains:
- The `POST` export function
- Signature verification via `verifyWebhookSignature()`
- The event type switch statement that dispatches to handlers
- Error handling and response construction

Target: route.ts ≤300 lines.

The handlers file exports each handler function individually. The route imports them:
```typescript
import { handlePaymentIntentSucceeded, handleChargeRefunded, ... } from "@/lib/stripe-webhook-handlers";
```

#### F.3: Split `components/dashboard/index.tsx` (917 lines)

**`dashboard-data-loader.tsx`** (new file):
- Extract all `useEffect` hooks that sync state from props
- Extract all `useState` declarations that manage dashboard data state
- Export a custom hook: `useDashboardData(props: DashboardProps)` that returns all the state values and setters
- This keeps all the data initialization logic in one place

**`dashboard-layout.tsx`** (new file):
- Extract the layout JSX: sidebar, mobile nav, content area wrapper
- Export: `DashboardLayout({ children, ...layoutProps })` component
- Props: active section, sidebar config, mobile menu state, navigation callbacks

**`index.tsx`** (modified):
- Import and use `useDashboardData()` hook
- Import and render `DashboardLayout` component
- Pass content to layout as children
- Target: ≤350 lines

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] `executeApprovedWithdrawal` uses optimistic lock (`SET status = 'executing' WHERE status IN ('approved', 'failed')`)
2. [ ] `createStripeTransfer` accepts optional `idempotencyKey` and passes as header
3. [ ] Stripe idempotency key format: `withdrawal:{withdrawalId}`
4. [ ] On Stripe failure: withdrawal status set to `"failed"`, NOT left as `"approved"`
5. [ ] On Stripe success: `stripe_transfer_id` stored on `withdrawal_requests` row
6. [ ] `WithdrawalRequestDTO` includes `stripeTransferId` field and `"executing"` + `"failed"` statuses
7. [ ] Withdrawal card shows "Processing…" for `executing`, red retry for `failed`
8. [ ] Account wipe: no raw string interpolation in `.or()` — all parameterized `.eq()` / `.in()` calls
9. [ ] `resolveWithdrawal()` uses `.eq("status", "pending")` optimistic lock
10. [ ] `resolveRequest()` uses `.eq("status", "pending")` optimistic lock
11. [ ] `resolveRequest()` rolls back status if `applyDistributionConfig()` fails
12. [ ] All 7 notification types have proper CTAs (not "Open Domus")
13. [ ] `lib/ownership-members.ts` exports `getActiveMembers()`, used by both action files
14. [ ] Local `getActiveMemberCount`/`getActiveMemberIds` removed from action files
15. [ ] `executeApprovedWithdrawal` uses `Promise.all` for parallel permission + account + member reads
16. [ ] `lib/reports.ts` is a barrel re-export file (≤15 lines), with 4 domain-specific modules
17. [ ] `app/api/webhooks/stripe/route.ts` ≤300 lines, handlers in `lib/stripe-webhook-handlers.ts`
18. [ ] `components/dashboard/index.tsx` ≤350 lines, with extracted data-loader and layout modules
19. [ ] No consumer import changes needed for any split (barrel re-exports preserve paths)
20. [ ] `npm run gate:web` passes — all tests, lint, typecheck, build clean

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

- Do NOT apply the migration to Supabase (Claude will apply it after verification)
- Do NOT deploy to Vercel
- Do NOT modify test files
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections — report compact status only
- Use `requireAuth()` from `actions/auth-helpers.ts` in ALL server actions
- Use `checkRateLimit()` from `lib/rate-limit.ts` in ALL write actions
- Use `isMissingSchemaError()` from `lib/supabase-errors.ts` for ALL Supabase queries
- Use `createAdminClient()` for any query that reads sensitive data
- Every `.update()`, `.insert()`, `.delete()` call must have its error result checked
- Barrel re-exports must preserve all existing import paths
