# Sprint 143 — Theme contrast smoke check (catch dark/light breakage on every deploy)

**Severity: L1** (test + smoke-script tooling only; no app code).

## 1. Objective
Add an automated Playwright check that signs in as each smoke role and fails if any screen shows **near-invisible text** (in light or dark theme) or **light boxes in dark theme**. Wire it into `scripts/smoke-web.sh` so every authenticated smoke run includes it. Keep the default run fast (≤ ~2 min); offer a full mode.

## 2. Context
- Branch `main`, HEAD `9b04f6a`. Existing authenticated smoke: `apps/web/tests/e2e/smoke-auth.spec.ts` (3 roles, zero-console-error assertion), invoked by `scripts/smoke-web.sh` ~lines 82-105 when `SMOKE_*` env vars are set. Login helper: `loginAsRole` in `apps/web/tests/e2e/helpers.ts`.
- Theme switching: the app reads `localStorage["domus-theme"]` (`"light" | "dark" | "system"`) and `prefers-color-scheme`. Set both: `page.addInitScript(() => localStorage.setItem("domus-theme", "<t>"))` + `page.emulateMedia({ colorScheme: "<t>" })` before navigating.
- Owner/manager dashboard sections are reached via the command palette: click the element containing text "Search navigation", type the section label, press Enter, wait for content. Section labels (owner): Overview, Charges, Payments, Maintenance, Leasing Hub, Applications, Manager Payments, Inbox, Notifications, Activity, Ownership, Invitations, Documents, Vendors, Expenses, Analytics, Operations, Portfolio, Units, Leases, Tenants. A label may be absent for a role — skip it if no matching `role=option` appears.
- Sprint 142 just fixed these; current production should pass with zero findings. A prior ad-hoc version of this check had a bug: computed colors from `color-mix()` come back as `color(srgb r g b / a)` with 0–1 channels, not `rgb(0-255)`. Handle both formats.
- Codex's sandbox cannot launch a browser. You cannot execute this spec; Claude will run it against production. Make it correct by construction and typecheck/lint clean.

## 3. In scope
1. New spec `apps/web/tests/e2e/smoke-theme.spec.ts`:
   - Same env-var guard/skip pattern as `smoke-auth.spec.ts`.
   - A color parser handling `rgb()`, `rgba()`, and `color(srgb …)`; WCAG relative luminance + contrast ratio helpers.
   - **Effective background**: for a text element, walk up ancestors compositing semi-transparent backgrounds until reaching an opaque one (fallback: the `body` background). Ignore elements that are not visible (zero size, `visibility:hidden`, `opacity:0`, `display:none` ancestors) or are `sr-only`.
   - **Finding A — near-invisible text** (both themes): an element with its own direct non-whitespace text node whose contrast vs effective background is **< 2.0**. (Threshold is deliberately low: it catches broken text, not merely muted text.)
   - **Finding B — light box in dark theme**: an element inside `main` or `[role=dialog]`, ≥ 60×18 px, whose own background (alpha > 0.5) has relative luminance > 0.8.
   - Scope scans to `main` and `[role=dialog]` (not the sidebar or floating Feedback button).
   - Views per run:
     - **Default:** Owner: home + Units, Leases, Expenses, Operations, Documents, Leasing Hub. Manager: home + Vendors, Maintenance. Tenant: `/tenant`, `/tenant?section=notifications`, `/settings`. Each in **dark**; Owner home + Tenant home also in **light**.
     - **Full (`SMOKE_THEME_FULL=1`):** every owner section label above + manager home + all tenant views, both themes.
   - Assertion: per view, zero findings. On failure, the message lists role, theme, view, and up to 5 examples (text snippet or className, colors, ratio).
2. `scripts/smoke-web.sh`: after the existing authenticated render check, run `npx playwright test tests/e2e/smoke-theme.spec.ts --reporter=line` under the same `HAS_SMOKE_CREDS` condition; a failure fails smoke. Print a one-line `[smoke] Checking theme contrast` banner like the others.
3. `apps/web/package.json`: add script `"smoke:theme": "playwright test tests/e2e/smoke-theme.spec.ts --reporter=line"` (if a scripts pattern for e2e already exists, follow it).

## 4. Out of scope
- Any app code, components, CSS, tokens. No changes to `smoke-auth.spec.ts` behavior. No new dependencies.
- No DB, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`apps/web/tests/e2e/smoke-theme.spec.ts` (new), `scripts/smoke-web.sh`, `apps/web/package.json`. Nothing else.

## 6. Implementation requirements
- Put the color/contrast math in plain functions inside the spec (or a small `tests/e2e/contrast.ts` helper — if so, add it to §5 in your report) and add a tiny Vitest-free self-check: export the pure functions and include 4–6 `test()` cases in the same spec file that need no browser/login (e.g., white on white = 1.0, black on white = 21, `color(srgb 1 1 1 / 0.94)` parses to near-white, composite of 50% black over white ≈ mid-gray). These run first and need no env vars.
- Reuse `loginAsRole`. Run roles serially. Add generous but bounded waits (content load after palette navigation ≤ 6 s).
- Do not log or print any credential values.

## 7. Validation commands
```bash
npm run gate:web
cd apps/web && npx tsc --noEmit -p . 2>&1 | head -5
cd apps/web && npx playwright test tests/e2e/smoke-theme.spec.ts --list
bash -n scripts/smoke-web.sh
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- Spec lists the pure-function tests plus the role/theme tests; typecheck + lint clean; `bash -n` clean.
- `smoke-web.sh` runs the theme spec only when smoke creds are present; failure propagates.
- No files outside §5 changed (helper file allowed if reported).

## 9. Report format
Conform to `docs/codex-report-schema.json`. `self_verification.attempted=false` with blocked_reason "no browser in sandbox" is expected; put the default/full view lists and thresholds in `findings`.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude. Do not invent URLs or emails.
