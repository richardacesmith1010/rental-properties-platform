# Sprint 237c-5 — Manager invite redesign: index (rev 6)

Rev 6 (5a, 5b): rev 3 REJECT → rev 4 REJECT → rev 5 REJECT → rev 6 (owner approved); see "ChatGPT round 1-3". 5c and
this index only update references.

Access invariant (rev 6): access to a home is active iff a live (`pending`/`accepted`) manager invitation exists for that
person and home, OR the grant is `assigned_directly`. Exceptions: a pending row right after a failed grant ("Could not add
access. Press Send again."; repaired by Send again or Resend); client-account sync and account wipe manage their own rows.
Expired never removes a direct add; accepted means the person signed in while access was active.

Rev 3 splits rev 2 (`docs/sprint237c5-codex-prompt.md`, now superseded) into three L3 Codex packets and folds in all 16
completeness-critic items (`docs/sprint237c5-critic-notes.md` §2) plus the C1 live results. HEAD `0e4a85c`.

## The three sprints
- **5a Send** (`docs/sprint237c5a-codex-prompt.md`, A1-A36): §6.1 helpers, §6.2 `inviteManager`, §6.3, §6.4, §6.5 accept
  at sign-in, §6.8 gate + email, §6.9 schema (legacy `propertyId` kept); the fakes. Owns §2 context, D1-D10 and the
  §6.12 SQL function contract.
- **5b Resend, Revoke, join page** (`docs/sprint237c5b-codex-prompt.md`, B1-B20): §6.6, §6.7 (`manager-invite-rows.ts`),
  manager branches in `tenant-invitations.ts` and `join-invite.ts`, the `invite-resend.ts` guard. Claude C2, C5.
- **5c UI** (`docs/sprint237c5c-codex-prompt.md`, C1-C3): §6.10 form, `owner-add-menu`, `Revoked` badge, revoke toast,
  row-action error toasts. Claude C3 walk, C4 backfill, C6 handoff (they need the full flow).

## Ship plan
- Each sprint gets `/chatgpt-review`, `/codex-dispatch` and the review gate separately.
- Claude commits each reviewed sprint locally (not deployed) before dispatching the next: 5b runs on HEAD = the local 5a
  commit, 5c on HEAD = the local 5b commit.
- 5a + 5b + 5c ship to production together in one release, after all three pass review. 5a alone would leave HEAD's Revoke
  (deletes the Auth user, keeps the grant) in front of the new rows; 5c needs 5a's schema.
- Before that release deploys: Claude applies the `charge_edit_history` `pm.active` migration (5b C2) and the
  five §6.12 functions (5a C7), each with its rollback, after re-running the SQL suite and race harness.
  After deploy: Claude C4 backfill, C5 checks, Claude C3 walk, C6 handoff.

## Critic §2 items → where
1. Revoked invitee can read `charge_edit_history` — ADOPTED in 5b (C2 text, Claude file list). Migration + rollback exist.
2. No test for §6.2 step 12 — ADOPTED in 5b (B8(c), M8); rev 4 retargets both to the grant function (step 12 is gone).
3. step 12 release error; Invariant; C5 — rev 4 SUPERSEDED by R4: no "third state"; C5 is a monitor only.
4. Row-action errors unmount — ADOPTED in 5c (§6.10, C2; M16). 5. Shared fake world — ADOPTED in 5a §8, reused by 5b.
6. Sign-in during Send — ADOPTED in 5a (A25, M9). 7. Undo (5); C6; C3 — ADOPTED: 5b §6.7 Undo; C6 and C3 in 5c.
8. 9b profile read error — ADOPTED in 5a; rev 4 moves it to step 7's read (A24(b)), since 9b no longer reads profiles.
9. D7 laundering (NIT) — rev 4 SUPERSEDED by R1: provenance is the server-only `app_metadata` marker, not `full_name`.
10. C1(f) probe — ADOPTED: done live (below).
11. Email check before keyed-by-email calls — ADOPTED-modified. 5b §6.7 step 8 as written (B9(c)). 5a §6.4 step 0 applies it
    to both branches via a new `authEmail` param, since `inviteUserByEmail` is also keyed by email (A26; fake `setAuthEmail`).
12. Mutations M10-M13 — ADOPTED: M11, M12 in 5a; M10 in 5b (rev 4 retargets M10, M13).
13. Test 5 encoding — ADOPTED in 5a (A5). 14. `parseJsonArray` — ADOPTED in 5a (§6.9, A35).
15. Resend `login_gone` — ADOPTED in 5b (§6.6, B9(b), B18, B19). 16. Admin client preface; N-Revokes — 5a §6.2; 5c C6.

## ChatGPT round 1 (5a rev 3: REJECT) → rev 4
- R1 D7 must not use client-writable metadata — ADOPTED: 5a D7, §6.1 `isDomusManagerInvitee`, §6.2 8b/9b use the marker
  `app_metadata.domus_manager_invite`, set only by 9b's create-only `createUser`. `isInvitedAuthUser` and name checks removed.
- R2 9c uses the same predicate — ADOPTED: 5a §6.2 9c (A23(b), M15).
- R3 attack test + mutation — ADOPTED: 5a A24(c) (self sign-up after the no-profile read, role manager, exact name); M13, M14.
- R4 every failure converges — ADOPTED: 5a §6.12 functions `manager_invite_grant` / `manager_invite_revoke` (one transaction,
  row locks; Claude's migration, rollback and SQL test, 5a C7). 5a step 12 and `releaseManagerHome` deleted; 5b §6.6 step 7
  and §6.7 steps 5-7 use the functions. Invariant rewritten in 5a §1, 5b §1. Tests: B7(a,b), B8(a-c), B12(a,b); M7, M8, M10
  retargeted (M7 is falsifiable because revoke keeps `invited_profile_id`). 5b C2 adds EXECUTE checks.
- Optional: A1 narrowed to "embedded SQL text equals the latest migration" — ADOPTED. Legit same-name race — ADOPTED (A24(d)).

## ChatGPT round 2 (rev 4: REJECT; provenance Pass) → rev 5
Proof files (commit `5ead674`, not applied): `supabase/migrations/20261028_sprint237c5_manager_invite_functions.sql` (5
functions), `supabase/tests/sprint237c5_manager_invite_functions.sql` (rolled-back; G1-G4, R1-R5, A1, H1, X1, P1 pass),
`supabase/tests/sprint237c5_manager_invite_race.mjs` + `…_concurrency.md` (live two sessions; no-lock control A breaks, B-E ok).
- R1 concurrent final revokes — ADOPTED: one advisory lock per (home, manager), ascending, before row locks (5a §6.12, D10).
- R2 identity binding — ADOPTED: `manager_invite_grant(ids, profile, inviter, p_accept)`; `P0002` / `22023` roll back all
  (5a §6.12; fake contract A37; M18).
- R3 accept only with access — ADOPTED: `manager_invite_accept` (5a §6.5), `p_accept` grants and accepts together,
  `manager_grant_homes` for §6.3. `grantManagerHomes` / `markManagerRowsAccepted` deleted. Tests A9, B22; M19, M21.
- R4 linearization — ADOPTED: 5a §6.13, 5b §2.2; tests B8(d) Send and B8(e) Resend (`afterOp` grant → full revoke).
- R5 real Postgres tests — ADOPTED as Claude items: 5a C7 and 5b C2 re-run both SQL files and the race harness.
- App: §6.3 re-opens expired rows as an explicit re-add; Resend authorizes before the confirmed check (B21, M20); Revoke always
  revokes a pending row, even after sign-in (B4(c), B6, M7; 5b Undo (6)).

## ChatGPT round 3 (rev 5: REJECT; concurrency, binding, atomicity, provenance, linearization Pass) → rev 6
Proof (commit `62a10ed`, not applied): migration adds `property_managers.assigned_directly` (default true; rollback drops it,
no access lost); rolled-back suite S0, G1-G4, R1-R5, A1, H1, D1-D3, X1, P1 pass; live race re-run
`supabase/tests/sprint237c5_manager_invite_race_rev6.mjs` (F, G: direct add vs last revoke) and the C5 diagnostic query in
`…_concurrency.md`.
- R1 revoke keeps independent access — ADOPTED: 5a §6.12 (flag, `kept_direct`), D10; 5b §6.7 step 10 copy "Invitation
  revoked. They still manage this home.", Undo (7); 5c toast list. Tests 5b B23 (ChatGPT's sequence), B24 (seeded grant),
  5a A37 source cases; M22.
- R2 B5 unreachable — ADOPTED: 5b B5 rewritten (both pending; A revokes while B's row is live; sign-in accepts B's only).
- R3 invariant for two sources — ADOPTED: 5a §1, 5b §1, this index.
- Optional: writer audit → 5a §2.3; C5 diagnostic → 5b C5; duplicate 5a §6.11 heading removed; "pending" reworded (5a §1,
  5b §1); C4 note on `assigned_directly = true` → 5c.

## Live results round 2 (Claude, 2026-10-18 01:27Z; X2, X3 = `+c5probe2`/`+c5probe3`, both now used)
`createUser({ email_confirm: false })` inserts (trigger fires, role from `user_metadata`), sends no mail (`user_signedup`), and
is create-only (existing email → `email_exists` 422). The `app_metadata` marker survives `generateLink` and `verifyOtp`;
clients cannot set it (`signUp` data and `updateUser` reach only `user_metadata`). 0 unconfirmed manager users live, so no
marker backfill; Claude C4 re-counts before deploy. Claude C3's walk now uses fresh X4 and X5.

## C1 live results (Claude, 2026-10-18 01:11Z; X0, X1 = `+c5probe0`/`+c5probe1`, both now used)
(a) `generateLink` invite, new email: inserts `auth.users`, trigger made role manager with `full_name`; 200 in 83 ms,
`user_invited`, no mail. (b) `inviteUserByEmail` 1.5 s later: same user, `invited_at` updated, mail sent; (a)'s token →
`otp_expired` 403; no frequency limit. (c) `generateLink` again: new `hashed_token`; `verifyOtp` invite → session, email
confirmed. (d) `generateLink` on confirmed → `email_exists` 422. (e) `getUserById(random)` → `user_not_found` 404. (f)
`inviteUserByEmail` on confirmed → `email_exists` 422, no mail. (g) self sign-up then `generateLink`: same user, `invited_at`
null → set, `user_metadata` unchanged (no `full_name`). (h) GoTrue lowercases emails. Not read: the Supabase invite template.
Vercel Production: allowlist set, `DOMUS_NOTIFICATIONS_ENABLED` absent → mode `test`. `handle_new_user` md5 unchanged
(`2c51636368d7ef759fd151508e904240`, 2026-10-18).

## Old → new test map
- 5a: 1-10 → A1-A10 (Resend halves of 7, 9 → B16); 13 → A11; 30 → A12 (M4 is 5a); 14(a) → A13; 15(a) → A14; 16-24 →
  A15-A23; 25 → A24 ((a) tenant race, (b), (c) attack, (d) same name); 26(b) → A25; new → A26; 38-39, 43-49 → A27-A35; 52 → A36;
  rev 5 new → A37 (rev 6 adds source-flag cases).
- 5b: 11, 12 → B1, B2; 14(b) → B3; 15(b-d) → B4; 26-28 → B5-B7; 29 → B8; 34 → B9; 35 → B10; 31-33 → B11-B13; 36, 37 →
  B14, B15; Resend halves → B16; 40-42 → B17-B19; 52 → B20; rev 5 new → B8(d, e), B21, B22;
  rev 6 new → B23, B24. 5c: 50 → C1; 51 → C2; 52 → C3.

## Residual risk
Two inviters sending to one brand-new email at the same moment: the second gets "Could not check this email. Try again."
once (9b `email_exists`); Send again works via 8b, since the marker is set.
