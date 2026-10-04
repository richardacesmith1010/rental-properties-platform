# Sprint 151 — Owner section switches without a full page reload

**Severity: L3** — ChatGPT review: APPROVE WITH CHANGES, all 5 required + 2 optional adopted. (Adds a new authenticated, data-returning server action; no money movement, schema, or copy changes.)

## 1. Objective
Make owner section switches feel instant: ~0.5–1 s the first time a section opens, near-instant when revisiting, instead of ~2 s. Do it by no longer re-rendering the whole force-dynamic `/owner` page on every section click — fetch only the clicked section's own data and keep everything already loaded. What users see in each section must be identical to today.

## 2. Context
- Branch `main`, HEAD `6aafc32` or later docs-only. Next 14.2.5, React 18.3.1.
- Today: `apps/web/components/dashboard/dashboard-section-loaders.ts` `navigateOwnerDashboard` (~`:285-321`) sets state, then `router.replace(nextUrl)` → full server render of `apps/web/app/owner/page.tsx` → `loadOwnerPageData` (`apps/web/app/owner/owner-page-data.ts`) re-runs auth, role, profile, ownership, capabilities, administered IDs, and the **always-loaded shared bundles** (`dashboard`, `portfolio`, `announcement-properties`, `notifications`, `notification-preferences`, `rent-collection-status`) plus the section bundles from `buildOwnerBundlePlan` (`:244`). Measured ~2.0–2.2 s per switch after Sprint 150. The client receives `loadedBundles` in props.
- All mutations already call `router.refresh()` (≈60 call sites in `components/dashboard/*`), which re-renders the server page **for the current URL** — so as long as the URL reflects the active section, refresh after a mutation keeps the server as source of truth.
- Next 14.2 integrates `window.history.replaceState` / `pushState` with the App Router (`useSearchParams`/`usePathname` update, and `router.refresh()` uses the new URL).
- Auth pattern: `AGENTS.md §3`; shared helper `apps/web/app/actions/auth-helpers.ts` `requireAuth(...roles)`. Account validation: `resolveOwnerPageRequest` (`owner-page-data.ts:194`) only accepts an `account` param that is one of the user's own ownership accounts.
- A read-only `supabase` MCP is available for schema/data checks.

## 3. In scope
1. **New server action** `loadOwnerSectionData(input)` in a new file `apps/web/app/actions/owner-section-data.ts`:
   - Input (Zod-validated): `{ section: string (known owner section id), account?: string, property?: string, mode?: string }` — the same shape as the owner page search params. **Never accept a user id or role from the client.**
   - Steps in order: (1) authenticate from the session (no user → return `{ error }`, do not redirect inside a fetch-style action); (2) validate input; (3) role must be owner exactly as `loadOwnerPageData` requires (same role-mismatch / needs-onboarding / needs-setup outcomes → return a typed `{ status }` the client handles by falling back to a full navigation); (4) resolve the active account with `resolveOwnerPageRequest` against the user's own ownership accounts (a foreign `account` id silently falls back exactly as the page does), and resolve administered property IDs for that account the same way the page does. (5) **Scope `property` too:** if `property` is not in that account's administered property set, drop it (treat as "all properties", exactly as the page would) before it reaches any loader — a foreign property id must never influence loader arguments or returned data.
   - Return **only the section bundles** for that section from `buildOwnerBundlePlan` (exclude the always-loaded shared set), loaded by the **same loader functions with the same arguments and capability gates** as `loadOwnerPageData`. Extract a shared internal helper in `owner-page-data.ts` so the page and the action use one code path for section-bundle loading and gating (no duplicated bundle logic). Owner-connected map: use the same property ID set the page uses.
   - Response is a serializable partial of the existing owner page props (same field names/types) plus `loadedBundles`. No PII in logs; keep `[perf:owner]` measurement (`route: "owner-section-action"`).
2. **Client navigation** in `dashboard-section-loaders.ts` (owner path only):
   - On a section switch within the same account and mode-family: update the URL with `window.history.replaceState` (same URL format as today), set the active section immediately, and — if every bundle the section needs is already available (server `loadedBundles` ∪ client-fetched cache) — render with no request. Otherwise show the existing labeled section skeleton and call `loadOwnerSectionData`; merge the result into a client-side overlay keyed by bundle id.
   - **Cache scope key:** the overlay is valid only for one scope key = active account + workflow mode + property context. "Bundle already loaded" means loaded **for the current scope key**, not merely that the bundle id exists. Changing the scope key (account switch, workflow-mode switch, property-context switch) clears the overlay **immediately, before** navigating — never wait for replacement server props, so account A's data can never render while moving to account B.
   - Data precedence: **fresh server props always win.** Whenever the server props change (any `router.refresh()`, full navigation, account switch), drop the overlay cache entirely (the refreshed server render already includes the current section's bundles because the URL carries `section`).
   - Keep `router.replace` (full server navigation) for: account switches, owner workflow-mode changes that change the bundle plan (`new_property`, `new_tenant`, `new_manager`, `records`), property drill-down if it changes server-filtered data, (action failures use `router.refresh()`, see below; fallback must leave the user on the requested section with correct data).
   - Stale-response guard: use a request id **and** a data-generation epoch. The epoch increments on every server-props change (any `router.refresh()`), full navigation, and scope-key change. A response is applied only if its request id is the latest **and** its epoch equals the current epoch; otherwise discard it. Covers both A→B section races and refresh/mutation racing an in-flight fetch.
   - **Failure fallback:** because `history.replaceState` has already set the requested URL, `router.replace(sameUrl)` is not a guaranteed server fetch. On any non-success action result, call `router.refresh()` (which renders the already-updated requested URL on the server) — do not rely on `router.replace` to the same URL.
   - Browser back/forward and deep links (`/owner?section=charges` on a fresh load) must work as today.
3. Manager dashboard and tenant navigation: **unchanged** (they keep `router.replace`).

## 4. Out of scope
- Any change to shared-bundle loaders, auth/role rules, payments, webhooks, schema, UI layout or copy.
- Client-side caching across sessions/tabs; prefetching sections in the background.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`apps/web/app/actions/owner-section-data.ts` (new), `apps/web/app/owner/owner-page-data.ts`, `apps/web/components/dashboard/dashboard-section-loaders.ts`, and — only if needed to apply the overlay to props — `apps/web/components/dashboard/dashboard-data-loader.tsx` and/or `apps/web/components/dashboard/index.tsx` (say why). `apps/web/app/actions/index.ts` only if actions are re-exported there by convention. Plus tests. ≤ 6 non-test files.

## 6. Implementation requirements
- Tests (Vitest):
  - Action: unauthenticated → error, no data reads; non-owner role → typed status, no bundle reads; foreign `account` id → falls back to the user's own account (never loads another account's data); foreign `property` id combined with a valid owned account → dropped, never reaches loader arguments or output; unknown section → validation error; returns only section bundles (shared bundles never loaded); capability-gated bundles respect the same gates as the page; page and action produce identical section-bundle data for the same fixture (shared helper).
  - Client: switching to a section whose bundles are already loaded makes zero action calls; switching to an unloaded section calls the action once and renders its data; out-of-order responses do not overwrite the newer section; start section fetch → mutation triggers refresh/new server props → old response resolves → discarded and fresh server data stays authoritative; a server-props change clears the overlay; scope-key change clears the overlay before navigation; a bundle loaded under one property/mode scope is not reused under another; account switch and workflow-mode change still use `router.replace`; action failure triggers `router.refresh()` for the requested URL.
- Measure: report expected request count per section switch before/after.
- No PII in logs. Do not invent URLs or emails. The user should never need to read instructions to complete this flow; every step must be self-explanatory.

## 7. Validation commands
```bash
npm run gate:web
git diff --stat
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- `loadOwnerSectionData` follows AGENTS.md §3 order (auth → validate → role → account/property scoping), derives the user only from the session, and cannot return another account's or another property's data (tests).
- Section-bundle loading has one shared code path used by both the page and the action.
- Owner section switch to an already-loaded section issues zero server requests; to an unloaded section, one action call (no full `/owner` render).
- After any `router.refresh()`, displayed data comes from fresh server props (overlay cleared; in-flight responses from an older epoch discarded).
- Overlay is cleared synchronously on any scope-key change; no cross-scope data can render.
- Account switch, workflow-mode change, back/forward, and deep links behave as today.
- Manager and tenant navigation unchanged.
- ≤ 6 non-test files changed.

## 9. Report format
Conform to `docs/codex-report-schema.json`. `self_verification.findings`: the action's step order, the shared helper's name, which navigations still use `router.replace` and why, the overlay invalidation rule, the stale-response guard, and request counts per switch before/after.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
