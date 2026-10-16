# Sprint 237c-1 — Manager invites and clients: branded invite email (allowlist-only), all-homes invite, Domus owners in Clients (L3: auth/email/access) — rev 2 (rev 1 ChatGPT REJECT: REQUIRED adopted)

## 1. Objective
Fix the manager-walk findings M3, M1, M11 (`docs/manager-walk-plan-2026-10-16.md`):
1. **M3:** the manager invite email is Supabase's generic "You have been invited". Build a Domus-branded manager invite
   (inviter, home name(s), role, one button) — **owner decision 2026-10-16: build it, but send it only to allowlisted
   test accounts until launch**; everyone else keeps today's generic invite.
2. **M1:** "Add a manager" invites to one home per invite; add an "All my homes" choice.
3. **M11:** Owners who have their own Domus account and whose homes the manager runs are missing from Clients
   ("Owners whose homes you run"); list them too, with the same monthly owner statement as client owners.

## 2. Context
- HEAD after 238d packet. Manager invite action `apps/web/app/actions/invitations.ts:19` `inviteManager` (generic
  `inviteUserByEmail` at `:126`; existing-manager path `:110-120` adds `property_managers` without email). A second
  `inviteUserByEmail` at `:298` (check what it is) and `lib/invite-resend.ts:74,91` (resend path).
- Tenant invites already send a Domus email: `app/actions/tenant-invitation-support.ts:152` `generateLink` + Resend via
  `lib/invite-email.ts:7` `sendTenantInviteEmail`. Reuse this pattern; do not duplicate the HTML/transport (DRY).
- Notification switch: `lib/notifications-switch.ts:14-45` (`notificationMode()`, `notificationAllowlist()`,
  `isNotificationRecipientAllowed(mode, email, allowlist)`). Production mode is `test` with an allowlist.
- Invite form `components/dashboard/invitations/invite-manager-form.tsx` (steps Home → Email → Name → Send).
- `handle_new_user` (auth trigger) converts **pending invitations** into access at sign-up (Sprint 205a hardened it);
  any multi-home invite must create one pending `invitations` row per home with the same safeguards — read the current
  function before relying on it.
- Clients: `lib/client-overview.ts:74-83` and `lib/client-accounts.ts:64-84` keep only `managed_client` accounts linked
  via `ownership_account_managers`. Owner statement: `lib/owner-statement.ts`, `lib/owner-statement-csv.ts`,
  `ownerStatementRequestSchema` (`lib/validations.ts:60`) and its action (find it). Manager access to a home's data =
  `can_administer_property` (active `property_managers` row).

## 3. In scope
M3 (gated email), M1 (all homes), M11 (list + statement for Domus owners whose homes the manager actively runs), tests.

## 4. Out of scope
Turning notifications on; tenant invites; menu/Home redesign (237c-2); any SQL (Claude handles schema if needed — say so
in the report instead of writing SQL).

## 5. Exact files expected to change
1. `apps/web/app/actions/invitations.ts` (`inviteManager` only)
2. `apps/web/lib/invite-email.ts` (generalize to a role-aware invite email, or add `sendManagerInviteEmail` reusing the
   same transport/template helpers)
3. `apps/web/components/dashboard/invitations/invite-manager-form.tsx` (home step: list of homes + `All my homes`)
4. `apps/web/lib/validations.ts` (`inviteManagerSchema`: `propertyIds` array or `allHomes` flag)
5. `apps/web/lib/client-overview.ts`, `apps/web/lib/client-accounts.ts` (include Domus-owner accounts the manager runs)
6. the owner-statement action/loader file(s) (authorize statements for those homes)
7. Tests for each (name them in the report)

## 6. Implementation requirements
1. **M3 gate:** decide per recipient with the existing switch: if `notificationMode()` is `on`, or it is `test` and
   `isNotificationRecipientAllowed("test", email, notificationAllowlist())` → create the invite with `generateLink`
   (type `invite`, same redirect as today) and send the branded email; otherwise → keep exactly today's
   `inviteUserByEmail` behavior. Mode `off` → today's behavior. No other emails added.
2. **Branded email copy:** subject `{Inviter name} added you to Domus`; body `{Inviter name} wants you to manage
   {home name | N homes} on Domus.` and button `Set up your account`; footer `If you were not expecting this, you can
   ignore it.` Plain text alternative included.
3. **M1:** the Home step shows the owner's homes with checkboxes and an `All my homes` option (selects all homes the
   owner administers in the active account). Server order for one submission (rev 2, mandatory):
   (a) authenticate the inviter; (b) validate input and normalize the email (trim + lowercase) once — the same value is
   used for the gate, the invitation rows and Auth; (c) resolve the active ownership account; (d) re-authorize **every**
   selected home with `canUserAdministerProperty` (any failure → `You can only add a manager to your own homes.`, zero
   writes); (e) resolve home names for the email; (f) **existing manager:** insert/activate all `property_managers` rows in
   one multi-row write (no email) and stop; **new user:** insert **all** pending `invitations` rows in **one** multi-row
   insert (atomic) — only after it succeeds, (g) make exactly **one** Auth call (`generateLink` type `invite` if the gate
   allows the branded email, else today's `inviteUserByEmail`), then (h) send at most one branded email. Never call Auth
   before the invitation rows exist (the `handle_new_user` trigger converts pending invitations at sign-up).
   **Failure after (f):** if the Auth call or the email fails, leave the pending rows in place (safe: they grant nothing
   until that email signs up, and a retry re-uses them — make the insert idempotent per (email, property) for pending
   rows), return `We added the homes but could not send the invite. Try again.` and log it. Read `handle_new_user` (live
   definition) and confirm it converts **all** pending manager invitations for the email in one sign-up.
4. **M11:** Clients lists, after client accounts, the ownership accounts that own a home where this manager has an
   **active** `property_managers` row and that are **not** `managed_client`, labeled `Domus owner` with the account's
   display name and the count of homes **this manager** actively manages for it. The monthly owner statement (PDF/CSV)
   for those accounts covers **only** homes where the requesting manager has an active `property_managers` row —
   every requested property id is checked independently server-side (any unmanaged id → `You do not manage this home.`,
   nothing generated); a manager of home A can never get home B of the same owner.
5. Plain language (6th grade, ≤ 12 words per sentence), lines ≤ 140, files ≤ 500, every Supabase error checked. The user
   should never need to read instructions to complete this flow.

## 7. Validation commands
```
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web`. No SQL. Claude verifies live with walk accounts.

## 8. Acceptance criteria
1. M3: allowlisted email (also with different case/whitespace) in `test` mode → `generateLink` + branded email (exact
   subject/body) and **no** `inviteUserByEmail`; non-allowlisted in `test` → `inviteUserByEmail` exactly as before and no
   branded email; `off` → as before; `on` → branded for everyone.
2. M1: `All my homes` with 3 homes → existing manager: 3 `property_managers` rows, zero Auth calls, zero emails; new user:
   one multi-row insert of 3 pending invitations **called before** the single Auth call (assert call order), exactly one
   Auth call and at most one email; Auth failure after the insert → rows remain, exact retry copy, a retry makes no
   duplicate rows; a forged home id from another owner → whole request rejected, zero writes, zero Auth calls.
3. M11: a manager with an active assignment on a non-client owner's home sees that owner under Clients as `Domus owner`
   with the managed-home count; an inactive assignment → not listed; statement for a managed home → OK; a request mixing
   a managed home A and an unmanaged home B of the same owner → exact error, nothing generated.
4. Existing invite tests (owner path, already-has-access path, 237b M2 dialog) stay green.
5. Full suite + plain-language guard green.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include "Claude
prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No SQL. No email to non-allowlisted people beyond today's behavior.
