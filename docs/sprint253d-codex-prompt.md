# Sprint 253d — Code health: split `lib/stripe-connect.ts` (685 lines) by verbatim moves behind a re-export façade (L3: money) — rev 2 (253c AWC applied: semantic export proof)

## 1. Objective
`apps/web/lib/stripe-connect.ts` is 685 lines (limit 500). It creates Stripe Express accounts and links, decides
whose Stripe account receives rent (`getOwnerStripeAccountForProperty`, `getManagerStripeAccountForProperty`) and
checks rent-collection authority. Split it into focused modules with **verbatim moves only — no behavior change**.
`lib/stripe-connect.ts` stays as a façade that re-exports every current export by the same name, so none of its 15
importers change.

## 2. Context
- HEAD: see `git log -1`. Same approved pattern as Sprints 253a–c (shared proof script
  `apps/web/scripts/verify-verbatim-split.mjs` from 253a).
- File map (line range → symbol): 7 `StripeAccountResponse`; 14 `StripeExpressAccountParams` (exported); 21
  `RentCollectionConnectTarget` (exported); 23 `RentCollectionConnectStatus` (exported); 33
  `RentCollectionAuthorityAccountRow`; 43 `StoredStripeAccount`; 51 `STRIPE_VERIFICATION_MAX_AGE_MS`; 53
  `isStripeVerificationStale`; 58 `refreshStaleStripeAccounts`; 82 `RentCollectionPropertyRow`; 87
  `DEFAULT_EXPRESS_ACCOUNT_BUSINESS_PROFILE_URL`; 89 `buildExpressAccountParams`; 108
  `getDefaultExpressAccountBusinessProfileUrl`; 112 `buildExpressAccountRequestBody`; 129 `stripeConnectRequest`; 149
  `ConnectContext`; 151 `assertConnectContext`; 155 `createExpressAccount`; 168 `createAccountLink`; 189 `getAccount`;
  207 `createLoginLink`; 217 `getConnectedStripeProfile`; 235 `buildEmptyRentCollectionConnectStatus`; 242
  `sortByCreatedAtAndId`; 251 `hasCompletedStripeConnection`; 258 `getRentCollectionAuthorityAccountIds`; 287
  `hasRentCollectionAuthorityForAccount`; 292 `getRentCollectionConnectHref`; 300 `getRentCollectionConnectStatus`; 425
  `getOwnerStripeAccountForProperty`; 506 `getManagerStripeAccountForProperty`; 545 `arePropertyOwnersConnected`.
- Internal uses (measured): `refreshStaleStripeAccounts` is used by `getRentCollectionConnectStatus` and
  `arePropertyOwnersConnected`; `getConnectedStripeProfile` by the three property-account functions; the create/link
  functions use `stripeConnectRequest` and `assertConnectContext`.
- All 15 importers are server code. The current file has **no** `import "server-only"`; tests that reach it
  transitively (autopay, charge-checkout, webhook handlers, connect actions) do not all mock `server-only` (the real
  package throws under vitest). So this sprint does **not** add `server-only`.
- Existing test `lib/__tests__/stripe-connect.test.ts` (604 lines, 16 tests) covers express params, `createExpressAccount`,
  `arePropertyOwnersConnected`, `getRentCollectionConnectStatus`, `getOwnerStripeAccountForProperty`,
  `isStripeVerificationStale`. **Not covered:** `getManagerStripeAccountForProperty`,
  `hasRentCollectionAuthorityForAccount`, `createAccountLink`, `createLoginLink`, `getAccount`.
- 0 lines in the file are longer than 140 characters.

## 3. In scope
New folder `apps/web/lib/stripe-connect/`:
1. `api.ts` — `StripeAccountResponse`, `StripeExpressAccountParams`, `StoredStripeAccount`,
   `STRIPE_VERIFICATION_MAX_AGE_MS`, `isStripeVerificationStale`, `refreshStaleStripeAccounts`,
   `DEFAULT_EXPRESS_ACCOUNT_BUSINESS_PROFILE_URL`, `buildExpressAccountParams`,
   `getDefaultExpressAccountBusinessProfileUrl`, `buildExpressAccountRequestBody`, `stripeConnectRequest`,
   `ConnectContext`, `assertConnectContext`, `createExpressAccount`, `createAccountLink`, `getAccount`,
   `createLoginLink`.
2. `rent-collection.ts` — `RentCollectionConnectTarget`, `RentCollectionConnectStatus`,
   `RentCollectionAuthorityAccountRow`, `RentCollectionPropertyRow`, `buildEmptyRentCollectionConnectStatus`,
   `sortByCreatedAtAndId`, `hasCompletedStripeConnection`, `getRentCollectionAuthorityAccountIds`,
   `hasRentCollectionAuthorityForAccount`, `getRentCollectionConnectHref`, `getRentCollectionConnectStatus`.
3. `property-accounts.ts` — `getConnectedStripeProfile`, `getOwnerStripeAccountForProperty`,
   `getManagerStripeAccountForProperty`, `arePropertyOwnersConnected`.
`lib/stripe-connect.ts` becomes only explicit named re-exports (`export { … } from` / `export type { … } from`) of
**exactly** the names it exports at BASE — no `export *`, no newly public helper. Moved symbols gain `export` and
nothing else. **Allowed import edges (allowlist):** `rent-collection → api`; `property-accounts → api`; façade →
`api, rent-collection, property-accounts`. `api` imports none of the new modules. Nothing outside
`lib/stripe-connect/`, the façade and tests imports `lib/stripe-connect/*`.

## 4. Out of scope
Any logic, Stripe request, URL, parameter, query, error string, fee rule or return-shape change. Adding `server-only`
or `"use server"`. Any importer of `@/lib/stripe-connect`. Renaming anything. Edits to `stripe-connect.test.ts`.

## 5. Exact files expected to change
- `apps/web/lib/stripe-connect.ts`
- `apps/web/lib/stripe-connect/api.ts`, `rent-collection.ts`, `property-accounts.ts` (new)
- `apps/web/lib/__tests__/stripe-connect-split.test.ts` (new: characterization of the uncovered functions + structure,
  §8 S2/S4)
- `apps/web/scripts/verify-verbatim-split.mjs`, `verify-export-surface.mjs` — only if a generic gap blocks this file
  (report the diff)

## 6. Implementation requirements
Do these in order.
1. **Baseline.** `BASE=$(git rev-parse HEAD)`; confirm `git diff --quiet $BASE -- apps/web/lib/stripe-connect.ts`.
   Run `stripe-connect.test.ts` and record the pass count. Use that one SHA everywhere; print it in the report.
2. **Characterize the uncovered money/auth paths first** (new test file, against the unchanged file). Mock
   `server-only`, `@/lib/supabase/admin` (recording fake: table, filters, returned rows), `@/lib/client-accounts`,
   `@/lib/payment-fees`, `@/lib/stripe` and global `fetch` (record URL, method, body; no real network). No `expect`
   inside mocks (L-028); exact values with `toEqual`.
   - `getManagerStripeAccountForProperty`: every return branch in the source (connected manager → its account id; each
     "no account" branch → `null`), with the exact recorded queries.
   - `hasRentCollectionAuthorityForAccount`: an account in the authority list → `true`; not in it → `false`; the
     authority loader returning `null` → the source's result.
   - `createAccountLink`, `createLoginLink`, `getAccount`: the exact Stripe path, method and form body sent, the
     returned value, and that `assertConnectContext` runs before any request (a rejecting context → no `fetch`).
   Then record `shasum -a 256` of the new test file; structure cases (S4) go in a separate `describe` appended in step
   4, and the report proves the step-2 text is an unchanged prefix.
3. **Move verbatim** per §3; add only `export` and imports. No reformatting, renaming, reordering inside a block, or
   comment edits.
4. Add the structure `describe` (S4). Run the shared proof script:
   `node scripts/verify-verbatim-split.mjs --base $BASE --old lib/stripe-connect.ts --facade lib/stripe-connect.ts --new
   lib/stripe-connect/api.ts lib/stripe-connect/rent-collection.ts lib/stripe-connect/property-accounts.ts`.
5. **Export surface (semantic):** run Sprint 253c's `node scripts/verify-export-surface.mjs --base $BASE --facade
   lib/stripe-connect.ts` — identical name sets, namespaces (type/value/both) and public types for every export.
6. Each file ≤ 500 lines; every new line ≤ 140 characters.

## 7. Validation
```
cd apps/web
npx vitest run lib/__tests__/stripe-connect.test.ts lib/__tests__/stripe-connect-split.test.ts
npx vitest run lib/__tests__/stripe-webhook-handlers.test.ts lib/__tests__/plain-language.test.ts
npx tsc --noEmit
```
then from the repo root `npm run lint:web` and `npm run build:web` (Claude runs `npm run gate:web`).

## 8. Acceptance criteria
- S1 `stripe-connect.test.ts` passes with the same count before and after, with no edit.
- S2 The step-2 characterization passes before the move and, unchanged (same hash prefix), after it.
- S3 The proof script prints `OK` for every symbol and no `DIFF`; `verify-export-surface.mjs` reports identical name
  sets, namespaces and public types for every export.
- S4 Structure test: no new file contains `"use server"`, `"use client"` or `server-only`; the façade contains only
  `export { … } from` / `export type { … } from` statements whose names equal the BASE export list (hard-coded) — no
  `export *`; every internal import edge belongs to the §3 allowlist (unused permitted edges do not fail; any other
  edge, reverse dependency, self-import or cycle fails); no importer of `lib/stripe-connect/*` outside the folder, the
  façade and tests; each file ≤ 500 lines.
- S5 Plain-language guard and build pass; if a moved string needs a path change in `exceptions.json`, stop and report
  (none expected: the file has no entries today).
- S6 Report a table: symbol → BASE line range → new file:line range; `wc -l` of all four files; L-015 character
  totals (supplement only).

## 9. Report format
Compact status only: BASE SHA, S1–S6 → test names, validation counts. Do NOT include 'Claude prompt' or 'recommended
next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. No Undo (no behavior change). Tests never call Stripe (fetch is mocked). Claude re-runs
both proof scripts, runs the gate, deploys, confirms the production deployment's commit SHA
equals the shipped commit, then on that revision (read-only, no payment, no new Stripe account or link created): the
owner test account's Settings → bank status and Rent tab render; `/api/health` reports Stripe config OK; Sentry has no
new issues on `/settings`, `/owner`, `/tenant` or `/api/webhooks/stripe`.
The user should never need to read instructions to complete this flow (no UI change).
