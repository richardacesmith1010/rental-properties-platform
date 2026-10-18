# Sprint 240b — App Review walk fixes, round 2 (L2, web only)

## 1. Objective
Fix three phone-width problems Claude found on 2026-10-18 when re-walking the App Review demo after Sprint 240a.

## 2. Context
- HEAD: latest `main` (240a shipped `3e967f5`). Paths under `apps/web/`.
- **Receipt header** `app/payments/receipt/[chargeId]/page.tsx:210-230`: one flex row holds the back link + "Domus" + title
  on the left and two buttons ("Download PDF", "Print Receipt") on the right. At 402 px wide, "Print Receipt" runs off the
  right edge, "Back to Rent" wraps to two lines and "Payment Receipt" wraps.
- **Tenant Rent page times** `app/tenant/page.tsx:389-391`: "Paid Sep 1, 2026, 3:00 PM" uses `formatDateTime`, which
  formats in UTC (`lib/format.ts:25-32`), so the time is wrong for the reader. The date is enough.
- **Ask Domus send button** `components/dashboard/ai-assistant.tsx:285`: the chat panel's bottom-right Send button sits
  under the floating help "?" button, so the Send button can't be tapped on a phone. Find the help button's position
  class (search `components/help-menu.tsx` for `fixed`) and the panel's input row.

## 3. In scope
The three fixes in §6, with tests.

## 4. Out of scope
`lib/format.ts`, the PDF route, the help menu's own position, other pages, copy changes beyond §6.

## 5. Exact files expected to change
1. `apps/web/app/payments/receipt/[chargeId]/page.tsx`
2. `apps/web/app/payments/receipt/__tests__/receipt-page.test.tsx`
3. `apps/web/app/tenant/page.tsx`
4. `apps/web/components/dashboard/ai-assistant.tsx`
5. `apps/web/components/dashboard/__tests__/ai-assistant-consent.test.tsx` (add the §8.3 test)
6. A tenant page test: add §8.2 to the existing test that renders `app/tenant/page.tsx` if one exists under
   `apps/web/app/tenant/__tests__/`; otherwise create `apps/web/app/tenant/__tests__/paid-line.test.tsx`.

## 6. Implementation requirements
1. Receipt header: make the header a column on phones and a row from `sm:` up: the outer row becomes
   `flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`; the button group becomes
   `flex flex-wrap items-center gap-2`. The back link gets `whitespace-nowrap`. No other change.
2. Tenant Rent page: the "Paid …" line uses `formatDate(payment.paidAt)` instead of `formatDateTime`. Only that line.
3. Ask Domus: while the panel is open, the input row leaves room for the help button: add right padding to the panel's
   input row on phones equal to the help button's width plus its right offset (e.g. `pr-16 sm:pr-4`), so the Send button
   sits fully left of the help button. Keep everything else the same.
4. Lines ≤ 140 characters.

## 7. Validation commands
```
(cd apps/web && npx vitest run app/payments/receipt components/dashboard/__tests__/ai-assistant-consent.test.tsx app/tenant)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
```
Do NOT run `npm run gate:web`.

## 8. Acceptance criteria (assert on rendered output)
1. Receipt test "header stacks on phones": the element with `data-print-controls="receipt"` has classes `flex-col` and
   `sm:flex-row`; the "Back to Rent" link has `whitespace-nowrap`.
2. Tenant page test "paid line shows the date only": a payment with `paidAt` `2026-09-01T15:00:00Z` renders `Paid Sep 1, 2026`
   and the text `3:00 PM` does not appear.
3. Ask Domus test "send button clears the help button": with the panel open, the container of the send button (or the
   input row) has a class containing `pr-16`.
4. Existing tests in these files still pass.

## 9. Report format
Compact status only: files changed with line counts, test names, command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies. No copy changes. No invented URLs.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
  user needs to think about what to do, the UI needs to be clearer.
