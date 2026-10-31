# Sprint 259b fix 1 — Make the 259b tests prove their facts (fix round of an L3 sprint)

Codex: `gpt-6.1-sol` · high (tests on auth, consent and an atomic join; same model as the sprint). No ChatGPT round: tests
and two spec corrections only, no app behavior change. Claude: Opus 5.5 · Max. Builds on the uncommitted 259b work in
the tree (packet `docs/sprint259b-codex-prompt.md` rev 7); don't revert it.

## 1. Objective
An independent review mapped every 259b criterion to its tests and ran 27 mutations against a copy of `apps/web`:
15 criteria covered, 7 weak (T6, T7, T8, T13, T16, T18, T19), none missing; 13 mutations survived. Under L-017 weak
tests fail the sprint. Make every listed test able to fail when the behavior breaks, and correct two spec facts.

## 2. Context (file key: J = `app/actions/__tests__/llc-join-journey.test.ts`, F = `…/llc-invite-flow.test.ts`,
MW = `lib/__tests__/membership-writers-inventory.test.ts`, EI = `lib/__tests__/agreement-enforcement-inventory.test.ts`)
- Surviving mutations: the rpc got the URL token instead of the looked-up row's token (the fake's lookup uses exact
  equality on the same constant, so they're always identical); Terms/Privacy versions swapped or hard-coded (both are
  `"2026-10-30"`); a direct membership upsert on `agreement_required` in the create path (the fake records only rpc
  joins); three log mutations (F spies only `console.error`, the rotated token isn't canary-prefixed, `JSON.stringify`
  drops `Error` messages); several scanner blind spots (table name in a constant, `as` cast, builder in a variable,
  aliased or namespace import of the join helper, TRUNCATE); a hold symbol placed in a test file.
- **Spec corrections (Claude, verified 2026-10-30):** (a) `app/actions/connect.ts` writes `ownership_account_members`
  (`.update({ payout_stripe_account_id })`), as Codex found; (b) `app/actions/account-wipe.ts` deletes membership rows
  through `plan.deleteIn("ownership_account_members", …)` / `plan.deleteWhere(…)`, applied by the `account_wipe_apply`
  rpc (`lib/account-wipe/mutations.ts`), whose dynamic `delete from public.%I` covers the table. It only deletes. So
  T19's rule becomes: **only `accept_llc_invitation` creates or activates memberships through an rpc** (the auth trigger
  `handle_new_user` does it at account creation for the separate `invitations` table).

## 3. In scope
The tests in §5 and the shared helpers inside them. Nothing else.

## 4. Out of scope
App code under `app/`, `components/`, `lib/` (non-test), the database, `apps/ios`. If a stronger test fails because
the app is wrong, stop and report it; don't change app code.

## 5. Exact files expected to change (apps/web)
`app/actions/__tests__/llc-join-journey.test.ts`, `app/actions/__tests__/llc-invite-flow.test.ts`,
`lib/__tests__/membership-writers-inventory.test.ts`, `lib/__tests__/agreement-enforcement-inventory.test.ts`
(assertions only). Nothing else.

## 6. Implementation requirements
- **F1 (T19 token provenance)** Call the join with `token.toUpperCase()`; make the fake's `.eq("token", …)` match
  case-insensitively, as Postgres uuid does; assert `p_invitation_token` equals the row's lowercase token, not the input.
- **F2 (T19 versions)** In a focused test, mock `@/lib/legal-versions` so `terms.current` and `privacy.current` differ
  (for example `"2099-01-01"` and `"2099-02-02"`) and assert exactly those values reach the rpc, in the right fields.
- **F3 (T19 inventory)** Writer set = `{app/actions/account-governance-delete-support.ts, app/actions/account-wipe.ts,
  app/actions/connect.ts, app/actions/invitations.ts, app/actions/onboarding.ts, app/actions/ownership.ts,
  lib/distributions.ts, lib/ownership/members.ts}`, each with a reason (`account-wipe.ts`: "Deletes rows during an
  account wipe; never creates or activates"). Also flag calls whose first argument is the members-table name on methods
  named `insert*`, `upsert*`, `update*` or `delete*` (this catches `plan.deleteIn` / `plan.deleteWhere`). The rpc list
  marks `account_wipe_apply` as writing memberships (delete-only, with that reason) and `accept_llc_invitation` as the
  only rpc that creates or activates them, called only from `lib/llc-invitations.ts`.
- **F4 (T19 scanner)** Resolve `from(IDENT)` through module-level string constants; look through parentheses, `as`,
  `satisfies`, `await` and `!` when walking a call chain; flag a members-table builder assigned to a variable unless the
  chain is a `select`; find `acceptLLCInvitationMembership` references with the TypeScript type checker so aliased and
  namespace imports count; in raw SQL strings also flag `truncate` and `merge`. Add one synthetic source string per
  case to the scanner test and assert each is flagged.
- **F5 (T13)** In F, spy on `console.log`, `info`, `warn`, `error` and `debug`. Stub `crypto.randomUUID` to return
  `canary-new-<uuid>` and assert the update's `token` equals it exactly (replace the regex). In J and F, turn every
  logged argument into text with `util.inspect(arg, { depth: 5 })` (so `Error` messages count) before asserting that no
  canary token, `joinPath` or `agreeUrl` appears.
- **F6 (T16, T18 f)** Make the fake record direct `ownership_account_members` and `profiles` writes. In the create-path
  recovery tests (J:192-197, J:216-222) assert exactly: the only table write is the one failed `legal_acceptances`
  upsert; `rpc` called once, `toEqual` the exact arguments; the sign-in calls exactly; no `updateUserById`, no
  `deleteUser`; final state no membership.
- **F7 (T7 create path)** Use the shared no-write helper at J:243-248 with an explicit allowance of exactly one
  `createUser` call, made with the invitation email.
- **F8 (T8)** Run an 8-day-old pending invitation through `signInToJoinLLC`, `createAccountToJoinLLC` and the page as
  well as `acceptLLCInvitation`; each asserts today's exact copy and exactly one expire update. Move the expire
  allowance into the shared helper (an option, not an ad hoc check).
- **F9 (T6)** Scan every file under `apps/web` of any type, tests included, except `node_modules`, `.next` and
  `test-results`; build the searched strings from pieces so the test doesn't match itself. Assert both EI reasons for
  the join actions (EI:16, EI:78) don't match `/paused/i` and do name R5 and R6.
- **F10 (T18 a)** Take the fake's auth-state role from each `it.each` persona (owner for a, tenant for b).
- **F11 (T4, optional in the review, required here)** Record filters per query chain; assert the resend and cancel
  updates' filters equal `[["id", <id>], ["status", "pending"]]` exactly.

## 7. Validation
`cd apps/web && npx vitest run app/actions/__tests__/llc-join-journey.test.ts app/actions/__tests__/llc-invite-flow.test.ts
lib/__tests__/membership-writers-inventory.test.ts lib/__tests__/agreement-enforcement-inventory.test.ts` then
`npm run gate:web` from the repo root.

## 8. Acceptance criteria
- **Y1** F1–F11 are in place, each with a named test; exact values with `toEqual`.
- **Y2** Each surviving mutation in §2 now fails at least one test. Claude re-runs the reviewer's mutation script
  after this round; a survivor fails the round.
- **Y3** Every existing 259a and 259b test still passes; the gate is green.

## 9. Report format
Compact status only: files changed (lines before → after), each F item → test name, gate result, token count.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Lines ≤ 140 characters; no file over 500 lines (split the journey test into two files only if it would pass 500, and
then list the new file in the report); no new dependencies (`typescript` is already installed); tests never put
`expect` inside a mock implementation (L-028); no app code changes.
