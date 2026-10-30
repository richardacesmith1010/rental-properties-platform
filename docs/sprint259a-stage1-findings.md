# Sprint 259a — findings from the linked Stage 1 session (for the "Agreement" session before ChatGPT review)

Written 2026-10-30 by the Stage 1 session that "Domus 7" started at 17:09. Per L-041 the owner's own chat
("Agreement") owns 259a; this session wrote no 259a file after 17:35, applied nothing live, ran no Codex, used no
Chrome/ChatGPT. Read-only inputs: the code at `166bd75`, live read-only SQL, five risk-review persona agents (effort
max) and one fetch of Apple's age-assurance pages. Everything below is advice; your migration, rollback and packet stand.

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
Five persona agents (effort max) read the brief, the code and primary sources; Claude checked every high claim against
code (file:line) and live read-only SQL before listing it. "Verified" = Claude re-checked; "persona source" = the agent
opened it and Claude did not.

### 4.1 Decisions for the 259a packet (highest leverage first)
1. **Don't make anyone agree to known-false Terms (HIGH; AG/FTC + plaintiff's lawyer, independently).** The live pages
   say "A lawyer is reviewing these terms" (`app/terms/page.tsx:17`, `app/privacy/page.tsx:17`; untrue since the owner's
   10-30 decision), "Domus … is run by Richard Smith, an individual" (`terms/page.tsx:25`; Ingle Homes LLC exists since
   10-28), and "Domus does not hold your money" (`terms/page.tsx:53–54`; the rules map calls this inaccurate for ACH).
   Verified. A clickwrap makes these statements part of the deal (15 U.S.C. 45(a)(1); C.R.S. 6-1-105(1)(rrr); 815 ILCS
   505/2; S.C. 39-5-20; 73 P.S. 201-2(4)(xxi); Colorado penalty up to $20,000 per violation, 6-1-112(1)(a) — persona
   sources), and every row would prove a contract with the owner personally, not the LLC. **Options:** (a) ship the
   259a machinery (boxes on the creation forms, record, `/agree`) but send *existing* users to `/agree` only when the
   rewritten Terms ship, so they agree once; or (b) before the first row is written, a minimal truth patch: banner
   "Early access version. We will show you any change that matters before it applies to you."; operator "Domus is run
   by Ingle Homes LLC, a Colorado company."; drop or correct "does not hold your money".
2. **Declining must not cost people their records (HIGH; AG/FTC, lawyer, Apple).** Your R7 offers Sign out + "Download
   my data" (tenants/managers) + Delete. Gaps, verified: owners get 403 from `/api/account/export`
   (`route.ts:25`); lease and receipt PDFs (`/api/pdf/*`, ungated, `auth.getUser()` at e.g.
   `pdf/lease-summary/[leaseId]/route.ts:32`) have no link from `/agree`; autopay can't be turned off without agreeing.
   C.R.S. 38-12-801(1) (verified, 2024 text) makes the landlord give the tenant a copy of the signed lease within 7 days;
   the FTC staff report "Bringing Dark Patterns to Light" (2022) lists hard cancellation/deletion as a dark pattern
   (persona source). Apple 5.1.1(v): "apps that make it unnecessarily difficult for someone to delete their account
   will not pass review" — the agree screen's Delete is the only path while Settings is gated (persona source).
   Suggested `/agree` decline block: "Don't agree? You can still get your records." + equal-size **Download my data ·
   My lease and receipts · Turn off autopay · Delete my account · Sign out**; owners: "Email privacy@domusbase.com for
   your data." (an existing, real address). For tenants also show the landlord's name and "You can still pay rent and
   ask for repairs another way." (lawyer). Tenant advocate (persona sources) adds: the export lacks the signed lease;
   Delete signs the person out everywhere; Illinois bars requiring electronic or automatic rent payment and needs a free
   way to pay (765 ILCS 705/3.5, 705/4); S.C. 27-40-420 and C.R.S. 38-12-801(2) require the landlord's notice address.
   Its suggested block: "Don't agree? You can still get your records." [Get my lease] [Get my receipts] [Download my
   data] · "Your landlord: {name}, {address}, {email}, {phone}. You can ask for paper copies." · "Other ways to pay rent:
   {instructions}." [Turn off automatic payments] · [Sign out] "You can come back and agree later." · "Deleting your
   account does not end your lease. Get your records first." [Delete my account]. Same exemptions on
   `/complete-profile`.
3. **Sign-up rows from `user_metadata` (MEDIUM-HIGH; lawyer + my review).** Anyone can set `terms_version` through the
   public sign-up API, and the person can change it later (`updateUser({ data })`), giving a `sign_up` row back-dated to
   `created_at`. "One fake row casts doubt on every row." Fix: write sign-up rows only where the server saw the box
   (server-action sign-up), or record `accepted_at = now()` and treat metadata as a hint only.
4. **Server actions are not gated (HIGH per fraudster; your packet scopes it out on purpose).** Verified: 140
   `requireAuth(` calls in 56 files never call `getAuthenticatedUser`; checkout (`lib/charge-checkout.ts:93`), autopay
   (`app/actions/autopay.ts:52,173`) and owner tabs (`app/api/owner/section-data/route.ts:14`, `auth.getUser()`) keep
   working for a session left open across a version change (the iPhone app keeps one for days; tabs switch without a
   page load since 247a). For the first rollout everyone starts with zero rows, so this matters most for money moves.
   Middle ground: check the current version in the money actions only (checkout, autopay, withdrawals) and in
   section-data (409 → client goes to `/agree?next=…`), exempting the accept actions, `requestAccountDeletion` and
   export by call-site option.
5. **LLC invite tokens are readable by every LLC member (HIGH, pre-existing, not caused by 259a).** Verified:
   `has_column_privilege('authenticated','llc_invitations','token','SELECT')` = true; policy "LLC members can view
   invitations" lets any active member read their LLC's invites; `getPendingLLCInvitationsForAccount` returns `token`
   (`lib/llc-invitations.ts:122,139`) into owner page data (`app/owner/page-data/section-bundles.ts:25`). With the token,
   `/join-llc` creates the invitee's login with a password the holder picks and `email_confirm: true`
   (`app/actions/llc-invitations.ts:460–469`) — a partner could fabricate a co-owner (and, after 259a, an agreement row
   in that person's name), then vote in LLC approvals. **Live exposure today: none** — 1 pending invite (2026-03-24),
   already expired by the 7-day rule (`lib/llc-invitations.ts:5`); a resend resets the window. Interim safe default:
   don't send or resend LLC invites until fixed. Fix (L3, migration + code): `revoke select (token) on
   public.llc_invitations from anon, authenticated` (column-level; check every client read first), drop `token` from
   the DTO (resend reloads it server-side, `lib/llc-invitations.ts:232`), and check the box before `createUser`.
6. **Apple age assurance for 18+ apps (HIGH legal, Gate 2; verified by a separate fetch of Apple's pages).** Apple's Q&A
   (https://developer.apple.com/support/age-assurance/): "Yes. In regions where legally required, you need to check the
   age of the people using your app with the Declared Age Range API." Dates: Texas "starting June 4, 2026" (after "a
   recent court ruling lifting an injunction on Texas law SB 2420"), Utah "as of May 6, 2026", Louisiana "as of July 1,
   2026"; "No, there are no changes to the App Review process." Our checkbox doesn't count as Apple's check. iPhone L3
   before App Store submission: native age-range check where required, adults-only screen otherwise, optional
   `age_basis` on the record, `showSignificantUpdateAcknowledgement` on a material Terms change.
7. **Keep the proof after an account closes (HIGH per lawyer; partly mitigated, verified).** The runbook never deletes
   `profiles` rows (`docs/runbooks/account-deletion.md:22`, anonymize at C9), so rows stay, linked to an anonymized id;
   Colorado limitation periods are 3 years for contract claims and 6 years for debt/back rent (C.R.S. 13-80-101(1)(a),
   13-80-103.5(1)(a) — persona sources). To prove *who* agreed after anonymization the lawyer suggests a keyed hash of
   the email (`email_hmac`) kept 7 years, with Privacy text: "We keep a short record that you agreed to our Terms
   (which version and when) for 7 years after you close your account." Owner/Agreement decision.
8. **Tenant carve-out for the Terms rewrite (HIGH at the rewrite; AG + lawyer, verified texts).** S.C. Code
   27-40-210(12): "'rental agreement' means all agreements, written or oral … embodying the terms and conditions
   concerning the use and occupancy of a dwelling unit"; 27-40-330(a)(3): a rental agreement may not provide that the
   tenant "agrees to the exculpation or limitation of any liability of the landlord … or to indemnify the landlord";
   C.R.S. 38-12-801(3)(a)(II)–(III) bans one-way fee shifting and jury/class waivers in written rental agreements; also
   765 ILCS 705/1 and 815 ILCS 505/10c (persona sources). With the owner as both platform and landlord, a cap or
   indemnity a tenant must accept can act as a landlord waiver. Suggested Terms line: "Nothing in these Terms limits a
   landlord's duties to a tenant, or a tenant's rights under a lease or the law. These limits never protect a landlord,
   even one that owns Ingle."
9. **Privacy wording (MEDIUM; verified live).** `auth.sessions` holds an IP and a user agent on 2,790 of 2,790 rows
   (Supabase Auth). Never write "we don't store your IP." Suggested: "Use and device data: sign-in times, IP address and
   browser type (kept by our sign-in service for security)…" and "Agreement record: which versions you agreed to, when,
   on which screen, your role, web or iPhone. No IP address or device ID." Never call the box "consent" (C.R.S.
   6-1-1303(5); CPA rules 7.03 — persona sources); optional choices (AI helper, marketing) keep their own boxes.

10. **New Colorado rule, not 259a: the tenant portal must show a habitability notice (HIGH before outside testers;
    tenant advocate; verified in the official 2024 text).** C.R.S. 38-12-505(3)(e): "If a landlord provides a tenant
    with an online tenant portal or platform, the landlord must post in a conspicuous place in the online tenant portal
    or platform a statement in English and Spanish that states an address where a tenant can mail or personally deliver
    written notice of an uninhabitable condition and an e-mail address or accessible online portal or platform where a
    tenant can deliver written notice of an uninhabitable condition." (3)(c) and (3)(d) (since 2025-01-01) also require
    every Colorado lease to carry a bold 12-point warranty-of-habitability / no-retaliation statement and the same
    English + Spanish notice address. Live exposure today: none — Colorado leases exist only on test accounts (2), the
    only real lease with a tenant login is in South Carolina. Needs a rules-map row (GAP) and a sprint before Colorado
    outside testers: owner fields for the notice address, the bilingual statement on the tenant home (Spanish marked
    `lang="es"`), and the two lease statements in Colorado leases. Suggested copy (tenant advocate): EN "Is your home
    unsafe or unlivable? Tell your landlord in writing. Mail or bring it to {address}. Or email {email}." ES "¿Su vivienda
    es insegura o inhabitable? Avise por escrito a su arrendador. Envíe o entregue el aviso en {dirección}. O escriba a
    {correo}."

### 4.2 Copy and layout
- Wording options: yours "I agree to the Terms and the Privacy Policy." · AG/FTC "I am 18 or older. I agree to the
  Terms. I know the Privacy Policy explains how my data is used." · lawyer: match the page titles ("Terms of Service"),
  treat Privacy as notice, not agreement (Dhruva, 4th Cir. 2025 — persona source). Any of these forms a contract; the
  lawyer found the layout passes in CO, SC, IL and PA if the box sits right above the create button on every screen size
  and nothing else submits the form (Hancock 10th Cir. 2012; Meyer 2d Cir. 2017; Berman 9th Cir. 2022; Sgouros 7th Cir.
  2016; James 3d Cir. 2017; Marshall 4th Cir. 2024 — persona sources).
- *Jovel v. TeamSnap* (D. Colo. July 30, 2025) — the persona opened it: it bound an **invitee** who checked "I agree to
  TeamSnap's Terms of Service" next to a blue link, so agreeing on `/complete-profile` before setting a password is fine.
  TeamSnap won partly by proving its sign-up screen was unchanged from 2019–2024; Meyer used an actual-size phone
  screenshot → keep the hash test (your V1) and save actual-size web + iPhone screenshots of each version.
- Apple (persona source): add "You must be 18 or older to use Domus." to the Terms version that ships the box (only
  Privacy says so today); don't collect a birth date; App Store Connect "Age Assurance" answer stays No until item 6.
- Tenant advocate: name the company so invitees know who "we" is ("Agree to Ingle's Terms to keep going." / "Ingle's
  Terms changed."), and on the tenant gate: "Your landlord uses Ingle for rent and repairs. These Terms are between you
  and Ingle. They do not change your lease or your tenant rights." For under-18 leaseholders (Colorado emancipated
  juveniles, C.R.S. 19-2.5-203(2)(b), persona source): "Under 18? You can still get your records below."
- Accessibility (tenant advocate, WCAG 2.2): native checkbox in a full-row label, at least 24×24 CSS px (2.5.8) and
  44 pt in the app; error as text + icon with `aria-describedby` and `aria-invalid` on the box (1.4.1, 3.3.1), never
  under a sticky bar (2.4.11); the sheet should focus its title (`tabindex="-1"`, `aria-labelledby`) rather than the
  first button, and make the page behind `inert`; the web pages ignore iPhone Larger Text — test the largest size at
  320 px (1.4.4, 1.4.10). A 3-line "In short" box atop each sheet helps (3.1.5). Spanish for the gate before outside
  testers is a medium item.
- The sheet must render the documents inline (your R3 does): `X-Frame-Options: DENY` and `frame-ancestors 'none'`
  (`next.config.mjs:6,31`, verified) would make an iframe sheet blank, including in WKWebView.

### 4.3 App Review notes (Apple persona; paste into notes 1c and 2c)
```
FIRST SIGN-IN: AGREE SCREEN
Each demo account shows "Please agree to keep going" once.
Tap Read the Terms or Read the Privacy Policy.
Check the box, then tap Continue.
Under "Don't agree?" you can Sign out or Delete my account.
You can delete an account without agreeing first.
It shows again only if we change our Terms.
```
(Adjust the quoted heading and button names to your final copy.) Don't pre-write rows for demo accounts (it hides the
feature and would be a false record); don't bump a version while a build is in review; never loop on a save failure.

### 4.4 Smaller items
- `/agree` next: `isNextAllowedForRole` drops `/connect/return`, `/connect/refresh`, `/autopay/return`,
  `/payments/success` (gated pages) → a Stripe return mid-version-change lands on the role home. Small allow-list.
- Your R4 upsert with `ignoreDuplicates: true` is right: a plain upsert becomes ON CONFLICT DO UPDATE and hits your
  no-update trigger → permission error → an `/agree` loop (fraudster).
- Pre-existing, out of 259a scope: `/auth/callback` marks invites accepted and alerts owners before the person agrees
  (`route.ts:88–103`); the callback's `setSession` from query-string tokens (`route.ts:188–192`) is a login-CSRF
  shape; `forgot-password` already spends Supabase's shared per-IP auth bucket (30 requests / 5 min) from Vercel IPs
  (https://supabase.com/docs/guides/auth/rate-limits); invite errors reveal whether an account exists
  (`invitations.ts:59,251`).
- Apple 1.2 (revised 2026-10-16, persona source): apps where users "upload, share, or otherwise contribute content"
  need report/block tools — messages and repair photos may draw it; name the paths in review notes.
