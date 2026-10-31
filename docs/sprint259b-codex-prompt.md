# Sprint 259b — Close the LLC invitation-token exposure, make joining single-use, lift the 259a invite hold (L3) — rev 7 (rev 1 AWC → rev 2; rev 3 AWC → rev 4 AWC → rev 5 AWC → rev 6 AWC → rev 7)

Codex: `gpt-6.1-sol` · high (L3: auth tokens, consent gating, an atomic join; 6.1-sol trial 3 of 3). ChatGPT review:
GPT-6 · High (top thinking) — rev 1, 3, 4, 5 and 6 APPROVE WITH CHANGES; every REQUIRED item adopted below (review
complete).
Claude: Opus 5.5 · Max. Runs after Sprint 259a is committed (it removes 259a's hold); ships after 259a is live.

**Rev 2 changes (every rev 1 REQUIRED item):** release gate (migration and live D1 before any code deploy); join-flow
audit with negative tests (R4, T7–T12); canary serialization tests (T2, T13); admin client reads no cookies, and
send/resend/cancel check the caller can manage that account (T14); order migration → D1 → code → deploy, rollback by
re-adding 259a's hold; rotation checks (D2). Checked by Claude 2026-10-30: no view depends on `llc_invitations`; the
site sends `Referrer-Policy: strict-origin-when-cross-origin`, so `/join-llc?token=…` never leaks its query to other sites.

**Rev 3 changes:** R5 (agreement before a signed-in join) and the `/join-llc` return from `/agree`; identity sources
named; test rules (L-028, L-030); the zero-friction line; the agreement inventory's stale reason.

**Rev 4 changes (every rev 3 REQUIRED item):**
1. *Atomic, single-use join (new R6, Appendix A).* A new database function `accept_llc_invitation` makes the
   pending → accepted change, the profile update and the membership upsert in one transaction. Its conditional UPDATE
   is the lock: a second accept, a cancel or an expiry that commits first leaves 0 rows, so the loser gets
   `not_active` and nothing is written. Cancel and resend update only while pending. Dry run passed 2026-10-30.
2. *R5 end to end (T18):* a journey test `/join-llc` → `/agree` → agreement → the same link → joined, for four
   people, with no loop and no detour for inactive invitations (rev 3 OPTIONAL 3).
3. *A strict return rule (T17):* the raw `next` must match `^/join-llc\?token=[A-Za-z0-9-]{1,64}$`; anything else
   keeps today's rule. Tokens stay out of agreement records, logs and Sentry (new R7: Sentry gets no query strings).
4. *No bypass through another path (T19):* the database refuses to join an account created on or after 2026-10-30
   that has no agreement record; an inventory test lists every membership writer. Create path: a failed record means
   no join; the person agrees on `/agree` and comes back.
5. *Real redirects and writes (T15, T16):* tests use Next's real `redirect`; the "no write" helper allows only the
   sign-in session change of `signInToJoinLLC`.
Also adopted (rev 3 OPTIONAL 2): R3, D1 and §11 wording. Declined (rev 3 OPTIONAL 1): `Referrer-Policy: no-referrer`
on token pages; `strict-origin-when-cross-origin` already sends other sites only the origin, and same-site referrers
reach only Domus.

**Rev 5 changes (every rev 4 REQUIRED item, plus four OPTIONAL items):**
1. *The database's agreement rule equals `checkAgreement`:* the function now takes the Terms and Privacy versions the
   app requires (`LEGAL_DOCUMENTS` current) and needs a record for exactly those; accounts from before 2026-10-30 stay
   exempt. New SQL negatives: a record for older versions, and a record with current Terms but older Privacy, are
   refused.
2. *Real concurrency (D4):* `supabase/tests/sprint259b_accept_concurrency.mjs` races two API sessions live (two
   accepts; accept against cancel) for 20 rounds with tester fixtures it removes. The SQL test adds a failure in the
   later profile write (23505): the invitation stays pending, no membership, the profile unchanged. Dry run passed.
3. *The create-path exception (§10):* when the agreement record fails, the new login (and its trigger-made profile)
   may remain; no membership, no invitation change; the person recovers through `/agree`; a retry creates no second
   user (T16, T18 f).
4. *Sentry, everything (R7, T20):* every string in the event, nested `extra`, `contexts` and `tags` included, loses
   token-bearing parameter values, raw or percent-encoded.
Optional items taken: a resend rotates the token and emails the new one (R6, T4); the RPC trust boundary is stated
(Appendix A header, T19); the writer scan accepts any quote style and inventories every RPC name (T19, D5); expiry is
checked with `clock_timestamp()` at the moment of the update.

**Rev 6 changes (every rev 5 REQUIRED item, plus five OPTIONAL items):**
1. *The join is bound to the current token:* `accept_llc_invitation` takes `p_invitation_token` and its conditional
   update requires `token = p_invitation_token`, so after a resend rotates the token an old link fails even though
   the row is still pending. The app passes the token of the row it found by the URL token. A unique index makes one
   token, one invitation (OPTIONAL 2). Dry run passed: wrong token, rotated old token, duplicate token.
2. *D4 races with real lock contention:* a temporary helper (`supabase/tests/sprint259b_accept_concurrency_helper.sql`,
   dropped after the run) holds the invitation row lock for 2.5 s while both racers start, and each racer must show it
   waited. Races: accept/accept, accept/cancel, accept/resend (both orders); after a winning resend, the old token
   fails and the new one joins.
Optional items taken: the version-authority note (Appendix A header, R6); bare sensitive values in Sentry (R7, T20);
the resend-failure recovery (R6, T4); R2's stale resend sentence (R2).

**Rev 7 changes (the rev 6 REQUIRED item, plus four OPTIONAL items):**
1. *The temporary lock helper is locked down (D4):* created with its grants and a privilege check in one transaction;
   EXECUTE for the service role only; it locks only synthetic fixtures (an `@example.invalid` invitation sent by a
   tester) and refuses to run after a 2-hour expiry; Claude always drops it after the run, pass or fail, then checks
   it is gone and no fixture is left. It stays in `public` because the racers and the holder must be separate API
   sessions. The permanent function, its grants, the unique index and the postcondition apply as one migration
   transaction.
Optional items taken: per-race evidence without tokens (outcomes, waits, final state; D4); R3 now names R8; R8 was
checked on the rendered page (one `main` landmark holding the alert with the exact text); rollback order (D4).

## 1. Objective
An LLC invitation token lets its holder create the invitee's login at `/join-llc` (password chosen by the holder,
`email_confirm: true`). Until 2026-10-30 every active LLC member could read pending tokens from the database (closed
live in `33d73ae`), and the owner page still sends every pending token to LLC administrators' browsers although no
screen uses it. Make tokens reachable only through the invitation email and the accept flow. Make each invitation
join exactly one person exactly once, never from a cancelled or expired invitation and never before that person
agreed to the Terms. Then turn LLC invites back on.

## 2. Context (HEAD `fb1abab`: 259a + fix 1)
- **Live access (applied 2026-10-30, `33d73ae`):** `anon` and `authenticated` hold no privilege on `llc_invitations`;
  no client policy; RLS on; the pending token rotated. Rows: 1 pending (2026-03-24, past 7 days), 1 accepted.
- Every app query on `llc_invitations` uses `createAdminClient()` (`app/actions/llc-invitations.ts`, 7 queries;
  `lib/llc-invitations.ts`, 4 queries). The browser never queries it.
- `lib/llc-invitations.ts`: `LLCInvitationDTO` includes `token`; `getPendingLLCInvitationsForAccount`
  (administrators only via `canUserAdministerOwnershipAccount`) selects and returns it. The DTO reaches the browser
  through `app/owner/page-data/section-bundles.ts:192` → `components/dashboard/{llc-invite-form,members-section,
  types,section-map}.tsx`. No component reads `token`.
- 259a's hold: `isLlcInvitesPaused()` / `LLC_INVITES_PAUSED = true` in `lib/llc-invitations.ts`, checks in
  `sendLLCInvitations`, `resendLLCInvitation`, `resolveInvitationForAcceptance` and `/join-llc`, tests LP1–LP4 and
  mocked L1–L5.
- **Join paths today.** Identity comes only from the server: `supabase.auth.getUser()` (the page and
  `acceptLLCInvitation`), the `signInWithPassword` result (`signInToJoinLLC`) and the `auth.admin.createUser` result
  (`createAccountToJoinLLC`, which uses the invitation row's email, never form input). The invitation's email, account
  and status come from the row found by token with the admin client; `resolveInvitationForAcceptance` refuses rows that
  aren't pending or are more than 7 days old. `/join-llc` accepts during render when the signed-in email matches
  (`page.tsx:140`). `acceptLLCInvitationMembership` then makes three separate writes: profile upsert (`role: "owner"`),
  membership upsert on the primary key `(account_id, profile_id)`, and the invitation update where status is pending
  or accepted. `cancelLLCInvitation` and `resendLLCInvitation` update by id with no status condition.
  `idx_llc_invitations_unique_pending` allows one pending invitation per account and email; `token` is a `uuid`.
- **Database (Claude's; Codex must not edit).** `20261108_sprint259b_accept_llc_invitation.sql` (Appendix A) is
  **applied live (2026-10-30); D4 and D5 passed** (live SQL test; 30 forced-contention races; helper dropped; 0
  fixtures; functions that create or activate memberships = `accept_llc_invitation`, `handle_new_user`;
  `account_wipe_apply` deletes them during an account wipe). The app may call it now. T19's writer set is corrected
  in `docs/sprint259b-fix1-codex-prompt.md` (adds `connect.ts`, `account-wipe.ts`). `accept_llc_invitation(p_invitation_id,
  p_invitation_token, p_profile_id, p_full_name, p_nickname, p_terms_version, p_privacy_version) returns text`:
  `accepted` |
  `not_active` | `agreement_required`; service role only. Dry run 2026-10-30
  (`supabase/tests/sprint259b_accept_llc_invitation.sql`): clients 42501; no record, older versions or mixed versions
  → `agreement_required`, no writes; a wrong token → `not_active`; a current record → invitation, profile and
  membership together; second accept, cancelled, expired, another person and unknown → `not_active`, no writes; after a
  rotation the old token → `not_active` (row still pending) and the new token → accepted; a duplicate token → 23505; a
  failing later write rolls everything back; 6 d 23 h 59 m old → accepted; an account from before 2026-10-30 → accepted.
- **Agreement (259a).** `checkAgreement(supabase, user)` (`lib/legal-acceptance.ts:29`) returns `"exempt"`,
  `"accepted"` or `"required"` and throws when the read fails. `agreeDestination` (`:75`) returns `next` only when
  `isNextAllowedForRole` allows `/{role}`, `/settings` or `/payments/receipt` (`lib/route-resolver.ts:55`).
  `agreeToTerms` requires a signed-in owner, manager or tenant; every profile has one (`profiles.role` is NOT NULL and
  the auth trigger defaults it to tenant). Middleware only refreshes the session; it never redirects. The agreement
  inventory (`lib/__tests__/agreement-enforcement-inventory.test.ts:16`) lists the three join actions as public:
  "Public token-bound join; paused until 259b".
- **Other membership writers (read 2026-10-30):** `app/actions/{account-governance-delete-support,invitations,
  onboarding,ownership}.ts`, `lib/distributions.ts`, `lib/ownership/members.ts` (owner or admin actions behind
  `requireAuth`), and the auth trigger `handle_new_user` (owner invitations from the separate `invitations` table).
- **Telemetry.** Sentry runs in production (`NEXT_PUBLIC_SENTRY_DSN`; errors only, `tracesSampleRate: 0`).
  `scrubSentryEvent` (`lib/sentry-scrub.ts`) drops cookies, bodies and sensitive keys but keeps `request.url`,
  `request.query_string` and breadcrumb URLs, so an error on `/join-llc?token=…` carries the token. Vercel Analytics
  is off in production.

## 3. In scope
Remove `token` from the invitation DTO and its query; remove the 259a hold and its copy; R4 audit; R5 agreement before
joining; R6 single-use join through the new function, plus status-conditional cancel and resend; R7 Sentry scrub; tests.

## 4. Out of scope
Hashing tokens or moving them out of the URL (Vercel's request logs keep URLs; owner-only access); invite email
wording; `LLCInvitationContext`; the tenant/manager invitation flow (`invitations` table) and the auth trigger's owner
auto-join (an owner's grant at account creation; the invitee still can't use anything before agreeing; noted for the
Terms rewrite); the profile's change to `owner` on joining (unchanged); the migration and SQL files; routing for any
`next` other than the R5 form.

## 5. Exact files expected to change (apps/web)
`lib/llc-invitations.ts`, `app/actions/llc-invitations.ts`, `app/actions/llc-invitations-support.ts`,
`app/join-llc/page.tsx`, `lib/legal-acceptance.ts` (the R5 rule only), `lib/sentry-scrub.ts`. Tests:
`lib/__tests__/llc-invitations.test.ts`, `app/actions/__tests__/llc-invite-hold.test.ts` → rename to
`llc-invite-flow.test.ts`, `app/actions/__tests__/llc-invite-agreement.test.ts`,
`app/actions/__tests__/llc-join-journey.test.ts` (new), `lib/__tests__/legal-acceptance.test.ts`,
`lib/__tests__/agreement-enforcement-inventory.test.ts` (reason text only),
`lib/__tests__/membership-writers-inventory.test.ts` (new), `lib/__tests__/sentry-scrub.test.ts`,
`tests/e2e/agreement-flow.spec.ts` (R8 only), and owner page-data
and dashboard tests only where the DTO shape is asserted. `docs/grooming.md` only if `app/actions/llc-invitations.ts`
(510 lines today) stays above 500 lines.

## 6. Implementation requirements
- **R1** `LLCInvitationDTO` has no `token`; `getPendingLLCInvitationsForAccount` selects exactly `id,
  ownership_account_id, invited_by, email, status, created_at, accepted_at`.
- **R2** Remove `LLC_INVITES_PAUSED`, `isLlcInvitesPaused()` and every check and copy 259a added for the hold, keeping
  259a's agreement checkbox, version check and `llc_invite` record on the create-account path. `resendLLCInvitation`
  keeps loading the invitation server-side by id with the admin client; R6 decides the token it emails.
- **R3** No behavior changes beyond R1, R2 and R5–R8 (R8 is test-only).
- **R4 Join-flow audit:** test that `acceptLLCInvitation`, `signInToJoinLLC` and `createAccountToJoinLLC` each require
  a pending invitation, not expired (7 days from `created_at`), the signed-in or created user's email equal to the
  invitation email, and single use. Identity stays on the server sources in §2; emails compare through
  `normalizeInvitationEmail` on both sides. The database re-checks pending, expiry and email in the same statement
  that marks the invitation accepted (R6).
- **R5 Agreement before joining.** Let `joinPath = "/join-llc?token=" + encodeURIComponent(token)` and
  `agreeUrl = "/agree?next=" + encodeURIComponent(joinPath)`.
  - `/join-llc`, signed in with the invited email (after today's invalid, expired and used states): when
    `checkAgreement` returns `"required"`, `redirect(agreeUrl)` before `acceptLLCInvitation` runs.
  - `acceptLLCInvitation`: `"required"` → `{ success: false, error: "Please agree to the Terms first." }`, no write.
  - `signInToJoinLLC`: after a successful sign-in, `"required"` → `redirect(agreeUrl)`, no write.
  - `createAccountToJoinLLC` keeps the box, the version check and the `llc_invite` record. When the join returns
    `agreement_required` (the record failed, so the database refuses), sign the new user in and `redirect(agreeUrl)`;
    if that sign-in fails, today's "Account created. Sign in to continue." redirect. A retry with the same token finds
    the profile and redirects to sign-in ("An account already exists for this email. Sign in to continue.") without
    calling `createUser` (the §10 exception).
  - `agreeDestination`: when `getSafeNextPath(next)` is not null and the raw `next` string matches
    `^/join-llc\?token=[A-Za-z0-9-]{1,64}$`, return it for any signed-in user; every other `next` keeps today's rule.
  - A failed agreement read fails closed: no join, no write. `"exempt"` and `"accepted"` users join as today.
- **R6 Single-use join.**
  - `acceptLLCInvitationMembership` computes `fullName` and `nickname` exactly as today and calls
    `admin.rpc("accept_llc_invitation", { p_invitation_id, p_invitation_token, p_profile_id, p_full_name, p_nickname,
    p_terms_version, p_privacy_version })` with the id and token of the row found by the URL token (the server-only
    `LLCInvitationContext`), the server identity's id and `LEGAL_DOCUMENTS.terms.current` /
    `LEGAL_DOCUMENTS.privacy.current` (the app decides which versions are current; the database checks what it is
    given); it writes no table itself. Map `accepted` → success with the invitation's
    account id; `not_active` → "This invitation is no longer active."; `agreement_required` → "Please agree to the
    Terms first." with `code: "agreement_required"`; an rpc error → "This feature requires a database update before
    invites can be accepted." when
    `isMissingSchemaError`, else "Unable to attach this member to the LLC." (logged without token or URL). Remove the
    copy the function makes unreachable: "Unable to update the invited member profile." and "Member added, but the
    invitation could not be marked accepted."
  - `finalizeInvitationAcceptance` passes the code through. `acceptLLCInvitationMembership` has one caller
    (`finalizeInvitationAcceptance`); the rpc has one caller (`acceptLLCInvitationMembership`).
  - `cancelLLCInvitation`: update with `.eq("status", "pending")` and `.select("id")`; 0 rows → "Only pending
    invitations can be cancelled."
  - `resendLLCInvitation` rotates the token: after today's checks it updates `{ token: crypto.randomUUID(),
    created_at: now }` with `.eq("id", id).eq("status", "pending").select("token")`; 0 rows → "Only pending
    invitations can be resent." and no email; then it emails the accept URL built from the returned token. An email
    failure returns today's "Unable to resend the invitation email right now."; the invitation stays pending with the
    new token, the earlier link no longer works, and another resend rotates again and emails. Remove the
    now-unreachable "Invitation emailed, but its expiry could not be reset."
- **R8 E2E locator (found in the 259a release run, 2026-10-30).** In `tests/e2e/agreement-flow.spec.ts` (E2E-R1),
  scope the alert check to the page: `page.getByRole("main").getByRole("alert")`. Next's route announcer is also
  `role="alert"`, so the unscoped locator fails strict mode after a client navigation. Checked on the rendered page
  in the 259a release run: one `main` landmark, holding the alert with the exact text. No other spec change.
- **R7 Sentry gets no token.** `scrubSentryEvent` keeps today's removals and adds: `request.url` and breadcrumb
  `data.url`, `data.from` and `data.to` lose their query string and fragment; `request.query_string` is deleted; and
  every string anywhere in the event (message, exception values, breadcrumbs, `extra`, `contexts`, `tags`, request
  fields, nested at any depth) has the value of each `token`, `token_hash`, `code`, `access_token`, `refresh_token` and
  `next` parameter replaced with `[Filtered]`, raw (`token=…`) or percent-encoded (`token%3D…`, also inside an encoded
  `next`). Today's sensitive-key removal (`token`, `secret`, `password`, `key`, …) also covers `tags` and breadcrumb
  `data`, at any depth, so a bare `{ token: "…" }` is removed wherever it appears. Other keys and values stay.

## 7. Validation
`cd apps/web && npx vitest run lib/__tests__/llc-invitations.test.ts app/actions/__tests__/llc-invite-flow.test.ts
app/actions/__tests__/llc-invite-agreement.test.ts app/actions/__tests__/llc-join-journey.test.ts
lib/__tests__/legal-acceptance.test.ts lib/__tests__/agreement-enforcement-inventory.test.ts
lib/__tests__/membership-writers-inventory.test.ts lib/__tests__/sentry-scrub.test.ts app/owner components/dashboard`
then `npm run gate:web` from the repo root.

## 8. Acceptance criteria (`toEqual` for shapes, L-030)
- **T1** `getPendingLLCInvitationsForAccount` → the select string is exactly the R1 columns, and each item
  `toEqual({ id, ownershipAccountId, invitedBy, email, status, createdAt, acceptedAt })` (no `token` key).
- **T2** the owner page-data bundle for an LLC administrator contains no `token` key anywhere (deep scan).
- **T3** `sendLLCInvitations` inserts and emails as before (the 259a owner hold copy never appears).
- **T4** `resendLLCInvitation` writes a new uuid token only while the invitation is pending and builds the emailed
  accept URL from the token its update returned, never from input or the old token; 0 rows → "Only pending
  invitations can be resent." and no email. An email failure after the rotation → "Unable to resend the invitation
  email right now.", the invitation pending with the new token; a second resend rotates again and emails.
- **T5** the three join actions work again; the create path still requires the box, checks versions and records
  `llc_invite` (259a L1–L4 now unmocked).
- **T6** no file under `apps/web` mentions `LLC_INVITES_PAUSED`, `isLlcInvitesPaused` or the two hold sentences; the
  inventory reason for `llc-invitations.ts` no longer says "paused" (it names R5 and R6).
- **T7–T10, T12** join-flow negatives: email substitution, expired, reused, cancelled, and creating an account when one
  exists for the email → each refused with today's copy (or R6's mapped copy) and no write (§10 allows the lookup's
  expire update).
- **T11** single use: two simultaneous joins of one invitation (rpc fake: first `accepted`, second `not_active`) →
  exactly one success and one "This invitation is no longer active."; final state one membership, invitation
  accepted. A join that loses to a cancel reports that copy with no other write; a cancel after an accept gets "Only
  pending invitations can be cancelled."; a resend after an accept gets "Only pending invitations can be resent."
  (T11 checks the app's mapping; D4 proves the database races live.)
- **T13** canary (mocked tokens may be `canary-<uuid>`; the column is a uuid): the serialized owner page-data bundle,
  every send/resend/cancel result and every owner-facing error contain no `canary-`; no `console.*` call in these
  paths, the R5 paths or `agreeToTerms` receives the token, `joinPath` or `agreeUrl`.
- **T14** send, resend and cancel refuse a caller who can't manage the target account (another LLC), with no write.
- **T15 (R5 page, real redirect)** signed in with the invited email and `"required"` → the thrown redirect's URL is
  exactly `/agree?next=%2Fjoin-llc%3Ftoken%3D<token>`; no write. `"exempt"` and `"accepted"` accept as today. A failed
  agreement read → no join, no write.
- **T16 (R5 actions)** `acceptLLCInvitation` with `"required"` → `toEqual({ success: false, error: "Please agree to
  the Terms first." })`, no write. `signInToJoinLLC` with `"required"` → real redirect to `agreeUrl`; only the sign-in
  happened. Create path: the record fails → rpc `agreement_required` → the new user is signed in → real redirect to
  `agreeUrl`; one `createUser`, no membership, no invitation change; a retry with the same token → redirect to sign-in
  with "An account already exists for this email. Sign in to continue.", no second `createUser`. The record succeeds
  → joined.
- **T17 (return rule)** `agreeDestination` returns the `next` for an owner, a manager and a tenant with
  `"/join-llc?token=abc"` and `"/join-llc?token=<uuid>"`. For `"/join-llc?token="`, `"/join-llc"`,
  `"/join-llc?token=a&token=b"`, `"/join-llc?token=a&x=1"`, `"/join-llc?token=a#f"`, `"/join-llcx?token=a"`,
  `"/join-llc/x?token=a"`, `"/%6Aoin-llc?token=a"`, `"/join-llc%3Ftoken%3Da"`, `"/join-llc\\?token=a"`,
  `"//evil.example/join-llc?token=a"`, `"https://evil.example/join-llc?token=a"` and `"/manager"` (owner) it returns
  exactly today's value (assert each value).
- **T18 (journey, new file)** a stateful fake holds the session user, agreement rows, the invitation and memberships.
  People: (a) a new owner who hasn't finished onboarding, (b) a new tenant, (c) a new user who already agreed, (d) a
  signed-in user with another email. For (a) and (b): `/join-llc` → real redirect to `agreeUrl` → `agreeToTerms` with
  that `next` → real redirect to `joinPath` (same token) → `/join-llc` → membership → redirect to
  `/owner?account=<id>`; exactly one `agree_page` record; no membership before it; the second render doesn't redirect
  to `/agree`; the same user id throughout. (c) joins on the first render with no `/agree`. (d) sees "Wrong account
  open", no `/agree`, no write. (e) for an accepted, expired or cancelled invitation and a `"required"` user, the
  status page shows first: no `/agree`, no write. (f) the create path with a failed `llc_invite` record → signed in →
  `/agree` → agreement → the same link → joined; final state one user, one `agree_page` record, one membership.
- **T19 (membership writers, new file)** read every non-test `.ts`/`.tsx` under `apps/web`. Files that name
  `ownership_account_members` in a `from(…)` call (single, double or back quotes, any spacing) followed by `insert`,
  `upsert`, `update` or `delete` equal `{app/actions/account-governance-delete-support.ts, app/actions/invitations.ts,
  app/actions/onboarding.ts, app/actions/ownership.ts, lib/distributions.ts, lib/ownership/members.ts}`, each with a
  reason. Every `rpc(…)` name in `apps/web` is in a reviewed list marking whether it writes memberships; only
  `accept_llc_invitation` does, called only from `lib/llc-invitations.ts`. No raw SQL string names the table. A new
  writer fails until listed. Trust boundary: `acceptLLCInvitationMembership` has exactly one caller, and its rpc
  arguments are `toEqual` the lookup row's id and token, the identity's id and the `LEGAL_DOCUMENTS` current versions.
- **T20 (Sentry)** an event carrying `canary-<uuid>` as a `token`, `token_hash`, `code`, `access_token` or `next`
  value in `request.url`, `query_string`, breadcrumbs (navigation `from`/`to`, fetch `url`, `message`), `message`,
  exception values, nested `extra` and `contexts` objects, `tags`, a percent-encoded `next=%2Fjoin-llc%3Ftoken%3D…`,
  and bare `{ token: "canary-…" }` objects nested in `extra`, `contexts`, `tags` and breadcrumb `data`
  → after `scrubSentryEvent`, `JSON.stringify(event)` has no `canary-`; the path `/join-llc`, keys such as
  `extra.route`, `tags.section` and the exception type remain.
- **T21 (agreement facts)** `checkAgreement` for a user created at exactly `2026-10-30T00:00:00.000Z` with no record →
  `"required"`; 1 ms earlier → `"exempt"`; a failed read throws.
- **D1** (Claude, live, done 2026-10-30) the `20261107` migration is applied and committed; its SQL test (a separate
  block that always raises, so only its own fixtures roll back) passed.
- **D2** (done) the pending token's fingerprint changed; the accepted row and every date unchanged.
- **D3** (Claude, after deploy) authorized smoke with test accounts: an owner sends an LLC invite; a new test invitee
  creates an account through `/join-llc` (box checked, `llc_invite` record written); an existing test user joins by
  signing in; a signed-in test account that must agree opens its invite, lands on `/agree`, agrees and comes back
  joined; a cancelled invitation's link is refused; after a resend, the earlier emailed link is refused.
- **D4** (Claude, hard release gate before any code that lifts the hold deploys) apply `20261108` live; verify its
  privileges; run its SQL test alone → `SPRINT259B_ACCEPT_TESTS_PASSED`; create the temporary lock helper, run
  `node supabase/tests/sprint259b_accept_concurrency.mjs 10`, drop the helper → exit 0: every racer waited on the
  row lock; accept/accept → one `accepted`, one `not_active`, one membership; accept/cancel → accepted + cancel 0
  rows + membership, or `not_active` + cancel 1 row + no membership; accept/resend → accepted + resend 0 rows + old
  token kept + membership, or `not_active` + new token + no membership, then the old token fails again and the new
  one joins; zero fixtures left; the helper is gone. The helper is created from
  `supabase/tests/sprint259b_accept_concurrency_helper.sql` in one call (grants and privilege check in the same
  transaction, fixture-only guard, 2-hour expiry) and dropped after the run whatever the result; a failed drop or a
  leftover fixture fails D4. The script's report holds outcomes, waits and final states, never a token. The
  migration applies as one transaction, so a failed postcondition leaves nothing behind. If the app ever rolls back to
  259a's hold, the function stays installed and unused; drop it only after the app stops calling it.
- **D5** (Claude, live) the database functions that write `ownership_account_members` are exactly `handle_new_user`
  and `accept_llc_invitation` (`pg_proc` source scan).

## 9. Report format
Compact status only: files changed (lines before → after), each criterion → test name, gate result, token count.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Lines ≤ 140 characters; files ≤ 500 lines (`app/actions/llc-invitations.ts` may stay at its 259a size with the
grooming entry). Every Supabase call's error is checked (L-002). No new dependencies. No edits outside §5.
Tests never put `expect` inside a mock implementation; a `catch` around a server action starts with
`unstable_rethrow(error)` (L-028). "No write" (L-030) means zero `insert`, `update`, `upsert` and `delete` calls on any
table, zero `rpc` calls (including `accept_llc_invitation`) and zero `auth.admin` writes (`createUser`,
`updateUserById`, `deleteUser`); use one shared helper. The only side effects allowed on a refused path are
`signInToJoinLLC`'s own sign-in and the lookup's existing `status = 'expired'` update of an invitation past 7 days
(`getLLCInvitationContextByToken`). One exception, the create path: when its agreement record fails, the new login
(and the profile the auth trigger makes) may remain, with no membership and no invitation change; it recovers through
`/agree`, and a retry creates no second user. Assert every listed fact, exact copy with `toEqual`, and the final state after every
retry. UI: "The user should never need to read instructions to complete this flow. Every step must be
self-explanatory. If the user needs to think about what to do, the UI needs to be clearer." No new copy: R5 reuses
`/agree` as it is.

## 11. External rules (CLAUDE.md §4b)
| Rule | Source | 259b behavior | Tests |
| --- | --- | --- | --- |
| Attribution of an electronic record to a person "may be shown in any manner, including … the efficacy of any security procedure" | C.R.S. 24-71.3-109(1) | The emailed one-time token is the security procedure behind an `llc_invite` record; only the server, the invitee's inbox and the invitee's own browser during the accept flow hold it; it joins once (R6) | T1, T2, T11, T13, D1 |
| Reasonable security for personal information (invitee email; account-takeover path) | C.R.S. 6-1-713.5 (Colorado data security) | Clients can't read invitations; pending tokens rotated; Sentry (a processor) gets no query strings | D1, T20 |
| Assent before use: a clickwrap binds when the person takes an affirmative step with notice of the terms; an invited user is no exception | Jovel v. TeamSnap, No. 1:24-cv-1906, ECF 39 (D. Colo. 2025-07-30; invited user, Colorado law); Hancock v. AT&T, 701 F.3d 1248 (10th Cir. 2012) | R5: a signed-in join waits for `/agree` and returns to the link; the database refuses a join without a record; the create path keeps its required box | T15–T18, T21, D3, D4 |

## Appendix A — `supabase/migrations/20261108_sprint259b_accept_llc_invitation.sql` (Claude's; verbatim; dry run passed)
```sql
-- Sprint 259b rev 6 (ChatGPT rev 3 REQUIRED 1, 4; rev 4 REQUIRED 1; rev 5 REQUIRED 1): accept an LLC invitation in one
-- transaction. The conditional update is the lock: a second accept, a cancel, a resend that rotated the token, or an
-- expiry that changes the row first leaves 0 rows, so the call returns 'not_active' and writes nothing. Concurrent
-- calls serialize on the row lock; READ COMMITTED re-checks the WHERE clause after the competing commit. The update
-- requires the token the server resolved, so an old link fails after a resend even though the row is still pending.
-- Expiry uses clock_timestamp(), the time of the update itself. The person is bound through auth.users (the address
-- the invitation was sent to), never through an argument.
-- Agreement floor (259a): an account created on or after 2026-10-30 (AGREEMENT_REQUIRED_FROM in
-- apps/web/lib/legal-versions.ts) joins only with a record for the Terms and Privacy versions the app passes from
-- LEGAL_DOCUMENTS (the same rule as checkAgreement). Older accounts stay exempt. The database checks the versions it
-- is given; the app decides which versions are current and keeps them in step with checkAgreement.
-- Trust boundary: the only caller (acceptLLCInvitationMembership) passes the id and token of the row it found by the
-- URL token and the id of the server-side identity. Profile and membership writes match the app's earlier upserts
-- (acceptLLCInvitationMembership at fb1abab). Service role only.
-- Rollback: supabase/rollback/20261108_sprint259b_accept_llc_invitation_rollback.sql.
create function public.accept_llc_invitation(
  p_invitation_id uuid, p_invitation_token uuid, p_profile_id uuid, p_full_name text, p_nickname text,
  p_terms_version text, p_privacy_version text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
  v_email text;
begin
  if exists (select 1 from auth.users u
             where u.id = p_profile_id and u.created_at >= timestamptz '2026-10-30 00:00:00+00')
     and not exists (select 1 from public.legal_acceptances a
                     where a.profile_id = p_profile_id
                       and a.terms_version = p_terms_version and a.privacy_version = p_privacy_version) then
    return 'agreement_required';
  end if;

  update public.llc_invitations i
     set status = 'accepted', accepted_at = now()
   where i.id = p_invitation_id
     and i.token = p_invitation_token
     and i.status = 'pending'
     and i.created_at >= clock_timestamp() - interval '7 days'
     and exists (select 1 from auth.users u
                 where u.id = p_profile_id and lower(btrim(u.email)) = lower(btrim(i.email)))
  returning i.ownership_account_id, lower(btrim(i.email)) into v_account, v_email;

  if v_account is null then
    return 'not_active';
  end if;

  insert into public.profiles as p (id, email, full_name, nickname, role, onboarding_completed_at)
  values (p_profile_id, v_email, coalesce(nullif(btrim(p_full_name), ''), split_part(v_email, '@', 1)),
          nullif(btrim(p_nickname), ''), 'owner', now())
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(btrim(p_full_name), ''), p.full_name),
        nickname = coalesce(nullif(btrim(p_nickname), ''), p.nickname),
        role = 'owner',
        onboarding_completed_at = coalesce(p.onboarding_completed_at, excluded.onboarding_completed_at);

  insert into public.ownership_account_members as m
    (account_id, profile_id, member_role, active, can_receive_critical_alerts)
  values (v_account, p_profile_id, 'owner', true, true)
  on conflict (account_id, profile_id) do update
    set member_role = 'owner', active = true, can_receive_critical_alerts = true;

  return 'accepted';
end
$$;

-- One token, one invitation (rev 5 OPTIONAL 2). Tokens are random uuids; the table holds 2 rows (checked 2026-10-30).
create unique index llc_invitations_token_key on public.llc_invitations (token);

comment on function public.accept_llc_invitation(uuid, uuid, uuid, text, text, text, text) is
  'Sprint 259b: single-use LLC invitation acceptance (invitation, profile and membership in one transaction). '
  'Returns accepted, not_active or agreement_required. Service role only.';

revoke all on function public.accept_llc_invitation(uuid, uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.accept_llc_invitation(uuid, uuid, uuid, text, text, text, text) to service_role;

do $$
declare
  sig constant text := 'public.accept_llc_invitation(uuid, uuid, uuid, text, text, text, text)';
begin
  if has_function_privilege('anon', sig, 'execute') or has_function_privilege('authenticated', sig, 'execute')
     or not has_function_privilege('service_role', sig, 'execute') then
    raise exception 'sprint259b accept_llc_invitation privilege postcondition failed';
  end if;
  if to_regclass('public.llc_invitations_token_key') is null then
    raise exception 'sprint259b token uniqueness postcondition failed';
  end if;
end $$;
```
