# Sprint 194 — Plain words in notifications, receipts and payment labels; guard `lib/` too (L2) · Categories 2 (Tenant) / 9 (Plain language)

## 1. Objective
The plain-language guard (`apps/web/lib/plain-language/scan.ts`, test `lib/__tests__/plain-language.test.ts`) scans `app/`, `components/` and `lib/*email*` only. User-facing strings that live elsewhere in `lib/` and raw `toUpperCase()` codes slip through. Claude ran the same rules over `lib/` on 2026-10-07: 20 hits. The visible ones are listed below, along with two places that show raw codes. Fix them with the exact copy below, then make the guard cover all of `lib/` so this can't come back.

## 2. Context
- Branch `main`, HEAD `caeab46` or a later docs-only commit. Next 15.5, Vitest.
- Payment methods in the DB: `ach`, `card`, `cash`, `check`, `other` (CHECK constraint on `payments.method`).
- `lib/__tests__/__snapshots__/pdf-data-snapshot.test.ts.snap` line ~29 has `"paymentMethod": "ACH"` (Sprint 188 snapshot). This sprint changes that value **on purpose**.
- Exceptions file `lib/plain-language/exceptions.json` is `{}` today; the test caps it at 25 entries, each `"apps/web/<file>:<exact text>": "<reason>"`.

## 3. In scope (exact copy; nothing else in these files changes)
1. `lib/charge-generation.ts`
   - ~line 344 (tenant late notice body): `` `Your rent due ${formatDate(charge.due_date)} is now late.` ``
   - ~line 359 (owner title): `Rent is late`
   - ~line 360 (owner body): `` `Rent due ${formatDate(charge.due_date)} is now late.` ``
2. `lib/notification-action-resolvers.ts` ~66 `Waive Charge` → `Waive payment`; ~76 and ~103 `View Charge` → `View payment`. Keep every `kind`, `href`, `sectionId` unchanged.
3. `lib/notification-feed.ts` ~99 `View Charge` → `View payment`.
4. `lib/notification-preferences.ts` ~75 description → `Send emails when rent becomes overdue.`
5. `lib/pdf/receipt-template.tsx` ~18 `RENTAL COMMAND CENTER` → `PROPERTY MANAGEMENT`.
6. `lib/stripe-errors.ts` ~41 description → `We're still finishing setup with our payment provider. This takes up to one business day. Please check back soon. You can connect your bank once it's ready.`
7. `lib/notification-fanout.ts` ~123 body → `We could not send a tenant payment to your bank. Please reconnect your bank in Settings.`
8. **Payment method labels.** New `lib/payment-method-label.ts` exporting `paymentMethodLabel(method: string): string`: `ach` → `Bank transfer`, `card` → `Card`, `cash` → `Cash`, `check` → `Check`, `other` → `Other`; case-insensitive; any other value → first letter uppercased, rest as-is. Use it in:
   - `components/dashboard/payments-section.tsx` ~51 (replace `payment.method.toUpperCase()`),
   - `app/tenant/page.tsx` ~376 tenant **Past payments** badge (replace `payment.method.toUpperCase()`; only that expression and its import change),
   - `lib/pdf/pdf-builders.ts` `formatPaymentMethod` (make it return `paymentMethodLabel(method)`, or replace its call sites; keep any export names stable),
   - any other place that renders `payment.method`/`paymentMethod` raw to users (grep `\.method\b` and `paymentMethod` in `components/` and `app/`; list each one changed).
   Update the PDF snapshot so `"paymentMethod": "ACH"` becomes `"Bank transfer"`. **That must be the only snapshot change.**
9. **Lease document statuses** in `components/dashboard/tenant-documents-section.tsx` ~147–150: replace `Packet: {status.toUpperCase()}` with `Documents: {label}` and `Signer: {signerStatus.toUpperCase()}` with `Your signature: {label}`, using a small local map: `draft` → `Draft`, `sent` → `Sent`, `viewed` → `Opened`, `pending` → `Waiting`, `signed` → `Signed`, `completed` → `Done`, `declined` → `Declined`, `voided` → `Canceled`; anything else → first letter uppercased. Find the real status type first and make sure every value it allows is in the map. Badge variants unchanged.
10. **Guard covers all of `lib/`.** In `scan.ts` `scanWeb`, scan every non-test `.ts`/`.tsx` under `apps/web/lib/` with the same rules used for `components/` (emails keep their email rules). Add exceptions **only** for the Stripe transfer descriptions in `lib/stripe-webhook-handlers.ts` (money code, changed later in a reviewed L3 sprint). Use reason `Stripe transfer description in money code; reword in a reviewed L3 sprint.` and one key per distinct text the scanner reports. If any other `lib/` hit appears that is not user-facing (for example a log message caught by a `message:` property), list it in the report and add it as an exception with a specific reason. Do not loosen the rules.
11. **Tests.**
    - `lib/__tests__/payment-method-label.test.ts`: all 5 values, uppercase input (`"ACH"` → `Bank transfer`), and an unknown value (`"zelle"` → `Zelle`).
    - Add a test in `plain-language.test.ts` proving a `lib/` (non-email) file is now scanned (e.g. `scanSource` of a fixture under `apps/web/lib/fixture.ts` with `title: "View Charge"` reports one banned-word hit), plus the existing full-tree test passing.
    - Update any existing test asserting the old strings (list each file and string).
    - The `tenant-documents-section` test (if one exists) asserts `Documents: Signed`; otherwise add one case to a new `components/__tests__/tenant-documents-labels.test.tsx`.

## 4. Out of scope
- `lib/stripe-webhook-handlers.ts` (exceptions only), any logic, `kind`/`type` identifiers, notification switch (stays OFF), emails already covered, other wording.
- Deploy, commit, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
`lib/charge-generation.ts`, `lib/notification-action-resolvers.ts`, `lib/notification-feed.ts`, `lib/notification-preferences.ts`, `lib/pdf/receipt-template.tsx`, `lib/stripe-errors.ts`, `lib/notification-fanout.ts`, `lib/payment-method-label.ts` (new), `lib/pdf/pdf-builders.ts`, `components/dashboard/payments-section.tsx`, `app/tenant/page.tsx` (one expression + import), `components/dashboard/tenant-documents-section.tsx`, `lib/plain-language/scan.ts`, `lib/plain-language/exceptions.json`, the PDF snapshot file, and tests per §3.11. Any extra file from §3.8's grep must be listed (all paths under `apps/web/`).

## 6. Implementation requirements
- Exact copy above; every new sentence ≤ 12 words.
- Lines ≤ 140 characters; files ≤ 500 lines. No new dependencies, no `eslint-disable`.
- The user should never need to read instructions to complete this flow.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npm run test --workspace @domus/web -- --run lib/__tests__/plain-language.test.ts lib/__tests__/payment-method-label.test.ts lib/__tests__/pdf-data-snapshot.test.ts` plus every test importing a changed file (`grep -rlE "charge-generation|notification-action-resolvers|notification-feed|notification-preferences|receipt-template|stripe-errors|notification-fanout|pdf-builders|payments-section|tenant-documents-section" apps/web --include=*.test.ts --include=*.test.tsx`).
- Report the full list of `lib/` scanner hits before and after, and every exception added.

## 8. Acceptance criteria (binary)
1. Every string in §3.1–3.7 matches exactly; payment methods and document statuses render through the label maps.
2. The guard scans all of `lib/`; the full-tree test passes with only the listed exceptions (≤ 25 total, each with a specific reason).
3. The only snapshot change is `"paymentMethod": "ACH"` → `"Bank transfer"`.
4. New tests are real assertions; lint, typecheck and tests pass; only §5 files changed.

## 8b. Post-deploy verification (Claude only)
Smoke tenant: Past payments badge reads `Cash` (not `CASH`); a receipt PDF downloads and its text has `PROPERTY MANAGEMENT`; smoke owner Messages timeline shows the new late-rent wording for new notices only (old rows keep old text); light/dark; 0 console errors; smoke specs; Sentry; CI.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Include the before/after hit lists and exceptions. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
