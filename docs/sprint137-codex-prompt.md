# Sprint 137 — Reskin Phase 5: de-gamification (UI layer)

**Severity: L2** (UI removal; no money/auth/schema logic). Source: `docs/design-system.md` v2 ("A tool people trust with money — not a game. Removed: mascot, XP & levels, streaks, achievements, celebration toasts. Payment history shown as a plain fact."). Attached image: v2 reference screenshot.

## 1. Objective
Remove every user-visible game element — the mascot ("Dom"), XP/level widgets, streaks, achievements, celebration toasts/confetti — from every surface, replacing each with a plain v2 equivalent (icon, plain fact, or nothing). Backend XP awarding is deliberately left running and invisible; it is removed in a later L3 sprint.

## 2. Context
- Branch `main`, HEAD (current). All surfaces are on v2 tokens; this is the last cartoon layer.
- Game UI components: `components/gamification/{dom-mascot,achievement-card,achievement-checker,celebration,gamification-summary,level-badge,streak-display,streak-heatmap,xp-bar}.tsx`. Mascot images: `public/images/mascot/**`.
- UI importers (verified 2026-10-02): `app/achievements/page.tsx`, `app/auth/confirm/page.tsx`, `app/complete-profile/page.tsx`, `app/error.tsx`, `app/global-error.tsx`, `app/join-llc/page.tsx`, `app/layout.tsx`, `app/manager/error.tsx`, `app/onboarding/page.tsx`, `app/owner/error.tsx`, `app/tenant/error.tsx`, `app/tenant/page.tsx`, `components/dashboard/{action-items,index,lease-wizard,onboarding-checklist,pay-rent-card,tenant-invite-wizard,unified-property-wizard,welcome-card}.tsx`, `components/dashboard/sidebar/sidebar-nav.tsx`, `components/onboarding/steps/completion-step.tsx`, `components/shared/{domus-logo,empty-state}.tsx`.
- **Backend (DO NOT TOUCH this sprint):** `app/actions/*` XP calls, `lib/stripe-webhook-handlers.ts`, `lib/gamification.ts`, `app/api/gamification/**`, DB tables/RPCs, crons.
- Carry-over finding: settings notification toggles' "on" knob is low-contrast in dark mode (`components/settings/notification-preferences.tsx` or the toggle primitive it uses) — fix in this sprint.

## 3. In scope
1. Remove all renders of game components from the UI importers above. Replacements:
   - Mascot in empty states / error pages / onboarding / complete-profile / confirm / join-llc → a single lucide icon in a `--surface-2` circle, or nothing where the layout is fine without it.
   - `domus-logo.tsx` → a clean v2 mark: "Domus" wordmark (and a simple neutral icon if one is needed) — no mascot.
   - Progress/XP/level/streak cards (tenant page, sidebar, dashboard) → removed; where the slot held useful info, show a plain fact (e.g., "On-time payments: N of M" ONLY if the data is already loaded on that page — no new queries).
   - Celebration toasts/confetti → plain success toasts (Sonner) or nothing.
   - `AchievementChecker` (client poller in layout/dashboard) → removed from the UI so no game toasts can fire.
2. `/achievements` route → server redirect to the user's role home (keep the route file as a redirect so old links don't 404).
3. Delete `components/gamification/*` files and `public/images/mascot/**` ONLY if a full-tree grep proves zero remaining importers (L-006). Otherwise leave and list what still references them.
4. Remove `canvas-confetti` from `apps/web/package.json` if it becomes unused (run install to update the lockfile).
5. Fix the dark-mode toggle knob contrast.
6. Plain-language check on any replacement copy (log changes).

## 4. Out of scope
- Everything listed under Backend above. No DB, deploy, env, commit, push.
- Marketing/landing (Phase 6) — note any mascot use there in `deviations` but do not change it. Email/PDF (Phase 7).
- No layout redesigns beyond filling the space a removed widget leaves (collapse gracefully; no empty holes).

## 5. Exact files expected to change
The UI importer files in §2, the toggle file, `apps/web/package.json` + lockfile (if confetti removed), deleted gamification component files / mascot images (if provably unused), and tests whose assertions reference removed elements (update or delete those assertions; list each). Nothing under the Backend list.

## 6. Implementation requirements
- Tokens only (defined in `app/globals.css`). Primitives from `components/ui/*`.
- No new data queries. No server-action changes.
- You may use parallel sub-agents (multi-agent) to split surfaces (e.g., errors/auth pages, dashboard, tenant) — keep one coherent diff.
- **Self-verification with Playwright (required):** start the app locally (`npm run dev --workspace @domus/web`), then run `APP_URL=http://localhost:3000 npx playwright test tests/e2e/smoke-auth.spec.ts` from `apps/web` (smoke credentials are in `apps/web/.env.local` as `SMOKE_*`; they are test fixtures). Additionally capture screenshots of owner home, tenant home, `/login`, and `/achievements` (expect redirect) in light and dark into `/tmp/codex-137/`, and inspect them for any remaining mascot/XP/streak/achievement element. Report what you saw.

## 7. Validation commands
```bash
npm run gate:web
rg -i "DomMascot|images/mascot|xp-bar|level-badge|streak-|achievement-card|gamification-summary|celebration|AchievementChecker|canvas-confetti" apps/web/app apps/web/components --glob '!**/__tests__/**' --glob '!**/marketing/**' --glob '!**/api/gamification/**'
rg -o "var\(--[a-z0-9-]+\)" <changed files> | sort -u   # each must exist in apps/web/app/globals.css
```
The second command must return zero lines except inside Backend-listed files (which are outside these roots anyway) and marketing (list any).

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network is enabled — real result).
- Game-UI sweep returns zero lines in app/components (marketing exceptions listed).
- `/achievements` redirects to role home.
- Backend files byte-identical (no diffs in the Backend list).
- Playwright smoke 3/3 against local, screenshots inspected, findings reported.
- Toggle knob readable in dark.

## 9. Report format
Final message must conform to the attached JSON schema. Use `self_verification` for the Playwright run + screenshot findings; `deviations` for marketing mascot locations and anything left un-deleted with its remaining importers.
No "Claude prompt" sections.

## 10. Constraints
No DB apply. No deploy. No env changes. No commit/push — leave the working tree for Claude.
