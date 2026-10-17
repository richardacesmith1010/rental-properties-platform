# Sprint 237c-5 — Manager invite redesign: All my homes + allowlist-only branded email (L3) — rev 2 (rev 1 → Claude critic panel: 71 adopted)

Severity L3 (auth/invite, access grants, outbound email). `/chatgpt-review` before `/codex-dispatch`. History: 237c-1's invite
half failed review three times and never shipped. Root cause (L-029): it wrote pending rows before the Auth call, and the live
trigger auto-accepted them. 237c-1's Clients half shipped in `83154c8`. Production runs HEAD (`240667d`). A 3-design, 3-judge
panel picked this design (3 of 3); a 5-lens critic panel shaped rev 2 (log at the end).

## 1. Objective
Owners, and managers inviting co-managers, can add a manager to one home or to "All my homes" in one send (M1). Allowlisted
test accounts get a Domus-branded invite email. Everyone else gets exactly today's Supabase invite email (M3; owner decision
2026-10-16: branded only for allowlisted test accounts until launch). The invite list tells the truth:
- A row stays **Pending**, with Resend, Copy link and Revoke, until the person signs in. Then it turns **Accepted**.
- Revoke really removes access. Re-invite after a revoke works. A failed email can always be re-sent.

The order of work is the whole fix (L-029):
1. Create or find the invitee's Auth user first. The trigger fires while **no** pending row exists for the email.
2. Then write the pending rows and the access grant.
3. Send the email last.
4. Mark rows accepted when the person signs in (`/auth/callback`).

Invariant: a pending manager row means the person never signed in, has a grant on that home, and can get a fresh link. Two
failure states break the grant clause until repaired: a failed grant (Send again or Resend re-grants) and a half-done revoke
(the next Revoke finishes it). Neither can get a link from the join page (§6.6 step 7).

## 2. Context

### 2.1 The live trigger (quoted, L-029)
Read by Claude on the live project `vawqdqkaguhdgfhdebqw`, 2026-10-17:
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
| `generateLink({ type: "invite" })` | **inserts** (trigger fires); no email | no insert; new token; no email | `email_exists` |
| `inviteUserByEmail` | **inserts** (trigger fires); Supabase email | no insert; new token; **re-sends** | `email_exists` |
| `getUserById` | read only | read only | read only |

- Live: `auth.users` `users_email_partial_key UNIQUE (email) WHERE is_sso_user = false` (the trigger fires at most once per
  email while the user exists); `auth.one_time_tokens` `UNIQUE (user_id, token_type)` and a unique `confirmation_token_idx`
  (one live invite token per user; a new token kills the old link).
- `generateLink` returns `properties.action_link` and `properties.hashed_token` (`@supabase/auth-js` 2.68.0,
  `types.d.ts:655-670`) and, per Supabase docs, sends nothing. `ErrorCode` has `email_exists` and `user_not_found`.
  `inviteUserByEmail` ignores `data` for an existing user. `generateLink` magiclink/signup, `createUser` and client
  `signUp`/OTP also **insert**; none is used here.
- `deleteUser` is **never used here**: `profiles` has no FK to `auth.users`, so the profile and grants would stay and
  `profiles_email_key UNIQUE (email)` would block every later insert for that email. "Confirmed" means `email_confirmed_at ||
  phone_confirmed_at`, a safe superset (live: 0 phone-only users).
- Not provable offline; Claude proves them live **before dispatch** (§8 C1) and records results here: `generateLink` sends no
  email; an immediate `inviteUserByEmail` to the just-created user re-sends; the `hashed_token` link signs in via `/auth/confirm`.

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
Line counts (`apps/web/`): `app/actions/invitations.ts` 343, `tenant-invitations.ts` 379, `join-invite.ts` 66;
`lib/invite-resend.ts` 107, `invite-email.ts` 39, `email/invites.ts` 129, `email-templates.ts` 7, `invitations.ts` 274,
`validations-entity.ts` 324; `app/auth/callback/route.ts` 240; `invite-manager-form.tsx` 136, `owner-add-menu.tsx` 98,
`invitations-section.tsx` 209 (19 lines over 140). Tests: `app/actions/__tests__/invitations.test.ts` 141,
`tenant-invitations.test.ts` 188, `join-invite.test.ts` 115; `lib/__tests__/invite-email.test.ts` 99, `invitations.test.ts`
26, `validations.test.ts` 2435; `components/__tests__/invite-manager-form.test.tsx` 45. `app/auth/__tests__/` is new.

`inviteManager` (`app/actions/invitations.ts:19-192`): `requireAuth("owner", "manager")` (:23; managers inviting co-managers
is a recorded decision); rate limit `invite:${user.id}`, 10/hour, in-memory, shared with `inviteTenant` and `inviteOwner`
(:25-28); one `propertyId`, checked by `canUserAdministerProperty` and `getClientStateForProperty` (imports :5 and :7, used only
here). Existing manager (:63-118): grant upsert, no row, no email; results are `const result = { … } as const; return result;`
(:108-117, :184-191) because `ActionState` (`app/actions/shared.ts:4-21`) has no `delivery`, `email` or `name`. New email:
`inviteUserByEmail` (:126-132; redirect `${NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"}/auth/callback`, data `{ role:
"manager", full_name }`), THEN the row insert (:138-149, error only logged), THEN the grant (:151-164), so the rows stay
pending forever. `inviteOwner` (:194-343) has the same order and **does not change** (L-014).

List, Resend, Revoke, join page:
- `invitations-section.tsx` `InvitationRow` (:168-209): actions only while `pending` (:185). The badge prints the raw status
  (:178, 153 chars), so revoked rows read "Expired" (`invitations-panel.tsx:153` says "Revoked"). Revoke success shows a fixed
  `"Revoked!"` (:200; `FormSuccess` :57-60 ignores `state.message`), and the form unmounts once the row leaves pending.
  Toasts use `sonner` (`invite-manager-form.tsx:12,46-54`). Copy link copies `/join/{id}` while pending and under 30 days.
- `resendInvite` (`tenant-invitations.ts:276-328`): select by id and `invited_by` (:294-301), accepted refused (:307-309),
  `resendInvitationEmail` (:311), bump error only logged (:316-323). Manager rows reach plain `inviteUserByEmail`
  (`invite-resend.ts:90-104`), which fails with `email_exists` once the person signed in. `revokeInvite` (:330-379): select
  :348, accepted refused :357-359, `deleteGeneratedInviteUser` :361, `expired` :363-374, `"Invitation revoked."` :378; it never
  touches `property_managers`.
- `resendFromJoinLink` (`join-invite.ts:15-66`) is **unauthenticated** (bearer by invite UUID): limits :21-34, double load
  :36-47, send :49-55, bump :57-64, success :65. `INACTIVE_INVITE_MESSAGE` is `lib/join-invite.ts:1`.

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
(:35-38); both re-exported by `email-templates.ts`. `lib/notifications-switch.ts`: `notificationAllowlist` (:14-18) trims,
lowercases, drops invalid entries; `notificationMode` (:20-33): an allowlist means `test` even with
`DOMUS_NOTIFICATIONS_ENABLED=true`, an invalid one means `off`; `isNotificationRecipientAllowed` (:35-43) trims, lowercases
and matches exactly. Owner-approved branded copy: `docs/sprint237c1-codex-prompt.md:101-103`.

Account scope:
- Owners' `?account=` is stripped in the browser (`dashboard-kpi-loader.ts:273-301`). The archived patch read
  `window.location` and fell back to `accounts[0]`, which broke multi-account owners.
- Both entry points get a server-scoped home list: `OwnerAddMenu` (`dashboard/index.tsx:403-404`; form `owner-add-menu.tsx:92`)
  and `InvitationsSection` (`render-section-cases.tsx:293`; form :127). Items are `PropertyListItem` (`lib/portfolio.ts:10-23`;
  `ownerAccountIsClient` :21, `active` :22).
- `getAdministeredPropertyIds(userId)` (`lib/property-access.ts:192-198`, via `getAdministeredProperties` :84-183): homes whose
  `owner_account_id` is in the user's active `ownership_account_members` rows with `member_role = 'owner'` (:90-96, :108-115),
  plus homes with active `property_managers` rows (:97-101), `active !== false` only (:138, :172). The `owner_profile_id`
  fallback (:21-80) runs only on a missing-schema error. It only calls `createAdminClient().from()`.
  `canUserAdministerProperty` is `includes()` on it (:321-324).
- `getClientStateForProperty` (`lib/client-accounts.ts:27-32`) and `getClientState` (:20-25) throw on error.

### 2.5 The archived attempt: reuse only these parts
`docs/sprint-archive/237c1-invite-flow-round3.patch` (against HEAD):
- `lib/invite-email.ts` transport refactor: one private `sendInviteEmail(to, message)` shared with `sendTenantInviteEmail`
  (:1098-1173). Tenant output stays byte-identical.
- `buildManagerInviteEmail` (:1127-1139), moved to `lib/email/invites.ts` (imports from `./shell`). The try/catch shape of
  `canSendBrandedManagerInvite` (:1117-1125), **changed** to open only in `test` (§6.8).
- `inviteManagerSchema`'s `parseJsonArray` and exactly-one rule (:1182-1200), without `ownershipAccountId`.
- The form's checkbox step (:995-1040), without the `window.location` effect (:976) and the `ownershipAccountId` input (:1037).
- In the action: the `getAdministeredPropertyIds` set check (:609-612) and the existing-manager "missing homes only" upsert
  (:640-699; N counts homes added). The client check (:620-631) becomes one `.in()` read with `{ error }` checked, no try/catch.
- Tests (:1232-1286, :1078-1097, :841-917) are reference only. Rewrite them to §8; do not copy their mocks or `https://test/link`.

Do **not** reuse: the write order; the in-flight `Map` (:528); the retry branch (:712-775); `getOwnershipAccountsForUser`,
`accounts[0]`, `ownershipAccountId` (:588-608); the `ignoreDuplicates`-only re-invite (:776-781);
`invite-resend-manager.test.ts`; the client filter only in `invitations-section.tsx` (:936).

### 2.6 Decisions (Claude; recorded in the handoff)
- **D1** Access is granted at **send** time, as at HEAD. Grant-at-accept needs the LLC token model; not now.
- **D2** A manager profile that never signed in is a pending invitee: re-inviting writes this inviter's rows, grants, and sends
  a link. HEAD sent nothing here, so this is one new send of today's Supabase email. Confirmed managers keep HEAD behavior.
- **D3** Branded email only when `notificationMode() === "test"` and the address is allowlisted. `on` stays generic.
- **D4** No manager path calls `deleteUser` or `deleteGeneratedInviteUser`.
- **D5** Rows turn accepted at sign-in, or by self-heal in Send, Resend, Revoke and the join-page resend.
- **D6** Revoke removes access before it marks the row, and resets the link when no other pending manager row remains. The
  inviter can always revoke their own invite, even after losing the home (removing access is the safe direction).
- **D7** An unconfirmed account **not** created by an invite (`invited_at` null) is refused.
- **D8** The join-page resend never writes grants and never sends a link for a home without an active grant.
- **D9** The branded link is `/auth/confirm?token_hash=…&type=invite` (prefetch-safe; no tokens in the URL). Tenant emails keep
  `action_link`.

## 3. In scope
- Rewrite `inviteManager` (many homes; Auth, then rows and grant, then email). Manager branches in owner Resend, Revoke and
  the join-page resend. Sign-in acceptance of manager rows.
- The branded email and its gate. The home step, both entry points, the "Revoked" badge, the revoke toast. Tests with fakes
  that replay the live trigger.

## 4. Out of scope
- Any SQL, DDL, trigger, policy or grant change. Claude owns the HEAD-shape data backfill and all live checks.
- Changing `handle_new_user` (follow-up L3: convert on email confirmation).
- `inviteOwner` and owner rows, `inviteTenant` and tenant resend/revoke behavior, including their `deleteUser` fallbacks
  (pinned, L-014).
- Grant-at-accept. Join page copy. Accepting rows on dashboard load. Removing a signed-in manager from a home. The
  `revalidatePath("/owner")` snap-back to `accounts[0]` (unverified; Claude's walk checks it).
- Branded email in `on` mode, any other new email type, the notifications switch. `lib/audit.ts` labels, iOS,
  `app/actions/index.ts`, `app/actions/shared.ts`.

## 5. Exact files expected to change
Codex:
1. `apps/web/app/actions/invitations.ts` (imports :3-17 and `inviteManager` :19-192; `inviteOwner` :194-343 byte-identical)
2. `apps/web/lib/manager-invite.ts` (new, `server-only`: §6.1 helpers, `deliverManagerInvite`)
3. `apps/web/lib/manager-invite-rows.ts` (new, `server-only`: `resendManagerInvite`, `revokeManagerInvite`)
4. `apps/web/lib/invite-email.ts` (gate, `sendManagerInviteEmail`, shared private transport)
5. `apps/web/lib/email/invites.ts` (`buildManagerInviteEmail`) and `apps/web/lib/email-templates.ts` (export only)
6. `apps/web/lib/invite-resend.ts` (manager guard only)
7. `apps/web/app/actions/tenant-invitations.ts` (manager branches in `resendInvite` and `revokeInvite`; wider revoke select;
   `inviteTenant` :30-274 byte-identical)
8. `apps/web/app/actions/join-invite.ts` (manager branch only)
9. `apps/web/lib/invitations.ts` (add `markManagerInvitationsAccepted`)
10. `apps/web/app/auth/callback/route.ts` (`trackAuthenticatedUser` only)
11. `apps/web/lib/validations-entity.ts` (`inviteManagerSchema` only)
12. `apps/web/components/dashboard/invitations/invite-manager-form.tsx`
13. `apps/web/components/dashboard/owner-add-menu.tsx` (prop type only)
14. `apps/web/components/dashboard/invitations-section.tsx` (prop type, badge label, revoke toast)
15. Tests (each new file ≤ 500 lines):
    - `apps/web/app/actions/__tests__/fake-invite-db.ts`, `fake-gotrue.ts` (new helpers; not test files)
    - `apps/web/app/actions/__tests__/manager-invite-trigger-model.test.ts` (new, tests 1-13)
    - `apps/web/app/actions/__tests__/manager-invite-guards.test.ts` (new, tests 14-25)
    - `apps/web/app/actions/__tests__/manager-invite-revoke-resend.test.ts` (new, tests 26-37)
    - `apps/web/app/actions/__tests__/invitations.test.ts`, `tenant-invitations.test.ts`, `join-invite.test.ts` (edit)
    - `apps/web/app/auth/__tests__/callback-route.test.ts` (new)
    - `apps/web/lib/__tests__/manager-invite-email.test.ts` (new); `invite-email.test.ts`, `invitations.test.ts` (edit)
    - `apps/web/lib/__tests__/validations.test.ts` (edit only the `inviteManagerSchema` block, :1101-1138)
    - `apps/web/components/__tests__/invite-manager-form.test.tsx` (edit)
    - `apps/web/components/dashboard/__tests__/manager-invite-entry-points.test.tsx` (new)

Claude (not Codex): `supabase/migrations/20261028_sprint237c5_manager_invite_backfill.sql` (data only),
`supabase/rollback/20261028_sprint237c5_rollback.sql`, `supabase/tests/sprint237c5_manager_invite_backfill.sql` (dry run),
`docs/auth-state-machine.md`, `docs/agent-handoff.md`, `docs/claude/reference.md`.

## 6. Implementation requirements

### 6.1 Shared helpers (`lib/manager-invite.ts`, `import "server-only"`)
```ts
export type ManagerInviteRow = { id: string; email: string; full_name: string; status: string;
  property_id: string; invited_profile_id: string | null };
type DbResult = Promise<{ error: unknown | null }>;
managerInviteRedirect(): string        // `${APP}/auth/callback`
managerInviteUrl(hashedToken: string): string // `${APP}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=invite`
managerInviteMetadata(fullName: string) // { role: "manager", full_name: fullName } (HEAD :128-131)
isAuthUserConfirmed(user): boolean     // Boolean(user?.email_confirmed_at || user?.phone_confirmed_at)
isEmailExistsError(error): boolean     // error?.code === "email_exists"
isUserNotFoundError(error): boolean    // error?.code === "user_not_found"
logManagerInvite(tag: string, error: unknown): void
writeManagerRows(p: { email: string; fullName: string; inviterId: string; propertyIds: string[]; profileId: string }): DbResult
grantManagerHomes(profileId: string, propertyIds: string[]): DbResult
markManagerRowsAccepted(p: { inviterId: string; email: string; propertyIds: string[]; profileId: string }): DbResult
releaseManagerHome(p: { email: string; propertyId: string; profileId: string; exceptId?: string })
  : Promise<{ error: unknown | null; released: boolean; otherLive: boolean }>
deliverManagerInvite(p: { email: string; fullName: string; inviterId: string; homeNames: string[];
  inviteLink: string | null }): Promise<"email_branded" | "email_basic" | "already_joined" | "not_sent">
```
- `APP` is `process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"`, read at call time (HEAD :127).
- Helpers log their own tag and return `{ error }`. Only the actions (and `revokeManagerInvite`) map errors to copy.
- `logManagerInvite`: `` console.error(`[manager-invite] ${tag}`, { code: error?.code ?? null, message }) ``, `message` being
  the error message or `String(error)`. Never log an email, a name, a link, a token or FormData.
- `grantManagerHomes`: one `property_managers.upsert(propertyIds.map((id) => ({ property_id: id, manager_profile_id:
  profileId, active: true })), { onConflict: "property_id,manager_profile_id" })`.
- `markManagerRowsAccepted`: `invitations.update({ status: "accepted", accepted_at: now, invited_profile_id: profileId })
  .eq("invited_by", inviterId).eq("email", email).eq("role", "manager").in("property_id", propertyIds)
  .in("status", ["pending", "expired"])`. Call it only when every home in `propertyIds` has an active grant.
- `releaseManagerHome`: `invitations.select("id").eq("role", "manager").eq("email", email).eq("property_id", propertyId)
  .in("status", ["pending", "accepted"])`, plus `.neq("id", exceptId)` when given, `.limit(1)`. Error → `{ error }`. A row →
  `otherLive: true`, no write. None → `property_managers.update({ active: false }).eq("property_id", propertyId)
  .eq("manager_profile_id", profileId)` → `released: !error`.

### 6.2 `inviteManager` (replaces `invitations.ts:19-192`)
"Stop" means return at once; nothing more is written or sent. `{name}` is `fullName || email`.
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
     Try a different email."` Other error → step 7's copy. Confirmed → §6.3, then stop. Unconfirmed, `invited_at` null (D7) →
     log `self_signup_blocked`, `"We can't invite this email right now. Try a different email."` Unconfirmed, `invited_at` set
     → pending invitee: `profileId = profile.id`, `inviteLink = null`, step 10.
   - **8c.** No profile → step 9.
9. New invitee:
   - **9a.** `invitations.select("id").eq("email", email).eq("status", "pending").limit(1)`. Error → step 7's copy. A row → log
     `stale_pending_row`, 8b's D7 copy. The trigger must find nothing pending at the insert.
   - **9b.** `generateLink({ type: "invite", email, options: { data: managerInviteMetadata(fullName), redirectTo:
     managerInviteRedirect() } })`. It inserts `auth.users`; the trigger makes the profile (role manager), converts 0 rows,
     grants nothing; no email. On success, read `profiles.select("role").eq("id", data.user.id).maybeSingle()`. Error, none, or
     not manager (a tenant invite or sign-up made the user first) → log `auth_failed`, 8b's D7 copy, write nothing. Else
     `profileId = data.user.id`, `inviteLink = hashed_token ? managerInviteUrl(hashed_token) : null`.
   - **9c.** Error, or no user id (the insert may have committed): log `auth_failed`, re-read the profile by email. Manager, and
     `getUserById` shows unconfirmed with `invited_at` → continue with that id, `inviteLink = null`. Else → `"Failed to send
     invitation. Please try again."` (HEAD :135).
10. `writeManagerRows` (never downgrades an accepted row; no `auth.users` insert):
    - **(a)** `now = new Date().toISOString()`; `invitations.update({ status: "pending", full_name: fullName, accepted_at: null,
      invited_profile_id: profileId, ownership_account_id: null, created_at: now }).eq("email", email).eq("role", "manager")
      .eq("invited_by", user.id).in("property_id", propertyIds).in("status", ["pending", "expired"]).select("id,
      property_id")`. This re-opens a revoked row (same id) and refreshes `created_at` (the 30-day join window).
    - **(b)** Ids (a) did not return: `invitations.upsert(rows, { onConflict: "email,role,invited_by,property_id",
      ignoreDuplicates: true }).select("id, property_id")`, each row `{ email, full_name, role: "manager", property_id,
      invited_by: user.id, status: "pending", invited_profile_id: profileId, created_at: now }`. Skip when none are missing. A
      home still uncovered has this inviter's **accepted** row; leave it.
    - Error → log `rows_failed`, `"Could not save the invite. Press Send again."` Stop. The user exists unconfirmed, so Send
      again takes the pending-invitee path.
11. `grantManagerHomes(profileId, propertyIds)`. Error → log `grant_failed`, `"Could not add access. Press Send again."` Stop.
12. Re-check (another tab may have revoked): `invitations.select("property_id, status").eq("email", email).eq("role",
    "manager").eq("invited_by", user.id).in("property_id", propertyIds)`. Error → log `rows_failed`, step 10's copy. Each
    `expired` home → `releaseManagerHome({ email, propertyId, profileId })` and drop it. None left → `"This invite was revoked.
    Send a new invite."` Later steps use the kept homes.
13. `deliverManagerInvite({ email, fullName, inviterId: user.id, homeNames, inviteLink })` (§6.4), always last.
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

### 6.4 `deliverManagerInvite` (never throws)
1. If `canSendBrandedManagerInvite(email)` (§6.8):
   - `link = inviteLink`. When null: `generateLink({ type: "invite", email, options: { data: managerInviteMetadata(fullName),
     redirectTo: managerInviteRedirect() } })` (the user exists unconfirmed: no insert, new token). `email_exists` →
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

### 6.6 Resend and join-page resend (`lib/manager-invite-rows.ts`, `import "server-only"`)
`resendManagerInvite(row: ManagerInviteRow, o: { inviterId: string; grant: boolean })` → `{ ok: true; invitedProfileId: string }
| { ok: false; reason: ResendManagerReason }`, reason one of `not_pending`, `already_joined`, `lookup_failed`, `no_access`,
`client_home`, `grant_failed`, `send_failed`.
1. `row.status !== "pending"` → `not_pending`.
2. `profileId = row.invited_profile_id ??` `profiles.select("id, role").eq("email", row.email).maybeSingle()`. Error, none, or
   not manager → `lookup_failed`.
3. `getUserById(profileId)`. Error or none → `lookup_failed`. Confirmed → `update({ status: "accepted", accepted_at:
   user.last_sign_in_at ?? user.email_confirmed_at ?? now, invited_profile_id: profileId }).eq("id", row.id).eq("status",
   "pending")`. Error → `lookup_failed`; else `already_joined`.
4. `properties.select("id, name").eq("id", row.property_id).maybeSingle()`. Error or none → `lookup_failed`.
5. `canUserAdministerProperty(inviterId, row.property_id)` false → `no_access`.
6. `getClientStateForProperty(row.property_id)`: a throw → `lookup_failed`; `managedClient` → `client_home`.
7. Access:
   - `grant: true` (owner Resend): `grantManagerHomes(profileId, [row.property_id])`; error → `grant_failed`. Re-read
     `invitations.select("status").eq("id", row.id).maybeSingle()`; error → `lookup_failed`. Not `pending` (revoked in another
     tab) → `releaseManagerHome({ email: row.email, propertyId: row.property_id, profileId })` (error → log `revoke_failed`),
     then `not_pending`.
   - `grant: false` (join page, D8): `property_managers.select("active").eq("property_id", row.property_id)
     .eq("manager_profile_id", profileId).maybeSingle()`. Error → `lookup_failed`; none or inactive → `no_access`. It never
     writes `property_managers`.
8. `deliverManagerInvite({ email: row.email, fullName: row.full_name, inviterId, homeNames: [home.name], inviteLink: null })`.
   Sent → `{ ok: true, invitedProfileId: profileId }`. `already_joined` → mark the row as in step 3, `already_joined`.
   `not_sent` → `send_failed`.

Owner Resend (`resendInvite`): after :307-309, `if (invitation.role === "manager")` → `resendManagerInvite(invitation, {
inviterId: user.id, grant: true })`:
- `not_pending` → `"This invite was revoked. Send a new invite."`; `already_joined` → `"They already signed in. No email was
  sent."`; `no_access` → `"You no longer manage this home."`; `client_home` → `"This home's managers are set by its client
  account."`; `lookup_failed`, `grant_failed`, `send_failed` → `"Failed to resend invitation."` (HEAD :313).
- `ok` → `update({ created_at: now, invited_profile_id }).eq("id", invitationId).eq("status", "pending")`. Error → `"Email
  sent. The list did not update. Refresh the page."` Else `{ success: true, message: "Invitation resent." }` (HEAD :327).
- Revalidate both paths on `ok` and `already_joined`. All other cases return `{ success: false, error }`.
- Tenant and owner rows keep :311-327 exactly, including the log-only bump error (L-014).

Join-page resend (`resendFromJoinLink`): at :49-55, when `fresh.role === "manager"` → `resendManagerInvite(fresh, { inviterId:
fresh.invited_by, grant: false })`:
- `already_joined` → `"This invite was already used. Sign in instead."`
- `not_pending`, `no_access`, `client_home` → `INACTIVE_INVITE_MESSAGE`.
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
5. Access first, if `profileId`: `releaseManagerHome({ email: row.email, propertyId: row.property_id, profileId, exceptId:
   row.id })`. Error → log `revoke_failed`, `"Could not remove access. Try again."` Keep `released` and `otherLive`.
6. Row: `invitations.update({ status: "expired", accepted_at: null, invited_profile_id: null }).eq("id", row.id)
   .eq("status", "pending").select("id")`.
   - Error → if `released`: run step 8, then `"Access removed. The list did not update. Try again."`; else `"Failed to revoke
     invitation."`
   - Zero rows → re-read the status. `accepted` (signed in meanwhile): if `released`, `grantManagerHomes(profileId,
     [row.property_id])` (error → log `revoke_failed`); revalidate; step 4's signed-in copy. Otherwise `"This invite was
     already revoked."`
7. Close the race, if `profileId`: `releaseManagerHome({ email: row.email, propertyId: row.property_id, profileId })` again (a
   Resend or Send in another tab may have re-granted). Error → log `revoke_failed`; the result does not change.
8. Link reset (D6), only if `unconfirmed`: `invitations.select("id").eq("role", "manager").eq("email", row.email)
   .eq("status", "pending").neq("id", row.id).limit(1)`. None and no error → `generateLink({ type: "invite", email: row.email,
   options: { data: managerInviteMetadata(row.full_name), redirectTo: managerInviteRedirect() } })`: no insert, no email, the
   old link dies. Any error → log `link_reset_failed`; the result does not change. **Never** when `profileId` is null or
   `loginGone`: it would insert `auth.users` and fire the trigger.
9. ```ts
   void logAudit({ userId, action: "revoke_manager_invite", entityType: "invitation", entityId: row.id,
     metadata: { propertyId: row.property_id, managerProfileId: profileId, accessRemoved: released, linkReset } })
     .catch(sideEffectError("revokeInvite", "log_audit", { userId, entityType: "invitation", entityId: row.id }));
   ```
10. Revalidate both paths. `{ success: true, message: "Invitation revoked." }`, or `"Invitation revoked. Another invite still
    gives them this home."` when `otherLive`. Every other return is `{ success: false, error }`.

Undo (L-016). A Send writes: (1) for a new invitee, an Auth user and its `profiles` row (role manager); (2) one pending row per
home; (3) one active grant per home; (4) a live link. Revoke undoes one home: its grant (step 5) and its row (step 6). It kills
the link (step 8) only when no other pending manager row remains for the email, so an N-home Send needs N Revokes and the link
works until the last. (1) is never undone (D4): the email stays a manager profile, so later tenant or owner invites to it are
refused with today's copy (`tenant-invitations.ts:157`, `invitations.ts:239-244`), as at HEAD. Re-invite ("do again") re-opens
the same row id, re-grants and sends a new link.

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
- `propertyId`: optional uuid, `"Invalid property selection."` (legacy single-home form, one release).
- `propertyIds`: optional `z.preprocess(parseJsonArray, z.array(z.string().uuid("Invalid property selection.")).min(1, "Pick
  at least one home.").max(100, "Pick up to 100 homes."))`.
- Exactly one of the two, else `"Pick at least one home."` Output `{ email, fullName, propertyIds }`, ids deduped in first-seen
  order. No `ownershipAccountId` key (zod strips it).

### 6.10 Form and entry points
`invite-manager-form.tsx`:
- Props: `properties: Array<{ id: string; name: string; ownerAccountIsClient?: boolean; active?: boolean }>`. Eligible:
  `ownerAccountIsClient !== true && active !== false`, filtered in the form so both entry points get it.
- Step 1 keeps the pill `Home` (:14). Text `Step 1: Pick homes.` A checkbox `All my homes` (checked when every eligible home is
  picked; toggles all), then one checkbox per eligible home, labelled with its name, each row `min-h-11`.
- One eligible home and nothing picked → it is picked. Picks no longer eligible are dropped. No eligible homes → `No homes here
  can get a manager.` and Next stays disabled.
- Review: `Homes:` and the picked names, comma-separated, in list order.
- Hidden inputs `propertyIds` (`JSON.stringify(pickedIds)`), `email`, `fullName`. No `ownershipAccountId`; never read
  `window.location`. Success handling stays (:46-54); on an error the draft stays, so Send works again.

`owner-add-menu.tsx`: widen the `properties` type at :16. No logic change.

`invitations-section.tsx`:
- Widen the `properties` type at :32. The tenant form keeps every home.
- Badge (:178): `Revoked` for `expired`, as `invitations-panel.tsx:153`; wrap the line. It applies to every role.
- In `InvitationRow`, replace the revoke `FormSuccess` (:200) with a toast: when `revokeState` becomes a new success, call
  `toast.success(revokeState.message ?? "Invitation revoked.")` once (the `handledRef` pattern, `invite-manager-form.tsx:46-54`).
  Visible strings (L-020): `Invitation revoked.` (every role; HEAD :378) and `Invitation revoked. Another invite still gives
  them this home.` Resend (:191) keeps `Resent!`. Other row actions do not change.

### 6.11 Logging, errors, safety
- Every Supabase call's `{ error }` is read (L-002). No path returns success for work it did not do.
- Log tags (`[manager-invite]`, `{ code, message }` only): `auth_failed`, `rows_failed`, `grant_failed`, `send_failed`,
  `inviter_lookup_failed`, `stale_pending_row`, `self_signup_blocked`, `accept_failed`, `revoke_failed`, `link_reset_failed`.
- L-028: the forms keep `useFormState`; add no client `try/catch` around `inviteManager`, `resendInvite` or `revokeInvite`. A
  new `catch` in `app/actions/*.ts` starts with `unstable_rethrow(error)`. No new `catch` wraps `requireAuth` (it calls
  `redirect()`). Lib helpers and the route use the catch shapes given above.
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
  apps/web/app/actions/__tests__/{manager-invite-guards.test.ts,manager-invite-revoke-resend.test.ts} \
  apps/web/app/auth/__tests__/callback-route.test.ts apps/web/lib/__tests__/manager-invite-email.test.ts \
  apps/web/components/dashboard/__tests__/manager-invite-entry-points.test.tsx
(cd apps/web && npx vitest run app/actions/__tests__/manager-invite-trigger-model.test.ts \
  app/actions/__tests__/manager-invite-guards.test.ts app/actions/__tests__/manager-invite-revoke-resend.test.ts \
  app/actions/__tests__/invitations.test.ts app/actions/__tests__/tenant-invitations.test.ts \
  app/actions/__tests__/join-invite.test.ts app/auth/__tests__/callback-route.test.ts \
  lib/__tests__/manager-invite-email.test.ts lib/__tests__/invite-email.test.ts lib/__tests__/invitations.test.ts \
  lib/__tests__/validations.test.ts components/__tests__/invite-manager-form.test.tsx \
  components/dashboard/__tests__ "app/join/[inviteId]/__tests__" lib/__tests__/plain-language.test.ts)
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
- The three `manager-invite-*.test.ts` files mock **only** `@/app/actions/auth-helpers` (`requireAuth`), `@/lib/supabase/admin`
  (the fake), `@/lib/audit`, `next/cache`, `next/headers`, `server-only` and global `fetch`. Everything else is real,
  including validations, `checkRateLimit` (`resetRateLimitState()` in `beforeEach`), the notifications switch (`vi.stubEnv`),
  `invite-email`, the templates, `client-accounts`, `property-access` (against the fake), `manager-invite*`, `invite-resend`.
- They stub `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in every test, so a gate leak would reach `fetch`.
- Clock: `vi.useFakeTimers({ toFake: ["Date"] })` in `beforeEach`, `vi.setSystemTime(t0 + n * 60_000)` before each action,
  `vi.useRealTimers()` in `afterEach`. Assert `created_at` equals the time set.
- Seed only through the fakes' builder or Auth API, never their arrays. Besides fixtures (homes, accounts, members, inviter
  profiles and their grants), the only seeds are the live legacy shape (test 15) and a pending row written before Auth (tests
  2, 19). Every other state comes from the code's own operations.

**`fake-invite-db.ts`:**
- Tables: `profiles` (PK id, UNIQUE email); `invitations` (UNIQUE NULLS NOT DISTINCT `(email, role, invited_by, property_id)`,
  status check); `property_managers` (PK `(property_id, manager_profile_id)`); `properties` (`id, name, owner_account_id,
  active`); `ownership_accounts` (`id, managed_client, claim_state`); `ownership_account_members` (`account_id, profile_id,
  member_role, active`).
- Builder: `select`, `eq`, `neq`, `in`, `limit`, `maybeSingle`, `single`, `insert`, `upsert` (`onConflict`,
  `ignoreDuplicates`), `update`, `.select()` after a write; thenable, so `Promise.all` works.
- Rules: a DO UPDATE upsert hitting one key twice fails with `code: "21000"`; with `ignoreDuplicates` the later row is skipped.
  A `property_managers` write on a `managed_client` home, or a manager/owner `invitations` write on an unclaimed one, fails
  with `code: "42501"`.
- Hooks: `failNext(table, op)` and `failAuth(method)` are one-shot. `beforeOp(op, fn)` / `afterOp(op, fn)` run async `fn` once,
  before or after the next matching operation commits, before that call resolves.
- Op log in order (`db:<table>:<op>`). Error messages copy Postgres wording and never contain an email, link or token.

**`fake-gotrue.ts`** (Auth, as §2.2):
- Exports `HANDLE_NEW_USER_SQL` (the §2.1 body verbatim) and `runHandleNewUser`, a step-for-step copy that logs
  `trigger.converted:<n>` and `trigger.granted:<n>`. If it fails, the insert rolls back and the call returns `{ code:
  "unexpected_failure", status: 500, message: "Database error saving new user" }`.
- Users carry `email_confirmed_at`, `last_sign_in_at`, `invited_at`, `user_metadata` and a current token `tok:<userId>:<n>`.
- `generateLink` invite and `inviteUserByEmail`: new email → `auth.insert` (`invited_at` set, unconfirmed), then the trigger;
  existing unconfirmed → `auth.rotate`; confirmed → `{ code: "email_exists", status: 422 }`. `generateLink` returns
  `properties: { action_link: "fake-link:" + token, hashed_token: token }` and records no email. `inviteUserByEmail` records
  `{ to, token }` (`auth.email`). `getUserById` miss → `{ code: "user_not_found", status: 404 }`. `deleteUser` is recorded only.
- `commitThenError`: `generateLink` inserts and runs the trigger, then errors. `selfSignUp(email, role)`: insert with
  `invited_at` null, then the trigger. `dropAuthUser(id)` (test helper, not GoTrue): removes the user, keeps the profile and
  grants. `clickLink(token)`: only the current token works; sets `email_confirmed_at` and `last_sign_in_at`; no insert.

**`manager-invite-trigger-model.test.ts`:**
1. "fake trigger matches the live definition". Scan `path.resolve(__dirname, "../../../../../supabase/migrations")` for `*.sql`
   with `create or replace function public.handle_new_user` (any case). The last match in full-filename sort is
   `20260228_phase9_llc_and_shared_operator_access.sql`; its whitespace-normalized body equals `HANDLE_NEW_USER_SQL`.
2. "control: rows written before an Auth insert are auto-accepted (L-029)". Seed a pending manager row, then the fake's
   `generateLink`: row accepted, grant active, `trigger.converted:1`.
3. "new manager, 2 homes: rows stay pending". 1 unconfirmed user with `invited_at`; 2 `pending` rows with `invited_profile_id`
   = the new id; 2 active grants; `trigger.converted:0`. Op order: `auth.insert` < invitations write < `property_managers`
   upsert < `auth.email`. Exact success copy.
4. "non-allowlisted gets today's Supabase invite". In `off`, `test` with the address unlisted, and `on`: `inviteUserByEmail`
   once with `(email, { redirectTo: "https://app.example.com/auth/callback", data: { role: "manager", full_name } })`; no `fetch`.
5. "allowlisted gets one branded email". `test`; the listed address typed with other case and spaces. One `fetch` to
   `https://api.resend.com/emails`, `to: [email]`. The HTML has `https://app.example.com/auth/confirm?token_hash=` with the
   current token and `type=invite`, never `fake-link:`, and the escaped home names. No `inviteUserByEmail`.
6. "branded failure falls back without a second user". Resend returns 500: `inviteUserByEmail` once; 1 user; rows pending;
   success copy; no `deleteUser`.
7. "both sends fail". `"Access added. The email did not send. Press Send again."`; rows pending; grants active. Send again → 1
   email, the new `created_at`. `resendInvite` also sends 1 email.
8. "rows write fails". `failNext("invitations", "update")` → `"Could not save the invite. Press Send again."`; 1 unconfirmed
   user, 0 rows, 0 grants, 0 emails. Send again → still 1 user, rows pending, 1 email.
9. "grant fails". `failNext("property_managers", "upsert")` → `"Could not add access. Press Send again."`, 0 emails. Resend →
   the grant is active before `auth.email`.
10. "Send again for a pending invitee does not duplicate". 1 user, the same 2 row ids, new `created_at`, 1 more email; the old
    token fails `clickLink`.
11. "do → undo → do again (L-016)". Invite one home; Revoke: grant inactive, row `expired`, no `deleteUser`, old token fails
    `clickLink`. Re-invite: same row id `pending`, new `created_at`, `invited_profile_id` set, grant active, 1 new email.
    `clickLink(new)` + `markManagerInvitationsAccepted` → `accepted`.
12. "one inviter, two homes". Revoke h1 → h1 grant inactive, h1 `expired`; h2 `pending`, grant active; no `auth.rotate` (the
    link still works). Revoke h2 → `auth.rotate`; the old token fails `clickLink`.
13. "sign-in accepts only P's manager rows". P's pending rows from inviters A and B both turn `accepted`; Q's row stays
    `pending`. (Test 44 proves the `role = manager` filter.)

**`manager-invite-guards.test.ts`:**
14. "existing signed-in manager". (a) 1 of 3 homes active: one upsert of 2 homes; no invitations insert, no Auth write, no email;
    audit `addedPropertyIds` = the 2 ids; `"Added Alex Manager to 2 homes. They'll see them next time they sign in."`; and the
    four other §6.3 messages. (b) Invite, Revoke, the person signs in through another inviter's link, re-add from the form:
    the same row id reads `accepted`.
15. "live legacy row heals" (seeded), no email in any case: (a) re-add from the form → accepted; (b) Resend → `"They already
    signed in. No email was sent."`, accepted; (c) Revoke → `"They already signed in. This invite can't be revoked."`, grant
    active; (d) join-page resend → `"This invite was already used. Sign in instead."`
16. "other-role email refused before any Auth call or write".
17. "orphan manager profile refused". `generateLink` for a new email, then `dropAuthUser`. Invite → `"Could not find this
    person's account. Try a different email."`; no writes; no `auth.insert`.
18. "self sign-up refused (D7)". `selfSignUp(email, "manager")` → `"We can't invite this email right now. Try a different
    email."`; 0 rows, 0 grants, 0 emails.
19. "stale pending row blocks the Auth call". Seeded pending row for an unknown email → no `generateLink`; the same copy.
20. "client home refused before any write". One of 2 homes `managed_client` → exact copy, zero writes, zero Auth calls.
21. "account scope". An owner with homes in accounts A and B: B's homes posted with `ownershipAccountId` = A succeed (ignored).
    Another owner's home → `"Property not found."`, zero writes.
22. "a manager invites a co-manager". `requireAuth` role manager; homes from active `property_managers`; rows carry
    `invited_by` = that manager.
23. "rate limit counts once per multi-home submit". 10 submits of 3 homes pass; the 11th gives the exact copy, zero writes.
24. "generateLink commits, then errors" (`commitThenError`) → continues as a pending invitee: 1 user, rows pending, grants, 1
    email.
25. "generateLink returns a non-manager user". `beforeOp("auth.generateLink", …)` runs `selfSignUp(email, "tenant")`. Result:
    the 9a copy; 0 rows, 0 grants, 0 emails.

**`manager-invite-revoke-resend.test.ts`:**
26. "two inviters, one person". Both rows pending; one sign-in accepts both. Revoke by A while B's row is live keeps the grant:
    `"Invitation revoked. Another invite still gives them this home."`; no link reset.
27. "revoke after the invitee signed in". `clickLink` only (row still pending). Revoke → `"They already signed in. This invite
    can't be revoked."`; row `accepted`; grant active.
28. "revoke vs sign-in". `afterOp("db:property_managers:update", …)` runs `clickLink` and `markManagerInvitationsAccepted`. The
    row update hits 0 rows; the grant is re-activated; test 27's copy.
29. "revoke vs resend". (a) `afterOp("db:property_managers:upsert", …)` during Resend runs a full Revoke: Resend returns `"This
    invite was revoked. Send a new invite."`; row `expired`; grant inactive; 0 emails. (b) `afterOp("db:property_managers:
    update", …)` during Revoke runs a full Resend: row `expired`, grant inactive, the emailed token fails `clickLink`.
30. "accepted row is never downgraded". Invite h1, then `markManagerInvitationsAccepted(P)` without `clickLink`. Re-invite h1
    and h2: h1 stays `accepted` (same id); h2 is `pending`.
31. "resend of a revoked row does not re-grant": `"This invite was revoked. Send a new invite."`; grant stays inactive.
32. "join-page resend never grants or sends without access". (a) Revoke with `failNext("invitations", "update")` → `"Access
    removed. The list did not update. Try again."`; row pending; grant inactive; the old token fails `clickLink`. (b) Send with
    `failNext("property_managers", "upsert")`. In both, join resend → `INACTIVE_INVITE_MESSAGE`, 0 Auth calls, 0 emails, 0
    `property_managers` writes. (c) Active grant: allowlisted → branded, unlisted → generic; 0 `property_managers` writes.
33. "join-page resend, already signed in" → row accepted; nothing sent.
34. "revoke when the login is gone". Invite, then `dropAuthUser(P)`. Revoke → `"Invitation revoked."`; row `expired`; grant
    inactive; no `generateLink`; no `auth.insert`.
35. "an inviter who lost the home can still revoke". A manager invites a co-manager, then loses the home (fixture update).
    Revoke → `"Invitation revoked."`; the co-manager's grant is inactive.
36. "manager rows never reach the plain resend": `resendInvitationEmail(managerRow)` → `{ ok: false }`, zero Auth calls.
37. "logs carry no email, link or token". Re-create the failure states of tests 7, 8, 9, 32 and 34 with a `console.error` spy.
    No argument contains the email, `fake-link:` or `tok:`.

**Pins and unit tests:**
38. `invitations.test.ts`, `inviteOwner` pinned (L-014): :59-83 stay. Add: new email → `inviteUserByEmail` with `{ role:
    "owner", full_name, ownership_account_id }` **before** the owner row insert (`invocationCallOrder`); an insert error is only
    logged, still `{ success: true }`; existing owner → membership upsert; duplicate pending → `"An owner invitation is
    already pending for this account."`; `requireAuth("owner", "manager")`.
39. `invitations.test.ts`, `inviteManager` guards (rewrite :85-141). Add `vi.mock("server-only", () => ({}))`; the
    `@/lib/property-access` mock also exports `getAdministeredPropertyIds`. Rate-limited → no `from`, no Auth call;
    `requireAuth` rejects → no rate-limit call; client-home refusals with exact copy.
40. `tenant-invitations.test.ts`, tenant pins: :71-98, :111-131, :133-176 unchanged; the `it.each` at :100 keeps `owner` and its
    `manager` case asserts routing to `resendManagerInvite`; :177 uses an `owner` row; a tenant bump error is only logged
    (`"Invitation resent."`); tenant revoke still calls `deleteGeneratedInviteUser`.
41. `tenant-invitations.test.ts`, manager branches (`@/lib/manager-invite-rows` mocked): each `reason` → exact §6.6 copy; the
    manager bump has `.eq("status", "pending")` and its error is returned; `revokeInvite` passes the widened row and never calls
    `deleteGeneratedInviteUser`.
42. `join-invite.test.ts` (mock `@/lib/manager-invite-rows`): existing cases green; manager row → `resendManagerInvite(fresh, {
    inviterId: fresh.invited_by, grant: false })`; each reason → its §6.6 join copy; tenant rows still use
    `resendInvitationEmail` and their unfiltered bump.
43. `callback-route.test.ts` (first line `// @vitest-environment node`): `markManagerInvitationsAccepted(user.id)` once on the
    code, token_hash invite, token_hash magiclink and setSession branches; `markTenantInvitationAccepted` only when
    `hasInvitedSession`; a rejection keeps the `resolveAuthRoute` redirect; the PKCE miss does not call it.
44. `lib/__tests__/invitations.test.ts`: `markManagerInvitationsAccepted` filters `role = manager`, `invited_profile_id` and
    `status = pending`; an error is logged, a throw swallowed. `markTenantInvitationAccepted` unchanged.
45. `manager-invite-email.test.ts`, gate truth table on the **real** switch (`vi.stubEnv` of `DOMUS_NOTIFICATIONS_ALLOWLIST` and
    `DOMUS_NOTIFICATIONS_ENABLED`): `off`; `on`; `" Listed@Example.com "` with allowlist `listed@example.com` → `true`;
    unlisted → `false`; allowlist `not-an-email` → `false`. A throwing switch, in its own `describe`
    (`vi.doMock("@/lib/notifications-switch")` and a fresh `await import`) → `false`. Only test+listed is `true`.
46. Builder (from `@/lib/email-templates`, `inviteUrl: "fake-link:u1:1"`): exact subject, title, body, button, footer; one home
    names it, two say `2 homes`; `<script>` in the inviter and home names is escaped once in the HTML (no `&amp;lt;`); the
    subject is raw; the text part is present; every copy sentence has ≤ 12 words as `scan.ts` counts (each `${…}` is one
    word), with fixtures `Ace` and `Oak Home`.
47. Sender: no `fetch` when the gate is closed or `RESEND_*` is missing; one `fetch` when open; `false` on non-OK and on a throw.
48. `invite-email.test.ts`: existing tenant tests unchanged and green; the tenant payload (`to`, `subject`, `html`, `text`) is
    identical through the shared transport.
49. `validations.test.ts`, `inviteManagerSchema` block only: `" A@B.COM "` → `"a@b.com"`; `JSON.stringify([id1, id1, id2])` →
    `[id1, id2]`; legacy `propertyId` → `[propertyId]`; neither, both or `[]` → `"Pick at least one home."`; 101 ids → `"Pick up
    to 100 homes."`; not JSON or a non-UUID → rejected; no `ownershipAccountId` in the output.
50. `invite-manager-form.test.tsx`: rewrite :14-20 (the `All my homes` checkbox and pills `Home`, `Email`, `Name`, `Send`) and
    :34-44 (pick the home by checkbox; Next hidden on the final step); keep :22-32. Add: "All my homes" checks and clears every
    eligible home; hidden `propertyIds` = `JSON.stringify(picked)` for one and for all; client and inactive homes never shown
    or posted; with `?account=x` in `window.location`, no `ownershipAccountId` input; one eligible home is preselected; zero
    eligible → `No homes here can get a manager.`, Next disabled; the review lists the names; the draft stays on an error and
    resets on success.
51. `manager-invite-entry-points.test.tsx`: `OwnerAddMenu` (owner → "Add a manager") and `InvitationsSection` ("Send
    Invitation" → "Manager Invite") hide client and inactive homes; the tenant form lists every home. A pending row shows
    Resend, Copy link and Revoke; an accepted row none; an `expired` row (manager or tenant) reads `Revoked`. A Revoke that
    returns `"Invitation revoked. Another invite still gives them this home."` calls `toast.success` once with that text.
52. Full suite, `tsc`, lint and `lib/__tests__/plain-language.test.ts` are green.

**Mutation proofs (in the report; revert each):** M1 write rows before `generateLink` → test 3 fails. M2 pass `grant: true`
from the join page → test 32. M3 open the gate in `on` → tests 4 and 45. M4 make §6.2 step 10 a plain DO UPDATE upsert → test
30. M5a call `deleteGeneratedInviteUser(profileId)` in `revokeManagerInvite` → test 11; M5b in `revokeInvite`'s manager branch
→ test 41. M6 send the email before the grant → test 3's op order. M7 drop §6.7 step 7 → test 29(b).

**Claude only (not Codex):**
- C1 Before dispatch. Read the live Supabase invite template (subject, body, link form) and the Vercel Production
  `DOMUS_NOTIFICATIONS_ALLOWLIST` / `DOMUS_NOTIFICATIONS_ENABLED`; record what non-allowlisted people get and the gate branch.
  Auth probe on a never-used smoke-inbox plus-address X0 (SQL first: no `auth.users`, no `profiles`): (a) `generateLink`
  invite → 1 user, profile role manager, no email, auth log `/admin/generate_link`; (b) right after, `inviteUserByEmail` → no
  error, exactly 1 email, still 1 user, (a)'s link fails; (c) `generateLink` again → (b)'s link fails, and
  `/auth/confirm?token_hash=<hashed_token>&type=invite` signs in through the callback; (d) `generateLink` invite on a
  confirmed smoke account → `email_exists`, 422, no email; (e) `getUserById(random UUID)` → `user_not_found`. X0 stays (D4);
  record it as used. If (b) or (c) fails, stop and change §6.2 step 9 / §6.4 first.
- C2 Before ship. md5 of `handle_new_user` still `2c51636368d7ef759fd151508e904240` (L-012). Rolled-back proof (an email with
  no user and no profile, a non-client smoke home, `invited_by` = the smoke owner): BEGIN; pending manager row, then an
  `auth.users` insert with manager metadata → row accepted, grant active; a second new email inserted into `auth.users`
  first, then its pending row → row pending, no `property_managers` row; ROLLBACK. Attacker SQL as `authenticated`: INSERT and
  UPDATE on `invitations` and `property_managers` are denied (L-021).
- C3 Walk (test accounts, magic-link sign-in). Setup: never-used plus-addresses X1 and X2 (SQL: no user, no profile); add only
  X1 to Production `DOMUS_NOTIFICATIONS_ALLOWLIST`, redeploy, re-read; give the smoke owner a second account B with one home
  through the app; call no `generateLink` magiclink/signup for X1 or X2. Then: on account B, invite X1 to "All my homes" → N
  Pending rows with Resend, Copy link, Revoke, and one branded email whose link opens `/auth/confirm`, then the callback;
  invite X2 → the generic invite; revoke one home (access gone, toast shown, old link dead), re-invite it (Pending), open the
  link (rows Accepted). The page stays on account B. Light and dark screenshots of the form and list (L-009, L-022). Record
  X0-X2 as used in `docs/claude/reference.md`.
- C4 After deploy (HEAD writes HEAD-shape rows until then): re-count, then backfill manager rows with `invited_profile_id`
  null: (1) pending rows get the profile with `lower(p.email) = lower(i.email)` and `p.role = 'manager'`; (2) pending manager
  rows whose user has `email_confirmed_at` become accepted, `accepted_at = coalesce(u.last_sign_in_at,
  u.email_confirmed_at)`. Today: 1 row. The dry run lists any pending manager row still without `invited_profile_id`. After
  ChatGPT APPROVE, a rolled-back dry run and the rollback file.
- C5 `/ship` checks: expired manager rows whose email still has an active grant on that home with no other live row; accepted
  manager rows with no active grant on that home. Review each hit.
- C6 Handoff: D1-D9, the D2 send occasion, and follow-ups: convert manager and owner rows on email confirmation (L3, diffed
  against the live body); the tenant `deleteUser` fallbacks; `inviteOwner` rows that never convert; the branded email at
  launch; a revoked, never-signed-in manager email cannot become a tenant or owner. Deleted accounts need nothing new: runbook
  step C2 (`docs/runbooks/account-deletion.md:304-307`) expires pending rows by `invited_profile_id`; HEAD-shape rows are C4.

## 9. Report format
Compact status only: files changed with line counts, the test for each criterion (1-52), `grep -c "it("` per new test file,
mutation results M1-M7, command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies. No SQL from Codex.
- `inviteOwner` and `inviteTenant` stay byte-identical. Tenant and owner resend and revoke keep their behavior; they see only
  the wider revoke select, the `Revoked` badge and the revoke toast.
- Never call an Auth API that inserts `auth.users` after writing a pending row for that email (L-029).
- No `deleteUser` or `deleteGeneratedInviteUser` in any manager path.
- No in-memory dedupe, no `window.location`, no `accounts[0]`, no `ownershipAccountId`.
- No `fetch` outside `sendInviteEmail`. No other new email type.
- Exact copy only. Invent no strings, URLs or emails. Fixtures use `@example.com`.
- Size, line-length and catch rules as §6.11.
- If anything in the live schema or GoTrue behavior blocks you, stop and report. Do not work around it.

## Critic log (rev 1 → rev 2)
Each item was checked against HEAD `240667d`, the archived patch, auth-js 2.68.0 types and read-only SQL on the live project.

Serious:
- S1 code-facts, property-access cited at the legacy fallback — ADOPTED: §2.4 cites :84-183; tests run it against the fake.
- S2 code-facts, `validations.test.ts` is 2435 lines — ADOPTED: §6.11 exemption; §5 limits the edit to :1101-1138.
- S3 code-facts, one test file and one helper exceed 500 lines — ADOPTED: two helpers, three test files (§5, §8).
- S4 code-facts, revoke success copy never shown (`"Revoked!"` at :200) — ADOPTED: a toast in `InvitationRow` (§6.10, test 51).
- S5 code-facts, §2 lacks line counts — ADOPTED: `wc -l` counts in §2.4.
- S6 code-facts, reused email test mocks the switch, old import, URL fixture — ADOPTED: rewrite on the real switch (tests 45-46).
- S7 db-auth, generateLink + immediate inviteUserByEmail unproven until after deploy — ADOPTED: C1 probe before dispatch.
- S8 db-auth, C3 walk cannot run as written — ADOPTED: C3 setup; handoff:861 shows the smoke owner has 1 account.
- S9 db-auth, HEAD-shape rows written before deploy never accept — ADOPTED: C4 backfills every null-profile manager row.
- S10 db-auth, branded link uses `action_link` — ADOPTED: D9 `/auth/confirm` link; `hashed_token` in types.d.ts:666; C1(c).
- S11 lessons, revoke message invisible (L-020) — ADOPTED: merged into S4 (toast, since the row's form unmounts).
- S12 lessons, test file size — ADOPTED: merged into S3.
- S13 lessons, size rules conflict with §5 files — ADOPTED: §6.11 rule rewritten; badge line (153 chars) wrapped.
- S14 lessons, seeds the fake cannot build — ADOPTED: `dropAuthUser` helper (keeps `deleteUser` checks clean) plus the
  `invitations_guard_client` rule (live definition read).
- S15 lessons, archived email test tests the mock — ADOPTED: merged into S6.
- S16 lessons, undo omits writes and N-home revokes — ADOPTED: §6.7 Undo lists four writes; test 12.
- S17 lessons, join resend sends a link for a half-revoke — ADOPTED: §6.6 step 7; copy is `INACTIVE_INVITE_MESSAGE`.
- S18 lessons, "Please tell us." is a dead end — ADOPTED: "Try a different email." (no "tell us" anywhere in app code).
- S19 attacker, no-grant join resend and revoke step-8 failure leave live links — ADOPTED: §6.6 step 7, §6.7 steps 6 and 8, test 32.
- S20 attacker, revoke vs resend race — ADOPTED (simplified): `releaseManagerHome`, re-checks in §6.2 step 12, §6.6 step 7 and
  §6.7 step 7, bump status filter, test 29, M7.
- S21 attacker, revoke impossible when the login is gone — ADOPTED: §6.7 step 4, test 34. Its "9a then unblocks re-invite" claim
  is wrong (8b refuses orphans) and was dropped.
- S22 implementability, split into 5a/5b — REJECTED: the server core and fakes are most of the work; 5b alone is small; L-014
  favors one precise run; C1 now proves GoTrue before dispatch, removing the redesign risk.
- S23 implementability, property-access mock contract — ADOPTED: not mocked; it runs against the fake.
- S24 implementability, 500-line rule — ADOPTED: merged into S13.
- S25 implementability, `created_at` flakes — ADOPTED: fake Date timers in the test rules.
- S26 implementability, fake API gaps — ADOPTED: hooks, token records, one-shot failures, trigger log, UUIDs, safe messages.
- S27 implementability, seed rule contradicts tests — ADOPTED: seeds limited to tests 2, 15, 19; tests 13 and 30 rebuilt.
- S28 implementability, M5 cannot fail test 36 — ADOPTED: M5a/M5b.
- S29 implementability, archived email test cannot be copied — ADOPTED: merged into S6.
- S30 implementability, helper signatures undefined — ADOPTED: §6.1 type block.
- S31 implementability, GoTrue proofs too late — ADOPTED: merged into S7.

Nits:
- N1 code-facts, guard goes above :24 — ADOPTED.
- N2 code-facts, `ActionState` excess properties — ADOPTED: `const result` rule (§6.2 step 14).
- N3 code-facts, form tests :14-20 and :34-44 break — ADOPTED: test 50.
- N4 code-facts, repo-root path depth — ADOPTED: five levels (test 1).
- N5 code-facts, zod 4 needs real UUIDs — ADOPTED.
- N6 code-facts, test 4 passes without `RESEND_*` — ADOPTED: stubbed in every model test.
- N7 code-facts, "only sendInviteEmail calls fetch" is false (admin.ts:14-19) — ADOPTED: reworded.
- N8 code-facts, M5 placement — ADOPTED: merged into S28.
- N9 code-facts, `invitations.test.ts` mocks — ADOPTED: test 39.
- N10 code-facts, `already_joined` paths skip revalidate — ADOPTED: §6.6, §6.7 step 4.
- N11 db-auth, §2.2 live indexes and "Confirmed" — ADOPTED: pg_indexes read; 0 phone-only users.
- N12 db-auth, fake fidelity (21000, error shape, guard, newest file) — ADOPTED.
- N13 db-auth, C2 preconditions and the new-order half — ADOPTED.
- N14 db-auth, sign-in coverage claim — ADOPTED: §2.4 sign-in paragraph.
- N15 db-auth, revoke `user_not_found` — ADOPTED: merged into S21.
- N16 db-auth, runbook already expires rows; orphan profiles — ADOPTED: account-deletion.md:304-307; 11 orphans live.
- N17 lessons, "Use Resend in Invitations" and "Homes added" copy — ADOPTED: "Press Send again" (menu says "Invites").
- N18 lessons, L-028 misstated — ADOPTED: §6.11.
- N19 lessons, `inviteTenant` pin and all-role badge — ADOPTED: §5 item 7, §6.10, §10, test 51.
- N20 lessons, imports :5 and :7 go unused — ADOPTED: §5 item 1 covers imports.
- N21 lessons, line counts — ADOPTED: merged into S5.
- N22 lessons, test 12 half cannot fail — ADOPTED: test 13 rewritten; test 44 proves the role filter.
- N23 lessons, test 1 never checks the fake — ADOPTED: `HANDLE_NEW_USER_SQL` equality.
- N24 lessons, tests 41/45 and M5 vague — ADOPTED: tests 46, 50, M5a/M5b.
- N25 lessons, Revoke refused after the inviter loses the home — ADOPTED: check dropped (D6), test 35.
- N26 attacker, 9b can return a tenant user — ADOPTED: role re-read after 9b, test 25.
- N27 attacker, re-add after revoke still reads "Revoked" — ADOPTED: `markManagerRowsAccepted` includes `expired`; test 14(b).
- N28 attacker, D2 adds a send occasion — ADOPTED: D2, §6.8, C6.
- N29 attacker, "Refresh the page" cannot fix the list — ADOPTED: "Press Send again", `success: false`.
- N30 attacker, undo omits the lasting manager profile — ADOPTED: merged into S16.
- N31 implementability, form tests — ADOPTED: merged into N3.
- N32 implementability, §7 `cd` chain and missing files — ADOPTED: subshells and `ls` (`lint:web` exists only at the root).
- N33 implementability, mocks for edited tests — ADOPTED: tests 39, 42, 43.
- N34 implementability, `ActionState` and `"use server"` exports — ADOPTED: §6.11.
- N35 implementability, double escaping (shell.ts:38) — ADOPTED: §6.8.
- N36 implementability, catch scope — ADOPTED: §6.11 L-028 line.
- N37 implementability, revoke profile role check — ADOPTED: §6.7 step 3.
- N38 implementability, test 23 setup — ADOPTED: test 27.
- N39 implementability, test 8 op name; empty account ids — ADOPTED: test 8, §6.2 step 6.
- N40 implementability, invariant contradicted — ADOPTED: §1.
- N41 implementability, line counts — ADOPTED: merged into S5.
