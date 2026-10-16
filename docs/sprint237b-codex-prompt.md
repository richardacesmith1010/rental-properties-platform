# Sprint 237b — Manager rent reminders (owner-approved) + manager walk fixes (L3: permission + schema) — rev 1

## 1. Objective
1. Let a manager send rent reminders for homes they manage, **only when the owner turned it on** ("Let my manager send rent
   reminders", off by default). Delivery still goes through the notifications switch, so nothing reaches real people
   until launch (owner rule; test mode = allowlisted test accounts only).
2. Fix the small manager-walk findings M7, M8, M5, M6, M2, T1 (`docs/manager-walk-plan-2026-10-16.md`).

## 2. Context
- HEAD `3b8ac14` (main). Runs after 237a ships (no shared files except tests are expected; see §5).
- `sendBatchPaymentReminder` — `app/actions/notifications.ts:143-319`: `requireAuth("owner")` (l.147); rate limit
  `sendBatchPaymentReminder:<userId>` 10/min (l.148); `ensureCapabilityEnabled("notificationsEnabled")` (l.152); scopes
  charges with `getAdministeredPropertyIds(user.id)` (l.209) — this already includes active `property_managers` homes
  (`lib/property-access.ts:84-102`); sends `rent_due_reminder` per charge through `createNotificationWithDelivery`
  (`lib/notifications.ts:170`), which respects `lib/notifications-switch.ts` (off / test / on); audit
  `send_batch_payment_reminder` (l.294-307); revalidates `/owner` and `/tenant` only (l.309-310).
- Owner page passes the action (`app/owner/page.tsx:264`); `render-section-cases.tsx:69-73` forwards it;
  `charges-implementation.tsx` uses it for the toolbar (l.93), per-row Remind (l.414-418, `handleSingleReminder` l.207).
  `app/manager/page.tsx:273-324` never passes it.
- No manager permission flag exists in any migration. Domus-owner invites write `property_managers(property_id,
  manager_profile_id, active, assigned_at)`; homes belong to `properties.owner_account_id` → `ownership_accounts`.
- Policy: outside-Domus tenants never get rent reminders (`lib/notification-policy.ts`, Sprint 211) — unchanged.
- **M7** sidebar badge = `safeInboxThreads.length` (`components/dashboard/dashboard-kpi-loader.ts:248`) vs inbox unread =
  `notifications.filter(n => !n.readAt).length` (`components/dashboard/inbox-section.tsx:99`, shown l.146).
- **M8** `inbox-section.tsx` l.271 "Create thread", options l.293-297 "General / Maintenance Ticket / Lease / Rent Payment /
  Document Packet", button l.303 "Create thread", success "Thread created.", select title "Link this thread to a related
  workflow entity."; banned-word list `lib/plain-language/scan.ts:12-19` lacks ticket/packet/thread/entity.
- **M5** `charges-implementation.tsx:325-327` `InlineAlert state={manualPaymentState}` keeps "Manual payment recorded."
  after an undo (undo bypasses `useFormState`).
- **M6** Toaster `components/ui/sonner-provider.tsx` duration 4000; undo toast `charge-more-menu.tsx:194` was seen staying
  on screen for minutes across sections; repair status `components/dashboard/ticket-status-control.tsx` shows only an
  inline "Saved." (l.42) that is lost on refresh.
- **M2** `components/dashboard/invitations/invite-manager-form.tsx`: Next button (l.123-127) still rendered (disabled) on the
  final step; success banner (`FormSuccess`, l.62) appeared clipped in the dialog.
- **T1** `components/dashboard/maintenance-section.tsx:250-272` always shows Cost / Vendor / Assignment; tenant view passes
  `viewerRole="tenant"` (`app/tenant/page.tsx:419-429`).

## 3. In scope
Manager reminders (schema + action + owner setting UI + manager UI), M7, M8, M5, M6, M2, T1.

## 4. Out of scope
Turning notifications on; reminder copy/body; tenant-side changes beyond T1; M1/M3/M11 (Sprint 237c); money logic.

## 5. Exact files expected to change
1. `supabase/migrations/20261019_sprint237b_manager_reminders.sql` (new)
2. `apps/web/app/actions/notifications.ts` (`sendBatchPaymentReminder` only)
3. new owner setting action, e.g. `apps/web/app/actions/manager-permissions.ts` (+ re-export in `app/actions/index.ts`)
4. the owner Settings UI file that lists account settings (find it; name it in the report) — one new switch row
5. `apps/web/app/manager/page.tsx` (pass the action + whether reminders are allowed per home)
6. `apps/web/components/dashboard/charges/charges-implementation.tsx` (Remind shown for managers only where allowed; M5)
7. `apps/web/components/dashboard/dashboard-kpi-loader.ts` (M7)
8. `apps/web/components/dashboard/inbox-section.tsx` (M7 if needed, M8)
9. `apps/web/lib/plain-language/scan.ts` (M8 banned words)
10. `apps/web/components/dashboard/charge-more-menu.tsx` (M6 toast)
11. `apps/web/components/dashboard/ticket-status-control.tsx` (M6 confirmation)
12. `apps/web/components/dashboard/invitations/invite-manager-form.tsx` (M2)
13. `apps/web/components/dashboard/maintenance-section.tsx` (T1)
14. Tests for each (name them in the report) + `supabase/tests/sprint237b_manager_reminders.sql` (new, rolled back).

## 6. Implementation requirements
1. **Schema.** `ownership_accounts.managers_can_send_reminders boolean not null default false`. Only an owner member of
   the account may change it: write through a new service-role-only RPC `set_managers_can_send_reminders(p_account_id uuid,
   p_actor_id uuid, p_value boolean)` (`security definer`, `search_path = ''`, revoke from public/anon/authenticated, grant
   service_role) that checks `p_actor_id` is an active **owner** member of the account (existing helper
   `is_owner_member_of_account` logic), updates, and writes `audit_logs` (`set_manager_reminders`, before/after). No client
   column grant on the new column. Client accounts (`managed_client = true`) keep `false`; the manager is their operator,
   but their tenants pay outside Domus and get no reminders anyway (policy unchanged).
2. **Owner setting UI.** In owner Settings, per ownership account the owner belongs to: switch
   `Let my manager send rent reminders`, helper `Your manager can remind tenants about rent.` Shown only when the account
   has at least one active manager on its homes. Server action checks `requireAuth("owner")`, rate limit, calls the RPC.
3. **Action.** `sendBatchPaymentReminder` allows `requireAuth("owner", "manager")`. For a **manager**, every requested
   charge's home must (a) be in `getAdministeredPropertyIds(user.id)` and (b) belong to an account with
   `managers_can_send_reminders = true`. If any charge fails (a) or (b), reject the whole request with
   `Your owner has not turned on reminders for this home.` (fail closed, nothing sent). Owners: behavior unchanged.
   Also revalidate `/manager`. Audit metadata includes `actor_role`.
4. **Manager UI.** `app/manager/page.tsx` passes the action and a set of property ids where reminders are allowed; the
   Remind button/toolbar shows only for rows on those homes. Copy unchanged.
5. **M7.** The sidebar Messages badge shows the same unread number as the inbox (one shared source); 0 → no badge.
6. **M8.** Create-thread copy: heading `Start a conversation`; options `General`, `Repair`, `Lease`, `Rent`, `Papers`;
   placeholder `Subject`; button `Start conversation`; success `Conversation started.`; select title
   `Pick what this is about.` Option **values** unchanged. Add `ticket`, `tickets`, `thread`, `threads`, `entity`,
   `packet`, `packets` to the banned list and fix any other user-facing hits (or add justified exceptions; ≤ 25 total).
7. **M5.** After a successful undo, the inline "Manual payment recorded." alert is cleared (the undo success toast is the
   only message).
8. **M6.** Find why the undo toast stayed for minutes (e.g. a toast created while the dialog unmounts, hover-pause, or a
   duplicate Toaster) and fix the cause; the undo toast must auto-dismiss in ~4 s like others. Repair status update shows
   a toast `Repair updated.`
9. **M2.** Hide Next on the final step. The success banner text is fully visible (no clipping) at 375 px and 1440 px.
10. **T1.** Tenant view hides Cost, Vendor and Assignment on repair cards.
11. Plain language, lines ≤ 140, files ≤ 500, every Supabase error checked. The user should never need to read
    instructions to complete this flow.

## 7. Validation commands
```
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web` or apply the migration. Claude applies it and runs the SQL fixture live (rolled back).

## 8. Acceptance criteria
1. SQL fixture: owner member sets the flag → true + audit row; a manager, a tenant, an unrelated owner, or an unknown actor
   → rejected; `authenticated` cannot execute the RPC or update the column directly.
2. Action, manager, flag on, managed home → reminders created through the switch (mock) for those charges.
3. Manager, flag off → exact rejection copy, no notification calls.
4. Manager, one charge on a home they don't manage (flag on) → whole request rejected, nothing sent.
5. Owner behavior unchanged (existing tests pass); tenant → rejected by requireAuth.
6. Manager UI: Remind shown only on rows whose home is in the allowed set.
7. Owner setting: switch hidden with no manager; toggling calls the action; failure shows an error.
8. M7 badge equals inbox unread; M8 exact copy + guard catches "ticket"; M5 alert cleared after undo; M6 undo toast uses the
   default duration and repair update toasts `Repair updated.`; M2 no Next on last step; T1 tenant card has no
   Cost/Vendor/Assignment.
9. Full suite + plain-language guard green.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results, and the M6 root cause in one
line. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. Notifications switch unchanged. No real person may be notified.
