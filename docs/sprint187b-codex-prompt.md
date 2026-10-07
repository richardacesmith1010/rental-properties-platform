# Sprint 187b — Phone bell panel stays on screen (L1) · Category 10: Visual

## 1. Objective
After Sprint 187, the desktop sidebar bell panel is fully on screen (live: left 208, right 528 at 1280 px). On phones it still is not.

In `MobileTopBar` (`apps/web/components/dashboard/sidebar/sidebar-nav.tsx` ~line 391), the bell sits left of the account chip, not at the screen edge. With `align="end"` (`right-0`), the 24 rem panel overflows the left edge. Live at 375 px: `left: -114, right: 238`.

Make the mobile panel span the screen width just below the top bar.

## 2. Context
- Branch `main`, HEAD `9b2093d` or a later docs-only commit.
- `NotificationBellMenu` (`apps/web/components/dashboard/notification-bell-menu.tsx`) already accepts `panelClassName`, merged via `cn(...)` after the base classes `absolute top-full z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] ... right-0|left-0`.
- The mobile top bar is `sticky top-0` with `pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3` and 44 px buttons, and is hidden at `lg`.

## 3. In scope
1. In `MobileTopBar`, pass a `panelClassName` that makes the panel `fixed`, horizontally inset 12 px on both sides (`inset-x-3`), `w-auto`, and positioned just below the top bar (account for the safe area). Its height must be limited so it fits on screen, with internal scroll (for example `max-h-[calc(100dvh-6rem)]`, plus `overflow-y-auto` on the panel or its list if not already scrollable).
   - Check that `cn` merges these over the base `absolute` / width / `right-0` classes. If `cn` does not resolve the conflicts (no tailwind-merge), handle it in the smallest safe way inside `notification-bell-menu.tsx`, without changing the desktop result.
2. A test asserting the mobile placement's panel gets the fixed/inset classes and the desktop one does not.

## 4. Out of scope
- The panel's contents, the desktop placement, other menus. Deploy, commit, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/components/dashboard/sidebar/sidebar-nav.tsx`
- `apps/web/components/dashboard/notification-bell-menu.tsx` (only if needed per §3.1)
- `apps/web/components/__tests__/notification-bell-menu.test.tsx` or `owner-navigation.test.tsx`

## 6. Implementation requirements
- Lines must be ≤ 140 characters, with no copy changes.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- the touched tests
- `npm run gate:web`

## 8. Acceptance criteria (binary)
1. The mobile placement passes the fixed/inset panel classes; the desktop placement is unchanged. Tests prove both.
2. The gate passes, and only §5 files changed.
3. **Claude, after deploy:** at 375 px and 1280 px, in light and dark mode, the panel satisfies `left >= 0` and `right <= innerWidth`, and the panel bottom is ≤ `innerHeight`. 27/27 specs, Sentry clean, CI green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, plus whether `cn` uses tailwind-merge. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies.
