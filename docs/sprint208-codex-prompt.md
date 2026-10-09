# Sprint 208 — Manager "Show" filter: by client or home, grouped by owner (L2) · Category 3 (Manager)

## 1. Objective
For managers, make the "Show" picker work, and let them pick a whole client/owner or one home. Group the picker and the Homes page by owner.

**Approved design:** https://claude.ai/artifact/CT1mZ4eyHhrL1R2RJJ7uhH, row 3: screen 8 is the "Show" picker, screen 9 is Homes grouped by owner. The names in it are samples.

## 2. Context (HEAD main)
- **Filter state:** `components/dashboard/dashboard-kpi-loader.ts` (476 lines).
  - `propertyFilteringEnabled = isOwnerRole && properties.length > 0` (:236), so managers never filter.
  - `selectedPropertyId` is synced to the URL as `?property=` via `syncPropertyUrl` (`history.replaceState`, ~:275–287). It's initialized from `props.initialPropertyId` (:289–310) and changed by `selectProperty` (:312–326).
  - `selectedProperty` drives `filteredPortfolio` (properties, units, leases, tenants), `filteredTickets`, `filteredCharges`, `filteredKpis`, `selectedPropertySummary` and `selectedPropertyNetCashFlowCents` (:328–400).
- **Manager page:** `app/manager/page.tsx:145` already reads `searchParams.property` into `initialPropertyId`.
- **Picker:** `components/dashboard/property-selector.tsx` is a native `<Select>` with "All homes" plus the homes. It's rendered by `PropertyScopeControl` in `section-renderer-support.tsx:40`, which is hidden on `members`, `tenants` and `clients`.
- **Portfolio data:** `lib/portfolio.ts`. Properties carry `ownerAccountId` and `ownerAccountName` (:19–20). Account names come from `ownership_accounts` (`id, display_name`, ~:290). There's no client flag yet.
- **Homes page:** `components/dashboard/portfolio-section.tsx` (378 lines) shows `ownerAccountName` as one line per home (:213). There's no grouping.

## 3. In scope
1. **Data.** In `lib/portfolio.ts`, also select `managed_client` and set `ownerAccountIsClient: boolean` on each property, with an explicit column and the error checked (a failed account query is an error, not empty names). Update the type.
2. **Selection model (managers only).** The selection is one of: none (all homes), a home (`?property=<id>`), or a whole owner/client account (`?account=<id>`). Both can never be set at once.
   - The filter applies the set of home ids in the selection to everything `selectedProperty` filters today: portfolio, tickets, charges, KPIs and net cash flow.
   - For an account selection, `selectedPropertySummary` describes the group: its name as the title, plus summed units, occupancy and open repairs. The per-home address is omitted.
   - Read `initialAccountId` from `searchParams.account` in `app/manager/page.tsx`.
   - A stale or unknown id falls back to all homes.
   - The selection survives a section change and a page refresh.
3. **Picker (managers).** Same native select, so it stays accessible and phone-friendly:
   - `All homes`, then one `<optgroup>` per owner account, sorted with clients first and then owners, alphabetical within each. Labels are `Client · {name}` / `Owner · {name}`.
   - Each group's first option is `All {N} {name} homes` (`All 1 {name} home` when N is 1), followed by its homes alphabetically.
   - Option values are `account:<id>` and `property:<id>`.
   - Help text under the picker, managers only: `Your choice stays as you move between pages.`
4. **Homes page (managers).** Group the homes under a heading per owner account, in the same order as the picker. Each heading is the account name plus a tag: `Client · {N} homes` or `Owner on Domus · {N} homes` (use `home` for 1). Remove the per-home owner-name line for managers, since the heading replaces it.
5. **Owner invariants (L-014). Pin these with tests BEFORE changing code:**
   - The owner picker shows exactly `All homes` plus homes, with no optgroups, no account options and no help text.
   - The owner URL param is `?property=` only.
   - The owner `filteredPortfolio`, charges, tickets and KPIs behave exactly as today.
   - The owner Homes page is unchanged.

## 4. Out of scope
- Tenants, the DB, client statements, server-side filtering.
- Owner grouping.
- The `members`/`tenants`/`clients` exclusions of the picker (keep them).

## 5. Exact files expected to change
- `apps/web/lib/portfolio.ts`
- `apps/web/components/dashboard/dashboard-kpi-loader.ts`
- `apps/web/components/dashboard/property-selector.tsx`
- `apps/web/components/dashboard/section-renderer-support.tsx`
- `apps/web/components/dashboard/portfolio-section.tsx`
- `apps/web/components/dashboard/section-map.ts` (prop types, if needed)
- `apps/web/components/dashboard/types.ts` (if needed)
- `apps/web/app/manager/page.tsx`
- tests

`dashboard-kpi-loader.ts` must stay ≤ 500 lines; extract a `lib/home-scope.ts` helper (pure functions to build the groups and resolve a selection to home ids) if needed. Name any other file with a reason.

## 6. Implementation requirements
- **The user should never need to read instructions to complete this flow. Every step must be self-explanatory.**
- Exact copy. Plain-language guard passes. Theme tokens only. Tap targets ≥ 44 px. Works at 375 px.
- Lines ≤ 140; files ≤ 500. No new dependencies. Every Supabase result checked.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- New tests, plus every existing test importing a changed file (grep for each file name)
- `lib/__tests__/plain-language.test.ts`
- `npm run build --workspace @domus/web`

## 8. Acceptance criteria (binary)
Real tests (L-017) for:
1. **Pinned owner invariants:** written first, and still passing.
2. **Groups:** client first, alphabetical, correct labels and counts, singular/plural wording.
3. **Filtering for managers:**
   - picking an account filters portfolio, charges, tickets and KPIs to exactly that account's homes;
   - picking a home filters to that one home;
   - "All homes" shows everything.
4. **URL:**
   - `?account=` and `?property=` round-trip, and they're mutually exclusive;
   - a stale id falls back to all homes;
   - the selection survives a section change.
5. **Homes page (managers):** grouped headings with tags; the per-home owner line is gone.
6. **`lib/portfolio.ts`:** `ownerAccountIsClient` is set, and a failed account query throws.
7. Lint, typecheck, guard and build pass. Only the listed files changed.

## 8b. Post-deploy (Claude)
Live walk as the smoke manager:
1. Create 1 client with 2 homes (SQL / the client functions).
2. The picker shows the Client group and the Owner group (the Smoke Test Property).
3. Pick the client: Rent, Repairs and Leases show only its homes. Refresh, and it's kept.
4. Pick a single home. Then pick All homes.
5. The Homes page is grouped.
6. Check at 375 and 1280 px, light and dark, with 0 console errors.
7. Owner smoke: the picker is unchanged.
8. Clean up the test data. Then smoke, CI and Sentry.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
