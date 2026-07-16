# Sprint 61 — Codex Implementation Prompt

## 1. Objective

Fix marketing page visual bugs: card backgrounds rendering white on mobile, remove "Rental Command Center" subtitle, fix sign-in button alignment, add copyright notice, and fix 1 failing E2E test.

## 2. Context

- **Branch**: `main`
- **HEAD**: `34b1143`
- **Production URL**: `https://domusbase.com`
- **Marketing page**: `apps/web/components/marketing/landing-page.tsx`
- **Root cause of white cards**: The "Spreadsheets can't track payments" cards (line ~382) use the `domus-card` CSS class which references `--domus-card-bg`. That token resolves to `rgba(255, 255, 255, 0.95)` in light mode. The marketing page has a dark background but doesn't override these CSS variables, so on devices that report light mode preference, the cards render white.

## 3. In Scope

### Part A: Fix Card Backgrounds
- The 3 pain-point cards ("Spreadsheets can't track payments", "Texts and emails get lost", "Maintenance falls through cracks") must always render with dark backgrounds matching the dark marketing page
- The 4 "How it works" step cards have the same issue — fix those too
- Solution: Either override `--domus-card-*` variables on the marketing page wrapper, or replace `domus-card` with explicit dark classes on the marketing page cards

### Part B: Remove "Rental Command Center"
- Line ~286: Remove `<p className="text-xs uppercase tracking-[0.18em] text-slate-400">Rental command center</p>`
- Just show "Domus" in the header, nothing else

### Part C: Fix Sign-In Button Alignment
- Line ~288-291: The "Sign in →" button in the marketing header needs vertical centering
- Ensure the header uses proper flex alignment so the button is perfectly centered with the "Domus" text

### Part D: Copyright Notices
- Marketing page footer (line ~552-560): Already has `© {year} Domus.` — verify it's present and correct
- Add copyright to login page footer: `© {year} Domus. All rights reserved.`
- Add to `app/layout.tsx` metadata: update the description or add copyright meta tag

### Part E: Fix Failing E2E Test
- `apps/web/tests/e2e/maintenance-photos.spec.ts` test "ticket creation form exposes image upload controls" (line 56) — expects text "attach maintenance photos" and buttons "take photo" / "choose from gallery" but the actual UI uses different labels
- Read the actual ticket form UI (`components/dashboard/ticket-form.tsx` and `components/dashboard/ticket-photo-upload.tsx`) to find the real text/button labels
- Update the test assertions to match the actual UI

## 4. Out of Scope

- Redesigning the marketing page layout
- Changing the marketing page content/copy
- New features
- Database migrations
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### Modified Files (3-4)
1. `apps/web/components/marketing/landing-page.tsx` — fix card classes, remove subtitle, fix button alignment
2. `apps/web/app/login/page.tsx` (or login component) — add copyright footer
3. `apps/web/tests/e2e/maintenance-photos.spec.ts` — fix test assertions to match actual UI
4. `apps/web/app/globals.css` — optionally add dark-mode overrides for domus-card in marketing context

## 6. Implementation Requirements

### Part A: Fix Card Backgrounds

**Option 1 (preferred — scoped override):**

Wrap the marketing page content in a container that overrides the domus-card CSS variables:

```tsx
// In landing-page.tsx, add a wrapper class or style around the pain-point and how-it-works sections:
<div className="marketing-dark-cards">
  {/* pain point cards and how-it-works cards */}
</div>
```

In `globals.css` add:
```css
.marketing-dark-cards .domus-card {
  --domus-card-bg: rgba(15, 23, 42, 0.8);          /* slate-900 with transparency */
  --domus-card-border: rgba(148, 163, 184, 0.15);   /* subtle slate border */
  --domus-card-hover: rgba(30, 41, 59, 0.9);        /* slate-800 on hover */
}
```

**Option 2 (inline override):**

Replace `domus-card` on marketing-specific cards with explicit dark classes:
```tsx
className="rounded-2xl bg-slate-900/80 border border-slate-700/50 backdrop-blur-sm p-6 transition-all hover:border-violet-300/30 hover:bg-slate-800/90"
```

Either option is fine — just make sure the cards ALWAYS render dark regardless of the user's system theme preference.

### Part B: Remove Subtitle

**In `landing-page.tsx` line ~286:**

Remove this line entirely:
```tsx
// DELETE: <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Rental command center</p>
```

The header should just show "Domus" and the "Sign in" button.

### Part C: Fix Sign-In Button

**In `landing-page.tsx` lines ~280-295 (header area):**

Ensure the header container uses:
```tsx
<header className="... flex items-center justify-between ...">
```

The key is `items-center` for vertical alignment. If the Domus text and Sign-in button are in a flex container, both should be vertically centered. Check that there isn't extra padding/margin on one side causing the offset.

Also verify the header has consistent vertical padding:
```tsx
className="... py-4 px-6 ..."  // or similar symmetric padding
```

### Part D: Copyright Footer on Login

**In the login page component**, add a footer below the login form:
```tsx
<footer className="mt-8 text-center text-xs text-muted-foreground">
  &copy; {new Date().getFullYear()} Domus. All rights reserved.
</footer>
```

### Part E: Fix E2E Test

1. Read `apps/web/components/dashboard/ticket-form.tsx` and `apps/web/components/dashboard/ticket-photo-upload.tsx`
2. Find the actual text labels used for the photo upload UI
3. Update `tests/e2e/maintenance-photos.spec.ts` line 56-58 to match the real labels

For example, if the actual button says "Upload Photos" instead of "Take Photo", update:
```typescript
// BEFORE (wrong labels):
await expect(page.getByText(/attach maintenance photos/i)).toBeVisible();
await expect(page.getByRole("button", { name: /take photo/i })).toBeVisible();

// AFTER (match actual UI):
await expect(page.getByText(/actual label here/i)).toBeVisible();
await expect(page.getByRole("button", { name: /actual button text/i })).toBeVisible();
```

Make the test assertions flexible enough to pass but specific enough to verify the photo upload UI is present.

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Pain-point cards ("Spreadsheets can't track payments" etc.) render with dark backgrounds on ALL devices regardless of system theme
2. [ ] "How it works" step cards also render with dark backgrounds
3. [ ] "Rental Command Center" subtitle removed from header — just "Domus"
4. [ ] Sign-in button vertically centered with Domus text in header
5. [ ] Copyright notice present on login page
6. [ ] Copyright notice present on marketing page footer (already there — verify)
7. [ ] Maintenance photos E2E test passes with correct UI labels
8. [ ] `npm run gate:web` passes — all unit tests, lint, typecheck, build clean
9. [ ] No visual regressions on the rest of the marketing page

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
TESTS_UNIT: xxx/xxx
CARD_BG_FIX: applied | not applied
SUBTITLE_REMOVED: yes | no
SIGNIN_ALIGNED: yes | no
COPYRIGHT_ADDED: login | marketing | both
E2E_FIX: passing | still failing
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change the marketing page layout, copy, or structure — only fix the visual bugs
- Cards must look correct in BOTH light and dark system themes — the marketing page is always dark
- Keep the existing marketing page aesthetic — just fix the bugs
