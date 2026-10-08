# Account deletion — design (rev 3, 2026-10-08; ChatGPT: rev 1 REJECT, rev 2 REJECT, rev 3 REJECT "close")

> **Status: PARKED at rev 3 (2026-10-08).** Remaining required work before an implementation packet:
> 1. **Write-path matrix:** for every table and server action/RPC, which profile(s) a write *affects* (not just who writes), which lock it takes (one shared helper `lock_affected_profiles(uuid[])`), and what happens if any affected profile is deleting. Example: a manager updating a tenant's repair, an owner editing a tenant's rent, a tenant reporting paid while the owner edits.
> 2. **Service-role writes:** server actions using the admin client must call the same helper; prove none bypass it (tests per write path).
> 3. **Storage:** use `storage.objects.owner_id` (the deprecated `owner` column must not be used), plus a race-free final ownership check, and an integration test against a real Supabase project (not mocks).
> 4. Worker timestamps (`claimed_at`, `next_attempt_at`, `last_attempt_at`), lock-order tests, a no-PII deletion receipt.
> Release is also gated on the lawyer's retention answer, so parking costs no ship time.

**Owner decision (2026-10-07):** keep shared rent, payment and repair records, with the person's name and contact details removed. The retention period is to be confirmed with a lawyer (the legal draft suggests 7 years).
**Why now:** the App Store requires in-app account deletion for apps with sign-up. Sprint 199 rev 1 was rejected for missing atomicity, a PII inventory, Stripe handling and handover rules; this document answers those first.

## 1. Goals and non-goals
- **Goals:** any role can delete their account in the app; after deletion they can't sign in; their identifying details are removed everywhere they appear, except records kept on purpose (listed and justified below); the process can never stop half-way in a confusing state; other people's records keep working.
- **Non-goals (v1):** automatic purging of retained financial records after the retention period (later job, once the lawyer sets the period); deleting data held by Stripe beyond what its API allows; deleting other people's copies (e.g. an owner's exported CSV).

## 2. Who can delete, and when (guards)
> **Rev 2: guards are obligation-based, not role-based.** The database step checks **every** obligation for the profile, whatever its role: active leases as tenant; in-flight payments/autopay; active manager assignments; unpaid manager pay; homes owned (directly or via an ownership account); membership in an LLC with other active members; a Stripe Connect balance or pending payout. Any one blocks deletion with its message.

| Role | Allowed when | Otherwise the screen says |
|---|---|---|
| Tenant | no active lease (`leases.active`) and no open autopay charge in progress | "Your lease is still active. Ask your landlord to end it first." |
| Manager | no active home assignments (`property_managers.active`) and no unpaid manager payments (`manager_payments.status` not paid) | "You still manage homes. Ask the owner to remove you first." / "You have manager pay that isn't settled yet." |
| Owner | owns no homes (all homes deleted or moved to another owner) and is not a member of an LLC with other active members | "Delete or move your homes first." / "Leave your LLC first." (Owners already have Settings → Account & Data → wipe tools to remove homes.) |

The guards are checked **inside the database step** (§4), not only in the app, so a race can't slip past them.

## 3. Personal-data inventory (live schema, 2026-10-08)
Legend: **E** erase/clear · **A** anonymize (keep the row, replace identity) · **K** keep as is (justified) · **D** delete the row.

| Where | Identity fields | Action | Why |
|---|---|---|---|
| `profiles` | full_name, email, phone, nickname, avatar_url, notification_preferences, notifications_paused_until, stripe_customer_id, stripe_account_id | **A**: name "Deleted user", email `deleted+<id>@deleted.domusbase.invalid`, others null/default; `deletion_state` set | Row must stay: 50+ FKs reference it (NO ACTION/RESTRICT). |
| `auth.users` (+ identities, sessions, tokens; cascade) | email, phone, metadata | **D** via `auth.admin.deleteUser` | Ends the login everywhere. |
| `inbox_messages` | sender_email; body (their own words) | **E** sender_email; body **K** | Conversations are shared records for the other party. Sender shows as "Deleted user". |
| `invitations` | email, full_name (rows where `invited_profile_id = me` or `email = my email`) | **A**: email → placeholder, full_name → "Deleted user" | Owner's history of who was invited. |
| `llc_invitations` | email | **A** (email → placeholder) | Same. |
| `document_signers` | email, ip_address, user_agent, signature_text | **A**: email → placeholder, ip/user_agent → null; signature_text **K** [LAWYER] | A signed lease is a legal record; keep the signature text for the retention period. |
| `feedback` | email, message, page_url, user_agent | **A**: email/user_agent → null; message **K** | Product feedback with no identity. |
| `notifications` (recipient = me) | title/body | **D** | Personal inbox only. |
| `notification_preferences`, `autopay_enrollments` | — | **D** | Personal settings. |
| `communication_logs` (profile_id = me) | body | **D** [CHECK what writes it] | Delivery logs about this person. |
| `tenant_activity_log` (tenant_profile_id = me) | title/description may include name/email | **A**: replace the person's name/email text with "Deleted user" | Owner's record of the tenancy. |
| `audit_logs` (user_id = me, or metadata mentioning me) | metadata jsonb may hold email/name | **A**: scrub email/name keys and values matching my email/name | Security/audit trail must stay (who did what), identity removed. |
| `rental_applications` (applicant_email = my email) | applicant_name/email/phone, notes | **A** (identity → "Deleted user"/null); notes **K** | Owner's application history. |
| `screening_reports` for those applications | raw_payload jsonb | **D** | Sensitive third-party screening data; no retention need. |
| `maintenance_tickets` (tenant_profile_id = me) | title, description | **K** | Repair history of the home; text is about the home. Reporter shows "Deleted user". |
| `maintenance_comments` (author_id = me) | body | **K** | Shared repair conversation. |
| `maintenance_photos` (uploaded_by = me) | storage files + rows | **D** (delete files and rows) | Rev 2: Apple requires deleting user-generated content unless there's a legal basis; repair photos have none by default. |
| `leases`, `rent_charges`, `payments`, `payment_distributions`, `charge_edit_history`, `rent_increase_history` | links to my profile id, `payments.reference_note` | **K** | Financial records kept for tax/retention, de-identified because the profile is anonymized. |
| `documents`, `property_files` uploaded by me | storage files + rows | **D**, except **signed lease documents** (a completed `document_packets`/`document_signers` record) | Rev 2: keep only signed leases, and only once the lawyer confirms a retention basis [LAWYER]; until then the delete flow is **not released** to production. |
| `profile-avatars` storage | avatar file | **E** (delete the object; path derived from my id only) | Purely personal. |
| `manager_payments`, `manager_payment_configs` (manager = me) | description, notes | **K** (guards ensure settled) | Owner's payout history. |
| `property_managers` (manager = me) | — | **K** (already inactive by guard) | History. |
| `ownership_account_members` (owner leaving) | — | **K** inactive | Governance history. |
| `vendors` (owner_profile_id = me) | vendor name/email/phone (third parties) | **D** with the owner's homes (owner path only) | Owner's own contact list. |
| `bank_*`, `property_expenses`, `property_tax_years` (owner) | descriptions | **D** via the existing owner wipe before deletion | Owner's own money data; guard requires homes removed first. |
| Stripe customer (`stripe_customer_id`, tenants) | card/bank details at Stripe | **E**: detach payment methods and delete the Stripe customer | Stripe keeps its own legally required payment records. |
| Stripe Connect account (`stripe_account_id`, managers/owners) | bank/identity at Stripe | Unlink in Domus; if the balance is 0, close/reject via the API, else block deletion [DECISION] | Can't strand money. |

Two **[CHECK]** items need a code read before implementation: what writes `communication_logs`, and which `audit_logs.metadata` keys can contain emails/names.

## 4. Mechanism (all-or-nothing) — rev 2
**Rev 2 additions (required by review):**
- **Durable deletion job.** New table `account_deletion_jobs(profile_id pk, created_at, stripe_customer_id, stripe_account_id, storage_objects jsonb, steps jsonb, last_error text, attempts int, completed_at)`, service_role only. The DB function writes it **in the same transaction** that anonymizes and sets `'deleting'`, so the cleanup list survives a crash. The app and the retry job work only from this table.
- **No writes while deleting.** Invariant: a profile whose `deletion_state <> 'active'` cannot create or change any user-controlled data. Enforce with (a) a shared SQL helper `public.is_active_profile(uid)` added to the INSERT/UPDATE policies of every table a user can write directly through RLS, and to the storage upload policies of the 4 buckets; (b) server-side checks in `requireAuth`/`getAuthenticatedUser` (S197), which already gate server actions and API routes; (c) **ending sessions:** right after the transaction, call `auth.admin.signOut(<user>, 'global')` (revokes refresh tokens) before deleting the user. Access tokens already issued stay valid until they expire (Supabase default ~1 hour), and (a)+(b) make them useless.
- **Serialization.** The deletion function takes `pg_advisory_xact_lock(hashtext(p_user::text))` plus `select … for update` on the profile; the server-side create paths that matter (send message, report repair, report paid, upload) re-check `deletion_state = 'active'` inside their own write (RLS helper above covers direct writes). Tests: deletion racing message creation, repair creation, upload.
- **Retry job** reads `account_deletion_jobs` where `completed_at is null`, runs each remaining step (storage delete, Stripe, global sign-out, auth delete), records progress in `steps`, and finally sets `profiles.deletion_state = 'deleted'`.

1. **Schema:** `profiles.deletion_state text not null default 'active' check (in ('active','deleting','deleted'))` and `profiles.deleted_at timestamptz`.
2. **One database function** `public.delete_my_account(p_user uuid) returns jsonb`, `security definer`, `search_path = ''`, executable **only by `service_role`** (called from a server action after `requireAuth`). In **one transaction** it: locks the profile row (`for update`), re-checks the §2 guards, applies every **A/E/D** row action from §3, sets `deletion_state = 'deleting'`, writes one audit row (`action = 'account_deleted'`, no PII), and returns the storage paths and Stripe ids to clean up. Any guard failure or error → rollback, nothing changed, and a guard code is returned.
3. **After commit (app side, in order):** delete the avatar object (path built from the user id only); Stripe cleanup; `auth.admin.deleteUser(id)`; then set `deletion_state = 'deleted'`, `deleted_at = now()`.
4. **If a step after commit fails:** the profile is already `'deleting'`. Every auth helper (S197 `getAuthenticatedUser`/`requireAuth`) treats `deletion_state != 'active'` as signed out (sign out, then `/login?deleted=1`), so the person can't use Domus even while the login still exists. A small retry job (existing cron framework) finishes `'deleting'` profiles: storage, Stripe, auth user, and marks them `'deleted'`. Each step is safe to repeat.
5. **Concurrency:** the row lock plus the state check make a second request a no-op (`already deleting`). New rows created for a deleting user (a notification racing in) are cleaned by the retry job's final sweep of the same tables.
6. **Re-auth:** require the current password (or a fresh email code for passwordless/invited users) plus typing `DELETE`, because deletion can't be undone.

**Rev 3 corrections (required by review of rev 2):**
1. **One lock for everyone (replaces the rev 2 serialization note).** A trigger function `public.guard_active_writer()` runs `BEFORE INSERT OR UPDATE OR DELETE` on every table a signed-in user can write (list produced by the policy audit in item 3). It takes `pg_advisory_xact_lock_shared(<key of auth.uid()>)` and then checks `profiles.deletion_state = 'active'` (missing profile → fail). The deletion function takes the **exclusive** `pg_advisory_xact_lock` on the same key before anything else. So a writer either finishes before deletion starts, or waits and then sees `'deleting'` and fails. The service role (deletion worker, admin jobs) skips the check (`auth.uid()` is null under service role). Key: two-int form `pg_advisory_xact_lock(class_id, hashtext(uid))` with a fixed class id for this feature (collision note accepted; it affects waiting, not correctness).
2. **No separate sign-out call.** `auth.admin.signOut` takes a user's JWT, not a user id, so it's dropped. `auth.admin.deleteUser` removes the user's sessions and refresh tokens. Already-issued access tokens expire within about an hour, and item 1 plus the S197 helpers block them from doing anything.
3. **Policy audit (production gate).** Before building, list every RLS policy (all commands, including DELETE), every storage policy (INSERT/UPDATE/upsert/DELETE on the 4 buckets) and every SQL function a signed-in user can execute that writes data. Add a **restrictive** policy `… as restrictive for all to authenticated using (public.is_active_profile(auth.uid())) with check (public.is_active_profile(auth.uid()))` on each user-writable table, so no existing permissive policy can bypass it, and confirm it doesn't break reads the person legitimately needs before deletion (restrictive SELECT is out of scope; only writes). The trigger in item 1 is the second layer.
4. **Storage inventory.** The deletion function builds `storage_objects` from (a) `storage.objects where owner = p_user` across all 4 buckets, plus (b) every application reference to files the person uploaded (`maintenance_photos.storage_path`, `property_files.storage_path`, `documents.storage_path` where uploaded_by = p_user and not a signed-lease document, `profiles.avatar_url`, `inspection_items.photo_path` if they uploaded it). The worker deletes each and records per-object success; a missing object counts as done.
5. **Worker rules.** Claim jobs with `select … for update skip locked`; one job per profile (PK); exponential backoff; `attempts` capped at 10, then the job is marked `failed_terminal`, an alert goes to `PLATFORM_ALERT_EMAIL`, and the person stays blocked (`'deleting'`) until someone fixes it; never re-enable the account automatically.
6. **Production gates (all must be true before the delete button is shown in production):** the policy audit is done (item 3); the personal-data inventory in §3 is re-checked against the live schema on the release day; the lawyer has confirmed the retention basis for signed leases and financial records; and race tests pass (deletion vs. message, repair, upload, report-paid).
7. **Hygiene (optional, adopted):** after a job completes, clear `stripe_customer_id`, `stripe_account_id`, `storage_objects` and any personal text in `last_error`; store step states in typed columns (`storage_done`, `stripe_done`, `auth_done` booleans) instead of free JSON.

## 5. UX
Settings → "Your data" (tenant/manager) and "Account & Data" (owner) get **Delete my account**. One screen lists what is removed and what stays (from §3, in plain words), shows the guard message if blocked, then asks for the password plus `DELETE`. After success: signed out, and `/login?deleted=1` shows "Your account was deleted."

## 6. Tests (high level)
Guards per role (allowed and blocked, with zero writes when blocked); the SQL function's per-table effects on fixture data (each §3 row); rollback on an injected failure; idempotent retry from `'deleting'`; auth helpers reject `'deleting'`/`'deleted'`; avatar path can't be steered by `avatar_url`; Stripe calls mocked (customer deleted, Connect blocked with a balance); concurrent double request.

## 7. Decisions needed from the owner (short)
1. (Rev 2, changed) Repair photos and documents uploaded by the person are **deleted**; only signed lease documents may be kept, **with the lawyer's confirmation**. The delete feature is not released until the lawyer answers.
2. Managers/owners with a Stripe Connect balance: **block deletion until paid out** (recommended)?
3. Owners: require homes removed/moved and leaving the LLC first (recommended), rather than deleting homes automatically?
4. Retention period for kept financial records (lawyer; default 7 years, purge job later).
