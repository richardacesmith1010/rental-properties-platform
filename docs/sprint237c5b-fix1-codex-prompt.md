# Sprint 237c-5b fix 1 — review findings on the uncommitted 5b work (L3, same spec)

## 1. Objective
Fix what Claude's review found in your 237c-5b work, which is still uncommitted on top of the 5a commit `09ae479`:
3 small code items and 15 under-asserted tests (L-017, L-030). `docs/sprint237c5b-codex-prompt.md` (rev 6.1) stays the
spec. Nothing here changes its design.

## 2. Context
- Gate is green: 327 files / 2,866 tests + build. All 9 of your mutations, plus 2 extra, were re-run independently and
  caught. Spec conformance and the adversarial review found no blocker.
- `expectNoWrites(world)` exists from the 5a fix (a "write" = any `db:*:insert|upsert|update|delete`, `rpc:*`,
  `auth.insert`, `auth.createUser`, `auth.generateLink`, `auth.inviteUserByEmail` or `auth.email`). Reuse it; if it is
  local to a 5a test file, move it into `fake-invite-db.ts` as an export and import it from both.

## 3. In scope
F1-F3 (code), T1-T13 (tests), and their mutation proofs.

## 4. Out of scope
5a and 5c work beyond moving `expectNoWrites`. SQL. Any new copy. Unrelated dirty files (`.claude/launch.json`,
`docs/sprint166b-codex-prompt.md`, `docs/health-log.md`).

## 5. Exact files expected to change
- `apps/web/lib/manager-invite-rows.ts`
- `apps/web/app/actions/__tests__/manager-invite-revoke.test.ts`, `manager-invite-resend.test.ts`, `join-invite.test.ts`
- `apps/web/app/actions/__tests__/fake-invite-db.ts` (only to export `expectNoWrites`) and the 5a test file it is moved
  out of (import only)

## 6. Implementation requirements
Code:
- **F1** `manager-invite-rows.ts:117-136`. Validate the `manager_invite_revoke` row like 5a's helpers: `outcome` in
  `revoked | already_revoked | accepted | not_found`, and `released`, `other_live`, `kept_direct` each `typeof ===
  "boolean"`. Any other shape → log `revoke_failed`, `"Failed to revoke invitation."`, and no link reset.
- **F2** Accepted manager rows in Revoke (`tenant-invitations.ts` routes them to `revokeManagerInvite`). At the top of
  `revokeManagerInvite`, `row.status === "accepted"` → `"They already signed in. This invite can't be revoked."` with no
  reads or writes (before the client and Auth checks).
- **F3** §6.6 step 7, `grant: true`, unconfirmed: an `already_accepted` or `accepted` outcome from the grant (the person
  signed in between the confirmed check and the grant) → reason `already_joined`, not `grant_failed`.

Tests (assert every fact listed for the item in the 5b packet; exact copy with `toEqual`; final state after every retry):
- **T1** B12(b): after the retry, row `expired` and grant inactive. B12(a), (c) and the allowlisted case: use
  `expectNoWrites` minus the one allowed read path (no `rpc:manager_invite_grant`, no Auth writes, 0 emails where listed).
- **T2** B5: after the second Send, 2 pending rows and 1 grant with `assigned_directly` false. After A's Revoke: no
  `auth.rotate` / `auth.generateLink`, and `clickLink(<P's token>)` returns `true`. After the accept: grant active, A's row
  `expired`. After B's Revoke: grant active.
- **T3** B6: add the second case (B's row live): grant stays; copy `"Invitation revoked. Another invite still gives them
  this home."`. Assert the `clickLink` result.
- **T4** B15: spy `console.error`; for each of the five failure states assert at least one `[manager-invite]` call, and that
  no argument contains the email, `fake-link:` or `tok:`. Rebuild the A8 and A9 states as 5a defines them (A8 on a fresh
  Send; A9 on Send).
- **T5** B23: exact §6.3 copy `"{name} already has access to this home. No email was sent."` (with the test's name), op
  log contains `rpc:manager_grant_homes`, A's row `expired`, grant active and `assigned_directly` true. Remove the
  meaningless `expect(profileId).toBe(...)`.
- **T6** B22: 0 emails after the join resend; `expectNoWrites`-style check covering upsert, insert and the grant RPC.
- **T7** B4 join case: seed `invited_profile_id: null` (the true legacy shape).
- **T8** Exact copy: B7(b) and B9(c) `toEqual({ success: true, message: "Invitation revoked." })`.
- **T9** Row `expired` asserted in B2 (after the first Revoke), B8(b) `afterOp` case, B9(a), B24.
- **T10** B8(b): move the `expect` out of the `afterOp` hook (store the result, assert after the awaited call).
- **T11** B19: pin the tenant bump as unfiltered (the update is not called with `("status", "pending")`).
- **T12** New B25 (join-page grant bypass): a confirmed invitee whose access was revoked (row `expired`, grant inactive),
  plus a second pending row of theirs on another home without access. Join resend on that pending row →
  `INACTIVE_INVITE_MESSAGE`; grant stays inactive; `expectNoWrites` except `rpc:manager_invite_accept`.
- **T13** New tests for F1 (fake revoke returns `kept_direct: null` → `"Failed to revoke invitation."`, no link reset), F2
  (accepted row → the copy, 0 RPC calls), F3 (`afterOp("auth.getUserById", …)` signs the person in → Resend returns
  `"They already signed in. No email was sent."`).

## 7. Validation commands
```
(cd apps/web && npx vitest run app/actions/__tests__/manager-invite-revoke.test.ts \
  app/actions/__tests__/manager-invite-resend.test.ts app/actions/__tests__/tenant-invitations.test.ts \
  app/actions/__tests__/join-invite.test.ts app/actions/__tests__/manager-invite-guards.test.ts \
  app/actions/__tests__/manager-invite-trigger-model.test.ts app/actions/__tests__/manager-invite-rpc-model.test.ts)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
```
Do NOT run `npm run gate:web`. Do not write SQL.

## 8. Acceptance criteria
1. F1-F3 implemented; each has a T13 test that fails without it.
2. T1-T12 done; each strengthened assertion named in the report with file:line.
3. Mutation proofs (revert each): MF1 drop the boolean checks → T13-F1 fails. MF2 remove the accepted early return →
   T13-F2 fails (RPC called). MF3 map `already_accepted` to `grant_failed` → T13-F3 fails. MB12 skip the revoke RPC on
   retry (return success) → T1 fails. MB25 call `manager_invite_grant` on the join page for a confirmed user → B25 fails.
4. Earlier mutations (M2, M5a, M5b, M7, M8, M10, M20, M21, M22) still caught. Every 5a test still green.
5. Full suite, tsc, lint green. `inviteTenant` byte-identical to HEAD.

## 9. Report format
Compact status only: files changed with line counts, F/T item → file:line, mutation results, command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies. No SQL. Exact copy only; invent no strings.
- Lines ≤ 140 characters; files stay ≤ 500 lines.
