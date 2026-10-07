# Sprint 192 — Tenant "I paid this" when online pay is off (L2) · Category 2: Tenant experience

## 1. Objective
When online pay is off (`payState === "not_ready"`) or the lease is paid outside Domus (`"outside"`), the tenant's rent card says "Online pay isn't on yet … Pay them the way you usually do" and offers **no way to tell the landlord they paid**. A working server action for this already exists (`requestManualPaymentConfirmation`), but it is only reachable inside the online-pay flow. Expose it on the rent card for those two states, one button per unpaid month, and make the owner-facing message plain.

## 2. Context
- Branch `main`, HEAD `1636a89` or a later docs-only commit. Next 15.5, React 19 (`useFormState` from `react-dom`, as used in `pay-rent-card.tsx`), Vitest + Testing Library.
- `apps/web/components/dashboard/tenant-rent-card.tsx` (109 lines, `"use client"`). It is rendered on tenant Home (via `tenant-overview.tsx`) and tenant Rent (`app/tenant/page.tsx`), and already receives `onRequestManualPaymentConfirmation: StatefulAction` and `charges: TenantCharge[]` (each has `id`, `dueDate`, `amountCents`, `status`). It already computes `unpaidCharges` (status `pending` or `late`). Line 102 renders the `not_ready` box; line 103 the `outside` box.
- `apps/web/app/actions/inbox-manual-payment.ts` → `requestManualPaymentConfirmation(prev, formData)` takes `chargeId`. It checks the tenant role, rate limit, that the charge is open and belongs to the tenant's lease, then posts an in-app message to the owner thread and (when notifications are on) notifies owners. **It never changes the rent record.** Notifications are deliberately OFF until launch (`DOMUS_NOTIFICATIONS_ENABLED`); do not change that.
- Tests: `components/__tests__/tenant-rent-card.test.tsx` (7 cases), `app/actions/__tests__/inbox.test.ts` (covers this action).
- Plain-language rules: `docs/plain-language.md`; a test guard enforces banned words ("charge", "submit", …) in user-facing strings.

## 3. In scope
1. **Rent card (`tenant-rent-card.tsx`).** When `payState` is `"not_ready"` or `"outside"` **and** there is at least one unpaid month, under the existing box text render:
   - a line: `Already paid? Tell your landlord.`
   - one row per unpaid month, oldest first: `{Mon D} rent · {amount}` (reuse `monthDay` and `formatCurrency`) and a small outline button **`I paid this`** that posts `chargeId` to `onRequestManualPaymentConfirmation` (a `<form>` with a hidden `chargeId` input and the repo's `SubmitButton`, so it shows pending state; one `useFormState` per row, e.g. a small `ReportPaidRow` component in the same file).
   - after success, replace that row's button with: `Sent. Your landlord will check and mark it paid.` (`text-[var(--pos)]`).
   - on error, show the returned `error` under the row (`text-[var(--crit)]`), button stays.
   - Button `title`: `Tell your landlord you paid this month.` Min touch height 44 px (`min-h-11`).
   - Keep the existing `not_ready` and `outside` box text exactly. No change to any other `payState`.
2. **Owner message copy (`inbox-manual-payment.ts`).** Change only the message body to:
   `` `${tenantName} says they paid ${formatCurrency(charge.amount_cents)} for ${locationLabel}. ` `` + `` `Rent due ${formatDate(charge.due_date)}. Please check, then mark it paid in Rent.` ``
   and the notification `title` to `Tenant says rent is paid`. **Do not change the thread `subject`** (it is used to find the existing thread). Do not change success/error return strings, checks, or anything else.
3. **Tests.**
   - `tenant-rent-card.test.tsx`: (a) `not_ready` with 2 unpaid months → 2 rows, oldest first, each with an `I paid this` button; (b) clicking one calls the action with `FormData` whose `chargeId` is that month's id, and after a success result that row shows the success text while the other row still has its button; (c) an error result shows the error text and keeps the button; (d) `outside` also shows the rows; (e) `can_pay`, `paid`, `not_posted` and `no_lease` show **no** `I paid this` button; (f) `not_ready` with zero unpaid months shows no `Already paid?` line. Keep the 7 existing cases green.
   - `inbox.test.ts`: update any assertion on the old body/title to the new text, and add one assertion that the inserted message body equals the new text exactly. Existing access/closed-charge tests stay unchanged.

## 4. Out of scope
- Any DB/schema change; marking rent paid from the tenant side; owner Rent screen changes; duplicate-request detection (a tenant may report the same month again after a reload; acceptable for now).
- The online-pay flow (`pay-rent-card.tsx`), `charge-row.tsx`, notifications switch, email templates.
- Deploy, commit, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/components/dashboard/tenant-rent-card.tsx`
- `apps/web/app/actions/inbox-manual-payment.ts`
- `apps/web/components/__tests__/tenant-rent-card.test.tsx`
- `apps/web/app/actions/__tests__/inbox.test.ts`

## 6. Implementation requirements
- Use the exact copy in §3; do not invent other wording. Sentences ≤ 12 words; no banned words.
- New/touched lines ≤ 140 characters; files ≤ 500 lines.
- No new dependencies, no `eslint-disable`.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npm run test --workspace @domus/web -- --run components/__tests__/tenant-rent-card.test.tsx app/actions/__tests__/inbox.test.ts components/__tests__/tenant-overview.test.tsx`
  (plus any other test importing `tenant-rent-card` or `inbox-manual-payment`: `grep -rlE "tenant-rent-card|inbox-manual-payment" apps/web --include=*.test.ts --include=*.test.tsx`; skip a listed file only if it does not exist, and say so)
- The plain-language guard test (find it with `grep -rl "banned" apps/web --include=*.test.ts`).

## 8. Acceptance criteria (binary)
1. In `not_ready` and `outside` with unpaid months, each unpaid month has an `I paid this` button that sends its own `chargeId`; success and error states render per row as specified.
2. No `I paid this` button in any other pay state; zero unpaid months → no prompt.
3. Owner message body and notification title match §3.2 exactly; subject unchanged; nothing else in the action changed.
4. Every case in §3.3 exists as a real assertion against the component/action (no tautologies); existing tests pass; lint, typecheck and plain-language guard pass. Only §5 files changed.

## 8b. Post-deploy verification (Claude only; not part of Codex completion)
- Smoke tenant (online pay off): Home and Rent show the rows in light and dark at 1280 px and 375 px; Claude clicks `I paid this` once on one month and confirms the success text, then confirms the smoke owner's Messages shows the new message text and the rent row is still unpaid. 0 console errors; smoke specs; Sentry clean; CI green.

## 9. Report format
JSON per `docs/codex-report-schema.json`. List new test names. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`. Do not turn notifications on.
