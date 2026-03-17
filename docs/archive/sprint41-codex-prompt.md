# Sprint 41 — Codex Implementation Prompt

## 1. Objective

Add account rename and LLC delete capabilities with voting. Individual accounts can be renamed instantly. LLC accounts require a majority vote to rename or delete.

## 2. Context

- **Branch**: `main`
- **HEAD**: `afe3729`
- **Gate baseline**: 518/518 unit tests, lint clean, typecheck clean, build clean
- **Production URL**: `https://domusbase.com`
- **Supabase project**: `vawqdqkaguhdgfhdebqw`

**Existing voting pattern** (reuse exactly):
- `distribution_change_requests` / `distribution_change_votes` tables
- `withdrawal_requests` / `withdrawal_votes` tables
- Quorum: `Math.ceil(activeMembers.length / 2)`
- Requester auto-votes "approve" (votesReceived starts at 1)
- Solo accounts (1 member) auto-resolve immediately
- Actions: `submitDistributionChangeRequest`, `voteOnDistributionChange` in `distribution-approvals.ts`

**Existing schema**:
- `ownership_accounts`: `id`, `account_type` ('individual'|'llc'), `display_name`, `created_by_profile_id`, etc.
- `ownership_account_members`: `account_id`, `profile_id`, `member_role`, `active`, etc.
- RLS: update requires creator OR active 'owner' member

## 3. In Scope

### Part A: Migration — Rename & Delete Request Tables
- New `account_rename_requests` table (follows distribution_change_requests pattern)
- New `account_rename_votes` table
- New `account_delete_requests` table
- New `account_delete_votes` table
- RLS policies for all 4 tables

### Part B: Server Actions — Rename
- `renameOwnershipAccount(formData)` — instant rename for individual accounts, creates vote request for LLC accounts
- `voteOnAccountRename(formData)` — cast approve/reject vote, auto-resolve on quorum

### Part C: Server Actions — Delete LLC
- `requestDeleteLLC(formData)` — creates delete request with voting
- `voteOnDeleteLLC(formData)` — cast approve/reject vote, auto-resolve on quorum
- On approval: unlink all properties (set `owner_account_id = NULL`), delete members, delete account

### Part D: UI — Rename & Delete in Ownership Section
- Rename button/inline edit on each account card
- Delete button on LLC accounts (with confirmation)
- Pending vote banners for rename and delete requests
- Vote approve/reject buttons for LLC members

### Part E: Unit Tests
- Tests for rename action (individual instant, LLC creates request)
- Tests for delete action (creates request, resolves on quorum)

## 4. Out of Scope

- Renaming properties (only ownership accounts)
- Deleting individual accounts (they auto-exist, one per user)
- Transferring properties between accounts during delete (properties get unlinked)
- Stripe account cleanup on LLC delete (Stripe accounts persist)
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (3)
1. `supabase/migrations/20260315_sprint41_account_rename_delete.sql`
2. `apps/web/app/actions/account-governance.ts` — rename & delete actions
3. `apps/web/app/actions/__tests__/account-governance.test.ts`

### Modified Files (3-5)
1. `apps/web/components/dashboard/ownership-section.tsx` — rename UI, delete button, vote banners
2. `apps/web/lib/ownership.ts` — DTOs for rename/delete requests
3. `apps/web/components/dashboard/dashboard-data-loader.tsx` — fetch pending rename/delete requests
4. `apps/web/lib/feature-capabilities.ts` — probe for new tables (optional, if needed)
5. `apps/web/app/actions/account-wipe.ts` — update fullAccountWipe to also clean rename/delete votes

## 6. Implementation Requirements

### Part A: Migration

**File**: `supabase/migrations/20260315_sprint41_account_rename_delete.sql`

```sql
-- Account rename requests
CREATE TABLE IF NOT EXISTS account_rename_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ownership_account_id UUID NOT NULL REFERENCES ownership_accounts(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  proposed_name TEXT NOT NULL,
  current_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  votes_required INTEGER NOT NULL DEFAULT 1,
  votes_received INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS account_rename_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES account_rename_requests(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('approve','reject')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(request_id, voter_id)
);

-- Account delete requests (LLC only)
CREATE TABLE IF NOT EXISTS account_delete_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ownership_account_id UUID NOT NULL REFERENCES ownership_accounts(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  votes_required INTEGER NOT NULL DEFAULT 1,
  votes_received INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS account_delete_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES account_delete_requests(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('approve','reject')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(request_id, voter_id)
);

-- RLS for all 4 tables
ALTER TABLE account_rename_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_rename_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_delete_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_delete_votes ENABLE ROW LEVEL SECURITY;

-- Rename requests: visible to active members of the account
CREATE POLICY "Members can view rename requests" ON account_rename_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ownership_account_members
      WHERE account_id = ownership_account_id
        AND profile_id = auth.uid()
        AND active = true
    )
  );

CREATE POLICY "Owner members can create rename requests" ON account_rename_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM ownership_account_members
      WHERE account_id = ownership_account_id
        AND profile_id = auth.uid()
        AND active = true
        AND member_role IN ('owner','admin')
    )
  );

-- Rename votes: visible to account members, insertable by active members
CREATE POLICY "Members can view rename votes" ON account_rename_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM account_rename_requests r
      JOIN ownership_account_members m ON m.account_id = r.ownership_account_id
      WHERE r.id = request_id
        AND m.profile_id = auth.uid()
        AND m.active = true
    )
  );

CREATE POLICY "Active members can vote on renames" ON account_rename_votes
  FOR INSERT WITH CHECK (
    voter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM account_rename_requests r
      JOIN ownership_account_members m ON m.account_id = r.ownership_account_id
      WHERE r.id = request_id
        AND m.profile_id = auth.uid()
        AND m.active = true
    )
  );

-- Delete requests: same pattern
CREATE POLICY "Members can view delete requests" ON account_delete_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ownership_account_members
      WHERE account_id = ownership_account_id
        AND profile_id = auth.uid()
        AND active = true
    )
  );

CREATE POLICY "Owner members can create delete requests" ON account_delete_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM ownership_account_members
      WHERE account_id = ownership_account_id
        AND profile_id = auth.uid()
        AND active = true
        AND member_role IN ('owner','admin')
    )
  );

-- Delete votes: same pattern
CREATE POLICY "Members can view delete votes" ON account_delete_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM account_delete_requests r
      JOIN ownership_account_members m ON m.account_id = r.ownership_account_id
      WHERE r.id = request_id
        AND m.profile_id = auth.uid()
        AND m.active = true
    )
  );

CREATE POLICY "Active members can vote on deletes" ON account_delete_votes
  FOR INSERT WITH CHECK (
    voter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM account_delete_requests r
      JOIN ownership_account_members m ON m.account_id = r.ownership_account_id
      WHERE r.id = request_id
        AND m.profile_id = auth.uid()
        AND m.active = true
    )
  );

-- Update policies for status changes (service role handles resolution, but allow cancel by requester)
CREATE POLICY "Requester can cancel rename request" ON account_rename_requests
  FOR UPDATE USING (requested_by = auth.uid() AND status = 'pending')
  WITH CHECK (status = 'cancelled');

CREATE POLICY "Requester can cancel delete request" ON account_delete_requests
  FOR UPDATE USING (requested_by = auth.uid() AND status = 'pending')
  WITH CHECK (status = 'cancelled');
```

### Part B: Server Actions — Rename

**File**: `apps/web/app/actions/account-governance.ts`

```typescript
"use server";

// renameOwnershipAccount(formData)
// Params: accountId, newName
//
// Flow:
// 1. Auth check (requireUser pattern)
// 2. Fetch account + verify caller is active owner/admin member
// 3. Validate newName (1-100 chars, trimmed, not empty)
// 4. IF account_type === 'individual':
//    - Direct UPDATE ownership_accounts SET display_name = newName
//    - Return { success: true }
// 5. IF account_type === 'llc':
//    - Check no pending rename request exists for this account
//    - Get active member count, calculate quorum: Math.ceil(count / 2)
//    - If solo (1 member): direct UPDATE + return success
//    - If multi-member: INSERT account_rename_requests (proposed_name, current_name, votes_required)
//    - Auto-vote requester as 'approve' (INSERT account_rename_votes)
//    - Set votes_received = 1
//    - If votes_received >= votes_required: resolve immediately (apply rename, set status='approved')
//    - Return { success: true, requiresVote: boolean }

// voteOnAccountRename(formData)
// Params: requestId, vote ('approve'|'reject')
//
// Flow:
// 1. Auth check
// 2. Fetch request, verify status === 'pending'
// 3. Verify caller is active member of the account
// 4. Verify caller hasn't already voted (UNIQUE constraint handles this too)
// 5. INSERT vote
// 6. Count votes: approveCount, rejectCount
// 7. If approveCount >= votes_required:
//    - UPDATE ownership_accounts SET display_name = proposed_name
//    - UPDATE request SET status = 'approved', resolved_at = now()
// 8. If rejectCount >= votes_required:
//    - UPDATE request SET status = 'rejected', resolved_at = now()
// 9. Revalidate path
```

### Part C: Server Actions — Delete LLC

```typescript
// requestDeleteLLC(formData)
// Params: accountId, reason (optional)
//
// Flow:
// 1. Auth check
// 2. Fetch account, verify account_type === 'llc'
// 3. Verify caller is active owner/admin member
// 4. Check no pending delete request exists
// 5. Get active member count, calculate quorum
// 6. If solo: execute deletion immediately (see deletion steps below)
// 7. If multi-member: INSERT account_delete_requests
// 8. Auto-vote requester as 'approve'
// 9. Check if auto-resolved
// 10. Return { success: true, requiresVote: boolean }

// voteOnDeleteLLC(formData)
// Params: requestId, vote
//
// Flow: Same as voteOnAccountRename but on approval:
// 1. Unlink all properties: UPDATE properties SET owner_account_id = NULL WHERE owner_account_id = accountId
// 2. Delete related data: distribution_change_votes, distribution_change_requests,
//    withdrawal_votes, withdrawal_requests, account_rename_votes, account_rename_requests,
//    account_delete_votes (except current), account_delete_requests (except current)
// 3. Delete ownership_account_members
// 4. Delete the ownership_account
// 5. Mark the delete request as 'approved' (it will cascade-delete with the account,
//    so update status BEFORE deleting the account, or handle gracefully)
//
// IMPORTANT: Use service role (admin client) for the deletion cascade since RLS
// may block cross-table deletes. Follow the pattern in account-wipe.ts.

// Use sideEffectError() for non-critical operations (notifications, logging).
// Use Promise.allSettled where appropriate (following Sprint 40 patterns).
```

### Part D: UI — Ownership Section Updates

**In `apps/web/components/dashboard/ownership-section.tsx`**:

Add to each account card:
1. **Rename button** (pencil icon or "Rename" text button)
   - On click: shows inline text input with current name, save/cancel buttons
   - On save: calls `renameOwnershipAccount`
   - For LLC with pending rename: show banner "Rename to '{proposed_name}' — {votes_received}/{votes_required} votes" with approve/reject buttons for members who haven't voted

2. **Delete button** (LLC accounts only, red/destructive styling)
   - On click: confirmation dialog "This will unlink all properties and permanently delete the LLC account. This cannot be undone."
   - For LLC: also explain "All members must vote to approve deletion."
   - On confirm: calls `requestDeleteLLC`
   - For LLC with pending delete: show banner "Deletion requested — {votes_received}/{votes_required} votes" with approve/reject buttons

**UI patterns to follow:**
- Match the existing distribution change request voting UI in ownership-section.tsx
- Use the same card/banner styling
- Destructive actions use `variant="destructive"` button styling
- Pending vote banners use yellow/amber alert styling

### Part E: Data Loading

**In `apps/web/components/dashboard/dashboard-data-loader.tsx`** or wherever ownership data is fetched:
- Add queries for pending `account_rename_requests` and `account_delete_requests` (status = 'pending')
- Include votes for each request
- Pass to ownership section as props

**In `apps/web/lib/ownership.ts`**:
- Add DTOs:

```typescript
export interface AccountRenameRequestDTO {
  id: string;
  ownershipAccountId: string;
  requestedBy: string;
  requestedByName: string;
  proposedName: string;
  currentName: string;
  status: string;
  votesRequired: number;
  votesReceived: number;
  votes: { odoterId: string; vote: string }[];
  createdAt: string;
}

export interface AccountDeleteRequestDTO {
  id: string;
  ownershipAccountId: string;
  requestedBy: string;
  requestedByName: string;
  reason: string | null;
  status: string;
  votesRequired: number;
  votesReceived: number;
  votes: { voterId: string; vote: string }[];
  createdAt: string;
}
```

### Part E: Unit Tests

**File**: `apps/web/app/actions/__tests__/account-governance.test.ts`

Test cases:
1. Individual account rename succeeds immediately (direct DB update)
2. LLC account rename with 1 member succeeds immediately
3. LLC account rename with 2+ members creates pending request
4. Vote on rename — approve reaches quorum, name changes
5. Vote on rename — reject reaches quorum, request rejected
6. Duplicate vote is rejected
7. Non-member cannot vote
8. LLC delete request creates pending request for multi-member
9. LLC delete approval unlinks properties and deletes account
10. Cannot delete individual account (action rejects)
11. Cannot create duplicate pending request

Use the same mocking patterns as existing tests in `apps/web/app/actions/__tests__/`.

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Migration file creates 4 tables with correct constraints and RLS policies
2. [ ] Individual accounts can be renamed instantly via `renameOwnershipAccount`
3. [ ] LLC accounts with 1 member rename instantly (auto-resolve)
4. [ ] LLC accounts with 2+ members create a rename request requiring majority vote
5. [ ] Rename votes resolve correctly — approve applies new name, reject preserves old name
6. [ ] LLC delete creates a request requiring majority vote
7. [ ] LLC delete on approval: unlinks properties, deletes members, deletes account
8. [ ] Individual accounts cannot be deleted via `requestDeleteLLC`
9. [ ] UI shows rename inline edit on account cards
10. [ ] UI shows delete button on LLC cards with confirmation dialog
11. [ ] UI shows pending vote banners with approve/reject for members
12. [ ] `account-wipe.ts` updated to clean rename/delete request data
13. [ ] 10+ unit tests passing
14. [ ] `npm run gate:web` passes — all unit tests, lint, typecheck, build clean
15. [ ] No regressions to existing ownership, distribution, or withdrawal features

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
RENAME_INDIVIDUAL: working | broken
RENAME_LLC_VOTE: working | broken
DELETE_LLC_VOTE: working | broken
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT apply the migration to Supabase (Claude will apply it)
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change existing distribution or withdrawal voting behavior
- Do NOT allow deletion of individual accounts
- Use service role (admin client) for deletion cascade operations
- Follow existing sideEffectError() and Promise.allSettled patterns from Sprint 40
