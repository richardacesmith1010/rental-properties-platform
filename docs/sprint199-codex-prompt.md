# Sprint 199 — Tenants and managers can download their data (L3: privacy, read-only) · Category 14 (Launch) / 6 (Privacy)

> Revision 3 (ChatGPT: rev 1 REJECT → rev 2 APPROVE WITH CHANGES, all adopted). ChatGPT **rejected** rev 1 (export + self-delete). Self-delete needs a retention policy (owner/lawyer decision, see `docs/legal-draft-terms-privacy-2026-10.md`), a personal-data inventory, all-or-nothing DB writes, Stripe cleanup and manager-handover rules, so it moves to a later, separately reviewed sprint. This revision is **export only**, with every export-related review point adopted.

## 1. Objective
Launch audit B4: Privacy promises access/export, but tenants and managers have no self-serve path. Add **Download my data** (a JSON file) for tenants and managers, and a plain note on how to ask for deletion.

## 2. Context (verified live 2026-10-07)
- Auth helpers hardened in Sprint 197 (`lib/auth.ts` `getAuthenticatedUser`, `getCurrentUserRole`). Admin client `createAdminClient()` (`lib/supabase/admin`). Rate limiter `checkRateLimit` (`lib/rate-limit`).
- Settings: `app/settings/page.tsx` + `components/settings/settings-layout.tsx` (sections carry `roles`; `account` = `["owner"]`).
- Tables: `profiles`; `leases(tenant_profile_id, unit_id, start_date, end_date, monthly_rent_cents, deposit_cents, due_day_of_month, active, …)`; `rent_charges(lease_id, due_date, amount_cents, status, category, deleted_at, …)`; `payments(rent_charge_id, amount_cents, paid_at, method, …)`; `maintenance_tickets(tenant_profile_id, title, status, created_at, resolved_at, …)`; `inbox_messages(sender_profile_id, thread_id, body, created_at, sender_email)`; `inbox_threads(subject, …)`; `property_managers(manager_profile_id, property_id, active, assigned_at)`; `manager_payments(manager_profile_id, …)`; `properties(name, …)`; `units(unit_number, property_id)`. **Check each column name against the live types (`lib/database.types.ts` or existing queries) before use; never guess (L-004).**
- Display helper for thread titles: `lib/inbox/thread-title.ts` `threadDisplayTitle`.
- In-app "Send feedback" stores feedback and emails the owner (works today). `privacy@domusbase.com` cannot receive mail yet.

## 3. In scope
1. **Export route** `apps/web/app/api/account/export/route.ts` (GET, `export const dynamic = "force-dynamic"`):
   - Auth: `getAuthenticatedUser()` → `getCurrentUserRole(user.id)`. Only `tenant` and `manager`. Owner → `403 { error: "Not available for owners yet." }` (server-side check; UI hiding is not authorization). Unauthenticated → follow `getAuthenticatedUser` (redirect) — or, if the route pattern in `app/api/` returns 401 JSON for API routes, match that pattern and say which.
   - Rate limit keyed **only** by the authenticated user id: `export:<userId>`, 5 per hour. Over the limit → `429 { error: "Too many downloads. Try again later." }`. If the limiter throws, **fail closed** with 503 `{ error: "Download is unavailable. Please try again." }`.
   - Every scope is **derived on the server from the authenticated user id**. The route takes no ids from the request.
   - Every query uses an **explicit column list** (no `select("*")`) and is filtered by the requester's id or by ids derived from it in this request.
   - Response: `200`, `Content-Type: application/json; charset=utf-8`, `Content-Disposition: attachment; filename="domus-my-data-YYYY-MM-DD.json"` (UTC date), `Cache-Control: no-store, private`, `X-Content-Type-Options: nosniff`.
   - **Body** (envelope + allowlisted fields only):
     ```
     { exportVersion: 1, generatedAt: <ISO>, accountRole: "tenant"|"manager",
       profile: { fullName, email, phone, nickname, role, createdAt },
       // tenant only:
       leases: [{ home, unit, startDate, endDate, monthlyRent, deposit, dueDay, active }],
       rent: [{ home, unit, dueDate, amount, status, kind }],      // kind = category label
       payments: [{ dueDate, amount, paidAt, method }],             // method via paymentMethodLabel
       repairs: [{ title, status, reportedAt, resolvedAt }],
       // manager only:
       homesManaged: [{ home, active, assignedAt }],
       managerPayments: [{ amount, status, date }],                 // pick the real date/period column
       // both:
       messagesYouSent: [{ conversation, sentAt, text }]            // conversation = home name only (see §3b.2)
     }
     ```
     Money as dollars with 2 decimals (number). Dates ISO. **Exclude**: other people's names/emails/phones, any ids, Stripe/Plaid references, internal notes, `sender_email`, messages written by others, documents/photos (listed as a follow-up).
   - Tenant scope chain: leases where `tenant_profile_id = me` → charges where `lease_id ∈ those` and `deleted_at is null` → payments where `rent_charge_id ∈ those charges`. Repairs where `tenant_profile_id = me`. Messages where `sender_profile_id = me`.
   - Manager scope: `property_managers` where `manager_profile_id = me` (home names via the properties join), `manager_payments` where `manager_profile_id = me`, messages where `sender_profile_id = me`.
   - Every Supabase result's `error` is checked; any error → `500 { error: "Download is unavailable. Please try again." }` (no partial file).
2. **Settings "Your data"** section (`components/settings/your-data-settings.tsx`), roles `["tenant", "manager"]`:
   - Title `Your data`. Text `Get a copy of your Domus data as a file.` Button `Download my data` (a link to `/api/account/export`; it shows an error message if the response is not 200).
   - Deletion note: `Want your account deleted? Tell us with Send feedback. We will reply by email.`
3. **Tests** (real assertions):
   - tenant export: only allowlisted keys at every level (assert the exact key sets); every query's column list matches the allowlist (no `*`); each query filtered by the requester id or derived ids; an **adversarial** fixture where the mocked DB also holds another tenant's lease/charge/payment/message proves none of them appear; payments of another tenant's charge never appear even if the charge id collides in mocks.
   - manager export: keys and scopes; no other people's data.
   - owner → 403; rate limit → 429; limiter throws → 503; any query error → 500 and no body data; headers (`no-store`, attachment filename format, nosniff); envelope fields present.
   - settings: "Your data" visible for tenant and manager, not owner; deletion note text.

## 3b. Required precision (ChatGPT rev 2: APPROVE WITH CHANGES — all adopted)
1. **One tenant per lease.** `leases.tenant_profile_id` is a single column, so a lease has exactly one tenant. Before relying on that, check the code: if any action can **reassign** a lease's tenant, export only charges dated on/after the requester became the tenant, or report it and stop. Say which in the report. Tests: a lease of another tenant on the same unit never contributes charges or payments; payments are reached only through the requester's own charges.
2. **Conversation label = home name only.** `messagesYouSent[].conversation` is the thread's **property name** (via `inbox_threads.property_id → properties.name`), never the thread subject or any participant-derived title. Message `text` is exported unredacted because the requester wrote it; add a one-line comment in code saying so. Test: a thread whose subject contains another person's name/email exports only the home name.
3. **Complete, bounded queries.** Page every list query with `.range()` in fixed pages (e.g. 500) until a short page, ordered by a stable key (`created_at, id` or the table's PK). Split `.in()` id lists into chunks (≤ 200). Skip the child query when the id list is empty. If any page or chunk fails → the whole export fails with the 500 error, never a partial file. Tests: a dataset larger than one page is fully returned; a failure on a later page returns 500 with no data; empty parent sets make no child query.
4. **Optional, adopted:** test the exact `Content-Type`, `Content-Disposition` filename (UTC date), `Cache-Control`; `homesManaged` includes inactive past assignments (with `active`), and `managerPayments` includes all history; `payments.method` is the display label from `paymentMethodLabel` (never a processor id); money is a decimal-dollar **number** with 2 places (e.g. 1250.5 → 1250.50 as a number; document it).

## 4. Out of scope
Account deletion (separate sprint after the retention decision); owner export; documents/photos in the export (follow-up); Stripe data; schema changes; notifications (OFF).

## 5. Exact files expected to change
New: `apps/web/app/api/account/export/route.ts` (+ a helper module like `apps/web/lib/account-export.ts` if the route would exceed ~200 lines), `apps/web/components/settings/your-data-settings.tsx`, tests. Changed: `apps/web/app/settings/page.tsx`, `apps/web/components/settings/settings-layout.tsx`.

## 6. Implementation requirements
Exact copy; sentences ≤ 12 words; plain-language guard passes. Lines ≤ 140; files ≤ 500; no new dependencies; no `eslint-disable`. The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
`npm run lint:web`; `npx tsc --noEmit -p apps/web/tsconfig.json`; new tests plus tests importing changed files; `lib/__tests__/plain-language.test.ts`; `npm run build --workspace @domus/web`.

## 8. Acceptance criteria (binary)
1. Tenants and managers download a JSON file with exactly the allowlisted fields of their own data; owners get 403 server-side.
2. No `select("*")`; every scope is server-derived; adversarial tests prove other users' data never appears.
3. Rate limit keyed by user id; fails closed; `no-store` and attachment headers set; any DB error returns 500 with no partial data.
4. Settings "Your data" for tenant/manager only, with the deletion note.
5. All tests are real assertions; lint, typecheck, guard and build pass; only §5 files changed.

## 8b. Post-deploy verification (Claude only)
Smoke tenant and smoke manager download the file; Claude checks the JSON has only the envelope and allowlisted keys, only their own records (cross-checked with SQL), and no emails other than their own. Smoke owner gets 403. Headers verified. "Your data" light/dark, 375/1280, 0 console errors. Smoke, Sentry, CI.

## 9. Report format
JSON per `docs/codex-report-schema.json`; list exact column lists used per query. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access or migration, no deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
