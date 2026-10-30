# Sprint 259a — findings from the linked Stage 1 session (for the "Agreement" session before ChatGPT review)

Written 2026-10-30 by the Stage 1 session that "Domus 7" started at 17:09. Per L-041 the owner's own chat
("Agreement") owns 259a; this session wrote no 259a file after 17:35, applied nothing live, ran no Codex, used no
Chrome/ChatGPT. Read-only inputs: the code at `166bd75`, live read-only SQL, five risk-review persona agents (effort
max). Everything below is advice; your migration, rollback and packet stand.

## 1. Review notes on `docs/sprint259a-codex-prompt.md` rev 1 (ranked)
1. **Version race (medium).** `agreeToTerms`, `recordInviteAgreement` and the LLC action record the current constants
   at POST time, not the versions the person was shown. A deploy that bumps a version while a page is open records
   "agreed to v2" for someone who read v1 — a provably wrong record, the kind a plaintiff uses to attack all records.
   Fix: each form posts hidden `termsVersion` / `privacyVersion` from the rendered page; the server compares them with
   the constants and on a mismatch writes nothing and returns exact copy (suggestion: "We just updated the Terms. Read
   them, then check the box again."). The sign-up metadata path already carries the versions.
2. **Sign-up record from editable metadata (medium).** `user_metadata` stays editable by the person after sign-up
   (`supabase.auth.updateUser({ data })`). An account self-created after `SIGN_UP_RECORD_START` with no rows can set
   `terms_version`/`privacy_version` later and get a `sign_up` row with `accepted_at = user.created_at` — back-dated to
   before any box was checked. Not a privilege problem (they assert their own consent), but the time is wrong. Options:
   record `accepted_at` = now() for the sign-up rule (keep `created_at` only as context), or require
   `email_confirmed_at` close to `created_at`; or move sign-up to a server action that checks the box and writes the row
   at the click (my design, §3; trade-off: every sign-up then comes from Vercel IPs and counts against Supabase's per-IP
   auth rate limit, already true for sign-in through `loginAction`).
3. **Fail-closed read = full outage (medium).** R5/G10 throws on an acceptance-read error, so a missing table, a grant
   slip or a PostgREST schema-cache miss blocks every signed-in page. The gate presents terms; it is not access control.
   Consider fail-open for read errors with a `[legal] status unavailable` log (Sentry), keeping the server-side checks on
   the creation forms. At minimum add `"legal_acceptances"` to `tables` in `scripts/verify-capabilities.mjs` (repo root)
   so `gate:web` and the daily smoke fail loudly before users do.
4. **Double ask for invitees (low).** An invitee who opens any gated page before `/complete-profile` agrees on `/agree`;
   `resolveAuthRoute` then sends them to `/complete-profile`, whose box is always shown (R10). Pass `needsAgreement` from
   the page and hide the box when a current row exists.
5. **Migration comment vs runbook (low).** The migration says rows are "removed only together with their profile
   (retention policy: account profile deleted within 30 days of closure)", but `docs/runbooks/account-deletion.md:22`
   says **never delete the `profiles` row** (anonymize at C9). With ON DELETE CASCADE the rows in fact stay, linked to
   the anonymized profile id (good for proof). Fix the comment; add a runbook data-table line (keep; no personal data).
6. **App Review demo accounts (low).** Both demo accounts hit `/agree` on the reviewer's first sign-in. Add one review
   note line (suggestion: "After you sign in, you may see a short page asking you to agree to our Terms. Check the box
   and tap Continue.") to `docs/app-store/app-review-notes.md`. Don't pre-write rows for them.
7. **Pre-existing bug on a 259a path (low).** `/join-llc` create form: `minLength={6}` on both password inputs
   (`app/join-llc/page.tsx` ~lines 292, 298) while Supabase requires 8 with letters + digits (Sprint 175b) → a late
   generic error. Two-character fix while the form is open.
8. **Live counts (info).** `auth.users` 2026-10-30: 33 logins = 8 non-test (4 owners, 1 manager, 3 tenants), 7 demo
   (`@demo.domus.com` March seeds + the 2 App Review accounts), 18 `richard.ace.smith+…` aliases. Identities: 33 email,
   0 OAuth.

## 2. Entry-point map (code at `166bd75`)
| Path | Creates the login | First screen the person acts on | Where the box belongs |
| --- | --- | --- | --- |
| Self sign-up `/login?mode=signup` | browser `supabase.auth.signUp` (`create-account-form.tsx:57–59`) | the form | the form |
| Tenant invite | `admin.generateLink type=invite` (`tenant-invitation-support.ts:152`) or `inviteUserByEmail` (169) | `/complete-profile` | `/complete-profile` |
| Manager invite | `admin.createUser` (`invitations.ts:139`) + `generateLink`/`inviteUserByEmail` (`lib/manager-invite.ts:169,184`) | `/complete-profile` | `/complete-profile` |
| Co-owner invite | `admin.inviteUserByEmail` (`invitations.ts:306`) | `/complete-profile` | `/complete-profile` |
| Invite resends | `lib/invite-resend.ts:75,92`, `lib/manager-invite-rows.ts:152`, `/join/[inviteId]` resend | `/complete-profile` | `/complete-profile` |
| LLC partner `/join-llc` | `admin.createUser` with password (`llc-invitations.ts:460`) | the form | the form (server action) |
| Existing user signs in to LLC | `signInWithPassword` (`llc-invitations.ts:410`) | — | gate |
| Magic link | none (signs in only) | — | gate |
| Public Supabase sign-up/OTP API | any caller with the anon key | — | gate (the backstop) |
| Seeds | `scripts/seed-smoke-accounts.mjs`, `seed-appreview-accounts.mjs`, `seed.ts`, `seed-demo.ts` | — | gate |
| iPhone app | same web pages; `target=_blank` to domusbase.com loads **in the main web view** (`DomusNavigationDelegate.swift` createWebViewWith) | — | in-page sheet, not links |
Pages guarded by `getAuthenticatedUser()`/`requireRole()`: the 21 your packet lists. Not guarded (direct
`auth.getUser()`): `/payments/receipt/[chargeId]`, `/ops`, `/reset-password`, `/` (redirects to a guarded home), every
API route, every server action (`requireAuth`).

## 3. My alternative design and its rolled-back dry run (for comparison only)
- Table `legal_acceptances(profile_id → profiles ON DELETE SET NULL, terms_version, privacy_version, flow in
  (signup_form, invite_setup, llc_join_form, agree_screen), role_at_acceptance, client in (web, ios_app),
  app_commit, accepted_at default now())`, unique (profile, terms, privacy). Grants: `revoke all … from public, anon,
  authenticated, service_role; grant select to authenticated; grant select, insert to service_role` — append-only by
  privilege, no triggers needed; RI actions run as the table owner so SET NULL still works.
- Dry run on production 2026-10-30 inside one transaction ended by a forced exception (nothing kept): service_role
  insert OK; duplicate → 23505 on the unique index; service_role UPDATE/DELETE/TRUNCATE → 42501; bad flow, version,
  role, client, commit → 23514; authenticated A sees only A's 2 rows, B sees 1, no-sub sees 0; authenticated
  INSERT (own or other's)/UPDATE/DELETE/TRUNCATE → 42501; anon SELECT/INSERT → 42501; profile delete → rows kept with
  null link. Result: `SPRINT259A_SQL_TESTS_PASSED`.
- Ideas you may want regardless of schema: `role_at_acceptance` (proves which role-specific Terms applied, e.g. the
  manager license warranty in the rewrite) and `client` (web vs iPhone app, from the `DomusApp/1` user agent via
  `isNativeAppServer`); default grants for new `public` tables give `anon`/`authenticated` SELECT (pg_default_acl
  `r/postgres`), so the explicit revoke matters.
- Sheet links instead of new-tab links (the iPhone app would replace the half-filled form); two full-size buttons
  under the box ("Read the Terms" / "Read the Privacy Policy") avoid label-toggle and target-size questions.

## 4. Risk review (5 personas, effort max) — findings with sources
(Five persona agents — plaintiff's lawyer, state AG / FTC, Apple App Reviewer, tenant advocate, fraudster — are still running at 17:58. This section is added to this same file and pushed when they finish.)
