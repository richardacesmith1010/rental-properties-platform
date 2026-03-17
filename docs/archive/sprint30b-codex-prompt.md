# Sprint 30B — Multi-Account Foundation

## Objective

Make each ownership account (individual or LLC) a first-class entity with its own Stripe Connect banking, its own dashboard data scope, and a distribution configuration schema. Add an account switcher to the sidebar so users with multiple accounts can switch between them. Zero new npm dependencies — schema, data-layer, and UI changes only.

## Context

- Branch: `main`
- HEAD: `c074206` (Sprint 30A — polish sweep)
- Gate baseline: 503/503 tests, lint clean, typecheck clean, build clean
- Production: `https://domusbase.com`
- Phase 9 created `ownership_accounts` and `ownership_account_members` tables
- Sprint 12 added Stripe Connect fields to the `profiles` table (per-user, not per-account)
- The dashboard currently shows ALL properties across ALL accounts with no scoping

## In Scope

1. Schema migration: add Stripe + distribution columns to ownership tables, expand member roles
2. Account switcher component in sidebar + mobile drawer
3. Per-account dashboard data scoping (all data loaders accept optional `accountId`)
4. Per-account Stripe Connect onboarding (create Express account linked to the ownership account, not the profile)
5. Webhook dual-write for `account.updated` (profiles + ownership_accounts)
6. Updated `getOwnerStripeAccountForProperty()` to check account-level Stripe first

## Out of Scope

- No distribution configuration UI (Sprint 31)
- No distribution approval workflow (Sprint 31)
- No Plaid/bank account linking (Sprint 32)
- No new npm dependencies
- No test file modifications
- No changes to CLAUDE.md or AGENTS.md
- Do NOT drop `profiles.stripe_account_id` column (dual-read transition period)

## Exact Files Expected to Change

**New files (1):**
1. `apps/web/components/dashboard/account-switcher.tsx`

**Modified files (~22):**
1. `apps/web/app/owner/page.tsx`
2. `apps/web/components/dashboard/index.tsx`
3. `apps/web/components/dashboard/sidebar-nav.tsx`
4. `apps/web/components/dashboard/ownership-section.tsx`
5. `apps/web/lib/property-access.ts`
6. `apps/web/lib/ownership.ts`
7. `apps/web/lib/dashboard.ts`
8. `apps/web/lib/portfolio.ts`
9. `apps/web/lib/maintenance.ts`
10. `apps/web/lib/invitations.ts`
11. `apps/web/lib/documents.ts`
12. `apps/web/lib/vendors.ts`
13. `apps/web/lib/expenses.ts`
14. `apps/web/lib/analytics.ts`
15. `apps/web/lib/audit.ts`
16. `apps/web/lib/leasing.ts`
17. `apps/web/lib/applications.ts`
18. `apps/web/lib/rent-increases.ts`
19. `apps/web/lib/stripe-connect.ts`
20. `apps/web/app/actions/connect.ts`
21. `apps/web/app/api/webhooks/stripe/route.ts`
22. `apps/web/app/connect/onboard/page.tsx`
23. `apps/web/app/connect/return/page.tsx`

## Implementation Requirements

### Part A: Schema Migration

Apply to Supabase via the MCP `apply_migration` tool (project ID: `yajfgnqpgfmzlxsbjmrz`).

Migration name: `sprint30b_multi_account_foundation`

```sql
BEGIN;

-- 1. Per-account Stripe Connect + distribution mode on ownership_accounts
ALTER TABLE ownership_accounts
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS distribution_mode text NOT NULL DEFAULT 'retain'
    CHECK (distribution_mode IN ('retain', 'split_equal', 'split_custom'));

CREATE INDEX IF NOT EXISTS idx_ownership_accounts_stripe
  ON ownership_accounts(stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- 2. Expand member_role CHECK to include admin, member, viewer
ALTER TABLE ownership_account_members
  DROP CONSTRAINT IF EXISTS ownership_account_members_member_role_check;

ALTER TABLE ownership_account_members
  ADD CONSTRAINT ownership_account_members_member_role_check
  CHECK (member_role IN ('admin', 'owner', 'member', 'viewer'));

-- 3. Distribution config per member
ALTER TABLE ownership_account_members
  ADD COLUMN IF NOT EXISTS distribution_pct numeric(5,2) DEFAULT NULL
    CHECK (distribution_pct IS NULL OR (distribution_pct >= 0 AND distribution_pct <= 100)),
  ADD COLUMN IF NOT EXISTS payout_stripe_account_id text DEFAULT NULL;

-- 4. Backfill: copy stripe_account_id from profiles to individual ownership_accounts
UPDATE ownership_accounts oa
SET
  stripe_account_id = p.stripe_account_id,
  stripe_onboarding_complete = COALESCE(p.stripe_onboarding_complete, false)
FROM profiles p
WHERE oa.created_by_profile_id = p.id
  AND oa.account_type = 'individual'
  AND oa.stripe_account_id IS NULL
  AND p.stripe_account_id IS NOT NULL;

COMMIT;
```

### Part B: Account Switcher Component

Create `apps/web/components/dashboard/account-switcher.tsx`:

```tsx
"use client";

// Client component rendered in sidebar between logo and nav items.
// Props: accounts (OwnershipAccountDTO[]), activeAccountId (string)
// Behavior:
//   - If accounts.length <= 1: render a static label showing the single account name
//   - If accounts.length > 1: render a styled <select> dropdown (or a button+popover)
//     showing account display_name + type badge (Individual / LLC) + member count
//   - On change: navigate to `?account={newAccountId}` preserving other search params
//     (use `useRouter().push()` or `window.location` — the server page re-renders with scoped data)
//
// Style: match the sidebar aesthetic — white/10 bg, white text, rounded-[10px],
// same border-white/15 pattern used by the Workspace button in sidebar-nav.tsx.
// Import OwnershipAccountDTO from "@/lib/ownership"
```

### Part C: Sidebar Integration

**`sidebar-nav.tsx`** — Add an `accountSwitcher?: React.ReactNode` prop to both `SidebarNav` and `MobileTopBar`.

In `SidebarNav`: render `{accountSwitcher}` in the `<div className="space-y-2 px-3 pb-3">` block (lines 444-455), below the search and above the workspace button.

In `MobileTopBar`: render `{accountSwitcher}` in the mobile drawer content, above the nav list.

**`index.tsx`** (dashboard orchestrator) — Accept `activeAccountId?: string` and `accounts?: OwnershipAccountDTO[]` props. Create an `<AccountSwitcher>` element and pass it into the sidebar.

### Part D: Owner Page — Account Scoping

**`apps/web/app/owner/page.tsx`**:

1. Add `account?: string | string[]` to the `searchParams` interface.

2. After `ownershipAccounts` is fetched (line 104), determine `activeAccountId`:
```tsx
const accountParam = typeof searchParams?.account === "string"
  ? searchParams.account
  : Array.isArray(searchParams?.account)
    ? searchParams.account[0] ?? null
    : null;

// Validate: user must be a member of this account
const activeAccountId = ownershipAccounts.some(a => a.id === accountParam)
  ? accountParam!
  : ownershipAccounts[0]?.id ?? null;
```

3. Pass `activeAccountId` as the second argument to every data-fetching function in the `Promise.all` block:
```tsx
getDashboardData(user.id, activeAccountId),
getPortfolioData(user.id, activeAccountId),
getAdminMaintenanceTickets(user.id, activeAccountId),
getOwnerInvitations(user.id, activeAccountId),
// ... same for all other data loaders
```

4. Pass to the Dashboard component:
```tsx
<Dashboard
  activeAccountId={activeAccountId}
  ownershipAccounts={ownershipAccounts}
  // ... existing props
/>
```

### Part E: Data Loader Scoping Pattern

Add a new function to `property-access.ts`:

```tsx
export async function getAdministeredPropertyIdsForAccount(
  userId: string,
  accountId: string,
  adminClient?: PropertyAccessClient
): Promise<string[]> {
  const admin = adminClient ?? createAdminClient();

  // Verify user is a member of this account
  const { data: membership } = await admin
    .from("ownership_account_members")
    .select("account_id")
    .eq("account_id", accountId)
    .eq("profile_id", userId)
    .eq("active", true)
    .maybeSingle();

  if (!membership) {
    return [];
  }

  // Get properties owned by this account
  const { data: ownedProperties } = await admin
    .from("properties")
    .select("id, active")
    .eq("owner_account_id", accountId);

  // Also include properties user manages that belong to this account
  const { data: managerAssignments } = await admin
    .from("property_managers")
    .select("property_id")
    .eq("manager_profile_id", userId)
    .eq("active", true);

  const managerPropertyIds = (managerAssignments ?? []).map(r => r.property_id);
  const managedInAccount = managerPropertyIds.length > 0
    ? (await admin
        .from("properties")
        .select("id, active")
        .in("id", managerPropertyIds)
        .eq("owner_account_id", accountId)
      ).data ?? []
    : [];

  const merged = [...(ownedProperties ?? []), ...managedInAccount]
    .filter(p => p.active !== false);

  return Array.from(new Set(merged.map(p => p.id)));
}
```

Then apply this pattern to **every data loader** that currently calls `getAdministeredPropertyIds(userId)`:

```tsx
// Before:
export async function getDashboardData(userId: string): Promise<DashboardData> {
  const propertyIds = await getAdministeredPropertyIds(userId);
  // ...
}

// After:
export async function getDashboardData(userId: string, accountId?: string | null): Promise<DashboardData> {
  const propertyIds = accountId
    ? await getAdministeredPropertyIdsForAccount(userId, accountId)
    : await getAdministeredPropertyIds(userId);
  // ... rest unchanged
}
```

Apply this exact pattern to all of these functions (each currently takes `userId: string` as its first param):

| File | Function | Current signature |
|------|----------|-------------------|
| `lib/dashboard.ts` | `getDashboardData` | `(userId: string)` |
| `lib/portfolio.ts` | `getPortfolioData` | `(userId: string)` |
| `lib/maintenance.ts` | `getAdminMaintenanceTickets` | `(userId: string)` |
| `lib/invitations.ts` | `getOwnerInvitations` | `(userId: string)` |
| `lib/documents.ts` | `getOwnerDocumentsData` | `(userId: string)` |
| `lib/vendors.ts` | `getOwnerVendors` | `(userId: string)` |
| `lib/expenses.ts` | `getOwnerExpenseData` | `(userId: string)` |
| `lib/analytics.ts` | `getOwnerAnalyticsData` | `(userId: string)` |
| `lib/audit.ts` | `getRecentAuditLogs` | `(userId: string, limit?)` |
| `lib/leasing.ts` | `getRentalListingsForUser` | `(userId: string)` |
| `lib/applications.ts` | `getApplicationsForUser` | `(userId: string)` |
| `lib/rent-increases.ts` | `getRentIncreaseHistory` | `(userId: string)` |

For `getRecentAuditLogs`, add `accountId` before the existing `limit` param: `(userId: string, accountId?: string | null, limit?: number)`.

Each function must import `getAdministeredPropertyIdsForAccount` from `@/lib/property-access` in addition to the existing `getAdministeredPropertyIds` import.

### Part F: Per-Account Stripe Connect

**1. `lib/stripe-connect.ts` — Update `getOwnerStripeAccountForProperty()`:**

After fetching the property (line 114-119) and confirming `property.owner_account_id` exists (line 125), add an account-level check BEFORE the member-profile fallback:

```tsx
// NEW: Check account-level Stripe first
const { data: accountStripe } = await admin
  .from("ownership_accounts")
  .select("stripe_account_id, stripe_onboarding_complete")
  .eq("id", property.owner_account_id)
  .maybeSingle();

if (accountStripe?.stripe_account_id && accountStripe.stripe_onboarding_complete) {
  return accountStripe.stripe_account_id;
}

// EXISTING: Fall through to member-profile-based lookup...
```

Insert this block at line ~134, before the existing `Promise.all` that fetches account + members.

**2. `app/actions/connect.ts` — Add `initiateAccountStripeConnect()`:**

New server action for account-level Stripe onboarding:

```tsx
export async function initiateAccountStripeConnect(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { user } = await requireConnectedRole();
    const accountId = formData.get("accountId") as string;
    if (!accountId) {
      return { success: false, error: "Missing account ID." };
    }
    if (!checkRateLimit(`initiateAccountStripeConnect:${user.id}`, 5, 60 * 60 * 1000).allowed) {
      return { success: false, error: "Too many requests. Please try again later." };
    }

    // Verify user can administer this account
    const { canUserAdministerOwnershipAccount } = await import("@/lib/ownership");
    const canAdmin = await canUserAdministerOwnershipAccount(user.id, accountId);
    if (!canAdmin) {
      return { success: false, error: "Access denied." };
    }

    const admin = createAdminClient();
    const { data: account } = await admin
      .from("ownership_accounts")
      .select("stripe_account_id, display_name")
      .eq("id", accountId)
      .maybeSingle();

    if (!account) {
      return { success: false, error: "Account not found." };
    }

    let stripeAccountId = account.stripe_account_id ?? null;
    if (!stripeAccountId) {
      if (!user.email) {
        return { success: false, error: "Your account is missing an email address." };
      }
      const stripeAccount = await createExpressAccount(user.email);
      stripeAccountId = stripeAccount.id;

      const { error } = await admin
        .from("ownership_accounts")
        .update({
          stripe_account_id: stripeAccountId,
          stripe_onboarding_complete: false
        })
        .eq("id", accountId);

      if (error) {
        return { success: false, error: "Failed to save Stripe account." };
      }
    }

    const appUrl = getAppUrl();
    const accountLink = await createAccountLink(
      stripeAccountId,
      `${appUrl}/connect/refresh?accountId=${accountId}`,
      `${appUrl}/connect/return?accountId=${accountId}`
    );

    return { success: true, url: accountLink.url };
  } catch (err) {
    console.error("initiateAccountStripeConnect error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Unable to start Stripe onboarding. (${detail})`
    };
  }
}
```

Export `initiateAccountStripeConnect` from `apps/web/app/actions/index.ts` (the barrel file).

**3. `app/api/webhooks/stripe/route.ts` — Dual-write on `account.updated`:**

Update the `account.updated` handler (lines 377-391) to write to BOTH tables:

```tsx
if (event.type === "account.updated") {
  const account = event.data.object;
  const accountId = typeof account.id === "string" ? account.id : null;
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;

  if (accountId && chargesEnabled && payoutsEnabled) {
    await Promise.all([
      supabase
        .from("profiles")
        .update({ stripe_onboarding_complete: true })
        .eq("stripe_account_id", accountId),
      supabase
        .from("ownership_accounts")
        .update({ stripe_onboarding_complete: true })
        .eq("stripe_account_id", accountId)
    ]);
  }

  return NextResponse.json({ received: true });
}
```

**4. `app/connect/return/page.tsx` — Handle `accountId` param:**

Read `searchParams.accountId`. If present, call `checkConnectStatus` with that account context. Also update the account-level `stripe_onboarding_complete` on the `ownership_accounts` row (use the admin client to read the account's `stripe_account_id`, then call `getAccount()` to check status, then update).

**5. `app/connect/onboard/page.tsx` — Pass through `accountId`:**

If `searchParams.accountId` is present, use `initiateAccountStripeConnect` instead of `initiateStripeConnect`. Pass the accountId through the redirect flow.

### Part G: Updated DTOs

**`lib/ownership.ts`:**

Update `OwnershipAccountDTO`:
```tsx
export interface OwnershipAccountDTO {
  id: string;
  accountType: "individual" | "llc";
  displayName: string;
  memberCount: number;
  joinCode: string | null;
  stripeConnected: boolean;       // NEW
  distributionMode: string;        // NEW
}
```

Update `OwnershipMemberDTO`:
```tsx
export interface OwnershipMemberDTO {
  profileId: string;
  email: string;
  fullName: string;
  memberRole: "admin" | "owner" | "member" | "viewer";  // EXPANDED
  active: boolean;
  canReceiveCriticalAlerts: boolean;
  distributionPct: number | null;      // NEW
  payoutStripeConnected: boolean;      // NEW
}
```

Update `getOwnershipAccountsForUser()` to query the new columns:
```tsx
// In the accounts select query, add the new columns:
.select("id, account_type, display_name, join_code, stripe_onboarding_complete, distribution_mode")

// In the map:
return {
  // ...existing fields
  stripeConnected: account.stripe_onboarding_complete === true,
  distributionMode: account.distribution_mode ?? "retain"
};
```

Update `getOwnershipMembersForAccount()` to query new columns:
```tsx
// In the members select query, add:
.select("profile_id, member_role, active, can_receive_critical_alerts, distribution_pct, payout_stripe_account_id")

// In the map:
return {
  // ...existing fields
  distributionPct: member.distribution_pct ?? null,
  payoutStripeConnected: Boolean(member.payout_stripe_account_id)
};
```

### Part H: Ownership Section — Per-Account Stripe Status

**`ownership-section.tsx`:**

For each account card in the ownership section, display Stripe connection status:
- If `account.stripeConnected` is true: show a green badge "Bank Connected"
- If false: show an "Connect Bank Account" button that either:
  - Navigates to `/connect/onboard?accountId={account.id}` (if the account has no Stripe yet)
  - Or shows a "Pending" badge if onboarding was started but not completed

The ownership section needs access to the `initiateAccountStripeConnect` action. Pass it down through the Dashboard props chain (same pattern as other actions — add `onInitiateAccountStripeConnect` prop).

### Part I: Dashboard Props

**`index.tsx`** (dashboard orchestrator):

Add these to the Dashboard component's props interface:
```tsx
activeAccountId?: string | null;
// ownershipAccounts is already a prop
onInitiateAccountStripeConnect?: (prev: ActionState, formData: FormData) => Promise<ActionState>;
```

Wire `activeAccountId` and `ownershipAccounts` into the `<AccountSwitcher>` component and pass it to the sidebar via the `accountSwitcher` slot.

## Validation Commands to Run

```bash
npm run gate:web
```

This runs: 503+ tests (36 suites), ESLint, TypeScript strict check, Next.js production build.

## Acceptance Criteria

1. [ ] Schema migration applied: `ownership_accounts` has `stripe_account_id`, `stripe_onboarding_complete`, `distribution_mode` columns
2. [ ] Schema migration applied: `ownership_account_members` has `distribution_pct`, `payout_stripe_account_id` columns, `member_role` CHECK expanded
3. [ ] Backfill completed: individual accounts have Stripe data copied from their creator's profile
4. [ ] Account switcher visible in sidebar for users with 2+ accounts
5. [ ] Account switcher hidden (static label) for users with 1 account
6. [ ] Switching accounts via `?account={id}` re-scopes all dashboard data to that account
7. [ ] `initiateAccountStripeConnect` action creates Express account on the `ownership_accounts` row
8. [ ] `getOwnerStripeAccountForProperty()` checks account-level Stripe before falling back to profile-level
9. [ ] Webhook `account.updated` dual-writes to both `profiles` and `ownership_accounts`
10. [ ] Ownership section shows per-account Stripe status and "Connect Bank Account" button
11. [ ] Existing single-account users see zero behavioral change
12. [ ] Existing Stripe payments continue to work (dual-read fallback)
13. [ ] `npm run gate:web` passes (503+ tests, lint, typecheck, build)

## Report Format

```
gate_passed: true/false
test_count: <number>
lint_clean: true/false
typecheck_clean: true/false
build_clean: true/false
files_changed: <list>
migration_applied: true/false
```

## Constraints

- Do NOT modify test files
- Do NOT add new npm dependencies
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT implement distribution UI or approval workflow (Sprint 31)
- Do NOT implement Plaid integration (Sprint 32)
- Do NOT drop `profiles.stripe_account_id` or `profiles.stripe_onboarding_complete` columns
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Report compact status only
