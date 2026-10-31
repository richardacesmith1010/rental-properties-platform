# Sprint 259a — "I agree" at sign-up and invites + a record of what each person agreed to (L3) — rev 5 (rev 1 REJECT → rev 2 AWC → rev 3 AWC → rev 4 AWC, changes adopted)

Codex: `gpt-6.1-sol` · high (L3: auth flows, an agreement gate on pages, server actions and APIs, a legal record;
6.1-sol trial 2 of 3, CLAUDE.md §3a). ChatGPT review: GPT-6 · High (top of 3 steps) — rev 1 REJECT; rev 2, 3 and 4 APPROVE WITH CHANGES (rev 4: "no further specification-level blockers" once the
profile guard is added and verified). Claude: Opus 5.5 · Max.

**Rev 5 changes (every rev 4 REQUIRED item, adopted without another round):**
1. *Profile guard:* `profiles_keep_legal_evidence` (BEFORE DELETE on `profiles`) refuses to hard-delete a non-tester
   profile that has agreement records or an active legal hold; test accounts (`is_tester`) stay deletable, and so do
   profiles with neither. Positive and negative SQL tests added.
2. *R16* now lists exactly the R2/V4 changes (status banners; one inaccurate sentence removed). No eligibility rule.
3. *Re-run:* migration + SQL test, rolled back, 2026-10-30: `SPRINT259A_SQL_TESTS_PASSED`, 36 checks. Claude applies
   the identical file and re-runs the test file live (D1).
Optional items taken: the purge approver is documented as operator-supplied and needs the owner's approval in chat
first (runbook); postconditions check every client DML privilege on `legal_document_versions` and `legal_holds`; AS5
(cleanup re-run after an interruption); D5 (the first production record has key version 1, the published hashes and
the deployed commit). Not taken: a self-registered-manager access test (role selection already grants no data access;
existing RLS suites cover it).

**Rev 4 changes (every rev 3 REQUIRED item):**
1. *Email source:* the email in every record comes from a trusted identity: the signed-in user from
   `supabase.auth.getUser()` (`agreeToTerms`, `recordInviteAgreement`), the user `signUp` returned (must equal the
   submitted email), the invitation row's email (LLC; must equal the created user's). Missing, mismatched or posted
   emails are never used (S13–S15, A8).
2. *Real sign-up E2E:* the sign-up test account is never created by the admin API: the script only reserves an
   email and password; the spec registers through the form; Claude confirms it with the admin API and checks the
   Auth user and the `sign_up` row (E2E-S1, R15).
3. *Role authority:* a forged role (`admin`) is posted through real registration; the profile and the record must say
   `owner`; `role_at_acceptance` is documented as a snapshot of `profiles.role`, never an authorization (S12, E2E-S1).
4. *Privileged SQL:* Appendix A has the full migration. The purge anchors on the person's **latest** deletion request
   (by `requested_at`), purges only rows recorded before that closure, skips active holds, refuses blank, long or
   control-character approvers, and audits; a live rolled-back run passed 33 checks incl. reopened accounts, multiple
   requests, released holds, no anchor, rows after closure and a hostile approver string.
5. *Cleanup:* `cleanup` deletes only UUIDs in this run's manifest that also match the test email pattern, have
   `is_tester`, and belong to the expected project; any failed check refuses the whole run (R15, AS1–AS4).
6. *External effects:* N2 also asserts no Stripe call, email, storage call, background enqueue or AI request.
7. *Archive:* link targets are rewritten before tag stripping; tests compare every `href` and the archive bytes;
   Claude checks the database's published hashes (D2).
8. *Eligibility:* the Terms 18+ line is **dropped** from this sprint (an eligibility rule could matter to existing
   accounts); the box's "I am 18 or older" is a statement by new accounts only; the rewrite adds the rule with notice.
9. *LLC hold tests:* LP1–LP4 run with the real hold; L1–L5 mock `isLlcInvitesPaused()` to `false`; nothing in
   production (env, header, query) can turn the hold off.
Optional items taken: an HMAC key section in `docs/runbooks/terms-change.md` (backup, rotation via
`email_hmac_key_version`, recovery); the E2E record check proves the deployed key works; §10 file-size and
validation-order rules reconciled; the handoff records hashes, published rows, commit and the first record.

**Rev 3 changes (every rev 2 REQUIRED item):**
1. *Inventories:* I1 (actions), I2 (API routes, incl. indirect loaders) and new I3 (every `page.tsx`) are structural
   tests; N2 proves an unaccepted account causes zero protected effects in representative money, data and owner
   actions and routes.
2. *E2E split:* E2E-S1 is the normal sign-up (box at registration, no `/agree` after confirming); E2E-R1 is the
   missing-record recovery through `/agree`. Invite retry is tested both without reload (F2b) and after reload (F2d).
3. *Content and immutability:* the archive text keeps every link target (`text <href>`); published versions live in
   the database (`legal_document_versions`, append-only, one hash per version) and every record must reference one
   (foreign key), so a published version can't change silently. Claude publishes each version by migration.
4. *Retention:* built in the migration — `legal_holds`, `purge_expired_legal_acceptances(approver)` (service role
   only; anchor = the account-deletion request `done` more than 10 years ago; skips holds; writes an audit row), and
   `email_hmac` (keyed hash of the email, server secret `LEGAL_RECORD_HMAC_KEY`) so a record still proves who agreed
   after anonymization. Verified in the live SQL dry run (27 checks).
5. *LLC hold in code:* invites can't be sent, resent or accepted until 259b (R12b, tests LP1–LP4).
6. *Existing accounts:* the 2026-10-30 edits change no right, duty, fee, liability, dispute term or data use, so they
   are not a change "that matters" under our Changes clause; they take effect for everyone at the deploy (R16).
7. *Release E2E is mandatory:* the agreement spec fails when its accounts are missing; synthetic accounts are created,
   checked and removed by `scripts/agreement-e2e-accounts.mjs` (R15).
Optional items taken: `client` is documented as user-agent-reported; the Back bar's fallback is deterministic
(`/login`); the iPhone walk covers WKWebView, both themes, error focus and larger text, with screenshots archived.

**Rev 2 changes (every rev 1 REQUIRED item):**
1. *Bypasses:* the gate now covers pages, **every server action** (`requireAuth`) and **every signed-in API route**,
   each with a short, tested exit allowlist (R5–R7). Direct database calls from a browser are inventoried as residual
   (R0). Structural tests make every new action and route pick a side (I1–I2).
2. *Evidence:* each published document version is frozen as a text file; a registry maps version → SHA-256 of that
   text; the record stores that hash; tests fail when the text changes without a new version (R1–R2, V1–V3).
3. *Attribution:* the recorded role is read from `profiles` after the account exists, never from the form. Each
   `source` says how the person was identified (R4 table). Invitees are identified by the session their emailed link
   created.
4. *Retention:* rows outlive account deletion as pseudonymous proof (the runbook anonymizes, never deletes, profiles);
   10 years after closure, then a reviewed purge; holds skip the purge (R14). SQL tests cover cascade, anonymization
   and the wipe allowlist (D1).
5. *Failures:* a per-flow table of every partial state and its recovery (R13); tests for each (S7, L4, A5, F2).
6. *Authorities:* Hancock is 10th Circuit applying Oklahoma law; James is 3rd Circuit applying New Jersey law; no
   Pennsylvania-law holding is cited (rules map: unknown; no PA lease uses Domus). Copy approval: §11 note.
7. *Navigation:* fresh-account E2E covers sign-in → `/agree` → home, `/complete-profile`, `/onboarding`, Back bar,
   sheets and exits (rev 2 list; rev 3 renames them E2E-S1, E2E-R1, E2E-T1, E2E-A1, E2E-B1, E2E-C1, E2E-M1); Claude runs it on production with fresh accounts and walks the iPhone app.
8. *Tests:* real SQL tests (live, rolled back), E2E with fresh accounts, structural bypass inventories, failure tests.
9. *Dates:* revision date = the version label; effective date = first production deploy (recorded); cutoff =
   `AGREEMENT_REQUIRED_FROM`. Accounts made between the cutoff and the deploy are asked at `/agree` (G3b); nothing is
   ever back-dated (`accepted_at` is always the database's `now()`).
Optional items taken: privacy is a notice line, not something the box asserts was read; new forms use
`useActionState` (React 19.2.8); screenshots tied to the commit are archived by Claude; a Terms-change runbook
(Claude writes `docs/runbooks/terms-change.md`).

**Earlier decisions (2026-10-30):** the owner reports that the owner's aunt Grace, an attorney, has the research and
approves; the banner's "lawyer" line is stale. Risk review (plaintiff's lawyer, Apple reviewer, tenant advocate) and
the Stage 1 session's review (`docs/sprint259a-stage1-findings.md`) led to: new accounts only in this sprint (older
accounts are asked once, with notice, in the Terms rewrite); sign-up as a server action that records at the click;
posted versions must match; sheets and a Back bar for the iPhone app; exits that work without agreeing. Stage 1's
verified 5-persona review (its §4) added: no one agrees to an inaccurate line (the money sentence comes out), owners
get the published privacy address for their data, and a pre-existing LLC invite-token exposure (next sprint, §4).
Its suggested Terms 18+ line was dropped in rev 4 (an eligibility rule needs notice to existing accounts).

## 1. Objective
Our Terms and Privacy Policy are "browsewrap" today: links only, no "I agree", no record (rules map "Contract
formation" = GAP; Gate 1 item 1). Make every **new** person agree before they use Domus, on a screen they already
fill in, enforce it at pages, server actions and APIs, and keep a server-written, reproducible record of exactly what
they agreed to.

## 2. Context (HEAD `89afc37`)
- **Self sign-up:** `apps/web/components/auth/create-account-form.tsx` (131) runs `supabase.auth.signUp` in the
  browser (52–60, `data: { role }`); "already registered" shows the check-email screen (62–65). Server-side auth
  precedent: `app/actions/login.ts` (76), `app/actions/forgot-password.ts` (45, `NEXT_PUBLIC_APP_URL ??
  "https://domusbase.com"`). The `handle_new_user` trigger creates `profiles` (role from metadata, default tenant).
- **Invites:** server-created login; emailed link → `/auth/callback` (signs in, marks the invite accepted) →
  `/complete-profile` (52) → `complete-profile-form.tsx` (118): browser `updateUser({ password })` (43), then
  `/onboarding` (57).
- **LLC partner:** `app/join-llc/page.tsx` (328; create form 269–302, `minLength={6}`) → `createAccountToJoinLLC`
  (`app/actions/llc-invitations.ts` 431–500; file is 500 lines); schema `lib/validations-entity.ts` 334–345
  (`min(6)`). Supabase requires 8+ with letters and numbers (`validatePassword`, `lib/password-validation.ts`).
- **Guards:** `lib/auth.ts` (155) `getAuthenticatedUser()` (20–30) → 21 pages (13 direct, 8 via `requireRole`), plus
  `app/api/account/export/route.ts` (48) and `lib/owner-ytd.ts`. Server actions: `requireAuth`
  (`app/actions/auth-helpers.ts`, 43) in 56 files. API routes under `app/api` (24): 5 cron (`CRON_SECRET`), 2
  webhooks, health/preview routes, and user routes that call `supabase.auth.getUser()` themselves or through a lib
  loader (`loadStatementDownload`). `lib/route-resolver.ts` (98): `blockedPaths` (11–14), `isNextAllowedForRole`,
  `resolveAuthRoute`.
- **Browser database access:** signed-in clients may write only the 237g keep map
  (`supabase/migrations/20261023_sprint237g_client_write_grants.sql` lines 29–51), each under RLS.
- **Legal pages:** `app/terms/page.tsx` (100), `app/privacy/page.tsx` (136): `LandingShell` (no header, no way
  back), "Last updated: October 18, 2026" (15), banner (17) "Early access version. A lawyer is reviewing these terms.
  We will tell you before a final version takes effect."; Terms "Changes" (94): "If we change these terms in a way
  that matters, we will tell you in the app or by email before the change takes effect." Test:
  `app/__tests__/legal-pages.test.tsx` (83).
- **Exits:** `components/settings/your-data-settings.tsx` (51), `delete-account-section.tsx` (46,
  `requestAccountDeletion` → `requireAuth`), `signOut` (`app/actions/auth.ts`, no `requireAuth`).
  `isNativeAppServer()` (`lib/native-app-server.ts`) detects the iPhone app (`DomusApp/1` user agent).
- **iPhone app:** `DomusNavigationDelegate.swift` (146–161) loads `target="_blank"` domusbase.com links in the main
  web view; no back gesture. `components/ui/modal-overlay.tsx` (123) is an accessible dialog.
- **E2E:** `apps/web/tests/e2e/helpers.ts` (83) `loginAsRole` (37–40). `scripts/smoke-web.sh` (122) guard list
  (27). Smoke and App Review accounts are older accounts, so they never see `/agree` in this sprint.
- **Database (Claude's; applied live before the deploy; Codex must not edit):**
  `supabase/migrations/20261105_sprint259a_legal_acceptances.sql`:
  - `legal_document_versions(document [terms | privacy], version [YYYY-MM-DD], sha256, published_at)`, primary key
    (document, version), unique (document, version, sha256); append-only; no client access.
  - `legal_acceptances(id, profile_id → profiles on delete cascade, terms_document [generated 'terms'],
    terms_version, terms_sha256, privacy_document [generated 'privacy'], privacy_version, privacy_sha256, source
    [sign_up | invite | llc_invite | agree_page], role_at_acceptance [owner | manager | tenant], client [web |
    ios_app], email_hmac [64 hex], accepted_at default now(), recorded_at default now(), app_commit [null or 7–40
    hex])`; unique (profile_id, terms_version, privacy_version); `accepted_at <= recorded_at`; **foreign keys to
    `legal_document_versions` for both documents** (an unpublished version or a different hash can't be recorded).
    RLS: own rows SELECT only; anon nothing; no client writes; triggers refuse UPDATE, TRUNCATE and DELETE except the
    profile cascade and the purge function.
  - `legal_holds(profile_id, reason, created_at, released_at)` and `purge_expired_legal_acceptances(p_approved_by)`
    (security definer, service role only): deletes rows whose account-deletion request is `done` with `handled_at`
    more than 10 years ago, skips active holds, writes an `audit_logs` row.
  - `profiles_keep_legal_evidence`: a non-tester profile with agreement records or an active hold can't be deleted.
  - Rolled-back dry run 2026-10-30 (`supabase/tests/sprint259a_legal_acceptances.sql` after the migration):
    `SPRINT259A_SQL_TESTS_PASSED`, 36 checks (incl. unpublished version and wrong hash refused, published version
    immutable, one hash per version, purge 10-year anchor + hold + audit + approver, service role can't fake the purge
    flag, anonymization keeps rows, the account wipe refuses the table, cascade).
  - **Publishing:** after Codex builds the archive files, Claude writes and applies
    `supabase/migrations/20261106_sprint259a_publish_legal_2026_10_30.sql` (two rows with the archive hashes) before
    the deploy, and sets `LEGAL_RECORD_HMAC_KEY` (random, 32 bytes) in Vercel and `apps/web/.env.local`.

## 3. In scope
Registry + frozen text archive; documents moved into components (verbatim), banners, Back bar; agreement checkbox +
sheets; sign-up server action; invite and LLC records; the gate on pages, actions and APIs with allowlists and
structural tests; `/agree`; exits; fresh-account E2E spec; smoke helper.

## 4. Out of scope (decided)
- **Older accounts** (created before `AGREEMENT_REQUIRED_FROM`) are not gated or asked in this sprint; the Terms
  rewrite asks them once, after the notice our "Changes" clause promises. Their records start then.
- **Direct database calls from a browser** (PostgREST with the anon key and a session) are not gated: they reach only
  the person's own RLS-scoped rows and the 237g keep-map writes. The sprint therefore claims a page, server-action and
  API gate, not a database gate. A database-level check is a follow-up if Gate 1 review asks for it.
- When an invite counts as accepted stays at link click (`/auth/callback`; race-hardened in 237c-5). The invitee
  cannot open any page, action or API except the exits before agreeing.
- Terms/Privacy wording beyond R2 step 2; IP address or browser string in the record (Supabase Auth's own session
  table keeps both — the Privacy rewrite must say so); emails or notifications; `apps/ios`; the migration, rollback
  and SQL test files.
- For older accounts (the rewrite, when they are first asked): links to the lease and receipt PDFs, "Turn off
  autopay" and the landlord's contact details on `/agree`. New accounts have no payment history or autopay yet.
- Pre-existing, found by the Stage 1 review: LLC invite tokens are readable by other members of that LLC
  (`llc_invitations.token` column grant + DTO). Live exposure today: none (one pending invite, expired). Fixed in the
  next sprint (259b); until then the owner sends no LLC invites, and an `llc_invite` record is only as strong as that
  token's secrecy.

## 5. Exact files expected to change
New (apps/web): `lib/legal-versions.ts`; `lib/legal-text.ts`; `lib/legal-acceptance.ts` (`import "server-only"`);
`legal-archive/terms/2026-10-30.txt`; `legal-archive/privacy/2026-10-30.txt`; `app/actions/legal-acceptance.ts`;
`app/actions/sign-up.ts`; `app/agree/page.tsx`; `components/legal/{terms-document,privacy-document,
legal-document-sheet,legal-agreement-checkbox,agree-form,decline-options,legal-back-bar}.tsx`;
`tests/e2e/agreement-flow.spec.ts`; tests `lib/__tests__/legal-versions.test.ts`,
`app/actions/__tests__/llc-invite-hold.test.ts`,
`lib/__tests__/legal-acceptance.test.ts`, `lib/__tests__/agreement-enforcement-inventory.test.ts`,
`app/actions/__tests__/legal-acceptance.test.ts`, `app/actions/__tests__/sign-up.test.ts`,
`app/actions/__tests__/auth-helpers-agreement.test.ts`, `app/agree/__tests__/page.test.tsx`,
`components/__tests__/legal-agreement-forms.test.tsx`.
Changed (apps/web): `lib/auth.ts`, `lib/route-resolver.ts`, `app/actions/auth-helpers.ts`,
`app/actions/account-deletion-request.ts` (exit variant only), `components/auth/create-account-form.tsx`,
`components/auth/complete-profile-form.tsx`, `app/complete-profile/page.tsx`, `app/join-llc/page.tsx`,
`app/actions/llc-invitations.ts`, `app/actions/llc-invitations-support.ts`, `lib/llc-invitations.ts`,
`lib/validations-entity.ts`, `app/terms/page.tsx`, `app/privacy/page.tsx`,
`tests/e2e/helpers.ts`, and each signed-in route under `app/api/**/route.ts` (one agreement check line, R7); existing
tests only as the change requires (and `tests/e2e/helpers/auth.ts` `createTestUser` marks its users `is_tester`,
so the profile guard lets e2e cleanup delete them). Repo root: `scripts/smoke-web.sh`; apps/web: `scripts/agreement-e2e-accounts.mjs`, `scripts/agreement-e2e-guards.mjs`,
`scripts/__tests__/agreement-e2e-guards.test.ts` (new), `.gitignore` (add `.agreement-e2e.json`); `docs/grooming.md` only for R12.
Any other file: explain why in the report.

## 6. Implementation requirements
**R0 Enforcement map** (put this table in the report, filled in):
| Entry point | Gate | Exits that skip it (allowlist) |
| --- | --- | --- |
| Signed-in pages (`getAuthenticatedUser`, `requireRole`) | R5 | `/agree`, `/complete-profile` |
| Server actions (`requireAuth`) | R6 | `requestAccountDeletion`, `agreeToTerms`, `recordInviteAgreement` |
| Signed-in API routes | R7 | `/api/account/export`, `/api/pdf/receipt/[chargeId]`, `/api/pdf/receipts`, `/api/pdf/lease-summary/[leaseId]` |
| Public, cron, webhook routes and public actions (login, forgot password, sign-up, LLC join, join resend, sign out) | none needed | listed in the I1/I2 inventories with a reason |
| Browser PostgREST | none (residual, §4) | — |
| LLC invites (send, resend, accept, join) | paused until 259b (R12b) | — |

**R1 Registry** (`lib/legal-versions.ts`, client-safe):
`LEGAL_DOCUMENTS = { terms: { current: "2026-10-30", versions: { "2026-10-30": "<sha256>" } }, privacy: { … } }`
(sha256 = lowercase hex of the UTF-8 bytes of the archive file for that version), `AGREEMENT_REQUIRED_FROM =
"2026-10-30T00:00:00.000Z"`, `formatLegalDate("2026-10-30")` → `"October 30, 2026"` (UTC, en-US). A comment says:
never edit a published archive file or its hash; publish a new version instead.

**R2 Documents, archive, banners, Back bar** (in this order):
1. Move each page's header and sections **verbatim** into `TermsDocument` / `PrivacyDocument` (a `<div>`, no
   `<main>`); pages render `<LandingShell><main className="…same…"><LegalBackBar /><TermsDocument /></main>
   </LandingShell>`. Run the verbatim check (§7) before step 2.
2. Banners become exactly — Terms: **`These terms are in effect now. We will tell you before we change them.`**
   Privacy: **`This policy is in effect now. We will tell you before we change it.`** "Last updated" uses R1. One more
   Terms edit so no one agrees to an inaccurate line: in "Payments", delete only the sentence `Domus does not hold
   your money.` (the rules map marks it inaccurate for bank payments). No other wording change (no eligibility
   rule: the rewrite adds it with notice); "Who we are" stays as is until the rewrite names the LLC together with the Stripe entity switch.
3. `legalDocumentText(element)` (`lib/legal-text.ts`): `renderToStaticMarkup` → first, before any tag stripping, every
   `<a …href="X"…>T</a>` becomes `T <X>` with `X` exactly as rendered (so every link target is in the archived
   text); `li` items start with `- `; newline after each `p`,
   `h1`–`h3`, `li`; strip other tags; decode `&amp; &lt; &gt; &quot; &#x27; &#39;`; collapse spaces per line; trim;
   drop empty lines; join with `\n`; end with one `\n`. Write the output for each document to its archive file (the exact text a reader
   sees), and put each file's SHA-256 in R1.
4. `LegalBackBar` (client): sticky, `padding-top: env(safe-area-inset-top)`, one ≥ 44 px button **`‹ Back`**:
   same-origin `document.referrer` → `history.back()`; otherwise `location.assign("/login")`.

**R3 Checkbox + sheets.** `LegalAgreementCheckbox({ id, checked, onCheckedChange, required?, invalid?,
describedBy? })`: native `<input type="checkbox" name="agree" value="yes">`, unchecked by default, 24 × 24 px, accent
color, `<label htmlFor>` exactly **`I am 18 or older. I agree to the Terms of Service.`** (16 px,
`text-[var(--ink)]`). Under it the notice line **`Our Privacy Policy explains how we use your data.`** and two ≥ 44 px
`type="button"` controls, underlined accent text: **`Read the Terms`** and **`Read the Privacy Policy`**; each opens
`ModalOverlay` (label "Terms of Service" / "Privacy Policy") with the current document in a `bg-[var(--surface)]`
panel and a top **`Close`** button; focus returns to the opener. `aria-invalid` + `aria-describedby` when an error
shows. Text ≥ 4.5:1 in both themes.

**R4 Record helper** (`lib/legal-acceptance.ts`):
- `readOwnLegalAcceptances(supabase)` (session client; `select("profile_id, terms_version, privacy_version")`);
  `legalStatus(userId, rows)` → `{ accepted, hasEarlier }` (rows of another profile ignored);
  `agreementRequired(user)` → `Date.parse(user.created_at) >= Date.parse(AGREEMENT_REQUIRED_FROM)`;
  `versionsMatch(terms, privacy)`; `agreementClient()` → `"ios_app" | "web"` via `isNativeAppServer()`.
- `checkAgreement(supabase, user)` → `"exempt" | "accepted" | "required"` (exempt = older account, no read awaited;
  a read error for a required account throws).
- `recordLegalAcceptance(admin, { profileId, email, source, client })`: reads `profiles.role` for `profileId` (admin)
  and records it as `role_at_acceptance` (missing profile → not saved, code `no_profile`); `email_hmac` =
  HMAC-SHA256 (hex) of `email.trim().toLowerCase()` with `process.env.LEGAL_RECORD_HMAC_KEY`, and
  `email_hmac_key_version` = the constant `LEGAL_RECORD_HMAC_KEY_VERSION = 1` (missing key or email → not saved,
  codes `no_hmac_key` / `no_email`). The `email` argument must come from a trusted identity (rev 4 item 1), never
  from form data; `client` is as reported by the user agent (not proof of the device); upsert `{ profile_id,
  terms_version, terms_sha256, privacy_version, privacy_sha256, source, role_at_acceptance, client, email_hmac,
  email_hmac_key_version, app_commit }` (never the generated `terms_document`/`privacy_document`) with
  `{ onConflict: "profile_id,terms_version,privacy_version", ignoreDuplicates: true }`; never sends
  `accepted_at`/`recorded_at`; `app_commit` = `VERCEL_GIT_COMMIT_SHA` if `/^[0-9a-f]{7,40}$/`, else `null`. Returns
  `{ ok: true }` or `{ ok: false, code }`; never throws on a DB error; logs `[legal] acceptance not saved` with
  `{ source, code }` only.
- `agreeDestination(user, rawNext)`: `resolveAuthRoute({ hasSession: true, ...getAuthState(user.id) })`; a safe
  `next` only when that is the role home and `isNextAllowedForRole` passes.
- How each `source` identifies the person (document in a comment): `sign_up` = the registration request that created
  this login (email ownership is proven later by Supabase Auth's confirmation for the same id); `llc_invite` = the
  same, through an emailed one-time invitation token bound to that email; `invite` and `agree_page` = a signed-in
  session (an invitee's session comes from their emailed link).

**R5 Page gate** — `getAuthenticatedUser(options?: { legal?: "require" | "skip" })`, default `"require"`: start the
read in parallel as a settled promise; no user → today's `/login` redirect; `"skip"` → no read; `checkAgreement` →
`exempt`/`accepted` return the user; `required` → `redirect("/agree")` or `"/agree?next=" + encodeURIComponent(next)`
(`getSafeNextPath(x-domus-path)`). `"skip"` callers: `app/agree/page.tsx`, `app/complete-profile/page.tsx`,
`app/api/account/export/route.ts`.

**R6 Action gate** — `requireAuth(...roles)` runs `checkAgreement` after the role check: `required` → the R5
redirect. New `requireAuthForExit(...roles)` = today's `requireAuth` exactly (its `user.email` comes from
`supabase.auth.getUser()`); used only by `requestAccountDeletion`,
`agreeToTerms` and `recordInviteAgreement`.

**R7 API gate** — `agreementApiResponse(supabase, user)` → `null` when exempt/accepted; else `NextResponse.json({
error: "Please agree to the Terms first." }, { status: 403, headers: { "Cache-Control": "no-store" } })`. Every
signed-in route not on the R0 allowlist calls it right after its user check (inside a shared loader where the route
uses one, e.g. `loadStatementDownload`).

**R8 Sign-up action** (`app/actions/sign-up.ts`, `signUpAction(prev, formData)`; fields `email`, `password`,
`confirmPassword`, `role`, `agree`, `termsVersion`, `privacyVersion`):
1. Rate limits `signUp:ip:<x-forwarded-for first>` 10/60 s and `signUp:email:<lowercased>` 3/60 s → **`Too many
   tries. Please wait a minute.`**
2. Validate in order, each failure returning its copy with **no** Auth or DB call: email → `Enter a valid email
   address.`; `validatePassword(...).isValid` → its first error; confirm → **`Passwords do not match yet.`**;
   `agree === "yes"` → **`Check the box to agree first.`**; versions → **`We just updated the Terms. Reload the page to
   read them.`** Role outside owner/manager/tenant → `"owner"` (as today).
3. `createClient().auth.signUp({ email, password, options: { emailRedirectTo:
   \`${NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"}/auth/callback?next=${encodeURIComponent("/" + role)}\`,
   data: { role } } })`.
4. Error: "already registered"/`user_already_exists` → `{ success: true, email }`; else `{ success: false, error:
   mapAuthErrorMessage(message) }`.
5. Record only when `data.user.identities.length > 0`, `Date.parse(data.user.created_at) >= Date.now() - 120_000`
   and `data.user.email` (lowercased) equals the submitted email (else not saved, code `email_mismatch`):
   `recordLegalAcceptance(admin, { profileId: data.user.id, email: data.user.email, source: "sign_up", client })`.
6. Return `{ success: true, email }` (today's check-email screen) whether or not the record saved (R13).

**R9 Agree actions** (`app/actions/legal-acceptance.ts`; `requireAuthForExit("owner", "manager", "tenant")`, then
`checkRateLimit(\`<name>:${user.id}\`, 10, 60_000)` → the R8 rate copy):
- `agreeToTerms(prev, formData)`: `agree !== "yes"` → **`Check the box to agree first.`**; versions mismatch → the R8
  copy; both with no writes. Record `source: "agree_page"` with `email: user.email` from `requireAuthForExit` (a posted `email` field is
  ignored); not ok → **`We could not save this. Please try
  again.`**; ok → `redirect(await agreeDestination(user, formData.get("next")))`. Any `catch` starts with
  `unstable_rethrow(error)`.
- `recordInviteAgreement({ agreed, termsVersion, privacyVersion })`: same checks; `source: "invite"`; returns
  `{ success: true }` or the error copy.

**R10 `/agree` page** (server, `dynamic = "force-dynamic"`, robots noindex): user via `{ legal: "skip" }`; accepted →
`redirect(await agreeDestination(...))`. Else a centered card like `/complete-profile`:
- no earlier record: h1 **`Please agree to our Terms`**, body **`Please read our Terms and Privacy Policy. Then check
  the box to keep going.`**; earlier version on record: h1 **`We updated our Terms`**, body **`Please read the new
  Terms and Privacy Policy. Then check the box to keep using Domus.`**; tenants also see **`Our Terms do not change
  your lease.`**
- `<AgreeForm next={safeNext} />` (client, `useActionState(agreeToTerms, null)`, hidden `next`, `termsVersion`,
  `privacyVersion`; R3 checkbox; `SubmitButton` **`Continue`**, never disabled for the box; an empty-box submit
  shows **`Check the box to agree first.`** in `Alert variant="error" role="alert"`, sets `aria-invalid`, focuses
  the box and calls no action); a **`Need help?`** link to `/support`; `<DeclineOptions role={role} />`.

**R11 `DeclineOptions({ role })`** (server): `<details>` with summary **`Don't want to agree?`**, body **`You can sign
out, or ask us to delete your account.`**, a **`Sign out`** button (form action `signOut`). Tenants then see **`Not
ready? Ask your landlord about other ways to pay rent.`** and **`Deleting your account does not end your lease.
Download your data first.`** above `<YourDataSettings />`; managers `<YourDataSettings />`; owners **`Email
privacy@domusbase.com for your data.`** (the address the live Privacy page already gives) above
`<DeleteAccountSection />`. On `/agree` and `/complete-profile`.

**R12 Forms:**
- **Sign-up:** step 2 posts to `signUpAction` (`useActionState`) with hidden `role`, `termsVersion`,
  `privacyVersion`; R3 checkbox directly above **Create account**; the password `canSubmit` stays; an empty-box
  submit behaves like R10; success shows today's check-email screen; remove the form's "Legal links" nav. The browser
  no longer calls `signUp`.
- **Complete Setup:** the page passes `needsAgreement` (no current-version row) and renders `DeclineOptions`. If
  true: R3 checkbox above **Complete Setup**; an empty-box submit behaves like R10; `recordInviteAgreement` runs
  **before** `updateUser`; its error shows and stops. If false: no checkbox, no call.
- **LLC join:** R3 checkbox with `required` (works without JavaScript) and hidden versions above the button; both
  password inputs `minLength={8}`. Schema: `agree: z.literal("yes", { errorMap: () => ({ message: "Check the box to
  agree first." }) })`, version strings, password `.min(8)` + `.refine` on `validatePassword` → **`Use at least 8
  characters with a capital letter and a number.`** Action: mismatch → `buildJoinRedirect(token, "signup", "<R8
  mismatch copy>")` before `createUser`; after `createUser`, `recordLegalAcceptance(admin, { profileId, email: <invitation row email, which must equal
  createdUser.user.email, else not saved>, source: "llc_invite", client })`. `llc-invitations.ts` ≤ 505 lines; past 500, add a `docs/grooming.md` split entry.

**R12b LLC invite hold (until 259b):** `isLlcInvitesPaused()` in `lib/llc-invitations.ts` returns the module
constant `LLC_INVITES_PAUSED = true` (no env var, header or query can change it). When true:
`sendLLCInvitations` and `resendLLCInvitation` return **`Partner invites are paused for a safety fix. Please try again
in a few days.`** right after their auth check, with no writes and no email; `resolveInvitationForAcceptance`
(`app/actions/llc-invitations-support.ts`) returns the error **`This invite is paused for a safety fix. Please try
again in a few days.`**, so `acceptLLCInvitation`, `signInToJoinLLC` and `createAccountToJoinLLC` stop before any
write; `/join-llc` shows that sentence instead of its forms. Cancelling an invite still works. `llc-invitations.ts`
may grow to ≤ 510 lines with the R12 grooming entry. Tests: LP1–LP4 use the real value; L1–L5 mock
`isLlcInvitesPaused()` to return `false`.

**R13 Partial states and recovery** (each needs the named test):
| Flow | Partial state | Result |
| --- | --- | --- |
| Sign-up | Auth ok, record fails | Success screen; at first sign-in every page, action and API sends the person to `/agree` (S7, G3) |
| Sign-up | Auth fails | No record, error shown (S6) |
| Sign-up | Record ok, email never confirmed | Row for an account that can't sign in; harmless; no second row on retry (S3b) |
| Invite | Record fails | Error, password not set, retry; ignore-duplicates prevents a second row (F2) |
| Invite | Record ok, `updateUser` fails | Error; retry records nothing new and sets the password (F2b) |
| LLC | `createUser` ok, record fails | Flow continues; first page or action sends the person to `/agree` (L4) |
| LLC | Record ok, `finalizeInvitationAcceptance` fails | Today's error redirect; the record stands (they agreed) (L4b) |
| `/agree` | Record fails | Error on the page; no redirect, no loop (A5) |
| Any | Version changed mid-page | Nothing written; reload message (S2, A2, I1, L2) |
No path gives a required account unrestricted access without a current row (G3, G10, G12).

**R14 Retention** (comment in `lib/legal-acceptance.ts`; Claude puts the same in the account-deletion runbook and the
Privacy rewrite): rows hold no name, email or phone; they stay after account closure (the profile is anonymized, never
deleted) for 10 years after closure, then a reviewed, owner-approved purge removes them; a legal hold excludes a
profile from the purge.

**R15 Harness:** `loginAsRole` also accepts `/agree` (checks the box by its label, clicks **Continue**, waits for the
role URL). `scripts/smoke-web.sh`: add `/agree` to the unauthenticated guard list. `tests/e2e/agreement-flow.spec.ts`
reads `AGREEMENT_E2E_*` variables and **fails** (does not skip) when any is missing; it covers the E2E criteria
against `APP_URL`. `apps/web/scripts/agreement-e2e-accounts.mjs` (Claude runs it, Codex never does; guard logic in
`apps/web/scripts/agreement-e2e-guards.mjs`, unit-tested) with commands, each requiring `--project <ref>` equal to
the project in `NEXT_PUBLIC_SUPABASE_URL`:
`create` — owner and tenant logins `richard.ace.smith+259a-<runId>-{owner,tenant}@gmail.com` with random passwords,
`email_confirm: true`, `profiles.is_tester = true`; **reserves** (does not create) the sign-up email and a random
password; writes the `AGREEMENT_E2E_*` variables to `apps/web/.env.local` and the created UUIDs to the run manifest
`apps/web/.agreement-e2e.json` (gitignored), printing no secrets. `confirm-signup` — finds the Auth user for the
reserved email, requires it to be created in the last 15 minutes and not invited, sets `profiles.is_tester = true`,
confirms it with `admin.updateUserById(id, { email_confirm: true })`, adds its UUID to the manifest. `check` — per
manifest account: Auth user exists, profile role, and the `legal_acceptances` rows (count, source, role, client).
`cleanup` — deletes only manifest UUIDs that also match the run's email pattern, have `is_tester`, and belong to the
project; if any check fails it deletes nothing; it deletes the Auth user and then the profile (its rows cascade), never
`legal_acceptances` directly, and reports what it removed.

**R16 Who the 2026-10-30 text binds:** the edits (the two status banners; deleting one inaccurate sentence from
"Payments"; nothing else) change no right, duty, fee, liability, dispute term or data use, so they are
not a change "that matters" under the live "Changes" clause and apply to everyone from the deploy (the effective
date; "Last updated" shows the revision date). Older accounts click only when the rewrite (a change that matters)
gives notice first.

No undo by design (append-only record). Leaving = sign out or the deletion request, on `/agree` and `/complete-profile`.
The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
user needs to think about what to do, the UI needs to be clearer. All copy above is exact; write no other new text.

## 7. Validation
- `cd apps/web && npx vitest run lib/__tests__/legal-versions.test.ts lib/__tests__/legal-acceptance.test.ts
  lib/__tests__/agreement-enforcement-inventory.test.ts app/actions/__tests__/legal-acceptance.test.ts
  app/actions/__tests__/sign-up.test.ts app/actions/__tests__/auth-helpers-agreement.test.ts app/agree
  components/__tests__/legal-agreement-forms.test.tsx app/__tests__/legal-pages.test.tsx lib/__tests__/auth.test.ts
  lib/__tests__/safe-next-path.test.ts app/api lib/__tests__/llc-invitations.test.ts components/__tests__/login-form.test.tsx app/login`
- After R2 step 1 only: `node apps/web/scripts/verify-verbatim-split.mjs --base 89afc37 --old
  apps/web/app/terms/page.tsx --facade apps/web/app/terms/page.tsx --new apps/web/components/legal/terms-document.tsx`
  (same for privacy). Paste both outputs in the report.
- `npm run gate:web` from the repo root. `npx playwright test tests/e2e/agreement-flow.spec.ts --list` (compiles).

## 8. Acceptance criteria (named tests on real code; `toEqual` for payloads and copy, L-030)
`expectNoWrites(db)` = no insert/upsert/update/delete on any table and no RPC; `expectNoAuthCalls` = no `signUp`.
- **V1** registry: current versions `"2026-10-30"`; every registry entry has an archive file whose SHA-256 equals it;
  every archive file has an entry; `formatLegalDate` → `"October 30, 2026"`. **V2** `legalDocumentText(<TermsDocument
  />)` equals the current archive file byte for byte (same for privacy) — so changed text or a changed link target
  with an unchanged version fails (message: "Legal text changed: publish a new version"); every `href` in each document's rendered markup appears
  verbatim in its archive as `text <href>`, and the Terms archive contains `support@domusbase.com`. **V3** the sheet, the page and `recordLegalAcceptance`
  all use the current registry version and hash (Claude adds D2: the database's published rows equal the registry). **V4** both pages: `Last updated: October 30, 2026`, the R2 banners
  exactly, no "lawyer" or "Early access", same h2 list; Terms has no "does not hold your money" and no new eligibility
  line. **B1** Back bar: same-origin referrer → `history.back()`;
  else `location.assign("/login")`; name "‹ Back".
- **G1** required account + current row → returned. **G2** required, older row only → `redirect("/agree?next=%2Ftenant")`
  (`x-domus-path: /tenant`). **G3** required, no rows → `/agree…`. **G3b** created `2026-10-30T12:00:00Z` (after the
  cutoff, before the deploy) with no rows → `/agree…`. **G4** created `2026-10-29T23:59:59Z`, no rows → returned, also
  when the read fails; created exactly at the cutoff → required. **G5** another profile's row ignored. **G6** `"skip"`
  never reads. **G7** no user → `/login` as today; a rejected read raises no unhandled rejection. **G8** required +
  read error → throws. **G9** role changed after agreeing → still accepted (versions, not role).
- **G10** `requireAuth` for a required account without a row → R5 redirect; with a row → returns; older account → no
  read. **G11** `requireAuthForExit` never reads. **G12** a gated API route returns the R7 403 for a required account
  without a row and its normal response with one; each allowlisted route works without a row.
- **I1** inventory: every `"use server"` file under `app/actions` either calls `requireAuth(` in each exported
  function or is listed with a reason in `PUBLIC_ACTION_FILES`; only the three R6 exits call `requireAuthForExit`.
  **I2** every `app/api/**/route.ts` is listed in `API_ROUTE_INVENTORY` as `gated` (and calls
  `agreementApiResponse` itself or through a named loader the test also reads), `exit`, `cron`, `webhook` or `public`,
  matching R0. **I3** every `app/**/page.tsx` is listed in `PAGE_INVENTORY` as `gated` (calls `getAuthenticatedUser`
  or `requireRole` with the default), `exit` (`/agree`, `/complete-profile`) or `public` with a reason; a new
  unlisted page fails the test. **N2** for a required account without a row, each of these leaves `expectNoWrites`
  and `expectNoAuthCalls` true and returns the agreement redirect or 403: `setupAutopay`, the rent checkout action
  (`lib/charge-checkout.ts` caller), a maintenance-ticket create action, an owner property update action,
  `/api/owner/section-data`, `/api/ai/chat` — and none of them calls Stripe, sends an email, touches storage,
  enqueues a job or calls the AI client (each mocked and asserted not called).
- **S1** unchecked → copy, `expectNoAuthCalls`, `expectNoWrites`. **S2** mismatch → same, mismatch copy. **S3** valid
  → `signUp` args `toEqual({ email, password, options: { emailRedirectTo:
  "https://domusbase.com/auth/callback?next=%2Fowner", data: { role: "owner" } } })`, then the role read and one
  upsert `toEqual({ profile_id, terms_version, privacy_version, terms_sha256, privacy_sha256, source: "sign_up",
  role_at_acceptance: <role from profiles>, client: "web", email_hmac: <HMAC of the email with the test key>,
  app_commit })` with the onConflict options. **S11** `LEGAL_RECORD_HMAC_KEY` unset → not saved, code
  `no_hmac_key`, sign-up still succeeds. **S12** posted role `admin` → `signUp` `data.role` is `"owner"` and the
  record uses the profile's role. **S13** `signUp` returns a user without an email → not saved (`no_email`).
  **S14** `signUp` returns a different email than submitted → not saved (`email_mismatch`). **S15** the payload has
  `email_hmac_key_version: 1` and the HMAC of the returned email. **S3b** a
  repeat sign-up for the same unconfirmed email (old `created_at`) → no upsert. **S4** `identities: []` → success, no
  upsert. **S5** `created_at` 3 minutes old → no upsert. **S6** Auth error → mapped copy, no upsert. **S7** record
  fails → success + one log. **S8** rate limits. **S9** `DomusApp/1` user agent → `client: "ios_app"`. **S10** profile
  role differs from the posted role → the profile's role is recorded.
- **A1** `agreeToTerms` unchecked → copy, no writes. **A2** mismatch → copy, no writes. **A3** valid → one upsert
  (`source: "agree_page"`, no `accepted_at`) then redirect to an allowed `next`. **A4** `/agree` or a disallowed
  `next` → role home; not onboarded → `/onboarding`. **A5** save error → copy, no redirect. **A6** rate limit.
  **A7** a redirect thrown in the `try` is rethrown (L-028). **A8** a posted `email` field is ignored: the HMAC
  is computed from the session user's email. **R1t** `recordInviteAgreement` unchecked / mismatch /
  valid (`source: "invite"`) / save error.
- **P1** first-time copy; **P2** update copy; **P3** tenant line for tenants only; **P4** accepted → redirect;
  **P5** `DeclineOptions` copy and per-role content; **P6** box unchecked, Continue enabled, empty submit → error,
  `aria-invalid`, focus, no action call.
- **F1** sign-up: label and notice text exact; empty-box submit → error, no action call; no "Legal links" nav; the
  browser client never calls `signUp`. **F2** Complete Setup: box when `needsAgreement`; `recordInviteAgreement` before
  `updateUser`; its error → no `updateUser`. **F2b** (no reload) `updateUser` error after a saved record → error; the box is still shown; a retry calls
  `recordInviteAgreement` again (no duplicate thanks to the upsert) and then `updateUser`. **F2d** (after reload) the
  page passes `needsAgreement` false → no box, no `recordInviteAgreement`, only `updateUser`. **F2c** `needsAgreement`
  false → no box, no call. **F3** each sheet: title, Close, focus returns, box unchanged.
- **L1** schema: missing `agree` → its copy; weak password → the R12 copy. **L2** mismatch → redirect with the copy,
  no `createUser`. **L3** success → one record call `{ source: "llc_invite" }` before the redirect. **L4** record
  failure → still redirects. **L4b** finalize failure after a saved record → today's error redirect. **L5** inputs
  `minLength` 8. **LP1** with the hold on, `sendLLCInvitations` and `resendLLCInvitation` return the R12b owner copy,
  with no insert and no email. **LP2** `resolveInvitationForAcceptance` returns the invitee copy; `acceptLLCInvitation`,
  `signInToJoinLLC` and `createAccountToJoinLLC` make no Auth call and no write. **LP3** `/join-llc` shows the invitee
  copy and no form. **LP4** cancelling still works.
- **N1** `getSafeNextPath("/agree")` and `("/agree?next=%2Ftenant")` → `null`.
- **E2E-S1** normal sign-up, in two phases: (`AGREEMENT_E2E_PHASE=signup`) the reserved email registers through the
  form, with the hidden role changed to `admin` before submit and the box checked → check-email screen; Claude runs
  `confirm-signup` and `check` (Auth user exists, profile role `owner`, exactly one `sign_up` row with role `owner`);
  (`AGREEMENT_E2E_PHASE=after-confirm`) it signs in and lands on `/onboarding` or the role home, never `/agree`. **E2E-R1** recovery: the fresh owner (no row) signs in → `/agree`; empty Continue →
  error; Read the Terms → sheet → Close; check → Continue → `/onboarding` or `/owner`; the next sign-in goes straight
  home; `check` shows one `agree_page` row. **E2E-T1** fresh tenant: `/agree` shows the tenant line and the exits
  (Download my data, Delete my account, Sign out); Sign out works without agreeing. **E2E-A1** `/api/owner/section-data`
  returns 403 before agreeing and 200 after. **E2E-B1** `/terms` Back bar returns to the previous page. **E2E-C1** no
  console errors on `/agree`. **E2E-M1** 375 px: box and Continue visible without horizontal scroll. **E0** the spec
  fails with "Set AGREEMENT_E2E_* (scripts/agreement-e2e-accounts.mjs create)" when a variable is missing.
- **AS1–AS5** guard unit tests (AS5: a `cleanup` re-run after an interrupted one
  finishes the manifest's remaining accounts and touches nothing else): `cleanup` refuses (and deletes nothing) when `--project` differs from the URL,
  a UUID is not in the manifest, an email doesn't match the run pattern, or `is_tester` is false; `create` never
  creates the sign-up account.
- **D1** (Claude, live SQL after apply, rolled back): `supabase/tests/sprint259a_legal_acceptances.sql` passes (27
  checks, incl. anonymization, the wipe refusal and the purge). **D2** (Claude, before deploy): the published rows in
  `legal_document_versions` equal the registry; a live record after deploy references them. **D3** (Claude, after the
  E2E run): `cleanup` removed only the test accounts it created. **D4** (Claude, at apply): the live
  `handle_new_user` still maps any role outside owner/manager/tenant to `tenant`. **D5** (Claude, after deploy): the
  first production record has `email_hmac_key_version` 1, the published hashes and the deployed commit.

## 9. Report format
Compact status only: the filled R0 table; files changed (lines before → after); each criterion → test name; gate
result; verbatim-check output; token count. Do NOT include 'Claude prompt' or 'recommended next steps for Claude'
sections. Report compact status only.

## 10. Constraints
- Lines ≤ 140 characters. No file over 500 lines except `llc-invitations.ts` (≤ 510, R12/R12b).
- Every Supabase call's error is checked (L-002). Unauthenticated actions (sign-up) rate-limit and validate before any
  Auth or DB call. Authenticated actions first get the trusted user (`requireAuth*`), then rate-limit per user and
  validate before any write.
- `user_metadata` and posted roles are never trusted for the record; identity comes only from
  `supabase.auth.getUser()` or the user that `signUp`/`createUser` just returned.
- No new dependencies. Tests never put `expect` inside a mock implementation (L-028).

## 11. External rules (CLAUDE.md §4b) — sources opened by the 2026-10-30 risk-review agents
| Rule | Source | 259a behavior | Tests |
| --- | --- | --- | --- |
| Colorado law: checking an agreement box binds, including an invited user | Jovel v. TeamSnap, No. 1:24-cv-1906, ECF 39 (D. Colo. July 30, 2025; Colorado law): checking was "a clear manifestation" of assent — cases.justia.com | Required unchecked box at sign-up, invite setup, LLC join; server record at the click | S1–S3, F1, F2, L1 |
| Federal circuit covering Colorado: clickwrap routinely upheld | Hancock v. AT&T, 701 F.3d 1248 (10th Cir. 2012; Oklahoma law) | Same | Same |
| Notice must be conspicuous; a click binds only if the person is told it means assent | Meyer v. Uber, 868 F.3d 66 (2d Cir. 2017); Berman v. Freedom Fin., 30 F.4th 849 (9th Cir. 2022) | Assent sentence on the box; 16 px; ≥ 4.5:1; documents one tap away | P6, F3, E2E-R1; walk screenshots |
| Illinois law: a clear prompt to read the terms | Sgouros v. TransUnion, 817 F.3d 1029 (7th Cir. 2016; Illinois law) | "Read the Terms" / "Read the Privacy Policy" right under the box | F3 |
| South Carolina law: re-acceptance needs a fresh ask with no bypass; the company must prove assent | Marshall v. Georgetown Mem'l Hosp., 112 F.4th 211 (4th Cir. 2024; S.C. law); Dhruva v. CuriosityStream (4th Cir. 2025) | Update variant is a fresh unchecked box with no skip; reproducible record (archive, hash, commit) | G2, P2, V1–V3 |
| Terms never shown → no assent | James v. Global Tel*Link (3d Cir. 2017; New Jersey law). No Pennsylvania-law holding cited yet (rules map: unknown; no PA lease uses Domus) | New accounts see the box before any page, action or API | G3, G10, G12 |
| Unilateral changes need notice; assent from all circumstances | Grosvenor v. Qwest (10th Cir. 2013); Macasero v. ENT Credit Union, 2023 COA 40 (quoting Vernon v. Qwest, D. Colo. 2012); our Terms "Changes" clause | Older accounts not forced now; asked once with notice in the rewrite | G4 |
| E-signatures; attribution "may be shown in any manner" | C.R.S. 24-71.3-107(2), -109(1); 15 U.S.C. 7001(a) | Click tied to the account; `source` records how the person was identified | S3, A3, R4 |
| Capacity | General contract law (minors may void); statute to cite in the rewrite | Box states "I am 18 or older" | F1 |
| Apple 5.1.1(i) policy reachable in-app; 5.1.1(v) deletion in-app; 2.1 no dead ends; 5.1.1(ii) no bundled consents | developer.apple.com/app-store/review/guidelines (2026-10-16); …/offering-account-deletion-in-your-app | Sheets + Back bar; delete, sign out and download without agreeing; box covers Terms and age only | B1, P5, G11, E2E-T1 |
| WCAG 2.2 AA 1.3.1, 2.5.8, 3.3.1, 3.3.2, 4.1.2 | w3.org/TR/WCAG22 | Native labeled 24 px box; enabled button; error + `aria-invalid` + focus | P6, F1, E2E-M1 |
| A landlord may not require electronic rent payment (IL leases from 2024-01-01); a free way to pay (CO) | 765 ILCS 705/4(b); C.R.S. 6-1-737(4)(d) | Tenants who won't agree are told to ask the landlord for another way; older tenants unaffected | P5 |

Copy approval: the owner reports (2026-10-30, twice) that the owner's aunt, an attorney, approves "all of this"; per the
owner's standing decision there is no separate paid legal review. Claude archives the live screens (web and iPhone,
light and dark, empty, error and checked states) with the deploy commit so the exact screens can be shown later.

## Appendix A — the migration (Claude-owned; for review; Codex must not edit)
```sql
-- Sprint 259a: a reproducible record of which Terms of Service and Privacy Policy version each person agreed to.
-- 1. legal_document_versions: each published version and the SHA-256 of its archived text. Append-only. Publishing
--    a version is a reviewed migration that inserts its row, so a published version can never change silently.
-- 2. legal_acceptances: one row per person per version pair, written only by the service role from server code at
--    the click (sign-up form, invite setup, LLC join, /agree). Each row must point at published versions (FK). It holds
--    no name, email or phone: email_hmac is a keyed hash (server secret, versioned by email_hmac_key_version) that
--    proves who agreed after the account is anonymized. role_at_acceptance is a snapshot of profiles.role, not an
--    authorization. People read their own rows. Nobody changes a row.
-- 3. legal_holds + purge_expired_legal_acceptances(): rows stay after account closure (the account-deletion runbook
--    anonymizes profiles, never deletes them) for 10 years after the person's latest deletion request is done, then an
--    owner-approved purge removes rows recorded before that closure, skipping active holds and reopened accounts, and
--    writes an audit row. No client write grants (L-025).
-- 4. profiles_keep_legal_evidence: a real (non-tester) profile that still has agreement records or an active legal
--    hold can't be hard-deleted; the runbook anonymizes it instead. Test accounts (is_tester) stay deletable.

create table if not exists public.legal_document_versions (
  document text not null check (document in ('terms', 'privacy')),
  version text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  published_at timestamptz not null default now(),
  primary key (document, version),
  constraint legal_document_versions_full_key unique (document, version, sha256)
);

comment on table public.legal_document_versions is
  'Sprint 259a: published Terms/Privacy versions and the SHA-256 of each archived text. Append-only; '
  'insert a row (reviewed migration) to publish a new version.';

alter table public.legal_document_versions enable row level security;
revoke all on table public.legal_document_versions from anon, authenticated;

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  terms_document text generated always as ('terms') stored,
  terms_version text not null,
  terms_sha256 text not null,
  privacy_document text generated always as ('privacy') stored,
  privacy_version text not null,
  privacy_sha256 text not null,
  source text not null check (source in ('sign_up', 'invite', 'llc_invite', 'agree_page')),
  role_at_acceptance text not null check (role_at_acceptance in ('owner', 'manager', 'tenant')),
  client text not null check (client in ('web', 'ios_app')),
  email_hmac text not null check (email_hmac ~ '^[0-9a-f]{64}$'),
  email_hmac_key_version smallint not null check (email_hmac_key_version > 0),
  accepted_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  app_commit text null check (app_commit is null or app_commit ~ '^[0-9a-f]{7,40}$'),
  constraint legal_acceptances_one_per_version unique (profile_id, terms_version, privacy_version),
  constraint legal_acceptances_accepted_not_after_recorded check (accepted_at <= recorded_at),
  constraint legal_acceptances_terms_published foreign key (terms_document, terms_version, terms_sha256)
    references public.legal_document_versions (document, version, sha256),
  constraint legal_acceptances_privacy_published foreign key (privacy_document, privacy_version, privacy_sha256)
    references public.legal_document_versions (document, version, sha256)
);

comment on table public.legal_acceptances is
  'Sprint 259a: one row per person per Terms/Privacy version pair they agreed to (published versions only), with '
  'role, client and a keyed email hash. Service-role writes only; append-only (purge only through '
  'purge_expired_legal_acceptances or the profile cascade).';

alter table public.legal_acceptances enable row level security;

revoke all on table public.legal_acceptances from anon, authenticated;
grant select on table public.legal_acceptances to authenticated;

drop policy if exists legal_acceptances_select_own on public.legal_acceptances;
create policy legal_acceptances_select_own on public.legal_acceptances
  for select to authenticated
  using (profile_id = (select auth.uid()));

create table if not exists public.legal_holds (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null check (length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  released_at timestamptz null
);

comment on table public.legal_holds is
  'Sprint 259a: profiles whose legal_acceptances rows must not be purged (open dispute, court order). Service role only.';

alter table public.legal_holds enable row level security;
revoke all on table public.legal_holds from anon, authenticated;

create or replace function public.legal_documents_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'legal_document_versions is append-only (%)', tg_op using errcode = 'P0001';
end;
$$;

create or replace function public.legal_acceptances_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- The profile FK cascade deletes child rows after the profile row is gone.
    if not exists (select 1 from public.profiles p where p.id = old.profile_id) then
      return old;
    end if;
    -- The reviewed purge function (security definer) marks its own transaction; only its owner may use the mark.
    if current_setting('app.legal_acceptances_purge', true) = 'on'
       and current_user = (select pg_catalog.pg_get_userbyid(p.proowner) from pg_catalog.pg_proc p
                            where p.oid = to_regprocedure('public.purge_expired_legal_acceptances(text)')) then
      return old;
    end if;
  end if;
  raise exception 'legal_acceptances is append-only (%)', tg_op using errcode = 'P0001';
end;
$$;

revoke all on function public.legal_documents_append_only() from public, anon, authenticated;
revoke all on function public.legal_acceptances_append_only() from public, anon, authenticated;

drop trigger if exists legal_document_versions_no_update on public.legal_document_versions;
create trigger legal_document_versions_no_update
  before update or delete on public.legal_document_versions
  for each row execute function public.legal_documents_append_only();

drop trigger if exists legal_document_versions_no_truncate on public.legal_document_versions;
create trigger legal_document_versions_no_truncate
  before truncate on public.legal_document_versions
  for each statement execute function public.legal_documents_append_only();

drop trigger if exists legal_acceptances_no_update on public.legal_acceptances;
create trigger legal_acceptances_no_update
  before update on public.legal_acceptances
  for each row execute function public.legal_acceptances_append_only();

drop trigger if exists legal_acceptances_no_direct_delete on public.legal_acceptances;
create trigger legal_acceptances_no_direct_delete
  before delete on public.legal_acceptances
  for each row execute function public.legal_acceptances_append_only();

drop trigger if exists legal_acceptances_no_truncate on public.legal_acceptances;
create trigger legal_acceptances_no_truncate
  before truncate on public.legal_acceptances
  for each statement execute function public.legal_acceptances_append_only();

create or replace function public.profiles_keep_legal_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_tester then
    return old;
  end if;
  if exists (select 1 from public.legal_acceptances la where la.profile_id = old.id)
     or exists (select 1 from public.legal_holds h where h.profile_id = old.id and h.released_at is null) then
    raise exception 'profiles: keep this profile (agreement records or a legal hold); anonymize it instead'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

revoke all on function public.profiles_keep_legal_evidence() from public, anon, authenticated;

drop trigger if exists profiles_keep_legal_evidence on public.profiles;
create trigger profiles_keep_legal_evidence
  before delete on public.profiles
  for each row execute function public.profiles_keep_legal_evidence();

create or replace function public.purge_expired_legal_acceptances(p_approved_by text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_cutoff timestamptz := now() - interval '10 years';
  v_approver text := trim(coalesce(p_approved_by, ''));
begin
  if length(v_approver) not between 3 and 100 or v_approver ~ '[[:cntrl:]]' then
    raise exception 'purge_expired_legal_acceptances: approver must be 3 to 100 plain characters' using errcode = 'P0001';
  end if;
  perform pg_catalog.set_config('app.legal_acceptances_purge', 'on', true);
  -- Anchor: the person's latest deletion request (by requested_at). Only a 'done' one closed before the cutoff
  -- counts; a later request (reopened, withdrawn, open) blocks the purge. Rows recorded after closure stay.
  delete from public.legal_acceptances la
   using (select distinct on (r.profile_id) r.profile_id, r.status, r.handled_at
            from public.account_deletion_requests r
           where r.profile_id is not null
           order by r.profile_id, r.requested_at desc, r.id desc) latest
   where latest.profile_id = la.profile_id
     and latest.status = 'done'
     and latest.handled_at is not null
     and latest.handled_at < v_cutoff
     and la.recorded_at <= latest.handled_at
     and not exists (select 1 from public.legal_holds h
                      where h.profile_id = la.profile_id and h.released_at is null);
  get diagnostics v_count = row_count;
  perform pg_catalog.set_config('app.legal_acceptances_purge', 'off', true);
  insert into public.audit_logs (user_id, action, entity_type, metadata)
  values (null, 'legal_acceptances_purge', 'legal_acceptances',
          jsonb_build_object('rows', v_count, 'approved_by', v_approver, 'closed_before', v_cutoff));
  return v_count;
end;
$$;

revoke all on function public.purge_expired_legal_acceptances(text) from public, anon, authenticated;
grant execute on function public.purge_expired_legal_acceptances(text) to service_role;

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.legal_acceptances'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.legal_document_versions'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.legal_holds'::regclass)
     or has_table_privilege('anon', 'public.legal_acceptances', 'SELECT')
     or has_table_privilege('anon', 'public.legal_acceptances', 'INSERT')
     or has_table_privilege('authenticated', 'public.legal_acceptances', 'INSERT')
     or has_table_privilege('authenticated', 'public.legal_acceptances', 'UPDATE')
     or has_table_privilege('authenticated', 'public.legal_acceptances', 'DELETE')
     or has_table_privilege('authenticated', 'public.legal_acceptances', 'TRUNCATE')
     or not has_table_privilege('authenticated', 'public.legal_acceptances', 'SELECT')
     or exists (select 1 from unnest(array['anon', 'authenticated']) as r(role_name),
                unnest(array['public.legal_document_versions', 'public.legal_holds']) as t(table_name),
                unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as v(privilege)
                where has_table_privilege(r.role_name, t.table_name, v.privilege))
     or has_function_privilege('authenticated', 'public.purge_expired_legal_acceptances(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.purge_expired_legal_acceptances(text)', 'EXECUTE')
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'legal_acceptances') <> 1
     or (select count(*) from pg_trigger where tgrelid = 'public.legal_acceptances'::regclass
         and tgname in ('legal_acceptances_no_update', 'legal_acceptances_no_direct_delete',
                        'legal_acceptances_no_truncate')) <> 3
     or (select count(*) from pg_trigger where tgrelid = 'public.legal_document_versions'::regclass
         and tgname in ('legal_document_versions_no_update', 'legal_document_versions_no_truncate')) <> 2
     or not exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
                    and tgname = 'profiles_keep_legal_evidence') then
    raise exception 'sprint259a postcondition failed';
  end if;
end $$;
```
