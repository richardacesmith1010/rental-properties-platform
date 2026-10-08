# Sprint 199 — Tenants and managers can download their data and delete their account (L3: auth + data deletion) · Category 14 (Launch) / 6 (Privacy)

## 1. Objective
Launch audit B4 (`docs/launch-readiness-audit-2026-10-07.md`): the Privacy page promises access, export and deletion, but tenants and managers have no way to do either (Settings → "Account & Data" is owner-only), and the fallback mailbox `privacy@` can't receive mail. Add, for **tenants and managers**:
- **Download my data**: a JSON file of their own data;
- **Delete my account**: removes their login and personal details, and keeps shared records (rent, payments, repairs, messages, audit) with the name replaced by "Deleted user".
Owners are out of scope (they already have Account & Data; owner export is a later sprint).

## 2. Context (verified live 2026-10-07)
- `public.profiles`: `id` (PK), `full_name text NOT NULL`, `email text NOT NULL UNIQUE`, `phone`, `nickname`, `avatar_url`, `role` (owner|manager|tenant), `notification_preferences jsonb NOT NULL`, `notifications_paused_until`, `stripe_customer_id`, `stripe_account_id`, … There is **no FK from profiles to auth.users**.
- More than 50 FKs point at `profiles(id)`, many `NO ACTION`/`RESTRICT` (leases.tenant_profile_id, maintenance_tickets.tenant_profile_id, inbox_messages.sender_profile_id, audit_logs.user_id, payment_distributions, …). **Never delete the profile row.** CASCADE ones include `notifications`, `notification_preferences`, `autopay_enrollments`, `property_managers`, `manager_payment_configs`, `manager_payments`, `tenant_activity_log.tenant_profile_id`.
- `inbox_messages` stores a denormalized `sender_email` (see `lib/inbox/action-helpers.ts` `insertInboxMessage`).
- Auth helpers hardened in Sprint 197 (`lib/auth.ts`, `app/actions/auth-helpers.ts` `requireAuth`). Admin client: `createAdminClient()` (`lib/supabase/admin`), which can call `auth.admin.deleteUser(id)`.
- Settings: `app/settings/page.tsx` + `components/settings/settings-layout.tsx` (sections with `roles`; `account` = `["owner"]`).
- Plain-language rules and guard: `docs/plain-language.md`, `lib/plain-language`; owner/tenant word list in CLAUDE.md §18.

## 3. In scope
1. **Settings section** `your-data` ("Your data"), roles `["tenant", "manager"]`, with two cards:
   - **Download my data**: text `Get a copy of your Domus data as a file.`, button `Download my data` → `GET /api/account/export`.
   - **Delete my account**: text `This removes your login and your personal details. Rent, repair, and message records stay for your landlord, with your name removed. This cannot be undone.`, a text input labelled `Type DELETE to confirm`, button `Delete my account` (disabled until the input is exactly `DELETE`), destructive style. On success → sign out and go to `/login?deleted=1`, and `/login` shows `Your account was deleted.`
2. **Export route** `app/api/account/export/route.ts` (GET): `getAuthenticatedUser()` + role via `getCurrentUserRole` (tenant/manager only; owners → 403 JSON `{ error: "Not available for owners yet." }`). Rate limit 5/hour/user (`checkRateLimit`). Respond `Content-Type: application/json`, `Content-Disposition: attachment; filename="domus-my-data-YYYY-MM-DD.json"`. Content, **only the requester's own rows**, read with the admin client strictly filtered by the requester's id:
   - `profile`: full_name, email, phone, nickname, role, created_at;
   - tenant: `leases` where `tenant_profile_id = me` (property name, unit, dates, rent, deposit, due day); `rent` charges for those leases (due date, amount, status, category); `payments` for those charges (date, amount, method); `repairs` where `tenant_profile_id = me` (title, status, created, resolved); `messagesSent` where `sender_profile_id = me` (thread subject via `threadDisplayTitle(…, "tenant")`, body, created_at);
   - manager: `homesManaged` from `property_managers` (property name, active, assigned_at); `managerPayments` where `manager_profile_id = me` (amount, status, period/date); `messagesSent` as above.
   - Never include other people's emails or phones, tokens, Stripe ids, or internal ids other than the requester's own record ids.
3. **Delete action** `app/actions/account-self-delete.ts` (`"use server"`), `deleteMyAccount(prev, formData)`:
   1. `requireAuth("tenant", "manager")`; rate limit 3/hour/user; Zod: `confirm` must equal `DELETE`.
   2. **Tenant guard:** if any `leases` row with `tenant_profile_id = me` and `active = true` exists → return `{ success: false, error: "Your lease is still active. Ask your landlord to end it first." }` and write nothing.
   3. **Anonymize (admin client), each result checked (L-002):**
      - `profiles` update for `id = me`: `full_name = "Deleted user"`, `email = "deleted+<id>@deleted.domusbase.invalid"`, `phone = null`, `nickname = null`, `avatar_url = null`, `notifications_paused_until = null`, `notification_preferences = '{}'::jsonb` (or the column default; check the live default and use it);
      - `inbox_messages` update `sender_email = null` where `sender_profile_id = me`;
      - delete `autopay_enrollments`, `notifications` (recipient), `notification_preferences` rows for `me`;
      - manager: `property_managers` set `active = false` where `manager_profile_id = me` (keep rows for history);
      - remove the avatar file from storage if `avatar_url` pointed to `profile-avatars/` (log on failure, don't block);
      - `audit_logs` insert `{ action: "self_delete_account", user_id: me, entity_type: "profile", entity_id: me }` (match the existing `logAudit` helper).
   4. **Then** `admin.auth.admin.deleteUser(me)`. If it fails → return `{ success: false, error: "Could not finish deleting. Please try again." }` (the anonymization already done is fine to repeat).
   5. **Idempotent:** a retry after a partial run must succeed (updates are safe to repeat; deletes of already-deleted rows are fine).
   6. Return `{ success: true }`; the client then signs out (`supabase.auth.signOut()`) and navigates.
   - The action **never** deletes the `profiles` row, leases, charges, payments, tickets, messages, documents or audit rows.
4. **Tests** (real assertions, call counts):
   - export: tenant gets only own rows (assert every query is filtered by the requester id); manager variant; owner → 403; unauthenticated → login redirect / 401 per the route pattern; filename and headers; no other person's email in output.
   - delete: wrong confirm → error, no writes; active lease → the lease error, no writes; success path performs each write in §3.3.3 then `deleteUser`, in that order; any write error → error returned, `deleteUser` **not** called; `deleteUser` error → the retry error; repeat after partial → succeeds; the profile row is never deleted (no `.delete()` on `profiles`); an owner calling the action is redirected (via requireAuth).
   - settings: the `your-data` section shows for tenant and manager and not for owner; delete button disabled until `DELETE`.
   - `/login?deleted=1` shows the message.

## 4. Out of scope
Owners (self-delete and export); Stripe customer/payment-method deletion in Stripe (list it as a follow-up); any schema change; changing existing owner Account & Data tools; notifications (OFF); emailing a confirmation.

## 5. Exact files expected to change
New: `apps/web/app/api/account/export/route.ts`, `apps/web/app/actions/account-self-delete.ts`, `apps/web/components/settings/your-data-settings.tsx`, tests (route, action, component). Changed: `apps/web/app/settings/page.tsx`, `apps/web/components/settings/settings-layout.tsx`, `apps/web/app/login/page.tsx` (deleted message), `apps/web/app/actions/index.ts` (export the action if that is the pattern), `apps/web/lib/validations*.ts` (Zod schema). List anything else.

## 6. Implementation requirements
- Exact copy from §3; sentences ≤ 12 words except the delete warning, which may be split into short sentences as written; no banned words; the plain-language guard must pass.
- Every Supabase mutation result is checked; write order exactly as §3.3; `deleteUser` last.
- Lines ≤ 140 chars; files ≤ 500 lines; no new dependencies; no `eslint-disable`.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
`npm run lint:web`; `npx tsc --noEmit -p apps/web/tsconfig.json`; the new tests plus every test importing a changed file; `lib/__tests__/plain-language.test.ts`; `npm run build --workspace @domus/web`.

## 8. Acceptance criteria (binary)
1. Tenants and managers can download a JSON file containing only their own data; owners get 403.
2. Delete: guarded by the exact `DELETE` confirmation and the active-lease check; anonymizes per §3.3.3; deletes the auth user last; never deletes the profile or shared records; idempotent; every error path writes nothing further and returns a plain error.
3. Settings shows "Your data" only for tenant/manager; `/login?deleted=1` shows the message.
4. All §3.4 cases are real assertions; lint, typecheck, tests, guard and build pass; only §5 files changed (plus any listed).

## 8b. Post-deploy verification (Claude only)
Create no real accounts. On the smoke tenant (no active lease? if it has one, verify the lease-guard message instead and do **not** delete) and on a throwaway invited test tenant if available: export downloads valid JSON with only own data; delete flow guarded; the smoke manager sees "Your data". Owner doesn't. Light/dark, 375/1280, 0 console errors; smoke; Sentry; CI.

## 9. Report format
JSON per `docs/codex-report-schema.json`. List follow-ups (Stripe customer cleanup, owner export). Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access or migration, no deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
