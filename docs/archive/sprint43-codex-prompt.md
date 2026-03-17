# Sprint 43 — Codex Implementation Prompt

## 1. Objective

Performance optimization: parallelize sequential DB queries, lazy-load conditional dashboard sections, split oversized components, and fix image sizing props.

## 2. Context

- **Branch**: `main`
- **HEAD**: `35feae1`
- **Gate baseline**: all unit tests passing, lint clean, typecheck clean, build clean
- **Production URL**: `https://domusbase.com`
- **No migrations needed** — pure frontend refactoring

**Performance audit findings:**
- 5 sequential await sites that can be parallelized
- 5 dashboard sections statically imported but only conditionally rendered
- 3 components over 500 lines (ownership-section 1200+, section-renderer 677, sidebar-nav 640)
- 2 images missing `sizes` prop

## 3. In Scope

### Part A: Parallelize Sequential Awaits
Convert independent sequential `await` calls to `Promise.allSettled` (following Sprint 40 patterns).

### Part B: Lazy-Load Conditional Dashboard Sections
Use `next/dynamic` for sections that only render based on active section selection.

### Part C: Split Large Components
Break up the 3 largest component files into focused sub-modules.

### Part D: Image Optimization
Add missing `sizes` props to `next/image` usage.

## 4. Out of Scope

- New features or behavior changes
- Database migrations
- Backend action logic changes
- E2E test modifications
- CLAUDE.md / AGENTS.md edits
- Bundle analyzer setup (future sprint)
- ISR/SSG changes

## 5. Exact Files Expected to Change

### Part A: Parallelize (5 files)
1. `apps/web/app/actions/charges.ts` — parallelize charge→lease→unit→property lookup chain where possible
2. `apps/web/app/actions/withdrawals.ts` — parallelize `canUserAdministerOwnershipAccount` + `getActiveMembers`
3. `apps/web/app/actions/lease-lifecycle-actions.ts` — parallelize lease update + rent increase history insert
4. `apps/web/app/actions/plaid.ts` — parallelize balance fetch + DB update where independent

### Part B: Lazy-Load (1 file)
5. `apps/web/components/dashboard/section-renderer.tsx` — convert static imports to `next/dynamic` for:
   - NotificationsSection
   - InboxSection
   - DocumentsSection
   - OwnershipSection
   - AutomationTemplatesSection

### Part C: Split Components (3 source files → 6-10 new files)

**ownership-section.tsx (1200+ lines) → split into:**
6. `apps/web/components/dashboard/ownership/ownership-section.tsx` — main orchestrator (re-export from here)
7. `apps/web/components/dashboard/ownership/create-account-form.tsx` — account creation form
8. `apps/web/components/dashboard/ownership/account-card.tsx` — individual account card display
9. `apps/web/components/dashboard/ownership/governance-banners.tsx` — rename/delete vote banners
10. `apps/web/components/dashboard/ownership/member-management.tsx` — member list and invite UI

**section-renderer.tsx (677 lines) → split into:**
11. `apps/web/components/dashboard/section-renderer.tsx` — keep as main file but extract section mapping
12. `apps/web/components/dashboard/section-map.ts` — section name → component mapping with dynamic imports

**sidebar-nav.tsx (640 lines) → split into:**
13. `apps/web/components/dashboard/sidebar/sidebar-nav.tsx` — main nav orchestrator
14. `apps/web/components/dashboard/sidebar/nav-items.ts` — nav item definitions and builders per role
15. `apps/web/components/dashboard/sidebar/user-footer.tsx` — user avatar/name footer section

### Part D: Image Fixes (2 files)
16. `apps/web/components/gamification/dom-mascot.tsx` — add `sizes` prop
17. `apps/web/components/dashboard/user-menu-popover.tsx` — add `sizes` prop (if it uses next/image)

### Import Updates (as needed)
- Any file that imports from the split components needs its import path updated
- Use `grep` to find all importers before splitting

## 6. Implementation Requirements

### Part A: Parallelize Sequential Awaits

**Pattern to follow (from Sprint 40):**
```typescript
// BEFORE:
const canAdmin = await canUserAdministerOwnershipAccount(supabase, userId, accountId);
const members = await getActiveMembers(supabase, accountId);

// AFTER:
const [canAdminSettled, membersSettled] = await Promise.allSettled([
  canUserAdministerOwnershipAccount(supabase, userId, accountId),
  getActiveMembers(supabase, accountId)
]);
const canAdmin = canAdminSettled.status === "fulfilled" ? canAdminSettled.value : null;
const members = membersSettled.status === "fulfilled" ? membersSettled.value : null;

if (!canAdmin) return { error: "Unable to verify permissions." };
if (!members) return { error: "Unable to load member data." };
```

**charges.ts**: The charge→lease→unit→property chain is sequential by nature (each depends on previous). However, look for any INDEPENDENT queries in that file that can be parallelized. Do NOT break dependent chains.

**withdrawals.ts** (~line 85-90): `canUserAdministerOwnershipAccount` and `getActiveMembers` are independent — parallelize.

**lease-lifecycle-actions.ts** (~line 69-73): lease update and rent increase history insert are independent — parallelize.

**plaid.ts**: Only parallelize truly independent operations. The `exchangePublicToken → getAccounts` chain is dependent — do NOT parallelize that.

**CRITICAL**: Only parallelize operations that are truly independent. If query B needs the result of query A, keep them sequential. When in doubt, leave it sequential.

### Part B: Lazy-Load Dashboard Sections

**In `section-renderer.tsx`:**

Replace static imports with `next/dynamic`:

```typescript
// BEFORE:
import { NotificationsSection } from "./notifications-section";
import { InboxSection } from "./inbox-section";
import { DocumentsSection } from "./documents-section";
import { OwnershipSection } from "./ownership-section";
import { AutomationTemplatesSection } from "./automation-templates-section";

// AFTER:
import dynamic from "next/dynamic";

const NotificationsSection = dynamic(() =>
  import("./notifications-section").then(m => ({ default: m.NotificationsSection })),
  { loading: () => <SectionSkeleton /> }
);
// ... same pattern for each
```

Create a simple `SectionSkeleton` component (or reuse an existing loading skeleton) that shows while the section loads.

**Keep statically imported**: Sections that are shown by default on page load (the main dashboard/overview sections) should NOT be lazy-loaded.

**Note**: AnalyticsSection is already lazy-loaded — don't change it.

### Part C: Split Large Components

**IMPORTANT RULES:**
1. Before splitting any file, `grep` the ENTIRE `apps/web/` tree for all importers of that file
2. Update ALL import paths after splitting
3. The main export must remain accessible from the original path (use barrel re-exports if needed)
4. Each new file should have ONE clear purpose
5. Keep the file count reasonable — don't over-split

**ownership-section.tsx split:**

The main `OwnershipSection` component should remain as the orchestrator. Extract:

- **create-account-form.tsx**: The "Create New Account" form (account type selector, name input, submit). This is a self-contained form.
- **account-card.tsx**: The card that displays a single ownership account (name, members, linked properties, Stripe status, distribution config). Receives a single `OwnershipAccountDTO` + handlers as props.
- **governance-banners.tsx**: The `RenameRequestBanner` and `DeleteRequestBanner` components + the `GovernanceVoteForm`. These are self-contained UI with their own transitions.
- **member-management.tsx**: Member list, invite member form, remove member handler. Self-contained section.

Re-export `OwnershipSection` from the new location but also keep a barrel export at the old path so existing imports don't break:
```typescript
// apps/web/components/dashboard/ownership-section.tsx (barrel)
export { OwnershipSection } from "./ownership/ownership-section";
```

**section-renderer.tsx split:**

Extract the section-to-component mapping into `section-map.ts`. The renderer itself becomes a thin switch/lookup that renders the right section based on the active section name.

**sidebar-nav.tsx split:**

- **nav-items.ts**: Pure data — functions that build nav item arrays per role/mode. No JSX.
- **user-footer.tsx**: The user avatar, name, role badge at the bottom of the sidebar.
- **sidebar-nav.tsx**: The main nav layout, mode switcher, search. Imports from nav-items and user-footer.

### Part D: Image Optimization

For any `next/image` component missing `sizes`:
```typescript
// Add sizes based on the rendered size:
<Image sizes="100px" ... />  // for mascot/avatar sized images
<Image sizes="40px" ... />   // for small icons/thumbnails
```

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Sequential awaits parallelized in withdrawals.ts, lease-lifecycle-actions.ts (and plaid.ts/charges.ts where safe)
2. [ ] 5 dashboard sections lazy-loaded with `next/dynamic` + loading skeleton
3. [ ] ownership-section.tsx split into 4-5 focused files, each under 500 lines
4. [ ] section-renderer.tsx split — mapping extracted, main file simplified
5. [ ] sidebar-nav.tsx split into 3 files — nav items, user footer, main nav
6. [ ] All existing imports updated — no broken references
7. [ ] Barrel re-exports maintain backward compatibility for any external importers
8. [ ] Image `sizes` props added where missing
9. [ ] `npm run gate:web` passes — all unit tests, lint, typecheck, build clean
10. [ ] No behavioral regressions — all features work identically
11. [ ] No new files exceed 500 lines
12. [ ] No new npm dependencies added

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
DELETED_FILES: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
PARALLEL_SITES_CONVERTED: x/4
LAZY_LOADED_SECTIONS: x/5
COMPONENTS_SPLIT: ownership | section-renderer | sidebar-nav
LARGEST_FILE_LINES: [filename: lines]
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT change any feature behavior — this is pure refactoring
- Do NOT create new database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT break existing imports — use barrel re-exports where needed
- Do NOT lazy-load sections that render on initial page load (overview/daily ops)
- Do NOT parallelize dependent query chains — only truly independent operations
- Do NOT modify account-switcher.tsx (recently updated in Sprint 42, leave as-is)
