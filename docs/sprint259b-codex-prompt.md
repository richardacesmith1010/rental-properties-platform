# Sprint 259b — Close the LLC invitation-token exposure and lift the 259a invite hold (L3) — rev 2 (rev 1 APPROVE WITH CHANGES, all adopted)

Codex: `gpt-6.1-sol` · high (L3: auth tokens, a client-grant migration; 6.1-sol trial 3 of 3). ChatGPT review:
GPT-6 · High — rev 1 APPROVE WITH CHANGES. Claude: Opus 5.5 · Max. Runs **after Sprint 259a is committed** (it removes 259a's hold).

**Rev 2 changes (every rev 1 REQUIRED item):**
1. *Release gate:* the migration is applied first and its live state verified (RLS on, no `anon`/`authenticated`
   privilege on any column, no client policy, no view or function exposing the table, service-role read works) by
   the SQL test run **live** (D1); only then may code that lifts the hold deploy. A failed D1 blocks the deploy.
2. *Join-flow audit (R4, T7–T12):* prove the three join paths enforce the invitation email, pending status, 7-day
   expiry and single use, with negative tests; keep `email_confirm: true` only if all pass.
3. *Serialization:* a canary token must never appear in owner page data, any server-action result or any owner-facing
   error, on send and resend; no log line prints a token or accept URL (T2, T13).
4. *Admin client and cross-LLC authorization:* `createAdminClient()` reads no cookies, session or request headers
   (checked 2026-10-30: plain `createClient(url, serviceKey, { auth: { persistSession: false } })`); every send,
   resend and cancel checks the caller can manage that specific account (T14).
5. *Order and rollback:* migration → live D1 → code → deploy. The preferred rollback is re-adding 259a's code hold;
   the SQL rollback re-opens the exposure and is never automatic.
6. *Rotation:* old pending tokens fail after rotation; accepted rows and `created_at` (expiry) don't change; resend
   emails the newly stored token; previously emailed pending links need a resend (D2, T4). Claude runs an authorized
   production smoke after deploy with test accounts (owner sends, new invitee joins, existing user joins) (D3).
Optional taken: the rollback file records the original policy roles and modes; the objective's wording.
Checked by Claude 2026-10-30: no view depends on `llc_invitations`; the site sends `Referrer-Policy:
strict-origin-when-cross-origin`, so `/join-llc?token=…` never leaks its query string to other sites.

## 1. Objective
An LLC invitation token lets its holder create the invitee's login at `/join-llc` (password chosen by the holder,
`email_confirm: true`). Today every active member of the LLC can read pending tokens straight from the database, and
the owner page sends every pending token to LLC administrators' browsers although no screen uses it. Make invitation tokens
inaccessible to other signed-in clients, disclosed to invitees only through their invitation email and the accept
flow, then turn LLC invites back on.

## 2. Context (HEAD after 259a)
- **Live (verified 2026-10-30):** `llc_invitations` policies "LLC members can view invitations" (SELECT, any active
  member), "LLC admins can create invitations" (INSERT), "LLC admins can update invitations" (UPDATE); `anon` and
  `authenticated` hold SELECT on every column incl. `token` (no INSERT/UPDATE grants since 237g). Rows: 1 pending
  (2026-03-24, expired by the 7-day rule), 1 accepted. No database function references the table.
- Every app query on `llc_invitations` uses `createAdminClient()` (`app/actions/llc-invitations.ts`, 7 queries;
  `lib/llc-invitations.ts`, 4 queries). The browser never queries it.
- `lib/llc-invitations.ts`: `LLCInvitationDTO` (lines 10–19) includes `token`; `getPendingLLCInvitationsForAccount`
  (≈110–145, administrators only via `canUserAdministerOwnershipAccount`) selects and returns it. The DTO reaches the
  browser through `app/owner/page-data/section-bundles.ts:192` → `components/dashboard/{llc-invite-form,members-section,
  types,section-map}.tsx`. No component reads `token` (grep 2026-10-30).
- Sprint 259a added the hold: `isLlcInvitesPaused()` / `LLC_INVITES_PAUSED = true` in `lib/llc-invitations.ts`, checks
  in `sendLLCInvitations`, `resendLLCInvitation`, `resolveInvitationForAcceptance`
  (`app/actions/llc-invitations-support.ts`) and `/join-llc`, tests LP1–LP4 and mocked L1–L5.
- **Database (Claude's; Codex must not edit):** `supabase/migrations/20261107_sprint259b_llc_invitations_client_access.sql`
  revokes every `anon`/`authenticated` privilege on `llc_invitations`, drops the three client policies (RLS stays
  on), and rotates the token of every pending invitation. Rolled-back dry run 2026-10-30
  (`supabase/tests/sprint259b_llc_invitations_client_access.sql`): `SPRINT259B_SQL_TESTS_PASSED` — member and anon
  reads, member update and insert refused (42501), service role reads, no client policies, pending token rotated.
  Rollback file restores the exact live grant and policies. Claude applies it before this code ships (it needs no
  code change: the app already uses the service role).

## 3. In scope
Remove `token` from the invitation DTO and its query; remove the 259a hold and its copy; tests.

## 4. Out of scope
Hashing tokens at rest; invite email wording; `LLCInvitationContext` (server-only, built from the URL token); the
tenant/manager invitation flow (`invitations` table); the migration and SQL files.

## 5. Exact files expected to change
`apps/web/lib/llc-invitations.ts`, `apps/web/app/actions/llc-invitations.ts`,
`apps/web/app/actions/llc-invitations-support.ts`, `apps/web/app/join-llc/page.tsx`, and the tests that cover them
(`lib/__tests__/llc-invitations.test.ts`, `app/actions/__tests__/llc-invite-hold.test.ts` → rename to
`llc-invite-flow.test.ts`, owner page-data and dashboard tests only where the DTO shape is asserted).
`docs/grooming.md` only if `llc-invitations.ts` stays above 500 lines.

## 6. Implementation requirements
- **R1** `LLCInvitationDTO` has no `token`; `getPendingLLCInvitationsForAccount` selects exactly `id,
  ownership_account_id, invited_by, email, status, created_at, accepted_at`.
- **R2** Remove `LLC_INVITES_PAUSED`, `isLlcInvitesPaused()` and every check and copy 259a added for the hold, so
  sending, resending, accepting, signing in to join and creating an account to join behave as before 259a, **keeping**
  259a's agreement checkbox, version check and `llc_invite` record on the create-account path. `resendLLCInvitation`
  keeps loading the token server-side by invitation id with the admin client.
- **R3** No other behavior changes. Cancelling stays as is.
- **R4 Join-flow audit:** confirm (and test) that `acceptLLCInvitation`, `signInToJoinLLC` and `createAccountToJoinLLC`
  each require: a pending invitation, not expired (7 days from `created_at`), the signed-in or created user's email
  equal to the invitation email, and single use (a second accept of the same token fails; two concurrent accepts
  produce one membership). Fix only what a test shows is broken.

## 7. Validation
`cd apps/web && npx vitest run lib/__tests__/llc-invitations.test.ts app/actions/__tests__/llc-invite-flow.test.ts
app/owner components/dashboard` then `npm run gate:web` from the repo root.

## 8. Acceptance criteria (`toEqual` for shapes, L-030)
- **T1** `getPendingLLCInvitationsForAccount` → the select string is exactly the R1 columns, and each item
  `toEqual({ id, ownershipAccountId, invitedBy, email, status, createdAt, acceptedAt })` (no `token` key).
- **T2** the owner page-data bundle for an LLC administrator contains no `token` key anywhere (deep scan of the
  serialized bundle).
- **T3** `sendLLCInvitations` inserts and emails as before (the 259a owner hold copy never appears).
- **T4** `resendLLCInvitation` builds the accept URL from the token it reloads by id (admin client), never from input.
- **T5** `acceptLLCInvitation`, `signInToJoinLLC` and `createAccountToJoinLLC` work again; the create path still
  requires the box, checks versions and records `llc_invite` (259a L1–L4 now unmocked).
- **T6** no file under `apps/web` mentions `LLC_INVITES_PAUSED`, `isLlcInvitesPaused` or the two hold sentences.
- **T7–T12** join-flow negatives: email substitution (signed-in user with another email), expired token, reused
  token, cancelled invitation, simultaneous accepts (one membership), creating an account when one exists for the
  email → each refused with today's copy and no write.
- **T13** canary: with a pending invitation whose token is `canary-<uuid>`, the serialized owner page-data bundle,
  every send/resend/cancel result object and every owner-facing error contain no `canary-`; no `console.*` call in
  these paths receives the token or an accept URL.
- **T14** send, resend and cancel refuse a caller who can't manage the target account (another LLC), with no write.
- **D1** (Claude, live, rolled back) the 259b SQL test passes after the apply, before any code deploy.
- **D2** (Claude, live) the pending invitation's token differs from its pre-apply value; accepted rows and every
  `created_at` are unchanged.
- **D3** (Claude, after deploy) authorized smoke with test accounts: owner sends an LLC invite, a new test invitee
  creates an account through `/join-llc` (box checked, `llc_invite` record written), an existing test user joins
  by signing in.

## 9. Report format
Compact status only: files changed (lines before → after), each criterion → test name, gate result, token count.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Lines ≤ 140 characters; files ≤ 500 lines (`llc-invitations.ts` may stay at its 259a size with the grooming entry).
Every Supabase call's error is checked (L-002). No new dependencies. No edits outside §5.

## 11. External rules (CLAUDE.md §4b)
| Rule | Source | 259b behavior | Tests |
| --- | --- | --- | --- |
| Attribution of an electronic record to a person "may be shown in any manner, including … the efficacy of any security procedure" | C.R.S. 24-71.3-109(1) | The emailed one-time token is the security procedure behind an `llc_invite` agreement record; only the server and the invitee's inbox hold it | T1, T2, D1 |
| Reasonable security for personal information (invitee email + account takeover path) | C.R.S. 6-1-713.5 (Colorado data security) | Clients can't read invitations at all; pending tokens rotated | D1 |
