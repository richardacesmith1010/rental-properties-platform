# Sprint 184 — Start always-loaded owner bundles early (L2: request ordering only) · Category 8: Speed

## 1. Objective
In production (2026-10-06, after Sprint 183), the owner page's critical path ends with `properties.admin-options` (announcement homes: 4 queries, ~0.50 s). It **starts only after** `manager-payments.visibility` (~0.27 s), which itself waits for `properties.administered-ids` (~0.10 s). `notifications.user` and `notifications.preferences` (1 query each, ~0.1 s) wait in the same place.

All three only need `params.userId`. `buildOwnerBundlePlan` (`apps/web/app/owner/page-data/bundle-plan.ts`) adds `announcement-properties`, `notifications` and `notification-preferences` **unconditionally** to every plan.

Start all three as soon as the page is known to be `ready`. That is right after the `needs-onboarding` / `needs-setup` early returns, at the point where `properties.administered-ids` starts.

Target (L-013, the sum of the remaining measured path):
- auth.role ~0.125 s;
- profile.summary / ownership.accounts ~0.14 s (in parallel);
- then the longer of: admin-options ~0.50 s, or administered-ids 0.10 + manager-payments.visibility 0.27 s.

That gives owner `data-assembly.total` median **≤ 0.85 s** (from ~1.1 s). Owner Home visible is ≈ 1.2–1.4 s; that figure is an estimate, not an acceptance target.

## 2. Context
- Branch `main`, HEAD `2b01932` or a later docs-only commit. File: `apps/web/app/owner/owner-page-data.ts` (`loadOwnerPageData`).
- Today, these calls sit inside the final `Promise.all`, gated by `hasBundle(...)`, and that `Promise.all` runs after `await managerPaymentsVisibilityPromise`:
  - `properties.admin-options` → `getAdministeredPropertyOptions(params.userId)`;
  - `notifications.user` → `getNotificationsForUser(params.userId)`, also gated by `capabilities.notificationsEnabled`;
  - `notifications.preferences` → `getUserNotificationPreferenceSettings(params.userId)`.
- `capabilities` comes from `getFeatureCapabilities()`. It has been static since Sprint 181 (0 queries), but it is still a promise; await it, or chain off it, for the `notificationsEnabled` gate.
- Existing helpers: `measureOwnerWithRequest`. Unhandled-rejection guards use the pattern `void promise.catch(() => undefined)`.

## 3. In scope
1. Create the three promises right after `administeredPropertyIdsPromise` is created (same measure names, same functions, same arguments).
   - The notifications promise keeps its `capabilities.notificationsEnabled` gate, chained off `capabilitiesPromise`; when the gate is off, it resolves to `undefined` as today.
   - Add the `void ....catch(() => undefined)` guards, matching the existing ones.
2. The final `Promise.all` awaits these promises, keeping the destructuring order and the returned values identical.
3. **Invariant guard:** add a unit test asserting that `buildOwnerBundlePlan` always contains `announcement-properties`, `notifications` and `notification-preferences`. Cover: Home with and without deferral; every `initialSectionId` case in its switch, including `null` and an unknown id; LLC and non-LLC. If a future change makes them conditional, the early start must be revisited, and this test fails.
4. **Order test:** with mocked loaders, assert that `getAdministeredPropertyOptions`, `getNotificationsForUser` and `getUserNotificationPreferenceSettings` are **called before** the `manager-payments.visibility` work resolves (for example, keep the manager-payments mock pending and assert the three were already called). Also assert the final returned `announcementProperties`, `notifications` and `notificationPreferenceSettings` are unchanged.
5. **Early-return test:** for `needs-onboarding` and `needs-setup`, none of the three loaders is called.

## 4. Out of scope
- `getAdministeredPropertyOptions` internals, `getAdministeredProperties`, RPCs, any DB change and any other loader.
- The bundle plan logic, client components and copy, the manager and tenant pages.
- Deploy, commit, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/app/owner/owner-page-data.ts`
- `apps/web/lib/__tests__/owner-page-data.test.ts` (extend it)
- `apps/web/lib/__tests__/owner-bundle-plan.test.ts` (new, or extend an existing bundle-plan test if one exists; name it in the report)

Each line must be at most 140 characters, and each file at most 500 lines (L-015). `owner-page-data.ts` must not grow by more than ~20 lines.

## 6. Implementation requirements
- No behaviour change other than start time: the same loaders, arguments, gates, perf names and returned data.
- No promise may be created before the early returns, so non-ready owners make no extra queries.
- Do not change the dependency of `sectionDataPromise`, `managerPaymentsVisibilityPromise`, `dashboardPromise` or `portfolioPromise`.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npm run test --workspace @domus/web -- --run apps/web/lib/__tests__/owner-page-data.test.ts` plus the bundle-plan test
- `npm run gate:web`

## 8. Acceptance criteria (binary)
1. The three promises are created once, right after `administeredPropertyIdsPromise`, after both early returns. Each has a catch guard.
2. The tests from §3.3, §3.4 and §3.5 exist as separate `it(...)` blocks with real assertions that call the real functions (L-017), and they pass.
3. Existing owner-page-data tests pass unchanged, or with mock-only changes listed in the report.
4. Lint, typecheck and the gate pass, and only §5 files changed.
5. **Claude, after deploy:**
   - production `[perf:owner]`: `properties.admin-options` starts within ~0.05 s of `properties.administered-ids`;
   - owner `data-assembly.total` median ≤ 0.85 s over ≥ 5 Home requests;
   - 28/28 browser specs pass, Sentry is clean and CI is green.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies.
