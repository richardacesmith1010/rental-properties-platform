# Sprint 171 — Tenants can pay: autopay result, visible pay errors, "no lease yet" screen, honest copy (L3)

Revision 2 — ChatGPT verdict APPROVE WITH CHANGES; the 3 required changes and the 3 optional suggestions are adopted (messages changed at their source, auth and rate-limit regression tests, interaction tests for all three pay components, a redirect-once assertion on every outcome, and a no-lease send attempt).

## 1. Objective
Fix the tenant blockers from `docs/launch-review-2026-10-05.md`:
1. Turning on autopay saves the card but always lands on the error state.
2. When a pay button fails, the tenant sees nothing.
3. The autopay result banner never shows.
4. A tenant with no lease sees "Next rent $0.00", and its actions are greyed out with no reason.
5. Tenant copy promises notices and receipts that are not sent while notifications are off.

## 2. Context
- Branch `main`, HEAD `e08de8e` or a later docs-only commit. Notifications are off until launch (`DOMUS_NOTIFICATIONS_ENABLED` is unset).
- **Autopay return (verified):** in `apps/web/app/autopay/return/page.tsx` (~62–93), the success `redirect("/tenant?autopay=enrolled")` is inside `try { … } catch { redirect(error) }`. Next's `redirect()` throws, so the catch always turns success into an error. Every result redirect goes to `/tenant?autopay=…` with no section. The result banners live in the Rent section (`section=charges`, rendered by `components/dashboard/charges/charges-implementation.tsx`).
- **Pay actions:** `payWithCard(formData)` and `payWithACH(formData)` in `apps/web/app/actions/charges.ts` (227, 303) return `ActionState` on failure and `redirect(session.url)` on success.
  - `app/tenant/page.tsx` casts them to `(formData) => Promise<void>` and passes them to `TenantRentCard`, `PayRentCard` and `TenantOverview` (~316–333). Those use `<form action={…}>` (for example `pay-rent-card.tsx:249,286`), so a returned error is dropped.
  - Existing error messages include "Charge not found.", "This charge has already been paid." and "Waived charges cannot be paid."
- **Pay state:** `apps/web/lib/tenant-pay-state.ts`: `getTenantPayState` returns `not_posted` both when there is no lease and when there is no charge.
- **Copy:**
  - `ticket-form.tsx:167` says "we'll notify your landlord right away".
  - `ticket-form.tsx:230` says "Your landlord will be notified immediately."
  - `pay-rent-card.tsx:216` says "You'll get a receipt by email after you pay."
- **No-lease actions:**
  - `ticket-form.tsx` (~157, 221–228) disables sending without a lease and gives no reason.
  - The tenant inbox (`inbox-section.tsx` ~224 with `app/actions/inbox.ts:411`) fails only after the tenant sends.

## 3. In scope
1. **Autopay return** (`app/autopay/return/page.tsx`):
   - Restructure so the code inside `try/catch` only computes an outcome (`"enrolled" | "error"`), and call `redirect()` once, **outside** the try/catch. Next's redirect error must never be caught.
   - Every result goes to `/tenant?section=charges&autopay={outcome}`.
   - Keep all existing checks: auth, lease ownership, the card's last4, and the upsert error.
2. **Pay errors visible:**
   - In `app/actions/charges.ts`, add `payWithCardState(prev, formData)` and `payWithACHState(prev, formData)`. These are thin wrappers that call the existing functions.
     - The wrappers must let `redirect()` propagate. Do not wrap the call in a try/catch that swallows it.
     - Return the `ActionState` on failure.
     - Change the tenant-facing error strings **at their source** in `charges.ts`, in the shared checkout preparation used by `payWithCard`/`payWithACH`.
       Do **not** translate message text inside the wrappers (no string-to-string mapping). The new strings:
       - "This rent was already paid."
       - "This rent was cancelled by your landlord." (for waived)
       - "We couldn't find this rent. Refresh the page."
       - For the minimum-amount message: "Online pay starts at ${min}. Ask your landlord to record it."
       - Keep any other existing messages but replace the word "charge".
   - In `TenantRentCard`, `PayRentCard` and `TenantOverview`, use `useFormState` with the new actions and show the error in a `role="alert"` box under the button, using the existing error styling.
   - Show a pending state on the button ("Opening payment…") while submitting.
   - Update `app/tenant/page.tsx` to pass the new actions and remove the `as (formData) => Promise<void>` casts.
3. **No-lease state:**
   - In `lib/tenant-pay-state.ts`, add the state `"no_lease"`, returned when `lease` is null or undefined. `not_posted` remains the state for a lease without a posted rent.
   - In `TenantRentCard` / `TenantOverview`, for `no_lease`, replace the rent amount with a card titled "Your lease isn't set up yet" and the body "Your landlord is still setting things up. You'll see your rent here once it's ready." Never show "$0.00".
   - In `ticket-form.tsx` and the tenant inbox, without a lease, show above the disabled control: "You can report problems and send messages once your landlord sets up your lease." The send buttons stay disabled. No failed send after typing.
4. **Honest copy:**
   - `ticket-form.tsx:167` → "Tell us what's wrong. Your landlord will see it in Domus."
   - `ticket-form.tsx:230` → "Your landlord will see it in Domus."
   - `pay-rent-card.tsx:216` → "Your receipt will be in Domus after you pay."

## 4. Out of scope
- Owner or manager screens, the Stripe checkout or session logic, webhook handling, autopay charging, schema, notifications or emails, and any other copy.
- `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/app/autopay/return/page.tsx`
- `apps/web/app/actions/charges.ts` (wrappers and plain error strings only)
- `apps/web/app/tenant/page.tsx`
- `apps/web/lib/tenant-pay-state.ts`
- `apps/web/components/dashboard/tenant-rent-card.tsx`
- `apps/web/components/dashboard/pay-rent-card.tsx`
- `apps/web/components/dashboard/tenant-overview.tsx`
- `apps/web/components/dashboard/ticket-form.tsx`
- `apps/web/components/dashboard/inbox-section.tsx` (the tenant no-lease notice only)
- tests: `apps/web/lib/__tests__/tenant-pay-state.test.ts` (or the existing test file for it), `apps/web/components/__tests__/tenant-rent-card.test.tsx`, a new `apps/web/app/autopay/return/__tests__/page.test.ts` (or `apps/web/lib/__tests__/autopay-return.test.ts`), and any existing test that imports a changed component (update it, don't delete cases)

Each line at most 140 characters. Do not compact code (L-015). If `charges.ts` or `tenant/page.tsx` already exceed 400 lines, do not grow them by more than 40 lines.

## 6. Implementation requirements
- Server actions keep their auth and rate-limit steps unchanged. The wrappers add no new data access.
- `redirect()` is never inside a try/catch that can swallow it, in any file this sprint touches.
- Plain-language rules: no "charge", "submit" or "transaction" in tenant-facing text you write or touch.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npx vitest run` from `apps/web` on all changed or added test files, plus every existing test that imports a changed file
- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `npm run lint:web`

## 8. Acceptance criteria (binary). Each case needs a real test that calls the code (L-017)
1. **Autopay return** (assert `redirect` is called **exactly once** on every outcome):
   - valid setup with last4 and a successful upsert → `redirect` called once with `/tenant?section=charges&autopay=enrolled`;
   - an upsert error → `…autopay=error`;
   - a Stripe retrieve throwing → `…autopay=error`;
   - no lease → `…autopay=error`.

   Mock `redirect` to throw like Next's. Assert that the success path is **not** converted to an error.
2. **Pay wrappers:**
   - a paid rent → `{ success:false, error:"This rent was already paid." }`;
   - a missing rent → "We couldn't find this rent. Refresh the page.";
   - the auth/rate-limit path is reached unchanged: a rate-limited call returns the existing rate-limit error and creates no Stripe session.
     An unauthenticated or non-tenant call is rejected exactly as by the existing function (redirect or error), with no Stripe call;
   - waived → the "cancelled" message;
   - below the minimum → the plain minimum message;
   - success → `redirect` propagates (it is not caught).
3. **`TenantRentCard`, `PayRentCard` and `TenantOverview`:** each one gets its own interaction test.
   - Submitting through the component's pay form calls the new state action.
   - A returned error renders in the `role="alert"` box.
   - While pending, the button shows "Opening payment…", in every component that has its own button implementation.
4. **`getTenantPayState`:**
   - no lease → `no_lease`;
   - a lease with no charge → `not_posted`;
   - the existing cases are unchanged.
5. **`TenantRentCard`/`TenantOverview` with `no_lease`:**
   - show "Your lease isn't set up yet";
   - never render "$0.00".
6. **`ticket-form` and the tenant inbox without a lease:**
   - they show the notice text, and the send control is disabled;
   - typing in the field and attempting to send calls no server action.
7. **Copy:**
   - the three old strings no longer exist (grep in §5 files);
   - the new strings render.
8. Typecheck and lint pass. Only §5 files changed.

## 9. Report format
JSON per `docs/codex-report-schema.json`. In `self_verification.findings`, list each test file with its number of cases. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, deploy, commit or push. Never modify or revert files outside §5. No new dependencies. Do not invent URLs or emails.
