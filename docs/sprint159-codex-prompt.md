# Sprint 159 — Manager clarity 2/2: owner-style Rent page and Home for managers

**Severity: L2** (manager UI/display only; reuses existing actions; no auth, money-movement, schema, or server-rule changes). Model: gpt-reserve, medium.

## 1. Objective
Give managers the owner Rent page (Sprint 155/156) and owner-style Home ("Needs you today" + tiles) so both roles see the same simple screens. One run: read §2 and §3 carefully — the owner invariants in §3.4 must hold.

## 2. Context
- Branch `main`, HEAD `200112a` or later docs-only. Paths under `apps/web/`. Sprint 158 gave managers the grouped menu, Add button, URL-tracked sections and the Home bank card.
- **Rent:** `components/dashboard/section-renderer.tsx:100` passes `isOwnerView={props.data.profileRole === "owner"}` to `components/dashboard/charges-section.tsx`; owner-only behaviour keys off `isOwnerView` there (default filter `:159`, batch-actions rule `:174`, help + inline bank line `:385-392`, filters `ChargeSectionFilters isOwnerView` `:430`, row `ownerView` `:527`) and in `components/dashboard/charge-row.tsx` (`ownerView`, e.g. Message moved into ⋯ at `:333`) and `components/dashboard/charge-section-controls.tsx`. The manager still sees the old view: "Generate This Month Charges", All/Pending/Late/Paid/Waived, "Record", summary pills, batch select.
- **Home:** owner Home is `components/dashboard/owner-daily-ops-home.tsx` (props built from an `OwnerHomeSummary`: `lateCharges`, `openRepairCount`, `newMessageCount`, `collectedCents`, `dueCents`, `homeCount`, `rentedHomeCount`, `nextDueDate`, `nextDueAmountCents`, `nextDueTenantCount`; grouping in `LateRentGroup`), selected in `components/dashboard/index.tsx` via `isOwnerDailyOpsHomePage` (`isOwnerRole && activeSection === "overview"`). Manager Home is `components/dashboard/manager-dashboard.tsx` ("Your Tasks" list with "View Charge"), mounted from `components/dashboard/section-renderer-support.tsx:237`. Summary data comes from `components/dashboard/dashboard-home-loader.ts`.

## 3. In scope
1. **Rent for managers:** replace the role check with a "simple rent view" flag that is true for owners AND managers (e.g. `simpleRentView={role === "owner" || role === "manager"}`), so managers get exactly the owner Rent page: Late / Due soon / Paid / All (default Late if any), Remind · Mark paid · ⋯ (Message inside ⋯), one help sentence "Rent is added each month from your leases.", primary "Mark rent as paid" + secondary "Add a one-time fee", no summary pills, no batch select. Remove the manager "Generate This Month Charges" button (rent is created daily by `/api/cron/generate-charges`); leave the `/manager/generate` route in place. The inline "Tenants can’t pay online until your bank is connected." line stays **owner-only** (managers don't collect rent — their bank card is about fees).
2. **Home for managers:** render the owner Home layout for managers at `overview`: greeting + summary line, the existing manager bank card (Sprint 158), "Needs you today" (late rent grouped per tenant + lease with Send reminder / Mark as paid, open repairs, new messages), and three tiles — Rent this month, **Homes you manage** ("N" + "X of N rented"), Next rent due. No "More numbers" section for managers. Build the manager summary with the same loader functions from data the manager page already has (no new queries unless unavoidable — say why). Replace `ManagerDashboard` at `overview`; delete `manager-dashboard.tsx` only if a whole-tree grep proves zero remaining importers (L-006).
3. Copy: plain words, ≤12 words per sentence (CLAUDE.md §18).
4. **Owner invariants (must not change — tests must prove it):** owner Rent output (incl. the owner inline bank line), owner Home output (incl. "More numbers"), owner Add menu (3 items), owner URL/section behaviour and section cache. Existing owner tests must pass **unmodified**. Manager URL tracking from Sprint 158 (`?section=` written on switch, kept after reload/refresh) must keep working.

## 4. Out of scope
- Tenant screens; server actions/queries semantics; payments; schema; auth; the section cache/preload for managers; emails/PDFs.
- Do NOT modify or revert any file not listed in §5 — including `.claude/launch.json` or anything you did not create in this sprint, even if `git status` shows it modified.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`components/dashboard/section-renderer.tsx`, `components/dashboard/charges-section.tsx`, `components/dashboard/charge-row.tsx`, `components/dashboard/charge-section-controls.tsx`, `components/dashboard/index.tsx`, `components/dashboard/owner-daily-ops-home.tsx`, `components/dashboard/dashboard-home-loader.ts`, `components/dashboard/section-renderer-support.tsx`, `components/dashboard/manager-dashboard.tsx` (delete if orphaned), `app/manager/page.tsx` (only if a prop must be passed), plus unit tests and any e2e spec asserting the removed manager UI (e.g. `tests/e2e/manager-flows.spec.ts`). ≤ 10 non-test files.

## 6. Implementation requirements
- Unit tests: manager Rent shows the owner-style filters/actions/buttons and no Generate button, no summary pills, no batch select, and **no** inline bank line; owner Rent unchanged (incl. inline bank line); manager Home shows greeting, bank card, grouped "Needs you today", the three tiles with "Homes you manage", and no "More numbers"; owner Home unchanged; manager section switch still writes `?section=` (existing Sprint 158 test still passes).
- Targeted validation only (Claude runs the full gate): the vitest files you touched/added, plus lint and typecheck.
- Tokens only; light + dark; 390 px and 1280 px; 44 px targets. The user should never need to read instructions to complete this flow; every step must be self-explanatory.
- No PII in logs. Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run lint:web
npx tsc -p apps/web/tsconfig.json --noEmit
cd apps/web && npx vitest run <the test files you touched or added> components/__tests__/owner-daily-ops-home.test.tsx components/__tests__/charges-section.test.tsx components/__tests__/dashboard-section-loaders.test.tsx
git diff --stat
```

## 8. Acceptance criteria (binary)
- Lint, typecheck and the targeted tests pass.
- Manager Rent and Home per §3.1–3.2; owner invariants §3.4 hold with owner tests unmodified.
- Only §5 files changed; nothing else modified or reverted.

## 9. Report format
Conform to `docs/codex-report-schema.json` (set `gate_passed` from the targeted checks and say so). `self_verification.findings`: the flag replacing `isOwnerView` and every place it is read, how the manager Home summary is built (data sources), whether `manager-dashboard.tsx` was deleted (zero-importer proof), and the owner tests run unmodified.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
