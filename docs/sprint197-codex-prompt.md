# Sprint 197 — (ChatGPT: APPROVE WITH CHANGES → APPROVE on rev 2) Survive brief Supabase timeouts in the sign-in and profile checks; never treat an error as an answer (L3: auth) · Category 7 (Reliability)

## 1. Objective
On 2026-10-07 22:00:30–32Z Supabase returned two 504s (`/auth/v1/user`, `/rest/v1/profiles`). The tenant dashboard showed its error screen (Vercel log: `[Error: {"message":"Gateway Timeout"}] { digest: '484108108' }`). Reading the code turned up a worse, silent problem. The shared auth helpers **ignore errors and fall back to defaults**:
- `getCurrentUserRole` → `"tenant"` on any error (an owner can be routed as a tenant);
- `getUserProfileSummary` → `onboardingCompletedAt: null` on error, so `app/tenant/page.tsx:89–91` redirects a real tenant to **/onboarding**;
- `getAuthState` → `hasProfile: false` / `onboardingComplete: false` on error.
Goals: (a) retry **once** on a transient Supabase failure; (b) if it still fails, **throw** so the page's existing error screen ("We couldn't load… Try again") shows, never a wrong redirect or wrong role.

## 2. Context
- Branch `main`, HEAD current `main`. Next 15.5 (server components + server actions), `@supabase/ssr`, supabase-js v2.
- `apps/web/lib/auth.ts`: `getAuthenticatedUser` (l.16), `getCurrentUserRole` (l.29), `getAuthState` (l.45), `requireRole` (l.~98), `getUserProfileSummary` (l.110). About 74 call sites across pages/routes.
- `apps/web/app/actions/auth-helpers.ts:19` `requireAuth(...)`: its own `auth.getUser()` + `getCurrentUserRole`.
- `apps/web/lib/retry.ts` `withRetry(fn, { maxAttempts, baseDelayMs, retryIf })` exists (tests in `lib/__tests__/retry.test.ts`).
- `apps/web/middleware.ts` already catches `getUser` failures and lets the request through (route-level auth still protects). **Do not change middleware.**
- supabase-js results: `auth.getUser()` resolves `{ data: { user }, error }`. A missing session gives `AuthSessionMissingError` (not transient). Network/5xx gives `AuthRetryableFetchError` (status 0 or ≥ 500) or may **throw**. PostgREST `.from()` resolves `{ data, error, status }`; a 504 has `status >= 500` and/or `error.message` like "Gateway Timeout".

## 3. In scope
1. **`lib/supabase-transient.ts` (new):** `isTransientSupabaseFailure(input: { error?: unknown; status?: number } | unknown): boolean`. It is true for: `status >= 500`; `status === 0`; error `name === "AuthRetryableFetchError"`; error `status` ≥ 500 or 0; error messages matching `/gateway timeout|bad gateway|service unavailable|fetch failed|network|ECONNRESET|ETIMEDOUT|socket hang up/i`. It is false for auth-session-missing, invalid JWT, 4xx, RLS/permission errors and `PGRST116` (no rows).
2. **One retry, then fail closed.** Wrap these calls so a transient failure (resolved error **or** thrown) is retried **once** after ~300 ms (`withRetry` with `maxAttempts: 2`, `retryIf` = transient), and a failure that persists **throws** `new Error("Account check is unavailable. Please try again.")` (cause attached):
   - `getAuthenticatedUser`: transient → retry → still failing → throw. Not transient and no user (e.g. session missing) → `redirect("/login")` exactly as today.
   - `getCurrentUserRole`: query error (transient after retry, or **any** non-"no rows" error) → throw. **Only** a successful query with no row or an unknown role keeps today's `"tenant"` fallback.
   - `getAuthState`: profile query error → throw (never report `hasProfile: false` because of an error). Its inner `getUser` fallback follows the `getAuthenticatedUser` rules but must not redirect; throw on a persistent transient error.
   - `getUserProfileSummary`: profile query error → throw (never return `onboardingCompletedAt: null` because of an error). No row and no error keeps today's shape.
   - `requireAuth` (`auth-helpers.ts`): same `getUser` rules as `getAuthenticatedUser`; role via the hardened `getCurrentUserRole`.
   - `requireRole` inherits the behavior; no change beyond that.
3. **No behavior change on the success path.** No extra queries, no added latency when Supabase answers normally. Redirect targets and the `"tenant"` fallback for a genuinely missing row/unknown role stay exactly as they are.
4. **Tests** (`lib/__tests__/supabase-transient.test.ts`, `lib/__tests__/auth-resilience.test.ts`, and the existing `auth-helpers`/`requireAuth` test file if present). Each is a real assertion with call counts:
   - classifier: each true case and each false case in §3.1 (including `AuthSessionMissingError` and `PGRST116`);
   - `getAuthenticatedUser`: transient once then user → returns user, `getUser` called 2×; transient twice → throws the plain error, no redirect; thrown network error once then user → returns user; session missing → `redirect("/login")` and `getUser` called **1×** (no retry);
   - `getCurrentUserRole`: 504 once then `{ role: "owner" }` → `"owner"`; 504 twice → throws (and does **not** return `"tenant"`); permission error → throws without retry; no row (`data: null, error: null`) → `"tenant"`;
   - `getUserProfileSummary`: error → throws (never `onboardingCompletedAt: null`); success unchanged;
   - `getAuthState`: profile error → throws (never `hasProfile: false`);
   - `requireAuth`: transient once → succeeds; persistent → throws; no session → redirect login; wrong role → redirect to role home (unchanged).

## 3b. Required precision (ChatGPT review, round 1 — all adopted)
1. **Zero vs many rows.** Use `.maybeSingle()` for the profile/role reads (zero rows → `{ data: null, error: null }`; more than one row → error). A `PGRST116` or any multiple-rows error must **fail closed** (throw), never fall back to `"tenant"`. Test: duplicate rows → throws.
2. **How resolved errors reach the retry.** Each attempt runs the full Supabase call and inspects the whole response: transient resolved error/status → throw an internal retryable marker inside the attempt; `{ data, error: null }` → return; non-transient resolved error → stop immediately (no retry) and throw the plain error; thrown transient → retry once; thrown non-transient → no retry, throw the plain error.
3. **Classifier precedence.** Explicit exclusions run **first**: `AuthSessionMissingError`; auth errors with status 401/403 (invalid/expired JWT, user not found); any other 4xx (incl. 429); RLS/permission errors (`42501`, `PGRST301`/`PGRST302`); `PGRST116`. Only then: structured status/codes (`status >= 500`, `status === 0`, `AuthRetryableFetchError`, PostgREST `PGRST003` pool timeout); message regex **last**, only for raw thrown fetch/runtime errors. Test conflicting shapes, e.g. a 401 whose message contains "network" → not transient.
4. **Auth outcome table** (`getAuthenticatedUser`, `requireAuth`, `getAuthState` inner fallback):
   - `user` present → use it.
   - `user: null, error: null` → unauthenticated → existing behavior (`redirect("/login")`; in `getAuthState`, `invitedAt = null` as today).
   - `AuthSessionMissingError` **or** auth 401/403 (expired/invalid token, user gone) → unauthenticated → same as above. *Deliberate deviation from the reviewer's "any other auth error must throw": a stale/expired session must still land on /login, not an error screen.*
   - Transient (after one retry) → throw the plain error.
   - Any other non-transient auth error → throw the plain error (no retry).
5. **Redirects stay untouched.** Call `redirect()` only **outside** any retry/try/catch region; if a catch is unavoidable, rethrow Next's redirect/not-found errors unchanged (`isRedirectError`/digest check). Test: the `/login` and role-home redirects are exact, never retried, never wrapped.
6. **Exact call counts on the success path:** `getAuthenticatedUser` = 1 `auth.getUser()`; `getCurrentUserRole` = 1 profiles query; `requireAuth` = 1 `auth.getUser()` + 1 profiles query; `getUserProfileSummary` = 1 profiles query; `getAuthState(userId, { invitedAt })` = 1 profiles query and **0** `getUser`. Tests assert these counts.
7. **Persistent thrown failures:** test "thrown transient twice → exactly 2 attempts → `Error("Account check is unavailable. Please try again.", { cause })`" alongside the persistent resolved-504 case. Every escaping failure uses that exact message with the original error as `cause`.
9. **401/403 scope (round 2, adopted):** only an `auth.getUser()` 401/403 means "signed out" → `/login`. A 401/403/RLS denial from a **profile or role query** throws the plain error; it never redirects to login. Test both.
10. **Cause (round 2, adopted):** the thrown error's `cause` is the **final real Supabase error** (or thrown error), not the internal retry marker.
8. **Timing (optional, adopted):** with fake timers, transient-once waits one ~300 ms delay; success and non-transient failures wait 0 ms.

## 4. Out of scope
`middleware.ts`; other direct `auth.getUser()` call sites in routes/actions (list them in the report for a follow-up); error page copy; any DB, RLS or schema change; caching; notifications.

## 5. Exact files expected to change
`apps/web/lib/supabase-transient.ts` (new), `apps/web/lib/auth.ts`, `apps/web/app/actions/auth-helpers.ts`, and the tests in §3.4 (new or existing under `apps/web/`).

## 6. Implementation requirements
- Every Supabase result is checked; never treat an error as data (L-002 spirit).
- Exactly one retry; a fixed ~300 ms delay; retry only when transient.
- Lines ≤ 140 characters; files ≤ 500 lines; no new dependencies; no `eslint-disable`.
- Thrown error message exactly `Account check is unavailable. Please try again.` (plain-language guard must pass).
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npm run lint:web`; `npx tsc --noEmit -p apps/web/tsconfig.json`
- The new tests plus every test importing `lib/auth` or `auth-helpers` (`grep -rlE "lib/auth\"|auth-helpers" apps/web --include=*.test.ts --include=*.test.tsx`), plus `lib/__tests__/plain-language.test.ts`.
- `npm run build --workspace @domus/web`.

## 8. Acceptance criteria (binary)
1. A transient failure is retried exactly once; success after retry returns normally.
2. A persistent or non-transient query error throws the plain error; no function returns the `"tenant"` fallback, `hasProfile: false` or `onboardingCompletedAt: null` because of an error.
3. A missing session still redirects to /login with no retry; role redirects are unchanged; the success path makes no extra calls.
4. All §3.4 cases are real assertions with call counts; lint, typecheck, tests and build pass; only §5 files changed.

## 8b. Post-deploy verification (Claude only)
Full gate; smoke (3 roles) passes; owner/manager/tenant dashboards render with 0 console errors (light/dark spot check); Sentry shows no new issues; CI green. Production `[perf:*]` `auth.user`/`auth.role` timings unchanged (no added latency on the success path).

## 9. Report format
JSON per `docs/codex-report-schema.json`. List the other direct `auth.getUser()` call sites found (for a follow-up). Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json` or `middleware.ts`.
