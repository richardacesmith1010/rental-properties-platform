# Sprint 146a — Notifications master switch: everything off until launch (Option A)

**Severity: L3** (notification delivery across the app). Domus ChatGPT review: APPROVE WITH CHANGES — all 5 required changes + both optional suggestions adopted (rev 2). Split from Sprint 146 after Codex's inventory showed 45+ files. Owner chose **Option A** (2026-10-03): while the switch is OFF, **no notification of any kind** is created or emailed — including owner-initiated ones (announcements, bulk payment reminders, document-packet notices, message/comment alerts). This replaces the reviewed "automatic vs owner_initiated intent" design, which needed 22 files.

## 1. Objective
One server env var, default OFF. While OFF, the notification system creates no in-app notification rows, no delivery rows, and sends no notification emails, for any caller. No non-notification behavior changes (aside from the honest owner-facing messages in §3.5).

## 2. Context
- Branch `main`, HEAD `4a8e6b5` (or later docs-only). Owner direction: "until I tell you that people are using the app, I don't see the value in having it generate any notifications to people."
- Codex's Sprint 146 inventory (2026-10-03), confirmed against code:
  - The ONLY write to the `notifications` table and the only notification email send (Resend) are inside `apps/web/lib/notifications.ts` → `createNotificationWithDelivery` (~:177; Resend ~:562). All wrappers (`notifyOwnerMembersForProperty`, `notifyOwnerOfStripeIssue`, `notifyAccountMembers`, `notifyOwnerMembersOfAcceptedTenantInvite`) route through it.
  - `lib/delinquency.ts` and `lib/lease-lifecycle.ts` only READ `notifications` for de-duplication; their notification-only cron functions are `sendDelinquencyEscalations`, `sendRentDueReminders` (delinquency.ts) and `sendLeaseExpirationWarnings` (lease-lifecycle.ts). `lib/dashboard.ts` only reads.
  - No push or SMS send path exists.
  - NOT notifications (must keep working, separate send paths): tenant invites `lib/invite-email.ts`, LLC invites `lib/llc-invitation-email.ts`, manager invoices `lib/invoice-email.ts`, ops alerts `lib/platform-alerts.ts`, feedback mail `app/actions/feedback.ts`, Supabase auth mail.
- Inbox messages, maintenance comments, announcements records, and document packets are stored in their own tables; only their *notification* is suppressed.

## 3. In scope
1. New `apps/web/lib/notifications-switch.ts`: `export function notificationsEnabled(): boolean` → `process.env.DOMUS_NOTIFICATIONS_ENABLED === "true"`; anything else (unset, "false", "TRUE ", etc.) = OFF.
2. `createNotificationWithDelivery`: first statement — if `!notificationsEnabled()`, log `[notifications] off: skipped <type>` (type only, no recipient/email/IDs) and return without any DB call or fetch. No signature change for callers.
3. `sendDelinquencyEscalations`, `sendRentDueReminders`, `sendLeaseExpirationWarnings`: FIRST inventory each function for side effects. If a function does only notification work, return `"Notifications off: 0 sent."` at the top when OFF. If it mixes in any non-notification work (status updates, records, etc.), that work must still run when OFF — gate only the notification query/send and still return a string containing `"Notifications off"`. Report the classification of each function.
4. **Repo-wide bypass check:** re-verify the chokepoint across `apps/`, `supabase/migrations/`, any Supabase functions, SQL/RPCs, and triggers for (a) writes to `notifications` / `notification_deliveries`, (b) notification email sends, (c) push/SMS/webhook notification delivery. A database trigger or RPC that creates notifications would defeat the switch — if one exists, list it in `deviations` and do not change the DB (Claude handles it).
5. **Caller return contract:** `createNotificationWithDelivery` now silently returns when OFF. Verify every caller tolerates that: none uses its result to claim success, dereference an ID, retry, or trigger downstream behavior. Fix any that do (counts as in-scope). Add at least one representative caller test (e.g., the announcement action) proving the underlying record is still created while zero notification/delivery rows are written when OFF.
6. Owner-facing honesty: where an owner explicitly sends something whose only delivery is a notification (Send Announcement; bulk payment reminder), the success message must not claim people were notified while OFF. Change only those success strings to: **"Saved. Notifications are off until launch, so no one was notified."** (≤12 words per sentence; find the exact strings via the five owner-initiated callers: `app/actions/announcements.ts`, `app/actions/notifications.ts` batch reminders). Audit the success text of ALL owner-initiated notification callers (announcements, bulk reminders, document packets, inbox messages, maintenance comments). Text may stay unchanged only if it describes the content being saved/sent in-app and does not claim an alert, email, or notification occurred; otherwise make it conditional on the switch like the strings above. Record the audit in the report.

## 4. Out of scope
- "Pays outside Domus" (Sprint 146b), any lease/charge/late-fee logic.
- Invites, invoices, ops alerts, feedback mail, auth mail.
- Notification preferences UI, templates, read/mark-read paths, notification reads.
- No DB, deploy, env/secret changes (Claude sets/leaves the env var unset = OFF), commit, or push.

## 5. Exact files expected to change
`apps/web/lib/notifications-switch.ts` (new), `apps/web/lib/notifications.ts`, `apps/web/lib/delinquency.ts`, `apps/web/lib/lease-lifecycle.ts`, `apps/web/app/actions/announcements.ts`, `apps/web/app/actions/notifications.ts`, and tests. If anything else must change, list it and why in `deviations` (do not exceed 10 non-test files).

## 6. Implementation requirements
- Switch parsing tests: only exact `"true"` enables — unset, `"false"`, `"TRUE"`, `"TRUE "`, `"1"`, and `" true"` are all OFF.
- Tests (Vitest): OFF → `createNotificationWithDelivery` makes zero Supabase calls and zero fetch calls, for any type; ON ("true") → existing behavior and existing tests unchanged; each of the three cron functions returns a string containing "Notifications off" and makes no notification query/send when OFF, while any non-notification work it does still runs; announcement and bulk-reminder success messages show the OFF text when OFF and the existing text when ON; invite/invoice email helpers untouched (no diff).
- No auth/role check changes (AGENTS.md §3). No PII in logs. Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run gate:web
git diff --stat
git diff -- apps/web/lib/invite-email.ts apps/web/lib/llc-invitation-email.ts apps/web/lib/invoice-email.ts apps/web/lib/platform-alerts.ts apps/web/app/actions/feedback.ts   # must be empty
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- With the env var unset: zero notification rows, zero delivery rows, zero notification emails from any caller (tests prove it at the single chokepoint + the three cron functions).
- Invite/invoice/ops/feedback/auth email paths unchanged (empty diff).
- Owner sees the honest OFF message for announcements and bulk reminders.
- ≤ 10 non-test files changed.

## 9. Report format
Conform to `docs/codex-report-schema.json`. `copy_changes`: every changed success string. `self_verification.findings`: confirmation that `createNotificationWithDelivery` is the only notifications-table writer and Resend notification sender (re-verify with rg), and how each cron function was gated.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
