# Sprint 211 — Notification rules v1 (L3: decides who sees what) · rev 3 (rev 1 REJECT → rev 2 APPROVE WITH CHANGES → all 4 required + optional 1, 3 adopted)

Owner approved the plan in `docs/notifications-plan.md` on 2026-10-10 ("yes to all"). Notifications stay OFF in production after this sprint. This sprint only makes the rules correct and adds a test-only mode.

## 1. Objective
Make every notification go to the right people, and add a safe way to turn notifications on for a short test list first.

## 2. Context (HEAD `dcf26ca`, branch `main`)
- **One sender:** `createNotificationWithDelivery` (`lib/notifications.ts:165`). It returns early unless `notificationsEnabled()` (`lib/notifications-switch.ts`, `DOMUS_NOTIFICATIONS_ENABLED === "true"`). It creates the in-app row, then sends email.
- **Fan-out:** `lib/notification-fanout.ts`.
  - `notifyOwnerMembersForProperty` sends to active owner members with `can_receive_critical_alerts`. It passes `actorProfileId` only to the inbox mirror and does **not** exclude the actor.
  - It also mirrors `new_ticket`, `ticket_resolved` and `lease_updated` into inbox threads, even while notifications are off.
- **Who can manage a home (live `can_administer_property`, mirror this exactly):** a manager may manage a home only if **both**:
  - (a) an active `property_managers` row exists for (property, manager); **and**
  - (b) the home is not a client home (`managed_client` is false or there's no account), **or** an active `ownership_account_managers` row exists for (the home's account, manager).

  Live SQL (manager branch):
  ```sql
  exists (select 1 from property_managers pm join properties p on p.id = pm.property_id
    left join ownership_accounts oa on oa.id = p.owner_account_id
    where pm.property_id = $home and pm.manager_profile_id = $mgr and pm.active
      and (coalesce(oa.managed_client,false) = false or exists (select 1 from ownership_account_managers x
        where x.account_id = oa.id and x.manager_profile_id = $mgr and x.active)))
  ```
  An active `property_managers` row alone does **not** authorize a client home. This is intentional (Sprint 205).
- **Home and lease flags:**
  - Client home: `getClientHomeFlags` (`lib/lease-collection.ts`).
  - "Pays outside Domus": `isCollectedOutsideDomus(lease)` (`leases.collects_outside_domus`).
- **Callers of the switch:** `lib/delinquency.ts`, `lib/lease-lifecycle.ts`, `app/actions/notifications.ts`, `app/actions/announcements.ts`. The `capabilities.notificationsEnabled` flag on pages is a different thing (it only means "the tables exist"); don't touch it.

## 3. In scope

### A. Three modes (`lib/notifications-switch.ts`), fail closed
1. `notificationMode(): "off" | "test" | "on"`:
   - parse `DOMUS_NOTIFICATIONS_ALLOWLIST` (comma-separated): trim, lowercase, drop empties and duplicates, and **drop any entry that isn't a valid email** (simple `local@domain.tld` check);
   - the mode follows this table exactly ("configured" = the allowlist var is set and non-blank):

     | Allowlist | `ENABLED` | Mode |
     |---|---|---|
     | not configured | unset or not `"true"` | off |
     | not configured | `"true"` | on |
     | configured, ≥1 valid entry | any | test (log one warning `[notifications] both set: using test mode` if ENABLED is `"true"`) |
     | configured, **no** valid entries | any | **off** (log one warning `[notifications] allowlist invalid: off`) |
   - A malformed or unknown value never yields `"on"`.
2. `notificationsEnabled()` returns `mode !== "off"`, so the crons run in test mode.
3. **Recipient gate, inside `createNotificationWithDelivery`, before any write:**
   - `"off"`: return.
   - `"test"`: look up the recipient's **canonical email from `profiles` by `recipientProfileId`** (ignore the caller-supplied `recipientEmail` for this decision).
     - If the lookup errors, the profile is missing, the email is empty, or it isn't on the list: write nothing (no in-app row, no delivery row, no email) and return.
     - Log `[notifications] test mode: skipped <type>` with no email or name.
   - `"on"`: unchanged.
   - Put the pure decision in `isNotificationRecipientAllowed(mode, canonicalEmail, list)` and unit-test it.
4. **The allowlist only narrows; it never grants.** Recipients are first chosen by the event rules and home/lease relationships (§B, §C). The allowlist is then applied on top: authorized recipient AND preferences AND allowed by mode.
5. Add both env vars to `apps/web/.env.example`, commented, with empty values.
6. **Logs:** no recipient emails, names or message bodies in any new log line. Log the event, operation and error code only.

### B. Recipients
1. **New pure module `lib/notification-policy.ts`** (no I/O). It holds the §C rules as data, keyed by a typed **event**, not by notification type (several events share a type).
   ```ts
   type NotificationEvent =
     | "rent_paid_manual" | "rent_paid_stripe" | "late_fee" | "overdue_followup" | "autopay_failed"
     | "bank_payment_failed" | "rent_due_reminder" | "ticket_created" | "ticket_comment" | "ticket_resolved"
     | "lease_ending_soon" | "lease_ended" | "lease_changed";
   interface EventRule {
     type: NotificationType;
     owners: boolean;
     managers: "all_homes" | "client_homes" | "none";
     tenant: "always" | "in_domus_only" | "never";
     email: boolean;
     excludeActor: boolean;
   }
   ```
   `rulesFor(event)` returns the rule; a manager-scope helper, if any, takes the **event** (not the type).
   - **Events not in this table** (messages, documents, invites, payouts, LLC approvals, announcements, application reviewed, invite accepted, Stripe-issue alert) keep today's recipients.
   - Their only change: when a fan-out helper today receives `actorProfileId` for a user's own action, that actor is now excluded.
   - Automated, webhook and critical alerts (e.g. the Stripe-issue alert) never exclude anyone.
2. **Who counts as an owner of a home:** active `ownership_account_members` with `member_role = 'owner'` and `can_receive_critical_alerts`, on **that home's current** `properties.owner_account_id` (looked up from the DB by property id at send time). Recipients by kind of home:
   - **ordinary home:** its account's owners, plus its managers when the rule allows;
   - **unclaimed client home:** no owner members exist, so only managers (by the rule) and the tenant;
   - **claimed client home:** the claimed account's owners plus its managers;
   - **several managers:** each authorized manager once;
   - **home moved to another account:** only the current account's owners.
   - Members of any other account never receive it.
3. **Rename `notifyOwnerMembersForProperty` → `notifyPropertyTeam`** and update every caller (no alias left behind). It sends to:
   - the owners as today;
   - **plus** the active managers of that home (rule in §2) when `managerScopeFor(type)` allows it for that home.
   - Recipients are deduped by profile id.
   - **Actor exclusion:** `actorProfileId` is excluded only when the rule has `excludeActor: true`.
     - User actions (manual payment, ticket created or commented, lease changed): exclude the actor.
     - Cron and webhook events (late fee, overdue, reminders, lease ending or ended, Stripe paid, autopay or bank failure) have **no actor** and never exclude anyone.
     - `excludeProfileId` keeps today's behavior. Matching is always by profile id.
   - Add a query helper `listActiveManagersForProperty(admin, propertyId)` with batched queries (no query inside a loop). Every Supabase error is logged and returns no recipients (fail closed).
4. **Manager role and links:** pass `recipientRole: "manager"` for managers. Every manager notification's action link must point under `/manager` (check `lib/notification-actions.ts`; fix only if a type in §B1 has no manager link).

### C. Per-event rules (change call sites)
| Event (type) | Owners | Managers | Tenant | Email |
|---|---|---|---|---|
| Rent paid (`payment_recorded`, manual and Stripe) | ✓ | client homes | receipt, **only if the lease is not outside Domus** | yes |
| Late fee, overdue follow-up (`late_rent`, `delinquency_escalation`) | ✓ | client homes | **only if not outside Domus** | yes |
| Autopay / bank payment failed (`late_rent`) | ✓ | client homes | ✓ (these are Domus payments) | yes |
| Rent due in 3 days (`rent_due_reminder`, cron) | – | – | **skip leases outside Domus** | yes |
| Owner's "Send reminder" button | unchanged (the owner chose it) | | | |
| New problem (`new_ticket`) | ✓ | all homes | **no** | yes |
| Problem comment (`new_ticket` from comment actions) | everyone on the ticket's home team + tenant, **except the author** | | | **in-app only** |
| Problem fixed (`ticket_resolved`) | **no** | no | ✓ | yes |
| Lease ending in 30 days (`lease_expiring_soon`) | **✓ (new)** | all homes | ✓ | yes |
| Lease ended (`lease_expired`) | ✓ | all homes | ✓ | yes |
| Lease created/edited/deleted (`lease-mutations.ts`) | **no** | no | ✓ | **in-app only** |
| Lease renewed/ended by owner (`lease-lifecycle-actions.ts`) | unchanged | | | |
| Messages, documents, invites, payouts, LLC approvals, announcements | unchanged, except the actor is never notified | | | |

- **"In-app only":** add an optional `emailMode?: "default" | "never"` to `CreateNotificationParams` and to the fan-out params. `"never"` forces email off after preferences are applied. In-app follows preferences as today.
- **Outside Domus is read from the stored lease** (`leases.collects_outside_domus`). If the lease can't be loaded or the flag is null or unreadable, tenant money notices (`in_domus_only`) are **not sent** (fail closed). Owners and managers still get theirs.
- **Ticket comments** use event `ticket_comment` (DB type stays `new_ticket`). Recipients come from the stored ticket's property and its tenant, minus the author (by profile id, even if they hold several roles).
- **Avoid an extra query per tenant.** Where the lease row is already loaded, read `collects_outside_domus` from it. Otherwise add the column to the existing select.

### D. Side-effect contract per mode
- **off:** no notification rows, no delivery rows, no notification emails, no inbox-thread mirrors.
- **test:** allowlisted (and authorized) recipients get normal notification rows and emails, per preferences and the event's email setting. **No inbox-thread mirror is created for anyone**, including allowlisted people (`ensureInboxThreadForEvent` runs only in `"on"`).
- **on:** everything as designed.
- **Always unaffected:** business records and inbox conversations people write themselves (messages, tickets, comments).

### D2. Timing of authorization (no stale lists)
- Delivery is synchronous today: recipients are chosen and the row and email are written in the same call. Confirm this in the report. If you find any queued or retried email path, list it and make it re-check the recipient (§2 rule + mode gate) right before sending, failing closed.
- Do **not** add any queue, retry worker or cached recipient list.
- `emailMode: "never"` must hold on every path that can send email for that row.

### E. User messages (exact copy, L-020)
In `app/actions/notifications.ts` and `app/actions/announcements.ts`, every success message branches on the mode:
- `"on"`: unchanged.
- `"test"`: `Saved. Domus is in test mode. Only test accounts can get notices.`
- `"off"`: unchanged (`Saved. Notifications are off until launch, so no one was notified.`).

List every other return string you touch in the report.

### F. Call-site inventory (report only)
In the report, list every notification producer and side-effect path:
- every caller of `createNotificationWithDelivery` and of the fan-out helpers;
- every email sender in `lib/*email*.ts`;
- inbox mirrors and crons.

For each, give its event, its recipients, and the gate it passes (mode gate, or "bypass: user-initiated invite/feedback/invoice, unchanged").

## 4. Out of scope
- Push and text messages; batching or digests.
- Any change to preference categories or the settings UI; DB migrations (Claude will lock down table grants separately).
- `apps/mobile`, `apps/ios`, `.claude/launch.json`.
- Changing notification wording other than §E.
- Vercel env changes.

## 5. Exact files expected to change
- `apps/web/lib/notifications-switch.ts`
- `apps/web/lib/notifications.ts`
- `apps/web/lib/notification-fanout.ts`
- `apps/web/lib/notification-policy.ts` (new)
- `apps/web/lib/notification-actions.ts` (only if §B3 needs it)
- `apps/web/lib/delinquency.ts`
- `apps/web/lib/charge-generation.ts`
- `apps/web/lib/lease-lifecycle.ts`
- `apps/web/lib/stripe-webhook-handlers.ts`
- `apps/web/app/actions/charges.ts`
- `apps/web/app/actions/maintenance-ticket-actions.ts`
- `apps/web/app/actions/maintenance-comment-actions.ts`
- `apps/web/app/actions/lease-mutations.ts`
- `apps/web/app/actions/notifications.ts`
- `apps/web/app/actions/announcements.ts`
- other current callers of `notifyOwnerMembersForProperty`, for the rename only (`document-packets.ts`, `charge-checkout.ts` via `notifyOwnerOfStripeIssue`, the invite-accepted fan-out)
- `apps/web/.env.example`
- tests under `apps/web/lib/__tests__/` and `apps/web/app/actions/__tests__/` (new and updated)

## 6. Implementation requirements
- Lines ≤ 140. No new dependencies.
- Every Supabase result is checked; errors are logged and fail closed (no recipients).
- No query inside a loop.
- `lib/notification-fanout.ts` stays ≤ 500 lines. Split recipient queries into `lib/notification-recipients.ts` if needed (add it to §5 in your report).

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- the new and changed tests
- `npm run gate:web`

## 8. Acceptance criteria (binary)
Each item needs its own test that calls the real code.
1. **Modes:** `off`, `test` and `on` resolve correctly, including:
   - an empty env var, uppercase emails, spaces, duplicates, and malformed entries (dropped);
   - every row of the §A1 table, including that an allowlist of only malformed entries is `"off"` even with `ENABLED="true"`.
2. **Test mode blocks everyone not on the list.** It writes no in-app row, no delivery row and no email (assert the admin mock got no `upsert`, insert or `fetch`). A listed recipient gets both. Also:
   - the caller passes a listed `recipientEmail`, but the profile's real email isn't listed: blocked;
   - the profile lookup fails or the email is missing: blocked.
2b. **The allowlist never grants access:** an allowlisted manager who is inactive, removed from the home, or linked to a different client account gets nothing. An allowlisted tenant gets nothing about another tenant's rent or ticket.
3. **Managers:** a client-home manager with an active account link gets `payment_recorded`, `late_rent` and `delinquency_escalation`.
   - The same manager **without** the active `ownership_account_managers` link gets nothing.
   - An inactive `property_managers` row gets nothing.
   - A manager of a non-client home does not get `payment_recorded`, but does get `new_ticket`, `lease_expiring_soon` and `lease_expired`.
   - Owners of an unrelated account get nothing. After a home moves to another account, only the new account's owners get notices.
   - Two authorized managers each get exactly one.
4. **Nobody is told about their own action:**
   - the owner who records a manual payment gets no `payment_recorded`;
   - the author of a ticket comment (tenant, owner or manager) gets nothing;
   - someone who is both owner and manager gets one notification, not two.
   - Cron and webhook events (autopay failed, late fee) still reach every owner: there's no actor exclusion.
5. **Outside-Domus tenants:**
   - no rent-due reminder (cron), no late fee or overdue notice, no payment receipt;
   - an in-Domus tenant still gets all four;
   - the owners still get their notices;
   - a missing lease or unreadable flag means no tenant money notice;
   - autopay or bank failure still reaches the tenant (Domus payment).
6. **Tickets:** a new ticket sends nothing to the tenant. Ticket fixed sends to the tenant only. A ticket comment creates in-app rows and sends **no** email.
7. **Leases:** a lease edit sends the tenant an in-app row with no email and sends nothing to owners. Lease ending in 30 days now reaches owners and managers.
8. **Inbox mirror:** it does not run in `off` or `test` mode (including for an allowlisted recipient, who still gets the notification row), and does run in `on`.
8c. **Events outside the table:** an announcement and a message don't notify their sender. An invitation keeps today's behavior. An autopay failure reaches every owner.
8b. **Partial failure:** if one recipient's lookup or send fails in a multi-recipient event, the others still get theirs, nobody extra is added, and no recipient's data appears in another's notice.
9. **Copy:** the §E messages are exact in each mode.
10. **Clean rename:** `grep -rn notifyOwnerMembersForProperty apps/web` returns 0 results.
11. **One write path:** `grep -rn 'from("notifications")' apps/web/app apps/web/lib` shows writes (`insert`/`upsert`/`update`) only in `lib/notifications.ts`.
12. Lint, typecheck and the full gate are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, plus:
- the list of tests mapped to criteria 1–11, including 2b and 8b (file and test name);
- the §F call-site inventory;
- every user-visible string you changed.

Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB access, deploy, commit or push.
- Don't touch `.claude/launch.json`, `apps/mobile` or `apps/ios`.
- Don't set any env var outside `.env.example`.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.
