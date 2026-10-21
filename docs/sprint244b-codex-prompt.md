# Sprint 244b — Notification settings per role + "repair started" notice (L3: schema constraint) — rev 3 APPROVED (rev 1 AWC → rev 2 AWC → rev 3 APPROVE)

## 1. Objective
Before notifications go "on" (launch item A5/B9):
1. Settings → Notifications shows every person the same 7 switches with owner-centric wording. Show each role only
   the switches that affect them, in plain words that say exactly what each switch does for that role.
2. A tenant hears nothing when their repair is started; the "Repair updates" switch promises status changes. Send the
   tenant a notice when their repair moves to **in progress**.

## 2. Context
- HEAD `e2cb194`. Next.js 15 `apps/web`, Supabase.
- Options: `NOTIFICATION_EMAIL_PREFERENCE_OPTIONS` in `apps/web/lib/notification-preferences.ts` (7 keys, lines ~66–103);
  rendered by `apps/web/components/settings/notification-preferences.tsx` (381 lines) from `app/settings/page.tsx`
  (~line 199, `options={NOTIFICATION_EMAIL_PREFERENCE_OPTIONS}`; `role` is in scope there).
- Whose preferences apply (after 244a): tenant-facing rent due / late / overdue / lease messages need the owner's
  property setting **and** the tenant's own; team recipients use their own. Owners never receive rent-due reminders
  (tenant-only); managers do not receive rent-due reminders.
- Repairs: `apps/web/app/actions/maintenance-ticket-actions.ts` (342 lines) `updateTicketStatus` (~237–330) notifies
  the team on resolved/closed and the tenant on `resolved` (`type: "ticket_resolved"`). Nothing for `in_progress`.
- Live `notifications_type_check` (checked 2026-10-20) allows exactly: `new_ticket, late_rent, ticket_resolved,
  payment_recorded, lease_updated, document_sent, document_signed, application_reviewed, rent_due_reminder,
  invite_accepted, owner_message, announcement, lease_expiring_soon, lease_expired, delinquency_escalation,
  distribution_change_requested, distribution_change_approved, distribution_change_rejected, withdrawal_requested,
  withdrawal_approved, withdrawal_rejected, withdrawal_completed`.

## 3. In scope
1. **Role-specific options.** Add `notificationPreferenceOptionsForRole(role: "owner" | "manager" | "tenant")` in
   `lib/notification-preferences.ts` returning these keys, in this order, with **exactly** this copy:
   - **tenant:** `rent_due_reminder` "Rent reminders" — "Email me 3 days before rent is due."; `late_rent` "Late rent"
     — "Email me when my rent is late."; `delinquency_escalation` "Overdue rent" — "Email me again if rent stays
     unpaid."; `payment_received` "Receipts" — "Email me when my payment is recorded."; `maintenance_updates`
     "Repairs" — "Email me when my repair is started or fixed."; `lease_expiration` "Lease ending" — "Email me before
     my lease ends."
   - **owner** (the owner switch *allows* tenant emails; the tenant's own switch can still turn theirs off):
     `rent_due_reminder` "Rent reminders" — "Let Domus remind my tenants 3 days before rent is due.";
     `late_rent` "Late rent" — "Email me when rent is late. Let Domus tell my tenant too.";
     `delinquency_escalation` "Overdue rent" — "Email me if rent stays unpaid. Let Domus remind my tenant too.";
     `payment_received` "Payments" — "Email me when a payment is recorded.";
     `maintenance_updates` "Repairs" — "Email me when a tenant reports a repair.";
     `lease_expiration` "Lease ending" — "Email me before a lease ends. Let Domus tell my tenant too."
   - **manager:** `late_rent` "Late rent" — "Email me when rent is late."; `delinquency_escalation` "Overdue rent" —
     "Email me again if rent stays unpaid."; `payment_received` "Payments" — "Email me when a payment is recorded.";
     `maintenance_updates` "Repairs" — "Email me when a tenant reports a repair."; `lease_expiration` "Lease ending" —
     "Email me before a lease ends."; `manager_invoice` "My invoices" — "Email me when an owner pays my fee."
   Settings passes `notificationPreferenceOptionsForRole(role)`. Hidden keys keep their stored values (never reset).
   Keep `NOTIFICATION_EMAIL_PREFERENCE_OPTIONS` exported for existing callers (do not delete).
2. **Repair started notice.** Migration adds `ticket_in_progress` to `notifications_type_check` with **no
   unconstrained window**: `alter table notifications add constraint notifications_type_check_v2 check (type in (<the
   22 live types>, 'ticket_in_progress')) not valid; alter table notifications validate constraint
   notifications_type_check_v2; alter table notifications drop constraint notifications_type_check; alter table
   notifications rename constraint notifications_type_check_v2 to notifications_type_check;` (one transaction).
   Rollback block (comment) mirrors it: prerequisite `delete from notifications where type = 'ticket_in_progress'`,
   then add a `_v1` constraint with the 22 types `not valid`, validate, drop, rename. Add the type to the TypeScript unions and the places
   that switch on ticket types (preference mapping → `maintenance_updates`; feed/action mapping → the tenant's repair,
   same as `ticket_resolved`; inbox filter label "Repair started"; policy: tenant only, no team fan-out). In
   `updateTicketStatus`, when the status changes **to** `in_progress` from another status and the ticket has a
   tenant, call `createNotificationWithDelivery` for the tenant: title "Your repair has started", body
   `` `Work has started on "${ticket.title}".` ``, `entityType: "maintenance_ticket"`, `entityId: ticket.id`,
   `actorProfileId: user.id`, `type: "ticket_in_progress"`. Same error handling pattern as the resolved notice.
   No notice when the status is unchanged or for other statuses. **At most once per ticket:** the notification row is
   unique per (recipient, type, entity), and since Sprint 244a every email goes through the race-safe claim on the live
   unique index `notification_deliveries_email_once (notification_id, channel, coalesce(email_key,''))` — with no
   `emailKey`, a second call for the same row hits `23505` on the claim, finds the existing `sent` (or `pending`) row
   and skips with reason `"duplicate"`, including under concurrent calls. So a later second move into `in_progress`
   (e.g. in_progress → open → in_progress) updates the same in-app row's text and time, leaves its `read_at` as is,
   and sends **no** second email. Do not add any other dedupe mechanism.
   The `ticket_resolved` notices are a different type and are unaffected. `ticket_in_progress` is tenant-only: it is
   not in the team fan-out list (`notification-fanout.ts`) and the policy gives owners/managers nothing.
3. Migration file + tests.

## 4. Out of scope
Turning notifications on; email templates beyond the default builder; the pause controls; manager reminder permission
switch; comment notices; any other copy.

## 5. Exact files expected to change
- `supabase/migrations/20261101_sprint244b_ticket_in_progress_type.sql` (new)
- `apps/web/lib/notification-preferences.ts`
- `apps/web/app/settings/page.tsx` (the `options=` prop only)
- `apps/web/app/actions/maintenance-ticket-actions.ts`
- `apps/web/lib/notifications.ts`, `apps/web/lib/notification-policy.ts`, `apps/web/lib/notification-feed.ts`,
  `apps/web/lib/notification-actions.ts`, `apps/web/lib/validations-auth.ts`, `apps/web/lib/notification-fanout.ts`
  (only if the type list there must include it), `apps/web/components/dashboard/inbox-views.tsx`,
  `apps/web/components/dashboard/inbox-section.tsx` (type unions/mappings/labels only)
- Tests: `apps/web/app/actions/__tests__/notification-preferences.test.ts`,
  `apps/web/lib/__tests__/notification-preferences.test.ts`, `apps/web/lib/__tests__/notifications.test.ts`,
  `apps/web/lib/__tests__/notification-policy.test.ts`, `apps/web/lib/__tests__/notification-fanout.test.ts`,
  `apps/web/app/actions/__tests__/maintenance-ticket-notifications.test.ts`, new
  `apps/web/components/__tests__/notification-preferences-roles.test.tsx`

## 6. Implementation requirements
- Server action checks unchanged (auth + role + ticket ownership as today). Every Supabase error checked (L-002).
- Copy must pass the plain-language guard (≤ 12 words per sentence) — the strings above do.
- Role reuse (L-014): pin current owner behavior of the settings page (same switches still save; hidden ones untouched).
- Migration: include a rollback block (re-add the constraint without `ticket_in_progress`; note rows of that type must
  be deleted first). Lines ≤ 140 characters.

## 7. Validation
```
cd apps/web
npx vitest run lib/__tests__/notification-preferences.test.ts app/actions/__tests__/maintenance-ticket-notifications.test.ts \
  components/__tests__/notification-preferences-roles.test.tsx app/actions/__tests__/notification-preferences.test.ts \
  lib/__tests__/notifications.test.ts lib/__tests__/notification-policy.test.ts lib/__tests__/notification-fanout.test.ts
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria
- R1 `notificationPreferenceOptionsForRole("tenant" | "owner" | "manager")` returns exactly the keys, order, labels and
  descriptions in §3.1 (`toEqual` on the full arrays).
- R2 Settings renders, for a tenant, 6 switches with those labels and no "My invoices"; for a manager, no "Rent
  reminders"; for an owner, no "My invoices".
- R3 Real save boundary: call the existing server action behind the switches
  (`app/actions/notification-preferences.ts` `updateNotificationPreferences`, mocked Supabase holding a stored row
  with a hidden key, e.g. tenant `manager_invoice: false` and owner-only keys) with one visible key toggled; assert the
  exact written `notification_preferences` object equals the stored object with only that key changed (every hidden
  key preserved). Plus the component test: toggling one switch submits only that key. (Add
  `apps/web/app/actions/__tests__/notification-preferences.test.ts` to §5 if it does not exist.)
- R4 `updateTicketStatus` sequences (assert every call's exact args):
  open → in_progress with a tenant: one tenant call with exactly the §3.2 fields, no team call;
  in_progress → in_progress: no call; open → in_progress without a tenant: no call;
  open → in_progress → resolved: the in-progress call, then today's resolved tenant + team calls unchanged (pinned);
  closed: today's team call only (pinned); in_progress → open → in_progress: the second transition calls
  `createNotificationWithDelivery` again (same type/entity — the delivery layer dedupes the email; covered by R4b).
- R4b Delivery layer — call the real `createNotificationWithDelivery` / `sendNotificationEmail` (do not mock them) against
  a stateful fake Supabase that enforces both unique keys: first
  `ticket_in_progress` call inserts the row and sends (1 Resend call, result email `sent`); a second call for the same
  ticket → same row id, email claim conflict (`23505`) → result email `skipped` reason `"duplicate"`, still 1 Resend
  call; two calls started together (`Promise.all`) → exactly 1 Resend call; the row's `read_at` set before the second
  call is unchanged after it.
- R4c Policy/fan-out: `ticket_in_progress` yields no owner/manager recipients (test the policy + fan-out functions
  directly).
- R5 `ticket_in_progress` maps to the `maintenance_updates` preference and to the tenant's repair action link.
- R6 Migration test reads the file: the forward constraint allows exactly the 22 §2 types + `ticket_in_progress` (23,
  no extras), uses `not valid` + `validate` + rename; the rollback block allows exactly the 22 types.
- R7 Gate green (counts verbatim).

## 9. Report format
Compact status only: files changed with line deltas, R1–R7 → test names, migration SQL verbatim, validation counts.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5; list anything else. Do not commit. Do not apply the migration (Claude applies it before deploy, after a
rolled-back dry run and a diff against the live constraint). No Undo flow (settings toggles already save instantly and
can be flipped back).
The user should never need to read instructions to complete this flow: each switch says what it does.

Claude's dry run: confirm the live `notifications_type_check` definition equals the §2 list and that no
`notifications_type_check_v2` exists before the swap (rolled-back transaction).
