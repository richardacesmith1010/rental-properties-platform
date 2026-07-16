# Sprint 24 — Onboarding Polish

## Objective

Improve the first-run experience for new users so they can go from sign-up to first rent charge with minimal friction. Add CTA buttons to empty states, a welcome progress card, better icons, and fix the smoke test.

## Context

- Branch: `main`
- HEAD: `97bd778`
- Remote: `origin/main` (up to date)
- Deploy URL: `https://domusbase.com`
- Gate: 390/390 tests, lint clean, typecheck clean, build clean
- `EmptyState` component already supports `icon`, `title`, `message/description`, `actionLabel`, `onAction`, `className`, `showDom` props — NO changes needed to the component itself
- `goToSectionIfVisible(sectionId: string)` callback already flows from `index.tsx` → `section-renderer.tsx` — use this for cross-section navigation
- Onboarding wizard (`onboarding-wizard.tsx`) exists and works but only triggers when `unitCount === 0`

## In Scope

1. Welcome progress card for empty owner dashboard
2. Empty state CTA buttons in 8 dashboard sections
3. Empty state icon consistency (6 sections)
4. Pass `goToSectionIfVisible` to sections that need it
5. Smoke test fix for 200+client-redirect
6. Grooming: delete stale files
7. Avatar upload client-side size validation

## Out of Scope

- New onboarding wizard steps or redesign (existing wizard is fine)
- Changes to login page, auth callback, complete-profile, or onboarding form (beyond avatar size validation)
- Backend/DB changes (none needed)
- New packages or dependencies

## Exact Files Expected to Change

### Part A: Welcome Progress Card (1 new, 1 modified)
1. `apps/web/components/dashboard/welcome-card.tsx` (NEW)
2. `apps/web/components/dashboard/index.tsx` (MODIFIED)

### Part B: Empty State CTAs (6 modified)
3. `apps/web/components/dashboard/portfolio-section.tsx`
4. `apps/web/components/dashboard/units-section.tsx`
5. `apps/web/components/dashboard/leases-section.tsx`
6. `apps/web/components/dashboard/vendors-section.tsx`
7. `apps/web/components/dashboard/invitations-section.tsx`
8. `apps/web/components/dashboard/documents-section.tsx`

### Part C: Pass goToSectionIfVisible to More Sections (1 modified)
9. `apps/web/components/dashboard/section-renderer.tsx`

### Part D: Empty State Icon Consistency (5 modified)
10. `apps/web/components/dashboard/portfolio-section.tsx` (same file as #3)
11. `apps/web/components/dashboard/units-section.tsx` (same file as #4)
12. `apps/web/components/dashboard/vendors-section.tsx` (same file as #6)
13. `apps/web/components/dashboard/invitations-section.tsx` (same file as #7)
14. `apps/web/components/dashboard/ownership-section.tsx`

### Part E: Avatar Upload Polish (1 modified)
15. `apps/web/components/onboarding/onboarding-form.tsx`

### Part F: Smoke Test Fix (1 modified)
16. `scripts/smoke-web.sh`

### Part G: Grooming (deletions)
17. `apps/web/components/shared/empty-state 2.tsx` (DELETE)
18. `docs/sprint14-codex-prompt.md` (DELETE — already in git history)
19. `docs/sprint16-codex-prompt.md` (DELETE — already in git history)

**Unique file count: 12 modified/new + 3 deleted = 15 total**

## Implementation Requirements

### Part A: Welcome Progress Card

**Create** `apps/web/components/dashboard/welcome-card.tsx`

A client component that replaces the current basic "Add your first property" card shown when `isEmpty=true` in `index.tsx` (lines 547-604).

```tsx
"use client";

interface WelcomeCardProps {
  fullName?: string | null;
  nickname?: string | null;
  role: string;
  stripeConnected: boolean;
  hasProperty: boolean;
  hasUnit: boolean;
  hasLease: boolean;
  onAddProperty: () => void;
}
```

Visual design:
- Card with `domus-card` class, centered, max-w-lg
- Top: `<DomMascot size="lg" />` with `animate-domus-bob`
- Greeting: "Welcome, {nickname || firstName}!" in `text-xl font-semibold domus-heading`
- Subtitle: "Let's get your first property set up. Here's your progress:" in `text-sm domus-muted`
- Progress checklist (vertical list):
  - ✅ Profile completed (always true — they passed onboarding gate)
  - ✅ Account set up (always true — they passed owner setup)
  - ◻ / ✅ Add a property (based on `hasProperty`)
  - ◻ / ✅ Add a unit (based on `hasUnit`)
  - ◻ / ✅ Create a lease (based on `hasLease`)
  - ◻ / ✅ Connect bank account (based on `stripeConnected`)
- Each item: flex row with green checkmark circle (completed) or empty violet circle (pending)
- Completed items: `text-emerald-700 line-through`
- Pending items: `text-zinc-700`
- Bottom: violet primary `<Button>` — label shows the NEXT uncompleted step:
  - If !hasProperty: "Add Your First Property" → `onAddProperty()`
  - If hasProperty && !hasUnit: "Add a Unit" → `onAddProperty()` (same flow, wizard handles it)
  - If hasProperty && hasUnit && !hasLease: "Create a Lease" → `onAddProperty()`
  - If all done but !stripeConnected: "Connect Bank Account" → link to `/connect/onboard`
  - If everything done: "Go to Dashboard" → `window.location.reload()`

**Modify** `apps/web/components/dashboard/index.tsx`

Replace the current `isEmpty && isOwnerRole` block (lines 547-604) with:

```tsx
import { WelcomeCard } from "./welcome-card";

// Replace the existing card with:
<WelcomeCard
  fullName={fullName}
  nickname={nickname}
  role={data.profileRole}
  stripeConnected={stripeConnected === true}
  hasProperty={safePortfolio.properties.length > 0}
  hasUnit={safePortfolio.units.length > 0}
  hasLease={safePortfolio.leases.length > 0}
  onAddProperty={() => {
    window.location.href = "/owner?mode=new_property&section=operations";
  }}
/>
```

Keep the surrounding layout (sidebar, MobileTopBar, ConnectBanner, AchievementChecker) exactly as-is. Only replace the inner card `<div>` (lines 582-600).

### Part B: Empty State CTAs

For sections that DON'T have create callbacks (read-only display sections), the CTA navigates to Operations section using the `goToSectionIfVisible` callback.

**Modify** `portfolio-section.tsx`:
- Add prop: `onGoToOperations?: () => void`
- Update EmptyState to:
  ```tsx
  <EmptyState
    icon={Building2}
    title="No properties yet"
    description="Create your first property to start managing your portfolio."
    actionLabel={onGoToOperations ? "Go to Operations" : undefined}
    onAction={onGoToOperations}
  />
  ```
- Import `Building2` from lucide-react

**Modify** `units-section.tsx`:
- Add prop: `onGoToOperations?: () => void`
- Update EmptyState to:
  ```tsx
  <EmptyState
    icon={DoorOpen}
    title="No units yet"
    description="Add units to your properties to start creating leases."
    actionLabel={onGoToOperations ? "Go to Operations" : undefined}
    onAction={onGoToOperations}
  />
  ```
- Import `DoorOpen` from lucide-react

**Modify** `leases-section.tsx`:
- Add prop: `onGoToOperations?: () => void`
- Update EmptyState (around line 149) to add CTA:
  ```tsx
  <EmptyState
    icon={FileText}
    title="No leases yet"
    description="Create a lease to start collecting rent."
    actionLabel={onGoToOperations ? "Go to Operations" : undefined}
    onAction={onGoToOperations}
  />
  ```

**Modify** `vendors-section.tsx`:
- The section already has `onCreateVendor` and its own create form workflow
- When `vendors.length === 0`, the empty state should offer to open the create vendor form
- Add state: `const [showCreateWhenEmpty, setShowCreateWhenEmpty] = useState(false);`
- Update the empty EmptyState (when `vendors.length === 0`) to:
  ```tsx
  <EmptyState
    icon={HardHat}
    title="No vendors yet"
    description="Add your first vendor to track maintenance contractors."
    actionLabel="Add Vendor"
    onAction={() => setShowCreateWhenEmpty(true)}
  />
  ```
- When `showCreateWhenEmpty` is true, show the create vendor form instead of the empty state
- Import `HardHat` from lucide-react

**Modify** `invitations-section.tsx`:
- The section already has invite forms built in
- Add state: `const [showInviteForm, setShowInviteForm] = useState(false);`
- Update the empty EmptyState to:
  ```tsx
  <EmptyState
    icon={UserPlus}
    title="No invitations yet"
    description="Invite tenants or managers to start building your team."
    actionLabel="Send Invitation"
    onAction={() => setShowInviteForm(true)}
  />
  ```
- When `showInviteForm` is true, show the invite form section
- Import `UserPlus` from lucide-react

**Modify** `documents-section.tsx`:
- Update the templates empty state to:
  ```tsx
  <EmptyState
    icon={FileText}
    title="No templates yet"
    description="Create a document template to start sending packets."
  />
  ```
  (Keep icon as FileText, just improve the description text — no CTA button needed since the template form is visible in the same tab)

### Part C: Pass goToSectionIfVisible to More Sections

**Modify** `section-renderer.tsx`:

The `goToSectionIfVisible` callback is already a prop on `SectionRendererProps`. Currently it's only passed to LeasingHubSection, InboxSection, and AutomationTemplatesSection.

Add `goToSectionIfVisible` pass-through to:

1. **PortfolioSection** — pass as `onGoToOperations={() => goToSectionIfVisible("operations")}`
2. **UnitsSection** — pass as `onGoToOperations={() => goToSectionIfVisible("operations")}`
3. **LeasesSection** — pass as `onGoToOperations={() => goToSectionIfVisible("operations")}`

Find the portfolio section render (around line 567-577) and add the prop:
```tsx
<PortfolioSection
  properties={safePortfolio.properties}
  showControls={canManagePortfolio}
  onUpdateProperty={onUpdateProperty}
  onDeleteProperty={onDeleteProperty}
  onGoToOperations={() => goToSectionIfVisible("operations")}
/>
```

Same pattern for UnitsSection and LeasesSection renders.

### Part D: Empty State Icon Consistency

Replace generic `InboxIcon` (the default) with domain-specific icons:

| Section | Current Icon | New Icon | Import |
|---|---|---|---|
| portfolio-section.tsx | InboxIcon (default) | `Building2` | lucide-react |
| units-section.tsx | InboxIcon (default) | `DoorOpen` | lucide-react |
| vendors-section.tsx | InboxIcon (default) | `HardHat` | lucide-react |
| invitations-section.tsx | InboxIcon (default) | `UserPlus` | lucide-react |
| ownership-section.tsx | InboxIcon (default) | `Users` | lucide-react |

These changes overlap with Part B — the icon update is part of the EmptyState prop update.

For `ownership-section.tsx`, update the EmptyState to:
```tsx
<EmptyState
  icon={Users}
  title="No ownership accounts"
  description="Create an ownership account to organize your properties."
/>
```

### Part E: Avatar Upload Polish

**Modify** `apps/web/components/onboarding/onboarding-form.tsx`:

Add client-side file size validation when the user selects an avatar:

```tsx
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// In the file input onChange handler:
const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    setAvatarError("Image must be under 5 MB.");
    e.target.value = ""; // clear the input
    return;
  }

  setAvatarError(null);
  // ... existing preview logic
};
```

Add `avatarError` state and display it below the file input:
```tsx
{avatarError && (
  <p className="mt-1 text-xs text-red-600">{avatarError}</p>
)}
```

Also add accepted file type hint text:
```tsx
<p className="mt-1 text-xs domus-muted">JPG, PNG, or WebP. Max 5 MB.</p>
```

### Part F: Smoke Test Fix

**Modify** `scripts/smoke-web.sh`:

Replace the protected route guards block (lines 18-34) with logic that accepts EITHER:
- HTTP 307/302 with `Location: /login` header (traditional redirect)
- HTTP 200 where the response body contains `NEXT_REDIRECT` or `meta http-equiv="refresh"` pointing to `/login` (Next.js App Router client-side redirect)

```bash
echo "[smoke] Checking protected route guards"
for path in /owner /manager /tenant /owner/generate /settings /complete-profile; do
  HEADERS="$(mktemp)"
  BODY="$(mktemp)"
  STATUS="$(curl -s -D "$HEADERS" -o "$BODY" -w "%{http_code}" "$APP_URL$path")"

  if [[ "$STATUS" == "307" || "$STATUS" == "302" ]]; then
    # Traditional redirect — check Location header
    LOCATION="$(grep -i '^location:' "$HEADERS" | head -n1 | tr -d '\r' | awk '{print $2}')"
    if [[ "$LOCATION" != *"/login"* ]]; then
      echo "[smoke] Expected redirect location to include /login for $path, got: ${LOCATION:-<none>}"
      rm -f "$HEADERS" "$BODY"
      exit 1
    fi
  elif [[ "$STATUS" == "200" ]]; then
    # Next.js App Router client-side redirect — check body for redirect markers
    if grep -q 'NEXT_REDIRECT' "$BODY" || grep -qi 'http-equiv="refresh"' "$BODY" || grep -qi '/login' "$BODY"; then
      : # OK — client-side redirect to login detected
    else
      echo "[smoke] Got 200 for $path but no client-side redirect to /login found in body"
      rm -f "$HEADERS" "$BODY"
      exit 1
    fi
  else
    echo "[smoke] Expected redirect for unauthenticated $path, got $STATUS"
    rm -f "$HEADERS" "$BODY"
    exit 1
  fi

  rm -f "$HEADERS" "$BODY"
done
```

### Part G: Grooming

Delete these files:
- `apps/web/components/shared/empty-state 2.tsx` — duplicate of `empty-state.tsx`, not imported anywhere
- `docs/sprint14-codex-prompt.md` — completed sprint, preserved in git history
- `docs/sprint16-codex-prompt.md` — completed sprint, preserved in git history

Verify before deleting: `grep -r "empty-state 2" apps/web/` must return zero results.

## Validation Commands

```bash
# 1. Gate (tests + lint + typecheck + build)
npm run gate:web

# 2. Verify empty-state 2.tsx is not imported
grep -r "empty-state 2" apps/web/

# 3. Verify all EmptyState usages in dashboard sections have icons
grep -rn "EmptyState" apps/web/components/dashboard/ --include="*.tsx" | grep -v "import" | grep -v "test"

# 4. Verify welcome-card.tsx exists
ls -la apps/web/components/dashboard/welcome-card.tsx

# 5. Verify stale files deleted
ls docs/sprint14-codex-prompt.md 2>/dev/null && echo "FAIL: sprint14 prompt still exists" || echo "OK"
ls docs/sprint16-codex-prompt.md 2>/dev/null && echo "FAIL: sprint16 prompt still exists" || echo "OK"
ls "apps/web/components/shared/empty-state 2.tsx" 2>/dev/null && echo "FAIL: duplicate empty-state still exists" || echo "OK"

# 6. Smoke test (if APP_URL set)
APP_URL=https://domusbase.com npm run smoke:web
```

## Acceptance Criteria

1. `welcome-card.tsx` exists and shows progress checklist with 6 items
2. Welcome card renders when `isEmpty=true` for owner role (replaces old basic card)
3. Welcome card shows correct state for each checklist item (✅ or ◻)
4. Welcome card primary button label reflects the next uncompleted step
5. Portfolio EmptyState has `Building2` icon + "Go to Operations" CTA button
6. Units EmptyState has `DoorOpen` icon + "Go to Operations" CTA button
7. Leases EmptyState has `FileText` icon + "Go to Operations" CTA button
8. Vendors EmptyState has `HardHat` icon + "Add Vendor" CTA button
9. Invitations EmptyState has `UserPlus` icon + "Send Invitation" CTA button
10. Documents EmptyState has improved description text
11. Ownership EmptyState has `Users` icon + improved text
12. `goToSectionIfVisible` passed to PortfolioSection, UnitsSection, LeasesSection via section-renderer
13. Clicking "Go to Operations" CTA navigates to Operations section
14. Avatar upload rejects files > 5 MB with error message
15. Avatar upload shows "JPG, PNG, or WebP. Max 5 MB." hint text
16. Smoke test passes with 200+client-redirect (not just 307/302)
17. `empty-state 2.tsx` deleted
18. `docs/sprint14-codex-prompt.md` deleted
19. `docs/sprint16-codex-prompt.md` deleted
20. `npm run gate:web` passes (all tests, lint, typecheck, build)

## Report Format

```
gate_pass: YES | NO
test_count: <N>/<N>
lint_clean: YES | NO
typecheck_clean: YES | NO
build_clean: YES | NO
welcome_card_created: YES | NO
empty_state_ctas_added: YES | NO (count: N sections)
icon_consistency_updated: YES | NO (count: N sections)
go_to_operations_wired: YES | NO
avatar_validation_added: YES | NO
smoke_test_fixed: YES | NO
stale_files_deleted: YES | NO (count: N)
files_changed: <N>
files_created: <N>
files_deleted: <N>
```

## Constraints

- Do NOT apply any database migrations
- Do NOT deploy to Vercel
- Do NOT modify `CLAUDE.md` or `AGENTS.md`
- Do NOT add new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections in your report. Report compact status only.
- Do NOT change the `EmptyState` component itself (`components/shared/empty-state.tsx`) — it already has all needed props
- The `goToSectionIfVisible` callback already exists in section-renderer props — just pass it through to the sections
