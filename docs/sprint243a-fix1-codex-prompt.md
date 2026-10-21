# Sprint 243a-fix1 — Update two UTC-pinned tests to Mountain time (L1)

## 1. Objective
Sprint 243a (uncommitted in the working tree — keep it) made instants display in America/Denver. Three expectations in
two test files still pin UTC output. Update only those expectations so `npm run gate:web` is green.

## 2. Context
- HEAD `8849856` plus the uncommitted 243a working tree (`lib/format.ts` etc.). Do not change any 243a file.
- Failing: `apps/web/lib/__tests__/hydration-safety.test.tsx` lines 113–114 (`Mar 13, 2026, 11:45 AM` → `5:45 AM`),
  line 131 test name says "UTC-pinned", line 140 (`Mar 13, 6:45 PM` → `12:45 PM`); and
  `apps/web/lib/__tests__/__snapshots__/pdf-data-snapshot.test.ts.snap` (`generatedAt` `Oct 7, 2026, 6:30 PM` →
  `12:30 PM`; `paidDate` `Oct 7, 2026, 5:00 PM` → `11:00 AM`).

## 3. In scope
Those expectations, the test name at line 131 ("UTC-pinned" → "Denver"), and the snapshot values.

## 4. Out of scope
Any source file. Any other test or snapshot entry.

## 5. Exact files expected to change
- `apps/web/lib/__tests__/hydration-safety.test.tsx`
- `apps/web/lib/__tests__/__snapshots__/pdf-data-snapshot.test.ts.snap`

## 6. Implementation requirements
1. Edit the hydration-safety strings by hand to the Denver values above.
2. Update the snapshot with `npx vitest run lib/__tests__/pdf-data-snapshot.test.ts -u`, then confirm with `git diff` that
   only the 5 time strings changed (3 `generatedAt`, 2 `paidDate`). If anything else changed, revert and report.

## 7. Validation
```
cd apps/web
npx vitest run lib/__tests__/hydration-safety.test.tsx lib/__tests__/pdf-data-snapshot.test.ts
npm run gate:web
```

## 8. Acceptance criteria
- C1 hydration-safety tests assert `Mar 13, 2026, 5:45 AM` (title and span) and `Mar 13, 12:45 PM`, and pass.
- C2 the snapshot diff is exactly the 5 time strings listed in §2.
- C3 `npm run gate:web` passes (report test counts verbatim).

## 9. Report format
Compact status only: files changed, C1–C3 results, gate counts. Do NOT include 'Claude prompt' or 'recommended next
steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow (no UI change here).
