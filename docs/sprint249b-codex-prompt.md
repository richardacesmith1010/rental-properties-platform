# Sprint 249b — Install banner sits above the tab bar only when a tab bar is shown (L2)

## 1. Objective
249a moved the "Install Domus for quick access" banner to a fixed 96 px above the bottom on phones. On pages
**without** a tab bar (e.g. `/login` on iPhone Safari) that put the banner over the **Sign in** button, so Claude
rolled it back (`7f8e876`, banner back at `bottom-4`). Do it properly: lift the banner only while a phone tab bar is
on screen.

## 2. Context
- HEAD `7f8e876`. `apps/web/components/pwa/install-prompt.tsx:242` wrapper
  `pointer-events-none fixed inset-x-0 bottom-4 z-[70] px-4`.
- Tab bars (phones only, `lg:hidden`): `components/dashboard/owner-bottom-bar.tsx` (portal, `h-[84px]`),
  `components/dashboard/tenant-bottom-bar.tsx` (portal; height from padding + content). No manager bar.
- Test: `components/pwa/__tests__/install-prompt.test.tsx:31` currently expects `bottom-4`.

## 3. In scope
1. Each tab bar, while mounted **and visible** (below `lg`), sets the CSS variable `--domus-tabbar-height` on
   `document.documentElement` to its measured height in px (`ResizeObserver` on the nav element; set on mount and on
   resize; **remove** the variable on unmount). Hidden at `lg` (display none) → height 0 → set `0px`.
2. The banner wrapper uses `bottom-[calc(var(--domus-tabbar-height,0px)+1rem)]` (replacing `bottom-4`). Without a tab
   bar this equals today's `bottom-4`.
3. Tests.

## 4. Out of scope
Banner copy, when it shows, iOS Safari policy, tab bar visuals.

## 5. Exact files expected to change
- `apps/web/components/pwa/install-prompt.tsx`
- `apps/web/components/dashboard/owner-bottom-bar.tsx`, `apps/web/components/dashboard/tenant-bottom-bar.tsx`
  (or one shared hook in an existing file, e.g. `components/dashboard/owner-bottom-bar.tsx` exporting
  `useTabbarHeightVar` used by both — no new file unless both bars import it)
- Tests: `apps/web/components/pwa/__tests__/install-prompt.test.tsx`, `apps/web/components/__tests__/owner-bottom-bar.test.tsx`,
  `apps/web/components/__tests__/tenant-bottom-bar.test.tsx`

## 6. Implementation requirements
SSR-safe (no `window`/`document` access during render). Lines ≤ 140 characters.

## 7. Validation
```
cd apps/web
npx vitest run components/pwa/__tests__/install-prompt.test.tsx components/__tests__/owner-bottom-bar.test.tsx \
  components/__tests__/tenant-bottom-bar.test.tsx
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria
- B1 Banner wrapper class contains `bottom-[calc(var(--domus-tabbar-height,0px)+1rem)]` and not `bottom-4`.
- B2 Mounting `OwnerBottomBar` sets `--domus-tabbar-height` on `document.documentElement` to the nav's measured height
  (mock `ResizeObserver`/`getBoundingClientRect` → 84 → `"84px"`); unmounting removes it. Same for `TenantBottomBar`.
- B3 With no tab bar mounted the variable is absent (banner falls back to `0px + 1rem`).
- B4 Gate green.

## 9. Report format
Compact status only. Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact
status only.

## 10. Constraints
Stay inside §5. Do not commit. Claude verifies live in WebKit iPhone: on `/login` the banner does not cover Sign in;
on `/owner` and `/tenant` the banner's bottom edge is above the tab bar's top edge.
The user should never need to read instructions to complete this flow: nothing covers the buttons they need.
