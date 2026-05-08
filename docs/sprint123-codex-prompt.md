# Sprint 123 — Audit Hotfix Bundle (6 issues from end-to-end audit)

## Objective

Fix six discrete bugs surfaced during the comprehensive sprint audit (`docs/audit-2026-05-07.md`). All are small, localized, and independently verifiable. Bundling into one sprint because they share the "low risk, audit-discovered" signature.

## Context

- Branch: `main`
- HEAD: post-Sprint 122 (commit `2bbf311`)
- Audit findings doc: `docs/audit-2026-05-07.md`
- Bugs in this sprint:
  1. **Hydration warnings** on every dashboard page (React #425/#422). Root cause: `new Date().getHours()` computed both server-side (UTC) and client-side (local tz), producing different greetings → text content mismatch.
  2. **"1 days" plural grammar** on achievements page (`apps/web/app/achievements/page.tsx:91`).
  3. **"Unit Unit A" duplicate prefix** — display logic prepends "Unit " to `unit_number` but DB rows can have `unit_number = "Unit A"` already.
  4. **Account & Data destructive cards** have dim red text on dark background — possible WCAG AA failure in Noctis/Imperium themes.
  5. **Settings → Security weak copy** — `password-settings.tsx` says "Use at least 6 characters" while auth forms (login/reset/complete-profile) enforce 8 characters + capital + number via `validatePasswordStrength`. Inconsistent and weaker than the rest of the app.
  6. **Silent section fallback** — `/owner?section=foo` (or any unknown section name) renders the default Home section without warning. Bookmarks with stale section names break invisibly.

Bug 4 (section nav `<button>` vs `<a href>`) is **NOT** in scope — that's an architectural refactor, separate sprint.

## In Scope

1. Fix greeting hydration in **all four** components that compute hour-based greeting:
   - `apps/web/components/dashboard/contextual-greeting.tsx`
   - `apps/web/components/dashboard/tenant-overview.tsx`
   - `apps/web/components/dashboard/compact-greeting-bar.tsx`
   - `apps/web/components/dashboard/dashboard-header.tsx`
2. Fix "1 days" pluralization in `apps/web/app/achievements/page.tsx`
3. Fix "Unit Unit A" duplicate prefix — strip leading "Unit " when present, in all components that currently render `Unit ${unit_number}`
4. Fix Account & Data destructive card contrast in dark themes
5. Update `apps/web/components/settings/password-settings.tsx` to use the same strength validation + copy as auth forms
6. Add "section not found" fallback message instead of silent fallback to Home for unknown `?section=` values

## Out of Scope

- Sidebar `<button>` → `<a href>` architectural refactor (separate sprint)
- Server-side timezone configuration changes
- Adding new test cases beyond what's needed to verify these fixes
- Modifying any unrelated components or styles

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/components/dashboard/contextual-greeting.tsx` | Compute greeting in `useEffect` after mount; render empty string on SSR |
| `apps/web/components/dashboard/tenant-overview.tsx` | Same pattern (greeting calc client-only) |
| `apps/web/components/dashboard/compact-greeting-bar.tsx` | Same pattern |
| `apps/web/components/dashboard/dashboard-header.tsx` | Same pattern |
| `apps/web/app/achievements/page.tsx` | Pluralize "day" / "days" based on `gamification.streakCount` |
| `apps/web/components/dashboard/manager-dashboard.tsx` | Strip leading "Unit " from `unitNumber` before display |
| `apps/web/components/dashboard/property-detail-overview-panel.tsx` | Same |
| `apps/web/components/dashboard/tenants-section.tsx` | Same |
| `apps/web/components/dashboard/account-data-settings.tsx` (or wherever destructive cards live — Codex must locate) | Improve red text contrast in dark themes |
| `apps/web/components/settings/password-settings.tsx` | Use `validatePasswordStrength` from auth forms; copy says "Use at least 8 characters with a capital letter and a number." |
| `apps/web/components/dashboard/dashboard-section-loaders.ts` (or section renderer) | If `activeSection` is not in the role's known section list, render a "Section not found" message with a "Back to home" link |
| Tests for each fix where existing test patterns make it cheap | Cover: greeting empty on first render, plural day/days, unit prefix stripping, password validation match, unknown-section fallback |

## Implementation Requirements

### 1. Greeting hydration fix — pattern for all four files

Current pattern (broken):
```typescript
const hour = new Date().getHours();
const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
```

New pattern (compute on client only):
```typescript
"use client";
import { useEffect, useState } from "react";

function useGreeting() {
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
  }, []);
  return greeting;
}
```

Then in render:
```jsx
const greeting = useGreeting();
// Render `${greeting ?? ""}, ${userName}` or skip the greeting block until greeting !== null
```

**Important:**
- All four files become `"use client"` (most already are; Codex must verify)
- On SSR, the greeting is empty string or null → no mismatch
- After hydration, useEffect fires → greeting populates
- This eliminates React error #425 + #422 on every dashboard load

If a component is currently a server component and doesn't have access to `useEffect`, Codex should extract the greeting into a small client component that the server component imports.

### 2. Streak plural

In `apps/web/app/achievements/page.tsx` around line 91:

```tsx
<span>
  <CountUp target={gamification.streakCount} /> {gamification.streakCount === 1 ? "day" : "days"}
</span>
```

That's it. No helper function needed.

### 3. Unit prefix strip

Add a helper in `apps/web/lib/format.ts`:

```typescript
/**
 * Returns "Unit A" given either "A" or "Unit A". Defensive against legacy data
 * where some unit_number values were stored with the prefix already.
 */
export function formatUnitLabel(unitNumber: string | null | undefined): string {
  if (!unitNumber) return "";
  const trimmed = unitNumber.trim();
  if (/^unit\s/i.test(trimmed)) return trimmed; // already prefixed
  return `Unit ${trimmed}`;
}
```

Then replace every `Unit ${unitNumber}` template literal across components with `formatUnitLabel(unitNumber)`. Codex MUST grep all files referencing the pattern and update each call site. The known sites:

- `apps/web/components/dashboard/manager-dashboard.tsx:78`
- `apps/web/components/dashboard/property-detail-overview-panel.tsx:116`
- `apps/web/components/dashboard/tenants-section.tsx:79`
- `apps/web/components/dashboard/unified-property-wizard.tsx` (placeholder labels — leave alone, those are templates)

Verify by grepping `\bUnit \$\{` in `apps/web/`.

### 4. Account & Data destructive contrast

Find the destructive cards in the Settings → Account & Data tab. They use red text (`text-red-500` / `text-destructive` or similar) on a card that has a dark background in Noctis Neon theme. The text "This will deactivate all your properties..." appeared dim/unreadable in the dark theme screenshot.

Options to fix:
- Use higher-contrast red (`text-red-300` instead of `text-red-500`/600 in dark)
- Increase background opacity to differentiate
- Add `dark:text-red-300` Tailwind variant

Codex MUST locate the actual component (search for "Delete All Properties" or "Remove All Tenants" string), read the theme variables in `globals.css` if necessary, and choose the correct fix. Test in all three themes.

### 5. Password policy alignment

Replace `apps/web/components/settings/password-settings.tsx` validation logic with the same `validatePasswordStrength` helper used by `complete-profile-form.tsx` / `reset-password-form.tsx` / `login-form.tsx`. Update the description copy from:

> "Set a new password for your Domus account. Use at least 6 characters."

to:

> "Set a new password for your Domus account. Use at least 8 characters with a capital letter and a number."

Update the inline error message similarly:

```typescript
setError(passwordStrength.errors[0] ?? "Use at least 8 characters with a capital letter and a number.");
```

If a strength meter component exists in auth forms, reuse it here too.

### 6. Unknown-section fallback

Find where `activeSection` resolves to a renderable component (likely `dashboard-section-loaders.ts` or `section-renderer.tsx`). When `activeSection` is set but no matching component exists in the role's section map:

```tsx
// Before: silent fallback to overview/home
return null; // or <HomeSection />

// After:
return (
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
    <h3 className="font-semibold">Section not found</h3>
    <p className="mt-1 text-sm">
      The section "{activeSection}" doesn't exist for your role. Use the sidebar to navigate.
    </p>
    <Link href={roleHomePath} className="mt-3 inline-block text-sm font-medium underline">
      Back to home
    </Link>
  </div>
);
```

Codex MUST find the existing fallback path and replace it. The "known sections" list per role lives in `nav-items.ts` or similar — use that as the source of truth.

### 7. Tests

Add or extend tests for each fix:

- `contextual-greeting.test.tsx` (or similar) — verify SSR render returns greeting=null/empty, post-hydration returns greeting based on hour
- Pluralization in achievements: write a snapshot or assertion that `streakCount=1 → "day"`, `streakCount=2 → "days"`, `streakCount=0 → "days"` (or whatever zero case is)
- `format.test.ts` — `formatUnitLabel` returns "Unit A" given "A" OR "Unit A"
- Password settings test — invalid 6-char input shows new error message; valid 8+char with capital+number passes
- Section renderer test — unknown section name renders the "Section not found" fallback

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

After deploy, manual verification commands:

- Open `/owner` in Chrome → check console: NO React error #425 or #422 should appear
- Open `/achievements` → confirm "1 day" (singular) when streakCount is 1
- Open tenant view → confirm "Unit A" renders correctly (no "Unit Unit A")
- Switch to Noctis Neon theme → open Settings → Account & Data → confirm destructive card text is readable
- Open Settings → Security → confirm copy reads "at least 8 characters with a capital letter and a number"
- Visit `/owner?section=invalid-name` → expect "Section not found" message, not silent home

## Acceptance Criteria

1. [ ] Greeting in all 4 listed components computes via `useEffect` and renders empty/null on SSR
2. [ ] No React error #425 or #422 fires on dashboard pages after deploy (verified via Chrome console)
3. [ ] Achievements page renders "day" when streakCount === 1, "days" otherwise
4. [ ] `formatUnitLabel` helper exists in `lib/format.ts`, returns "Unit X" given either "X" or "Unit X"
5. [ ] All known unit-prefix call sites use `formatUnitLabel` (grep `Unit \${` returns no template-literal matches outside wizards)
6. [ ] Settings → Account & Data destructive cards readable in light + dark themes (no `text-red-500` on `bg-zinc-900`-style mismatch)
7. [ ] `password-settings.tsx` uses `validatePasswordStrength` helper from auth forms
8. [ ] Settings → Security copy says "8 characters with a capital letter and a number"
9. [ ] Inline error in password-settings matches auth form error pattern
10. [ ] Unknown `?section=` value renders "Section not found" message with "Back to home" link
11. [ ] All 6 tests added/extended pass
12. [ ] No unrelated changes
13. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-13] PASS | FAIL each
notes: (any deviations)
MANUAL_VERIFICATION_PATH:
1. Log in (any role)
2. Open /owner or /tenant → check console: NO React #425 / #422 errors
3. Visit /achievements → verify "1 day" singular / "0 days" / "5 days"
4. Visit Settings → Appearance → switch to Noctis Neon → Account & Data → verify red text readable
5. Visit Settings → Security → verify copy mentions 8 chars + capital + number
6. Visit /owner?section=foobar → verify "Section not found" message
```

## Constraints

- Do NOT change server-side rendering for greeting components (only client-side compute)
- Do NOT modify auth form password validation (already correct)
- Do NOT refactor sidebar nav buttons to links (out of scope)
- Do NOT add new dependencies
- Do NOT modify themes' CSS variables themselves; just pick better Tailwind classes for destructive cards in dark mode
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
