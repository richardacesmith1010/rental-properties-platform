# Notifications plan (design only — nothing is turned on)

Status 2026-10-10: every notification is OFF (`DOMUS_NOTIFICATIONS_ENABLED` unset). This plan says what Domus should send, to whom, and how we turn it on safely before Alia starts.

## What exists today (inventory)
- One sender: `lib/notifications.ts` `createNotificationWithDelivery` → in-app row + email (Resend). Off unless `DOMUS_NOTIFICATIONS_ENABLED=true`.
- 22 types, in-app bell + feed, email preferences (7 categories, all on by default, pause option). No push, no text messages.
- Daily cron (08:00): rent charges + late fees, autopay, lease expired, lease ending in 30 days, overdue follow-ups, rent due in 3 days.
- Fan-out goes to **owners + tenant**. Managers get almost nothing (only the Stripe manager-fee payment).

## Problems found
1. **Wrong people for client homes.** Alia's client homes have owners who aren't on Domus. Fan-out sends to owners + tenant, so Alia (the one doing the work) hears nothing.
2. **Rent reminders ignore "pays outside Domus".** `sendRentDueReminders` (`lib/delinquency.ts:221`) doesn't skip `collects_outside_domus` leases. Angel would get "rent due" emails for rent he pays by bank. (Late fees and overdue follow-ups already use `tracksLateRent`.)
3. **One big switch.** It's all-or-nothing. We can't test real emails on just you and the test accounts first.
4. **Noisy types.** Every lease edit emails the tenant (`lease_updated`). Every ticket comment emails everyone.
5. **Side effects while off.** Inbox threads are still created for tickets and lease changes while notifications are off (`notification-fanout.ts:40`). Invite emails also send while off; that's correct, since you clicked "Invite".

## Proposed rules (v1)
| Event | Owner | Manager | Tenant | Email? |
|---|---|---|---|---|
| Rent paid (Domus or recorded) | ✓ | ✓ client homes | receipt | yes |
| Rent late (home tracks late rent) | ✓ | ✓ client homes | only if pays in Domus | yes |
| Rent due in 3 days | – | – | only if pays in Domus | yes |
| New problem reported | ✓ | ✓ | – | yes |
| Problem fixed | – | – | ✓ | yes |
| Problem comment | other side only | other side only | other side only | in-app only |
| Lease ending in 30 days / ended | ✓ | ✓ | ✓ | yes |
| Lease edited | – | – | in-app only | no |
| Messages | other side | other side | other side | yes (batched hourly later) |
| Payouts / LLC approvals | members | – | – | yes |

"Pays in Domus" means the lease has `collects_outside_domus = false`. Client-home tenants and Angel get no rent reminders or late notices from Domus in v1; the manager or owner handles that person to person.

## How we turn it on (3 steps, no big bang)
1. **Test-only:** a new env var `DOMUS_NOTIFICATIONS_ALLOWLIST` (emails). Only those people get anything. Start with you + the smoke test accounts. Run a week, check every email.
2. **Alia:** add Alia's email. She sees exactly what she'd get.
3. **Everyone:** you say "real people use it now" → set `DOMUS_NOTIFICATIONS_ENABLED=true`, remove the allowlist.

Phone (push) notifications come later, after Apple activation, as an app sprint.

## Proposed Sprint 211 — "Notification rules v1" (L3: decides who sees what)
- Allowlist switch (off / allowlist / on), checked in the one sender and the crons.
- Manager recipients for client homes (new `notifyManagersForProperty`, active manager links only).
- Rent reminder skips `collects_outside_domus`; tenant late notices skip it too.
- Lease-edit and ticket-comment become in-app only. Nobody gets their own action.
- Inbox mirroring obeys the switch.
- Tests per row of the table above, plus an attacker check: no notification row may reach someone without access to that home.

## Decisions for the owner
1. Should managers get the client-home notices above? (Recommended: yes.)
2. Should client-home tenants get rent reminders from Domus? (Recommended: no for v1.)
3. Should we use the 3-step turn-on with an allowlist? (Recommended: yes.)
