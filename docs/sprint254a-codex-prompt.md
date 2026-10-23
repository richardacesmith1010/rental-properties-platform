# Sprint 254a — Error screens retry once on a network blip; split sidebar-nav.tsx (L2) — rev 1

## 1. Objective
1. **One network blip should not show an error screen.** On 2026-10-22 20:35Z a production smoke run hit "Owner
   dashboard error" from a client `TypeError: network error` (Sentry DOMUS-WEB-9, `handled: yes`, no server error in
   Vercel). A rerun passed. When a route error boundary catches a *transient network* error, Domus should quietly try
   again once before showing the error card.
2. **Code health:** `components/dashboard/sidebar/sidebar-nav.tsx` is 504 lines (limit 500, the last file over).
   Move the small helper components out verbatim.

## 2. Context
- HEAD: see `git log -1`. Error boundaries: `app/error.tsx` (root, "Something went wrong"), `app/owner/error.tsx`,
  `app/manager/error.tsx`, `app/tenant/error.tsx` (same shape: `useEffect → Sentry.captureException(error)`, card with
  "Try again" → `reset`, and a link home). `app/global-error.tsx` is out of scope.
- Transient network messages seen in Sentry: `network error` (WEB-9, Chrome stream cut), `Load failed` (WEB-5,
  Safari), `Failed to fetch` (Chrome). A `ChunkLoadError` / "Loading chunk … failed" is also a network blip.
- Errors with a `digest` came from the server render — **never** auto-retry those (a real server error would just
  repeat).
- `sidebar-nav.tsx` ("use client"): `sidebarFocusRing` (52), `CommandPaletteTrigger` (54), `WorkspaceFooterLinks`
  (73), `ThemeToggleGroup` (83) are private helpers used later in the file; `NavList` (113–206) is used by
  `SidebarNav` and `MobileTopBar`. Shared proof script: `apps/web/scripts/verify-verbatim-split.mjs` (skips directives,
  imports and export declarations).

## 3. In scope
1. New `apps/web/components/ui/use-network-error-retry.ts` ("use client") exporting:
   - `isTransientNetworkError(error: Error & { digest?: string }): boolean` — `true` only when there is **no**
     `digest` and `error.name === "ChunkLoadError"` or the message (case-insensitive) is exactly one of
     `network error`, `load failed`, `failed to fetch`, or starts with `loading chunk` (and contains `failed`).
   - `useNetworkErrorRetry(error, reset): { retrying: boolean }` — if transient and no auto-retry happened for this
     path in the last 30 seconds (`sessionStorage` key `domus-auto-retry:<pathname>` holding a timestamp; wrap every
     storage access in try/catch and treat failures as "not retried"), record the time and call
     `startTransition(() => { router.refresh(); reset(); })` once, returning `retrying: true`. Otherwise
     `retrying: false`.
2. All four error boundaries use the hook. While `retrying` is true render a calm loading state instead of the card:
   the existing outer layout with a spinner-free text line **"Loading again…"** inside `role="status"`
   `aria-live="polite"`. Sentry: when an auto-retry is started, report with
   `Sentry.captureException(error, { level: "warning", tags: { auto_retry: "started" } })`; otherwise keep the current
   `Sentry.captureException(error)` (a second failure within 30 s therefore shows the card and reports an error).
3. Move `sidebarFocusRing`, `CommandPaletteTrigger`, `WorkspaceFooterLinks`, `ThemeToggleGroup` verbatim into
   `components/dashboard/sidebar/sidebar-controls.tsx` ("use client"; add `export` and imports only). `sidebar-nav.tsx`
   imports them. No other change to either file.

## 4. Out of scope
`app/global-error.tsx`, error copy/styling of the card, retry for server (`digest`) errors, more than one automatic
retry, any data-loading change, other sidebar logic.

## 5. Exact files expected to change
- `apps/web/components/ui/use-network-error-retry.ts` (new)
- `apps/web/app/error.tsx`, `apps/web/app/owner/error.tsx`, `apps/web/app/manager/error.tsx`, `apps/web/app/tenant/error.tsx`
- `apps/web/components/dashboard/sidebar/sidebar-nav.tsx`, `apps/web/components/dashboard/sidebar/sidebar-controls.tsx` (new)
- `apps/web/components/__tests__/network-error-retry.test.tsx` (new)

## 6. Implementation requirements
- Mock `next/navigation` (`useRouter`, `usePathname`) and `@sentry/nextjs` in tests; no `expect` inside mocks (L-028).
- Lines ≤ 140 characters. Plain-language guard must pass ("Loading again…" is the only new copy).
- Undo: none needed (read-only retry; `reset()` re-renders the segment).
- Sidebar move: before editing record `BASE=$(git rev-parse HEAD)`; after, run
  `node scripts/verify-verbatim-split.mjs --base $BASE --old components/dashboard/sidebar/sidebar-nav.tsx --facade
  components/dashboard/sidebar/sidebar-nav.tsx --new components/dashboard/sidebar/sidebar-controls.tsx` (all `OK`).

## 7. Validation
```
cd apps/web
npx vitest run components/__tests__/network-error-retry.test.tsx
npx vitest run components/__tests__ -t "sidebar"
node scripts/verify-verbatim-split.mjs --base $BASE --old components/dashboard/sidebar/sidebar-nav.tsx \
  --facade components/dashboard/sidebar/sidebar-nav.tsx --new components/dashboard/sidebar/sidebar-controls.tsx
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria
- N1 `isTransientNetworkError`: `true` for `new TypeError("network error")`, `"Load failed"`, `"Failed to fetch"`,
  `"NETWORK ERROR"`, a `ChunkLoadError`, `"Loading chunk 123 failed."`; `false` for the same messages **with** a
  `digest`, for `"Network error while saving"`, `"Cannot read properties of null"`, and an empty message.
- N2 Owner boundary with `new TypeError("network error")`: `router.refresh` and `reset` each called exactly once;
  "Loading again…" is shown in a `status` region; the card heading "Owner dashboard error" is **not** shown; Sentry
  called once with `level: "warning"` and tag `auto_retry: "started"`.
- N3 Same error again within 30 s (storage timestamp present): no `refresh`/`reset`; the card heading shows; Sentry
  called with the error and no warning level.
- N4 After 31 s (fake timers / stored timestamp 31 s old) a new network error auto-retries again.
- N5 An error with a `digest` and a non-network error: no auto-retry, card shows (all four boundaries, table-driven,
  each with its exact heading: "Something went wrong", "Owner dashboard error", and the manager/tenant headings from
  the source).
- N6 `sessionStorage` throwing on `getItem`/`setItem`: transient error still retries once in that render and nothing
  throws.
- N7 Sidebar: proof script prints `OK` for every symbol and no `DIFF`; `sidebar-nav.tsx` ≤ 500 lines; existing sidebar
  tests pass unchanged.
- N8 Gate green (counts verbatim).

## 9. Report format
Compact status only: N1–N8 → test names, line counts, counts. Do NOT include 'Claude prompt' or 'recommended next
steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow: a short network
hiccup shows "Loading again…" and then the page, not an error.
