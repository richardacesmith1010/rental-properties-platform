# Sprint 191 — Code health part 5: split tenant page + payment row (L2: pure move) · Category 12: Code health

## 1. Objective
Bring the 2 remaining non-money oversized files to ≤ 500 lines with **zero behaviour change**, by moving code verbatim:

| File | Lines | Non-whitespace chars | Max line | Kind |
|---|---|---|---|---|
| `apps/web/app/tenant/page.tsx` | 511 | 16,165 | 131 | async Server Component page (auth, redirects, data) |
| `apps/web/components/dashboard/charge-row.tsx` | 502 | 12,451 | 190 | `"use client"` payment row + "more" menu + manual payment form |

Total non-whitespace: **28,616**.

## 2. Context
- Branch `main`, HEAD `e3b6339` or a later docs-only commit. Next 15.5, React 19, Vitest + Testing Library.
- Sprints 185–190 split 24 files under these rules and passed. L-015: one refactor crammed code onto huge lines and was rejected. §6 shape rules are hard gates.
- `app/tenant/page.tsx` is a Next.js page file: it may only export `default`, `dynamic` and other Next page config. Helpers must live in a separate module, not be exported from the page.
- `charge-row.tsx` importers: `components/dashboard/charges/charges-implementation.tsx`, `charges/types.ts`, `charges/helpers.tsx`, `owner-daily-ops-home.tsx`, and `components/__tests__/charge-row.test.tsx` (3 cases). Its exports today: `ChargeStatus`, `ChargeRowData`, `getChargeLabel`, `ManualPaymentForm`, `ChargeRow`.
- Lines over 140 chars in `charge-row.tsx` today: 154, 162, 176, 190, 206, 234, 240, 297, 391, 393 (mostly long `className` strings and conditionals).

## 3. In scope
1. **Lock rendered output first (before moving any code).** Add `apps/web/components/__tests__/charge-row-snapshot.test.tsx` and run it on the **unmodified** code. After that run, do not change its contents. It renders `ChargeRow` with fixed data for each status (`pending`, `paid`, `late`, `waived`), with and without owner controls (whatever props switch the Remind / Mark paid / more-menu buttons on), opens the "more" menu once, and opens the manual payment form once (`ManualPaymentForm`). Assert `container.innerHTML` with `toMatchInlineSnapshot()` or a committed `__snapshots__` file. Also assert `getChargeLabel` for each status/type it handles. It must pass unchanged after the move.
2. **`charge-row.tsx`:** move `ChargeMoreMenu` verbatim into `apps/web/components/dashboard/charge-more-menu.tsx` and `ManualPaymentForm` verbatim into `apps/web/components/dashboard/manual-payment-form.tsx` (both `"use client"`). If they need `statusLabel`, `ChargeRowProps` pieces or types, move or import them without duplicating code (types may move to whichever new file uses them and be imported back). `charge-row.tsx` keeps `ChargeRow` and re-exports **every** symbol it exports today (type exports stay `export type`), so no importer changes.
3. **`app/tenant/page.tsx`:** move `TenantSection`, `tenantSectionLabel`, `parseSearchParam`, `isTenantSection` and `getTenantDisplayName` verbatim into `apps/web/app/tenant/tenant-page-helpers.ts` (add `export` only). The `TenantPage` body, `dynamic`, auth checks and redirects stay byte-identical; only imports change. Add `apps/web/app/tenant/__tests__/tenant-page-helpers.test.ts` covering `parseSearchParam` (string, array, empty array, undefined), `isTenantSection` (all 5 valid + "bad" + null) and `getTenantDisplayName` (nickname wins, trimmed; first name of full name; falls back to email; whitespace-only nickname).
4. **Long lines:** wrap every touched/new line to ≤ 140 chars. Rendered output must stay byte-identical (the snapshot proves it). For long `className` strings, keep the exact same final string (e.g. split into a `[...].join(" ")` only if the joined result is identical, or move the string to a named constant).

## 4. Out of scope
- Any logic, copy, styling, auth/redirect, query or behaviour change; any rename.
- The money/deletion files (`stripe-webhook-handlers.ts`, `account-wipe.ts`, `ownership.ts`, `stripe-connect.ts`).
- Editing importers of these files. Existing tests: only import-path fixes if needed — list each.
- Deploy, commit, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/app/tenant/page.tsx`, `apps/web/components/dashboard/charge-row.tsx`.
- New: `apps/web/app/tenant/tenant-page-helpers.ts`, `apps/web/components/dashboard/charge-more-menu.tsx`, `apps/web/components/dashboard/manual-payment-form.tsx`.
- New tests: `apps/web/components/__tests__/charge-row-snapshot.test.tsx` (+ `__snapshots__` file if used), `apps/web/app/tenant/__tests__/tenant-page-helpers.test.ts`.

## 6. Implementation requirements (hard gates, L-015)
- Every touched or new **source** file ≤ 500 lines, each line ≤ 140 characters.
- **Character budget:** total non-whitespace of the 2 originals + 3 new source files (tests excluded) within **25,754–31,478** (±10% of 28,616).
- No compaction, no deleted comments, no minified code, no `eslint-disable`, no new dependencies.
- Moved functions are byte-identical except an added `export` and the line wraps in §3.4.
- The user should never need to read instructions to complete this flow (no UI change is expected at all).

## 7. Validation commands to run
- Before moving code: run `charge-row-snapshot.test.tsx` on the unmodified code; report its pass count and `git status` at that moment.
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npm run test --workspace @domus/web -- --run components/__tests__/charge-row.test.tsx components/__tests__/charge-row-snapshot.test.tsx app/tenant/__tests__/tenant-page-helpers.test.ts`
- Every other test file importing a changed file (find with `grep -rlE "charge-row|tenant/page" apps/web --include=*.test.ts --include=*.test.tsx`).
- `npm run build --workspace @domus/web`
- Report per source file: lines, max line length, non-whitespace chars; and the total vs. 28,616.

## 8. Acceptance criteria (binary)
1. All 5 source files ≤ 500 lines, max line ≤ 140; total non-whitespace within 25,754–31,478.
2. `charge-row.tsx` exports exactly: `ChargeStatus` (type), `ChargeRowData` (type), `getChargeLabel`, `ManualPaymentForm`, `ChargeRow`. `app/tenant/page.tsx` exports exactly `dynamic` and the default `TenantPage`.
3. The snapshot test passed on the unmodified code and passes unchanged after; the helper tests cover every case in §3.3 with real assertions.
4. Lint, typecheck, the §7 tests and build pass. Only §5 paths changed.

## 8b. Post-deploy verification (Claude only; not part of Codex completion)
- Full gate; smoke owner Rent screen (rows, Remind / Mark paid / more menu opened, manual payment form opened, not submitted) and smoke tenant Home + Rent, light and dark, 0 console errors; smoke specs pass; Sentry clean; CI green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, plus the metrics table, the export lists and the before-refactor test run. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`. Do not "fix" anything you notice; list it instead.
