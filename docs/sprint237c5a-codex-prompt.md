# Sprint 237c-5a — Manager invite "Send" (L3) — rev 4 (rev 3 ChatGPT REJECT → rev 4)

Severity L3 (auth/invite, access grants, outbound email). `/chatgpt-review` before `/codex-dispatch`. Part 1 of 3; the index
is `docs/sprint237c5-index.md`. 5b (Resend, Revoke, join page) and 5c (UI) build on this commit. HEAD is `0e4a85c` (app code
unchanged since `240667d`, which production runs). History: 237c-1's invite half failed review three times and never shipped.
Root cause (L-029): it wrote pending rows before the Auth call, and the live trigger auto-accepted them.
Section numbers match rev 2, so cross-references stay stable: §6.6 and §6.7 are in 5b, §6.10 is in 5c.

## 1. Objective
Owners, and managers inviting co-managers, can add a manager to one home or to many homes in one send (M1). Allowlisted test
accounts get a Domus-branded invite email. Everyone else gets exactly today's Supabase invite email (M3; owner decision
2026-10-16: branded only for allowlisted test accounts until launch). A new manager row stays **Pending** until the person
signs in, then turns **Accepted**.

The order of work is the whole fix (L-029):
1. Create or find the invitee's Auth user first. The trigger fires while **no** pending row exists for the email.
2. Then write the pending rows and the access grant.
3. Send the email last.
4. Mark rows accepted when the person signs in (`/auth/callback`).

Invariant: a pending manager row means the person never signed in and can get a fresh link. It has an active grant, except
after a failed grant step, which shows "Could not add access. Press Send again." and is repaired by Send again or Resend. An
expired row never leaves access behind: revoke expires the row and removes access in one transaction (D10, §6.12). The join
page never sends a link without an active grant (5b §6.6 step 7). Every runtime failure converges through normal app retries.

This sprint ships nothing alone. 5a, 5b and 5c go to production together (index, "Ship plan").

## 2. Context

### 2.1 The live trigger (quoted, L-029)
Read by Claude on the live project `vawqdqkaguhdgfhdebqw`, 2026-10-17; md5 re-read 2026-10-18, unchanged:
- `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user()`. It is the
  only non-internal trigger on `auth.users`.
- `md5(pg_get_functiondef('public.handle_new_user'::regproc))` = `2c51636368d7ef759fd151508e904240`. The body equals
  `supabase/migrations/20260228_phase9_llc_and_shared_operator_access.sql:707-765`, the last file (full-filename sort) that
  defines it. `20261005_sprint174_security_hardening.sql:4,22` only changes execute grants. Verbatim:

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _role text;
begin
  _role := coalesce(nullif(trim(new.raw_user_meta_data ->> 'role'), ''), 'tenant');
  if _role not in ('owner', 'manager', 'tenant') then
    _role := 'tenant';
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    _role
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name);

  -- Owner invitations create membership in the target ownership account.
  insert into ownership_account_members (account_id, profile_id, member_role, active, can_receive_critical_alerts)
  select i.ownership_account_id, new.id, 'owner', true, true
  from invitations i
  where lower(i.email) = lower(new.email)
    and i.status = 'pending'
    and i.role = 'owner'
    and i.ownership_account_id is not null
  on conflict (account_id, profile_id) do update
    set active = true,
        can_receive_critical_alerts = true;

  -- Manager invitations ensure active manager assignment.
  insert into property_managers (property_id, manager_profile_id, active)
  select i.property_id, new.id, true
  from invitations i
  where lower(i.email) = lower(new.email)
    and i.status = 'pending'
    and i.role = 'manager'
    and i.property_id is not null
  on conflict (property_id, manager_profile_id) do update
    set active = true;

  -- Auto-accept pending invitations for this email.
  update invitations
  set status = 'accepted',
      accepted_at = now(),
      invited_profile_id = new.id
  where lower(email) = lower(new.email)
    and status = 'pending';

  return new;
end;
$$;
```

It runs synchronously inside the `auth.users` insert. It grants every **pending** manager row (any inviter) for the email and
marks **every** pending row (any role) accepted. It never runs again for that user. If a statement fails
(`property_managers_guard_client` on a client home, `profiles_email_key`), GoTrue rolls back the insert and returns an error.

### 2.2 Which Auth calls insert `auth.users`
| Call | New email | Existing, unconfirmed | Existing, confirmed |
|---|---|---|---|
| `generateLink` invite | **inserts** (trigger fires); no email | no insert; `invited_at = now`; new token; no email | `email_exists` 422 |
| `inviteUserByEmail` | **inserts** (trigger fires); email | no insert; `invited_at = now`; new token; **re-sends** | `email_exists` 422 |
| `createUser` (`email_confirm: false`) | **inserts** (trigger fires); no email | `email_exists` 422 | `email_exists` 422 |
| `getUserById` | read only | read only | read only |

Both invite calls ignore `data` for an existing user. On a confirmed user neither sends an email.

- Live: `auth.users` `users_email_partial_key UNIQUE (email) WHERE is_sso_user = false` (the trigger fires at most once per
  email while the user exists); `auth.one_time_tokens` `UNIQUE (user_id, token_type)` and a unique `confirmation_token_idx`
  (one live invite token per user; a new token kills the old link).
- `generateLink` returns `properties.action_link` and `properties.hashed_token` (`@supabase/auth-js` 2.68.0,
  `types.d.ts:655-670`). `ErrorCode` has `email_exists` and `user_not_found`. `generateLink` magiclink/signup, `createUser` and
  client `signUp`/OTP also **insert**; none is used here.
- `deleteUser` is **never used here**: `profiles` has no FK to `auth.users`, so the profile and grants would stay and
  `profiles_email_key UNIQUE (email)` would block every later insert for that email. "Confirmed" means `email_confirmed_at ||
  phone_confirmed_at`, a safe superset (live: 0 phone-only users).
- **Proven live** (Claude, 2026-10-18 01:11Z, probe addresses X0 and X1, both now used):
  - (a) `generateLink` invite on a new email inserts `auth.users`; the trigger made the profile role manager, `full_name`
    from `data`. Auth log `/admin/generate_link` 200 in 83 ms, action `user_invited`, no mail (an `/invite` call with mail
    takes ~900 ms). It returns `hashed_token` and `action_link`.
  - (b) `inviteUserByEmail` 1.5 s later on that unconfirmed user: no error, same user, `invited_at` updated, mail sent. The
    (a) token now fails verify with `otp_expired` 403. No frequency limit hit.
  - (c) `generateLink` again: same user, new `hashed_token`; `verifyOtp({ token_hash, type: "invite" })` returns a session
    and confirms the email.
  - (d) `generateLink` invite on a confirmed account → `email_exists` 422. (e) `getUserById(random uuid)` → `user_not_found`
    404. (f) `inviteUserByEmail` on a confirmed account → `email_exists` 422, no mail.
  - (g) Self sign-up (`signUp` with data `{ role: "manager" }`), then `generateLink` invite on it: same user, still
    unconfirmed, `invited_at` goes from null to set, and `user_metadata` is unchanged (no `full_name`; it has `sub`, `email`,
    `email_verified`, `phone_verified` from sign-up). So `invited_at` and `user_metadata` prove nothing (D7).
  - (h) An upper-case email to `generateLink` matched the existing user (`email_exists`), so GoTrue lowercases.
- **Proven live, round 2** (Claude, 2026-10-18 01:27Z, X2 = `+c5probe2` and X3 = `+c5probe3`, both now used):
  - `auth.admin.createUser({ email, email_confirm: false, user_metadata, app_metadata })` inserts `auth.users` (the trigger
    fires; profile role manager from `user_metadata`) and sends **no** mail (auth log action `user_signedup`, no
    confirmation). It is create-only: an existing email, including a racing self sign-up, → `email_exists` 422.
  - `app_metadata.domus_manager_invite = true` is stored server-side. A later `generateLink` invite keeps it (it only sets
    `invited_at` and rotates the token), and it is still there after `verifyOtp`.
  - Clients cannot set it: `signUp` `options.data` (even a key named `app_metadata`) lands in `user_metadata`, and
    `updateUser({ data })` only changes `user_metadata`.
  - Live today: 0 unconfirmed manager users, so no marker backfill is needed (5c Claude C4 re-counts before deploy).
- Not read: the Supabase "invite" email template text. Vercel Production has `DOMUS_NOTIFICATIONS_ALLOWLIST` set and
  `DOMUS_NOTIFICATIONS_ENABLED` absent, so `notificationMode()` is `test` in production today: allowlisted → branded,
  everyone else → the generic Supabase invite.

### 2.3 Live schema facts (read-only queries, 2026-10-17)
- `invitations`: `invitations_email_role_invited_by_property_key UNIQUE NULLS NOT DISTINCT (email, role, invited_by,
  property_id)`. Status check `pending | accepted | expired`; revoke writes `expired` (its only writer,
  `tenant-invitations.ts:366`). FKs: `property_id` → properties ON DELETE CASCADE; `ownership_account_id` ON DELETE SET NULL;
  `invited_by`, `invited_profile_id` → profiles.
- Guards, both `42501`: `invitations_guard_client` (BEFORE INSERT OR UPDATE) rejects manager/owner rows on **unclaimed**
  client homes; `property_managers_guard_client` (BEFORE INSERT/UPDATE/DELETE) rejects any write on **any** client home.
- `anon`/`authenticated` have SELECT only on `invitations` and `property_managers`; all writes use the service role.
- `profiles`: `profiles_email_key UNIQUE (email)`, no FKs. 11 profiles have no `auth.users` row (10 owner, 1 tenant, 0
  manager); step 8a gives those emails the different-role copy. `property_managers` PK `(property_id, manager_profile_id)`.
- Rows: manager/pending 1, tenant/accepted 5, tenant/expired 1, tenant/pending 1, owner 0; 0 pending rows for an email with
  no profile. The manager row has the HEAD shape (user created first, confirmed, grant active, `invited_profile_id` null).

### 2.4 Today's code (HEAD)
Line counts (`apps/web/`): `app/actions/invitations.ts` 343; `lib/invite-email.ts` 39, `email/invites.ts` 129,
`email-templates.ts` 7, `invitations.ts` 274, `validations-entity.ts` 324; `app/auth/callback/route.ts` 240. Tests:
`app/actions/__tests__/invitations.test.ts` 141; `lib/__tests__/invite-email.test.ts` 99, `invitations.test.ts` 26,
`validations.test.ts` 2435. `app/auth/__tests__/` is new.

`inviteManager` (`app/actions/invitations.ts:19-192`): `requireAuth("owner", "manager")` (:23; managers inviting co-managers
is a recorded decision); it reads properties with the user client `supabase` (:39-43). Rate limit `invite:${user.id}`,
10/hour, in-memory, shared with `inviteTenant` and `inviteOwner` (:25-28); one `propertyId`, checked by
`canUserAdministerProperty` and `getClientStateForProperty` (imports :5 and :7, used only here). Existing manager (:63-118):
grant upsert, no row, no email; results are `const result = { … } as const; return result;` (:108-117, :184-191) because
`ActionState` (`app/actions/shared.ts:4-21`) has no `delivery`, `email` or `name`. New email: `inviteUserByEmail`
(:126-132; redirect `${NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"}/auth/callback`, data `{ role: "manager", full_name }`),
THEN the row insert (:138-149, error only logged), THEN the grant (:151-164), so the rows stay pending forever. `inviteOwner`
(:194-343) has the same order and **does not change** (L-014).

Sign-in: `trackAuthenticatedUser` (`route.ts:78-105`) runs on the code (:156), token_hash (:173) and setSession (:198)
branches and calls `markTenantInvitationAccepted` (`lib/invitations.ts:261-274`) when `hasInvitedSession` (:92-94). Every first
web session of an invitee passes this route, including `/auth/confirm` ("Tap once to keep going."; it forwards `token_hash`,
`app/auth/confirm/page.tsx:35-46`). Password sign-ins (`login.ts:46`, `llc-invitations.ts:410,492`) need a password set after
a callback session. The PKCE miss (:136-150) confirms the email with no session; those rows wait for a later sign-in or a
self-heal. The stale `apps/mobile` workspace is not shipped.

Email: the generic invite is the Supabase "invite" template over custom SMTP, not gated by the switch
(`docs/agent-handoff.md:189`). Tenant branded invites link to `action_link` (`tenant-invitations.ts:192`; pinned).
`lib/invite-email.ts:7-39` returns `false` before `fetch` when `RESEND_API_KEY` or `RESEND_FROM_EMAIL` is missing (:10-15).
`lib/email/shell.ts`: `escapeHtml` (:18); `buildBrandedEmailShell` (:27) escapes `ctaText`, `ctaUrl` and `preheaderText` itself
(:35-38; so `&` in `ctaUrl` becomes `&amp;`, :36); both re-exported by `email-templates.ts`. `lib/notifications-switch.ts`:
`notificationAllowlist` (:14-18) trims, lowercases, drops invalid entries; `notificationMode` (:20-33): an allowlist means
`test` even with `DOMUS_NOTIFICATIONS_ENABLED=true`, an invalid one means `off`; `isNotificationRecipientAllowed` (:35-43)
trims, lowercases and matches exactly. Owner-approved branded copy: `docs/sprint237c1-codex-prompt.md:101-103`.

Account scope:
- `getAdministeredPropertyIds(userId)` (`lib/property-access.ts:192-198`, via `getAdministeredProperties` :84-183): homes whose
  `owner_account_id` is in the user's active `ownership_account_members` rows with `member_role = 'owner'` (:90-96, :108-115),
  plus homes with active `property_managers` rows (:97-101), `active !== false` only (:138, :172). The `owner_profile_id`
  fallback (:21-80) runs only on a missing-schema error. It only calls `createAdminClient().from()`.
  `canUserAdministerProperty` is `includes()` on it (:321-324).
- `getClientStateForProperty` (`lib/client-accounts.ts:27-32`) and `getClientState` (:20-25) throw on error.
- Validation errors: `parseFormData` returns the first zod issue message (`lib/validations-auth.ts:262-265`).

### 2.5 The archived attempt: reuse only these parts
`docs/sprint-archive/237c1-invite-flow-round3.patch` (against HEAD):
- `lib/invite-email.ts` transport refactor: one private `sendInviteEmail(to, message)` shared with `sendTenantInviteEmail`
  (:1098-1173). Tenant output stays byte-identical.
- `buildManagerInviteEmail` (:1127-1139), moved to `lib/email/invites.ts` (imports from `./shell`). The try/catch shape of
  `canSendBrandedManagerInvite` (:1117-1125), **changed** to open only in `test` (§6.8).
- `inviteManagerSchema`'s `parseJsonArray` and exactly-one rule (:1182-1200), without `ownershipAccountId`, and with
  `parseJsonArray` changed per §6.9.
- In the action: the `getAdministeredPropertyIds` set check (:609-612) and the existing-manager "missing homes only" upsert
  (:640-699; N counts homes added). The client check (:620-631) becomes one `.in()` read with `{ error }` checked, no try/catch.
- Tests (:1232-1286, :1078-1097) are reference only. Rewrite them to §8; do not copy their mocks or `https://test/link`.

Do **not** reuse: the write order; the in-flight `Map` (:528); the retry branch (:712-775); `getOwnershipAccountsForUser`,
`accounts[0]`, `ownershipAccountId` (:588-608); the `ignoreDuplicates`-only re-invite (:776-781);
`invite-resend-manager.test.ts`.

### 2.6 Decisions (Claude; recorded in the handoff)
- **D1** Access is granted at **send** time, as at HEAD. Grant-at-accept needs the LLC token model; not now.
- **D2** A manager profile that never signed in is a pending invitee: re-inviting writes this inviter's rows, grants, and sends
  a link. HEAD sent nothing here, so this is one new send of today's Supabase email. Confirmed managers keep HEAD behavior.
- **D3** Branded email only when `notificationMode() === "test"` and the address is allowlisted. `on` stays generic.
- **D4** No manager path calls `deleteUser` or `deleteGeneratedInviteUser`.
- **D5** Rows turn accepted at sign-in, or by self-heal in Send, Resend, Revoke and the join-page resend.
- **D6** Revoke expires the row and removes access in one transaction (D10), and resets the link when no other pending
  manager row remains. The
  inviter can always revoke their own invite, even after losing the home (5b).
- **D7** An unconfirmed account without the server-only marker `app_metadata.domus_manager_invite = true` is refused
  (`self_signup_blocked`). Only §6.2 step 9b's `createUser` sets the marker. `invited_at`, role, `full_name` and timing are
  client-writable or reset by any invite call (C1(g)), so they prove nothing.
- **D8** The join-page resend never writes grants and never sends a link for a home without an active grant (5b).
- **D9** The branded link is `/auth/confirm?token_hash=…&type=invite` (prefetch-safe; no tokens in the URL). Tenant emails keep
  `action_link`.
- **D10** A row's grant and a row's revoke each run in one SQL transaction (§6.12, Claude's functions), so a row's status and
  its access never split.

## 3. In scope
- Rewrite `inviteManager` (many homes; Auth, then rows and grant, then email). The §6.1 helpers, used again by 5b.
- Sign-in acceptance of manager rows. The branded email and its gate. The schema's `propertyIds` (legacy `propertyId` kept, so
  today's form keeps working until 5c).
- Calls to Claude's two SQL functions (§6.12) through `admin.rpc`.
- Fakes that replay the live trigger, GoTrue and the two functions, and the tests in §8.

## 4. Out of scope
- Owner Resend, Revoke, the join-page resend, the `invite-resend.ts` guard (5b). The form, entry points, badge and toasts (5c).
- Any SQL from Codex (Claude writes and applies the §6.12 functions). Changing `handle_new_user` (follow-up L3).
- `inviteOwner` and owner rows, `inviteTenant` and tenant resend/revoke behavior, including their `deleteUser` fallbacks
  (pinned, L-014).
- Grant-at-accept. Accepting rows on dashboard load. Removing a signed-in manager from a home.
- Branded email in `on` mode, any other new email type, the notifications switch. `lib/audit.ts` labels, iOS,
  `app/actions/index.ts`, `app/actions/shared.ts`.

## 5. Exact files expected to change
Codex:
1. `apps/web/app/actions/invitations.ts` (imports :3-17 and `inviteManager` :19-192; `inviteOwner` :194-343 byte-identical)
2. `apps/web/lib/manager-invite.ts` (new, `server-only`: §6.1 helpers, `deliverManagerInvite`)
3. `apps/web/lib/invite-email.ts` (gate, `sendManagerInviteEmail`, shared private transport)
4. `apps/web/lib/email/invites.ts` (`buildManagerInviteEmail`) and `apps/web/lib/email-templates.ts` (export only)
5. `apps/web/lib/invitations.ts` (add `markManagerInvitationsAccepted`)
6. `apps/web/app/auth/callback/route.ts` (`trackAuthenticatedUser` only)
7. `apps/web/lib/validations-entity.ts` (`inviteManagerSchema` only)
8. Tests (each new file ≤ 500 lines):
   - `apps/web/app/actions/__tests__/fake-invite-db.ts`, `fake-gotrue.ts` (new helpers; not test files)
   - `apps/web/app/actions/__tests__/manager-invite-trigger-model.test.ts` (new, A1-A12)
   - `apps/web/app/actions/__tests__/manager-invite-guards.test.ts` (new, A13-A26)
   - `apps/web/app/actions/__tests__/invitations.test.ts` (edit, A27-A28)
   - `apps/web/app/auth/__tests__/callback-route.test.ts` (new, A29)
   - `apps/web/lib/__tests__/invitations.test.ts` (edit, A30)
   - `apps/web/lib/__tests__/manager-invite-email.test.ts` (new, A31-A33); `invite-email.test.ts` (edit, A34)
   - `apps/web/lib/__tests__/validations.test.ts` (edit only the `inviteManagerSchema` block, :1101-1138; A35)

Claude (not Codex): `supabase/migrations/20261028_sprint237c5_manager_invite_functions.sql` (§6.12),
`supabase/rollback/20261028_sprint237c5_manager_invite_functions_rollback.sql`,
`supabase/tests/sprint237c5_manager_invite_functions.sql` (rolled-back test of every branch). C1 is done (index).

## 6. Implementation requirements

### 6.1 Shared helpers (`lib/manager-invite.ts`, `import "server-only"`)
```ts
export type ManagerInviteRow = { id: string; email: string; full_name: string; status: string;
  property_id: string; invited_profile_id: string | null };
type DbResult = Promise<{ error: unknown | null }>;
managerInviteRedirect(): string        // `${APP}/auth/callback`
managerInviteUrl(hashedToken: string): string // `${APP}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=invite`
managerInviteMetadata(fullName: string) // { role: "manager", full_name: fullName } (HEAD :128-131)
managerInviteAppMetadata()             // { domus_manager_invite: true } (the D7 marker; only createUser sets it)
isAuthUserConfirmed(user): boolean     // Boolean(user?.email_confirmed_at || user?.phone_confirmed_at)
isDomusManagerInvitee(user): boolean   // user?.app_metadata?.domus_manager_invite === true && !isAuthUserConfirmed(user)
isEmailExistsError(error): boolean     // error?.code === "email_exists"
isUserNotFoundError(error): boolean    // error?.code === "user_not_found"
logManagerInvite(tag: string, error: unknown): void
writeManagerRows(p: { email: string; fullName: string; inviterId: string; propertyIds: string[]; profileId: string })
  : Promise<{ error: unknown | null; rows: Array<{ id: string; property_id: string }> }>
grantManagerHomes(profileId: string, propertyIds: string[]): DbResult // §6.3 only (no rows there)
grantInvitedRows(invitationIds: string[], profileId: string)
  : Promise<{ error: unknown | null; rows: Array<{ property_id: string; granted: boolean }> }>
markManagerRowsAccepted(p: { inviterId: string; email: string; propertyIds: string[]; profileId: string }): DbResult
deliverManagerInvite(p: { email: string; fullName: string; inviterId: string; homeNames: string[];
  authEmail: string | null })
  : Promise<"email_branded" | "email_basic" | "already_joined" | "not_sent">
```
- `APP` is `process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"`, read at call time (HEAD :127).
- Every helper uses `createAdminClient()`. Helpers log their own tag and return `{ error }`. Only the actions (and 5b's
  `revokeManagerInvite`) map errors to copy.
- `logManagerInvite`: `` console.error(`[manager-invite] ${tag}`, { code: error?.code ?? null, message }) ``, `message` being
  the error message or `String(error)`. Never log an email, a name, a link, a token or FormData.
- `grantManagerHomes` (§6.3 only): one `property_managers.upsert(propertyIds.map((id) => ({ property_id: id, manager_profile_id:
  profileId, active: true })), { onConflict: "property_id,manager_profile_id" })`.
- `markManagerRowsAccepted`: `invitations.update({ status: "accepted", accepted_at: now, invited_profile_id: profileId })
  .eq("invited_by", inviterId).eq("email", email).eq("role", "manager").in("property_id", propertyIds)
  .in("status", ["pending", "expired"])`. Call it only when every home in `propertyIds` has an active grant.
- `grantInvitedRows`: `admin.rpc("manager_invite_grant", { p_invitation_ids: invitationIds, p_profile_id: profileId })`;
  `{ data, error }` → `{ error, rows: data ?? [] }` (§6.12). Used by §6.2 step 11 and 5b's Resend.

### 6.2 `inviteManager` (replaces `invitations.ts:19-192`)
"Stop" means return at once; nothing more is written or sent. `{name}` is `fullName || email`. All reads and writes use one
`createAdminClient()`; the `supabase` client from `requireAuth` is not used (HEAD read properties with it, :39-43).
1. `const { user } = await requireAuth("owner", "manager");`
2. `` checkRateLimit(`invite:${user.id}`, 10, 60 * 60 * 1000) `` **once** per submit. Not allowed → `"Too many invitations sent.
   Please try again later."` No in-memory dedupe.
3. `parseFormData(inviteManagerSchema, formData)` (§6.9) → `{ email, fullName, propertyIds }`. Use this `email` everywhere.
4. `const allowed = new Set(await getAdministeredPropertyIds(user.id));` Any id not in it → `"Property not found."` (HEAD :46).
5. `properties.select("id, name, owner_account_id").in("id", propertyIds)`. Error, or fewer rows than ids → `"Property not
   found."` Keep names in `propertyIds` order.
6. Distinct non-null `owner_account_id`s; none → skip. Else `ownership_accounts.select("id, managed_client").in("id",
   accountIds)`. Error → `"Unable to check this home's client account."`; any `managed_client` → `"This home's managers are set
   by its client account."`
7. `profiles.select("id, role").eq("email", email).maybeSingle()`. Error → `"Could not check this email. Try again."`
8. Branch on the profile:
   - **8a.** Role not manager → `"A user with this email already exists with a different role."` (HEAD :122).
   - **8b.** Role manager → `getUserById(profile.id)`. `user_not_found` or no user → `"Could not find this person's account.
     Try a different email."` Other error → step 7's copy. Confirmed → §6.3, then stop. Unconfirmed and not
     `isDomusManagerInvitee` (D7) → log `self_signup_blocked`, `"We can't invite this email right now. Try a different
     email."` Unconfirmed and `isDomusManagerInvitee` → pending invitee: `profileId = profile.id`, `authEmail = user.email`,
     step 10.
   - **8c.** No profile → step 9.
9. New invitee:
   - **9a.** `invitations.select("id").eq("email", email).eq("status", "pending").limit(1)`. Error → step 7's copy. A row → log
     `stale_pending_row`, 8b's D7 copy. The trigger must find nothing pending at the insert.
   - **9b.** `createUser({ email, email_confirm: false, user_metadata: managerInviteMetadata(fullName), app_metadata:
     managerInviteAppMetadata() })`. It inserts `auth.users`; the trigger makes the profile (role manager), converts 0 rows,
     grants nothing; no email (§2.2 round 2). It is create-only.
     - Success with a user id → `profileId = data.user.id`, `authEmail = data.user.email`, step 10.
     - `email_exists` (lost a race: a self sign-up, a tenant invite, or another inviter's Send) → log `auth_failed`, step 7's
       copy `"Could not check this email. Try again."`, write nothing. Send again takes 8a or 8b, where the marker decides.
     - Other error, or no user id → 9c.
   - **9c.** The insert may have committed: log `auth_failed`, re-read the profile by email. Role manager, and `getUserById`
     passes `isDomusManagerInvitee` (the same predicate as 8b) → continue with that id, `authEmail = user.email`. Else →
     `"Failed to send invitation. Please try again."` (HEAD :135). No role re-read and no metadata comparison anywhere.
10. `writeManagerRows` (never downgrades an accepted row; no `auth.users` insert):
    - **(a)** `now = new Date().toISOString()`; `invitations.update({ status: "pending", full_name: fullName, accepted_at: null,
      invited_profile_id: profileId, ownership_account_id: null, created_at: now }).eq("email", email).eq("role", "manager")
      .eq("invited_by", user.id).in("property_id", propertyIds).in("status", ["pending", "expired"]).select("id,
      property_id")`. This re-opens a revoked row (same id) and refreshes `created_at` (the 30-day join window).
    - **(b)** Ids (a) did not return: `invitations.upsert(rows, { onConflict: "email,role,invited_by,property_id",
      ignoreDuplicates: true }).select("id, property_id")`, each row `{ email, full_name, role: "manager", property_id,
      invited_by: user.id, status: "pending", invited_profile_id: profileId, created_at: now }`. Skip when none are missing. A
      home still uncovered has this inviter's **accepted** row; leave it (its grant was set while it was pending).
    - Return every `{ id, property_id }` that (a) and (b) returned.
    - Error → log `rows_failed`, `"Could not save the invite. Press Send again."` Stop. The user exists unconfirmed, so Send
      again takes the pending-invitee path.
11. `grantInvitedRows(rowIds, profileId)` (§6.12 `manager_invite_grant`; skip the call when there are no row ids). Error →
    log `grant_failed`, `"Could not add access. Press Send again."` Stop; nothing changed. The function grants only rows
    still `pending`, under their row locks. A row returned `granted: false` was revoked meanwhile (another tab): drop its home.
    Kept homes = picked homes minus the dropped ones. None kept → `"This invite was revoked. Send a new invite."`
12. (Removed in rev 4: step 11's function skips revoked rows, so there is no re-check and no release.)
13. `deliverManagerInvite({ email, fullName, inviterId: user.id, homeNames, authEmail })` (§6.4), always last. `homeNames` are
    the kept homes' names.
14. Outcome. Audit (step 15) and revalidate (step 16) in every case. Build results as `const result = { … } as const; return
    result;` (HEAD :184-191).
    - `email_branded` / `email_basic` → `success: true`, `delivery: "email"`, `email`, `name: fullName`, `"Invite sent to
      {email}. They'll get an email from Domus."`
    - `already_joined` → `markManagerRowsAccepted` for the kept homes. Error → `success: false`, `"Access is set. The list did
      not update. Press Send again."` Else `success: true`, `delivery: "already_joined"`, `"Added {name}. They already signed
      in."`
    - `not_sent` → `success: false`, `"Access added. The email did not send. Press Send again."` Rows stay pending.
15. ```ts
    void logAudit({ userId: user.id, action: "invite_manager", entityType: "invitation",
      metadata: { propertyIds, tenantEmail: email, managerProfileId: profileId, delivery } })
      .catch(sideEffectError("inviteManager", "log_audit", { userId: user.id, entityType: "invitation", entityId: profileId }));
    ```
16. `revalidatePath("/owner"); revalidatePath("/manager");`

### 6.3 Existing confirmed manager P (HEAD :63-118, many homes)
1. `property_managers.select("property_id, active").eq("manager_profile_id", P).in("property_id", propertyIds)`. Error →
   `"Unable to check manager access. Please try again."` (HEAD :73).
2. `toAdd` = picked homes without an active row. If any: `grantManagerHomes(P, toAdd)`. Error → `"Failed to assign manager to
   property."` (HEAD :86).
3. `markManagerRowsAccepted({ inviterId: user.id, email, propertyIds, profileId: P })`. It heals this inviter's pending rows
   (the live HEAD-era row) and a row they revoked earlier. Error → audit and revalidate, then `success: false`, `"Access is set.
   The list did not update. Press Send again."`
4. Audit as §6.2 step 15 with `metadata: { propertyIds, addedPropertyIds: toAdd, tenantEmail: email, managerProfileId: P,
   delivery: toAdd.length ? "added" : "already" }`, on every call. Revalidate. No invitations insert, no Auth write, no email.
5. Return `{ success: true, delivery: "added" | "already", message, email, name: fullName }`:
   - Nothing added, one home picked → `"{name} already has access to this home. No email was sent."`
   - Nothing added, several picked → `"{name} already has access to these homes. No email was sent."`
   - One home picked and added → `"Added {name} to this home. They'll see it next time they sign in."`
   - Several picked, 1 added → `"Added {name} to 1 home. They'll see it next time they sign in."`
   - Several picked, N > 1 added → `"Added {name} to {N} homes. They'll see them next time they sign in."`

This path only adds grants, with no row and no email. Nothing in the app can undo it (5b §6.7 Undo (5)).

### 6.4 `deliverManagerInvite` (never throws)
0. `authEmail?.toLowerCase() !== email` → log `send_failed`, `not_sent`, no Auth call. Both invite calls are keyed by email,
   and a user whose Auth email differs would make them insert a new `auth.users` row and fire the trigger (§2.2).
1. If `canSendBrandedManagerInvite(email)` (§6.8):
   - `generateLink({ type: "invite", email, options: { data: managerInviteMetadata(fullName), redirectTo:
     managerInviteRedirect() } })` (the user exists unconfirmed: no insert, new token, marker kept). `email_exists` →
     `already_joined`. Other error or no `hashed_token` → step 2. Else `link = managerInviteUrl(hashed_token)`.
   - `inviterName`: `profiles.select("full_name").eq("id", inviterId).maybeSingle()`. Error → log `inviter_lookup_failed`.
     Error or empty → `"Someone"` (join page precedent, `page.tsx:43`).
   - `sendManagerInviteEmail({ email, inviterName, homeNames, inviteUrl: link })` true → `email_branded`; false → step 2.
2. Generic, exactly HEAD's call (:126-132): `inviteUserByEmail(email, { redirectTo: managerInviteRedirect(), data:
   managerInviteMetadata(fullName) })`. No error → `email_basic`; `email_exists` → `already_joined`; other → log
   `send_failed`, `not_sent`.
3. A throw anywhere → log `send_failed`, `not_sent`.

### 6.5 Accept at sign-in
- `lib/invitations.ts`: `export async function markManagerInvitationsAccepted(profileId: string): Promise<void>` next to
  `markTenantInvitationAccepted` (unchanged): `invitations.update({ status: "accepted", accepted_at: now }).eq("role",
  "manager").eq("invited_profile_id", profileId).eq("status", "pending")`. An error that is not `isMissingSchemaError`, or a
  throw → `console.error("[manager-invite] accept_failed", { code, message })`. It never throws.
- `trackAuthenticatedUser` (:78-105): after the `user?.id` check, for **every** session, outside `hasInvitedSession`:
  ```ts
  try { await markManagerInvitationsAccepted(user.id); }
  catch (error) { console.error("[manager-invite] accept_failed", { code: null, message: String(error) }); }
  ```
  It never changes the redirect. The tenant call stays.

### 6.8 Gate and branded email
`lib/invite-email.ts`:
- `canSendBrandedManagerInvite(email)`:
  ```ts
  try { const mode = notificationMode();
    return mode === "test" && isNotificationRecipientAllowed("test", email, notificationAllowlist()); }
  catch { return false; }
  ```
- `sendManagerInviteEmail({ email, inviterName, homeNames, inviteUrl })` re-checks the gate (closed → `false`, no `fetch`),
  then uses the shared private `sendInviteEmail`. Missing `RESEND_*`, a non-OK response or a throw → `false`.
- `sendTenantInviteEmail` keeps its signature and output.

`lib/email/invites.ts` `buildManagerInviteEmail({ inviterName, homeNames, inviteUrl })` → `{ subject, html, text }`, exported
from `lib/email-templates.ts`. Exact copy (owner-approved, `docs/sprint237c1-codex-prompt.md:101-103`; title from the patch):
- Subject `{inviterName} added you to Domus`. Title `Manage homes on Domus`. Body `{inviterName} wants you to manage {home} on
  Domus.` (`{home}` is the name for one home, else `{N} homes`). Button `Set up your account` → `inviteUrl`. Footer `If you
  were not expecting this, you can ignore it.`
- Escape the inviter and home names only inside `bodyHtml`. Pass the raw subject as `subject` and `preheaderText`; the shell
  escapes it. The text part (not escaped) has the same lines plus `Set up your account: {inviteUrl}`.

Non-allowlisted people (and everyone in `off` and `on`) get exactly HEAD's `inviteUserByEmail` call. One new send occasion
(D2): adding a manager who never signed in now emails them today's Supabase invite (HEAD sent nothing, `invitations.ts:63-117`),
and the new email replaces their earlier link.

### 6.9 Schema (`lib/validations-entity.ts` :111-115)
- `email`: `z.string().trim().toLowerCase().min(1, "Email is required.").email("Enter a valid email address.")`
- `fullName`: `z.string().trim().min(1, "Full name is required.").max(100, "Name must be under 100 characters.")`
- `propertyId`: optional uuid, `"Invalid property selection."` (legacy single-home form; today's form posts it until 5c, then
  one more release).
- `propertyIds`: optional `z.preprocess(parseJsonArray, z.array(z.string().uuid("Invalid property selection.")).min(1, "Pick
  at least one home.").max(100, "Pick up to 100 homes."))`. `parseJsonArray` returns `undefined` when the value is not JSON or
  not an array, so any bad `propertyIds` gives `"Pick at least one home."`
- Exactly one of the two, else `"Pick at least one home."` Output `{ email, fullName, propertyIds }`, ids deduped in first-seen
  order. No `ownershipAccountId` key (zod strips it).

### 6.12 SQL functions (Claude writes, tests and applies them; Codex only calls them)
In `supabase/migrations/20261028_sprint237c5_manager_invite_functions.sql`. Both are `security invoker`, `set search_path =
public`; EXECUTE is revoked from `public`, `anon` and `authenticated` and granted to `service_role` only. Codex calls them with
`createAdminClient().rpc(name, args)` and reads `{ data, error }`.
1. `manager_invite_grant(p_invitation_ids uuid[], p_profile_id uuid) returns table(property_id uuid, granted boolean)`. One
   transaction. Locks the given rows `FOR UPDATE` (role manager). Each `pending` row → upsert `property_managers (property_id,
   p_profile_id, active true)`, on conflict set `active = true` → `granted: true`. A row not pending → `granted: false`, no
   write. A guard error (client home) raises and rolls back everything.
2. `manager_invite_revoke(p_invitation_id uuid, p_inviter_id uuid) returns table(outcome text, profile_id uuid, released
   boolean, other_live boolean)`. Locks the row `FOR UPDATE` where id, `invited_by` and role manager match. None →
   `not_found`. `expired` → `already_revoked`; `accepted` → `accepted`; no writes. `pending` → status `expired`, `accepted_at`
   null; profile = `coalesce(invited_profile_id, the manager profile with lower(email) = lower(row.email))`. With a profile:
   `other_live` = another manager row for that email and home is `pending` or `accepted`; if not `other_live`,
   `property_managers.active = false` for that home and profile, and `released` = a grant row was found. Outcome `revoked`.
   One transaction: an error leaves the row pending with its grant, so Revoke still shows and a retry converges.
The fake (§8) models both. Claude's rolled-back `supabase/tests/sprint237c5_manager_invite_functions.sql` is the authority on
the real functions.

### 6.11 Logging, errors, safety
- Every Supabase call's `{ error }` is read (L-002). No path returns success for work it did not do.
- Log tags (`[manager-invite]`, `{ code, message }` only): `auth_failed`, `rows_failed`, `grant_failed`, `send_failed`,
  `inviter_lookup_failed`, `stale_pending_row`, `self_signup_blocked`, `accept_failed`. (5b adds `revoke_failed` and
  `link_reset_failed`.)
- L-028: add no client `try/catch` around `inviteManager`. A new `catch` in `app/actions/*.ts` starts with
  `unstable_rethrow(error)`. No new `catch` wraps `requireAuth` (it calls `redirect()`). Lib helpers and the route use the
  catch shapes given above.
- `"use server"` files export only async functions; helpers go in `lib/`. Do not edit `app/actions/shared.ts`.
- No new or changed code calls `fetch` except `sendInviteEmail`.
- Plain language: 6th grade, ≤ 12 words per sentence, no banned words (`lib/plain-language/scan.ts`).
- Size (L-015): new files ≤ 500 lines; an edited file under 500 stays under 500. `validations.test.ts` is exempt: add only the
  `inviteManagerSchema` cases; do not split or reformat it. Added or changed lines ≤ 140 characters. Do not reformat untouched
  lines. No compaction.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user
  needs to think about what to do, the UI needs to be clearer.

## 7. Validation commands
From the repo root, in order. Every file in the `ls` must exist.
```
ls apps/web/app/actions/__tests__/{fake-invite-db.ts,fake-gotrue.ts,manager-invite-trigger-model.test.ts} \
  apps/web/app/actions/__tests__/manager-invite-guards.test.ts apps/web/app/auth/__tests__/callback-route.test.ts \
  apps/web/lib/__tests__/manager-invite-email.test.ts
(cd apps/web && npx vitest run app/actions/__tests__/manager-invite-trigger-model.test.ts \
  app/actions/__tests__/manager-invite-guards.test.ts app/actions/__tests__/invitations.test.ts \
  app/auth/__tests__/callback-route.test.ts lib/__tests__/invitations.test.ts lib/__tests__/manager-invite-email.test.ts \
  lib/__tests__/invite-email.test.ts lib/__tests__/validations.test.ts)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
```
Do NOT run `npm run gate:web`. Do not apply or write SQL. Claude runs the live checks, gates, deploys and walks.

## 8. Acceptance criteria
Test rules (L-017, L-028, L-029):
- Exercise the real actions and helpers. No `expect` inside a mock. Assert after the awaited call.
- Fixtures use `@example.com`; `NEXT_PUBLIC_APP_URL` is stubbed to `https://app.example.com`. Tokens and fake links are not
  URLs. Every fake id is `crypto.randomUUID()` (the real zod `.uuid()` runs).
- The two `manager-invite-*.test.ts` files mock **only** `@/app/actions/auth-helpers` (`requireAuth`), `@/lib/supabase/admin`
  (the fake), `@/lib/audit`, `next/cache`, `next/headers`, `server-only` and global `fetch`. Everything else is real,
  including validations, `checkRateLimit` (`resetRateLimitState()` in `beforeEach`), the notifications switch (`vi.stubEnv`),
  `invite-email`, the templates, `client-accounts`, `property-access` (against the fake), `manager-invite`, `invitations`.
- They stub `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in every test, so a gate leak would reach `fetch`.
- Clock: `vi.useFakeTimers({ toFake: ["Date"] })` in `beforeEach`, `vi.setSystemTime(t0 + n * 60_000)` before each action,
  `vi.useRealTimers()` in `afterEach`. Assert `created_at` equals the time set.
- Seed only through the fakes' builder or Auth API, never their arrays. Besides fixtures (homes, accounts, members, inviter
  profiles and their grants), the only seeds are the live legacy shape (A14) and a pending row written before Auth (A2, A18).
  Every other state comes from the code's own operations.

**`fake-invite-db.ts`:**
- Tables: `profiles` (PK id, UNIQUE email); `invitations` (UNIQUE NULLS NOT DISTINCT `(email, role, invited_by, property_id)`,
  status check); `property_managers` (PK `(property_id, manager_profile_id)`); `properties` (`id, name, owner_account_id,
  active`); `ownership_accounts` (`id, managed_client, claim_state`); `ownership_account_members` (`account_id, profile_id,
  member_role, active`).
- Builder: `select`, `eq`, `neq`, `in`, `limit`, `maybeSingle`, `single`, `insert`, `upsert` (`onConflict`,
  `ignoreDuplicates`), `update`, `.select()` after a write; thenable, so `Promise.all` works.
- Rules: a DO UPDATE upsert hitting one key twice fails with `code: "21000"`; with `ignoreDuplicates` the later row is skipped.
  A `property_managers` write on a `managed_client` home, or a manager/owner `invitations` write on an unclaimed one, fails
  with `code: "42501"`. Error messages copy Postgres wording and never contain an email, link or token.
- `rpc(name, args)` implements both §6.12 functions exactly, row-level and all-or-nothing (a simulated failure changes
  nothing; a guard error inside the grant rolls back every row). The fake models the SQL; Claude's SQL test is the authority.
- Both fakes share one world. `createFakeWorld()` (fake-invite-db.ts) returns `{ ops, beforeOp, afterOp, failNext, failAuth,
  admin }`, and `createFakeGoTrue(world)` (fake-gotrue.ts) attaches Auth to it. `admin` is what the mocked
  `createAdminClient()` returns: `{ from, rpc, auth: { admin: { createUser, generateLink, inviteUserByEmail, getUserById,
  deleteUser } } }`. `ops: string[]` is one ordered log. Names: `db:<table>:<select|insert|upsert|update|delete>`;
  `rpc:manager_invite_grant`, `rpc:manager_invite_revoke`; `auth.createUser`, `auth.generateLink`, `auth.inviteUserByEmail`,
  `auth.getUserById`, `auth.deleteUser` (logged on entry); `auth.insert`, `auth.rotate`, `auth.email` (effects);
  `trigger.converted:<n>`, `trigger.granted:<n>`. `beforeOp`/`afterOp` take any name, including `rpc:` names. `failNext(table,
  op)` applies to `db:` ops, `failNext("rpc", name)` to `rpc:<name>`, and `failAuth(method)` to `auth.<method>`. Failures
  are one-shot. `beforeOp(op, fn)` / `afterOp(op, fn)` run async `fn` once, before or after the next matching operation
  commits, before that call resolves.

**`fake-gotrue.ts`** (Auth, as §2.2, including the proven-live rows):
- Exports `HANDLE_NEW_USER_SQL` (the §2.1 body verbatim) and `runHandleNewUser`, a step-for-step copy that logs
  `trigger.converted:<n>` and `trigger.granted:<n>`. If it fails, the insert rolls back and the call returns `{ code:
  "unexpected_failure", status: 500, message: "Database error saving new user" }`.
- Users carry `email`, `email_confirmed_at`, `last_sign_in_at`, `invited_at`, `user_metadata`, `app_metadata` and a current
  token `tok:<userId>:<n>`. Emails are stored lowercased (C1(h)).
- `createUser({ email, email_confirm: false, user_metadata, app_metadata })`: new email → `auth.insert` (`invited_at` null,
  unconfirmed, both metadata stored), then the trigger, no email; existing email → `{ code: "email_exists", status: 422 }`.
- `generateLink` invite and `inviteUserByEmail`: new email → `auth.insert` (`invited_at` set, unconfirmed, `user_metadata` =
  `data`), then the trigger; existing unconfirmed → `auth.rotate`, `invited_at = now`, `data` ignored (both metadata
  unchanged); confirmed → `{ code: "email_exists", status: 422 }` and no email. `generateLink` returns `properties: {
  action_link: "fake-link:" + token, hashed_token: token }` and the user, and records no email. `inviteUserByEmail` records `{
  to, token }` (`auth.email`). `getUserById` miss → `{ code: "user_not_found", status: 404 }`. `deleteUser` is recorded only.
- Test helpers (not GoTrue): `commitThenError(o?: { dropMarker?: boolean })` (the next `createUser` inserts and runs the
  trigger, then errors; `dropMarker` stores no `app_metadata`); `selfSignUp(email, { role, full_name? })` (insert with
  `invited_at` null and `user_metadata` `{ role, full_name? }`, never `app_metadata`, then the trigger); `dropAuthUser(id)` (removes the
  user, keeps the profile and grants); `setAuthEmail(id, email)` (changes only the Auth user's email); `clickLink(token)`
  (only the current token works; sets `email_confirmed_at` and `last_sign_in_at`; no insert).

**`manager-invite-trigger-model.test.ts`:**
- A1 "embedded trigger SQL equals the latest migration". Scan `path.resolve(__dirname, "../../../../../supabase/migrations")` for
  `*.sql` with `create or replace function public.handle_new_user` (any case). The last match in full-filename sort is
  `20260228_phase9_llc_and_shared_operator_access.sql`; its whitespace-normalized body equals `HANDLE_NEW_USER_SQL`.
  This proves only the text; the trigger's behavior is proved by A2 onward (`runHandleNewUser`).
- A2 "control: rows written before an Auth insert are auto-accepted (L-029)". Seed a pending manager row, then the fake's
  `generateLink`: row accepted, grant active, `trigger.converted:1`.
- A3 "new manager, 2 homes: rows stay pending". 1 unconfirmed user with the marker; 2 `pending` rows with
  `invited_profile_id` = the new id; 2 active grants; `trigger.converted:0`. Op order: `auth.insert` < invitations write <
  `rpc:manager_invite_grant` < `auth.email`. Exact success copy.
- A4 "non-allowlisted gets today's Supabase invite". In `off`, `test` with the address unlisted, and `on`:
  `inviteUserByEmail` once with `(email, { redirectTo: "https://app.example.com/auth/callback", data: { role: "manager",
  full_name } })`; no `fetch`.
- A5 "allowlisted gets one branded email". `test`; the listed address typed with other case and spaces. One `fetch` to
  `https://api.resend.com/emails`, `to: [email]`. The HTML has
  `https://app.example.com/auth/confirm?token_hash=${encodeURIComponent(currentToken)}&amp;type=invite`, never `fake-link:`,
  and the escaped home names. No `inviteUserByEmail`.
- A6 "branded failure falls back without a second user". Resend returns 500: `inviteUserByEmail` once; 1 user; rows pending;
  success copy; no `deleteUser`.
- A7 "both sends fail". `"Access added. The email did not send. Press Send again."`; rows pending; grants active. Send again
  → 1 email, the new `created_at`. (The Resend half is 5b B16.)
- A8 "rows write fails". `failNext("invitations", "update")` → `"Could not save the invite. Press Send again."`; 1
  unconfirmed user, 0 rows, 0 grants, 0 emails. Send again → still 1 user, rows pending, 1 email.
- A9 "grant fails". `failNext("rpc", "manager_invite_grant")` → `"Could not add access. Press Send again."`, 0 emails. Send
  again → the grant is active before `auth.email`. (The Resend half is 5b B16.)
- A10 "Send again for a pending invitee does not duplicate". 1 user, the same 2 row ids, new `created_at`, 1 more email; the
  old token fails `clickLink`.
- A11 "sign-in accepts only P's manager rows". P's pending rows from inviters A and B both turn `accepted` after
  `markManagerInvitationsAccepted(P)`; Q's row stays `pending`. (A30 proves the `role = manager` filter.)
- A12 "accepted row is never downgraded". Invite h1, then `markManagerInvitationsAccepted(P)` without `clickLink`. Re-invite
  h1 and h2: h1 stays `accepted` (same id); h2 is `pending`.

**`manager-invite-guards.test.ts`:**
- A13 "existing signed-in manager": 1 of 3 homes active: one upsert of 2 homes; no invitations insert, no Auth write, no
  email; audit `addedPropertyIds` = the 2 ids; `"Added Alex Manager to 2 homes. They'll see them next time they sign in."`;
  and the four other §6.3 messages.
- A14 "live legacy row heals" (seeded: user created first, confirmed, grant active, `invited_profile_id` null): re-add from
  the form → accepted; no email.
- A15 "other-role email refused before any Auth call or write".
- A16 "orphan manager profile refused". `generateLink` for a new email, then `dropAuthUser`. Invite → `"Could not find this
  person's account. Try a different email."`; no writes; no `auth.insert`.
- A17 "self sign-up refused (D7)". `selfSignUp(email, { role: "manager" })` → `"We can't invite this email right now. Try a different
  email."`; 0 rows, 0 grants, 0 emails.
- A18 "stale pending row blocks the Auth call". Seeded pending row for an unknown email → no `auth.createUser`; the same copy.
- A19 "client home refused before any write". One of 2 homes `managed_client` → exact copy, zero writes, zero Auth calls.
- A20 "account scope". An owner with homes in accounts A and B: B's homes posted with `ownershipAccountId` = A succeed
  (ignored). Another owner's home → `"Property not found."`, zero writes.
- A21 "a manager invites a co-manager". `requireAuth` role manager; homes from active `property_managers`; rows carry
  `invited_by` = that manager.
- A22 "rate limit counts once per multi-home submit". 10 submits of 3 homes pass; the 11th gives the exact copy, zero writes.
- A23 "createUser commits, then errors". (a) `commitThenError()` → 9c finds the marker and continues as a pending invitee: 1
  user, rows pending, grants, 1 email. (b) `commitThenError({ dropMarker: true })` (the committed user has no marker) →
  `"Failed to send invitation. Please try again."`; 0 rows, 0 grants, 0 emails.
- A24 "lost races at 9b" (D7; the name plays no role):
  - (a) `beforeOp("auth.createUser", …)` runs the fake's `inviteUserByEmail(email, { data: { role: "tenant", full_name:
    fullName } })` (a tenant invite made the user first). Result: step 7's copy; 0 rows, 0 grants; only that tenant invite's 1
    `auth.email`. Send again → `"A user with this email already exists with a different role."` (8a).
  - (b) `failNext("profiles", "select")` before Send → step 7's copy, 0 Auth calls, 0 rows. Send again → 1 user, rows
    pending, 1 email.
  - (c) Attack (R3): `beforeOp("auth.createUser", () => selfSignUp(email, { role: "manager", full_name: fullName }))`, i.e.
    after the no-profile read, with role manager and the exact name. `createUser` → `email_exists` → step 7's copy; 0 rows, 0
    grants, 0 emails. Send again → 8b's D7 copy and a `self_signup_blocked` log; still 0 rows, 0 grants, 0 emails; no
    `auth.createUser`, `auth.generateLink` or `auth.inviteUserByEmail` in that call.
  - (d) Legit same-name race: `beforeOp("auth.createUser", …)` runs the fake's `createUser({ email, email_confirm: false,
    user_metadata: { role: "manager", full_name: fullName }, app_metadata: { domus_manager_invite: true } })` (another
    inviter's Send won the Auth step). Our Send → step 7's copy, 0 rows. Send again → 8b pending invitee: 1 user, our rows
    pending, grants active, 1 email.
- A25 "P signs in during B's Send". A invites P (new) to h1. B sends P to h2 with `beforeOp("auth.inviteUserByEmail", …)`
  running `clickLink(<P's current token>)`. B gets `{ success: true, delivery: "already_joined" }` and `"Added {name}. They
  already signed in."`; B's h2 row is `accepted`; grant active; no new `auth.email`. Allowlisted variant: the same with
  `beforeOp("auth.generateLink", …)`; 0 `fetch`.
- A26 "Auth email differs". Invite P (new), then `setAuthEmail(P, "other@example.com")`. Send again → `"Access added. The
  email did not send. Press Send again."`; in that call no `auth.generateLink`, no `auth.inviteUserByEmail`, no `auth.insert`.

**Pins and unit tests:**
- A27 `invitations.test.ts`, `inviteOwner` pinned (L-014): :59-83 stay. Add: new email → `inviteUserByEmail` with `{ role:
  "owner", full_name, ownership_account_id }` **before** the owner row insert (`invocationCallOrder`); an insert error is only
  logged, still `{ success: true }`; existing owner → membership upsert; duplicate pending → `"An owner invitation is already
  pending for this account."`; `requireAuth("owner", "manager")`.
- A28 `invitations.test.ts`, `inviteManager` guards (rewrite :85-141). Add `vi.mock("server-only", () => ({}))`; the
  `@/lib/property-access` mock also exports `getAdministeredPropertyIds`. Rate-limited → no `from`, no Auth call;
  `requireAuth` rejects → no rate-limit call; client-home refusals with exact copy.
- A29 `callback-route.test.ts` (first line `// @vitest-environment node`): `markManagerInvitationsAccepted(user.id)` once on
  the code, token_hash invite, token_hash magiclink and setSession branches; `markTenantInvitationAccepted` only when
  `hasInvitedSession`; a rejection keeps the `resolveAuthRoute` redirect; the PKCE miss does not call it.
- A30 `lib/__tests__/invitations.test.ts`: `markManagerInvitationsAccepted` filters `role = manager`, `invited_profile_id`
  and `status = pending`; an error is logged, a throw swallowed. `markTenantInvitationAccepted` unchanged.
- A31 `manager-invite-email.test.ts`, gate truth table on the **real** switch (`vi.stubEnv` of
  `DOMUS_NOTIFICATIONS_ALLOWLIST` and `DOMUS_NOTIFICATIONS_ENABLED`): `off`; `on`; `" Listed@Example.com "` with allowlist
  `listed@example.com` → `true`; unlisted → `false`; allowlist `not-an-email` → `false`. A throwing switch, in its own
  `describe` (`vi.doMock("@/lib/notifications-switch")` and a fresh `await import`) → `false`. Only test+listed is `true`.
- A32 Builder (from `@/lib/email-templates`, `inviteUrl: "fake-link:u1:1"`): exact subject, title, body, button, footer; one
  home names it, two say `2 homes`; `<script>` in the inviter and home names is escaped once in the HTML (no `&amp;lt;`); the
  subject is raw; the text part is present; every copy sentence has ≤ 12 words as `scan.ts` counts (each `${…}` is one
  word), with fixtures `Ace` and `Oak Home`.
- A33 Sender: no `fetch` when the gate is closed or `RESEND_*` is missing; one `fetch` when open; `false` on non-OK and on a
  throw.
- A34 `invite-email.test.ts`: existing tenant tests unchanged and green; the tenant payload (`to`, `subject`, `html`, `text`)
  is identical through the shared transport.
- A35 `validations.test.ts`, `inviteManagerSchema` block only: `" A@B.COM "` → `"a@b.com"`; `JSON.stringify([id1, id1,
  id2])` → `[id1, id2]`; legacy `propertyId` → `[propertyId]`; neither, both or `[]` → `"Pick at least one home."`; 101 ids →
  `"Pick up to 100 homes."`; `propertyIds` not JSON, and a JSON object, → `"Pick at least one home."`; a non-UUID →
  `"Invalid property selection."`; no `ownershipAccountId` in the output.
- A36 Full suite, `tsc`, lint and `lib/__tests__/plain-language.test.ts` are green.

**Mutation proofs (in the report; revert each):** M1 write rows before `createUser` → A3 fails. M3 open the gate in `on` →
A4 and A31. M4 make §6.2 step 10 a plain DO UPDATE upsert → A12. M6 send the email before the grant → A3's op order. M9 map
`email_exists` to `not_sent` in §6.4 → A25. M11 move `markManagerInvitationsAccepted` inside `hasInvitedSession` → A29. M12
skip §6.2 step 9a → A18. M13 treat 9b's `email_exists` as a pending invitee (continue with the existing user) → A24(c). M14
make `isDomusManagerInvitee` ignore the marker (any unconfirmed user passes) → A24(c) Send again. M15 let 9c continue
without the marker → A23(b).

**Claude only (not Codex):**
- C1 is done (index, "C1 live results" and "round 2").
- C7 Before 5a review: write the §6.12 migration, its rollback and `supabase/tests/sprint237c5_manager_invite_functions.sql`.
  The rolled-back test covers every branch of both functions (granted true and false; `not_found`, `already_revoked`,
  `accepted`, `revoked` with and without `other_live`, `released` true and false) and the client-home guard rolling back the
  whole grant. Apply after ChatGPT APPROVE and before the release deploys. 5b C2 adds the EXECUTE checks.
- Before 5b dispatch, Claude reviews this sprint and commits it locally; it is not deployed.

## 9. Report format
Compact status only: files changed with line counts, the test for each criterion (A1-A36), `grep -c "it("` per new test
file, mutation results (M1, M3, M4, M6, M9, M11-M15), command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies. No SQL from Codex.
- `inviteOwner` and `inviteTenant` stay byte-identical. `tenant-invitations.ts`, `join-invite.ts`, `invite-resend.ts` and all
  components are not touched (5b, 5c).
- Never call an Auth API that inserts `auth.users` after writing a pending row for that email (L-029). The only insert is
  9b's `createUser`.
- Grants for invitation rows go only through `manager_invite_grant` (D10).
- No `deleteUser` or `deleteGeneratedInviteUser` in any manager path.
- No in-memory dedupe, no `window.location`, no `accounts[0]`, no `ownershipAccountId`.
- No `fetch` outside `sendInviteEmail`. No other new email type.
- Exact copy only. Invent no strings, URLs or emails. Fixtures use `@example.com`.
- Size, line-length and catch rules as §6.11.
- If anything in the live schema or GoTrue behavior blocks you, stop and report. Do not work around it.
