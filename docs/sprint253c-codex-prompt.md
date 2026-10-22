# Sprint 253c — Code health: split `lib/ownership.ts` (709 lines) by verbatim moves behind a re-export façade (L3: auth) — rev 2 (rev 1 AWC)

## 1. Objective
`apps/web/lib/ownership.ts` is 709 lines (limit 500). It holds the ownership-account loaders and
`canUserAdministerOwnershipAccount`, the permission check used by 8 server actions and 3 libs. Split it into focused
modules with **verbatim moves only — no behavior change**. `lib/ownership.ts` stays as a façade that re-exports every
current export by the same name, so none of its ~45 importers change.

## 2. Context
- HEAD: see `git log -1`. Same approved pattern as Sprints 253a/253b (shared proof script
  `apps/web/scripts/verify-verbatim-split.mjs` from 253a).
- File map (line range → symbol): 6–66 exported DTOs `OwnershipAccountDTO`, `OwnershipMemberDTO`,
  `ActiveLlcMembershipDTO`, `AccountRenameRequestDTO`, `AccountDeleteRequestDTO`; 67–122 private row interfaces
  `OwnershipAccountRow`, `GovernanceProfileRow`, `AccountRenameRequestRow`, `AccountRenameVoteRow`,
  `AccountDeleteRequestRow`, `AccountDeleteVoteRow`; 123 `unique`; 127 `getFirstName`; 136 `generateJoinCode`; 143
  `getUniqueOwnershipJoinCode`; 155 `interface OwnershipAccountsPayload`; 163 `assembleOwnershipAccountsPayload`; 183
  `getOwnershipAccountsForUser`; 202 `getOwnershipAccountsForUserLegacy`; 315 `getActiveLlcMembershipsForUser`; 360
  `findAccountByJoinCode`; 380 `getOwnershipMembersForAccount`; 445 `getOrCreateIndividualOwnershipAccount`; 532
  `canUserAdministerOwnershipAccount`; 561 `getGovernanceProfileMap`; 582 `getPendingAccountRenameRequests`; 647
  `getPendingAccountDeleteRequests`.
- Internal uses (measured): `getUniqueOwnershipJoinCode → generateJoinCode, findAccountByJoinCode`;
  `getOwnershipAccountsForUser → assembleOwnershipAccountsPayload, getOwnershipAccountsForUserLegacy`;
  `getOwnershipMembersForAccount → canUserAdministerOwnershipAccount`; `getOrCreateIndividualOwnershipAccount →
  getFirstName`; `unique` is used by the legacy loader, the LLC loader and governance.
- **Client components import DTO types from `@/lib/ownership`** (e.g. `components/dashboard/ownership/*.tsx`,
  `account-switcher.tsx`). The current file has **no** `import "server-only"`, and ~20 tests import it transitively
  without mocking `server-only` (the real package throws under vitest). So this sprint does **not** add
  `server-only` anywhere; the types module must stay import-free so client type imports stay safe.
- Tests touching it: `ownership-membership-query.test.ts`, `owner-rpc-parity.test.ts`, `invitations-scope.test.ts`,
  `client-owner-access.test.ts`, `speed-loaders.test.ts`, `members-section.test.tsx`, `account-switcher.test.tsx`.
- 0 lines in the file are longer than 140 characters.

## 3. In scope
New folder `apps/web/lib/ownership/`:
1. `types.ts` — the five DTOs, the six row interfaces and `OwnershipAccountsPayload` (all exported). **No imports**
   except `import type { StripeAccountHealthStatus } from "@/lib/stripe"` if a moved type uses it.
2. `accounts.ts` — `unique`, `generateJoinCode`, `getUniqueOwnershipJoinCode`, `assembleOwnershipAccountsPayload`,
   `getOwnershipAccountsForUser`, `getOwnershipAccountsForUserLegacy`, `getActiveLlcMembershipsForUser`,
   `findAccountByJoinCode`.
3. `members.ts` — `getFirstName`, `getOwnershipMembersForAccount`, `getOrCreateIndividualOwnershipAccount`,
   `canUserAdministerOwnershipAccount`.
4. `governance.ts` — `getGovernanceProfileMap`, `getPendingAccountRenameRequests`, `getPendingAccountDeleteRequests`.
`lib/ownership.ts` becomes only explicit named re-exports (`export { … } from "./ownership/…"` and
`export type { … } from "./ownership/types"`) of **exactly** the names it exports at BASE — no `export *`, no newly
public helper (`unique`, `getFirstName`, `getGovernanceProfileMap` and the row interfaces stay non-public from the
façade). Moved symbols gain `export` and nothing else.
**Allowed import edges (allowlist):** `accounts → types`; `members → types`; `governance → types, accounts` (for
`unique`); façade → `types, accounts, members, governance`. `types` imports none of the new modules. Nothing outside
`lib/ownership/`, the façade and tests imports `lib/ownership/*`.

## 4. Out of scope
Any logic, query, column, filter, error string or return-shape change. Adding `server-only` or `"use server"`. Any
importer of `@/lib/ownership`. Renaming anything. Existing test edits.

## 5. Exact files expected to change
- `apps/web/lib/ownership.ts`
- `apps/web/lib/ownership/types.ts`, `accounts.ts`, `members.ts`, `governance.ts` (new)
- `apps/web/lib/__tests__/ownership-split.test.ts` (new: structure + `canUserAdministerOwnershipAccount`
  characterization, §8 C2/C4)
- `apps/web/scripts/verify-verbatim-split.mjs` — only if a generic gap blocks this file (report the diff)
- `apps/web/scripts/verify-export-surface.mjs` (new, dev-only, §6 step 5)

## 6. Implementation requirements
Do these in order.
1. **Baseline.** `BASE=$(git rev-parse HEAD)`; confirm `git diff --quiet $BASE -- apps/web/lib/ownership.ts`. Run the
   seven test files in §2 and record per-file pass counts. Use that one SHA everywhere; print it in the report.
2. **Characterize the permission check first** (in the new test file, against the unchanged file): mock
   `@/lib/supabase/admin` with a fake whose two `maybeSingle()` queries return configured rows and record their filters.
   Cases: active member row → `true`; creator row only → `true`; neither → `false`; member query missing-schema error →
   `false`; creator query missing-schema error → `false`; a non-missing-schema error with no data → `false`. Assert the
   exact recorded filters of both queries across the suite (a case may short-circuit; `ownership_account_members`: `account_id`, `profile_id`, `active = true`;
   `ownership_accounts`: `id`, `created_by_profile_id`). Then record `shasum -a 256` of the new test file. The
   structure cases (C4) go in a **separate** `describe` appended in step 4; the report shows the step-2 hash and
   proves the later diff of this file is additions only (the step-2 text is an unchanged prefix).
3. **Move verbatim** per §3; add only `export` and imports. No reformatting, renaming, reordering inside a block, or
   comment edits.
4. Add the structure `describe` (C4). Run the shared proof script:
   `node scripts/verify-verbatim-split.mjs --base $BASE --old lib/ownership.ts --facade lib/ownership.ts --new
   lib/ownership/types.ts lib/ownership/accounts.ts lib/ownership/members.ts lib/ownership/governance.ts`.
5. **Export surface (semantic).** Add `apps/web/scripts/verify-export-surface.mjs` (dev-only, shared with Sprint 253d):
   with the TypeScript compiler API (a `Program` over BASE's file via `git show` written to a temp copy, and over the
   current tree), enumerate the façade's exports, resolve re-export aliases to their declarations, and require
   identical exported-name sets; for each name compare the printed public type/signature (`checker.typeToString` /
   `signatureToString` with `NoTruncation`) and whether it occupies the type namespace, value namespace or both. Fail
   on any public API change; allow the change from inline declarations to named re-exports. On failure print
   `name | BASE kind | AFTER kind | API match`.
6. Each file ≤ 500 lines; every new line ≤ 140 characters.

## 7. Validation
```
cd apps/web
npx vitest run lib/__tests__/ownership-split.test.ts lib/__tests__/ownership-membership-query.test.ts \
  lib/__tests__/owner-rpc-parity.test.ts lib/__tests__/invitations-scope.test.ts lib/__tests__/client-owner-access.test.ts \
  lib/__tests__/speed-loaders.test.ts components/__tests__/members-section.test.tsx components/__tests__/account-switcher.test.tsx
node scripts/verify-export-surface.mjs --base $BASE --facade lib/ownership.ts
npx tsc --noEmit
```
(eight test files: seven pre-existing plus the new split test) then from the repo root `npm run lint:web` and `npm run build:web` (Claude runs `npm run gate:web`).

## 8. Acceptance criteria
- C1 The seven pre-existing regression files pass with the same per-file counts before and after, with no edit to them.
- C2 The `canUserAdministerOwnershipAccount` characterization (six cases plus exact filters) passes before the move
  and, unchanged, after it.
- C3 The proof script prints `OK` for every symbol and no `DIFF` (the façade at BASE minus moved blocks equals the
  façade's non-export text); `verify-export-surface.mjs` reports identical name sets, namespaces and
  public types for every export. (The verbatim proof alone covers source-body identity.)
- C4 Structure test: no new file contains `"use server"`, `"use client"` or `server-only`; `types.ts` has no value
  imports and declares only interfaces/types; the façade contains only `export { … } from` / `export type { … } from`
  statements whose names equal the BASE export list (hard-coded in the test) — no `export *`; every internal import
  edge belongs to the §3 allowlist (unused permitted edges do not fail; any other edge, reverse dependency,
  self-import or cycle fails); no importer of `lib/ownership/*` outside the folder, the façade and tests; each file
  ≤ 500 lines.
- C5 `npm run build:web` passes (proves no client bundle picked up a server value import).
- C6 Report a table: symbol → BASE line range → new file:line range; `wc -l` of all five files; L-015 character
  totals (supplement only).

## 9. Report format
Compact status only: BASE SHA, C1–C6 → test names, validation counts. Do NOT include 'Claude prompt' or 'recommended
next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. No Undo (no behavior change). Claude re-runs both proof scripts,
runs the gate, deploys, confirms the production deployment's commit SHA equals the shipped commit, then walks the owner
test account's Home and Ownership section and the manager test account's Home on that revision (read-only; nothing
submitted) and checks Sentry for new issues on `/owner` and `/manager`.
The user should never need to read instructions to complete this flow (no UI change).
