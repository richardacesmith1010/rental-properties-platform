# Sprint 237c-5b — Manager invite "Resend, Revoke, join page" (L3) — rev 4 (rev 3 ChatGPT REJECT → rev 4)

Severity L3 (auth/invite, access removal). `/chatgpt-review` before `/codex-dispatch`. Part 2 of 3; the index is
`docs/sprint237c5-index.md`. **Depends on 5a.** HEAD = the local 5a commit (reviewed, committed by Claude, not deployed). Line
numbers below for `tenant-invitations.ts`, `join-invite.ts`, `invite-resend.ts` and `invitations-section.tsx` are from
`0e4a85c`; 5a does not touch those files. Section numbers match rev 2 (§6.6, §6.7); "5a §x" means the 5a packet,
`docs/sprint237c5a-codex-prompt.md`.

## 1. Objective
Manager rows written by 5a's Send get working row actions:
- **Resend** re-grants the home and sends a fresh link, or heals the row to Accepted when the person already signed in.
- **Revoke** really removes access: in one transaction the row reads `expired` and the grant goes inactive. The link dies
  when no other pending manager row remains. It never deletes the Auth user (D4). Re-invite after a revoke works (5a's Send
  re-opens the row).
- The **join-page resend** (unauthenticated) never grants and never sends a link for a home without an active grant (D8).

Invariant (restated from 5a §1): a pending manager row means the person never signed in and can get a fresh link. It has an
active grant, except after a failed grant step, which shows "Could not add access. Press Send again." and is repaired by Send
again or Resend. An expired row never leaves access behind: revoke expires the row and removes access in one transaction
(D10, 5a §6.12). The join page never sends a link without an active grant (§6.6 step 7). Every runtime failure converges
through normal app retries.

This sprint ships nothing alone. 5a, 5b and 5c go to production together. At HEAD, Revoke on a manager row deletes the Auth
user and keeps the grant; this sprint replaces that before any 5a row reaches production.

## 2. Context
Unchanged context is in 5a §2: the live trigger (5a §2.1), the Auth call table and the C1 live results (5a §2.2), live
schema (5a §2.3), decisions D1-D10 (5a §2.6). Facts the requirements below depend on:

### 2.1 Auth and trigger facts (from 5a §2.1-2.2, proven live)
- `handle_new_user` runs once, inside an `auth.users` insert. It grants every pending manager row for the email and marks every
  pending row accepted. So any Auth call that **inserts** a user after a pending row exists for that email auto-accepts it.
- `generateLink({ type: "invite" })` on an existing unconfirmed user: no insert, `invited_at = now`, a new token, no email; the
  old token then fails with `otp_expired` (C1(b), (c)). On a new email it **inserts** and fires the trigger. On a confirmed
  user → `email_exists` 422. `getUserById(unknown id)` → `user_not_found` 404.
- One live invite token per user: a new token kills the old link.
- 5a's Send creates new invitees with `createUser` and the server-only marker `app_metadata.domus_manager_invite = true`;
  `generateLink` keeps it (5a §2.2 round 2). Only marked, unconfirmed users get manager rows from a Send (D7).
- Statuses: `pending | accepted | expired`; revoke writes `expired`. `invitations` and `property_managers` are written only by
  the service role.

### 2.2 5a pieces this sprint uses (as committed in 5a)
`lib/manager-invite.ts`: `ManagerInviteRow`, `managerInviteRedirect()`, `managerInviteMetadata(fullName)`,
`isAuthUserConfirmed(user)`, `isUserNotFoundError(error)`, `logManagerInvite(tag, error)`, `grantInvitedRows(invitationIds,
profileId)` → `{ error, rows: { property_id, granted }[] }` (wraps `manager_invite_grant`), and `deliverManagerInvite({ email,
fullName, inviterId, homeNames, authEmail })` → `"email_branded" | "email_basic" | "already_joined" | "not_sent"`. It refuses
with `not_sent` when `authEmail` differs from `email`; its branded path mints a link with `generateLink`, which never inserts
for an existing user. `markManagerInvitationsAccepted(profileId)` (`lib/invitations.ts`) updates only `pending` rows. Do not
change their behavior. 5a's Send grants through `manager_invite_grant`, so it skips rows revoked meanwhile.

SQL functions (5a §6.12; Claude's migration; `service_role` only; call with `createAdminClient().rpc(name, args)`):
- `manager_invite_grant({ p_invitation_ids, p_profile_id })` → rows `{ property_id, granted }`. One transaction under row
  locks: `pending` rows get an active grant (`granted: true`); other rows `granted: false`, no write; a guard error rolls back
  all.
- `manager_invite_revoke({ p_invitation_id, p_inviter_id })` → one row `{ outcome, profile_id, released, other_live }`. Locks
  the row (id, `invited_by`, role manager). `not_found`; `already_revoked` (`expired`); `accepted`; or `revoked`: status
  `expired`, `accepted_at` null (`invited_profile_id` kept), and, when no other `pending`/`accepted` manager row for that email
  and home exists, the grant set inactive (`released` = a grant row was found). One transaction: an error leaves the row
  pending with its grant.

### 2.3 Today's code
Line counts (`apps/web/`): `app/actions/tenant-invitations.ts` 379, `join-invite.ts` 66; `lib/invite-resend.ts` 107. Tests:
`app/actions/__tests__/tenant-invitations.test.ts` 188, `join-invite.test.ts` 115.
- `resendInvite` (`tenant-invitations.ts:276-328`): select by id and `invited_by` (:294-301), accepted refused (:307-309),
  `resendInvitationEmail` (:311), bump error only logged (:316-323), `"Invitation resent."` (:327). Manager rows reach plain
  `inviteUserByEmail` (`invite-resend.ts:90-104`), which fails with `email_exists` once the person signed in.
- `revokeInvite` (:330-379): select :348, accepted refused :357-359, `deleteGeneratedInviteUser` :361, `expired` :363-374,
  `"Invitation revoked."` :378; it never touches `property_managers`.
- `resendFromJoinLink` (`join-invite.ts:15-66`) is **unauthenticated** (bearer by invite UUID): limits :21-34, double load
  :36-47, send :49-55, bump :57-64, success :65. `INACTIVE_INVITE_MESSAGE` is `lib/join-invite.ts:1`.
- `canUserAdministerProperty` (`lib/property-access.ts:321-324`) and `getClientStateForProperty`
  (`lib/client-accounts.ts:27-32`, throws on error).
- `InvitationRow` (`components/dashboard/invitations-section.tsx:185`) shows Resend/Revoke only while `pending`, so an
  `expired` row has no buttons. (5c turns row-action errors into toasts.)
- The only `property_managers` writers in `app/actions` are `invitations.ts` and `account-wipe.ts`; there is no
  remove-manager action.

### 2.4 Live RLS gap (Claude, 2026-10-17; fixed by Claude, C2)
Policy "Property owners can view charge edits" on `charge_edit_history` reads `property_managers` with no `pm.active` check.
Every other policy and definer reads `pm.active = true`. This sprint is the first producer of inactive grants (live count of
`active = false` is 0), so Claude ships the policy fix with this release. Codex does nothing here.

## 3. In scope
- `resendManagerInvite` and `revokeManagerInvite` (`lib/manager-invite-rows.ts`). Manager branches in `resendInvite`,
  `revokeInvite` and `resendFromJoinLink`. The manager guard in `resendInvitationEmail`.
- Tests B1-B20 in two new files plus edits to `tenant-invitations.test.ts` and `join-invite.test.ts`.

## 4. Out of scope
- 5a's Send flow and helpers (no behavior change). The form, entry points, badge and toasts (5c).
- Any SQL, DDL, trigger, policy or grant change (Claude owns C2's policy fix).
- `inviteTenant`, tenant and owner resend/revoke behavior, including their `deleteUser` fallbacks (pinned, L-014).
- Removing a signed-in manager from a home. One Revoke for all rows of one send. Join page copy.

## 5. Exact files expected to change
Codex:
1. `apps/web/lib/manager-invite-rows.ts` (new, `server-only`: `resendManagerInvite`, `revokeManagerInvite`)
2. `apps/web/lib/invite-resend.ts` (manager guard only)
3. `apps/web/app/actions/tenant-invitations.ts` (manager branches in `resendInvite` and `revokeInvite`; wider revoke select;
   `inviteTenant` :30-274 byte-identical)
4. `apps/web/app/actions/join-invite.ts` (manager branch only)
5. Tests (each new file ≤ 500 lines):
   - `apps/web/app/actions/__tests__/manager-invite-revoke.test.ts` (new, B1-B10)
   - `apps/web/app/actions/__tests__/manager-invite-resend.test.ts` (new, B11-B16)
   - `apps/web/app/actions/__tests__/fake-invite-db.ts`, `fake-gotrue.ts` (5a files; extend only if a test needs it; keep
     every 5a test green; each stays ≤ 500 lines)
   - `apps/web/app/actions/__tests__/tenant-invitations.test.ts` (edit, B17-B18), `join-invite.test.ts` (edit, B19)

Claude (not Codex): `supabase/migrations/20261028_sprint237c5_charge_edit_history_active.sql` and
`supabase/rollback/20261028_sprint237c5_charge_edit_history_active_rollback.sql` (C2).

## 6. Implementation requirements

### 6.6 Resend and join-page resend (`lib/manager-invite-rows.ts`, `import "server-only"`)
`resendManagerInvite(row: ManagerInviteRow, o: { inviterId: string; grant: boolean })` → `{ ok: true; invitedProfileId: string }
| { ok: false; reason: ResendManagerReason }`, reason one of `not_pending`, `already_joined`, `login_gone`, `lookup_failed`,
`no_access`, `client_home`, `grant_failed`, `send_failed`. All reads and writes use `createAdminClient()`.
1. `row.status !== "pending"` → `not_pending`.
2. `profileId = row.invited_profile_id ??` `profiles.select("id, role").eq("email", row.email).maybeSingle()`. Error, none, or
   not manager → `lookup_failed`.
3. `getUserById(profileId)`. `user_not_found` or none → `login_gone`. Other error → `lookup_failed`. Confirmed → `update({
   status: "accepted", accepted_at: user.last_sign_in_at ?? user.email_confirmed_at ?? now, invited_profile_id: profileId })
   .eq("id", row.id).eq("status", "pending")`. Error → `lookup_failed`; else `already_joined`.
4. `properties.select("id, name").eq("id", row.property_id).maybeSingle()`. Error or none → `lookup_failed`.
5. `canUserAdministerProperty(inviterId, row.property_id)` false → `no_access`.
6. `getClientStateForProperty(row.property_id)`: a throw → `lookup_failed`; `managedClient` → `client_home`.
7. Access:
   - `grant: true` (owner Resend): `grantInvitedRows([row.id], profileId)`. Error → `grant_failed`. The row returned `granted:
     false` (revoked in another tab) → `not_pending`. No re-read and no release: the function skips a revoked row.
   - `grant: false` (join page, D8): `property_managers.select("active").eq("property_id", row.property_id)
     .eq("manager_profile_id", profileId).maybeSingle()`. Error → `lookup_failed`; none or inactive → `no_access`. It never
     writes `property_managers`.
8. `deliverManagerInvite({ email: row.email, fullName: row.full_name, inviterId, homeNames: [home.name], authEmail: user.email
   })` (step 3's user). Sent → `{ ok: true, invitedProfileId: profileId }`. `already_joined` → mark the row as in step 3,
   `already_joined`. `not_sent` → `send_failed`.

Owner Resend (`resendInvite`): after :307-309, `if (invitation.role === "manager")` → `resendManagerInvite(invitation, {
inviterId: user.id, grant: true })`:
- `not_pending` → `"This invite was revoked. Send a new invite."`; `already_joined` → `"They already signed in. No email was
  sent."`; `login_gone` → `"This person's login is gone. Revoke this invite."`; `no_access` → `"You no longer manage this
  home."`; `client_home` → `"This home's managers are set by its client account."`; `lookup_failed`, `grant_failed`,
  `send_failed` → `"Failed to resend invitation."` (HEAD :313).
- `ok` → `update({ created_at: now, invited_profile_id }).eq("id", invitationId).eq("status", "pending")`. Error → `"Email
  sent. The list did not update. Refresh the page."` Else `{ success: true, message: "Invitation resent." }` (HEAD :327).
- Revalidate both paths (`/owner`, `/manager`) on `ok` and `already_joined`. All other cases return `{ success: false, error }`.
- Tenant and owner rows keep :311-327 exactly, including the log-only bump error (L-014).

Join-page resend (`resendFromJoinLink`): at :49-55, when `fresh.role === "manager"` → `resendManagerInvite(fresh, { inviterId:
fresh.invited_by, grant: false })`:
- `already_joined` → `"This invite was already used. Sign in instead."`
- `not_pending`, `login_gone`, `no_access`, `client_home` → `INACTIVE_INVITE_MESSAGE`.
- `lookup_failed`, `grant_failed`, `send_failed` → `"Could not send. Please try again."` (:55)
- Success keeps the bump and message (:57-65); the manager bump adds `.eq("status", "pending")`. Tenant rows keep
  `resendInvitationEmail` and their bump.

Guard in `lib/invite-resend.ts`: the first statement inside `resendInvitationEmail` (insert above :24) is `if
(invitation.role === "manager") return { ok: false } as const;`. The tenant and owner branches do not change.

### 6.7 Revoke (`revokeManagerInvite({ row, userId })` in `lib/manager-invite-rows.ts`, returns `ActionState`)
In `revokeInvite`, widen the select at :348 to `"id, status, role, email, full_name, property_id, invited_profile_id"`. After
:357-359 and **before** :361: `if (invitation.role === "manager") return revokeManagerInvite({ row: invitation, userId:
user.id })`. Tenant and owner rows keep :361-378 exactly.
1. `status === "expired"` → `"This invite was already revoked."` No writes.
2. `getClientStateForProperty`: a throw → `"Failed to revoke invitation."`; `managedClient` → `"This home's managers are set by
   its client account."` No `canUserAdministerProperty` check (D6).
3. `profileId = row.invited_profile_id ??` profile by email (`maybeSingle`). Error → `"Failed to revoke invitation."` None, or
   not manager → `profileId = null` (no access to remove).
4. If `profileId`: `getUserById`. `user_not_found` or none → `loginGone = true` (keep `profileId`; its grant can still go).
   Other error → `"Failed to revoke invitation."` Confirmed → mark the row accepted (§6.6 step 3; error → `"Failed to revoke
   invitation."`), revalidate, `"They already signed in. This invite can't be revoked."` Else `unconfirmed = true`.
5. `createAdminClient().rpc("manager_invite_revoke", { p_invitation_id: row.id, p_inviter_id: userId })`, whether or not
   `profileId` is set. Error or no row → log `revoke_failed`, `"Failed to revoke invitation."` The row stays pending with its
   grant, Revoke still shows, and a retry converges. By `outcome`:
   - `not_found` → `"Failed to revoke invitation."`
   - `already_revoked` → `"This invite was already revoked."`
   - `accepted` (signed in meanwhile) → no writes, revalidate, step 4's signed-in copy.
   - `revoked` → keep `released` and `other_live`; steps 8-10.
6. (Removed in rev 4: the function expires the row and removes access in one transaction.)
7. (Removed in rev 4: the row lock serializes Revoke with a sign-in, Resend or Send. Their grants skip an expired row, and
   `markManagerInvitationsAccepted` updates only `pending` rows, so a sign-in that lands after the function leaves the row
   `expired` and the grant off: Revoke wins.)
8. Link reset (D6), only after `revoked`, only if `unconfirmed`, and only when step 4's user has `email?.toLowerCase() ===
   row.email` (otherwise log `link_reset_failed` and skip): `invitations.select("id").eq("role", "manager").eq("email",
   row.email).eq("status", "pending").neq("id", row.id).limit(1)`. None and no error → `generateLink({ type: "invite", email:
   row.email, options: { data: managerInviteMetadata(row.full_name), redirectTo: managerInviteRedirect() } })`: no insert, no
   email, the old link dies. Any error → log `link_reset_failed`; the result does not change. **Never** when `profileId` is
   null or `loginGone`: it would insert `auth.users` and fire the trigger.
9. ```ts
   void logAudit({ userId, action: "revoke_manager_invite", entityType: "invitation", entityId: row.id,
     metadata: { propertyId: row.property_id, managerProfileId: profileId, accessRemoved: released, linkReset } })
     .catch(sideEffectError("revokeInvite", "log_audit", { userId, entityType: "invitation", entityId: row.id }));
   ```
10. Revalidate both paths. `{ success: true, message: "Invitation revoked." }`, or `"Invitation revoked. Another invite still
    gives them this home."` when `other_live`. Every other return is `{ success: false, error }`.

Undo (L-016). A Send writes: (1) for a new invitee, an Auth user and its `profiles` row (role manager); (2) one pending row per
home; (3) one active grant per home; (4) a live link. Revoke undoes one home: its row and its grant, in one transaction (step 5). It kills
the link (step 8) only when no other pending manager row remains for the email, so an N-home Send needs N Revokes and the link
works until the last. (1) is never undone (D4): the email stays a manager profile, so later tenant or owner invites to it are
refused with today's copy (`tenant-invitations.ts:157`, `invitations.ts:239-244`), as at HEAD. Re-invite ("do again") re-opens
the same row id, re-grants and sends a new link. (5) A Send to a signed-in manager (5a §6.3) only adds grants, with no row and
no email. Nothing in the app can undo it: Revoke needs a row, and no remove-manager action exists. With many homes this is N
homes in one click. Removing a signed-in manager is a C6 follow-up (5c).

### 6.11 Logging, errors, safety
- Every Supabase call's `{ error }` is read (L-002). No path returns success for work it did not do.
- Log with 5a's `logManagerInvite` (`[manager-invite]`, `{ code, message }` only). New tag: `link_reset_failed`. Also used:
  `revoke_failed`. Never log an email, a name, a link, a token or FormData.
- L-028: add no client `try/catch` around `resendInvite` or `revokeInvite`. A new `catch` in `app/actions/*.ts` starts with
  `unstable_rethrow(error)`. No new `catch` wraps `requireAuth`.
- `"use server"` files export only async functions; helpers go in `lib/`. Do not edit `app/actions/shared.ts`.
- No new or changed code calls `fetch`. No `deleteUser` or `deleteGeneratedInviteUser` in any manager path (D4).
- Plain language: 6th grade, ≤ 12 words per sentence, no banned words (`lib/plain-language/scan.ts`).
- Size (L-015): new files ≤ 500 lines; an edited file under 500 stays under 500. Added or changed lines ≤ 140 characters. Do
  not reformat untouched lines. No compaction.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user
  needs to think about what to do, the UI needs to be clearer.

## 7. Validation commands
From the repo root, in order. Every file in the `ls` must exist.
```
ls apps/web/app/actions/__tests__/{manager-invite-revoke.test.ts,manager-invite-resend.test.ts} apps/web/lib/manager-invite-rows.ts
(cd apps/web && npx vitest run app/actions/__tests__/manager-invite-revoke.test.ts \
  app/actions/__tests__/manager-invite-resend.test.ts app/actions/__tests__/tenant-invitations.test.ts \
  app/actions/__tests__/join-invite.test.ts)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
```
Do NOT run `npm run gate:web`. Do not apply or write SQL. Claude runs the live checks, gates, deploys and walks.

## 8. Acceptance criteria
Test rules: as 5a §8 (real actions and helpers; no `expect` in a mock; `@example.com`; `NEXT_PUBLIC_APP_URL` =
`https://app.example.com`; `crypto.randomUUID()` ids; `RESEND_*` stubbed; fake `Date` timers; seeds only through the fakes'
builder or Auth API). The two new files mock **only** `@/app/actions/auth-helpers`, `@/lib/supabase/admin` (the 5a fake world),
`@/lib/audit`, `next/cache`, `next/headers`, `server-only` and global `fetch`; everything else is real, including
`manager-invite`, `manager-invite-rows`, `invite-resend`, `tenant-invitations` and `join-invite`. The only seed is the live
legacy shape (B4). Op names and hooks are 5a's: `db:<table>:<op>`, `auth.<method>`, `auth.insert|rotate|email`,
`beforeOp`/`afterOp`/`failNext`/`failAuth`, and the helpers `clickLink`, `dropAuthUser`, `setAuthEmail`, `selfSignUp`.

**`manager-invite-revoke.test.ts`:**
- B1 "do → undo → do again (L-016)". Invite one home; Revoke: grant inactive, row `expired`, no `deleteUser`, old token fails
  `clickLink`. Re-invite: same row id `pending`, new `created_at`, `invited_profile_id` set, grant active, 1 new email.
  `clickLink(new)` + `markManagerInvitationsAccepted` → `accepted`.
- B2 "one inviter, two homes". Revoke h1 → h1 grant inactive, h1 `expired`; h2 `pending`, grant active; no `auth.rotate` (the
  link still works). Revoke h2 → `auth.rotate`; the old token fails `clickLink`.
- B3 "re-add after revoke". Invite, Revoke, the person signs in through another inviter's link, re-add from the form: the same
  row id reads `accepted`.
- B4 "live legacy row heals" (seeded: user created first, confirmed, grant active, `invited_profile_id` null), no email in any
  case: (b) Resend → `"They already signed in. No email was sent."`, accepted; (c) Revoke → `"They already signed in. This
  invite can't be revoked."`, grant active; (d) join-page resend → `"This invite was already used. Sign in instead."`
- B5 "two inviters, one person". Both rows pending; one sign-in accepts both. Revoke by A while B's row is live keeps the
  grant: `"Invitation revoked. Another invite still gives them this home."`; no link reset.
- B6 "revoke after the invitee signed in". `clickLink` only (row still pending). Revoke → `"They already signed in. This
  invite can't be revoked."`; row `accepted`; grant active.
- B7 "revoke vs sign-in". (a) `beforeOp("rpc:manager_invite_revoke", …)` runs `clickLink` and
  `markManagerInvitationsAccepted`: the function returns `accepted`; B6's copy; row `accepted`; grant active. (b)
  `afterOp("rpc:manager_invite_revoke", …)` runs the same: Revoke wins; `"Invitation revoked."`; row `expired`; grant
  inactive; `markManagerInvitationsAccepted` changed 0 rows.
- B8 races:
  - (a) "revoke during Resend". `beforeOp("rpc:manager_invite_grant", …)` during Resend runs a full Revoke: the grant returns
    `granted: false`; Resend returns `"This invite was revoked. Send a new invite."`; row `expired`; grant inactive; 0 emails.
  - (b) "resend during Revoke". `afterOp("rpc:manager_invite_revoke", …)` during Revoke runs a full Resend: Resend returns
    `"This invite was revoked. Send a new invite."`; row `expired`; grant inactive; 0 emails. Variant with `beforeOp`: the
    Resend email goes out first, then Revoke expires the row, removes the grant and resets the link; the emailed token fails
    `clickLink`.
  - (c) "revoke during Send". New invitee, one home, mode off. `beforeOp("rpc:manager_invite_grant", …)` during
    `inviteManager` runs a full `revokeInvite` of that row. Send returns `"This invite was revoked. Send a new invite."`; row
    `expired`; no active `property_managers` row for that home and person; 0 `auth.email`; 0 `fetch`.
- B9 "revoke when the login is gone". (a) Invite, then `dropAuthUser(P)`. Revoke → `"Invitation revoked."`; row `expired`;
  grant inactive; no `generateLink`; no `auth.insert`. (b) Invite, then `dropAuthUser(P)`. Resend → `"This person's login is
  gone. Revoke this invite."`; 0 Auth writes. (c) Invite, then `setAuthEmail(P, "other@example.com")`. Revoke →
  `"Invitation revoked."`; no `auth.generateLink`; no `auth.insert`.
- B10 "an inviter who lost the home can still revoke". A manager invites a co-manager, then loses the home (fixture update).
  Revoke → `"Invitation revoked."`; the co-manager's grant is inactive.

**`manager-invite-resend.test.ts`:**
- B11 "resend of a revoked row does not re-grant": `"This invite was revoked. Send a new invite."`; grant stays inactive.
- B12 "join-page resend never grants or sends without access". (a) Send with `failNext("rpc", "manager_invite_grant")` →
  `"Could not add access. Press Send again."`; join resend → `INACTIVE_INVITE_MESSAGE`, 0 Auth calls, 0 emails, 0
  `property_managers` writes. (b) Revoke converges (R4): `failNext("rpc", "manager_invite_revoke")` → `"Failed to revoke
  invitation."`; row `pending`; grant active. Revoke again → `"Invitation revoked."`; row `expired`; grant inactive; join
  resend → `INACTIVE_INVITE_MESSAGE`, 0 Auth calls. (c) Active grant: allowlisted → branded, unlisted → generic; 0
  `property_managers` writes.
- B13 "join-page resend, already signed in" → row accepted; nothing sent.
- B14 "manager rows never reach the plain resend": `resendInvitationEmail(managerRow)` → `{ ok: false }`, zero Auth calls.
- B15 "logs carry no email, link or token". Re-create the failure states of 5a A7, A8, A9 and of B12 and B9 with a
  `console.error` spy. No argument contains the email, `fake-link:` or `tok:`.
- B16 "Resend after a failed Send". (a) As 5a A7 (both sends fail): `resendInvite` sends 1 email. (b) As 5a A9 (grant
  fails): Resend → the grant is active before `auth.email`.

**Pins and unit tests:**
- B17 `tenant-invitations.test.ts`, tenant pins: :71-98, :111-131, :133-176 unchanged; the `it.each` at :100 keeps `owner` and
  its `manager` case asserts routing to `resendManagerInvite`; :177 uses an `owner` row; a tenant bump error is only logged
  (`"Invitation resent."`); tenant revoke still calls `deleteGeneratedInviteUser`.
- B18 `tenant-invitations.test.ts`, manager branches (`@/lib/manager-invite-rows` mocked): each `reason` (including
  `login_gone`) → exact §6.6 copy; the manager bump has `.eq("status", "pending")` and its error is returned; `revokeInvite`
  passes the widened row and never calls `deleteGeneratedInviteUser`.
- B19 `join-invite.test.ts` (mock `@/lib/manager-invite-rows`): existing cases green; manager row →
  `resendManagerInvite(fresh, { inviterId: fresh.invited_by, grant: false })`; each reason (including `login_gone`) → its §6.6
  join copy; tenant rows still use `resendInvitationEmail` and their unfiltered bump.
- B20 Full suite (every 5a test still green), `tsc`, lint and `lib/__tests__/plain-language.test.ts` are green.

**Mutation proofs (in the report; revert each):** M2 pass `grant: true` from the join page → B12. M5a call
`deleteGeneratedInviteUser(profileId)` in `revokeManagerInvite` → B1; M5b in `revokeInvite`'s manager branch → B18. M7 drop
`.eq("status", "pending")` from `markManagerInvitationsAccepted` → B7(b) (the expired row turns `accepted`; the function keeps
`invited_profile_id`, so that filter is what stops it). M8 make 5a §6.2 step 11 a plain `property_managers` upsert that
ignores row status → B8(c). M10 make Resend upsert `property_managers` directly instead of `grantInvitedRows` → B8(a). M7 and
M8 temporarily edit 5a files (`lib/invitations.ts`, `app/actions/invitations.ts`); revert them; the final diff must not
touch them.

**Claude only (not Codex):**
- C2 Before ship. md5 of `handle_new_user` still `2c51636368d7ef759fd151508e904240` (L-012). Rolled-back proof (an email with
  no user and no profile, a non-client smoke home, `invited_by` = the smoke owner): BEGIN; pending manager row, then an
  `auth.users` insert with manager metadata → row accepted, grant active; a second new email inserted into `auth.users`
  first, then its pending row → row pending, no `property_managers` row; ROLLBACK. Attacker SQL as `authenticated`: INSERT and
  UPDATE on `invitations` and `property_managers` are denied (L-021). As `authenticated` and `anon`,
  `has_function_privilege(…, 'EXECUTE')` is false for `manager_invite_grant` and `manager_invite_revoke`; the rolled-back
  `supabase/tests/sprint237c5_manager_invite_functions.sql` (5a C7) covers every branch of both functions plus the
  client-home guard rollback. Revoke leaves `property_managers.active = false` and
  keeps the Auth user (D4). A revoked invitee can still get a session (Forgot password, or Create account re-sends a confirm
  link). As `authenticated` with that user's JWT (rolled back), SELECT every table whose policy or definer function reads
  `property_managers` for that home; each returns 0 rows. Live 2026-10-17, `charge_edit_history` policy "Property owners can
  view charge edits" has no `pm.active` check. Claude ships
  `supabase/migrations/20261028_sprint237c5_charge_edit_history_active.sql`: the same policy plus `and pm.active = true`,
  diffed against the live text (L-012). Ship it with
  `supabase/rollback/20261028_sprint237c5_charge_edit_history_active_rollback.sql` before this sprint deploys.
- C5 `/ship` monitor: expired manager rows whose email still has an active grant on that home with no other live row;
  accepted manager rows with no active grant on that home. With §6.12 neither state is expected, so a hit is a bug to fix in
  code. Also run C5 after any `[manager-invite] revoke_failed` log line in Vercel.
- Before 5c dispatch, Claude reviews this sprint and commits it locally on top of 5a; it is not deployed.

## 9. Report format
Compact status only: files changed with line counts, the test for each criterion (B1-B20), `grep -c "it("` per new test
file, mutation results (M2, M5a, M5b, M7, M8, M10), command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies. No SQL from Codex.
- `inviteTenant` stays byte-identical. Tenant and owner resend and revoke keep their behavior; they see only the wider revoke
  select. 5a's files do not change (except M7's and M8's reverted mutations).
- Never call an Auth API that inserts `auth.users` after writing a pending row for that email (L-029). §6.7 step 8 never runs
  when `profileId` is null, `loginGone`, or the Auth email differs.
- No `deleteUser` or `deleteGeneratedInviteUser` in any manager path. No `fetch` outside 5a's `sendInviteEmail`.
- Manager grants from rows go only through `grantInvitedRows`; manager revokes only through `manager_invite_revoke` (D10).
- Exact copy only. Invent no strings, URLs or emails. Fixtures use `@example.com`.
- Size, line-length and catch rules as §6.11.
- If anything in the live schema or GoTrue behavior blocks you, stop and report. Do not work around it.
