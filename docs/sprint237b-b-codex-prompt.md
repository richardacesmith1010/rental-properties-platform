# Sprint 237b-b — M8 copy follow-ups (L1, copy only)

## 1. Objective
Finish the M8 plain-language sweep from Sprint 237b (uncommitted in the working tree; keep all of it). Copy-only edits.

## 2. Context
HEAD `f01e49e` + uncommitted 237b work. Review found one broken e2e expectation, two missed strings, and awkward copy.

## 3. In scope
Exactly the strings below.

## 4. Out of scope
Logic, identifiers, notification types, values, routes. Any other copy.

## 5. Exact files expected to change
1. `apps/web/tests/e2e/settings.spec.ts` (line ~26: expect `Repair updates`, not `Maintenance ticket updates`)
2. `apps/web/app/actions/maintenance-queries.ts` (l.119 `Ticket not found.` → `Repair not found.`)
3. `apps/web/lib/assets.ts` (l.265 `Failed to access document packet files.` → `We could not open these papers.`)
4. `apps/web/app/actions/inbox.ts` (l.278, l.386 → `Message sent. It may take a moment to show.`)
5. `apps/web/components/dashboard/ticket-vendor-control.tsx` (l.40 → `Pick who will fix this.`)
6. `apps/web/components/dashboard/tenant-documents-section.tsx` (l.168 → `Open this paper.`)
7. `apps/web/app/actions/document-packets.ts` (l.130 → `We could not add the signer.`; l.235 → `Signed, but we could not finish the papers.`)
8. `apps/web/components/dashboard/leasing-hub-section.tsx` (l.117 → `Send the lease papers to sign.`)
9. Any unit test that asserts one of these exact old strings (update the expected string only).

## 6. Implementation requirements
Replace exactly as listed. If a listed line number moved, find the same old string. Lines ≤ 140. Plain-language guard
must stay green with zero new exceptions.

## 7. Validation commands
```
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web`. Do not commit.

## 8. Acceptance criteria
1. `/usr/bin/grep -rn "Maintenance ticket updates\|Ticket not found\|document packet files\|activity timestamp\|maintenance repair\|document paper file\|person who signs\|could not be finalized\|signature workflow" apps/web --include=*.ts --include=*.tsx` returns nothing.
2. Full suite and plain-language guard green.

## 9. Report format
Compact status only: files changed and command results. Do NOT include "Claude prompt" or "recommended next steps for
Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies.
