# Sprint 144 — Login lockout counts only rejected credentials (rev 3, ChatGPT L3 review: APPROVE WITH CHANGES — changes adopted)

**Severity: L3** (auth: sign-in throttling). Rev 1 was REJECTED by the Domus ChatGPT project review on 2026-10-03; this revision adopts all required changes: (1) count only credential rejections, not outages; (2) close the concurrent-request race; (3) explicit normalization invariant; (4) theme-spec refactor split out to a separate L1 sprint; (5) deterministic clock in tests. Rev 2 re-review: APPROVE WITH CHANGES — adopted per-window reservation tokens so stale completions (after window expiry or after a success) never count against or recreate a newer window.

## 1. Objective
A user who signs in **successfully** must never be locked out. Only sign-in attempts that Supabase **rejects as wrong credentials** count toward the lockout: 5 rejected attempts per 15 minutes per email; attempts 1–5 reach Supabase, attempt 6 is blocked. A successful sign-in clears that email's count. Outages and other operational errors never count. Concurrent requests must not let a burst of guesses through.

## 2. Context
- Branch `main`, HEAD `5145c2a` (or later docs-only commit).
- `apps/web/app/actions/login.ts:31` today: `checkRateLimit(\`login:${email}\`, 5, 900_000)` runs before `signInWithPassword` and increments on every attempt (success or failure), synchronously — so it is race-safe but locks out users after 6 correct sign-ins in 15 minutes (observed 2026-10-02).
- `apps/web/lib/rate-limit.ts`: in-memory `Map<string, {count, resetAt}>`, `checkRateLimit`, test-only `resetRateLimitState()`. ~20 other callers use `checkRateLimit` — **their behavior must not change**.
- Supabase auth-js 2.68: `AuthError` has `code` (`ErrorCode`), which includes `'invalid_credentials'` for a wrong email/password. Current user-facing mapping is `mapAuthErrorMessage(error.message)` in `lib/password-validation.ts` (message-string based) — keep it for display only.
- Existing tests: `apps/web/lib/__tests__/rate-limit.test.ts`. No login action test exists. Look at `app/actions/__tests__/` for the mocking pattern of `@/lib/supabase/server` and `next/navigation`.

## 3. In scope
**A. `lib/rate-limit.ts` — ADD a separate failure limiter (do not modify `checkRateLimit` or its map):**
A second in-memory store keyed by string. Each entry represents ONE window: `{ windowId: number, failures: number, open: Set<number>, resetAt: number }`, where `windowId` comes from a module-level monotonically increasing counter (never reused, even after deletion) and `open` holds the ids of outstanding reservations made in this window. Export:
- `reserveFailureAttempt(key, maxFailures, windowMs): { allowed: false } | { allowed: true; reservation: FailureReservation }` — synchronous. `FailureReservation` is an opaque object `{ key, windowId, id }` (`id` from another monotonic counter).
  - If an entry exists and is expired (`now > resetAt`): replace it with a NEW window entry (new `windowId`, `failures: 0`, empty `open`, `resetAt = now + windowMs`). Old outstanding reservations now belong to a window that no longer exists.
  - If `failures + open.size >= maxFailures` → `{ allowed: false }` (no mutation).
  - Otherwise create the entry if missing (new `windowId`, `failures: 0`, `resetAt = now + windowMs`), add the new reservation id to `open`, return it. This makes concurrent attempts race-safe: recorded failures + outstanding attempts in a window can never exceed `maxFailures`.
- `completeFailureAttempt(reservation: FailureReservation, outcome: "rejected" | "succeeded" | "errored"): void` — look up the entry for `reservation.key`. **If there is no entry, or `entry.windowId !== reservation.windowId`, or `entry.open` does not contain `reservation.id`, do nothing** (stale completion: it must not create, count against, or clear a newer window). Otherwise remove `reservation.id` from `open`, then: `"rejected"` → `failures += 1` (never extend `resetAt`); `"succeeded"` → delete the entry (clears the window; any other outstanding reservations from it become stale and will no-op); `"errored"` → no failure change. Delete the entry if `failures === 0 && open.size === 0`.
- `resetFailureLimiterState()` — test-only, like `resetRateLimitState`.
- Include the failure store in the existing periodic cleanup (delete entries that are expired; outstanding reservations of a deleted window simply become stale no-ops).

**B. `app/actions/login.ts`:**
- **Normalization invariant:** compute `const email = rawEmail.trim().toLowerCase()` once; use that exact value for BOTH the limiter key (`login:${email}`) AND `signInWithPassword({ email, password })` (today's behavior — keep it).
- `const result = reserveFailureAttempt(\`login:${email}\`, 5, 900_000)`; if `!result.allowed` → return today's blocked response unchanged (same text, `blocked: true`) without calling Supabase. Otherwise pass `result.reservation` to `completeFailureAttempt`.
- Wrap the Supabase call so the reservation is ALWAYS completed exactly once (use `try/finally` or equivalent; a thrown exception → `"errored"`, then rethrow or return today's behavior for unexpected errors).
- On `error` with `error.code === "invalid_credentials"` → `"rejected"`. Any other `error` (no code, other codes, 5xx/`unexpected_failure`, `request_timeout`, `over_request_rate_limit`, network) → `"errored"`. Either way return today's `mapAuthErrorMessage(error.message)` text — no new messages, no account-existence distinctions.
- On success → `"succeeded"` BEFORE calling `redirect("/")` (redirect throws by design; completion must not be skipped and must not be double-counted).
- Same key format, same 5 / 15-minute numbers, same user-facing text.

**C. Tests (Vitest, use `vi.useFakeTimers()` / a deterministic clock — no real sleeps):**
- `lib/__tests__/rate-limit.test.ts` (add): reserve allowed/blocked boundaries; `failures + inFlight` counting; rejected increments; succeeded clears; errored releases without counting; window expiry starts fresh; unexpired window never extended; expired entry with `inFlight > 0` not dropped by cleanup; `checkRateLimit` tests still pass unchanged.
- New `app/actions/__tests__/login.test.ts`:
  1. 10 successful sign-ins in a row are never blocked.
  2. 5 `invalid_credentials` failures → 6th attempt (even with correct password) is blocked and Supabase is NOT called.
  3. 4 failures → success → count cleared; 5 more failures needed to block.
  4. Emails differing only by case/whitespace share one counter AND Supabase receives the trimmed lowercase email.
  5. Blocked response text and `blocked: true` unchanged.
  6. 4 credential failures → one operational error (e.g., status 500 / code `unexpected_failure`) → 1 credential failure ⇒ exactly 5 counted (next attempt blocked), not 6.
  7. 20 consecutive operational errors (and errors with no `code`) never produce the blocked state.
  8. An error whose `code` is unknown/absent is NOT treated as a credential failure.
  9. **Concurrency:** with Supabase mocked to resolve `invalid_credentials` after a deferred promise, fire 10 `loginAction` calls in parallel for the same email → at most 5 reach Supabase; the rest return the blocked response.
  10. A thrown exception from `signInWithPassword` releases the reservation (subsequent attempts are not blocked by it).
  11. **Stale window:** reserve 3 attempts (deferred), advance the clock past 15 minutes, make a new-window attempt, then resolve the 3 old attempts as `invalid_credentials` → the new window's failure count is unaffected (assert via the next 5 attempts: exactly 5 more rejections are needed to block).
  12. **Success then stale rejection:** reserve 2 attempts (deferred); complete a third attempt as success; then resolve the 2 deferred as `invalid_credentials` → no failure entry is recreated (the next 5 rejections are needed to block).

## 4. Out of scope
- Shared/distributed storage (Redis/Supabase) or IP-based limiting — known limitation: the store is per server instance; Supabase Auth's own server-side limits are the backstop. Note it in the report only.
- `tests/e2e/smoke-theme.spec.ts` (moved to a separate L1 sprint), any other `checkRateLimit` caller, signup, password reset, magic link, OAuth, auth callback, middleware, `mapAuthErrorMessage`.
- Any UI/copy change. No DB, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`apps/web/lib/rate-limit.ts`, `apps/web/app/actions/login.ts`, `apps/web/lib/__tests__/rate-limit.test.ts`, `apps/web/app/actions/__tests__/login.test.ts` (new). Nothing else.

## 6. Implementation requirements
- `checkRateLimit` code and behavior unchanged: its lines must not appear as removed in the diff (additions elsewhere in the file are fine, including extending the cleanup interval body to also sweep the new store).
- Classification uses `error.code`, never message-string matching.
- No logging of email or password values.
- Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run gate:web
cd apps/web && npx vitest run lib/__tests__/rate-limit.test.ts app/actions/__tests__/login.test.ts
git diff -U0 apps/web/lib/rate-limit.ts | grep '^-' | grep -v '^---'   # only the closing lines of the cleanup interval may appear, if you extend it; report exactly what prints
git diff --stat
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- All 12 login scenarios and the new limiter cases pass with fake timers.
- `checkRateLimit` unchanged; no other caller touched.
- Only `invalid_credentials` increments the counter; operational errors never do.
- Concurrency test proves ≤ 5 requests reach Supabase.
- No files outside §5 changed.

## 9. Report format
Conform to `docs/codex-report-schema.json`. Put the per-instance limitation note, the 12 scenario results, and exactly what the `rate-limit.ts` removed-lines check printed in `self_verification.findings`.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
