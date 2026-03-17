# Sprint 42 — Codex Implementation Prompt

## 1. Objective

Wire the account governance UI into the ownership section AND fix account switcher UX issues: make rename super easy and intuitive, hide unnecessary info (account type badge, email-based names), add LLC delete with confirmation, and pending vote banners.

## 2. Context

- **Branch**: `main`
- **HEAD**: `13c2711`
- **Gate baseline**: all unit tests passing, lint clean, typecheck clean, build clean
- **Production URL**: `https://domusbase.com`
- **Migration already applied**: 4 governance tables live in Supabase

**Sprint 41 delivered (backend, all working):**
- `apps/web/app/actions/account-governance.ts` — `renameOwnershipAccount`, `voteOnAccountRename`, `requestDeleteLLC`, `voteOnDeleteLLC`
- `apps/web/lib/ownership.ts` — `AccountRenameRequestDTO`, `AccountDeleteRequestDTO`, `getPendingAccountRenameRequests`, `getPendingAccountDeleteRequests`
- 4 DB tables live in Supabase

**Current UX problems (visible in production right now):**
1. The account name in the sidebar shows "richard.ace.smith Account" — the user's email prefix. This is ugly and not user-friendly.
2. The "Individual" badge is clipped/overflowing in the sidebar because the sidebar is narrow.
3. There is NO way for the user to rename their account — no pencil icon, no edit button, nothing.
4. The account type badge ("Individual" / "LLC") and member count take up space but add little value for a single-account user.

**Existing UI patterns to match:**
- Distribution change request voting banners already exist in ownership-section.tsx
- `useTransition` patterns used throughout the app for form submissions
- shadcn/ui component library (Button, Input, Dialog, Alert, Badge)

**Key file**: `apps/web/components/dashboard/account-switcher.tsx` — renders the sidebar account card. Currently shows: Building2 icon + display_name + Badge("Individual"/"LLC") + member count + account selector dropdown + "+ New Account" button.

## 3. In Scope

### Part A: Account Switcher UX Cleanup
- Remove the account type badge ("Individual" / "LLC") from the sidebar account card — it's clipped and unnecessary
- Remove the member count from the single-account view — unnecessary for solo users
- Make the account name clickable to rename (the primary UX fix)
- Keep the multi-account dropdown selector but simplify it

### Part B: Inline Rename in Account Switcher
- Click the account name → it becomes an editable text input right there in the sidebar
- Save on Enter or blur, cancel on Escape
- Calls `renameOwnershipAccount` server action
- For LLC with multiple members: show a toast explaining "Rename request submitted for member vote"
- This should feel as natural as renaming a folder

### Part C: Data Loading for Governance
- Fetch pending rename and delete requests in the ownership data loader
- Pass to ownership section as props

### Part D: Governance UI in Ownership Section
- Pending rename vote banner (for LLC accounts with pending rename)
- Delete button on LLC accounts with confirmation dialog
- Pending delete vote banner (for LLC accounts with pending delete)
- Approve/reject buttons for members who haven't voted

### Part E: Smart Default Name
- When `getOrCreateIndividualOwnershipAccount` creates an account, if the profile has `full_name`, use `"{First Name}'s Account"` (e.g., "Ace's Account") not `"{Full Name} Account"`
- Extract first name from full_name (split on space, take first segment)
- Fallback: "My Account" (not "Individual Account" — that's jargon)

## 4. Out of Scope

- Backend action changes to `account-governance.ts` (Sprint 41 is complete)
- New database migrations
- E2E tests
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### Modified Files (5-8)
1. `apps/web/components/dashboard/account-switcher.tsx` — remove badge, remove member count from single view, add inline rename
2. `apps/web/components/dashboard/ownership-section.tsx` — vote banners, delete button, governance UI
3. `apps/web/components/dashboard/dashboard-data-loader.tsx` — fetch pending governance requests
4. `apps/web/components/dashboard/types.ts` — add governance request types to dashboard data
5. `apps/web/lib/ownership.ts` — fix default name in `getOrCreateIndividualOwnershipAccount`
6. `apps/web/app/owner/page.tsx` — pass governance data through (if needed)
7. `apps/web/components/dashboard/section-renderer.tsx` — pass governance props (if needed)

## 6. Implementation Requirements

### Part A: Account Switcher UX Cleanup

**In `account-switcher.tsx`:**

**Single-account view (accounts.length <= 1):**

BEFORE (current):
```
┌────────────────────────────┐
│ 🏢 richard.ace.smith Accou │
│ ┌──────────┐               │
│ │Individual│  1 member      │
│ └──────────┘               │
│   [+ New Account]          │
└────────────────────────────┘
```

AFTER (target):
```
┌────────────────────────────┐
│ 🏢 Ace's Account      ✏️   │
│   [+ New Account]          │
└────────────────────────────┘
```

Changes:
1. **Remove** the Badge component showing "Individual"/"LLC" — it clips and adds no value
2. **Remove** the member count line for single-account view (it always says "1 member")
3. **Add** a small pencil icon (Pencil from lucide-react) to the right of the account name
4. Clicking the name OR the pencil icon enters edit mode

**Multi-account view (accounts.length > 1):**

Same cleanup — remove the badge from the header. In the dropdown options, keep the account type label since users need to distinguish between accounts. But change format from:
```
richard.ace.smith Account - Individual - 1 member
```
to:
```
Ace's Account (Individual)
```

### Part B: Inline Rename

**Edit mode** (replaces account name text):
```
┌────────────────────────────┐
│ [Ace's Account_________] ✓ │
│   [+ New Account]          │
└────────────────────────────┘
```

Implementation:
```typescript
const [isEditing, setIsEditing] = useState(false);
const [editName, setEditName] = useState("");
const [isPending, startTransition] = useTransition();

function startEdit() {
  setEditName(activeAccount.displayName);
  setIsEditing(true);
}

function handleSave() {
  if (!editName.trim() || editName.trim() === activeAccount.displayName) {
    setIsEditing(false);
    return;
  }
  const formData = new FormData();
  formData.set("accountId", activeAccount.id);
  formData.set("newName", editName.trim());
  startTransition(async () => {
    const result = await renameOwnershipAccount(formData);
    if (result?.error) {
      // show error toast
    } else if (result?.requiresVote) {
      // show info toast: "Rename submitted for member vote"
    }
    setIsEditing(false);
  });
}
```

- Text input: same styling as sidebar (white text on transparent bg, subtle border)
- Auto-focus the input when entering edit mode
- **Enter** → save
- **Escape** → cancel
- **Blur** → save (if changed) or cancel (if unchanged)
- Check mark icon (Check from lucide-react) as save button, or just rely on Enter/blur
- Input disabled while `isPending`

### Part C: Data Loading

**In `dashboard-data-loader.tsx`** or wherever ownership data flows:

Import and call:
```typescript
import { getPendingAccountRenameRequests, getPendingAccountDeleteRequests } from "@/lib/ownership";
```

For each ownership account, fetch pending requests. Bundle into dashboard data.

**In `types.ts`**, add:
```typescript
pendingRenameRequests: AccountRenameRequestDTO[];
pendingDeleteRequests: AccountDeleteRequestDTO[];
```

### Part D: Governance UI in Ownership Section

**In `ownership-section.tsx`:**

1. **Pending rename banner** (on accounts with a pending rename request):
   ```
   ┌─────────────────────────────────────────────────┐
   │ ⏳ Rename to "Smith Family LLC" — 1/2 votes      │
   │ Requested by {requester_name}                    │
   │ [Approve] [Reject]        (if user hasn't voted) │
   │ ✓ You voted to approve    (if user already voted) │
   └─────────────────────────────────────────────────┘
   ```
   - Amber/yellow background
   - Only show approve/reject if current user hasn't voted

2. **Delete button** on LLC account cards (NOT individual accounts):
   - Small red "Delete Account" text button or trash icon in the account management area
   - On click: confirmation dialog:
     - Title: "Delete LLC Account"
     - Body: "This will permanently delete '{name}' and unlink all associated properties. This cannot be undone."
     - If multi-member: add "All members must vote to approve."
     - Cancel + red "Request Deletion" button

3. **Pending delete banner** (on accounts with a pending delete request):
   ```
   ┌─────────────────────────────────────────────────┐
   │ 🗑️ Deletion requested — 1/3 votes               │
   │ {reason or "No reason provided"}                 │
   │ [Approve] [Reject]        (if user hasn't voted) │
   └─────────────────────────────────────────────────┘
   ```
   - Red/destructive styling

4. **Vote interaction pattern:**
   ```typescript
   const [isPending, startTransition] = useTransition();
   function handleVote(requestId: string, vote: "approve" | "reject") {
     const formData = new FormData();
     formData.set("requestId", requestId);
     formData.set("vote", vote);
     startTransition(async () => {
       const result = await voteOnAccountRename(formData);
       if (result?.error) { toast.error(result.error); }
       else { toast.success("Vote recorded"); }
     });
   }
   ```
   - Buttons disabled while pending
   - After voting, buttons replaced with "You voted to {vote}" text

### Part E: Smart Default Name

**In `lib/ownership.ts`**, update `getOrCreateIndividualOwnershipAccount`:

Change the display name logic from:
```typescript
const displayName =
  profile?.full_name && profile.full_name.trim().length > 0
    ? `${profile.full_name.trim()} Account`
    : fallbackDisplayName;
```

To:
```typescript
function getFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  const firstSpace = trimmed.indexOf(" ");
  return firstSpace > 0 ? trimmed.substring(0, firstSpace) : trimmed;
}

const displayName =
  profile?.full_name && profile.full_name.trim().length > 0
    ? `${getFirstName(profile.full_name)}'s Account`
    : "My Account";
```

Also change the default `fallbackDisplayName` parameter from `"Individual Account"` to `"My Account"`.

**Note:** This only affects NEW accounts going forward. Existing accounts keep their current name until the user renames them via the new UI.

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Account switcher sidebar card does NOT show "Individual"/"LLC" badge
2. [ ] Account switcher sidebar card does NOT show member count for single-account users
3. [ ] Account name in sidebar is clickable — clicking it or the pencil icon enters edit mode
4. [ ] Edit mode shows a text input with the current name, auto-focused
5. [ ] Enter saves, Escape cancels, blur saves-if-changed
6. [ ] Rename for individual account updates immediately
7. [ ] Rename for multi-member LLC shows "submitted for vote" toast
8. [ ] Multi-account dropdown shows simplified format: "Name (Type)"
9. [ ] New individual accounts default to "{First Name}'s Account" or "My Account"
10. [ ] Ownership section shows pending rename vote banners for LLC accounts
11. [ ] LLC accounts in ownership section show a "Delete Account" button
12. [ ] Delete button opens confirmation dialog with clear warning
13. [ ] Pending delete vote banners show with approve/reject buttons
14. [ ] Vote buttons call correct server actions with loading states
15. [ ] `npm run gate:web` passes — all unit tests, lint, typecheck, build clean
16. [ ] No regressions to existing ownership, account switching, or dashboard features

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
ACCOUNT_SWITCHER_CLEANUP: done | partial
INLINE_RENAME: working | broken
SMART_DEFAULT_NAME: working | broken
GOVERNANCE_VOTE_UI: working | broken
DELETE_LLC_UI: working | broken
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT modify server actions in `account-governance.ts` (Sprint 41 is complete)
- Do NOT create new database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- The rename input in the sidebar must match the sidebar's visual style (white text, transparent/translucent background, subtle borders)
- The pencil icon should be subtle (white/60 opacity) and only become fully visible on hover
- All changes must be responsive — sidebar is narrow (~240px), inputs must fit
