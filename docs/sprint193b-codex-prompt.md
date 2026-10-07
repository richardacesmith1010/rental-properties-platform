# Sprint 193b — Plain success text for "I paid this" (L1: copy only) · Category 2: Tenant experience

## 1. Objective
Since Sprint 193 the tenant's rent card shows the action's own success `message`. On a normal first report that message is still the old wording "Manual payment request sent to your landlord for confirmation." (seen live 2026-10-07). It must read the same as everywhere else in this flow: `Sent. Your landlord will check and mark it paid.`

## 2. Context
- Branch `main`, HEAD `4f9a22d` or a later docs-only commit.
- `apps/web/app/actions/inbox-manual-payment.ts`: line ~195 (`threadUpdateError` branch) returns "Manual payment request sent, but the conversation activity timestamp is catching up."; line ~201 returns "Manual payment request sent to your landlord for confirmation."
- `apps/web/app/actions/__tests__/inbox-manual-payment.test.ts` line ~176 asserts the old text.
- `apps/web/components/dashboard/pay-rent-card.tsx` line ~373 has the fallback "Manual payment request sent for owner confirmation." (online-pay flow; only shown if the action returns no message).

## 3. In scope
1. In `inbox-manual-payment.ts`, both success returns (line ~195 and ~201) return `message: "Sent. Your landlord will check and mark it paid."`. Nothing else in the file changes.
2. In `pay-rent-card.tsx`, change only that fallback string to `Sent. Your landlord will check and mark it paid.`.
3. Update the test at line ~176 to the new text, and add one assertion in that file that the `threadUpdateError` path also returns the new text (if the test helper can simulate a `touchInboxThread` error; if not, say so and skip).

## 4. Out of scope
Any logic, other copy, other files. Deploy, commit, `.claude/launch.json`, `docs/`.

## 5. Exact files expected to change
- `apps/web/app/actions/inbox-manual-payment.ts`
- `apps/web/components/dashboard/pay-rent-card.tsx`
- `apps/web/app/actions/__tests__/inbox-manual-payment.test.ts`

## 6. Implementation requirements
Exact copy; lines ≤ 140 characters; no new dependencies. The user should never need to read instructions to complete this flow.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npm run test --workspace @domus/web -- --run app/actions/__tests__/inbox-manual-payment.test.ts app/actions/__tests__/inbox.test.ts components/__tests__/tenant-rent-card.test.tsx components/__tests__/pay-rent-card.test.tsx` (skip a file only if it does not exist; say so)
- `grep -rn "Manual payment request sent" apps/web/app apps/web/components apps/web/lib` returns nothing.

## 8. Acceptance criteria (binary)
1. Both action success messages and the pay-rent-card fallback read exactly `Sent. Your landlord will check and mark it paid.`
2. The grep in §7 returns nothing; tests, lint and typecheck pass; only §5 files changed.

## 8b. Post-deploy verification (Claude only)
Smoke tenant reports the October month → the row shows `Sent. Your landlord will check and mark it paid.`; reload → `Sent Oct 7. …`; DB has one October message; owner row shows the badge. 0 console errors.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`.
