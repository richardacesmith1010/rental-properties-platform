# Sprint 238b — Delete my account — rev 4 (2× REJECT → owner: build now → critic panel: 18 REQUIRED adopted)

Severity L3 (auth/data; App Store 5.1.1(v)). History: rev 1 REJECT → rev 2 REJECT on the runbook only → owner 2026-10-16:
build the code now (rev 3) → internal critic panel on rev 3: 18 REQUIRED findings (about 10 distinct issues), all
adopted here, plus all 9 optional findings (most overlap the required ones).

## 1. Objective
Apple requires apps with sign-up to let users start account deletion inside the app. Today only owners see
"Account & Data" (and its wipe tools never delete the sign-in); tenants and managers are told to "Tell us with Send
feedback", and the public Support page says the same. Add one "Delete my account" request for **every role**: the user
types DELETE, a request is recorded, they are signed out, and they land on `/login?deleted=requested` with a notice. The
account is deleted by hand within 30 days using Claude's runbook (anonymize per the owner's 2026-10-07 decision: keep
shared rent/payment/repair records without the person's name or contact details).

## 2. Context
- **Owner decision 2026-10-16:** build the code part now. Claude hardens the runbook before the first real request.
- **Table (Claude, not Codex):** `supabase/migrations/20261024_sprint238b_account_deletion_requests.sql` (dry-run passed).
  The migration's unique keys (L-026; the table is not applied yet): `account_deletion_requests_pkey (id)` and the partial unique index
  `account_deletion_requests_one_open (profile_id) where status = 'open'`. Checks: `role_at_request in
  ('owner','manager','tenant')`, `status in ('open','done','withdrawn')`. RLS on, no client grants (L-025). Rollback:
  `supabase/rollback/20261024_sprint238b_rollback.sql` (refuses while open requests exist; Claude dry-runs it, rolled
  back, with the migration). Claude applies the migration before your code ships.
- **Feedback table (heads-up row only):** `supabase/migrations/20260323_sprint81_feedback.sql:1-13`, the only migration
  that touches it. Live `feedback_type_check` (checked by the critic panel on 2026-10-16) is
  `type = ANY (ARRAY['bug','feature','other'])`; `type` and `message` are NOT NULL; `status` check is
  `('new','reviewed','resolved','wontfix')`. Primary key `id` only. `createAdminClient` is untyped
  (`apps/web/lib/supabase/admin.ts`), so `tsc` will not catch a bad `type`. Use exactly the payload in §6.2.
- **Do not copy `submitFeedback`** (`apps/web/app/actions/feedback.ts:100-193`): it prefers a form email (line 164) and sends
  an email through Resend (line 182). Neither is allowed here.
- **Why the action redirects (Next 15.5.27):** any cookie write in a server action marks the path revalidated
  (`node_modules/next/dist/server/web/spec-extension/adapters/request-cookies.js:114`). A sign-out writes cookies, so Next
  re-renders `/settings` signed out. `app/settings/page.tsx:61` → `lib/auth.ts:22-23` then sends the browser to plain
  `/login`, and a client-side `window.location.href` in the section never runs. A `redirect()` thrown by the action skips
  that re-render. This is the existing pattern in `apps/web/app/actions/auth.ts:6-9` (sign out, then `redirect`).
- **Why the cookie fallback (auth-js 2.68.0 under supabase-js 2.49.1):** `_signOut` calls the auth server for every
  scope, local included, and returns `{ error }` **before** `_removeSession()` for any error except 401/403/404
  (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:1191-1215`). An outage that breaks the global call breaks
  the local call too, so the cookies stay. The fallback deletes them directly with the regex in `apps/web/middleware.ts:20`.
  A local call with no error means the library already removed the session.
- **Duplicate detection:** `PostgrestError` (postgrest-js 1.19.2) has only `message`, `details`, `hint`, `code`. There is
  no `constraint` field. Postgres puts the index name only in `message`. Existing code matches names the same way
  (`apps/web/app/actions/charge-management.ts:109`).
- **iPhone keyboard:** the app is the live site in a WKWebView. iOS capitalizes the first letter and QuickType adds a
  trailing space, so an exact `DELETE` match needs the input attributes in §6.3. No input in the app sets them today.
  `components/ui/input.tsx:22` passes extra props through.
- `requireAuth` (`apps/web/app/actions/auth-helpers.ts:19-40`) returns `{ user: { id, email? }, role, supabase }`. It runs
  `getUser` and a `profiles` role read first, so the rate limit runs right after it.
- Settings wiring: `apps/web/components/settings/settings-layout.tsx:27-37` (nav: `account` "Account & Data" owner only;
  `yourData` "Your data" tenant + manager). `apps/web/app/settings/page.tsx:229-246` mounts `<YourDataSettings />` and
  `<AccountDataSettings …6 wipe actions… />`. **Do not change `page.tsx`**: the section imports its action directly, as
  `components/auth/sign-in-form.tsx:6-7` does, so neither panel gets a new prop.
- `apps/web/components/settings/your-data-settings.tsx:44-46` (52 lines) holds the old feedback sentence; its test asserts
  it at `components/settings/__tests__/your-data-settings.test.tsx:15`. `account-data-settings.tsx` (164 lines) holds the
  six owner wipe cards (`app/actions/account-wipe.ts`, data only). **Do not reuse or change the wipe actions.**
- `apps/web/app/support/page.tsx:14-15` (App Store Support URL) says "Open Settings and send us feedback." The App Review
  notes (`docs/app-store/app-review-notes.md:138-142`) already describe the new path.
- `apps/web/app/login/page.tsx:12-21` types `searchParams` without `deleted`; its notices are `Alert` boxes at :122-164.
  Its test `app/login/__tests__/page.test.tsx:62-74` holds the notice table.
- `apps/web/components/__tests__/app-store-links.test.tsx` renders `SupportPage` (:16-22) and both data panels with no
  mocks (:31-41). It must stay green.
- App Review will likely press the button on the 238g demo accounts (`app_metadata.appreview_seed`). That is expected;
  Claude will add a runbook rule (before the first real request): requests from those demo accounts are marked
  `withdrawn` and the demo accounts are never deleted. No code change for this.
- Plan: `docs/phone-readiness-plan-2026-10-16.md` Sprint C; decision Q2 (in-app request, 30 days, confirm by typing
  DELETE, no password re-entry). Full automatic deletion stays parked (`docs/account-deletion-design.md` rev 3).

## 3. In scope
New server action; new settings section mounted for all roles; `/login` notice; Support page copy; tests. Claude owns the
table, the rollback and the runbook (Codex writes **no SQL**).

## 4. Out of scope
Automatic deletion or anonymization; changing the owner wipe tools; cancelling a request in-app; any email to anyone
(notifications stay off until launch); Stripe customer deletion; `app/settings/page.tsx`; `settings-layout.tsx`;
`app/actions/index.ts` (no re-export); `app/actions/feedback.ts`.

## 5. Exact files expected to change
Codex:
1. `apps/web/app/actions/account-deletion-request.ts` (new)
2. `apps/web/components/settings/delete-account-section.tsx` (new)
3. `apps/web/components/settings/your-data-settings.tsx` (replace the :44-46 sentence with `<DeleteAccountSection />`)
4. `apps/web/components/settings/account-data-settings.tsx` (mount `<DeleteAccountSection />` first; nothing else changes)
5. `apps/web/app/login/page.tsx` (`deleted` param + notice)
6. `apps/web/app/support/page.tsx` (one answer's copy)
7. Tests:
   - `apps/web/app/actions/__tests__/account-deletion-request.test.ts` (new)
   - `apps/web/components/settings/__tests__/delete-account-section.test.tsx` (new)
   - `apps/web/components/settings/__tests__/your-data-settings.test.tsx` (edit: swap line 15, add mock + placement)
   - `apps/web/app/login/__tests__/page.test.tsx` (edit: add notice cases)
   - `apps/web/components/__tests__/app-store-links.test.tsx` (edit: support-page assertions only)

Claude (not Codex): `supabase/migrations/20261024_sprint238b_account_deletion_requests.sql`,
`supabase/rollback/20261024_sprint238b_rollback.sql`, `docs/runbooks/account-deletion.md`.

## 6. Implementation requirements
1. **Table (Claude, already written):** see §2. PII lifecycle: after completion the runbook clears `profile_id` and
   `email_at_request` (keeps id, role, timestamps, status).

2. **Action** `export async function requestAccountDeletion(_prev: ActionState, formData: FormData): Promise<ActionState>`
   in a `"use server"` file. Export **only** this function (a `"use server"` file may export only async functions); keep
   the copy strings, the cookie regex and helpers module-private. Steps, in this order:
   1. `const { user, role, supabase } = await requireAuth("owner", "manager", "tenant");` Identity comes only from here.
   2. Rate limit, right after `requireAuth` and before the confirmation check and any insert:
      ``checkRateLimit(`requestAccountDeletion:${user.id}`, 3, 10 * 60 * 1000)``. Not allowed →
      `{ success: false, error: "Too many tries. Please wait 10 minutes." }`.
   3. Read **only** `formData.get("confirmation")`. Unless it is exactly the string `DELETE` (no trim, no case change) →
      `{ success: false, error: "Type DELETE to confirm." }`. Ignore every other field.
   4. **Primary write (source of truth):** `const admin = createAdminClient();` then
      `const { data: inserted, error } = await admin.from("account_deletion_requests").insert({ profile_id: user.id,
      email_at_request: user.email ?? null, role_at_request: role }).select("id").single()`. Use `insert` only (never
      `upsert`: it cannot target the partial index and fails with 42P10).
   5. **On insert error:** it is the open-request duplicate only when
      `error.code === "23505" && error.message.includes("account_deletion_requests_one_open")`. Duplicate → continue to
      step 7 with **no** feedback row and **no** audit (idempotent success). Any other error, including a 23505 on
      `account_deletion_requests_pkey` → log it, return
      `{ success: false, error: "We could not send your request. Please try again." }`, and do not sign out.
   6. **Secondary effects, only when a new row was inserted.** Each is in its own `try/catch`; an error or throw is logged
      and **never** changes the result.
      - Feedback heads-up and audit, exactly (check the feedback insert's returned `error`, L-002):
        ```ts
        const { error: feedbackError } = await admin.from("feedback").insert({
          type: "other", message: `Account deletion requested (${role}).`, email: user.email ?? null,
          profile_id: user.id, page_url: "/settings", user_role: role, status: "new"
        });
        if (feedbackError) console.error("[account-deletion] feedback_insert_failed", feedbackError.code);
        await logAudit({
          userId: user.id, action: "request_account_deletion", entityType: "account_deletion_request",
          entityId: inserted.id, metadata: { role }
        });
        ```
      - Do not call `submitFeedback`. Send no email. No `fetch` calls.
   7. **Sign-out** on the `supabase` client from `requireAuth` (never the admin client; do not create another client).
      Wrap each call in `try/catch`; a thrown value counts as an error.
      - `supabase.auth.signOut({ scope: "global" })`. No error → done.
      - Else log it and call `supabase.auth.signOut({ scope: "local" })`. No error → done.
      - Else log it, then `const store = await cookies();` (from `next/headers`) and call `store.delete(name)` for every
        cookie in `store.getAll()` whose name matches `/^sb-.+-auth-token(\.\d+)?$/`. Log a failure here too.
   8. `redirect("/login?deleted=requested");` from `next/navigation`, **outside every try/catch**, as the last line. The
      action never returns `{ success: true }`.
   - **Logging:** `console.error(tag, { code, message })` with these exact tags: `[account-deletion] insert failed`,
     `[account-deletion] feedback failed`, `[account-deletion] audit failed`, `[account-deletion] global sign-out failed`,
     `[account-deletion] local sign-out failed`, `[account-deletion] cookie clear failed`. `code` is `error.code ?? null`;
     `message` is `error.message` (or `String(error)` for a non-Error throw). Never log the email, the FormData or names.
   - **No other writes:** no `update`, `delete` or `upsert` on any table, through either client. The session client is
     used only for `auth.signOut`.
   - **Request safety:** this is a Next.js server action (origin-checked). Do not add a GET route or an API route.

3. **Section** `export function DeleteAccountSection()` (`"use client"`), all roles. It imports `requestAccountDeletion`
   from `@/app/actions/account-deletion-request` and uses `useFormState(requestAccountDeletion, null)` from `react-dom`
   (house pattern, `account-data-settings.tsx:40`). It takes no props. Look: reuse the danger tokens of
   `DangerActionCard` (`Card` with `var(--domus-danger-bg)` / `var(--domus-danger-text)`, input tokens as at :88-92).
   - Heading: `CardTitle` (an `h3`) with the text `Delete my account`.
   - Text, two paragraphs: `We will delete your account within 30 days.` and
     `We may keep rent and payment records, without your name.`
   - `<label htmlFor="delete-account-confirmation">Type DELETE to confirm</label>` without the `uppercase` class (the
     user must see that capitals matter).
   - `<Input id="delete-account-confirmation" name="confirmation" value={confirmation} onChange={…} placeholder="DELETE"
     autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} />`.
   - Submit button: a small child component that calls `useFormStatus()` and renders
     `<Button type="submit" variant="destructive" title="Ask us to delete your account." disabled={pending || !ready}>`
     with label `Delete my account`, or `Sending…` while pending. `ready` is `confirmation === "DELETE"` (exact).
   - Failure: `state && !state.success` → `<Alert variant="error" role="alert">{state.error}</Alert>`.
   - No success branch and no client navigation: no `useRouter`, no `window.location` (the action redirects).
   - Placement: in `your-data-settings.tsx` it replaces the `<p>` at :44-46, between the download error and the legal
     links. In `account-data-settings.tsx` it is the first child of the wrapper `div`, above the legal links. Nothing else
     in either file changes (L-014: the download flow, both legal-link navs, and the six wipe cards with their titles,
     copy and props stay as they are).

4. **Login notice:** add `deleted?: string` to the object inside the `searchParams` Promise type of `LoginPageProps`
   (`app/login/page.tsx:13-20`). When `searchParams?.deleted ===
   "requested"`, render as the first item of the sign-in notice stack (`mt-8 space-y-4`, above the session-expired box):
   `<Alert variant="success" role="status" className="px-4 py-3"><p className="font-medium">We got your request.</p>
   <p className="mt-1">Your account will be deleted within 30 days.</p></Alert>`. Keep the signed-in redirect at :40-43
   and every other notice unchanged.

5. **Support page:** replace only line 15 `<p>Open Settings and send us feedback.</p>` with
   `<p>Sign in and open Settings. Tap Your data, then Delete my account. Owners tap Account &amp; Data instead.</p>`.
   The heading at :14 and every other entry and `mailto:` link stay.

6. Plain language (6th grade, ≤ 12 words per sentence, no banned words; `apps/web/lib/plain-language/scan.ts`), lines
   ≤ 140, files ≤ 500. The user should never need to read instructions to finish this flow.

## 7. Validation commands
```
cd apps/web && npx vitest run app/actions/__tests__/account-deletion-request.test.ts components/settings/__tests__ \
  app/login/__tests__/page.test.tsx components/__tests__/app-store-links.test.tsx lib/__tests__/plain-language.test.ts
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web` or apply SQL. Claude applies the migration, runs attacker SQL, gates, deploys and walks.

## 8. Acceptance criteria
Test rules (L-017): exercise the real action and components. In the action test, mock only `@/app/actions/auth-helpers`
(`requireAuth`), `@/lib/supabase/admin`, `@/lib/audit` (`logAudit`), `next/headers` (`cookies`) and `next/navigation`
(`redirect` throws ``new Error(`REDIRECT:${url}`)``, as `app/login/__tests__/page.test.tsx:14` does). Use the **real**
`checkRateLimit` with `resetRateLimitState()` in `beforeEach`. The admin mock models the exact chains
`from(t).insert(p).select("id").single()` and `from("feedback").insert(p)`, and records every method called. PostgREST
errors and cookies use the real shapes:
```ts
const duplicateOpen = { code: "23505", hint: null,
  message: 'duplicate key value violates unique constraint "account_deletion_requests_one_open"',
  details: "Key (profile_id)=(11111111-1111-4111-8111-111111111111) already exists." };
const duplicatePkey = { code: "23505", hint: null,
  message: 'duplicate key value violates unique constraint "account_deletion_requests_pkey"',
  details: "Key (id)=(22222222-2222-4222-8222-222222222222) already exists." };
const otherError = { code: "42P01", hint: null, details: null,
  message: 'relation "public.account_deletion_requests" does not exist' };
const cookieNames = ["sb-vawqdqkaguhdgfhdebqw-auth-token", "sb-vawqdqkaguhdgfhdebqw-auth-token.0",
  "sb-vawqdqkaguhdgfhdebqw-auth-token.1", "x-session-expired"];
```

Action (`account-deletion-request.test.ts`):
1. `requireAuth` is called with `("owner", "manager", "tenant")`. When it rejects (its `/login` redirect), the error
   propagates and there is no insert, no `signOut`, no feedback, no audit.
2. Owner, manager and tenant sessions each insert exactly `{ profile_id, email_at_request, role_at_request }` from the
   session and end with `REDIRECT:/login?deleted=requested` (3 cases).
3. Confirmation `""`, `delete`, `Delete`, ` DELETE`, `DELETE ` → exactly `{ success: false, error: "Type DELETE to
   confirm." }`, no insert, no `signOut`, no redirect.
4. Rate limit: three calls, then a fourth within 10 minutes for the same user → exactly `{ success: false, error: "Too
   many tries. Please wait 10 minutes." }`, with no insert, no feedback, no audit, no `signOut`, no redirect. A different
   user is still allowed.
5. New request: feedback insert receives exactly the §6.2 object (including `type: "other"`); `logAudit` receives exactly
   the §6.2 object with the inserted id; `signOut` is called once with `{ scope: "global" }` before `redirect`
   (`invocationCallOrder`).
6. Duplicate (the real one_open 23505) → no feedback, no audit, `signOut({ scope: "global" })`, then the redirect.
7. A 23505 whose message names `account_deletion_requests_pkey`, and a non-23505 error → exactly
   `{ success: false, error: "We could not send your request. Please try again." }`, no `signOut`, no redirect, no
   feedback, no audit, and `[account-deletion] insert failed` is logged.
8. Feedback insert returns an error, and separately `logAudit` rejects → still the redirect; the matching tag is logged.
9. Sign-out paths: (a) global OK → no local call, no cookie delete; (b) global error, local OK → local called with
   `{ scope: "local" }`, no cookie delete; (c) both return errors → each of the three `sb-…-auth-token` cookies is deleted,
   `x-session-expired` is not, both tags are logged, still the redirect; (d) both throw → same as (c).
10. Forged fields: a tenant session with FormData `profile_id`, `email`, `email_at_request`, `role=owner`,
    `role_at_request=owner` → the request, feedback and audit use only the session id, email and role.
11. No other writes: across all cases the admin mock sees no `update`, `delete` or `upsert`, and `from` only with
    `account_deletion_requests` and `feedback`. The session client mock sees only `auth.signOut` (its `from` is never
    called). A stubbed global `fetch` is never called.
12. No `console.error` argument contains the session email.

Section and navigation:
13. `delete-account-section.test.tsx` (action module mocked): exact heading and both paragraphs;
    `getByLabelText("Type DELETE to confirm")` returns the input; the input has `autocapitalize="characters"`,
    `autocorrect="off"`, `autocomplete="off"`, `spellcheck="false"`; the label has no `uppercase` class.
14. Button disabled for `""`, `delete`, `Delete`, ` DELETE`, `DELETE `; enabled for `DELETE`. Clicking it calls the
    action once with FormData whose `confirmation` is `DELETE` (pattern: `manager-reminder-permissions.test.tsx:17-19`).
    While the action is pending the button reads `Sending…`. A resolved failure shows the exact error in `role="alert"`.
15. Owner navigation (`delete-account-section.test.tsx`): `SettingsLayout role="owner"` with an `account` section holding
    `AccountDataSettings` (stub actions) → click `Open Account & Data settings.` → the `Delete my account` heading shows and comes before
    `Delete All Properties` in document order; all six wipe titles still render.
16. Tenant and manager navigation (`your-data-settings.test.tsx`, action module mocked): click `Open Your data
    settings.` → the `Delete my account` heading shows; the old sentence is gone; the download copy and button still show.
    "hides Your data from owners" and "shows a failed download response" stay unchanged.

Login and Support:
17. `page.test.tsx`: `{ deleted: "requested" }` shows `We got your request.` and `Your account will be deleted within 30
    days.` inside `role="status"`; `{}` and `{ deleted: "yes" }` do not. A signed-in user with `{ deleted: "requested" }`
    is still redirected to their role home. Existing rows stay green.
18. `app-store-links.test.tsx`, support test: the markup contains `Tap Your data, then Delete my account.` and
    `Owners tap Account &amp; Data instead.` (`renderToStaticMarkup` escapes `&`), and does not contain
    `send us feedback`. The other tests in that file are not changed and stay green.
19. Full suite, `tsc`, lint and `lib/__tests__/plain-language.test.ts` green.

Claude only (after the migration is applied and the code is deployed; not Codex):
20. Walk in Chrome and the iOS Simulator, light and dark, with the SMOKE tenant and SMOKE owner (magic link or scripted
    sign-in, no typed passwords). Settings → Your data (tenant) / Account & Data (owner, section at the top). With the
    Simulator's on-screen keyboard turned on (I/O → Keyboard → Toggle Software Keyboard), typing `delete` shows `DELETE` and
    enables the button. Tap → lands on `/login?deleted=requested` with the
    notice. Reload or relaunch → still on sign-in. Back does not show Settings. Screenshots: text readable, button label
    visible (L-009, L-022).
21. SQL: one open row per walked account with the right role; one `feedback` row `type = 'other'`; one audit row. Sign in
    again and repeat → still one open row and no second feedback row. Then mark the walk rows `withdrawn` and clear
    `email_at_request` (runbook §7).

## 9. Report format
Compact status only: files changed with line counts, tests per criterion (1-19), command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Only the files in §5 items 1-7. No new dependencies. No SQL from Codex. Do not change `account-wipe.ts`, `feedback.ts`,
`app/settings/page.tsx`, `settings-layout.tsx` or `app/actions/index.ts`. No emails, no `fetch`, no `submitFeedback`.
`redirect()` stays outside every try/catch. Exact copy only; invent no strings, URLs or emails. Lines ≤ 140.
