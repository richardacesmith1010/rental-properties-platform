# Sprint 28 — Visual Consistency Polish

## Objective

Replace ~70 inconsistent inline alert boxes across ~28 files with a shared `<Alert>` component, upgrade DataRow hover feedback, and fix EmptyState wireframe border. Zero new features — pure visual consistency.

## Context

- Branch: `main`
- HEAD: `6ba8037` (Sprint 27 — premium sidebar polish)
- Gate baseline: 503/503 tests, lint clean, typecheck clean, build clean
- Production: `https://domusbase.com`
- `class-variance-authority` (cva) is already installed — used by `apps/web/components/ui/badge.tsx`

## In Scope

1. Create shared `Alert` component with 4 variants (error, success, warning, info)
2. Update `FormError`/`FormSuccess` in form-helpers.tsx to use `<Alert>` internally
3. Replace all inline alert markup across ~28 files with `<Alert>`
4. Upgrade DataRow hover to tactile micro-interaction
5. Fix EmptyState dashed border

## Out of Scope

- No new features or pages
- No test file modifications
- No new npm dependencies
- No DB/migration changes
- No deploy
- No changes to CLAUDE.md or AGENTS.md
- Do NOT touch: `connect-banner.tsx`, `autopay-card.tsx`, `feature-warning.tsx`, `achievement-card.tsx`, `streak-display.tsx`, `completion-step.tsx` (complex internal layouts)

## Exact Files Expected to Change

**1 new file:**
- `apps/web/components/ui/alert.tsx`

**~30 modified files:**
- `apps/web/components/dashboard/forms/form-helpers.tsx`
- `apps/web/components/dashboard/units-section.tsx`
- `apps/web/components/dashboard/portfolio-section.tsx`
- `apps/web/components/dashboard/leases-section.tsx`
- `apps/web/components/dashboard/ownership-section.tsx`
- `apps/web/components/dashboard/invitations-section.tsx`
- `apps/web/components/dashboard/charges-section.tsx`
- `apps/web/components/dashboard/vendors-section.tsx`
- `apps/web/components/dashboard/ticket-form.tsx`
- `apps/web/components/dashboard/maintenance-comment-thread.tsx`
- `apps/web/components/dashboard/automation-templates-section.tsx`
- `apps/web/components/dashboard/leasing-hub-section.tsx`
- `apps/web/components/dashboard/inbox-section.tsx`
- `apps/web/components/dashboard/applications-section.tsx`
- `apps/web/components/dashboard/index.tsx`
- `apps/web/components/dashboard/documents/signer-flow.tsx`
- `apps/web/components/settings/bank-settings.tsx`
- `apps/web/components/settings/profile-settings.tsx`
- `apps/web/components/settings/password-settings.tsx`
- `apps/web/components/auth/login-form.tsx`
- `apps/web/components/auth/complete-profile-form.tsx`
- `apps/web/components/onboarding/onboarding-form.tsx`
- `apps/web/components/onboarding/owner-setup-wizard.tsx`
- `apps/web/components/onboarding/steps/add-unit-step.tsx`
- `apps/web/components/onboarding/steps/invite-tenant-step.tsx`
- `apps/web/components/onboarding/steps/add-lease-step.tsx`
- `apps/web/components/shared/data-row.tsx`
- `apps/web/components/shared/empty-state.tsx`

## Implementation Requirements

### Part A: Create Shared Alert Component (`apps/web/components/ui/alert.tsx`)

Create the file with this exact content:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/format";

const alertVariants = cva(
  "rounded-lg border px-3 py-2 text-sm font-medium",
  {
    variants: {
      variant: {
        error: "border-red-200 bg-red-50 text-red-700",
        success: "border-emerald-200 bg-emerald-50 text-emerald-700",
        warning: "border-amber-200 bg-amber-50 text-amber-800",
        info: "border-blue-200 bg-blue-50 text-blue-700",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div className={cn(alertVariants({ variant }), className)} {...props} />
  );
}

export { Alert, alertVariants };
```

### Part B: Update Form Helpers (`forms/form-helpers.tsx`)

1. Add import: `import { Alert } from "@/components/ui/alert";`
2. In `FormError`, replace the `<p>` element:
   ```tsx
   // Before:
   <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{state.error}</p>
   // After:
   <Alert variant="error">{state.error}</Alert>
   ```
3. In `FormSuccess`, replace the `<p>` element:
   ```tsx
   // Before:
   <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">{state.message ?? message}</p>
   // After:
   <Alert variant="success">{state.message ?? message}</Alert>
   ```

This propagates consistent styling to all form consumers automatically.

### Part C: Replace Inline Alerts Across All Files

For each file listed below, add `import { Alert } from "@/components/ui/alert";` and replace inline alert markup with `<Alert>`. Follow these replacement rules:

**Rule 1 — Standard alerts** (most common pattern): Direct replacement, no className override needed.
```tsx
// Any of these:
<p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">...</p>
<p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">...</p>
<p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">...</p>
<p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">...</p>
// Becomes:
<Alert variant="error">...</Alert>                    // or with className="mb-3" if it had mb-3
```

Same for success (emerald) and warning (amber) — just change the variant.

**Rule 2 — Larger card-style alerts** (need className override for size):
```tsx
// Before (rounded-xl, larger padding):
<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 ...">
// After:
<Alert variant="success" className="rounded-xl px-4 py-3">
```

**Rule 3 — text-xs warnings** (automation-templates, leasing-hub, inbox, applications):
```tsx
// Before:
<p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
// After:
<Alert variant="warning" className="text-xs font-normal">
```

**Rule 4 — Margin/spacing preservation**: If the original element had `mb-3`, `mb-4`, `mt-3` etc., preserve them via className:
```tsx
<Alert variant="error" className="mb-3">...</Alert>
```

#### File-by-file specifics:

**Dashboard sections (error/success pairs):**

1. `units-section.tsx` — Lines ~40, ~49: error/success pair with `mb-3`. Replace with `<Alert variant="error" className="mb-3">` and `<Alert variant="success" className="mb-3">`.
2. `portfolio-section.tsx` — Lines ~39, ~48: Same pattern as units-section.
3. `leases-section.tsx` — Lines ~45, ~54: Same pattern.
4. `ownership-section.tsx` — Lines ~53, ~62: Same pattern but no `mb-3`.
5. `invitations-section.tsx` — Lines ~51, ~56: error/success pair. Line ~138: amber warning with `rounded-xl px-4 py-3` → `<Alert variant="warning" className="rounded-xl px-4 py-3">`.
6. `charges-section.tsx` — Lines ~82, ~89: `rounded-md` error/success pair with border → normalize to `<Alert>`. Lines ~185, ~191: larger `rounded-lg` pair with `mb-4 px-4 py-3` → `<Alert variant="..." className="mb-4 px-4 py-3">`.
7. `vendors-section.tsx` — Lines ~372, ~375: error/success pair with `text-xs` → `<Alert variant="..." className="text-xs font-normal">`.
8. `ticket-form.tsx` — Lines ~42, ~51: Standard error/success pair.

**Dashboard features:**

9. `maintenance-comment-thread.tsx` — Lines ~30, ~37: Bordered error/success pair → direct `<Alert>`.
10. `automation-templates-section.tsx` — Line ~180: `text-xs` amber warning → `<Alert variant="warning" className="text-xs font-normal">`.
11. `leasing-hub-section.tsx` — Line ~241: Same text-xs amber pattern.
12. `inbox-section.tsx` — Line ~221: Same text-xs amber pattern.
13. `applications-section.tsx` — Line ~384: Same text-xs amber pattern.
14. `index.tsx` — Line ~657: Large success banner with `rounded-xl px-4 py-3 text-emerald-900` → `<Alert variant="success" className="rounded-xl px-4 py-3">`.

**Documents:**

15. `signer-flow.tsx` — Lines ~48, ~53: Standard error/success pair.

**Settings:**

16. `bank-settings.tsx` — Line ~39: Success with `rounded-xl px-4 py-3` → `<Alert variant="success" className="rounded-xl px-4 py-3">`. Line ~54: Bordered error → `<Alert variant="error">`. Line ~63: Warning with `rounded-xl px-4 py-4` → `<Alert variant="warning" className="rounded-xl px-4 py-4">`.
17. `profile-settings.tsx` — Lines ~204, ~210: Bordered error/success pair → direct `<Alert>`.
18. `password-settings.tsx` — Lines ~89, ~95: Bordered error/success pair → direct `<Alert>`.

**Auth:**

19. `login-form.tsx` — Line ~261: Borderless error → `<Alert variant="error">` (now gets border — intentional normalization).
20. `complete-profile-form.tsx` — Line ~93: Bordered error → `<Alert variant="error">`.

**Onboarding:**

21. `onboarding-form.tsx` — Line ~231: Bordered error → `<Alert variant="error">`.
22. `owner-setup-wizard.tsx` — Lines ~26, ~33: Bordered success/error pair → direct `<Alert>`.
23. `add-unit-step.tsx` — Line ~37: `rounded-md` error → normalizes to `rounded-lg` via `<Alert variant="error">`.
24. `invite-tenant-step.tsx` — Line ~36: Same `rounded-md` normalization.
25. `add-lease-step.tsx` — Line ~57: `rounded-md` error → `<Alert variant="error">`. Line ~61: `rounded-md` amber warning → `<Alert variant="warning">`.

### Part D: DataRow Hover Upgrade (`data-row.tsx`)

Replace the className string in the outer `<div>`:

```tsx
// Before:
className={`flex items-center justify-between gap-4 rounded-xl px-2 py-3.5 transition-colors hover:bg-violet-50/40 sm:px-3 ${
  last ? "" : "border-b border-violet-100/70"
}`}

// After:
className={`flex items-center justify-between gap-4 rounded-xl px-2 py-3.5 transition-all duration-150 hover:bg-violet-50/60 hover:-translate-y-[0.5px] hover:shadow-sm sm:px-3 ${
  last ? "" : "border-b border-violet-100/70"
}`}
```

Changes:
- `transition-colors` → `transition-all duration-150`
- `hover:bg-violet-50/40` → `hover:bg-violet-50/60`
- Add `hover:-translate-y-[0.5px]`
- Add `hover:shadow-sm`

### Part E: EmptyState Border Fix (`empty-state.tsx`)

Replace the `border-dashed` class:

```tsx
// Before (line 31):
<div className={cn("domus-card border-dashed px-6 py-10 text-center", className)}>

// After:
<div className={cn("domus-card px-6 py-10 text-center opacity-90", className)}>
```

Changes:
- Remove `border-dashed`
- Add `opacity-90`

## Validation Commands to Run

```bash
npm run gate:web
```

This runs: 503+ tests (36 suites), ESLint, TypeScript strict check, Next.js production build.

## Acceptance Criteria

1. [ ] New `apps/web/components/ui/alert.tsx` exists with 4 variants (error, success, warning, info) using cva
2. [ ] `FormError` and `FormSuccess` in `form-helpers.tsx` use `<Alert>` internally
3. [ ] All inline alert instances across listed files replaced with `<Alert variant="...">`
4. [ ] Zero `rounded-md bg-red-50` or borderless `bg-{color}-50` patterns remain in alert contexts (outside excluded files)
5. [ ] DataRow hover has `hover:bg-violet-50/60 hover:-translate-y-[0.5px] hover:shadow-sm` with `transition-all duration-150`
6. [ ] EmptyState uses solid border (no `border-dashed`), has `opacity-90`
7. [ ] No visual regressions — all existing conditional rendering, margin classes, and wrapper elements preserved
8. [ ] `npm run gate:web` passes (503+ tests, lint, typecheck, build)

## Report Format

```
gate_passed: true/false
test_count: <number>
lint_clean: true/false
typecheck_clean: true/false
build_clean: true/false
files_changed: <list>
```

## Constraints

- Do NOT modify test files
- Do NOT add new npm dependencies
- Do NOT modify DB or deploy
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT touch complex card layouts (connect-banner, autopay-card, feature-warning, achievement-card, streak-display, completion-step)
- Report compact status only
