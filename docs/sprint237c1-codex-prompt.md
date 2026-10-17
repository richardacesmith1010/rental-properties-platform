# Sprint 237c-1 — Manager invites and clients: branded invite email (allowlist-only), all-homes invite, Domus owners in Clients (L3: auth/email/access) — rev 4 (rev 1 REJECT → rev 2 APPROVE WITH CHANGES: REQUIRED adopted → rev 3 Codex stop: unique key → rev 4 schema fixed by Claude; ChatGPT APPROVE WITH CHANGES adopted)

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

## Rev 3 additions (ChatGPT rev 2 APPROVE WITH CHANGES)
1. **Auth succeeded, email failed:** `generateLink` (and `inviteUserByEmail`) create the Auth user, which fires
   `handle_new_user` and may convert the pending invitations at once. A retry must therefore detect the existing,
   never-signed-in Auth user for that email and only **generate a fresh link and resend** (no new invitation rows, no
   second Auth user); if the user has already signed in, return `This manager already has an account. They'll see the
   homes next time they sign in.` Test: email failure → retry → exactly one Auth user, rows unchanged, one email sent.
2. **Account scoping:** every selected home must belong to the **active** ownership account the owner is acting in (not
   just any home they administer); mixed accounts → reject, zero writes.
3. **Existing manager:** activate or insert `property_managers` per home idempotently (no duplicates; re-activating an
   inactive row is allowed; homes already active are a no-op) in one multi-row write.
4. **handle_new_user:** read the live definition first and describe in the report exactly how pending manager invitations
   are matched, validated, consumed and converted. If any invariant (only pending, same email, owner-authorized home)
   does not hold, stop and report — Claude handles database work.
   **Claude's ruling (2026-10-16, after Codex's first stop):** the live trigger converts pending invitations by email and
   status and does not re-check the inviter. The "owner-authorized home" invariant is enforced **at write time**: verified
   live, `anon`/`authenticated` have no INSERT/UPDATE (table or column) on `public.invitations` and no client-callable
   function inserts into it, so only service-role server actions create rows, and `inviteManager` re-authorizes every home
   (§6.3d) **before** the insert. Proceed; keep that ordering and add a test that an unauthorized home never reaches the
   insert. No trigger change in this sprint.
5. **Statements at the data layer:** the owner-statement loaders, aggregates, PDF and CSV builders take the
   manager-authorized property id list and filter every query by it (no post-filtering after fetching wider data); every
   caller passes the list computed at request time from active `property_managers` rows.
6. **Fail closed:** any error or unknown mode in the branded-email gate → generic behavior (never branded to a
   non-allowlisted address). Check `lib/invite-resend.ts` and every other manager-invite/resend path: none may send the
   branded email without the same gate.
7. **Extra tests:** concurrent double submission (one set of rows, one Auth user), mixed existing/new assignments,
   cross-account home ids, gate error → generic, resend path gated, statement loader never queries unauthorized ids.

## Rev 4 addition (Codex's second stop: the invitations unique key)
Codex correctly stopped: the live key `UNIQUE (email, role, invited_by)` allowed one invitation per inviter, email and
role, so one row per home was impossible. **Claude replaced it before this dispatch** (migration
`supabase/migrations/20261026_sprint237c1_invitations_per_home_key.sql`, applied live): the key is now
`invitations_email_role_invited_by_property_key UNIQUE NULLS NOT DISTINCT (email, role, invited_by, property_id)`.
Owner invitations (`property_id` null) stay unique per inviter. Clients still have no write grant on `invitations`.
- **New-user write (replaces "insert" in §6.3f):** one multi-row `upsert` with
  `onConflict: "email,role,invited_by,property_id"` that sets `status: "pending"`, `full_name`, `accepted_at: null`,
  `invited_profile_id: null` and `created_at` = now (a re-opened invite is a new issuance; resend/expiry logic reads
  `created_at`). This re-opens an expired row for the same inviter, email and home and never makes a duplicate. Only use
  it when no profile exists for the email (that path is already "new user").
- **Deduplicate before the write:** the payload must never hold the same home twice (Postgres rejects a multi-row upsert
  that hits one key twice — Claude verified `cardinality_violation` live). Dedupe `propertyIds` right after validation.
- Tests: (1) re-invite after a revoked (expired) invite for the same home → one row, `pending`, fresh `created_at`;
  (2) duplicate home ids in the request → one row per home, one write; (3) `Foo@Example.com ` and `foo@example.com`
  produce the same stored email; (4) two different authorized inviters (owner and co-owner of the account) may each
  invite the same email to the same home (allowed by design; the key includes `invited_by`).
- Claude verified live (rolled back): two homes for one email insert fine; same-home reinvite updates one row; an owner
  invite with no home stays unique per inviter; sign-up converts both homes to active `property_managers` and marks both
  invitations accepted; `authenticated` cannot insert, update or upsert `invitations`.
- Do not write SQL. If anything else in the schema blocks you, stop and report again.

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

## Round 2 (Claude review 2026-10-16 ~23:30: 21-agent review `wf_5e10752c-84e`, every finding verified against the diff)
Round 1 is in the working tree. Keep what works; fix all of the below. Same files as §5 plus the files named here.
Claude decisions (recorded in the handoff): **managers keep inviting co-managers** (L-014: today's behavior); **managed-client
(client account) statements behave exactly as before**.

**Blockers**
1. **Empty or oversized home lists.** `inviteManagerSchema` (`lib/validations-entity.ts`) must always parse `propertyIds` with
   one `z.preprocess(parseJsonArray, z.array(z.string().uuid()).min(1).max(100))`; reject a request that sends both
   `propertyId` and `propertyIds`, or neither; no second `JSON.parse` in the action. After dedupe, an empty list returns
   `Pick at least one home.` with zero writes and zero Auth calls.
2. **Authorization in one query.** Load `const allowed = new Set(await getAdministeredPropertyIds(user.id))`
   (`lib/property-access.ts:192`) once; reject unless every id is in it (`You can only add a manager to your own homes.`).
   Owners also keep the active-account check (`owner_account_id === accountId`). **Managers** (role `manager`) are authorized
   by the same `allowed` set only and skip the ownership-account check, as before 237c-1.
3. **Real tests, not tautologies (L-017).** In `app/actions/__tests__/invitations.test.ts`:
   - dedupe: assert the upsert payload's `property_id`s equal `["h1","h2"]` for input `[h1,h1,h2]`, and make the mock
     throw like Postgres (`cardinality_violation`) if one payload hits the same key twice;
   - new user: assert the invitations upsert payload `expect.objectContaining({ email, role: "manager", property_id,
     invited_by, status: "pending", accepted_at: null, invited_profile_id: null, created_at: expect.any(String) })` and
     options `{ onConflict: "email,role,invited_by,property_id" }`;
   - generic path: `inviteUserByEmail` called with `("manager@example.com", { redirectTo: expect.stringMatching(/\/auth\/callback$/),
     data: { role: "manager", full_name: "Alex Manager" } })`; branded path: `generateLink` with `type: "invite"` and the same
     redirect; non-allowlisted → zero `generateLink`, zero branded sends;
   - existing manager: zero `generateLink`, zero `inviteUserByEmail`, zero sends; one case with `h1` inactive → one upsert
     with all selected homes active.
4. **Restore deleted pins (AC4).** Re-add, against the new mocks: the `inviteOwner` claimed-client refusal (HEAD `:71-84`);
   the unclaimed-owner assertions (`ownershipAccess` not called; no upsert); rate-limited → no `from`, no upsert, no Auth
   call; `requireAuth` rejects → no rate-limit call, no `from`; the client-home refusal with the exact copy `This home's
   managers are set by its client account.`. Do not change `inviteOwner`.

**Should-fix**
5. **Messages from `delivery`** (not from `last_sign_in_at` alone): `added` → `Added {name} to {this home | N homes}. They'll
   see it next time they sign in.`; `already` → `{name} already has access to {this home | these homes}. No email was
   sent.`; new user → `Invite sent to {email}. They'll get an email from Domus.` (keep today's text if it differs; pin it);
   the Rev 3 signed-in retry copy only for that case. Assert exact `message` in each test; update the M2 dialog test
   (`components/__tests__/invite-manager-form.test.tsx`) only where the action's strings changed by design.
6. **Audit.** `logAudit({ action: "invite_manager", … })` after the property_managers upsert (with `propertyIds`,
   `managerProfileId`) and right after the invitations upsert succeeds, before the Auth call (so pending grants are recorded
   even if delivery fails). Assert both.
7. **Domus owners are not clients for the Add-a-home picker.** Add `kind: "client" | "domusOwner"` to the overview/detail
   types (`lib/client-overview.ts`, `lib/client-accounts.ts`). Filter `domusOwner` out of the list passed to
   `components/dashboard/clients/whose-home-step.tsx` (via `unified-property-wizard.tsx` / `forms/property-form.tsx`); in the
   client detail view hide "Add a home" and the paid-outside-Domus note for `domusOwner`. Test: a Domus owner is not offered
   in WhoseHomeStep; the client detail for a Domus owner shows no Add-a-home.
8. **Managed-client statements unchanged.** Apply the new `managedIds` gates only to non-`managed_client` accounts; for
   `managed_client` keep the old authorization and let a zero-home client produce an empty statement. Restore the original
   `properties: []` fixture in `lib/__tests__/owner-statement-download.test.ts` ("200 for a valid client") and add a test
   that the client check runs before any data read.

Validation as §7. Report each item 1–8 with the test that proves it.

## Round 3 (PROPOSED — waits for the owner's yes; CLAUDE.md §2a: FAIL after 2 attempts) — Claude review 2026-10-17 ~09:20
Round 2 state: isolated gate green (319 files / 2,696 tests, build). Fix verification PASS_WITH_RISK (all 8 Round 2 items
fixed or partial, no blocker). Security: no blocker, 4 should-fix. **Tests-are-real FAIL (L-017)**: mutation proves the
decision "managed-client statements behave exactly as before" has no test that fails when it breaks. The code itself is
correct for the form contract (hidden `propertyIds` = JSON). Fix only the items below; keep everything else.

**Tests (all REQUIRED; prove each with the named mutation in the report):**
- T1 `owner-statement.test.ts`: for managed-client statements make `getManagedHomeIds` return `[]` (or throw) and assert it
  is never called and every client home still appears (mutation: filter client statements by managed homes).
- T2 `owner-statement-download.test.ts`: for a manager not linked to the client account, assert the only table read before
  the not-found result is `ownership_accounts` (mutation: read homes before rejecting).
- T3 `invite-manager-form.test.tsx`: the hidden `propertyIds` equals `JSON.stringify(selectedIds)` (both one home and "All
  my homes") and `ownershipAccountId` equals the active account (mutation: post a comma list).
- T4 statements: a manager with homes elsewhere asks for an unrelated Domus owner's statement → refused, no account name in
  the result (mutation: zero matching homes still returns a statement).
- T5 `client-accounts.test.ts` + `client-overview.test.ts`: a managed-client account reachable only through a
  `property_managers` row is NOT listed (mutation: drop the client-link requirement).
- T6 (low): singular "this home" messages; the email HTML contains the footer; the gate receives the normalized email.

**Code (REQUIRED):**
- C1 "All my homes" for managers: the manager's invite list (`render-section-cases.tsx:292` → `invite-manager-form.tsx`)
  leaves out client-account homes, which the server refuses (`invitations.ts:59-63`). Test it.
- C2 Never downgrade an accepted invitation: the pending-row write must not change an existing row's status (use
  `ignoreDuplicates: true` / ON CONFLICT DO NOTHING on `invitations_email_role_invited_by_property_key`). Test: an accepted
  row stays accepted after a second invite (closes the two-requests race).
- C3 Retry branch (`invitations.ts:97-116`): use it only when all selected homes already have a **pending** row and no
  profile exists. Apply `lib/invite-resend.ts`'s existing minimum-age rule and its exact "too soon" copy before re-sending;
  otherwise follow the normal path (existing profile → activate assignments + audit). Tests for each branch.
- C4 Bounded queries: page `getManagedHomeIds` (`client-accounts.ts:64-69`) and pass id lists through the existing `chunks()`
  helper in `owner-statement.ts:87-88`, `client-overview.ts:83`, `client-accounts.ts:84`; replace the per-account
  `getClientState` calls (`invitations.ts:59-60`) with one `.in()` read; add `.max(100)` to
  `ownerStatementRequestSchema.propertyIds`.
- C5 One answer for "no access": a manager with no homes for an account gets the same not-found response as an unknown
  account (no 403/404 difference). Keep HEAD's not-found copy.
**Not in round 3 (follow-up, needs design):** granting access to an existing but unconfirmed account (pre-existing, S4).
