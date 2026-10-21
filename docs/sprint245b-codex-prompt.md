# Sprint 245b — Phone More menu opens fast and taps land on the right row (L2)

## 1. Objective
On phones (web and the iPhone app), the owner/manager **More** menu opens about 1 s late, and after a swipe the list
keeps gliding, so a tap lands on the wrong row. Make the menu open in ≤ 250 ms of animation, scroll as one list that
stops where the finger lifts, and never scroll the page behind it.

## 2. Context
- HEAD `bfd82e3`. All drawers use `apps/web/components/ui/mobile-drawer.tsx` (36 lines): vaul 1.1.2
  `Drawer.Root direction="left"`, overlay `bg-black/45 backdrop-blur-[2px]`, an inner `overflow-y-auto` div.
- Owner bar `apps/web/components/dashboard/owner-bottom-bar.tsx` (127 lines) → `StandaloneDrawer` (plain `<a href>` rows).
  On `/owner` the More button opens `MobileTopBar`'s drawer in
  `apps/web/components/dashboard/sidebar/sidebar-nav.tsx` (504 lines; nested `overflow-y-auto` at ~403 and the `nav`
  at ~290/416; rows wrapped in `Drawer.Close`; `onMouseEnter` → `preloadSection` at ~164, which iOS fires on tap).
- Root causes (Claude's read of vaul `node_modules/vaul/dist/index.mjs`):
  1. vaul's default slide is 0.5 s with a slow-tail ease (`cubic-bezier(.32,.72,0,1)`), plus the body is pinned
     (`position: fixed`) on open in WebKit, which re-lays out the big dashboard first.
  2. Two stacked `backdrop-blur` layers (overlay 2 px over the tab bar's 20 px) are costly on iOS while animating.
  3. For left/right drawers vaul treats every touch on the content as a drag (`shouldDrag` → true, pointer capture),
     which switches off its iOS scroll guard mid-touch; three nested scroll areas with no `overscroll-behavior` let
     momentum pass to the page behind (`components/dashboard/index.tsx` scroll area has `scroll-smooth` +
     `-webkit-overflow-scrolling: touch`).

## 3. In scope
1. `MobileDrawer`: pass vaul `handleOnly` (no drag-to-close from the content; the overlay tap, Escape and existing close
   buttons still close it). Slide duration 200 ms, ease-out (`cubic-bezier(0.2, 0, 0, 1)`), via a class on
   `Drawer.Content` that sets `transition-duration`/`transition-timing-function` (must win over vaul's injected CSS —
   use `!` important utilities or a scoped `[data-vaul-drawer]` rule in `app/globals.css`). Overlay: drop
   `backdrop-blur`, keep `bg-black/45`.
2. One scroll area: the `MobileDrawer` inner div is the only vertical scroller, with `overscroll-contain` and
   `touch-pan-y`. Remove `overflow-y-auto` from the nested containers in `MobileTopBar`'s drawer content (the drawer
   variant only — the desktop sidebar keeps its own scrolling).
3. In the mobile drawer only, do not attach `onMouseEnter` preload to rows (desktop keeps it).
4. Honor reduced motion: `motion-reduce` → no slide transition.

## 4. Out of scope
Menu contents, labels, order, routes, the tab bar, desktop sidebar, tenant bar, any copy. No new dependencies; do not
replace vaul.

## 5. Exact files expected to change
- `apps/web/components/ui/mobile-drawer.tsx`
- `apps/web/components/dashboard/sidebar/sidebar-nav.tsx` (must not grow: ≤ 504 lines after the change)
- `apps/web/app/globals.css` (only if needed for the vaul transition override; scoped to the drawer)
- `apps/web/components/__tests__/mobile-drawer.test.tsx` (new)
- `apps/web/components/__tests__/owner-bottom-bar.test.tsx` (only if an assertion depends on the removed classes)

## 6. Implementation requirements
- Keep `Drawer.Title`/`Description` (a11y). Focus trap and Escape behavior unchanged.
- Lines ≤ 140 characters.

## 7. Validation
```
cd apps/web
npx vitest run components/__tests__/mobile-drawer.test.tsx components/__tests__/owner-bottom-bar.test.tsx
npm run gate:web
```

## 8. Acceptance criteria (named tests calling real components)
- M1 `MobileDrawer` renders vaul `Root` with `handleOnly` true and `direction="left"` (mock vaul to capture props, or
  assert through rendered attributes — no `expect` inside the mock).
- M2 Open drawer content has the 200 ms duration class/rule and the overlay has no `backdrop-blur` class.
- M3 Exactly one element inside the open drawer has `overflow-y-auto` (for both `StandaloneDrawer` and the
  `MobileTopBar` drawer), and it has `overscroll-contain` and `touch-pan-y`.
- M4 Mobile drawer rows have no `onMouseEnter` preload (spy on `preloadSection`: firing `mouseEnter` on a mobile row
  calls it 0 times; on a desktop row ≥ 1).
- M5 Overlay click and Escape still close the drawer (`onOpenChange(false)`).
- M6 Gate green (counts verbatim). `sidebar-nav.tsx` line count reported.

## 9. Report format
Compact status only: files changed with line deltas, M1–M6 → test names, validation output counts. Do NOT include
'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. Claude verifies feel and timing on the iOS Simulator.
The user should never need to read instructions to complete this flow: tap More, the menu is there, tap a row, it opens.
