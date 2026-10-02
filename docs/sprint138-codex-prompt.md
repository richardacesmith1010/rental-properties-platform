# Sprint 138 — Sentry error monitoring (Next.js SDK)

**Severity: L2** (additive observability; no money/auth/schema logic changed; runtime is a no-op when the DSN env var is unset). Touches `next.config.mjs` (CSP) — kept to one additive `connect-src` host.

## 1. Objective
Send production errors (server, edge, and browser) from `apps/web` to Sentry project `domus-z1/domus-web`, with privacy-safe defaults suitable for a money app, so Claude can read real errors via the Sentry connector instead of guessing (L-008).

## 2. Context
- Branch `main`, HEAD `ec37842`. Next.js **14.2.5** App Router, deployed on Vercel (push to main auto-deploys).
- No Sentry code exists yet. No `instrumentation.ts`.
- CSP lives in `apps/web/next.config.mjs` (`connect-src` must allow Sentry ingest).
- Error boundaries: `app/global-error.tsx`, `app/error.tsx`, `app/{owner,tenant,manager}/error.tsx`.
- DSN will be provided at runtime by Claude via Vercel env var `NEXT_PUBLIC_SENTRY_DSN` (Production + Preview). Do NOT hardcode it.

## 3. In scope
1. Add `@sentry/nextjs` to `apps/web` — pick the newest major that officially supports Next 14.2 (check its peerDependencies with network; report the version chosen).
2. Init files per that SDK version's App Router docs: client config (`instrumentation-client.ts` or `sentry.client.config.ts`, whichever the chosen version uses), `sentry.server.config.ts`, `sentry.edge.config.ts`, and `instrumentation.ts` with `register()` + `onRequestError` export (enable `experimental.instrumentationHook` in `next.config.mjs` if Next 14.2 requires it).
3. All inits share these settings:
   - `dsn: process.env.NEXT_PUBLIC_SENTRY_DSN` — if unset, Sentry must not initialize (no errors, no network).
   - `enabled` only when `NODE_ENV === "production"`.
   - `environment: process.env.VERCEL_ENV ?? "development"`.
   - `sendDefaultPii: false`; `tracesSampleRate: 0` (errors only — no performance tracing); NO Session Replay integration.
   - `beforeSend` scrubber: drop `request.cookies`, `request.data`, `request.headers.authorization`/`cookie`, and any `extra`/`contexts` keys matching `/token|secret|password|key|account|routing|iban|card/i`.
4. Wrap `next.config.mjs` export with `withSentryConfig` with: `silent: true`, **no source-map upload** (no auth token exists yet — set the option that disables upload/telemetry so the build never needs `SENTRY_AUTH_TOKEN`), `disableLogger: true`, no `tunnelRoute`.
5. CSP: append `https://*.ingest.us.sentry.io` to `connect-src` only. No other header changes.
6. `app/global-error.tsx` and the four `error.tsx` boundaries: call `Sentry.captureException(error)` in a `useEffect` on mount. No visual/copy changes.
7. Add `NEXT_PUBLIC_SENTRY_DSN=` (empty) to `apps/web/.env.example` if that file exists.
8. A unit test for the `beforeSend` scrubber (put the scrubber in a small shared module, e.g. `lib/sentry-scrub.ts`, imported by all three configs — no duplication).

## 4. Out of scope
- No source-map upload, no auth token, no Sentry CLI, no wizard (`npx @sentry/wizard` is interactive — do not run it).
- No performance tracing, replay, profiling, user feedback widget, or `tunnelRoute`.
- No changes to server actions, Stripe/Plaid code, auth, middleware logic, DB, or UI.
- No env/secret changes, no deploy, no commit/push.

## 5. Exact files expected to change
`apps/web/package.json`, root `package-lock.json`, `apps/web/next.config.mjs`, `apps/web/instrumentation.ts` (new), Sentry client/server/edge config files (new, at `apps/web/` root), `apps/web/lib/sentry-scrub.ts` (new) + its test, `apps/web/app/global-error.tsx`, `apps/web/app/error.tsx`, `apps/web/app/{owner,tenant,manager}/error.tsx`, `apps/web/.env.example` (if present). Nothing else.

## 6. Implementation requirements
- Follow the official `@sentry/nextjs` manual-setup docs for the version you pick (fetch them with network).
- Build must succeed with `NEXT_PUBLIC_SENTRY_DSN` unset AND with it set to a dummy (`https://abc@o1.ingest.us.sentry.io/1`) — run both.
- No bundle bloat beyond the Sentry SDK itself (no replay/tracing integrations imported).

## 7. Validation commands
```bash
npm run gate:web
NEXT_PUBLIC_SENTRY_DSN=https://abc@o1.ingest.us.sentry.io/1 npm run build --workspace @domus/web
git diff --stat
rg -n "replayIntegration|browserTracingIntegration|tunnelRoute|authToken" apps/web --glob '!node_modules'
```
The last command must return zero lines.

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled — real result).
- Build passes with DSN set and unset; no `SENTRY_AUTH_TOKEN` needed.
- CSP diff is exactly one added host in `connect-src`.
- Scrubber test passes; scrubber is a single shared module.
- All five error boundaries call `captureException`; zero visual/copy diffs.
- No files outside §5 changed.

## 9. Report format
Final message must conform to the attached JSON schema (`docs/codex-report-schema.json`). Put the chosen SDK version and any doc-driven choices (e.g., instrumentation hook flag) in `deviations`. `self_verification.attempted=false` is fine (no browser in sandbox).
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
