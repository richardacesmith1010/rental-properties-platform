# Sprint 100 — Server Action Hardening

## Objective

Eliminate the last critical security gap in server actions: two exported helper functions in `account-governance-delete-support.ts` perform irreversible account deletions with no authentication, authorization, or rate limiting. Convert them to non-exported internal helpers so they cannot be called from outside the module.

## Context

- Branch: `main`
- HEAD: `79c2151` (Sprint 99)
- Hardening Pass 2 audited all 50 server action files (147 exported functions)
- 143 of 147 functions have proper auth, permissions, rate limits, and mutation error handling
- **One file has 2 critical gaps:** `account-governance-delete-support.ts`
  - `deleteGovernedAccount()` — deletes ownership accounts, members, distributions with NO auth
  - `resolveAccountDeleteRequest()` — approves/rejects account deletion requests with NO auth
  - Both are currently exported and callable by any server-side code
  - Both are only called from `account-governance-delete-actions.ts` (which IS properly authenticated)
  - The file does NOT have `"use server"` directive (not directly callable from client), but export makes them importable by any server action

### Why This Matters

If any future server action imports `deleteGovernedAccount` without its own auth check, it could delete ownership accounts, property linkages, and financial distribution records without verifying the caller has permission. The current safety relies on convention (only called from protected actions) — not enforcement.

### What Was NOT a Problem (Pass 2 false positives)

- `connect.ts` → `initiateStripeConnect`: Creates Stripe account for the CALLER (self-service). The user can only create their own account. No resource ownership issue.
- `connect.ts` → `getExpressDashboardUrl`: Reads Stripe account from `profiles WHERE id = user.id`. Only returns the caller's own dashboard link. No resource ownership issue.

These were initially flagged but upon deeper inspection are correctly secured. No changes needed.

## In Scope

1. Remove `export` from `deleteGovernedAccount` and `resolveAccountDeleteRequest` in `account-governance-delete-support.ts`
2. Ensure `account-governance-delete-actions.ts` can still call them (same module or re-export pattern)
3. Verify no other files import these functions

## Out of Scope

- `connect.ts` changes (confirmed secure upon review)
- New features
- Database migrations
- UI changes
- Refactors outside the two governance files

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/app/actions/account-governance-delete-support.ts` | Remove `export` from both functions |
| `apps/web/app/actions/account-governance-delete-actions.ts` | May need minor import adjustment if the two files are separate modules |

## Implementation Requirements

### 1. Restrict Access to Destructive Helpers

**If the functions are only used within the same file:** Remove `export` and keep them as internal helpers. This is the simplest fix.

**If they must be called from a different file (current structure):** Keep them exported but add explicit runtime auth/permission assertions at the top of each function. These assertions must verify the caller is authenticated and has admin rights on the target account. If assertions fail, throw an error — do NOT return silently.

Example assertion pattern (adapt to match existing auth helpers):

```typescript
export async function deleteGovernedAccount(supabase: AdminClient, accountId: string, callerUserId: string) {
  // Runtime assertion: caller must be an active owner of this account
  const { data: membership } = await supabase
    .from("ownership_account_members")
    .select("account_id")
    .eq("account_id", accountId)
    .eq("profile_id", callerUserId)
    .eq("active", true)
    .maybeSingle();
  if (!membership) {
    throw new Error("Unauthorized: caller is not an active member of this account");
  }

  // ... existing deletion logic unchanged ...
}
```

**Do NOT move files or restructure modules.** Keep the current file layout. Choose whichever path (remove export or add assertion) fits the existing call structure.

### 2. Verify No Other Callers

Search the entire `apps/web/` directory for:
- `import.*deleteGovernedAccount`
- `import.*resolveAccountDeleteRequest`

If any file other than `account-governance-delete-actions.ts` imports these, that import must be updated or the function must remain exported with an auth guard added.

### 3. Preserve Existing Behavior

The functions themselves do NOT change. Only their visibility changes. All existing governance flows (request delete → vote → resolve → delete) continue to work exactly as before.

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] `deleteGovernedAccount` is either non-exported OR has a runtime auth/permission assertion that throws on unauthorized access
2. [ ] `resolveAccountDeleteRequest` is either non-exported OR has a runtime auth/permission assertion that throws on unauthorized access
3. [ ] The existing governance delete flow works end-to-end: `requestDeleteLLC` → `voteOnDeleteLLC` → account deletion completes
4. [ ] No unprotected path exists where `deleteGovernedAccount` or `resolveAccountDeleteRequest` can execute without verified caller identity
5. [ ] `gate:web` passes (lint + typecheck + build)

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-5] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT modify the logic inside `deleteGovernedAccount` or `resolveAccountDeleteRequest`
- Do NOT modify `connect.ts` (confirmed secure)
- Do NOT modify any other server action files
- Do NOT create database migrations
- Do NOT add new features
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
- If the functions must remain exported (due to module boundaries), add a runtime auth assertion that throws on unauthorized access. Comments are optional — runtime enforcement is required.
- Do NOT move files or restructure modules to satisfy this sprint.
