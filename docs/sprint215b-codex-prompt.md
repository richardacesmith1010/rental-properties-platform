# Sprint 215b — fix the owner phone smoke-test locator (L1, test-only)

## 1. Objective
`tests/e2e/smoke-theme.spec.ts` "Owner theme views have no severe contrast findings" times out at the phone viewport (390×844). After it opens **More** (`nav[aria-label="Owner shortcuts"]` → More), `openDashboardSection` resolves `getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /^Leases/ }).first()`.

There are **two** "Main navigation" navs: the hidden desktop sidebar (not visible on phones) and the drawer (inside `[role=dialog]`). `.first()` picks the hidden one.

Claude checked by hand in production: in the drawer, Leases is visible and stable, and clicking it goes to `?section=leases`. The app is fine; only the test is wrong.

## 2. Context
HEAD `608fab7`. Only `apps/web/tests/e2e/smoke-theme.spec.ts` `openDashboardSection` (~lines 188–235).

## 3. In scope
- When the drawer is open (after clicking More, or when "Open navigation menu" was used), scope the item lookup to the **visible** navigation: `page.getByRole("dialog").getByRole("navigation", { name: "Main navigation" })`, or use Playwright's `.filter({ visible: true })`.
- Scroll the item into view before clicking.
- At desktop width, keep using the sidebar.
- Apply the same fix to the manager and tenant branches if they use the same pattern.

## 4. Out of scope
App code and any other test.

## 5. Exact files expected to change
`apps/web/tests/e2e/smoke-theme.spec.ts`

## 6. Implementation requirements
Lines ≤ 140.

## 7. Validation commands to run
`npm run lint:web`. (Claude runs the live smoke test; you don't have the credentials.)

## 8. Acceptance criteria (binary)
1. The lookup picks a visible button in the drawer at the phone width.
2. Lint passes.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, deploy, commit or push. Don't run `gate:web`.
