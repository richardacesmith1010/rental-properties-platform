# Sprint 237c-5 — Manager invite redesign: index (rev 3)

Rev 3 splits rev 2 (`docs/sprint237c5-codex-prompt.md`, now superseded) into three L3 Codex packets and folds in all 16
completeness-critic items (`docs/sprint237c5-critic-notes.md` §2) plus the C1 live results. HEAD `0e4a85c`.

## Why split
Rev 2 was too big for one Codex run: 14 source files, 12 test files (incl. a fake Postgres + GoTrue), ~52 tests, 6+ mutations
(critic §1). Each part now has its own files, tests, mutations and review. Section numbers (§6.x) are kept from rev 2.

## The three sprints
- **5a Send** (`docs/sprint237c5a-codex-prompt.md`, A1-A36): §6.1 helpers, §6.2 `inviteManager`, §6.3, §6.4, §6.5 accept
  at sign-in, §6.8 gate + email, §6.9 schema (legacy `propertyId` kept); the fakes. Owns §2 context and D1-D9 in full.
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
- Before that release deploys: Claude applies the `charge_edit_history` `pm.active` migration with its rollback (5b C2).
  After deploy: Claude C4 backfill, C5 checks, Claude C3 walk, C6 handoff.

## Critic §2 items → where
1. Revoked invitee can read `charge_edit_history` — ADOPTED in 5b (C2 text, Claude file list). Migration + rollback exist.
2. No test for §6.2 step 12 — ADOPTED in 5b (B8(c), M8). Modified: B8(c) also covers the step-12 release error.
3. step 12 release error; Invariant; C5 — ADOPTED: step 12 copy in 5a; Invariant in 5a §1 and 5b §1; C5 line in 5b.
4. Row-action errors unmount — ADOPTED in 5c (§6.10, C2). Added M16 to make it falsifiable.
5. Shared fake world — ADOPTED in 5a (§8 fakes), reused by 5b.
6. Sign-in during Send — ADOPTED in 5a (A25, M9); moved from the revoke-resend file since it needs only Send.
7. Undo (5); C6; C3 — ADOPTED: Undo (5) in 5b §6.7; C6 follow-up and C3 rule in 5c.
8. 9b profile read error — ADOPTED in 5a (§6.2 9b, A24(b)).
9. D7 laundering (NIT) — ADOPTED-modified in 5a. C1(g) confirmed it. 9b refuses on `full_name !== fullName` (A24(c), M14).
   Added: 8b and 9c also require `full_name` (`isInvitedAuthUser`), because 9b's own `generateLink` sets `invited_at` on the
   self-signup user, so the next Send would pass 8b (A24(c) Send again, M15). A24(a) uses a tenant invite with a matching
   `full_name` so M13 (role check) stays falsifiable.
10. C1(f) probe — ADOPTED: done live (below).
11. Email check before keyed-by-email calls — ADOPTED-modified. 5b §6.7 step 8 as written (B9(c)). 5a §6.4 step 0 applies it
    to both branches via a new `authEmail` param, since `inviteUserByEmail` is also keyed by email (A26; fake `setAuthEmail`).
12. Mutations M10-M13 — ADOPTED: M11-M13 in 5a, M10 in 5b.
13. Test 5 encoding — ADOPTED in 5a (A5).
14. `parseJsonArray` — ADOPTED in 5a (§6.9, A35).
15. Resend `login_gone` — ADOPTED in 5b (§6.6, B9(b), B18, B19).
16. Admin client preface; N-Revokes follow-up — ADOPTED: 5a §6.2 preface; C6 in 5c.

## C1 live results (Claude, 2026-10-18 01:11Z; X0, X1 = `+c5probe0`/`+c5probe1`, both now used)
(a) `generateLink` invite, new email: inserts `auth.users`, trigger made role manager with `full_name`; 200 in 83 ms,
`user_invited`, no mail. (b) `inviteUserByEmail` 1.5 s later: same user, `invited_at` updated, mail sent; (a)'s token →
`otp_expired` 403; no frequency limit. (c) `generateLink` again: new `hashed_token`; `verifyOtp` invite → session, email
confirmed. (d) `generateLink` on confirmed → `email_exists` 422. (e) `getUserById(random)` → `user_not_found` 404. (f)
`inviteUserByEmail` on confirmed → `email_exists` 422, no mail. (g) self sign-up then `generateLink`: same user, `invited_at`
null → set, `user_metadata` unchanged (no `full_name`). (h) GoTrue lowercases emails. Not read: the Supabase invite template.
Vercel Production: allowlist set, `DOMUS_NOTIFICATIONS_ENABLED` absent → mode `test`. `handle_new_user` md5 unchanged
(`2c51636368d7ef759fd151508e904240`, 2026-10-18). Claude C3's walk now uses fresh X2 and X3.

## Old → new test map
- 5a: 1-10 → A1-A10 (7 and 9 lose their Resend halves → B16); 13 → A11; 30 → A12 (moved: M4 targets 5a code); 14(a) → A13;
  15(a) → A14; 16-24 → A15-A23; 25 → A24 (+critic (b), +(c)); 26(b) → A25; new → A26; 38, 39 → A27, A28; 43-49 → A29-A35;
  52 → A36.
- 5b: 11, 12 → B1, B2; 14(b) → B3; 15(b-d) → B4; 26-28 → B5-B7; 29(a-c) → B8; 34 → B9 (+Resend, +email cases); 35 → B10;
  31-33 → B11-B13; 36, 37 → B14, B15; 7/9 Resend halves → B16; 40-42 → B17-B19; 52 → B20.
- 5c: 50 → C1; 51 → C2 (+critic toasts); 52 → C3.

## Residual risk
Two inviters sending to one brand-new email at the same moment: the second gets the D7 copy once (9b name mismatch); Send
again works via 8b.
