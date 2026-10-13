# Sprint 226 — Money page error visibility + two broken queries (L2) · rev 1

Found while verifying Sprint 222 (2026-10-13).

## 1. Objective
1. **Money page can't fail silently.** `/owner/money` intermittently showed "Numbers are not ready. Try again later." (twice right after a deploy; fine on 4 later loads). The catch blocks in `app/owner/money/page.tsx` swallow the error, so neither Vercel nor Supabase logs show the cause.
   - **Log every caught error** (safely).
   - **Retry once** on transient errors before showing the message.
2. **Analytics repairs are silently empty.** `lib/analytics-loader.ts:194-205` selects `maintenance_tickets.updated_at`, but **that column doesn't exist live**. The query 400s, and the missing-schema fallback replaces the data with `[]`. So every owner's analytics shows no repair data.
3. **A wasted 400 on every LLC-member lookup.** `lib/ownership.ts:320-335` filters `ownership_account_members.deleted_at`, which **doesn't exist live**. Every call 400s, then falls back to a second query. The Supabase edge logs show this repeating constantly.

## 2. Context (HEAD after 222, branch `main`)
- **Live columns** (verified 2026-10-13):
  - `maintenance_tickets` has `property_id, status, priority, actual_cost_cents, created_at, resolved_at` and **no `updated_at`**;
  - `ownership_account_members` has `active, payout_stripe_account_id` and **no `deleted_at`**.
- The Money page has three catches that return or set "Numbers are not ready. Try again later.":
  - the `loadHomeMoney`/`loadHomeAlerts` `Promise.all`;
  - the `properties` query;
  - `loadCashOnHand` (warning only).

## 3. In scope
1. **`app/owner/money/page.tsx`:**
   - Add a small helper, `withOneRetry(step, fn)`: run `fn`, and if it throws a **transient** error, wait 300 ms and run it once more. Transient means:
     - a `TypeError` whose message contains "fetch failed";
     - a code of `ECONNRESET`, `ETIMEDOUT` or `UND_ERR_SOCKET`;
     - an HTTP status ≥ 500;
     - a PostgREST code of `PGRST301` or starting `57`.
   - Use it for the money/alerts load and the properties query.
   - **Every catch logs** `console.error("[owner-money-load-failed]", { step, name, code, status, message: first 160 chars })`. Never log tokens, emails or row data.
   - The user-facing copy stays the same.
2. **`lib/analytics-loader.ts`:** select only existing columns (drop `updated_at`). If the code uses `updated_at` for anything (e.g. resolution time), use `resolved_at` instead and keep the behavior otherwise identical. Keep the missing-schema fallback.
3. **`lib/ownership.ts` `getActiveLlcMembershipsForUser`:** remove `.is("deleted_at", null)` and the fallback branch. One query, error checked.
4. Grep the repo for any other `.is("deleted_at"` on `ownership_account_members`, and any other `maintenance_tickets` select of `updated_at`, and fix them the same way. List them in the report.

## 4. Out of scope
- Parallelizing the Money page's loads.
- Other pages.
- Schema changes.

## 5. Exact files expected to change
- `apps/web/app/owner/money/page.tsx` (plus a tiny helper file `apps/web/lib/retry-transient.ts` if cleaner)
- `apps/web/lib/analytics-loader.ts`
- `apps/web/lib/ownership.ts`
- Any file found by the §3.4 grep (list them).
- Tests: the money page error and retry, the analytics loader columns, and the ownership membership query.

## 6. Implementation requirements
- Lines ≤ 140 characters.
- Check every Supabase error.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`

## 8. Acceptance criteria (binary; named tests that call real code)
1. **`withOneRetry`:** a transient error on the first call → the second call succeeds and the page renders; two transient errors → the status message plus a single `[owner-money-load-failed]` log containing `step` and `code`; a non-transient error → no retry, and it's logged.
2. **Analytics:** the maintenance select string has no `updated_at`; with tickets returned, the repair stats are non-empty (a test with fixture rows).
3. **Ownership:** `getActiveLlcMembershipsForUser` issues exactly one query with no `deleted_at` filter, and its error is thrown.
4. Lint, typecheck, the full suite and the build are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with the test names mapped to §8 and the §3.4 grep results. Compact status only.

## 10. Constraints
- No DB access, deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or "* 2.*" files.
