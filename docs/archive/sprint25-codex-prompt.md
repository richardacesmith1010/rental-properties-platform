# Sprint 25 — Test Coverage Expansion

## Objective

Expand test coverage from 390 tests (18 suites) to 500+ tests (28+ suites). Focus on untested dashboard components and shared utilities. All new tests go in `__tests__/` directories — zero source file changes.

## Context

- Branch: `main`
- HEAD: `97bd778`
- Remote: `origin/main`
- Gate: 390/390 tests (18 suites), lint clean, typecheck clean, build clean
- **Sprint 24 is running concurrently** — it modifies source files in `components/dashboard/`. This sprint ONLY creates test files, so there are NO conflicts.
- Existing test files: 2 in `components/__tests__/`, 16 in `lib/__tests__/`
- Test framework: Vitest + React Testing Library + jsdom

## In Scope

1. Dashboard component unit tests (10 new test files)
2. Shared component tests (3 new test files)
3. Server action unit tests (3 new test files)
4. Utility function tests (2 new test files)

## Out of Scope

- Modifying ANY source files (components, lib, actions, pages)
- E2E tests (Playwright already exists)
- Integration tests requiring real Supabase
- Backend/DB changes
- Deploy

## Exact Files Expected to Change (ALL NEW)

### Part A: Dashboard Component Tests (10 new files)
1. `apps/web/components/__tests__/kpi-grid.test.tsx`
2. `apps/web/components/__tests__/portfolio-section.test.tsx`
3. `apps/web/components/__tests__/units-section.test.tsx`
4. `apps/web/components/__tests__/leases-section.test.tsx`
5. `apps/web/components/__tests__/maintenance-section.test.tsx`
6. `apps/web/components/__tests__/notifications-section.test.tsx`
7. `apps/web/components/__tests__/payments-section.test.tsx`
8. `apps/web/components/__tests__/empty-state.test.tsx`
9. `apps/web/components/__tests__/connect-banner.test.tsx`
10. `apps/web/components/__tests__/autopay-card.test.tsx`

### Part B: Shared Component Tests (3 new files)
11. `apps/web/components/__tests__/submit-button.test.tsx`
12. `apps/web/components/__tests__/data-row.test.tsx`
13. `apps/web/components/__tests__/modal-overlay.test.tsx`

### Part C: Server Action Tests (3 new files)
14. `apps/web/app/actions/__tests__/auth-helpers.test.ts`
15. `apps/web/app/actions/__tests__/charges.test.ts`
16. `apps/web/app/actions/__tests__/properties.test.ts`

### Part D: Utility Tests (2 new files)
17. `apps/web/lib/__tests__/notifications.test.ts`
18. `apps/web/lib/__tests__/property-access.test.ts`

**Total: 18 new test files, 0 modified files**

## Implementation Requirements

### Test Patterns

Follow the exact patterns established in existing test files. Key conventions:

**React component tests** (see `charges-section.test.tsx`):
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock react-dom for useFormState
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: () => [null, async () => null] as const
  };
});

// Mock next/navigation if component uses useRouter/useSearchParams
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/"
}));
```

**Lib/utility tests** (see `format.test.ts`):
```ts
import { describe, expect, it } from "vitest";
```

**Server action tests** — mock Supabase + auth:
```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the modules the action imports
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockSupabase
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn()
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn()
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));
```

### Part A: Dashboard Component Tests

**1. kpi-grid.test.tsx** (target: 8 tests)
- Renders 4 KPI cards with correct titles
- Shows formatted currency for monthly rent
- Shows occupancy percentage
- Shows open maintenance count
- Shows late rent count
- Handles zero values gracefully
- Renders high-priority count badge when > 0
- Renders active lease count

**2. portfolio-section.test.tsx** (target: 6 tests)
- Renders property list when properties exist
- Shows EmptyState when no properties
- Shows property name and address for each property
- Renders edit/delete controls when `showControls=true`
- Hides edit/delete controls when `showControls=false`
- Handles single property correctly

**3. units-section.test.tsx** (target: 6 tests)
- Renders unit list when units exist
- Shows EmptyState when no units
- Shows unit number and property name
- Shows tenant name when assigned
- Shows "Vacant" when no tenant
- Renders edit/delete controls conditionally

**4. leases-section.test.tsx** (target: 8 tests)
- Renders lease list when leases exist
- Shows EmptyState when no leases
- Shows lease dates (start, end)
- Shows monthly rent amount
- Shows active/expired/terminated status badge
- Shows tenant name
- Renders renew/terminate controls conditionally
- Handles rent increase history display

**5. maintenance-section.test.tsx** (target: 8 tests)
- Renders ticket list when tickets exist
- Shows EmptyState when no tickets
- Shows ticket title and description
- Shows status badge with correct color
- Shows priority badge
- Renders status update controls when `showControls=true`
- Renders vendor assignment when `vendorWorkflowEnabled=true`
- Shows comment thread toggle

**6. notifications-section.test.tsx** (target: 6 tests)
- Renders notification list when notifications exist
- Shows EmptyState when no notifications
- Shows notification title and body
- Shows unread indicator for unread notifications
- Renders "Mark as read" button for unread
- Renders "Mark all read" button when `onMarkAllRead` provided

**7. payments-section.test.tsx** (target: 5 tests)
- Renders payment list when payments exist
- Shows EmptyState when no payments
- Shows formatted payment amount
- Shows payment method and date
- Shows receipt link

**8. empty-state.test.tsx** (target: 8 tests)
- Renders with default InboxIcon when no icon provided
- Renders custom icon when provided
- Shows title when provided
- Shows message text
- Shows description text (falls back from message)
- Renders action button when `actionLabel` and `onAction` provided
- Does not render action button when only `actionLabel` provided (no `onAction`)
- Renders DomMascot when `showDom=true`

**9. connect-banner.test.tsx** (target: 4 tests)
- Shows "Connect Stripe" banner when `connected=false`
- Does not render when `connected=true`
- Renders correct message for owner role
- Renders correct message for manager role

**10. autopay-card.test.tsx** (target: 6 tests)
- Shows "Autopay Active" when enrolled and enabled
- Shows card last4 and brand
- Shows "Disable" button when active
- Shows "Autopay Paused" when enrolled but disabled
- Shows "Enable Autopay" when not enrolled
- Renders nothing when no lease data

### Part B: Shared Component Tests

**11. submit-button.test.tsx** (target: 4 tests)
- Renders button with label
- Shows loading spinner when pending
- Disables button when pending
- Accepts custom className

**12. data-row.test.tsx** (target: 4 tests)
- Renders label and value
- Renders with custom className
- Handles empty value
- Renders children as value

**13. modal-overlay.test.tsx** (target: 5 tests)
- Renders children when `open=true`
- Does not render children when `open=false`
- Applies blur backdrop
- Calls `onClose` when backdrop clicked (if provided)
- Calls `onClose` on Escape key (if provided)

### Part C: Server Action Tests

**14. auth-helpers.test.ts** (target: 6 tests)
- `requireAuth` returns user and role for authenticated user
- `requireAuth` redirects to `/login` when not authenticated
- `requireAuth` redirects to role home when role not in allowed list
- `requireAuth` accepts single role
- `requireAuth` accepts multiple roles
- Returns supabase client instance

**15. charges.test.ts** (target: 8 tests)
- `createCheckoutForCharge` returns error for missing chargeId
- `createCheckoutForCharge` returns error for paid charge
- `createCheckoutForCharge` returns error for missing lease
- `createCheckoutForCharge` rate limits after 20 requests
- `recordManualPayment` returns error for invalid amount
- `recordManualPayment` returns error for paid charge
- `recordManualPayment` returns error for unauthorized user
- `recordManualPayment` returns success for valid payment

**16. properties.test.ts** (target: 6 tests)
- `createProperty` returns error for empty name
- `createProperty` returns error for unauthorized role
- `createProperty` rate limits
- `updateProperty` returns error for missing property
- `deleteProperty` returns error for unauthorized user
- `deleteProperty` returns error for property with units

### Part D: Utility Tests

**17. notifications.test.ts** (target: 6 tests)
- `createNotificationWithDelivery` creates notification record
- `createNotificationWithDelivery` handles missing email gracefully
- `notifyOwnerMembersForProperty` sends to all members
- `notifyOwnerMembersForProperty` handles no members
- Notification type validation
- Handles Supabase errors without throwing

**18. property-access.test.ts** (target: 6 tests)
- `canUserAdministerProperty` returns true for property owner
- `canUserAdministerProperty` returns true for property manager
- `canUserAdministerProperty` returns false for unrelated user
- `canUserAdministerProperty` returns false for tenant
- `canUserViewProperty` returns true for tenant on lease
- `canUserViewProperty` returns false for unrelated user

### Mocking Guidelines

**Supabase client mock** — Use a chainable mock pattern:
```ts
const mockSelect = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
  }),
  in: vi.fn().mockResolvedValue({ data: [], error: null })
});

const mockSupabase = {
  from: vi.fn().mockReturnValue({
    select: mockSelect,
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null })
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null })
    })
  }),
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "test-user-id", email: "test@example.com" } },
      error: null
    })
  }
};
```

**No real API calls.** All external dependencies must be mocked.

**No `@typescript-eslint/no-explicit-any` violations.** Use proper types for all mocks. Use `as unknown as SpecificType` pattern if needed.

## Validation Commands

```bash
# Gate — must pass with ALL new tests included
npm run gate:web

# Quick test-only run
cd apps/web && npx vitest run

# Count tests
cd apps/web && npx vitest run 2>&1 | grep "Tests"
```

## Acceptance Criteria

1. All 18 new test files exist in correct directories
2. Minimum 110 new tests across all files (target: ~120)
3. `npm run gate:web` passes with all tests
4. No TypeScript errors (no `any` types)
5. No lint errors
6. Build still succeeds
7. All new tests follow existing patterns (vitest + RTL)
8. All Supabase/external calls are mocked (no real API calls)
9. Total test count: 500+ (390 existing + 110+ new)
10. All existing 390 tests still pass (no regressions)

## Report Format

```
gate_pass: YES | NO
test_count: <N>/<N> (was 390)
new_test_files: <N>
new_test_count: <N>
lint_clean: YES | NO
typecheck_clean: YES | NO
build_clean: YES | NO
files_created: <N>
```

## Constraints

- Do NOT modify any source files — ONLY create test files
- Do NOT apply database migrations
- Do NOT deploy to Vercel
- Do NOT modify `CLAUDE.md` or `AGENTS.md`
- Do NOT add new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Sprint 24 (onboarding polish) may be running concurrently — this sprint touches ZERO overlapping files since all work is in `__tests__/` directories
