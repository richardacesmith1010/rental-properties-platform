# Sprint 152 — Owner sections open fast the first time (background preload + faster maintenance loader)

**Severity: L2** (client prefetch through the existing, already-authorized `loadOwnerSectionData` action plus read-query ordering; no auth, money, schema, or copy changes).

## 1. Objective
Make the owner "Next section" / "Previous section" arrows feel instant even on the first visit, by quietly preloading the neighbouring sections after the current one settles. Also cut the maintenance loader from ~0.7 s to ~0.3 s.

**Target (per L-013 — sum of remaining measured costs):** arrow click to an already-preloaded neighbour ≈ the cached revisit cost (~50 ms, zero requests at click time). A section opened by other means (command palette, sidebar mode jump) and not yet preloaded still pays the action cost: ~1.0 s fixed auth/role/profile/ownership/property prefix (unchanged this sprint) + its bundle (maintenance ~0.3 s after fix) + ~0.4 s network/render ≈ 1.5–1.8 s.

## 2. Context
- Branch `main`, HEAD `8253074` or later docs-only. Sprint 151 (`a6f5179`) added `apps/web/app/actions/owner-section-data.ts` `loadOwnerSectionData` and the client overlay `useOwnerSectionCache` in `apps/web/components/dashboard/dashboard-section-loaders.ts` (scope key account+mode+property; request id + data-generation epoch; overlay cleared on any server-props change; failure fallback `router.refresh()`).
- Daily Ops order: `apps/web/components/dashboard/owner-daily-ops-pagination.ts` `OWNER_DAILY_OPS_SECTION_IDS` (overview, charges, portfolio, maintenance, leases, tenants, manager-payments, members, analytics) — only sections available to this owner appear (see `ownerSectionAvailability`). Other owner modes have their own section lists (`getOwnerModeNavItems` in `dashboard-config`). Prev/next wraps around.
- Measured in prod (Vercel `[perf:owner]`, route `owner-section-action`): action total 1.3–2.1 s; `maintenance.admin-tickets` 650–900 ms; `stripe-connect.owner-map` ~300 ms; `vendors.owner` ~230 ms.
- `apps/web/lib/maintenance.ts` `getAdminMaintenanceTickets` runs ~7 serial waves: property IDs → properties → units → tickets → tenant profiles → `buildTicketEnhancementMaps` → `buildCommentMaps` → `buildTimelineMaps`. properties/units/tickets depend only on property IDs; profiles and the three map builders depend only on ticket rows/IDs.

## 3. In scope
1. **Neighbour preload** (owner path only, inside `useOwnerSectionCache` / owner navigation):
   - After the active section has rendered with data and the browser is idle (`requestIdleCallback`, fallback `setTimeout` ~300 ms), preload the **previous and next** sections of the current mode's visible section list (respecting availability and wrap-around) whose required bundles are not already loaded for the current scope key. Preload uses `loadOwnerSectionData` exactly like a click would.
   - At most **one preload request in flight**; next first, then previous. Never preload while a user-initiated section load is in flight. Skip preloading when `navigator.connection?.saveData` is true or the document is hidden.
   - Preload results go through the **same** epoch + scope checks as click loads (a preload started before a refresh/scope change must be discarded) and merge into the overlay keyed by bundle id. A preload never changes the visible section, never shows a skeleton, and a preload failure is silent (no `router.refresh()`, no toast — the next click falls back normally).
   - **De-duplicate:** if the user clicks a section whose preload is in flight, await that same promise instead of firing a second action call (still apply the click's own request-id/epoch guard to decide whether to render).
   - After the user moves, preload the new neighbours (already-loaded sections are skipped, so steady-state arrow use costs no extra requests).
2. **Faster `getAdminMaintenanceTickets`:** accept an optional pre-resolved `propertyIds` parameter (when absent, behave exactly as today — other callers unaffected). Run properties, units, and tickets concurrently; then run tenant profiles, `buildTicketEnhancementMaps`, `buildCommentMaps`, and `buildTimelineMaps` concurrently. Pass the already-resolved administered property IDs from `loadOwnerSectionBundles` (`apps/web/app/owner/owner-page-data.ts`) for the `tickets` bundle. Output identical.
3. Keep `[perf:owner]` names unchanged; add `meta.preload: true` on action perf events when the client marks the call as a preload (add an optional boolean `preload` field to the action input schema — it must not change authorization or returned data).

## 4. Out of scope
- The action's fixed auth/role/profile/ownership/property prefix (L3 — later), shared-bundle loaders, manager/tenant navigation, UI/copy, schema, payments.
- Preloading anything other than immediate prev/next neighbours.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`apps/web/components/dashboard/dashboard-section-loaders.ts`, `apps/web/app/actions/owner-section-data.ts` (preload flag only), `apps/web/app/owner/owner-page-data.ts` (pass property IDs to the tickets loader), `apps/web/lib/maintenance.ts`, and — only if the neighbour list must be read there — `apps/web/components/dashboard/owner-daily-ops-pagination.ts` (say why). Plus tests. ≤ 5 non-test files.

## 6. Implementation requirements
- Tests (Vitest):
  - Preload: after a section settles, exactly one action call for the next neighbour, then one for the previous; none for neighbours already loaded; none while a click load is in flight; none when `saveData` or hidden; clicking a section with an in-flight preload makes no second call and renders its data; a preload resolving after a server-props change or scope change is discarded; preload failure triggers no `router.refresh()`; wrap-around and availability respected.
  - Maintenance: output identical to the previous implementation for fixtures covering zero properties, properties with no tickets, tickets with/without tenant, vendor assignment, photos, comments, timeline; pre-resolved IDs path does not call property-access helpers; concurrency asserted with deferred mocks.
  - Action: `preload` flag does not alter auth order, scoping, or returned data.
- Report serial wave depth for `getAdminMaintenanceTickets` before/after.
- No PII in logs. Do not invent URLs or emails. The user should never need to read instructions to complete this flow; every step must be self-explanatory.

## 7. Validation commands
```bash
npm run gate:web
git diff --stat
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- Neighbour preload behaves exactly as §3.1 (tests), including de-duplication, single in-flight preload, epoch/scope discard, silent failure.
- `getAdminMaintenanceTickets` wave depth reduced (≤ 3 serial waves with pre-resolved IDs); output identical; other callers unchanged.
- `preload` flag never changes authorization or returned data.
- Manager and tenant navigation unchanged.
- ≤ 5 non-test files changed.

## 9. Report format
Conform to `docs/codex-report-schema.json`. `self_verification.findings`: preload trigger and ordering, de-dupe mechanism, discard rule, maintenance wave depth before/after, and expected requests per arrow click in steady state.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
