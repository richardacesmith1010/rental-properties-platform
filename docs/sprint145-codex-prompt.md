# Sprint 145 — Theme smoke: exempt readable inverted controls + one sign-in per role

**Severity: L1** (test tooling only; no app code).

## 1. Objective
1. Stop the theme contrast smoke check from flagging intentionally inverted controls (a light button with dark text in dark mode is readable and correct).
2. Sign each smoke account in exactly once per run (split out of Sprint 144 by the L3 review).

## 2. Context
- Branch `main`, HEAD `44a21ea`. Spec: `apps/web/tests/e2e/smoke-theme.spec.ts` (Sprint 143). Run by `scripts/smoke-web.sh` and `npm run smoke:theme`.
- Current false positive (2026-10-03, prod): Owner | dark | home → "light box in dark theme" on the "Reconnect bank" link in `components/dashboard/stripe-health-banner.tsx:40` (background `rgb(236,237,239)`, dark text). It appears because the smoke owner's Stripe status is now restricted/missing.
- The spec currently signs in 5 times (Owner dark, Owner light, Manager dark, Tenant dark, Tenant light).
- Codex's sandbox cannot launch a browser; Claude runs the spec against production.

## 3. In scope
1. **Light-box rule exemption:** do NOT report a "light box in dark theme" for an element that is (or is inside, within 2 ancestor levels, a sized element that is) an interactive control — `a`, `button`, `[role=button]`, `[role=tab]`, `input[type=submit]`, `summary` — when the control's own text color vs its own background has contrast ratio **≥ 4.5**. Controls whose text contrast is < 4.5 must still be reported. Near-invisible text rule (contrast < 2.0) is unchanged and still applies to controls.
2. **One sign-in per role:** restructure into one test per role: sign in once, run that role's dark views, then (Owner, Tenant) switch to light in-session — set `localStorage["domus-theme"]="light"`, `page.emulateMedia({ colorScheme: "light" })`, reload — and run the light views. Same views, thresholds, full-mode behavior, and failure message format; findings report role + theme + view as today.
3. Add pure-function self-tests for the exemption decision (e.g., light button with dark text ≥ 4.5 → exempt; light button with light-gray text → not exempt; light non-interactive div → not exempt).

## 4. Out of scope
- Any app code (including `stripe-health-banner.tsx`), `smoke-auth.spec.ts`, `smoke-web.sh`, thresholds other than the new exemption.
- No DB, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`apps/web/tests/e2e/smoke-theme.spec.ts` only.

## 6. Implementation requirements
- Keep pure helpers exported/testable as today. No credential values logged.

## 7. Validation commands
```bash
npm run gate:web
cd apps/web && npx playwright test tests/e2e/smoke-theme.spec.ts --list
cd apps/web && grep -c "loginAsRole(" tests/e2e/smoke-theme.spec.ts   # expect 3
```

## 8. Acceptance criteria (binary)
- Gate passes; spec lists self-tests + 3 role tests; exactly 3 `loginAsRole(` call sites.
- Exemption self-tests pass; non-interactive light boxes and low-contrast controls still reported.
- Only the spec file changed.

## 9. Report format
Conform to `docs/codex-report-schema.json`. `self_verification.attempted=false` (no browser) is expected.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push. Do not invent URLs or emails.
