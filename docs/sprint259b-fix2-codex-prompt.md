# Sprint 259b fix 2 — Explicit timeouts on the whole-tree inventory tests (L1)

Codex: `gpt-6-luna` · low (one test-file setting; L1). Claude: Opus 5.5 · Max. Builds on the uncommitted 259b work and
fix 1 in the tree; don't revert them.

## 1. Objective
`npm run gate:web` failed once on "T19 inventories all eight table writers and distinguishes delete-only RPCs from
activation" (`lib/__tests__/membership-writers-inventory.test.ts:151`): "Test timed out in 5000ms". The test builds a
TypeScript program over all of `apps/web`; alone it takes about 2 s, but under the full parallel suite it passed 5 s.
CI runners are slower still. Give every whole-tree test an explicit, generous timeout.

## 2. Context
Vitest's default per-test timeout is 5000 ms (`vitest.config.ts`). Tests that walk the whole `apps/web` tree or build a
TypeScript program: in `lib/__tests__/membership-writers-inventory.test.ts` (the T19 inventory test and the T6 every-file
scan) and in `lib/__tests__/agreement-enforcement-inventory.test.ts` (its file scans).

## 3. In scope
A timeout argument on those tests.

## 4. Out of scope
Every other file and setting; the tests' logic and assertions; the global vitest config.

## 5. Exact files expected to change (apps/web)
`lib/__tests__/membership-writers-inventory.test.ts`, `lib/__tests__/agreement-enforcement-inventory.test.ts`.

## 6. Implementation requirements
- **R1** Pass `60_000` as the timeout (the last argument of `it`/`test`) on every test in the two files that walks the
  `apps/web` tree or builds a TypeScript program. Tests that only check synthetic strings keep the default.
- **R2** No other change.

## 7. Validation
`cd apps/web && npx vitest run lib/__tests__/membership-writers-inventory.test.ts lib/__tests__/agreement-enforcement-inventory.test.ts`
then `npm run gate:web` from the repo root.

## 8. Acceptance criteria
- **Z1** Each whole-tree test in the two files has a `60_000` timeout; no assertion changed (`git diff` shows only the
  timeout arguments).
- **Z2** The gate is green.

## 9. Report format
Compact status only: files changed (lines before → after), each criterion → test name, gate result, token count.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Lines ≤ 140 characters; no new dependencies; no other edits.
