# Sprint 213 — Small leftovers: login polish + one missing test (L2)

## 1. Objective
Fix two small login-page problems and add one missing safety test.

## 2. Context (HEAD `146b135`, branch `main`)
1. **"Your session expired" shows to brand-new visitors.**
   - `middleware.ts:53-58` sets the cookie `x-session-expired=1` whenever there is no user on a protected route. That includes browsers that were never signed in.
   - `app/login/page.tsx:37,128` then shows the "Your session expired." alert.
2. **The role cards get squashed.**
   - `components/auth/role-selector.tsx:44,52` uses `grid-cols-1 sm:grid-cols-3`, and the selected card gets `sm:col-span-2`.
   - The login form column is at most `max-w-xl`, so from 640 px up the cards are cramped. At about 800 px, after choosing Owner, the other cards are squashed.
3. **A safety test is missing.**
   - `lib/stripe-connect.ts` `getRentCollectionConnectStatus` (≈ line 300) reads properties where `owner_account_id` is null (line 347) and skips them at line 367. The code is null-guarded, but no test pins that.
   - Tests live in `lib/__tests__/stripe-connect.test.ts`.

## 3. In scope
1. **Session-expired banner.** Set `x-session-expired` only when the request **carried a Supabase auth cookie** but `getUser()` returned no user on a protected route. A Supabase auth cookie is any cookie whose name matches `/^sb-.+-auth-token(\.\d+)?$/`. A browser with no auth cookie sees no banner. Keep the 10-second `maxAge` and keep the rest of the middleware unchanged.
2. **Role cards.** Make `role-selector.tsx` readable at every width inside the login form column:
   - No card is narrower than 200 px.
   - No card's title or description wraps one word per line.
   - The selected card's expanded content keeps full width.
   - A simple stacked layout (one column) inside the form column is acceptable, or use a container-based rule. Choose the one with the least code.
   - Keep the role names, descriptions, selection behavior and keyboard behavior unchanged.
3. **Test.** In `stripe-connect.test.ts`, add tests showing `getRentCollectionConnectStatus`:
   - doesn't throw and doesn't count a home with `owner_account_id = null` toward any account;
   - still reports the correct status for a normal account in the same call.

## 4. Out of scope
Everything else: no copy changes, no auth logic changes beyond the banner cookie, no DB.

## 5. Exact files expected to change
- `apps/web/middleware.ts`
- `apps/web/components/auth/role-selector.tsx`
- `apps/web/lib/__tests__/stripe-connect.test.ts`
- a middleware test (new or existing, e.g. `apps/web/__tests__/middleware.test.ts`; use the folder existing tests use)
- `apps/web/app/login/__tests__/page.test.tsx` only if needed

## 6. Implementation requirements
- Lines ≤ 140. No new dependencies.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- the changed tests
- `cd apps/web && npx vitest run` (full suite)
- Do **not** run `npm run gate:web` (it reads the DB; Claude runs it).

## 8. Acceptance criteria (binary)
1. **Middleware tests:**
   - no auth cookie + protected route + no user → no `x-session-expired` cookie;
   - an `sb-xyz-auth-token` cookie (and the chunked `.0` form) + protected route + no user → cookie set;
   - a signed-in user → not set;
   - a public route → not set.
2. The role selector meets §3.2. Claude checks this with screenshots at 375, 800 and 1280 px, in light and dark mode.
3. The stripe-connect null-owner tests exist and call the real function.
4. Lint, typecheck and the full suite are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB access, deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/mobile` or `apps/ios`.
