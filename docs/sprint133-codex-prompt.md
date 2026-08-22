# Sprint 133 — Reskin Phase 1b: finish the owner surface + log-metadata hygiene

**Severity: L2** (visual completion + a logging-metadata fix; no money/auth/schema logic). Source of truth: `docs/design-system.md` v2. Completes what Sprint 132 started — after this sprint, the owner surface has ZERO legacy purple.

## 1. Objective
1. Convert every remaining owner-reachable component off legacy `violet-*`/`purple-*`/`indigo-*`/`bg-white`/hardcoded-hex styling onto v2 tokens/primitives (both themes).
2. Fix the two known dark-mode contrast bugs on the settings shell (explicit narrow exception to the phase map).
3. Strip user email from `[perf:owner]` log metadata (userId stays).

## 2. Context
- Branch `main`, HEAD `d9192b9`. Phases 0/1 live: tokens, primitives, neutral rail, owner shell/KPIs/charts/reports/drill-down on v2.
- Verified remnant inventory (grep 2026-08-22, counts = matching lines):
  - `components/dashboard/invitations/*` (2), `maintenance-tracker.tsx` (3), `maintenance-comment-thread.tsx` (2), `distribution-config-panel.tsx` (7), `ownership/*` (4), `inbox-section.tsx` (3), `connect-banner.tsx` (1), `app/owner/error.tsx` (3), `app/owner/setup/page.tsx` (1).
  - Additional owner-reachable files found by sweep: `global-search.tsx`, `llc-setup-prompt.tsx`, `forms/property-form.tsx`, `forms/unit-form.tsx`, `forms/lease-form.tsx`, `expenses/expense-form.tsx`, `activity-feed.tsx`, `sidebar/sidebar-nav.tsx` (leftover class).
- Settings contrast bugs (from Phase 0 walk, `app/settings/page.tsx`): line ~77 h1 `text-zinc-900` (dark-on-dark in dark mode); line ~84 "Back to Workspace" pill `bg-white` + zinc classes.
- Email leak: `app/owner/owner-page-data.ts` ~line 682 passes `userEmail` into the `feedback.new-count` perf-meta object (the function argument itself is legitimate — only the log metadata leaks it).

## 3. In scope
1. Token conversion of every file listed in §2 (both the 9 originals and the sweep additions), matching the v2 component conventions already established in Phase 0/1 (primitives, semantic status pairs, accent focus rings, no gradients/glow).
2. `app/settings/page.tsx` ONLY the two flagged spots: h1 → `text-[var(--ink)]`-equivalent tokens; back pill → ghost-button tokens. Nothing else in settings.
3. `owner-page-data.ts`: remove `userEmail` from the perf `meta` object (keep passing it to `getNewFeedbackCountForOwner`). No other instrumentation changes.
4. A final repo sweep: after your changes, `rg "violet-|purple-|indigo-" apps/web/components/dashboard apps/web/app/owner` must return ZERO lines (report the command output). `bg-white` allowed only where a file is genuinely tenant/manager-only — list any such file left.

## 4. Out of scope
- Tenant surface (`pay-rent-card.tsx`, tenant page/components — Phase 2), manager surface (Phase 3), rest of settings (Phase 4), gamification removal (Phase 5), marketing/emails/PDFs.
- No behavior, copy-meaning, data, routing, or loader changes. No DB, no deploy, no env, no commit/push.
- Do not touch `lib/` except nothing — no lib changes at all this sprint (owner-page-data.ts is app/, allowed per §3.3).

## 5. Exact files expected to change
- `apps/web/components/dashboard/invitations/*` (its files), `maintenance-tracker.tsx`, `maintenance-comment-thread.tsx`, `distribution-config-panel.tsx`, `ownership/*` (its files), `inbox-section.tsx`, `connect-banner.tsx`, `global-search.tsx`, `llc-setup-prompt.tsx`, `activity-feed.tsx`, `sidebar/sidebar-nav.tsx`, `forms/property-form.tsx`, `forms/unit-form.tsx`, `forms/lease-form.tsx`, `expenses/expense-form.tsx`
- `apps/web/app/owner/error.tsx`, `apps/web/app/owner/setup/page.tsx`
- `apps/web/app/settings/page.tsx` (two spots only)
- `apps/web/app/owner/owner-page-data.ts` (meta object only)
- Component tests whose class assertions change (update assertions only; list each)

## 6. Implementation requirements
- Use existing primitives (`components/ui/*`) where a hand-rolled element duplicates one (buttons, badges, inputs) — replace, don't restyle duplicates.
- Status colors via `lib/status-colors.ts` utilities or the semantic token pairs — never raw tailwind color names.
- Focus states: accent ring pattern from Phase 0 primitives.
- Both themes: no hardcoded hexes; token vars only. Check each converted view mentally against dark (`--surface` on `--ground`, `--ink` text).
- `connect-banner.tsx`: keep the amber/warn styling INTENT for the not-connected state but express it through the `--warn` pair.
- Plain language: fix any label you touch that violates the rules (log each).

## 7. Validation commands
```bash
npm run gate:web
rg "violet-|purple-|indigo-" apps/web/components/dashboard apps/web/app/owner
```
(Second command's empty output goes in the report.)

## 8. Acceptance criteria (binary)
- `gate:web` passes; 974-test baseline green (updated assertions listed).
- The §7 sweep returns zero lines.
- No `bg-white` in owner-reachable files (exceptions listed + justified).
- Settings: exactly the two flagged spots changed, nothing else in the file's render output.
- `[perf:owner]` meta contains no email field anywhere (`rg userEmail apps/web/app/owner/owner-page-data.ts` shows only the function-argument usage).
- No diffs outside §5.

## 9. Report format (required status booleans)
`gate_passed`, `owner_sweep_zero_remnants`, `settings_two_spots_only`, `perf_meta_email_removed`, `primitives_reused_not_duplicated`, `no_out_of_scope_diffs`, `tests_updated_and_passing`.
Plus: files changed, copy changes, sweep command output, deviations.
`MANUAL_VERIFICATION_PATH`: 1) smoke owner → walk Invitations, Maintenance, Ownership/LLC panels, Inbox, Setup page, trigger the error boundary if reachable — all v2 in light+dark, no purple anywhere; 2) settings in dark mode → h1 readable, back pill themed; 3) authenticated smoke 3/3; 4) Vercel logs show `[perf:owner]` lines without email.
No "Claude prompt" sections.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude's review/deploy/walk.
