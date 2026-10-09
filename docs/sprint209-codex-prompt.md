# Sprint 209 — Show late rent for client homes (L2) · Category 3 (Manager)

## 1. Objective
Rent on "collected outside Domus" leases is never shown as **Late**, and it's left out of overdue lists and reports. That's right for an owner's own outside-Domus tenants, because the owner may record payments later. It's wrong for **client homes**: the manager records every payment there, and all client rent is outside Domus, so overdue client rent is invisible.

**Owner decision (2026-10-09, default taken):** fix it for client homes only. An owner's own outside-Domus leases keep today's behavior exactly.

## 2. Context (verified live)
- `lib/lease-collection.ts`: `isCollectedOutsideDomus(pref)` (`collects_outside_domus` or `collectsOutsideDomus`).
- **Two meanings are mixed today:**
  - (a) **Can't pay online in Domus.** Keep this as is.
  - (b) **Don't track lateness.** This sprint changes it for client homes.
- **Sites that use meaning (b):**
  - `lib/charge-generation.ts:230–243` (the late-status and late-fee cron skips outside leases);
  - `lib/dashboard.ts:57` and `lib/manager-dashboard.ts:15` (late → pending);
  - `lib/manager-dashboard.ts:23`;
  - `lib/delinquency.ts:86`;
  - `lib/analytics.ts:150`;
  - `lib/action-items.ts:161`;
  - `lib/dashboard-legacy.ts:91`;
  - `lib/rent-urgency.ts:46`;
  - `components/dashboard/charges/charges-implementation.tsx:63,93,214`;
  - `components/dashboard/dashboard-kpi-loader.ts:242`;
  - `components/dashboard/dashboard-home-loader.ts:132,146,152`.
- **Sites that use meaning (a). Leave them alone:**
  - `lib/tenant-pay-state.ts:17`;
  - `lib/tenant-payments.ts` (the tenant view stays unchanged in this sprint);
  - `dashboard-home-loader.ts:194` (`nextDueOutsideDomus`);
  - the Sprint 205 Stripe guards.
- **Client home** = the home's `owner_account_id` belongs to an `ownership_accounts` row with `managed_client = true`. Owners never see client homes (they have no members), so owner-facing loaders can treat every home as non-client. `PropertyListItem.ownerAccountIsClient` already exists (Sprint 208).
- Live data: no rent with status `late` exists on outside-Domus leases today. 4 outside-Domus rents are `waived`, 6 `paid`, 1 `pending`.

## 3. In scope
1. **Helper** in `lib/lease-collection.ts`: `tracksLateRent(pref: { collects_outside_domus?; collectsOutsideDomus?; clientHome?; client_home? })`. It returns `!isCollectedOutsideDomus(pref) || pref.clientHome === true || pref.client_home === true`. Every meaning-(b) site listed above switches to `tracksLateRent` (or `!tracksLateRent`). Meaning-(a) sites keep `isCollectedOutsideDomus`.
2. **Thread the client flag** (`clientHome: boolean`) onto the lease and charge objects that reach the meaning-(b) sites:
   - For **manager** loaders (`manager-dashboard.ts`, `delinquency.ts`, `analytics.ts`, `action-items.ts`, the charges list, KPIs, home loader) and the cron, use **one batched** lookup: `properties.owner_account_id` → `ownership_accounts.managed_client`. Explicit columns, errors checked, `.in()`, no per-row queries.
   - **Owner** paths can default to `clientHome: false`, with no new query. Owners never load client homes, so don't add a query to the owner Home path.
   - Add `clientHome?: boolean` to the `DashboardCharge` type.
3. **Cron** (`lib/charge-generation.ts`):
   - **Late status:** client-home rent past its grace window becomes `late`, using the same grace rule as normal leases.
   - **Late fees:** never added automatically for any outside-Domus lease, client homes included (unchanged).
   - No new notifications or emails (notifications are OFF; add no notification calls).
4. **What managers see:** past-due client rent shows under `Late` on Rent, counts in the `Rent` nav badge and Home KPIs, appears in overdue reports and analytics, and gets the overdue urgency. Behavior for normal (non-outside) leases is unchanged.

## 4. Out of scope
- The tenant view (`tenant-payments.ts`, `tenant-pay-state.ts`).
- Owner outside-Domus leases (pinned unchanged).
- Late fees, notifications.
- DB schema changes.
- The client statement and client overview (they already treat `pending`/`late` as unpaid).

## 5. Exact files expected to change
- `apps/web/lib/lease-collection.ts`
- `apps/web/lib/charge-generation.ts`
- `apps/web/lib/dashboard.ts`
- `apps/web/lib/manager-dashboard.ts`
- `apps/web/lib/delinquency.ts`
- `apps/web/lib/analytics.ts` (+ its loader if it builds the lease map: `lib/analytics-loader.ts`)
- `apps/web/lib/action-items.ts`
- `apps/web/lib/dashboard-legacy.ts`
- `apps/web/lib/rent-urgency.ts`
- `apps/web/components/dashboard/charges/charges-implementation.tsx`
- `apps/web/components/dashboard/dashboard-kpi-loader.ts`
- `apps/web/components/dashboard/dashboard-home-loader.ts`
- the type files that carry `clientHome`
- tests

Name any other file and give the reason.

## 6. Implementation requirements
- Every Supabase result checked. No query inside a loop. Lines ≤ 140; files ≤ 500 (`dashboard-kpi-loader.ts` is at 464). No new dependencies.
- No change to tenant-facing behavior, and no change to online-payment eligibility.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- New tests, plus every existing test that imports a changed file
- `lib/__tests__/plain-language.test.ts`
- `npm run build --workspace @domus/web`

## 8. Acceptance criteria (binary)
Real tests (L-017) for:
1. **`tracksLateRent` truth table:** normal → true; outside and not client → false; outside and client → true (both key spellings).
2. **Cron:**
   - an outside client-home rent past grace becomes `late` with **no** late fee;
   - an outside non-client rent stays `pending` with no fee;
   - a normal lease is unchanged (late + fee as today);
   - the client lookup is one batched query, and an error throws.
3. **Manager views, one test each:**
   - a client-home `late` rent stays `late` (not remapped to pending) in `manager-dashboard`;
   - it's included in delinquency, analytics and action items;
   - it counts in the charges-list `Late` tab, the nav badge and the KPI;
   - it gets the overdue urgency.
4. **Pinned owner/non-client invariants** (written first): an outside non-client `late` rent is still remapped to pending, excluded, and gets no urgency, exactly as today.
5. Tenant files are unchanged (diff check in the report).
6. Lint, typecheck, guard and build pass. Only the listed files changed.

## 8b. Post-deploy (Claude)
1. Create a test client home with an outside-Domus lease and a rent past grace.
2. Run the late-marking cron path (the existing cron route with the cron secret, or a direct SQL check of its effect). Confirm the rent becomes `late` with no late-fee row.
3. As the smoke manager: Rent shows it under `Late`, the badge and Home count it, and the client list says `1 rent overdue`.
4. Check that the owner's existing outside-Domus pending rent is unchanged.
5. Clean up. Then smoke, CI and Sentry.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
