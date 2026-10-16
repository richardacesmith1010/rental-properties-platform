# Runbook — completing an account deletion request (manual, within 30 days)

Source of truth: `public.account_deletion_requests` (Sprint 238b). The in-app button only records the request and signs
the person out everywhere. This runbook finishes the deletion by hand. Full automatic deletion stays parked
(`docs/account-deletion-design.md` rev 3) until the lawyer sets retention years. The inventory below is that design's §3.

## 1. Ownership and cadence
- **Queue owner:** the Domus operator (Ace). Claude may prepare every step; destructive SQL and the completion email are
  run only after the operator says "go" for that request (owner rule: deleting real user data needs the owner).
- **Check at least weekly** and whenever a feedback row "Account deletion requested (…)" appears (heads-up only).
- **Deadline:** `requested_at + 30 days`. Process **oldest first**:
  ```sql
  select id, profile_id, role_at_request, requested_at, requested_at + interval '30 days' as due
  from public.account_deletion_requests where status = 'open' order by requested_at;
  ```

## 2. Verify the target (stop if anything does not match)
1. `profiles.id = request.profile_id` exists; `profiles.email` equals `request.email_at_request` (lower-cased).
2. `auth.users.id = request.profile_id` exists and its email matches. Never act on an email alone.
3. Note the role(s) the person actually holds now (owner member, manager assignment, tenant lease) — act on all of them.

## 3. Obligations to clear first (contact the person from support@ if one blocks)
- **Tenant:** an active lease → ask the owner to end it, or proceed and keep the lease record (de-identified, §4).
- **Manager:** active `property_managers` / `ownership_account_managers` → set inactive; unpaid `manager_payments` → settle
  first.
- **Owner:** homes they own alone → the owner's existing wipe tools (Settings → Account & Data) or keep records
  de-identified per the 2026-10-07 decision; LLC with other active owners → deactivate their membership only.
- **Stripe Connect balance** (owner/manager `stripe_account_id`): must be paid out (zero) before closing.

## 4. Steps (one transaction for the SQL part; record each step in the request row's notes outside this file)
Keep shared rent, payment and repair records **without the person's name or contact details** (owner decision
2026-10-07). Legend: D delete · A anonymize · K keep.

| Data | Action |
|---|---|
| `profiles` row | **A**: `full_name='Deleted user'`, `email='deleted+<id>@deleted.domusbase.invalid'`, `phone`, `nickname`, `avatar_url`, `notification_preferences`, `notifications_paused_until`, `stripe_customer_id`, `stripe_account_id`, `ai_consent_at` → null/default. Row stays (many FKs). |
| `auth.users` + identities/sessions/tokens | **D** via `auth.admin.deleteUser(<id>)` (service role) — ends sign-in everywhere. |
| `notifications`, `notification_preferences`, `autopay_enrollments` | **D** |
| `inbox_messages` sender email | **A** (null); message bodies **K** (shared conversation) |
| `invitations`, `llc_invitations` for this person | **A** email → placeholder, name → "Deleted user" |
| `document_signers` | **A** email → placeholder, `ip_address`, `user_agent` → null; signature text **K** only for completed signed leases |
| `feedback` from this person | **A** email/user_agent → null; message **K**; also the "Account deletion requested" row → message only |
| `tenant_activity_log`, `audit_logs.metadata` | **A** scrub the person's name/email text |
| `rental_applications` where `applicant_email` = their email | **A** identity → "Deleted user"/null; `screening_reports` for them **D** |
| `maintenance_photos`, `documents`, `property_files` uploaded by them | **D** files (storage, by `storage.objects.owner_id` and app references) and rows, except completed signed leases |
| `profile-avatars` storage object | **D** |
| leases, rent charges, payments, distributions, edit/rent history, repairs, comments, manager payments | **K** (de-identified via the profile row) |
| Stripe customer (tenant) | detach payment methods, delete the Stripe customer (Stripe keeps its own legally required records) |
| Stripe Connect account | unlink in Domus; close only at zero balance |
| Plaid items created by them (owner) | remove via Plaid `/item/remove`; delete stored access tokens |
| Sentry / Vercel / Resend / Anthropic | no account-level data to delete beyond logs that expire on their own schedule; note in the request |
| Device data | Face ID setting and cookies stay only on their phone; signing out cleared the session |

## 5. Completion confirmation (required by Apple when deletion takes time)
After §4 succeeds, send **one** plain email from support@domusbase.com to `request.email_at_request` (a manual,
transactional message — not the app's notification system):

> Subject: Your Domus account is deleted
> We deleted your Domus account. You can no longer sign in. We kept rent and payment records the law requires,
> without your name. Questions? Reply to this email.

## 6. Close the request (in this order)
```sql
update public.account_deletion_requests
   set status = 'done', handled_at = now(), confirmation_sent_at = now()
 where id = '<request id>' and status = 'open';
-- then remove the queue's own personal data
update public.account_deletion_requests set email_at_request = null, profile_id = null where id = '<request id>';
```
Log the request id (no personal data) in `docs/agent-handoff.md`.

## 7. Withdrawn requests
If the person writes before §4 that they changed their mind: set `status = 'withdrawn'`, `handled_at = now()`, clear
`email_at_request`; they can sign in again with "Forgot password?" (their auth user still exists).
