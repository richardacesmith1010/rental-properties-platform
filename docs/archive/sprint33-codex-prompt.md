# Sprint 33 — Codex Implementation Prompt

## 1. Objective

Integrate Plaid for bank balance visibility on LLC ownership accounts, wire up withdrawal execution via Stripe transfers, and polish the Settings UX.

## 2. Context

- **Branch**: `main`
- **HEAD**: `4b150b1`
- **Gate baseline**: 503/503 tests, lint clean, typecheck clean, build clean
- **Supabase project**: `vawqdqkaguhdgfhdebqw` (migration NOT applied — Claude will apply after verification)
- **Migration file already on disk**: `supabase/migrations/20260316_sprint33_plaid_integration.sql` — adds 7 Plaid columns to `ownership_accounts`
- **Key existing patterns**:
  - `lib/stripe-connect.ts` — API wrapper pattern (typed responses, env validation, thin functions)
  - `requireAuth()` in `actions/auth-helpers.ts` — shared auth for all server actions
  - `checkRateLimit()` in `lib/rate-limit.ts` — rate limiting for write actions
  - `canUserAdministerOwnershipAccount()` in `lib/ownership.ts` — permission check
  - `isMissingSchemaError()` in `lib/supabase-errors.ts` — graceful schema mismatch handling
  - `createAdminClient()` in `lib/supabase/admin.ts` — RLS-bypass client for server actions
  - `notifyAccountMembers()` in `lib/notifications.ts` — account-scoped notification batch send
  - `createStripeTransfer()` in `lib/stripe.ts` — Stripe transfer creation
  - `getEnvStatus()` in `lib/env.ts` — env var validation

## 3. In Scope

### Part A: Plaid Server SDK + API Wrapper
- Install `plaid` npm package (server SDK only)
- New `lib/plaid.ts` with: `createLinkToken()`, `exchangePublicToken()`, `getAccounts()`, `getBalances()`
- New `app/actions/plaid.ts` with: `initiatePlaidLink`, `completePlaidLink`, `refreshPlaidBalance`, `disconnectPlaid`

### Part B: Bank Balance Display
- Extend `OwnershipAccountDTO` with Plaid fields
- New `bank-balance-card.tsx` component
- New `plaid-link-button.tsx` client component (vanilla JS Plaid Link, no react-plaid-link)

### Part C: Withdrawal Execution
- New `executeApprovedWithdrawal` action in `actions/withdrawals.ts`
- Execute payout button on approved withdrawal cards

### Part D: Settings Polish
- Restrict "Account & Data" tab to owner role only

### Part E: Prop Threading
- Thread 5 new actions through types → owner/page → index → section-renderer → ownership-section

## 4. Out of Scope

- Plaid production keys (use sandbox/development mode)
- Automatic balance refresh cron job (manual refresh only for now)
- Plaid webhooks (future sprint)
- Test file modifications
- CLAUDE.md / AGENTS.md edits
- Applying the migration to Supabase (Claude does this)
- Deploying to Vercel (Claude does this)

## 5. Exact Files Expected to Change

### New Files (4 — migration already exists on disk)
1. `apps/web/lib/plaid.ts`
2. `apps/web/app/actions/plaid.ts`
3. `apps/web/components/dashboard/bank-balance-card.tsx`
4. `apps/web/components/dashboard/plaid-link-button.tsx`

### Modified Files (11)
1. `apps/web/lib/ownership.ts`
2. `apps/web/lib/env.ts`
3. `apps/web/components/dashboard/ownership-section.tsx`
4. `apps/web/app/actions/withdrawals.ts`
5. `apps/web/components/dashboard/withdrawal-request-card.tsx`
6. `apps/web/components/dashboard/types.ts`
7. `apps/web/app/owner/page.tsx`
8. `apps/web/components/dashboard/index.tsx`
9. `apps/web/components/dashboard/section-renderer.tsx`
10. `apps/web/app/actions/index.ts`
11. `apps/web/components/settings/settings-layout.tsx`

### package.json change
- `apps/web/package.json` — add `plaid` dependency

## 6. Implementation Requirements

### Part A: Plaid Library (`lib/plaid.ts`)

Model after `lib/stripe-connect.ts` pattern. Use the official `plaid` Node SDK.

```typescript
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";

function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV ?? "sandbox";
  if (!clientId || !secret) throw new Error("Plaid credentials not configured");
  const config = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: { headers: { "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret } }
  });
  return new PlaidApi(config);
}
```

Functions:
- `createLinkToken(userId: string)` → returns `{ linkToken: string }`
  - Products: `[Products.Auth, Products.Transactions]`
  - CountryCode: `[CountryCode.Us]`
  - Language: `"en"`
  - Client name: `"Domus"`
- `exchangePublicToken(publicToken: string)` → returns `{ accessToken: string; itemId: string }`
- `getAccounts(accessToken: string)` → returns array of `{ accountId, name, mask, type, subtype }`
- `getBalances(accessToken: string, accountId: string)` → returns `{ currentCents: number; availableCents: number | null }`
  - Convert Plaid's dollar amounts to cents (multiply by 100, round)

### Part A.2: Plaid Actions (`app/actions/plaid.ts`)

**`initiatePlaidLink(_prev, formData)`**:
- `requireAuth("owner")` + `checkRateLimit("plaidLink:userId", 10, 60000)`
- Read `accountId` from formData
- `canUserAdministerOwnershipAccount(user.id, accountId)`
- Call `createLinkToken(user.id)`
- Return `{ success: true, message: linkToken }` (the client reads `message` to get the token)

**`completePlaidLink(_prev, formData)`**:
- `requireAuth("owner")` + `checkRateLimit()`
- Read `accountId`, `publicToken`, `plaidAccountId`, `bankName`, `bankMask` from formData
- `canUserAdministerOwnershipAccount()`
- Call `exchangePublicToken(publicToken)` → get accessToken + itemId
- Call `getBalances(accessToken, plaidAccountId)` → get initial balance
- Update `ownership_accounts` via `createAdminClient()`:
  ```
  plaid_access_token = accessToken
  plaid_item_id = itemId
  plaid_account_id = plaidAccountId
  plaid_bank_name = bankName
  plaid_bank_mask = bankMask
  plaid_balance_cents = currentCents
  plaid_balance_updated_at = now()
  ```
- Check update result for errors
- `revalidatePath("/owner")`
- Return success

**`refreshPlaidBalance(_prev, formData)`**:
- `requireAuth("owner")` + `checkRateLimit("plaidRefresh:accountId", 5, 60000)`
- Read `accountId` from formData
- Fetch `plaid_access_token` and `plaid_account_id` from `ownership_accounts` via admin client
- If no access token → return error "Bank not connected"
- Call `getBalances(accessToken, accountId)`
- Update `plaid_balance_cents` and `plaid_balance_updated_at`
- `revalidatePath("/owner")`

**`disconnectPlaid(_prev, formData)`**:
- `requireAuth("owner")` + `checkRateLimit()`
- `canUserAdministerOwnershipAccount()`
- Set all plaid columns to null on `ownership_accounts`
- `revalidatePath("/owner")`

### Part A.3: Env validation (`lib/env.ts`)

Add to `getEnvStatus()`:
```typescript
PLAID_CLIENT_ID: Boolean(process.env.PLAID_CLIENT_ID),
PLAID_SECRET: Boolean(process.env.PLAID_SECRET),
PLAID_ENV: Boolean(process.env.PLAID_ENV),
```

### Part B: Bank Balance Display

**Extend `OwnershipAccountDTO` in `lib/ownership.ts`**:
```typescript
export interface OwnershipAccountDTO {
  // ... existing fields ...
  plaidConnected: boolean;
  bankName: string | null;
  bankMask: string | null;
  balanceCents: number | null;
  balanceUpdatedAt: string | null;
}
```

**Modify the select query at line 72** of `lib/ownership.ts`:
```
.select("id, account_type, display_name, join_code, stripe_account_id, stripe_onboarding_complete, distribution_mode, plaid_account_id, plaid_bank_name, plaid_bank_mask, plaid_balance_cents, plaid_balance_updated_at")
```
**NEVER select `plaid_access_token`** — it stays server-side only.

Map the new columns in the DTO builder:
```typescript
plaidConnected: Boolean(account.plaid_account_id),
bankName: account.plaid_bank_name ?? null,
bankMask: account.plaid_bank_mask ?? null,
balanceCents: account.plaid_balance_cents ?? null,
balanceUpdatedAt: account.plaid_balance_updated_at ?? null,
```

Handle `isMissingSchemaError` gracefully — if columns don't exist yet, default to `plaidConnected: false` and nulls.

**`bank-balance-card.tsx`** — Client component:
- Props: `bankName`, `bankMask`, `balanceCents`, `balanceUpdatedAt`, `onRefreshBalance: StatefulAction`, `onDisconnect: StatefulAction`, `accountId: string`
- Show bank name + "••••{mask}"
- Show balance formatted via `formatCurrency(balanceCents)` (reuse from `lib/format.ts`)
- Show "Updated X minutes ago" relative timestamp
- "Refresh" button → submit form with accountId → calls `onRefreshBalance`
- "Disconnect" link (small, muted) → calls `onDisconnect` with typed confirmation
- Use `useFormState` for loading/error/success states

**`plaid-link-button.tsx`** — Client component:
- Props: `accountId: string`, `onInitiatePlaidLink: StatefulAction`, `onCompletePlaidLink: StatefulAction`
- Flow:
  1. User clicks "Connect Bank Account" button
  2. Component calls `onInitiatePlaidLink` via form submission with `accountId`
  3. On success, reads `result.message` which contains the `linkToken`
  4. Dynamically loads `https://cdn.plaid.com/link/v2/stable/link-initialize.js` (if not already loaded)
  5. Calls `window.Plaid.create({ token: linkToken, onSuccess, onExit })` and then `.open()`
  6. `onSuccess(publicToken, metadata)`: calls `onCompletePlaidLink` via form submission with `publicToken`, `plaidAccountId` (first account), `bankName`, `bankMask`
  7. Shows loading spinner during each step
- Use `useFormState` for the initiate step
- Use a ref + separate form for the complete step

### Part C: Withdrawal Execution

**Add to `app/actions/withdrawals.ts`** — `executeApprovedWithdrawal(_prev, formData)`:
```typescript
export async function executeApprovedWithdrawal(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  if (!checkRateLimit(`executeWithdrawal:${user.id}`, 5, 60_000).allowed) {
    return { success: false, error: "Too many requests." };
  }

  const withdrawalId = formData.get("withdrawalId") as string;
  if (!withdrawalId) return { success: false, error: "Missing withdrawal ID." };

  const admin = createAdminClient();

  // 1. Fetch withdrawal request
  const { data: withdrawal, error: fetchError } = await admin
    .from("withdrawal_requests")
    .select("id, ownership_account_id, requested_by, amount_cents, status")
    .eq("id", withdrawalId)
    .single();
  // Check errors, verify status === "approved"

  // 2. Verify caller is admin of the account
  const canAdmin = await canUserAdministerOwnershipAccount(user.id, withdrawal.ownership_account_id);

  // 3. Fetch LLC's stripe_account_id
  // 4. Fetch requester's payout_stripe_account_id from ownership_account_members

  // 5. Create Stripe transfer
  //    Use createStripeTransfer() from lib/stripe.ts
  //    source_transaction = null (platform balance), destination = member's payout account
  //    amount = withdrawal.amount_cents

  // 6. On success: update withdrawal status → "completed", set resolved_at
  // 7. Record in payment_distributions table
  // 8. Notify all members via notifyAccountMembers() with type "withdrawal_completed"
  // 9. revalidatePath("/owner")
}
```

**Modify `withdrawal-request-card.tsx`**:
- Accept new prop: `onExecuteApprovedWithdrawal?: StatefulAction`, `isAdmin?: boolean`
- When `request.status === "approved" && isAdmin && onExecuteApprovedWithdrawal`:
  - Render a green "Execute Payout — ${formatCurrency(request.amountCents)}" button
  - On submit: pass `withdrawalId` via hidden field
  - Use `useFormState` for loading/success/error feedback
  - Show a confirmation step: "Are you sure? This will transfer ${amount} to {requester}."

### Part D: Settings Polish

**Modify `settings-layout.tsx` line 34**:
```typescript
// Change from:
{ id: "account", label: "Account & Data", icon: Trash2 }
// To:
{ id: "account", label: "Account & Data", icon: Trash2, roles: ["owner"] }
```

### Part E: Prop Threading

**`types.ts`** — add to `DashboardProps`:
```typescript
onInitiatePlaidLink?: StatefulAction;
onCompletePlaidLink?: StatefulAction;
onRefreshPlaidBalance?: StatefulAction;
onDisconnectPlaid?: StatefulAction;
onExecuteApprovedWithdrawal?: StatefulAction;
```

**`owner/page.tsx`**:
- Import from `@/app/actions`: `initiatePlaidLink`, `completePlaidLink`, `refreshPlaidBalance`, `disconnectPlaid`, `executeApprovedWithdrawal`
- Pass as props to Dashboard

**`dashboard/index.tsx`**:
- Destructure 5 new props
- Thread to SectionRenderer

**`section-renderer.tsx`**:
- Add to SectionRendererProps
- Thread to OwnershipSection

**`ownership-section.tsx`**:
- Accept new props in interface
- For each LLC account: if `account.plaidConnected` → render `BankBalanceCard`; else → render `PlaidLinkButton`
- Pass `onExecuteApprovedWithdrawal` + `isAdmin` to each `WithdrawalRequestCard`
- Determine `isAdmin` from `currentUserId` matching an admin/owner role member

**`actions/index.ts`** — add exports:
```typescript
export {
  initiatePlaidLink,
  completePlaidLink,
  refreshPlaidBalance,
  disconnectPlaid
} from "./plaid";
export { executeApprovedWithdrawal } from "./withdrawals";
```

### npm install

Run `npm install plaid --workspace @domus/web` to add the Plaid server SDK.

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] `plaid` package installed in `apps/web/package.json`
2. [ ] `lib/plaid.ts` exports 4 functions (createLinkToken, exchangePublicToken, getAccounts, getBalances)
3. [ ] `actions/plaid.ts` exports 4 actions (initiatePlaidLink, completePlaidLink, refreshPlaidBalance, disconnectPlaid)
4. [ ] All Plaid actions use `requireAuth()` + `checkRateLimit()` + `canUserAdministerOwnershipAccount()`
5. [ ] `OwnershipAccountDTO` includes `plaidConnected`, `bankName`, `bankMask`, `balanceCents`, `balanceUpdatedAt`
6. [ ] `plaid_access_token` is NEVER selected in client-facing queries (only via admin client in actions)
7. [ ] `bank-balance-card.tsx` shows bank info, balance, refresh button, disconnect link
8. [ ] `plaid-link-button.tsx` uses vanilla JS Plaid Link (no react-plaid-link dependency)
9. [ ] `executeApprovedWithdrawal` action validates status=approved, creates Stripe transfer, updates status to completed
10. [ ] Withdrawal card shows "Execute Payout" button when status=approved and user is admin
11. [ ] "Account & Data" settings tab restricted to owner role via `roles: ["owner"]`
12. [ ] 5 new action props threaded through types → owner/page → dashboard → section-renderer → ownership-section
13. [ ] `lib/env.ts` includes PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV
14. [ ] `npm run gate:web` passes — all tests, lint, typecheck, build clean

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
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections — report compact status only
- Do NOT install `react-plaid-link` — use vanilla JS approach for Plaid Link client
- Use `requireAuth()` from `actions/auth-helpers.ts` in ALL new server actions
- Use `checkRateLimit()` from `lib/rate-limit.ts` in ALL new write actions
- Use `isMissingSchemaError()` from `lib/supabase-errors.ts` for ALL Supabase queries
- Use `createAdminClient()` for any query that reads `plaid_access_token`
- Every `.update()`, `.insert()`, `.delete()` call must have its error result checked
- `plaid_access_token` must NEVER be returned to the client or included in any DTO
