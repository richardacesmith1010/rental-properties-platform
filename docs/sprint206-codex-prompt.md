# Sprint 206 — Manager Clients screens + "Whose home is this?" (L2: UI + manager add-home rule) · Category 3 (Manager)

## 1. Objective
Let a manager (Alia) run homes for owners who aren't on Domus, using Sprint 205's client accounts.
- **New Clients section:** a list of the manager's clients, an Add client sheet, and a page per client.
- **Adding a home:** every home a manager adds now starts with **"Whose home is this?"** (pick a client or add a new one).
- **Owner decision 2026-10-08:** a manager can no longer add a home as their own. The old path that silently created a personal account for the manager is closed.

**Approved design** (match layout, copy and hierarchy): https://claude.ai/artifact/CT1mZ4eyHhrL1R2RJJ7uhH. Its 5 screens are: Clients list, no clients yet, Add client sheet, "Whose home is this?" (step 1 of the add-home flow), and a client's page. The names in the design are samples; use real data.

## 2. Context (HEAD `17b0fd5`, main)
- **Already live from Sprint 205:**
  - `apps/web/lib/client-accounts.ts`: `listClientAccountsForManager`, `isActiveClientManager`, `getClientState`.
  - `apps/web/app/actions/client-accounts.ts`: `createClientAccount` and `addClientHome`. They return `accountId` / `propertyId`. Their exact strings: `Client added.`, `Home added.`, `Please check the details and try again.`, `You can't add homes for this client.`, `Could not add the client. Please try again.`, `Could not add the home. Please try again.`, `Too many requests. Please try again later.`
  - **The DB does the enforcing:** client homes have `owner_profile_id = NULL`, and only the service-role RPC `add_client_home` can create them. Leases are forced to "outside Domus". There's a DB trigger as well, so don't write property rows for client homes directly.
- **Manager nav:** `components/dashboard/dashboard-config.ts`. Items come from `buildAllSectionItems()` (:51–266); `managerMenuGroups` is at :289; page descriptions are in `ownerPageDescriptions` (:310). The section switch is `components/dashboard/sections/render-section-cases.tsx` (switch at :66, "portfolio" at :404). The URL sync in `components/dashboard/navigation/manager.ts` uses `?section=`, and unknown ids fall back to overview.
- **Manager data:** `app/manager/page.tsx` loads everything in one `Promise.all` (:149–214) and passes props to `<Dashboard>` (:223–322). The props flow: `DashboardProps` (`components/dashboard/types.ts`) → `SectionRendererProps` (`section-map.ts` ~:70–90) → filled in `dashboard-data-loader.tsx` (~:175).
- **Add home:**
  - `components/dashboard/forms/property-form.tsx` (310 lines; step labels at :23; account `<Select>` at :204–216, which is always empty for managers).
  - It posts to `createProperty` (`app/actions/properties.ts:24`). With a blank `ownerAccountId`, that calls `getOrCreateIndividualOwnershipAccount(user.id)` and inserts with `owner_profile_id: user.id`.
  - The unified wizard (`components/dashboard/unified-property-wizard.tsx`, 480 lines) is mounted for managers in `components/dashboard/index.tsx:267–284`. The manager page passes neither `onCreatePropertyWithSetup` nor `activeAccountId`, so managers see "This setup flow is unavailable right now." (`unified-property-wizard.tsx:200–203`).
  - `createPropertyWithSetup` (`app/actions/unified-setup.ts:52`) calls `createProperty`, then creates units and a lease, and calls `cleanupSetupDraft` on failure.
- **Existing route pattern:** `/manager/properties/[id]`.
- **Phone layout:** managers get `MobileTopBar` plus a menu drawer that shows `managerMenuGroups` automatically. There's no bottom bar.
- **Shared UI:** `components/ui/{card,button,input,select,badge,alert,modal-overlay,mobile-drawer}.tsx`, `components/shared/{empty-state,submit-button}.tsx`, `components/dashboard/forms/form-helpers.tsx`, and `toast` from `sonner`.

## 3. In scope
1. **`createProperty` manager rule** (`app/actions/properties.ts`). This is server-side and authoritative.
   - If `role === "manager"`:
     - `ownerAccountId` is required. If it's missing, return `Pick whose home this is.`
     - If `isActiveClientManager(user.id, ownerAccountId)` is true, create the home through `addClientHome`'s logic: call `admin.rpc("add_client_home", …)` with `p_manager = user.id`, or extract a shared server-only helper from `app/actions/client-accounts.ts` and use it in both places. Map errors exactly as `addClientHome` does. Return `{ success: true, propertyId, message: "Home added." }`. Do **not** insert into `properties` or `property_managers` directly.
     - Otherwise return `You can't add homes for this client.`
     - Managers never reach `getOrCreateIndividualOwnershipAccount` again.
   - **Owner invariant (L-014):** the owner path is unchanged byte-for-byte in behavior, including blank account → `getOrCreateIndividualOwnershipAccount` and the existing error strings. Pin it with a test written **before** you change the code.
   - Any lookup error refuses: return `Could not add the home. Please try again.`
2. **Client overview data:** `lib/client-overview.ts` (`import "server-only"`, admin client, explicit columns, every error checked, batched with `.in()` and no per-client queries):
   - `getClientsOverview(managerId)` → `[{ id, name, accountType, homeCount, contactEmail, summary }]`.
   - `getClientDetail(managerId, accountId)` → `{ id, name, accountType, contactEmail, homes: [{ id, name, address, status }] } | null`. It returns `null` unless `isActiveClientManager`.
   - **Per-home `status`, in priority order:**
     - `overdue`: any unpaid rent with a due date before today.
     - `paid`: this month's rent is paid.
     - `due`: unpaid and not yet late. Show `Due {Mon D}`.
     - `no_tenant`: no active lease.

     "Today" and "month" follow the property time zone, default `America/Denver`.
   - **Client `summary` text (exact):**
     - `{N} rent overdue` if any home is overdue;
     - else `All rent paid this month` if every leased home is paid;
     - else `Rent due {Mon D}` (earliest due);
     - else `No tenants yet`.
3. **Clients section** (`section id "clients"`, label `Clients`, first item of the "Homes you manage" group; description `Owners whose homes you run.`). Manager only; owners never see it.
   - **List:** each client shows an initials avatar, name, a `Person`/`LLC` tag, `1 home`/`{N} homes`, and the summary line (overdue in the warn color, all paid in the positive color, otherwise muted). Each row links to the client page. Under the list: `Rent for client homes is paid outside Domus. You mark it paid when it comes in.`
   - **Empty state:** `Add your first client`, then `A client is an owner whose homes you run. They don't need a Domus account.`, then the button `Add client`.
   - **Add client sheet** (`mobile-drawer` on phone, `modal-overlay` on desktop):
     - Title `Add client`; field `Client name`.
     - Choice `Who owns the home?` with options `A person` (`One owner`) and `An LLC` (`A business`).
     - Field `Email` marked `(optional)`, with help text `Just for your records. We won't email them.`
     - Button `Add client`. On success, show the toast `Client added.`, close the sheet, and the new client appears. On error, show the action's error inline.
     - Uses `createClientAccount`.
4. **Client page** `app/manager/clients/[accountId]/page.tsx`:
   - `requireRole(["manager"])`. `getClientDetail`; if it returns null, `notFound()`.
   - Back link `Clients` → `/manager?section=clients`.
   - Header: avatar, name, tag, contact email if present.
   - Info banner: `Rent here is paid outside Domus. Mark it paid when it comes in.`
   - `Homes` heading with an `Add a home` button that opens the add-home flow with this client preselected.
   - Each home row: name, address, and a status pill (`Paid` / `Overdue` / `Due {Mon D}` / `No tenant`). The row links to `/manager/properties/[id]`.
   - Empty homes: `No homes yet.` plus the `Add a home` button.
5. **"Whose home is this?" step** (manager only, first step of BOTH add-home flows):
   - **`PropertyForm`:** when `role === "manager"`, replace the ownership-account `<Select>` step with a first step titled `Whose home is this?`.
     - Show radio-style cards for each client (name + `{N} homes`) and a dashed `New client` button that opens the Add client sheet. A newly added client becomes selected.
     - Help line: `Is the owner on Domus already? Ask them to invite you instead.`
     - `Next` stays disabled until a client is picked.
     - It sends `ownerAccountId`.
     - Header `Add a home`, plus `Step 1 of {N}`.
   - **Unified wizard:** pass `onCreatePropertyWithSetup={createPropertyWithSetup}` from `app/manager/page.tsx`, and add the same first step for managers, which sets `accountId`. Preselect it when opened from a client page.
   - Owners: both flows are unchanged.
6. **Manager data wiring:** add `getClientsOverview` to the manager `Promise.all`, then thread it through `DashboardProps` → `SectionRendererProps` → the new section. Also pass `createClientAccount` and `createPropertyWithSetup`.

## 4. Out of scope
- Owner statements (207) and claim (208).
- The "Show: All homes" filter for managers.
- Changing the owner flows, or moving existing manager personal-account homes.
- DB or migrations.
- Notifications (OFF).
- Any change to Sprint 205's guards.

## 5. Exact files expected to change
New:
- `apps/web/lib/client-overview.ts`
- `apps/web/app/manager/clients/[accountId]/page.tsx`
- `apps/web/components/dashboard/clients/clients-section.tsx`
- `apps/web/components/dashboard/clients/add-client-sheet.tsx`
- `apps/web/components/dashboard/clients/whose-home-step.tsx`
- `apps/web/components/dashboard/clients/client-detail.tsx`
- tests

Changed:
- `apps/web/app/actions/properties.ts`
- `apps/web/app/actions/client-accounts.ts` (only if you extract the shared helper)
- `apps/web/components/dashboard/dashboard-config.ts`
- `apps/web/components/dashboard/sections/render-section-cases.tsx`
- `apps/web/components/dashboard/section-map.ts`
- `apps/web/components/dashboard/types.ts`
- `apps/web/components/dashboard/dashboard-data-loader.tsx`
- `apps/web/components/dashboard/index.tsx`
- `apps/web/components/dashboard/forms/property-form.tsx`
- `apps/web/components/dashboard/unified-property-wizard.tsx`
- `apps/web/app/manager/page.tsx`

List every file you change. Any other file needs a one-line reason.

## 6. Implementation requirements
- **The user should never need to read instructions to complete this flow. Every step must be self-explanatory.** If the user needs to think about what to do, the UI needs to be clearer.
- Exact copy as listed here. Sentences ≤ 12 words. The plain-language guard passes. Never write "charge" or "submit".
- Light and dark themes use the existing tokens (`--accent`, `--warn`, `--pos`, `--surface`, …); no hard-coded hex. Tap targets ≥ 44 px on phones (`min-h-11 sm:min-h-0` pattern). It works at 375 px with no sideways scroll.
- Every Supabase result is checked. No query inside a loop. Lines ≤ 140; files ≤ 500 (`render-section-cases.tsx` is at 487: put the new case's body in `clients-section.tsx` and keep the case to a few lines). No new dependencies. No `eslint-disable`.
- **Strings the UI shows from actions (L-020):** everything listed in §2 and §3.1. Nothing else.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- New tests, plus every existing test that imports a changed file (find them with `grep -rlE "properties\.ts|property-form|unified-property-wizard|dashboard-config|render-section-cases|section-map|dashboard-data-loader|manager/page|client-accounts" apps/web --include=*.test.ts --include=*.test.tsx`)
- `lib/__tests__/plain-language.test.ts`
- `npm run build --workspace @domus/web`

## 8. Acceptance criteria (binary)
1. **`createProperty` tests:**
   - manager with no account → `Pick whose home this is.`, with no RPC and no insert;
   - manager with an active client → `add_client_home` called with `p_manager = user.id` and the form fields, and no direct `properties` or `property_managers` writes;
   - manager with an inactive or foreign client → `You can't add homes for this client.`, with no RPC;
   - manager never calls `getOrCreateIndividualOwnershipAccount`;
   - RPC codes `22023`, `42501` and other → exact strings;
   - lookup error → `Could not add the home. Please try again.`;
   - **owner** with a blank account → still calls `getOrCreateIndividualOwnershipAccount` (pinned before the change).
2. **`client-overview` tests:**
   - each status rule, including priority overdue > paid > due > no_tenant and the time-zone month edge;
   - each summary rule;
   - batching: query count is constant for 1 vs 5 clients;
   - a foreign or inactive client → `getClientDetail` returns null;
   - a query error throws.
3. **Section and UI tests:**
   - the nav shows `Clients` for managers only;
   - the list renders rows and summaries;
   - the empty state renders;
   - the Add client sheet calls `createClientAccount` and shows `Client added.`;
   - "Whose home is this?" disables `Next` until a pick, `New client` opens the sheet, and the picked id is posted as `ownerAccountId`;
   - the wizard for managers posts `accountId` and no longer shows "unavailable";
   - the client page calls `notFound` for a null detail.
4. Owner add-home flows are unchanged (existing tests stay green, plus the pinned test).
5. All tests are real assertions (L-017). Lint, typecheck, the guard and the build pass. Only the listed files changed.

## 8b. Post-deploy (Claude)
Live walk as the smoke manager:
1. Clients is empty → add client `S206 Walk Client` (LLC) → it appears.
2. Add a home through "Whose home is this?" → the client page shows it with `No tenant`.
3. Add a unit and a lease → the lease shows as paid outside Domus.
4. The wizard works for the manager.
5. Repeat at 375 and 1280 px, light and dark, with 0 console errors.
6. In SQL: the home has `owner_profile_id IS NULL` and a derived `property_managers` row, and the Sprint 205 invariant queries all return 0.
7. Clean up the walk data. Then smoke, CI and Sentry.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access or migrations. No deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
