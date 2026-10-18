# Sprint 237c-5a fix 1 — review findings on the uncommitted 5a work (L3, same spec)

## 1. Objective
Fix what Claude's 4-reviewer pass found in your 237c-5a work, which is still uncommitted in this working tree:
3 code deviations, 7 weak or tautological tests (L-017), and 8 places where the fakes differ from the SQL.
`docs/sprint237c5a-codex-prompt.md` (rev 6.1) stays the spec. Nothing here changes its design.

## 2. Context
- The working tree holds your 5a changes (`git status`: 11 modified and 8 new files under `apps/web`). HEAD is docs-only
  since then. Gate is green: 325 files / 2,799 tests + build. All 12 of your mutations were re-run independently and caught.
- SQL contract: `supabase/migrations/20261028_sprint237c5_manager_invite_functions.sql`. The fakes must match it.
- Live fact (Claude probe, 2026-10-18 02:24Z): `signUp` on an unconfirmed user that Domus created with `createUser` does
  not change its password, metadata or `app_metadata`. After the invitee confirms, the attacker's password fails
  (`invalid_credentials`). No code change is needed; it is context only.

## 3. In scope
Items F1-F3 (code), T1-T14 (tests), K1-K8 (fakes) below, and their mutation proofs.

## 4. Out of scope
5b and 5c work. SQL. Any copy change. Any file not in §5. Unrelated dirty files (`.claude/launch.json`,
`docs/sprint166b-codex-prompt.md`, `docs/health-log.md`): leave them alone.

## 5. Exact files expected to change
- `apps/web/app/actions/invitations.ts`, `apps/web/lib/manager-invite.ts`, `apps/web/lib/validations-entity.ts`
- `apps/web/app/actions/__tests__/fake-invite-db.ts`, `fake-gotrue.ts`
- `apps/web/app/actions/__tests__/manager-invite-trigger-model.test.ts`, `manager-invite-guards.test.ts`,
  `manager-invite-rpc-model.test.ts`, `invitations.test.ts`
- `apps/web/lib/__tests__/manager-invite-email.test.ts`, `apps/web/lib/__tests__/validations.test.ts` (only the
  `inviteManagerSchema` block)

## 6. Implementation requirements
Code:
- **F1** `invitations.ts:62-68` (§6.2 8b). `getUserById` returns `{ data: { user: null }, error }` on any Auth error, so the
  "other error" branch never runs. Order: a non-`user_not_found` error → step 7's copy `"Could not check this email. Try
  again."`. Then `user_not_found` or no user → `"Could not find this person's account. Try a different email."`.
- **F2** `validations-entity.ts` (§6.9). When the `propertyIds` key is present but is not a valid JSON array of UUIDs,
  return `"Pick at least one home."` even if `propertyId` is also present. Only a missing `propertyIds` key falls back to
  the legacy `propertyId`.
- **F3** `manager-invite.ts` RPC results (`:116`, `:126`, `:135`). `data` is untyped. Validate every row at runtime: the
  expected keys exist, and `outcome` is in the allowed set for that function (grant: `granted | accepted |
  already_accepted | not_pending`; accept: `accepted | no_access`; grant_homes: boolean `added`). Any other shape → treat
  it as that call's error (log `grant_failed` or `accept_failed`, return the same copy as an RPC error). Never treat an
  unknown outcome as granted.

Tests (a "write" means any op log entry `db:*:insert|upsert|update|delete`, `rpc:*`, `auth.insert`, `auth.createUser`,
`auth.generateLink` or `auth.inviteUserByEmail`). Add one helper `expectNoWrites(world)` in a test file and use it
wherever the packet says "no writes" or "zero Auth calls":
- **T1** A9: assert grant-before-email using the op index of the *retry* (`lastIndexOf("rpc:manager_invite_grant")` and
  the following `auth.email`). The first, failed attempt must not satisfy it.
- **T2** A7: assert the exact row count (2) and grant count (2) before `every(...)`; same for A11 (P has 2 rows).
- **T3** A24(c): after Send again, assert the `self_signup_blocked` log, 0 rows, 0 grants, 0 emails (`expectNoWrites`).
- **T4** A24(b): the first call → `expectNoWrites`; the retry → 1 user, rows pending, 1 email. A24(d): the retry → grants
  active, 1 email.
- **T5** A27: restore HEAD's pinned `expect(calls.upsert).not.toHaveBeenCalled()` (HEAD `invitations.test.ts:69`).
- **T6** A14: exact copy and the RPC args include `p_accept: true`. A13: RPC/upsert args name the 3 homes; use
  `expectNoWrites` for "no row, no Auth write, no email" parts.
- **T7** A5: assert the full prefix `https://app.example.com/auth/confirm?token_hash=` plus the encoded token and
  `&amp;type=invite`. A6: exact success copy. A8: retry rows `pending`. A10: exactly 1 user.
- **T8** A15, A16, A19, A20: use `expectNoWrites` (includes inserts and RPCs).
- **T9** A32: exact strings (`toBe`/`toEqual` on subject, title, body lines, button, footer); run the `&amp;lt;` escape check
  on the one-home message, where the home name is rendered.
- **T10** A37: snapshot the whole fake world before each expected raise (P0002, 22023, 42501) and assert it is unchanged
  after. Seed one grant without `assigned_directly` and assert it behaves as `true`. Assert `added: true` for an existing
  inactive grant.
- **T11** New: F1 (a transient `getUserById` error → step 7 copy, `expectNoWrites`). F2 (`propertyIds: "x"` with a valid
  `propertyId` → `"Pick at least one home."`). F3 (the fake RPC returns `outcome: "weird"` → the error copy, no email).
- **T12** Test rules: `manager-invite-rpc-model.test.ts` stubs `RESEND_*` and uses the fake Date timers like the others;
  `manager-invite-guards.test.ts` advances the clock (`vi.setSystemTime(t0 + n * 60_000)`) before each action.
- **T13** Seeds: A13's existing active grant comes from a prior Send + sign-in, or from `grantNewHomes`, not a raw seed.
  A15's tenant profile comes from the fake Auth API (`selfSignUp(email, { role: "tenant" })`), not a raw seed.
- **T14** A3: also assert the new user is unconfirmed.

Fakes (match the SQL exactly):
- **K1** `world.seed` applies the same defaults as builder writes (`assigned_directly` defaults to `true`).
- **K2** `manager_grant_homes`: 22023 on a null `p_profile_id`; distinct, non-null property ids, ascending order.
- **K3** `manager_invite_accept`: skip rows with a null `property_id`; rows in `id` order.
- **K4** `manager_invite_revoke`: `other_live` is computed only when both the profile and `property_id` are non-null
  (else `false`), as SQL :194.
- **K5** `manager_invite_grant`: drop null ids first; 22023 only when none remain; rows in `id` order.
- **K6** `runHandleNewUser`: `coalesce` semantics. An empty-string `full_name` stays `''`; on conflict, `full_name =
  coalesce(nullif(excluded.full_name, ''), existing)`.
- **K7** Upsert with `onConflict`: on a conflict keep the existing row's `id` (and other columns not in the payload);
  never copy the incoming row's generated id. A10 and A12 must still pass for the right reason.
- **K8** Each fake function that SQL orders `by i.id` returns rows in that order.

## 7. Validation commands
```
(cd apps/web && npx vitest run app/actions/__tests__/manager-invite-trigger-model.test.ts \
  app/actions/__tests__/manager-invite-guards.test.ts app/actions/__tests__/manager-invite-rpc-model.test.ts \
  app/actions/__tests__/invitations.test.ts app/auth/__tests__/callback-route.test.ts lib/__tests__/invitations.test.ts \
  lib/__tests__/manager-invite-email.test.ts lib/__tests__/invite-email.test.ts lib/__tests__/validations.test.ts)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
```
Do NOT run `npm run gate:web`. Do not write SQL.

## 8. Acceptance criteria
1. F1-F3 implemented as written; each has a T11 test that fails without it.
2. T1-T14 done; each strengthened assertion named in the report with file:line.
3. K1-K8 done; A37 covers K1, K2, K3, K4, K5 and K7 with at least one assertion each.
4. Mutation proofs (revert each): MF1 restore the old 8b order → T11-F1 fails. MF2 let a bad `propertyIds` fall back to
   `propertyId` → T11-F2 fails. MF3 remove the F3 outcome check → T11-F3 fails. MT1 change A9 back to `indexOf` and swap
   grant and email in the retry → A9 still fails (proves T1). MK1 remove the K1 seed default → T10 seed case fails.
   MK7 copy the incoming id on conflict → A10 or A12 fails.
5. Your earlier mutations (M1, M3, M4, M6, M9, M11-M15, M18, M19, M22) still caught.
6. Full suite, tsc, lint green. `inviteOwner` and `markTenantInvitationAccepted` still byte-identical to HEAD.

## 9. Report format
Compact status only: files changed with line counts, F/T/K item → file:line, mutation results, command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies. No SQL. Exact copy only; invent no strings.
- Lines ≤ 140 characters; new or edited files stay ≤ 500 lines (`validations.test.ts` exempt as before).
- If a fake change makes an existing test fail for a real reason, fix the code or the test to match the spec, and say so.
