# Sprint 32 — Codex Implementation Prompt

## 1. Objective

Implement three workstreams:
- **Part A**: Fix the "+ New Account" button bug (ownerWorkflowMode state doesn't sync from prop changes)
- **Part B**: Add "Account & Data" settings tab with granular data deletion
- **Parts C-E**: Distribution change approval workflow, withdrawal requests, and financial activity feed

## 2. Context

- **Branch**: `main`
- **HEAD**: `4977c18`
- **Gate baseline**: 503/503 tests, lint clean, typecheck clean, build clean
- **Supabase project**: `vawqdqkaguhdgfhdebqw` (migration NOT applied — Claude will apply after verification)
- **NotificationType** union in `lib/notifications.ts` lines 8-22 currently has 14 types
- **`requireAuth()` in `actions/auth-helpers.ts`** is the shared auth helper — use it in all new server actions
- **`canUserAdministerOwnershipAccount()` in `lib/ownership.ts`** — reuse for permission checks on account-scoped actions
- **`createNotificationWithDelivery()` in `lib/notifications.ts`** — reuse for sending notifications
- **`notifyOwnerMembersForProperty()` in `lib/notifications.ts`** — model for the new `notifyAccountMembers()` function
- **`isMissingSchemaError()` in `lib/supabase-errors.ts`** — wrap all Supabase queries for graceful schema mismatch handling
- **`checkRateLimit()` in `lib/rate-limit.ts`** — apply to all new write actions

## 3. In Scope

### Part A: Bug Fix — "+ New Account" Button
- Add `useEffect` in `dashboard/index.tsx` to sync `ownerWorkflowMode` state from `initialOwnerWorkflowMode` prop
- Add same pattern for `managerWorkflowMode` from `initialManagerWorkflowMode`

### Part B: Account Wipe Settings
- New settings tab "Account & Data" with granular deletion options
- New server actions for each deletion scope
- Typed confirmation required for each destructive action

### Part C: Distribution Change Approval Workflow
- New tables: `distribution_change_requests`, `distribution_change_votes`
- New lib/actions/component files for creating requests, voting, resolving
- Modify `updateDistributionConfig()` to branch: solo member → immediate apply, 2+ members → create change request
- Notifications for all members when a change is requested/approved/rejected

### Part D: Withdrawal Requests
- New tables: `withdrawal_requests`, `withdrawal_votes`
- New lib/actions/component files for requesting, voting
- UI in ownership section for requesting withdrawals and viewing pending requests

### Part E: Financial Activity Feed
- Timeline component aggregating payment distributions, config changes, withdrawals, expenses
- New query function that unions events from multiple tables
- Rendered in ownership section

### Part F: Migration
- Single migration file creating 4 new tables with RLS policies and indexes

## 4. Out of Scope

- Plaid integration (Sprint 33)
- Stripe payout execution for approved withdrawals (manual for now)
- Profile/account deletion (only data is wiped, Supabase Auth user stays)
- Test file modifications
- New npm dependencies
- CLAUDE.md / AGENTS.md edits
- Deploying the migration (Claude does this)

## 5. Exact Files Expected to Change

### New Files (10)
1. `apps/web/components/settings/account-data-settings.tsx`
2. `apps/web/app/actions/account-wipe.ts`
3. `apps/web/lib/distribution-approvals.ts`
4. `apps/web/app/actions/distribution-approvals.ts`
5. `apps/web/components/dashboard/distribution-approval-card.tsx`
6. `apps/web/lib/withdrawals.ts`
7. `apps/web/app/actions/withdrawals.ts`
8. `apps/web/components/dashboard/withdrawal-request-card.tsx`
9. `apps/web/components/dashboard/financial-activity-feed.tsx`
10. `supabase/migrations/20260315_sprint32_approval_workflows.sql`

### Modified Files (10)
1. `apps/web/components/dashboard/index.tsx`
2. `apps/web/components/settings/settings-layout.tsx`
3. `apps/web/app/settings/page.tsx`
4. `apps/web/app/actions/distributions.ts`
5. `apps/web/components/dashboard/ownership-section.tsx`
6. `apps/web/lib/notifications.ts`
7. `apps/web/lib/distributions.ts`
8. `apps/web/components/dashboard/types.ts`
9. `apps/web/app/owner/page.tsx`
10. `apps/web/app/actions/index.ts`

## 6. Implementation Requirements

### Part A: Bug Fix (`dashboard/index.tsx`)

After line 257 (the `useState` for `ownerWorkflowMode`), add:
```tsx
useEffect(() => {
  if (initialOwnerWorkflowMode && initialOwnerWorkflowMode !== ownerWorkflowMode) {
    setOwnerWorkflowMode(initialOwnerWorkflowMode);
  }
}, [initialOwnerWorkflowMode]);
```

After line 260 (the `useState` for `managerWorkflowMode`), add the same pattern:
```tsx
useEffect(() => {
  if (initialManagerWorkflowMode && initialManagerWorkflowMode !== managerWorkflowMode) {
    setManagerWorkflowMode(initialManagerWorkflowMode);
  }
}, [initialManagerWorkflowMode]);
```

This mirrors the existing `initialSectionId` sync at lines 334-341.

### Part B: Account Wipe Settings

**`account-data-settings.tsx`**:
- Client component ("use client")
- Props: `onDeleteAllProperties`, `onDeleteAllTenants`, `onDeleteAllManagers`, `onDeleteAllLeases`, `onDeleteAllFinancialData`, `onFullAccountWipe` — all `StatefulAction`
- Each section is a danger zone card with:
  - Title + description of what will be deleted
  - Text input requiring "DELETE" to enable the button
  - SubmitButton (red/destructive styling) that calls the action
  - Success/error feedback via `useFormState`
- Sections:
  1. **Delete All Properties** — "This will deactivate all your properties, units, leases, charges, payments, expenses, files, maintenance tickets, and vendors."
  2. **Remove All Tenants** — "This will remove all tenant invitations and delete tenant-linked leases."
  3. **Remove All Property Managers** — "This will remove all manager assignments and manager invitations."
  4. **Delete All Leases** — "This will delete all leases, rent charges, payments, and autopay enrollments."
  5. **Delete All Financial Data** — "This will clear all expenses, payment distributions, rent charges, and payments."
  6. **Full Account Wipe** — "This will delete ALL data from your account. This cannot be undone." (red border, extra prominent)

**`account-wipe.ts`** server actions:
- Each action: `requireAuth()` → verify confirmation text from formData → execute deletions in FK-safe order → `revalidatePath("/settings")` → return ActionState
- Use `createAdminClient()` for deletions (RLS bypass needed to delete cross-table)
- Apply `checkRateLimit()` with a strict limit (5 per 60s)
- Wrap all queries with `isMissingSchemaError()` handling
- Export: `deleteAllProperties`, `deleteAllTenants`, `deleteAllManagers`, `deleteAllLeases`, `deleteAllFinancialData`, `fullAccountWipe`

FK-safe deletion order for `fullAccountWipe`:
```
1. payment_distributions (FK → payments, ownership_accounts, profiles)
2. payments (FK → rent_charges)
3. rent_charges (FK → leases)
4. autopay_enrollments (FK → leases)
5. maintenance_tickets (FK → units)
6. property_expenses (FK → properties, profiles)
7. property_files (FK → properties, profiles)
8. document_signers → document_packets → document_templates (FK chain)
9. screening_reports → application_events → rental_applications → rental_listings (FK chain)
10. automation rules (FK → properties)
11. vendors (FK → properties)
12. leases (FK → units)
13. units (FK → properties)
14. properties (soft-delete: SET active = false, or hard delete)
15. withdrawal_votes → withdrawal_requests (new tables)
16. distribution_change_votes → distribution_change_requests (new tables)
17. ownership_account_members → ownership_accounts
18. invitations (FK → profiles)
19. notification_deliveries → notifications
20. inbox thread messages → inbox_threads
21. user_achievements, xp_events, user_gamification
```

For each sub-action (e.g., `deleteAllProperties`), only execute the relevant subset of this order.

**`settings-layout.tsx`**:
- Add to `settingsNav` array: `{ id: "account", label: "Account & Data", icon: Trash2 }` (import `Trash2` from lucide-react)
- Place it last in the nav array (after "security")

**`settings/page.tsx`**:
- Import `AccountDataSettings` from `@/components/settings/account-data-settings`
- Import wipe actions from `@/app/actions/account-wipe`
- Add `account` section to the `sections` object:
```tsx
account: {
  title: "Account & Data",
  description: "Manage your data. Destructive actions cannot be undone.",
  content: (
    <AccountDataSettings
      onDeleteAllProperties={deleteAllProperties}
      onDeleteAllTenants={deleteAllTenants}
      onDeleteAllManagers={deleteAllManagers}
      onDeleteAllLeases={deleteAllLeases}
      onDeleteAllFinancialData={deleteAllFinancialData}
      onFullAccountWipe={fullAccountWipe}
    />
  )
}
```

### Part C: Distribution Change Approval

**`lib/distribution-approvals.ts`**:
- `getPendingChangeRequests(accountId: string)` — fetch from `distribution_change_requests` where `status = 'pending'` and `ownership_account_id = accountId`, join votes
- `getVotesForRequest(requestId: string)` — fetch from `distribution_change_votes`
- `resolveRequest(requestId: string)` — check vote counts, if majority approve → apply the proposed config to `ownership_accounts` + `ownership_account_members`, set status=approved. If majority reject → set status=rejected. Notify all members.
- Use `createAdminClient()` for all queries
- Wrap with `isMissingSchemaError()` for schema resilience

Types to export:
```ts
export interface DistributionChangeRequestDTO {
  id: string;
  ownershipAccountId: string;
  requestedBy: string;
  requestedByName: string | null;
  currentConfig: { mode: string; members: Array<{ profileId: string; pct: number | null }> };
  proposedConfig: { mode: string; members: Array<{ profileId: string; pct: number | null }> };
  status: "pending" | "approved" | "rejected" | "cancelled";
  votesRequired: number;
  votesReceived: number;
  votes: Array<{ voterId: string; voterName: string | null; vote: "approve" | "reject" }>;
  createdAt: string;
  resolvedAt: string | null;
}
```

**`actions/distribution-approvals.ts`**:
- `submitDistributionChangeRequest(_prev, formData)`:
  - `requireAuth("owner")` + `canUserAdministerOwnershipAccount()`
  - `checkRateLimit()`
  - Read current config from DB (snapshot)
  - Read proposed config from formData (mode, pct_* fields — same format as `updateDistributionConfig`)
  - Validate proposed config via `validateDistributionConfig()`
  - Count active members → `votes_required = Math.ceil(count / 2)`
  - Insert into `distribution_change_requests`
  - Auto-cast requester's vote as "approve" → insert into `distribution_change_votes`
  - Set `votes_received = 1`
  - If solo member (votes_required = 1 and votes_received = 1), resolve immediately → apply config
  - Else notify other members via new `notifyAccountMembers()` function
  - `revalidatePath("/owner")`

- `voteOnDistributionChange(_prev, formData)`:
  - `requireAuth("owner")`
  - Read `requestId` and `vote` (approve/reject) from formData
  - Verify voter is a member of the account
  - Insert vote (unique constraint prevents double-voting)
  - Increment `votes_received` on the request
  - Call `resolveRequest()` to check if majority reached
  - If resolved → notify all members of outcome
  - `revalidatePath("/owner")`

**`distribution-approval-card.tsx`**:
- Client component showing:
  - "Proposed by [name]" + timestamp
  - Current config vs. proposed config (side by side or diff-style)
  - Vote tally: "X of Y votes (Z required)"
  - List of who voted what (if current user already voted, show their vote)
  - Vote buttons (Approve / Reject) — only if current user hasn't voted
  - Status badge (pending/approved/rejected)
- Props: `request: DistributionChangeRequestDTO`, `currentUserId: string`, `onVote: StatefulAction`

**Modify `actions/distributions.ts`** — `updateDistributionConfig()`:
- After the `canAdmin` check (line 43), count active members:
  ```ts
  if (activeMembers.length >= 2) {
    // Redirect to approval flow — build formData and call submitDistributionChangeRequest
    // Or: return { success: false, error: "NEEDS_APPROVAL", message: "..." }
    // Then let the UI handle it by calling the approval action instead
  }
  ```
- Cleaner approach: Add a check at the top. If `activeMembers.length >= 2`, return `{ success: false, error: "This account has multiple members. Distribution changes require approval from other members.", needsApproval: true }` (extend ActionState to support `needsApproval?: boolean` or use a specific error string like `"NEEDS_APPROVAL"`)
- The `distribution-config-panel.tsx` should detect this response and switch to calling `submitDistributionChangeRequest` instead

### Part D: Withdrawal Requests

**`lib/withdrawals.ts`**:
- `getPendingWithdrawals(accountId: string)` — fetch `withdrawal_requests` where `status = 'pending'`, join votes
- `getWithdrawalHistory(accountId: string, limit?: number)` — all withdrawal requests sorted by created_at desc
- `resolveWithdrawal(requestId: string)` — check votes, if majority approve → status=approved (no auto-payout for now), if reject → status=rejected, notify all

Types:
```ts
export interface WithdrawalRequestDTO {
  id: string;
  ownershipAccountId: string;
  requestedBy: string;
  requestedByName: string | null;
  amountCents: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled" | "completed";
  votesRequired: number;
  votesReceived: number;
  votes: Array<{ voterId: string; voterName: string | null; vote: "approve" | "reject" }>;
  createdAt: string;
  resolvedAt: string | null;
}
```

**`actions/withdrawals.ts`**:
- `submitWithdrawalRequest(_prev, formData)`:
  - `requireAuth("owner")` + verify membership
  - `checkRateLimit()`
  - Read `accountId`, `amountCents`, `reason` from formData
  - Validate amount > 0
  - Count active members → `votes_required = Math.ceil(count / 2)`
  - Insert into `withdrawal_requests`
  - Auto-cast requester's vote as "approve"
  - If solo → resolve immediately (status=approved)
  - Else notify other members
  - `revalidatePath("/owner")`

- `voteOnWithdrawal(_prev, formData)`:
  - Same pattern as `voteOnDistributionChange`

**`withdrawal-request-card.tsx`**:
- Shows: amount (formatted as currency), reason, requester name, timestamp
- Vote tally + vote buttons (same pattern as distribution approval card)
- Status badge

### Part E: Financial Activity Feed

**`financial-activity-feed.tsx`**:
- Client component receiving a sorted array of `FinancialActivityEvent[]`
- Each event rendered as a timeline item with:
  - Icon (different per type: dollar for distribution, settings for config change, arrow-up for withdrawal, receipt for expense)
  - Title + description
  - Timestamp
  - Amount (if applicable)
  - Status badge (if applicable)
- Use the same card/badge patterns as existing dashboard components

**`lib/distributions.ts`** — add `getFinancialActivityFeed(accountId, limit = 50)`:
- Query 4 sources in parallel with `Promise.all`:
  1. `payment_distributions` where `account_id = accountId` → type "distribution"
  2. `distribution_change_requests` where `ownership_account_id = accountId` → type "config_change"
  3. `withdrawal_requests` where `ownership_account_id = accountId` → type "withdrawal"
  4. `property_expenses` where property's `owner_account_id = accountId` → type "expense"
- Union, sort by `created_at` desc, limit
- Return `FinancialActivityEvent[]`

Type:
```ts
export interface FinancialActivityEvent {
  id: string;
  type: "distribution" | "config_change" | "withdrawal" | "expense";
  title: string;
  description: string;
  amountCents: number | null;
  status: string | null;
  createdAt: string;
}
```

### Notifications Updates (`lib/notifications.ts`)

Add to `NotificationType` union:
```ts
| "distribution_change_requested"
| "distribution_change_approved"
| "distribution_change_rejected"
| "withdrawal_requested"
| "withdrawal_approved"
| "withdrawal_rejected"
| "withdrawal_completed"
```

Add new function `notifyAccountMembers()`:
```ts
interface NotifyAccountMembersParams {
  accountId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId?: string | null;
  excludeProfileId?: string | null;
}

export async function notifyAccountMembers(params: NotifyAccountMembersParams) {
  // Same pattern as notifyOwnerMembersForProperty but:
  // - Query ownership_account_members directly by account_id (no property lookup needed)
  // - Include ALL active members (not just "owner" role)
  // - Filter out excludeProfileId
  // - Call createNotificationWithDelivery for each
}
```

### Dashboard Prop Threading

**`types.ts`** — add to `DashboardProps`:
```ts
pendingChangeRequests?: DistributionChangeRequestDTO[];
pendingWithdrawals?: WithdrawalRequestDTO[];
financialActivityFeed?: FinancialActivityEvent[];
onSubmitDistributionChangeRequest?: StatefulAction;
onVoteOnDistributionChange?: StatefulAction;
onSubmitWithdrawalRequest?: StatefulAction;
onVoteOnWithdrawal?: StatefulAction;
```

**`owner/page.tsx`**:
- Import new query functions and actions
- Fetch `pendingChangeRequests`, `pendingWithdrawals`, `financialActivityFeed` for the active account
- Pass all new props to Dashboard

**`dashboard/index.tsx`**:
- Destructure new props
- Thread them through to SectionRenderer → OwnershipSection

**`ownership-section.tsx`**:
- Accept new props in interface
- Render pending change requests as `DistributionApprovalCard` list above/below config panel
- Add "Request Withdrawal" button on LLC accounts → small form (amount + reason)
- Render pending withdrawal requests as `WithdrawalRequestCard` list
- Add tabbed view: "Distribution History" | "Activity Feed" — render `FinancialActivityFeed` in the second tab

**`section-renderer.tsx`** (may need update):
- Thread new props from Dashboard to OwnershipSection

### `actions/index.ts` — add exports:
```ts
export {
  submitDistributionChangeRequest,
  voteOnDistributionChange
} from "./distribution-approvals";
export {
  submitWithdrawalRequest,
  voteOnWithdrawal
} from "./withdrawals";
export {
  deleteAllProperties,
  deleteAllTenants,
  deleteAllManagers,
  deleteAllLeases,
  deleteAllFinancialData,
  fullAccountWipe
} from "./account-wipe";
```

### Part F: Migration

**`supabase/migrations/20260315_sprint32_approval_workflows.sql`**:

```sql
-- Distribution change requests
CREATE TABLE IF NOT EXISTS distribution_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ownership_account_id uuid NOT NULL REFERENCES ownership_accounts(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  current_config jsonb NOT NULL DEFAULT '{}',
  proposed_config jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  votes_required integer NOT NULL DEFAULT 1,
  votes_received integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX idx_dist_change_req_account ON distribution_change_requests(ownership_account_id);
CREATE INDEX idx_dist_change_req_status ON distribution_change_requests(status);

ALTER TABLE distribution_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their account requests"
  ON distribution_change_requests FOR SELECT
  USING (
    ownership_account_id IN (
      SELECT account_id FROM ownership_account_members WHERE profile_id = auth.uid() AND active = true
    )
  );
CREATE POLICY "Members can insert requests for their accounts"
  ON distribution_change_requests FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND ownership_account_id IN (
      SELECT account_id FROM ownership_account_members WHERE profile_id = auth.uid() AND active = true
    )
  );

-- Distribution change votes
CREATE TABLE IF NOT EXISTS distribution_change_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES distribution_change_requests(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES profiles(id),
  vote text NOT NULL CHECK (vote IN ('approve', 'reject')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, voter_id)
);

CREATE INDEX idx_dist_change_votes_request ON distribution_change_votes(request_id);

ALTER TABLE distribution_change_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view votes on their account requests"
  ON distribution_change_votes FOR SELECT
  USING (
    request_id IN (
      SELECT r.id FROM distribution_change_requests r
      JOIN ownership_account_members m ON m.account_id = r.ownership_account_id
      WHERE m.profile_id = auth.uid() AND m.active = true
    )
  );
CREATE POLICY "Members can insert their own vote"
  ON distribution_change_votes FOR INSERT
  WITH CHECK (voter_id = auth.uid());

-- Withdrawal requests
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ownership_account_id uuid NOT NULL REFERENCES ownership_accounts(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
  votes_required integer NOT NULL DEFAULT 1,
  votes_received integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX idx_withdrawal_req_account ON withdrawal_requests(ownership_account_id);
CREATE INDEX idx_withdrawal_req_status ON withdrawal_requests(status);

ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their account withdrawals"
  ON withdrawal_requests FOR SELECT
  USING (
    ownership_account_id IN (
      SELECT account_id FROM ownership_account_members WHERE profile_id = auth.uid() AND active = true
    )
  );
CREATE POLICY "Members can insert withdrawal requests"
  ON withdrawal_requests FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND ownership_account_id IN (
      SELECT account_id FROM ownership_account_members WHERE profile_id = auth.uid() AND active = true
    )
  );

-- Withdrawal votes
CREATE TABLE IF NOT EXISTS withdrawal_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES withdrawal_requests(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES profiles(id),
  vote text NOT NULL CHECK (vote IN ('approve', 'reject')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, voter_id)
);

CREATE INDEX idx_withdrawal_votes_request ON withdrawal_votes(request_id);

ALTER TABLE withdrawal_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view votes on their account withdrawals"
  ON withdrawal_votes FOR SELECT
  USING (
    request_id IN (
      SELECT r.id FROM withdrawal_requests r
      JOIN ownership_account_members m ON m.account_id = r.ownership_account_id
      WHERE m.profile_id = auth.uid() AND m.active = true
    )
  );
CREATE POLICY "Members can insert their own vote"
  ON withdrawal_votes FOR INSERT
  WITH CHECK (voter_id = auth.uid());
```

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] **"+ New Account" button works** — clicking navigates to Records mode → Ownership section
2. [ ] **Settings "Account & Data" tab** visible for all roles, renders 6 danger-zone cards
3. [ ] **Typed confirmation required** — delete buttons disabled until user types "DELETE"
4. [ ] **Full account wipe** deletes all user data without FK violations
5. [ ] **Solo LLC member** — distribution config changes apply immediately (no approval needed)
6. [ ] **Multi-member LLC** — distribution config changes create a pending request + notify members
7. [ ] **Vote on distribution change** — members can approve/reject, majority resolves the request
8. [ ] **Withdrawal request** — creates pending request with vote buttons
9. [ ] **Financial activity feed** — renders timeline of distributions, config changes, withdrawals, expenses
10. [ ] **7 new notification types** registered in NotificationType union
11. [ ] **`notifyAccountMembers()`** function sends notifications to all active account members
12. [ ] **Migration file** creates 4 tables with correct RLS policies
13. [ ] **`npm run gate:web`** passes — all tests, lint, typecheck, build clean

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
- Do NOT add new npm dependencies
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections — report compact status only
- Use `requireAuth()` from `actions/auth-helpers.ts` in ALL new server actions
- Use `checkRateLimit()` from `lib/rate-limit.ts` in ALL new write actions
- Use `isMissingSchemaError()` from `lib/supabase-errors.ts` for ALL Supabase queries
- Use `createAdminClient()` for account wipe actions (needs RLS bypass)
- Every `.update()`, `.insert()`, `.delete()` call must have its error result checked — no silent swallowing
