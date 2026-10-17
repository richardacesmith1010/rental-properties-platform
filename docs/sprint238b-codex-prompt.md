# Sprint 238b — In-app "Delete my account" request for every role (L3: auth/data; App Store 5.1.1(v)) — rev 3 (rev 1 REJECT → rev 2 REJECT on the runbook only → owner 2026-10-16: build the code now)

## 1. Objective
Apple requires apps with sign-up to let users start account deletion inside the app. Today only owners see
"Account & Data" (and its wipe tools never delete the sign-in); tenants and managers are told to "Tell us with Send
feedback". Add one "Delete my account" request for **every role**: the user confirms, a request is recorded, they are
signed out, and the account is deleted by hand within 30 days using a runbook (anonymize per the owner's 2026-10-07
decision: keep shared rent/payment/repair records without the person's name or contact details).

## 2. Context
- **Owner decision 2026-10-16:** build the code part now. ChatGPT accepted the code design in rev 2; its remaining REQUIRED
  items were about the manual runbook, which Claude hardens before the first real request. Rev 3 also adopts the
  code-side items from that review (sign-out failure path, copy, request-safety notes below).
- The table exists before your work ships: Claude applies
  `supabase/migrations/20261024_sprint238b_account_deletion_requests.sql` (dry-run passed: one open request per profile,
  clients have no access).
- HEAD after 238a packet (`docs/sprint238a-codex-prompt.md`). Plan: `docs/phone-readiness-plan-2026-10-16.md` Sprint C;
  decision Q2 (in-app request, 30 days, confirm by typing DELETE, no password re-entry — zero-friction rule).
- Full automatic deletion stays parked (`docs/account-deletion-design.md` rev 3) until the lawyer sets retention years.
- `apps/web/components/settings/settings-layout.tsx:27-36` — nav: `account` ("Account & Data", owner only), `yourData`
  ("Your data", tenant + manager). `apps/web/app/settings/page.tsx:217-221` wires `yourData` and `account` sections.
- `apps/web/components/settings/your-data-settings.tsx:44-46` — "Want your account deleted? Tell us with Send feedback.
  We will reply by email." (47 lines).
- `apps/web/components/settings/account-data-settings.tsx` (159 lines) — owner wipe tools (`fullAccountWipe` etc. in
  `app/actions/account-wipe.ts`, owner-only, data only). **Do not reuse or change the wipe actions.**
- `apps/web/app/actions/feedback.ts:173` — feedback rows are inserted with the admin client.
- Security rule L-025: new tables grant clients nothing; server actions write with the admin client after
  `requireAuth` + checks (L-002: check every Supabase error).

## 3. In scope
New table (Claude writes and applies the migration — Codex does **not** write SQL), new server action, new settings
section mounted for all roles, sign-out + confirmation notice on `/login`, tests. Runbook (Claude writes).

## 4. Out of scope
Automatic deletion/anonymization; changing the owner wipe tools; cancelling a request in-app; emails to the user
(notifications stay off until launch); Stripe customer deletion.

## 5. Exact files expected to change
1. `apps/web/app/actions/account-deletion-request.ts` (new) + re-export in `apps/web/app/actions/index.ts` if that is the
   convention
2. `apps/web/components/settings/delete-account-section.tsx` (new)
3. `apps/web/components/settings/your-data-settings.tsx` (replace the :44-46 sentence with the new section)
4. `apps/web/components/settings/account-data-settings.tsx` (mount the same section at the top for owners)
5. `apps/web/app/login/page.tsx` (show the "request received" notice when `?deleted=requested`)
6. Tests: `apps/web/app/actions/__tests__/account-deletion-request.test.ts` (new),
   `apps/web/components/settings/__tests__/delete-account-section.test.tsx` (new)
7. (Claude) `supabase/migrations/20261024_sprint238b_account_deletion_requests.sql`, `docs/runbooks/account-deletion.md`

## 6. Implementation requirements
1. **Table (Claude) — the deletion queue and source of truth:** `public.account_deletion_requests(id uuid pk default
   gen_random_uuid(), profile_id uuid null references profiles(id) on delete set null, email_at_request text null,
   role_at_request text not null, requested_at timestamptz not null default now(), status text not null default 'open'
   check (status in ('open','done','withdrawn')), handled_at timestamptz, confirmation_sent_at timestamptz)`; partial unique
   index `account_deletion_requests_one_open` on `(profile_id) where status = 'open'`; RLS enabled; **no** client grants.
   PII lifecycle: after completion the runbook clears `profile_id` and `email_at_request` (keeps id, role, timestamps,
   status) — documented in the runbook and in a table comment.
2. **Action `requestAccountDeletion(prev, formData)`:** `requireAuth("owner","manager","tenant")`; rate limit
   `requestAccountDeletion:<userId>` 3 per 10 minutes; FormData is read for **`confirmation` only** — `profile_id`,
   `email_at_request` and `role_at_request` come solely from the authenticated user/profile returned by `requireAuth`
   (any other form fields are ignored). `confirmation` must equal exactly `DELETE` else `Type DELETE to confirm.`.
   - **Primary write (source of truth):** admin-client insert of the open request. The partial unique index is the final
     authority: a unique violation (`23505`) whose constraint is `account_deletion_requests_one_open` means an open request
     already exists → idempotent success with **no** feedback row and no second audit; any other error (including other
     23505s) → `We could not send your request. Please try again.` and no sign-out.
   - **Secondary effects, only when a new request was inserted:** a feedback row (message `Account deletion requested
     (<role>).`, no other personal text) and `logAudit` (`request_account_deletion`). Their failures are logged
     (`console.error` with a stable tag) and **never** turn the result into a failure — the request is already accepted.
     The feedback inbox is a heads-up only; the queue is the table.
   - **Sign-out:** `supabase.auth.signOut({ scope: "global" })` (leave Domus on every device). If it returns an error,
     call `supabase.auth.signOut({ scope: "local" })` so this device's session cookies are cleared anyway. Each error is
     logged with a stable tag and the result is still success. The section then sends the browser to
     `/login?deleted=requested` with `window.location.href` (a full load, so no signed-in page state survives).
   - **Request safety:** this is a Next.js server action, which already rejects cross-site posts (origin check); do not
     add a GET route. The rate limit above applies before any database call.
   - Return success with redirect target `/login?deleted=requested`. Nothing is deleted; no update/delete calls anywhere.
3. **Section `DeleteAccountSection` (all roles):** heading `Delete my account`; text `We will delete your account within
   30 days.` and `We may keep rent and payment records, without your name.`; input label
   `Type DELETE to confirm`; button `Delete my account` (destructive style) disabled until the input is exactly
   `DELETE`; pending label `Sending…`; error shown in an alert. Visible in "Your data" (tenant, manager) and at the top of
   "Account & Data" (owner).
4. **Login notice:** `/login?deleted=requested` shows `We got your request. Your account will be deleted within 30
   days.` above the form (plain status box, not an error).
5. Plain language (6th grade, ≤ 12 words per sentence), lines ≤ 140, files ≤ 500. The user should never need to read
   instructions to complete this flow.

## 7. Validation commands
```
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web` or apply SQL. Claude applies the migration and runs attacker SQL.

## 8. Acceptance criteria
1. Unauthenticated → rejected by `requireAuth`; owner, manager and tenant → success (3 tests).
2. Confirmation other than exactly `DELETE` (e.g. `delete`, ` DELETE`) → exact error, no insert.
3. First request inserts one open row + one feedback row + one audit; a repeat (simulated `23505` on
   `account_deletion_requests_one_open`) → success, no feedback row, no audit; a `23505` on a different constraint →
   failure copy.
4. Primary insert error → exact failure copy, no sign-out, no feedback/audit; success → `signOut` called with
   `{ scope: "global" }` and redirect target `/login?deleted=requested`; a global sign-out error → `signOut` called again
   with `{ scope: "local" }`; feedback error, audit error, or sign-out errors after a stored request → still success (each
   logged).
4b. Forged fields: FormData with `profile_id`, `email`, `role=owner` from a tenant session → the inserted request and
   feedback use only the session identity (tenant id/email/role).
5. The action makes no delete/update calls on any table (asserted with the admin-client mock).
6. Section: button disabled until exactly `DELETE`; exact copy; rendered for all three roles in the right settings
   panels (owner in Account & Data, tenant/manager in Your data).
7. `/login?deleted=requested` shows the exact notice; without the param it does not.
8. Full suite + plain-language guard green.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include "Claude
prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5 (Codex: items 1–6). No new dependencies. No SQL from Codex. Do not change `account-wipe.ts`.
No emails sent.
