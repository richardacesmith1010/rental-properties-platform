# Sprint 247a — Instant tab switching on phones (tenant + owner) (L2, speed)

## 1. Objective
The owner reports ~2 s to move between tabs on the phone. Claude measured production in WebKit (iPhone 15 Pro
profile, fast Mac network, 2026-10-21):
- **Tenant** (Home/Rent/Repairs/Messages, `next/link` to `/tenant?section=…`): 0.7–1.0 s per tap; each tap is one RSC
  GET of the whole `/tenant` page (0.65–0.97 s). No prefetch requests are made, and revisiting a tab 5 s later
  re-fetches (router cache not reused despite `experimental.staleTimes.dynamic = 30`).
- **Owner** (Home/Money/Homes/Messages): plain `<a href>` full page loads — 0.9–1.1 s to visible, 1.5–1.9 s to idle.
On phone networks these become ~2 s. Target: switching between the four main tabs shows the new tab in **≤ 150 ms**
with **no network request** (tenant; owner Home/Homes/Messages), and owner Money ≤ 50% of today.

## 2. Context
- HEAD: see `git log -1`. Next.js 15.5, `apps/web`.
- Tenant: `apps/web/app/tenant/page.tsx` (490 lines, `force-dynamic`) loads **all** tenant data on every request
  (`Promise.all` at ~120: payments, history, lease, maintenance, documents, notifications, inbox threads, autopay) and
  then renders only `activeSection` (from `searchParams.section`). Tab bar `components/dashboard/tenant-bottom-bar.tsx`
  (38 lines) uses `<Link href="/tenant?section=…">`. Tab ids: `overview`, `charges`, `maintenance`, `notifications`.
- Owner: `components/dashboard/owner-bottom-bar.tsx` (127 lines) renders `<a href={tabHref(...)}>` for Home, Money,
  Homes, Messages even though `dashboard-layout.tsx:104-110` passes `onSelectItem`. On `/owner` the dashboard
  (`components/dashboard/index.tsx`) already switches sections client-side with a section cache (`preloadSection`,
  used by the sidebar). Home = `overview` (or `daily-ops-home` per `resolveOwnerTab`), Homes = `portfolio`,
  Messages = `inbox`, Money = `/owner/money` (separate route).

## 3. In scope
1. **Tenant: one load, instant tabs.** Render the four tab sections in the same server response and switch between
   them on the client:
   - New client component `components/dashboard/tenant-section-tabs.tsx`: receives the four pre-rendered section
     nodes (+ the per-section header text already computed in `page.tsx`), shows the active one and keeps the others
     mounted but `hidden` (so form state survives), initial section from the server's `activeSection`.
   - Switching updates the URL with `window.history.pushState(null, "", "/tenant?section=<id>")` (Next 15 syncs
     `useSearchParams`), handles back/forward (`popstate`), scrolls to top, and moves focus to the section heading
     (a11y). No server request on switch.
   - `TenantBottomBar` gets an `onSelect(id)` prop and calls it (with `preventDefault`) instead of navigating when
     provided; it keeps `href` for open-in-new-tab and no-JS. Any in-page links to those four sections on the tenant
     page (e.g. "Pay rent", "See repairs" cards linking to `/tenant?section=charges`) use the same switch.
   - `documents` and unknown sections keep today's behavior (server render of that section).
   - After a server action that changes data (pay, report paid, repair, message), today's `revalidatePath` /
     `router.refresh()` must still refresh every section (they all come from the same response) — verify.
   - Keep `page.tsx` ≤ 500 lines (move rendering helpers out if needed).
2. **Owner: in-page tabs.** In `OwnerBottomBar`, when `onSelectItem` is provided and the current pathname is `/owner`,
   Home/Homes/Messages call `onSelectItem(<section id>)` with `preventDefault` (same path the sidebar uses, so the
   section cache applies) and update the active tab immediately; elsewhere (e.g. on `/owner/money`) they keep the
   `href`. Money becomes a `next/link` with `prefetch` so the route is prefetched when the bar is shown.
3. **Router cache investigation (report only, no fix required):** state why `staleTimes.dynamic = 30` did not reuse
   `/tenant?section=…` payloads (e.g. a `router.refresh()`, cookie writes, `force-dynamic` semantics in 15.5) with the
   evidence you found.
4. Tests in §8.

## 4. Out of scope
Server data loading, queries, caching layers, desktop sidebar behavior, manager role, copy, styling, the More menu.

## 5. Exact files expected to change
- `apps/web/app/tenant/page.tsx`
- `apps/web/app/tenant/tenant-page-helpers.ts` (only if rendering helpers move there)
- `apps/web/components/dashboard/tenant-section-tabs.tsx` (new)
- `apps/web/components/dashboard/tenant-bottom-bar.tsx`
- `apps/web/components/dashboard/owner-bottom-bar.tsx`
- In-page tenant section links, if any (list each file in the report; only the link `onClick`/`href` lines)
- Tests: new `apps/web/components/__tests__/tenant-section-tabs.test.tsx`; update
  `apps/web/components/__tests__/tenant-bottom-bar.test.tsx`, `apps/web/components/__tests__/owner-bottom-bar.test.tsx`,
  `apps/web/app/tenant/__tests__/*` only where they assert navigation

## 6. Implementation requirements
- Role reuse (L-014): desktop behavior unchanged; tenant links still work with JS disabled (real `href`).
- No new dependencies. Lines ≤ 140 characters. No `]:hidden`/`]:opacity-0` child-selector tricks (L-022): use the
  `hidden` attribute.
- Accessibility: the tab bar keeps `aria-current="page"` on the active tab, updated immediately on switch.

## 7. Validation
```
cd apps/web
npx vitest run components/__tests__/tenant-section-tabs.test.tsx components/__tests__/tenant-bottom-bar.test.tsx \
  components/__tests__/owner-bottom-bar.test.tsx app/tenant/__tests__
npm run gate:web
```

## 8. Acceptance criteria (named tests calling real components)
- T1 Tenant tabs: rendering the tenant page with `section=overview` includes all four section containers; only
  `overview` is visible (others have `hidden`).
- T2 Tapping Rent in `TenantBottomBar` (with `onSelect`) calls `history.pushState` with `/tenant?section=charges`,
  shows the Rent section, hides Home, sets `aria-current="page"` on Rent, focuses the Rent heading, and performs **no**
  `fetch` and no `router.push` (spy both).
- T3 `popstate` to `?section=maintenance` shows Repairs.
- T4 A form's typed input in the hidden Messages section is still there after switching away and back.
- T5 Without `onSelect`, tenant links keep `href="/tenant?section=…"` (no-JS fallback); `documents` still navigates.
- T6 Owner on `/owner`: tapping Homes calls `onSelectItem("portfolio")`, prevents default navigation, and marks Homes
  active; Messages → `"inbox"`; Home → `"overview"`. On `/owner/money`, Home/Homes/Messages keep their `href`.
- T7 Owner Money renders a `next/link` (mocked) with `prefetch` true and `href` `/owner/money` (+ account param when
  present).
- T8 Gate green (counts verbatim); `page.tsx` line count reported (≤ 500).

## 9. Report format
Compact status only: files changed with line deltas, T1–T8 → test names, the §3 item 3 finding with evidence, validation
counts verbatim. Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status
only.

## 10. Constraints
Stay inside §5; list anything else. Do not commit. Claude measures before/after on production with the same WebKit
harness (tap → new section visible) and reports `[perf]` evidence (L-013/L-018).
The user should never need to read instructions to complete this flow: tap a tab, the screen is there.
