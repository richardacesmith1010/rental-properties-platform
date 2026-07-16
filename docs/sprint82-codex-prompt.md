# Sprint 82 — Codex Implementation Prompt

## 1. Objective

Add an LLC Members page to the paginated dashboard for LLC accounts so owners can invite siblings, share join codes, and manage distribution splits. Also fix: hide Manager Payments page when no manager exists, fix "propertys" typo.

## 2. Context

- **Branch**: `main`
- **HEAD**: `98a0708`
- **Production URL**: `https://domusbase.com`
- **Problem**: LLC account "J&MSP" was created but there is NO page to manage members, share join codes, or configure distribution splits. The paginated dashboard shows 7 pages (Home, Overview, Charges, Portfolio, Maintenance, Leases, Manager Payments) but no Members page.
- **Existing infrastructure**:
  - `lib/ownership.ts` — `generateJoinCode()`, `findAccountByJoinCode()`, `getOwnershipMembersForAccount()`, `OwnershipMemberDTO`
  - `app/actions/ownership.ts` — `addOwnershipMember()`, `createOwnershipAccount()`
  - `components/dashboard/ownership/member-management.tsx` — exists but only ~88 lines, basic summary
  - `components/dashboard/ownership/ownership-section.tsx` — exists but is configured for "Records & Compliance Mode" not the main Daily Ops pagination
  - `dashboard-config.ts` — controls which sections appear in pagination
  - `section-map.ts` — lazy-loads section components
  - Join codes are 6-character alphanumeric, stored on `ownership_accounts.join_code`

## 3. In Scope

### Part A: LLC Members Page (Page 8 for LLC accounts)
Add a new "Members" page to the paginated dashboard that ONLY appears when the active account is an LLC (not individual accounts).

**Page content:**

**Section 1: Your LLC**
- LLC name with edit pencil icon
- Account type badge: "LLC"
- Number of members

**Section 2: Invite Members**
- Join code displayed prominently in a large copyable field
- "Copy Code" button that copies to clipboard with success toast
- "Share via Email" button that opens compose modal pre-filled with join code instructions
- Simple text: "Share this code with your co-owners. They'll enter it after creating their Domus account."

**Section 3: Current Members**
- List of all members with: name, email, role badge (owner/admin/member/viewer), distribution %, Stripe connected status
- You (the current user) highlighted
- "Remove" button on each member (except yourself)
- Empty state: "You're the only member. Invite your co-owners above."

**Section 4: Distribution Splits**
- Current mode: Retain / Split Equal / Split Custom
- Radio buttons to change mode
- If "Split Custom": editable percentage fields per member (must sum to 100%)
- "Save Distribution" button
- Note: changes to distribution for multi-member LLCs require a vote (use existing distribution change request system)

### Part B: Hide Manager Payments When No Manager Exists
The "Manager Payments" page (page 7) currently shows for all accounts even when no property manager has been assigned.

**Fix:**
- Only include "Manager Payments" in the page list if the account has at least one property with an assigned manager
- If no managers exist: hide the page entirely from pagination (page count drops from 7 to 6, or 8 to 7 for LLCs)
- Also hide the "Manager Payments" sidebar nav item when no managers exist

### Part C: Fix "propertys" Typo
On the Overview page, "0 propertys in view" should be "0 properties in view".

### Part D: LLC Onboarding Prompt
When an LLC account is first created (0 members besides creator, 0 properties), show a setup prompt on the Home page:

```
┌─────────────────────────────────────────┐
│  🏢 Set up J&MSP                        │
│                                          │
│  Get your LLC ready in 3 steps:          │
│                                          │
│  ✅ 1. Create LLC account               │
│  ○  2. Invite your co-owners            │
│  ○  3. Add properties                   │
│                                          │
│  [ Invite Members → ]                   │
└─────────────────────────────────────────┘
```

- Step 1 auto-checks (account exists)
- Step 2 links to the Members page
- Step 3 links to New Property
- Once all 3 are done, the prompt hides and shows the normal Home content

## 4. Out of Scope

- Voting UI for distribution changes (already exists in governance-banners.tsx)
- Stripe Connect onboarding per member (exists in member-management.tsx)
- Join code entry flow for the invited person (they use it during their onboarding)
- Database migrations
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (2-3)
1. `apps/web/components/dashboard/members-section.tsx` — the LLC Members page
2. `apps/web/components/dashboard/llc-setup-prompt.tsx` — onboarding prompt for new LLCs
3. `apps/web/lib/__tests__/members-section.test.ts` — unit tests

### Modified Files (5-7)
1. `apps/web/components/dashboard/dashboard-config.ts` — add "members" section for LLC accounts, conditionally include "manager-payments"
2. `apps/web/components/dashboard/section-map.ts` — register MembersSection lazy import
3. `apps/web/components/dashboard/section-renderer.tsx` — render members section
4. `apps/web/components/dashboard/section-renderer-support.tsx` — pass member data to section
5. `apps/web/components/dashboard/dashboard-data-loader.tsx` — fetch LLC members and join code
6. `apps/web/components/dashboard/index.tsx` or `owner-daily-ops-home.tsx` — render LLC setup prompt
7. `apps/web/components/dashboard/portfolio-section.tsx` — fix "propertys" typo

## 6. Implementation Requirements

### Part A: Members Section

**File: `components/dashboard/members-section.tsx`**

```tsx
interface MembersSectionProps {
  account: OwnershipAccountDTO;
  members: OwnershipMemberDTO[];
  currentUserId: string;
  joinCode: string | null;
  onAddMember: (formData: FormData) => Promise<ActionState>;
  onRemoveMember: (memberId: string) => Promise<ActionState>;
  onUpdateDistribution: (formData: FormData) => Promise<ActionState>;
}

// Section 1: LLC Info
// - Account name (editable via pencil icon, uses existing renameOwnershipAccount)
// - "LLC" badge
// - "{n} members"

// Section 2: Invite Members
// - Large code display: monospace font, letter-spaced, background highlight
//   e.g. <div className="text-3xl font-mono tracking-[0.3em] bg-violet-50 border border-violet-200 rounded-xl px-6 py-4 text-center">{joinCode}</div>
// - Copy button: copies to clipboard, shows "Copied!" toast
// - Share via email button: opens compose modal with pre-filled message:
//   Subject: "Join {accountName} on Domus"
//   Body: "I've set up {accountName} on Domus for managing our rental properties.
//          To join, create an account at domusbase.com and enter this code: {joinCode}"

// Section 3: Member List
// - Each member row: avatar circle (initials), name, email, role badge, distribution %, Stripe status
// - Current user row highlighted with "You" badge
// - Remove button (trash icon + "Remove") on non-self members
// - Remove requires confirmation dialog

// Section 4: Distribution Config
// - Three radio cards:
//   - "Retain All" — All income stays in the LLC account
//   - "Split Equally" — Income divided equally among all members
//   - "Custom Split" — Set custom percentages per member
// - If Custom: show percentage input per member with real-time sum validation
// - "Save" button — if multi-member, creates a distribution change request (vote required)
// - If solo (1 member), changes apply immediately
```

### Part B: Conditional Manager Payments

In `dashboard-config.ts`:
```typescript
// When building the page list:
// Check if any property linked to this account has a manager assigned
// If not, exclude "manager-payments" from the section list

const hasManagers = portfolio.some(p => p.managers && p.managers.length > 0);
// OR check via a dedicated query/flag

const sections = [
  "home",
  "overview",
  "charges",
  "portfolio",
  "maintenance",
  "leases",
  ...(accountType === "llc" ? ["members"] : []),
  ...(hasManagers ? ["manager-payments"] : []),
];
```

Also update the sidebar nav items to conditionally include "Manager Payments".

### Part C: Typo Fix

In `portfolio-section.tsx` or wherever the summary renders:
```diff
- {count} propertys in view
+ {count} ${count === 1 ? 'property' : 'properties'} in view
```

### Part D: LLC Setup Prompt

```tsx
// Only shows when:
// 1. Account type is LLC
// 2. Member count <= 1 (just the creator)
// 3. Property count === 0

// Checklist items:
// ✅ Create LLC account — always checked (they're here)
// ○ Invite your co-owners — links to Members page (page 8)
// ○ Add properties — links to New Property wizard

// Primary CTA: "Invite Members →" button that navigates to Members page
// Secondary: "Add Property" link
```

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] LLC accounts show a "Members" page in the paginated dashboard (page 8)
2. [ ] Members page shows join code in large, copyable format
3. [ ] "Copy Code" button copies to clipboard with success toast
4. [ ] "Share via Email" opens compose modal with pre-filled invite message
5. [ ] Member list shows all members with name, email, role, distribution %, Stripe status
6. [ ] Current user is highlighted with "You" badge
7. [ ] Remove button works with confirmation dialog (not on self)
8. [ ] Distribution mode selector: Retain / Equal / Custom
9. [ ] Custom split shows percentage inputs that must sum to 100%
10. [ ] Multi-member distribution changes create a vote request
11. [ ] Solo member distribution changes apply immediately
12. [ ] Manager Payments page hidden when no managers exist
13. [ ] Manager Payments sidebar item hidden when no managers exist
14. [ ] "propertys" typo fixed to "properties"
15. [ ] LLC onboarding prompt shows on Home for new LLC accounts
16. [ ] Individual accounts do NOT show Members page
17. [ ] `npm run gate:web` passes
18. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
MEMBERS_PAGE: working | broken
JOIN_CODE: displayed and copyable | broken
DISTRIBUTION_CONFIG: working | broken
MANAGER_CONDITIONAL: hidden when no managers | still shows
TYPO_FIX: fixed | still present
LLC_PROMPT: working | broken
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations (join_code column already exists on ownership_accounts)
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Use existing ownership actions (addOwnershipMember, renameOwnershipAccount, etc.) — don't rebuild
- Use existing distribution change request system for multi-member changes — don't bypass voting
- The Members page must ONLY appear for LLC accounts, NEVER for individual accounts
- Manager Payments must ONLY appear when at least one property has an assigned manager
