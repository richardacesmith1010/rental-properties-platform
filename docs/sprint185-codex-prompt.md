# Sprint 185 — Code health part 1: split 5 oversized non-money files (L2: pure refactor) · Category 12: Code health

## 1. Objective
25 source files in `apps/web` are over 500 lines. This batch splits the 5 largest files that do **not** touch money movement or data deletion, with **zero behaviour change**:

| File | Lines | Non-whitespace chars | Max line length today |
|---|---|---|---|
| `apps/web/app/actions/inbox.ts` (`"use server"`) | 859 | 20,837 | 202 |
| `apps/web/components/dashboard/unified-property-wizard.tsx` | 791 | 23,735 | 317 |
| `apps/web/components/dashboard/leases-section.tsx` | 738 | 19,089 | 225 |
| `apps/web/lib/maintenance.ts` | 657 | 15,255 | 135 |
| `apps/web/components/dashboard/inbox-section.tsx` | 593 | 19,598 | 728 |

After the sprint, every one of these files, and every new file created from them, is ≤ 500 lines.

## 2. Context
- Branch `main`, HEAD `fa23039` or a later docs/ci-only commit. Next 15.5.27, React 19.
- **L-015 history:** a previous refactor gamed the line limit by cramming code onto huge lines. It was rejected and reverted. The shape rules in §6 are hard gates.
- `lib/maintenance.ts` is imported widely (tests included). `app/actions/inbox.ts` is a server-actions module imported by client components and tests.
- Next.js rule: a `"use server"` file may export **only async functions**. Types, constants and sync helpers must live in non-`"use server"` modules.

## 3. In scope
1. **Split each file by cohesive responsibility.** For example: wizard steps or sub-components; leases table vs. dialogs vs. helpers; inbox query helpers vs. mutations; maintenance read vs. write vs. formatting.
   - Put new files next to the original or in a sibling folder, named for what they contain. For example `components/dashboard/property-wizard/*.tsx`, `components/dashboard/leases/*.tsx`, `lib/maintenance/*.ts`, `lib/inbox/*.ts`. Avoid generic names like `utils2`.
2. **Keep every existing import path working.**
   - The original module path must keep exporting every symbol it exports today, with identical names and signatures. For example, `lib/maintenance.ts` becomes a small module that re-exports from the new files.
   - For `app/actions/inbox.ts`: it stays `"use server"`. Exported server actions either stay defined in it, or move to new `"use server"` modules and are re-exported in a way `next build` accepts. Non-action helpers and types move to plain modules (for example `lib/inbox/*.ts`).
   - Server-only code must not end up in a client bundle. Client components (`"use client"`) keep the directive in every new client file that needs it.
   - **Do not edit importers** unless a re-export is technically impossible. In that case, list each importer you changed and why.
3. **Long lines:** break existing over-long lines, such as JSX `className` strings and long conditions, so every line in the touched/new files is ≤ 140 characters. **Rendered strings and class lists must stay byte-identical once joined.** Use template literals, array joins or JSX expression splits that produce the same string, or wrap attributes across lines. Do not rename or drop classes.

## 4. Out of scope
- Any logic, copy, styling, query or behaviour change; renames of exported symbols; new features.
- The other 20 oversized files (later batches), the money and deletion files (`stripe-webhook-handlers.ts`, `account-wipe.ts`, `charges.ts`, `charge-management.ts`, `stripe-connect.ts`, `distributions.ts`).
- Deploy, commit, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- The 5 files above.
- New files created from them, only under: `apps/web/components/dashboard/` (including new subfolders), `apps/web/lib/` (including `lib/maintenance/`, `lib/inbox/`), and `apps/web/app/actions/` (new `"use server"` modules only if needed).
- Tests: only import-path fixes if a test imported a now-moved private symbol. List each one. No test logic changes.

## 6. Implementation requirements (hard gates, L-015)
- Every touched or new file is ≤ 500 lines, with each line ≤ 140 characters.
- **Character budget:** the total non-whitespace characters of the 5 originals plus all new files is within ±10% of 98,514 (the sum of today's 5 files). Import and re-export boilerplate counts; stay inside the band.
- No compaction: no multiple statements per line, no deleting comments to save lines, no minified JSX.
- No behaviour change: the same exports, the same rendered output, the same server/client boundaries.
- No new dependencies. No `eslint-disable` added.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npm run gate:web` (includes `next build`, which validates `"use server"` / `"use client"` boundaries)
- Report, for each original file and each new file: lines, max line length and non-whitespace characters, plus the combined total vs. 98,514.

## 8. Acceptance criteria (binary)
1. All 5 originals and all new files are ≤ 500 lines, with max line length ≤ 140.
2. The combined non-whitespace total is within 88,663–108,365.
3. Every symbol exported by each original path before the sprint is still exported from that path. The report lists the before/after export names per file, and they must match exactly.
4. The full test suite passes (count ≥ 1,463) with no test logic changes. Lint, typecheck and build pass.
5. Only §5 paths changed.
6. **Claude, after deploy:**
   - a browser walk of owner Inbox (open a thread, send-box visible), the add-a-home wizard (open, step through, cancel) and the Leases section (list plus open the lease form) in light and dark mode, with no console errors;
   - 27/27 browser specs, Sentry clean, CI green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, plus the per-file metrics table and the export lists. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`. Do not "fix" anything you notice; list it in the report instead.
