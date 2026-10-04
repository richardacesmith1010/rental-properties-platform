# Sprint 154 — Owner clarity 1/3: one grouped menu (remove modes, the "N OF M" carousel and prev/next arrows)

**Severity: L2** (owner navigation/UI only; no auth, money, schema, or server data-loading rule changes). Model: Astra (multi-file navigation refactor touching the section cache).

## 1. Objective
Implement the owner-approved navigation from the design canvas https://claude.ai/artifact/NtynVroGDr3NoyrWcWWMPx (boards "Owner Home (desktop)" and "Rent (desktop)"): one grouped sidebar that reaches every owner section directly, one "Add" button, and no workflow modes, "N OF M" counters, prev/next arrows, arrow-key paging or swipe paging. Owners should never need to read instructions to find a page.

## 2. Context
- Branch `main`, HEAD `f4f67d7` or later docs-only. Next 14.2.5. All paths below are under `apps/web/`.
- Today (from a code map, verify each):
  - Sidebar items: `components/dashboard/dashboard-config.ts:379-454` `getOwnerModeNavItems` ("Daily Ops", "New Property", "New Tenant", "Tenants", "New Manager", "Records", conditional "Analytics", "Manager Payments", "Members"); "Reports" injected by `components/dashboard/sidebar/nav-items.ts:220-235` `injectReportsNavItem` (used in `sidebar/sidebar-nav.tsx:213` and mobile `MobileTopBar` `:334`). Mode meta `dashboard-config.ts:26-90`; section→mode map `components/dashboard/dashboard-workflow-modes.ts:3-26`; Daily Ops paging `components/dashboard/owner-daily-ops-pagination.ts`.
  - "N OF M" + "Previous section"/"Next section": `components/dashboard/index.tsx:68-120` `PageHeader`, mounted `:517-536` (Daily Ops) and `:612-631` (other modes); arrow keys `:236-259`; swipe `:539-556`; mode label/description box `:568-608`.
  - Navigation hook: `components/dashboard/dashboard-section-loaders.ts` (`handleSidebarSelect` `:633-704`, active item `:574-586`, prev/next `:407-505`, mode handling `:137-160, 203-249, 257-265, 316-355`). "New Property"/"New Tenant" sidebar clicks open `UnifiedPropertyWizard` (`index.tsx:394-412`) and `TenantInviteWizard` (`:452-465`).
  - Mode readers elsewhere: `components/dashboard/owner-section-cache.ts` (`resolveOwnerMode`, scope key account+mode+property), `components/dashboard/dashboard-workflow-handlers.ts:17-81` (post-create jumps by mode), `components/dashboard/dashboard-data-loader.tsx:134,213,272` + `section-renderer.tsx:99,137,478,498` + `section-renderer-support.tsx:248,287` (`isOwnerDailyOpsCarousel` shortened previews), `app/owner/owner-page-data.ts` `resolveOwnerPageRequest` (`:195-233`, `initialOwnerHomePage`, `isEmpty` `:818-820`), `app/owner/page.tsx:149`.
  - Manager dashboard shares some of these files (manager modes, `useDashboardNavigation`). **Manager and tenant behaviour must not change.**
- Sprint 151–153 section cache: section switches use `history.replaceState` + `GET /api/owner/section-data`; Sprint 152 preloads the carousel's prev/next neighbours.

## 3. In scope
1. **Owner sidebar (desktop + mobile drawer use the same data)** — exact groups, labels and section ids, shown only when the section is available to this owner (keep existing availability rules):
   - *Every day:* Home (`overview`, the current Daily Ops home content), Rent (`charges`), Repairs (`maintenance`), Messages (`inbox`)
   - *Your homes:* Homes (`portfolio`), Units (`units`), Leases (`leases`), Tenants (`tenants`), Find a tenant (`leasing`), Applications (`applications`), Invites (`invitations`)
   - *Money:* Payments (`payments`), Expenses (`expenses`), Charts (`analytics`), Reports (existing reports link), Manager pay (`manager-payments`)
   - *More:* Documents (`documents`), Vendors (`vendors`), Owners (`ownership`), Members (`members`, LLC only as today), Automations (`automations`), Activity (`activity`), Alerts (`notifications`)
   - Bottom: Settings (existing settings link), Help (existing help entry).
   - Group headings are small muted text; active item uses the existing active-pill style; keep existing badge counts (e.g. late rent on Rent, unread on Messages/Alerts). The `operations` section ("Create new properties, units, and leases") is reached through **Add**, not the menu.
2. **One "Add" button** in the owner page header (top-right, primary style per the canvas) opening a small menu: "Add a home" → existing `UnifiedPropertyWizard`; "Add a tenant" → existing `TenantInviteWizard`; "Add a manager" → open the existing manager-invite flow (whatever "New Manager" opens today). Menu is keyboard accessible (real buttons, Escape closes, focus returns).
3. **Remove for owners:** workflow modes as a concept in the UI, the mode label/description box, both "N OF M" counters, Previous/Next section buttons, arrow-key paging, swipe paging, and `isOwnerDailyOpsCarousel` shortened previews (owners see the full section). Every owner page shows the same simple header: page title + one plain sentence + (where it exists) the page's main action.
4. **URLs:** owner URLs become `/owner` (Home) and `/owner?section=<id>` (+ existing `account`, `property`). Legacy `?mode=...` links must still land correctly: ignore `mode` for owners (if `section` is present go there; if not, go Home), and drop `mode` from the URL with `history.replaceState`. `resolveOwnerPageRequest` stops treating `mode` as meaningful for owners (`isEmpty` must no longer depend on it). `owner-section-cache.ts` scope key becomes account + property (no mode). `GET /api/owner/section-data` keeps accepting `mode` (ignored) so old tabs don't 400.
5. **Post-create jumps** (`dashboard-workflow-handlers.ts`): after adding a home → go to Homes; after inviting a tenant → go to Invites; after inviting a manager → stay where the user was (show the existing success message). No mode logic.
6. **Preload re-target:** remove carousel-neighbour preloading. Instead preload a section's data when its sidebar link is hovered for ≥150 ms or receives keyboard focus (same single-in-flight, de-dupe, scope/epoch guards, silent failure, `saveData`/hidden-tab skips as Sprint 152/153). Clicking still uses the cached/de-duped path.
7. **Delete dead code** created by this change (e.g. `owner-daily-ops-pagination.ts`, owner mode meta) only after a whole-tree grep proves zero importers (L-006); keep anything the manager dashboard still uses.

## 4. Out of scope (later sprints — do NOT do them here)
- Bank-setup banner consolidation, Home layout redesign, Rent page filters/buttons, removing "Generate This Month Charges" (Sprint 155).
- Plain-language renames beyond the menu labels above, phone bottom bar (Sprint 156).
- Manager and tenant dashboards; server auth/data rules; schema; payments.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`components/dashboard/dashboard-config.ts`, `components/dashboard/dashboard-workflow-modes.ts`, `components/dashboard/owner-daily-ops-pagination.ts` (delete if dead), `components/dashboard/dashboard-section-loaders.ts`, `components/dashboard/index.tsx`, `components/dashboard/sidebar/sidebar-nav.tsx`, `components/dashboard/sidebar/nav-items.ts`, `components/dashboard/owner-section-cache.ts`, `components/dashboard/dashboard-workflow-handlers.ts`, `components/dashboard/dashboard-data-loader.tsx`, `components/dashboard/section-renderer.tsx`, `components/dashboard/section-renderer-support.tsx`, `app/owner/owner-page-data.ts`, `app/owner/page.tsx`, one new small component for the Add menu if needed (name it), plus unit tests and the e2e specs listed in §6. ≤ 16 non-test files. Any other file: stop and justify in the report.

## 6. Implementation requirements
- Unit tests (Vitest): owner sidebar renders exactly the groups/labels/order above for an LLC and a non-LLC fixture and hides unavailable sections; every available owner section id is reachable from the sidebar (no orphan section); no "of" counter, Previous/Next buttons, arrow-key or swipe paging for owners; Add menu opens each existing flow and is keyboard accessible; legacy `?mode=records&section=expenses` → Expenses with `mode` dropped; `?mode=new_tenant` (no section) → Home; post-create jumps per §3.5; hover/focus preload fires once with all guards; manager dashboard navigation snapshot/behaviour unchanged.
- Update existing tests that assert removed UI: `components/__tests__/dashboard-section-loaders.test.tsx`, `owner-section-cache.test.tsx`, `owner-section-fetch.test.tsx`, `section-renderer-support.test.tsx`, `lib/__tests__/owner-page-data.test.ts`, and e2e `tests/e2e/navigation.spec.ts`, `mobile-viewport.spec.ts`, `accessibility-enhanced.spec.ts`, `smoke-auth.spec.ts` (owner nav label "New Manager" → use "Add" or "Rent"), `owner-flows.spec.ts`, `smoke-theme.spec.ts` ("Manager Payments" → "Manager pay"). Do not weaken assertions — retarget them to the new UI.
- Copy: plain words, ≤ 12 words per sentence, no jargon (CLAUDE.md §18). The user should never need to read instructions to complete this flow; every step must be self-explanatory.
- Touch targets ≥ 44 px; works at 390 px (drawer) and 1280 px; light and dark tokens only (no raw hex).
- No PII in logs. Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run gate:web
git diff --stat
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- Owner sidebar (desktop + mobile drawer) matches §3.1 exactly; every available owner section reachable in one click.
- No owner screen shows a mode box, "N OF M", Previous/Next section buttons, or responds to arrow-key/swipe paging.
- One "Add" button opens add-home, add-tenant, add-manager flows.
- Legacy `mode` URLs land correctly and `mode` is dropped; section cache scope no longer includes mode; the API still accepts `mode`.
- Preload triggers on sidebar hover/focus, not carousel neighbours, with Sprint 152/153 guards intact.
- Manager and tenant navigation unchanged (tests).
- ≤ 16 non-test files; dead code removed only with zero-importer proof.

## 9. Report format
Conform to `docs/codex-report-schema.json`. `self_verification.findings`: final owner section→menu mapping, how legacy `mode` URLs are handled, files deleted with zero-importer proof, preload trigger rules, and the list of e2e specs updated.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
