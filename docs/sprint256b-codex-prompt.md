# Sprint 256b — Supabase client security patch: @supabase/supabase-js 2.50.0 (L2: dependency) — rev 1

## 1. Objective
`npm audit`: `@supabase/auth-js <= 2.69.1` "Vulnerable to Insecure Path Routing from Malformed User Input"
(GHSA-8r88-6cj9-9fh5), pulled in by `@supabase/supabase-js@2.49.1` (auth-js 2.68.0). The smallest fixed release is
`@supabase/supabase-js@2.50.0` (auth-js 2.70.0, postgrest-js 1.19.4 — same 1.x line as today's 1.19.2). Apply only
this pin.

## 2. Context
`apps/web/package.json`: `"@supabase/supabase-js": "2.49.1"` (exact pin), `"@supabase/ssr": "0.5.2"` (peer
`@supabase/supabase-js ^2.43.4` — unchanged). Root `package-lock.json`.

## 3. In scope
Set `"@supabase/supabase-js": "2.50.0"` (exact). Run `npm install` at the repo root. No other dependency changes.

## 4. Out of scope
`@supabase/ssr`, any newer supabase-js (2.118 moves postgrest-js to 2.x — separate sprint), any source change.

## 5. Exact files expected to change
`apps/web/package.json`, `package-lock.json`.

## 6. Implementation requirements
If typecheck or tests fail because of the bump, stop and report the exact errors (do not edit source).

## 7. Validation
```
npm ls @supabase/supabase-js @supabase/auth-js @supabase/postgrest-js --workspace apps/web
npm audit --omit=dev
```
then `npm run gate:web`.

## 8. Acceptance criteria
- S1 `npm ls` shows supabase-js 2.50.0, auth-js ≥ 2.69.2, postgrest-js 1.x (one copy each).
- S2 `npm audit --omit=dev` no longer lists `@supabase/auth-js` / `@supabase/supabase-js`.
- S3 Gate green (counts verbatim).

## 9. Report format
Compact status only: S1–S3, remaining audit list. Do NOT include 'Claude prompt' or 'recommended next steps for
Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow (no UI change).
Claude verifies sign-in for all three roles (smoke), the magic-link callback and middleware session refresh on
production after deploy.
