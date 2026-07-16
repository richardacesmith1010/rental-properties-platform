# Sprint 102 — LLC Member Payout Connection Fix

## Objective

Fix the bank connection experience so LLC members are routed to the correct payout connection flow instead of accidentally using the personal Stripe Connect flow. An LLC member who clicks "Connect Bank Account" should connect their LLC payout account, not their personal profile.

## Context

- Branch: `main`
- HEAD: `64f3c5f` (Sprint 101)
- **Problem:** 8 UI entry points exist for bank connection. The most visible ones (Settings page, Connect Banner, Onboarding) link to `/connect/onboard` with no params → calls `initiateStripeConnect()` → connects the user's PERSONAL `profiles.stripe_account_id`. LLC members need their PAYOUT account connected (`ownership_account_members.payout_stripe_account_id`), which requires `initiateMemberPayoutConnect()`.
- **Result:** LLC members click "Connect Bank Account", go through Stripe onboarding, but connect the wrong account. Their LLC payout remains unconnected.
- The member payout connect flow is currently admin-only (triggered from the Distribution Config Panel). There is no self-service path for a member to connect their own payout.

### Current Entry Points

| # | Location | Links to | Connects |
|---|----------|---------|----------|
| 1 | Settings > Bank Settings | `/connect/onboard` (no params) | Personal profile ❌ |
| 2 | Connect Banner | `/connect/onboard` (no params) | Personal profile ❌ |
| 3 | Onboarding Wizard | `/connect/onboard` (no params) | Personal profile ❌ |
| 4 | Account Card (Ownership) | `initiateAccountStripeConnect` | LLC account ✅ |
| 5 | Distribution Config Panel | `initiateMemberPayoutConnect` | Member payout ✅ |
| 6 | Welcome Card | Onboarding wizard | Personal profile ❌ |

Entry points 1-3 and 6 are the problem — they're the most visible but route to the wrong flow for LLC members.

### What Correct Looks Like

- If the user is an LLC member viewing the LLC account → "Connect Bank Account" connects their **payout** account (`ownership_account_members.payout_stripe_account_id`)
- If the user is a solo owner with no LLC → "Connect Bank Account" connects their **personal** profile (`profiles.stripe_account_id`)
- The user should never need to understand the difference — the system routes them correctly based on context

## In Scope

1. **Settings > Bank Settings:** Detect if user is an LLC member. If yes, show payout connection status and route to payout connect. If no, keep personal connect.
2. **Connect Banner:** Same context-aware routing
3. **/connect/onboard page:** Accept query params for payout connect. If user arrives with no params but is an LLC member, auto-detect and route to payout connect.
4. **Self-service payout connect:** Allow an LLC member to connect their OWN payout account without an admin initiating it. Modify `initiateMemberPayoutConnect` to allow self-service when `profileId === user.id`.
5. **Clear labeling:** When connecting, tell the user what they're connecting: "Connect your bank account to receive your share of rent payments from [LLC name]"

## Out of Scope

- Redesigning all banking UX
- Changing payout math or distribution logic
- Changing manager fee logic
- Adding new financial features
- Plaid integration changes

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/components/settings/bank-settings.tsx` | Detect LLC membership; show payout connection status; route to correct connect flow |
| `apps/web/components/dashboard/connect-banner.tsx` | Detect LLC context; route to payout connect when viewing LLC account |
| `apps/web/app/connect/onboard/page.tsx` | Auto-detect LLC membership when no params; route to `initiateMemberPayoutConnect` for self-service |
| `apps/web/app/actions/connect.ts` | Allow self-service in `initiateMemberPayoutConnect` — skip admin check when `profileId === user.id` |
| `apps/web/app/owner/page.tsx` | Pass LLC membership context to bank settings and connect banner |

## Implementation Requirements

### 1. Self-Service Payout Connect (`app/actions/connect.ts`)

In `initiateMemberPayoutConnect` (line 155), modify the permission check.

**Critical security rule: Do NOT trust `profileId` from form data or query params for determining self-service.** Always derive the target from the authenticated context:

```typescript
// Determine if this is self-service based on authenticated user, not form input
const isSelfService = profileId === user.id;

if (isSelfService) {
  // Self-service: user is connecting their OWN payout account.
  // Override profileId with user.id to prevent spoofing.
  // They must be an active member of this LLC — but do NOT need admin rights.
  const { data: membership } = await supabase
    .from("ownership_account_members")
    .select("account_id")
    .eq("account_id", accountId)
    .eq("profile_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (!membership) {
    return { error: "You are not a member of this account." };
  }
  // Use user.id as the profileId regardless of what was passed in form data
  // (profileId already equals user.id here, but this makes the intent explicit)
} else {
  // Admin flow: connecting someone ELSE's payout account.
  // Requires full account admin rights.
  if (!(await canUserAdministerOwnershipAccount(user.id, accountId))) {
    return { error: "Access denied." };
  }
}
```

**Why this matters:** If `profileId` from URL/form data were trusted, a user could pass another member's ID and connect a Stripe account to their row. By checking `profileId === user.id` against the AUTHENTICATED `user.id`, we ensure self-service only works for the caller's own account. Any other `profileId` falls through to the admin permission check.

### 2. Settings Bank Settings (`components/settings/bank-settings.tsx`)

Add props for LLC payout context:

```typescript
interface BankSettingsProps {
  role: string;
  stripeConnected: boolean;
  stripeAccountId: string | null;
  onGetExpressDashboardUrl?: StatefulAction;
  // NEW:
  llcPayoutConnected?: boolean;
  llcAccountId?: string | null;
  llcAccountName?: string | null;
}
```

Rendering logic:
- If `llcAccountId` is set (user is viewing an LLC account):
  - Show LLC payout connection status (not personal)
  - If not connected: "Connect your bank account to receive your share of rent from [LLC name]"
  - Link to `/connect/onboard?accountId={llcAccountId}&memberPayout=true` (do NOT include profileId — server uses `user.id` from auth context)
  - If connected: Show "Payout Account Connected ✓"
- If `llcAccountId` is NOT set (solo owner):
  - Keep existing personal connection flow unchanged

### 3. Connect Banner (`components/dashboard/connect-banner.tsx`)

Add LLC context props:

```typescript
interface ConnectBannerProps {
  connected: boolean;
  role: string;
  // NEW:
  llcAccountId?: string | null;
  userId?: string | null;
}
```

If `llcAccountId` is set and not connected:
- Link to `/connect/onboard?accountId={llcAccountId}&memberPayout=true` (do NOT include profileId in URL — server uses `user.id` from auth context)
- Text: "Connect your bank to receive rent payouts"

If `llcAccountId` is NOT set:
- Keep existing `/connect/onboard` link (personal flow)

### 4. Onboard Page Auto-Detection (`app/connect/onboard/page.tsx`)

When the user arrives at `/connect/onboard` with NO query params:

**Step 1: Detect LLC memberships.** Query:
```sql
SELECT account_id
FROM ownership_account_members
WHERE profile_id = :userId
  AND active = true
```
(If `deleted_at` column exists on this table, also filter `deleted_at IS NULL`.)

**Step 2: Route based on count:**
- **0 memberships** → proceed with existing personal flow (`initiateStripeConnect`)
- **1 membership** → auto-select that `account_id`, always use `user.id` from auth context as `profileId` (never from URL), route to `initiateMemberPayoutConnect`
- **>1 memberships** → show a selection screen: "Which account are you connecting for?" listing each LLC by name. On selection, route to `initiateMemberPayoutConnect` with the chosen `account_id` and `user.id` from auth context as `profileId`.

This prevents the "wrong flow" problem without requiring the user to understand the difference.

### 5. Owner Page Data Plumbing (`app/owner/page.tsx`)

Pass LLC membership context to the bank settings and connect banner components. The `activeAccountId` and user's membership status should already be available in the page data — thread them through as props.

### 6. Plain Language (CLAUDE.md §18)

- "Connect your bank to receive rent payouts" (not "Initiate member payout Stripe Connect onboarding")
- "Your payout account is connected" (not "payout_stripe_account_id is set")
- "Connect your bank account to receive your share of rent from [LLC name]" (not "Configure LLC member payout destination")
- "Which account are you connecting for?" (not "Select ownership account for Stripe Express onboarding")

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] `initiateMemberPayoutConnect` allows self-service when `profileId === user.id` — verifies active LLC membership instead of admin rights
2. [ ] `initiateMemberPayoutConnect` still requires admin rights when `profileId !== user.id` (connecting someone else's payout)
3. [ ] Settings > Bank Settings shows LLC payout status (not personal) when viewing an LLC account
4. [ ] Settings > Bank Settings routes to payout connect flow (with correct query params) for LLC members
5. [ ] Settings > Bank Settings preserves personal connect flow for solo owners
6. [ ] Connect Banner routes to payout connect for LLC context, personal connect for solo context
7. [ ] `/connect/onboard` auto-detects LLC membership when no params provided and routes to payout connect
8. [ ] `/connect/onboard` shows account selection when user is in multiple LLCs
9. [ ] `/connect/onboard` falls back to personal connect when user is not in any LLC
10. [ ] All user-facing text follows plain language rules
11. [ ] Existing personal Stripe connect flow is unchanged for non-LLC users
12. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-12] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT change payout math or distribution logic
- Do NOT change manager fee logic or Stripe transfer logic
- Do NOT change `initiateStripeConnect` or `initiateAccountStripeConnect` behavior
- Do NOT create database migrations
- Do NOT redesign the full banking settings UX — fix routing only
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
- For self-service payout connect, ALWAYS use `user.id` from authenticated context as `profileId`. NEVER trust `profileId` from URL query params or form data for determining self-service eligibility.
- If `profileId !== user.id`, treat as admin flow and require `canUserAdministerOwnershipAccount()`.
- LLC membership detection MUST query `ownership_account_members WHERE profile_id = user.id AND active = true`. If `deleted_at` column exists, also filter `deleted_at IS NULL`.
- Plain language in all user-facing text.
