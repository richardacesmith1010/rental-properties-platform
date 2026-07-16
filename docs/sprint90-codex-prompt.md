# Sprint 90 — E2E Test Update

## 1. Objective

Fix all 17 failing E2E tests to match the new dashboard structure (action center, paginated layout, compact header on section pages) and add 4 new tests for recently shipped features. Target: 80+ tests passing, 0 failures.

## 2. Context

- **Branch:** main
- **HEAD:** 00446c0
- **Production URL:** https://domusbase.com
- **Supabase project ID:** vawqdqkaguhdgfhdebqw

**Why tests are failing:** Recent sprints changed the dashboard layout significantly:
- Home page now has an action center with action cards instead of a greeting heading
- Section pages (charges, portfolio, maintenance, leases, members) have a compact header with section title, not the old greeting + KPI pills layout
- Navigation uses paginated "X of Y" with arrow buttons instead of tabs or workflow mode switching
- Account switcher is now a combobox component
- These structural changes broke selectors and assertions in existing E2E tests

## 3. In Scope

- Fix all 17 currently failing E2E tests
- Update selectors and assertions to match new dashboard structure
- Add 4 new E2E tests for: LLC members page, feedback widget, action center, account switcher
- Ensure all tests use resilient selector patterns (data-testid, role, content presence — not exact text)

## 4. Out of Scope

- App code changes (this sprint only changes test files)
- Adding data-testid attributes to app components (if needed, note them in report and a follow-up sprint will add them)
- Database migrations
- Performance testing
- Visual regression testing

## 5. Exact Files Expected to Change

- `apps/web/e2e/*.spec.ts` (all failing test files — identify by running the test suite first)
- `apps/web/e2e/helpers/*.ts` (shared test helpers/selectors if they exist)
- `apps/web/e2e/fixtures/*.ts` (test fixtures if they exist)
- Potentially new files:
  - `apps/web/e2e/llc-members.spec.ts`
  - `apps/web/e2e/feedback-widget.spec.ts`
  - `apps/web/e2e/action-center.spec.ts`
  - `apps/web/e2e/account-switcher.spec.ts`

## 6. Implementation Requirements

### Step 1: Identify All Failing Tests

Run the full E2E suite first to get the exact list of failures:

```bash
npx playwright test --reporter=list 2>&1 | tail -50
```

Record which tests fail and categorize the failure reasons.

### Step 2: Fix Failing Tests — Common Patterns

Most failures will fall into these categories. Apply the correct fix pattern for each:

**Pattern A: Tests expecting greeting heading on section pages**
- Old: `expect(page.getByRole('heading', { name: /welcome|good morning|hello/i })).toBeVisible()`
- New: Check for the section title instead (e.g., "Charges", "Portfolio", "Maintenance")
- Fix: `expect(page.getByRole('heading', { name: /charges/i })).toBeVisible()`

**Pattern B: Tests expecting KPI pills on section pages**
- Old: `expect(page.getByText(/total revenue|occupancy rate/i)).toBeVisible()`
- New: KPI pills only appear on the Home page, not section pages
- Fix: Navigate to Home first if testing KPIs, or remove KPI assertions from section page tests

**Pattern C: Tests expecting workflow mode switching**
- Old: `page.getByRole('button', { name: /switch to.*mode/i }).click()`
- New: No workflow mode switching exists. Navigation is paginated.
- Fix: Use the paginated navigation: `page.getByRole('button', { name: /next|previous|arrow/i })`

**Pattern D: Tests expecting tab navigation**
- Old: `page.getByRole('tab', { name: /charges/i }).click()`
- New: Section pages are separate pages, navigated via sidebar
- Fix: Navigate via sidebar links: `page.getByRole('link', { name: /charges/i }).click()`

**Pattern E: Tests expecting old account switcher**
- Old: `page.getByRole('button', { name: /switch account/i }).click()`
- New: Account switcher is a combobox
- Fix: `page.getByRole('combobox').click()` then `page.getByRole('option', { name: /account name/i }).click()`

### Step 3: Resilient Selector Guidelines

All updated and new tests must follow these rules:

1. **Prefer `data-testid`** when available: `page.getByTestId('action-center')`
2. **Use role + accessible name** as second choice: `page.getByRole('button', { name: /pay rent/i })`
3. **Use `getByText` with regex** for content presence: `page.getByText(/no action items/i)`
4. **Never use exact string matching** for dynamic content
5. **Never use CSS selectors** for layout-dependent elements (`.grid > div:nth-child(2)`)
6. **Use `toBeVisible()` over `toBeInTheDocument()`** for UI assertions
7. **Add reasonable timeouts** for navigation: `await page.waitForURL(/\/owner\/charges/)`

### Step 4: Add 4 New Tests

**Test 1: LLC Members Page (`llc-members.spec.ts`)**
```
- Navigate to LLC members page
- Verify invite form is visible (email input + send button)
- Verify join code is displayed
- Verify existing members list renders (or empty state if none)
- Do NOT actually send invites (no side effects)
```

**Test 2: Feedback Widget (`feedback-widget.spec.ts`)**
```
- Verify feedback widget trigger button is visible on dashboard
- Click to open the feedback form
- Verify form fields are present (text area, optional email, submit button)
- Fill in feedback text
- Submit the form
- Verify success confirmation appears
```

**Test 3: Action Center (`action-center.spec.ts`)**
```
- Navigate to owner dashboard home page
- Verify action center section is visible
- Check for either action cards or "No action items" empty state
- If action cards exist, verify they have action buttons
- Verify action center heading text matches plain language ("What needs attention")
```

**Test 4: Account Switcher (`account-switcher.spec.ts`)**
```
- Verify account switcher combobox is visible in sidebar
- Click to open the dropdown
- Verify dropdown shows available accounts
- Select a different account (if multiple exist)
- Verify the dashboard context updates (URL or content change)
- If only one account, verify dropdown opens but only shows one option
```

### Step 5: Final Verification

After all fixes and new tests:

```bash
npx playwright test --reporter=list
```

Target: 80+ tests passing, 0 failures. If any test is flaky (passes sometimes, fails sometimes), mark it with `test.fixme()` and note it in the report.

## 7. Validation Commands to Run

```bash
npm run gate:web
npx playwright test --reporter=list
```

## 8. Acceptance Criteria

- [ ] All 17 previously failing E2E tests now pass
- [ ] 4 new E2E tests added and passing (LLC members, feedback widget, action center, account switcher)
- [ ] Total test count: 80+ passing, 0 failures
- [ ] All tests use resilient patterns (no exact text matching, no CSS layout selectors)
- [ ] No app code changes (test files only)
- [ ] `npm run gate:web` passes (lint, typecheck, build, tests)
- [ ] If any data-testid attributes are needed but missing from components, report them in the status (do NOT add them in this sprint)

## 9. Report Format

```
failing_tests_before: N
failing_tests_after: N
new_tests_added: 4
total_tests_passing: N
total_tests_failing: N
flaky_tests: [list or "none"]
missing_testids_needed: [list or "none"]
gate_passed: true/false
e2e_passed: true/false
files_changed: [list]
files_created: [list]
```

## 10. Constraints

- Do NOT deploy to production
- Do NOT edit CLAUDE.md or AGENTS.md
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change app source code (only test files)
- Do NOT change database schema or run migrations
- Do NOT add data-testid attributes to app components (report needed ones instead)
- If a test requires a data-testid that doesn't exist, use the best available alternative selector and note the needed testid in the report
- Report compact status only
