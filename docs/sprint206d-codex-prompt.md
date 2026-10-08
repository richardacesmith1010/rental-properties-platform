# Sprint 206d — Fix the client page header and add the missing 206c tests (L1)

## 1. Objective
Review of Sprint 206c (uncommitted in the working tree; keep all of it) found 2 problems:
- `components/dashboard/clients/client-detail.tsx` renders `<MobileTopBar userEmail="Manager" role="manager" items={[]} onSignOut={async () => {}} />`. That gives an empty menu and a **sign-out button that does nothing**, which is not allowed.
- 5 required tests are missing.

## 2. Context
`/manager/properties/[propertyId]` has no app shell either (`PropertyDetailView`). The client page should match that simple style.

## 3. In scope
1. **Header.** In `client-detail.tsx`, remove `MobileTopBar` and its import. Add a slim header:
   - `<header>` containing a link to `/manager` labeled `Domus` with an `aria-label` of `Go to home`, and the existing `‹ Clients` back link to `/manager?section=clients`;
   - min height 56 px, bottom border `var(--line)`, background `var(--surface)`, tap targets ≥ 44 px;
   - no menu and no sign-out.

   Keep the existing `‹ Clients` link only once (move it into the header).
2. **Add real tests** (in `components/__tests__/manager-clients.test.tsx`, `components/__tests__/unified-property-wizard.test.tsx`, or a new `components/__tests__/client-page-shell.test.tsx`):
   1. On the `clients` section, the manager page header shows one `Add client` button and no `Add` menu, and clicking it opens the Add client sheet. Render via the component that owns the header in `components/dashboard/index.tsx`, or test the extracted piece if it was extracted.
   2. `PropertyScopeControl` (via `SectionFrame`) renders no `All homes` select when `activeSection === "clients"`, and still renders it for an owner on `charges` with properties.
   3. An empty client page (`ClientDetail` with `homes: []`) has exactly one `Add a home` button; with 1 home, it has exactly one in the header row.
   4. `ClientDetail` renders the header with a `Clients` link to `/manager?section=clients` and a `Go to home` link to `/manager`, and renders no `Sign out` button.
   5. The wizard success view opened with `returnToClientHref` shows `Back to client` (not `Go to Dashboard`), and clicking it navigates to that href. Without the prop, it still shows `Go to Dashboard`.

## 4. Out of scope
Anything else.

## 5. Exact files expected to change
`apps/web/components/dashboard/clients/client-detail.tsx` and the test files named above.

## 6. Implementation requirements
Theme tokens only. Lines ≤ 140. Plain-language guard passes.

## 7. Validation commands to run
- The changed test files
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `lib/__tests__/plain-language.test.ts`

## 8. Acceptance criteria (binary)
- No `MobileTopBar` in `client-detail.tsx`.
- All 5 tests exist with real assertions that render the real components, and they pass.
- Lint and typecheck pass.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, deploy, commit or push. Never touch `.claude/launch.json`.
