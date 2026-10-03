# Sprint 144 — Login lockout counts only failed attempts + theme smoke signs in once per role

**Severity: L3** (auth: sign-in throttling). Requires Domus Prompt Engineer review before dispatch.

## 1. Objective
1. A user who signs in **successfully** must never be locked out. Only **failed** sign-in attempts count toward the lockout (still 5 failures per 15 minutes per email), and a successful sign-in clears that email's failure count.
2. The theme contrast smoke spec signs each smoke account in **once per run**, so routine smoke runs cannot trip the lockout.

## 2. Context
- Branch `main`, HEAD `63957bc`.
- `apps/web/app/actions/login.ts:31` today: `checkRateLimit(\`login:${email}\`, 5, 900_000)` runs **before** `signInWithPassword` and increments on every attempt, success or failure. Six correct sign-ins within 15 minutes → "Too many sign-in attempts. Wait 15 minutes or reset your password." Observed 2026-10-02 on the smoke owner account.
- `apps/web/lib/rate-limit.ts`: in-memory `Map<string, {count, resetAt}>`; `checkRateLimit(key, max, windowMs)` increments then decides; `resetRateLimitState()` is test-only. ~20 other callers use `checkRateLimit` for per-user action throttles — **their behavior must not change**.
- Existing tests: `apps/web/lib/__tests__/rate-limit.test.ts`. No login action test exists.
- `apps/web/tests/e2e/smoke-theme.spec.ts` (Sprint 143) logs in separately for Owner-dark, Owner-light, Manager-dark, Tenant-dark, Tenant-light (5 sign-ins; owner and tenant twice).

## 3. In scope
**A. `lib/rate-limit.ts` — add (do not modify `checkRateLimit`):**
- `isRateLimited(key: string, maxRequests: number): boolean` — read-only: true if an unexpired entry exists with `count >= maxRequests`. Never creates or increments.
- `recordRateLimitHit(key: string, windowMs: number): void` — increments the count (creating an entry with `resetAt = now + windowMs` if none/expired). Must not extend `resetAt` of an existing unexpired entry.
- `clearRateLimit(key: string): void` — deletes the entry.

**B. `app/actions/login.ts`:**
- Before signing in: if `isRateLimited(\`login:${email}\`, 5)` → return the existing blocked response unchanged (same text, `blocked: true`).
- Call `signInWithPassword` as today.
- On `error`: `recordRateLimitHit(\`login:${email}\`, 900_000)` then return the same mapped error as today.
- On success: `clearRateLimit(\`login:${email}\`)` then `redirect("/")` as today.
- Keep the same key format, the 5/15-minute numbers, and all user-facing text, and keep the email normalization (trim + lowercase).

**C. Tests (Vitest):**
- `lib/__tests__/rate-limit.test.ts`: add cases for `isRateLimited` (no entry → false; at max → true; expired → false; never increments), `recordRateLimitHit` (creates, increments, does not extend window), `clearRateLimit`.
- New `app/actions/__tests__/login.test.ts` (mock `@/lib/supabase/server` and `next/navigation` `redirect` following existing action-test patterns in `app/actions/__tests__/`): (1) 10 successful sign-ins in a row are never blocked; (2) 5 failures then a 6th attempt (even with correct password) is blocked without calling Supabase; (3) 4 failures then a success clears the count — 5 more failures are needed to block; (4) emails differing only by case/whitespace share one counter; (5) blocked response text and `blocked: true` unchanged.

**D. `tests/e2e/smoke-theme.spec.ts`:** restructure so each role signs in exactly once per run: one test per role that logs in once, then runs that role's dark views and (where applicable) light views by switching theme in-session (set `localStorage["domus-theme"]`, `page.emulateMedia({ colorScheme })`, reload). Keep the same views, thresholds, findings format, full-mode behavior, and the pure-function self-tests.

## 4. Out of scope
- Moving the limiter to shared storage (Redis/Supabase) or adding IP-based limiting — note as a known limitation in your report only. (Supabase Auth has its own server-side rate limits as a backstop.)
- Any other `checkRateLimit` caller, signup, password reset, magic link, OAuth, auth callback, middleware.
- Any UI/copy change. No DB, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`apps/web/lib/rate-limit.ts`, `apps/web/app/actions/login.ts`, `apps/web/lib/__tests__/rate-limit.test.ts`, `apps/web/app/actions/__tests__/login.test.ts` (new), `apps/web/tests/e2e/smoke-theme.spec.ts`. Nothing else.

## 6. Implementation requirements
- `checkRateLimit`'s code and behavior byte-for-byte unchanged (diff must show only additions in `rate-limit.ts`).
- No logging of email or password values.
- Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run gate:web
cd apps/web && npx vitest run lib/__tests__/rate-limit.test.ts app/actions/__tests__/login.test.ts
git diff -U0 apps/web/lib/rate-limit.ts | grep '^-' | grep -v '^---'   # must print nothing
cd apps/web && grep -c "loginAsRole(" tests/e2e/smoke-theme.spec.ts   # expect 3 call sites (one per role)
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- All 5 login scenarios and the new rate-limit cases pass.
- `rate-limit.ts` diff is additions only; other callers untouched.
- Theme spec signs in once per role (3 total) with unchanged view coverage.
- No files outside §5 changed.

## 9. Report format
Conform to `docs/codex-report-schema.json`. Put the per-instance in-memory limitation note and the login test scenario list in `self_verification.findings`.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
