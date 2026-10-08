# Account deletion — design (rev 2, 2026-10-08; ChatGPT rev 1: REJECT, all points adopted)

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

## 5. UX
Settings → "Your data" (tenant/manager) and "Account & Data" (owner) get **Delete my account**. One screen lists what is removed and what stays (from §3, in plain words), shows the guard message if blocked, then asks for the password plus `DELETE`. After success: signed out, and `/login?deleted=1` shows "Your account was deleted."

## 6. Tests (high level)
Guards per role (allowed and blocked, with zero writes when blocked); the SQL function's per-table effects on fixture data (each §3 row); rollback on an injected failure; idempotent retry from `'deleting'`; auth helpers reject `'deleting'`/`'deleted'`; avatar path can't be steered by `avatar_url`; Stripe calls mocked (customer deleted, Connect blocked with a balance); concurrent double request.

## 7. Decisions needed from the owner (short)
1. (Rev 2, changed) Repair photos and documents uploaded by the person are **deleted**; only signed lease documents may be kept, **with the lawyer's confirmation**. The delete feature is not released until the lawyer answers.
2. Managers/owners with a Stripe Connect balance: **block deletion until paid out** (recommended)?
3. Owners: require homes removed/moved and leaving the LLC first (recommended), rather than deleting homes automatically?
4. Retention period for kept financial records (lawyer; default 7 years, purge job later).
