# Sprint 237b — Manager rent reminders (owner-approved) + manager walk fixes (L3: permission + schema) — rev 3 (rev 1 REJECT → rev 2 APPROVE WITH CHANGES: 3 REQUIRED + 4 OPTIONAL adopted)

## 1. Objective
1. Let a manager send rent reminders for homes they manage, **only when the owner turned it on** ("Let my manager send rent
   reminders", off by default). Delivery still goes through the notifications switch, so nothing reaches real people
   until launch (owner rule; test mode = allowlisted test accounts only).
2. Fix the small manager-walk findings M7, M8, M5, M6, M2, T1 (`docs/manager-walk-plan-2026-10-16.md`).

## 2. Context
- HEAD `35784b8` (main). Runs after 237a ships (no shared files except tests are expected; see §5).
- `sendBatchPaymentReminder` — `app/actions/notifications.ts:143-319`: `requireAuth("owner")` (l.147); rate limit
  `sendBatchPaymentReminder:<userId>` 10/min (l.148); `ensureCapabilityEnabled("notificationsEnabled")` (l.152); scopes
  charges with `getAdministeredPropertyIds(user.id)` (l.209) — this already includes active `property_managers` homes
  (`lib/property-access.ts:84-102`); sends `rent_due_reminder` per charge through `createNotificationWithDelivery`
  (`lib/notifications.ts:170`), which respects `lib/notifications-switch.ts` (off / test / on); audit
  `send_batch_payment_reminder` (l.294-307); revalidates `/owner` and `/tenant` only (l.309-310).
- Owner page passes the action (`app/owner/page.tsx:264`); `render-section-cases.tsx:69-73` forwards it;
  `charges-implementation.tsx` uses it for the toolbar (l.93, selection state l.85, batch send l.189-194), per-row Remind
  (l.414-418, `handleSingleReminder` l.207). `app/manager/page.tsx:273-324` never passes it.
- No manager permission flag exists in any migration. Domus-owner invites write `property_managers(property_id,
  manager_profile_id, active, assigned_at)`; homes belong to `properties.owner_account_id` → `ownership_accounts`.
- **Live grants (checked 2026-10-15):** `anon` and `authenticated` hold **table-level** INSERT/UPDATE on
  `public.ownership_accounts` (Supabase default), so any new column is writable by whoever passes RLS. UPDATE policy
  `ownership_accounts_update_member_or_creator` = `created_by_profile_id = auth.uid() OR is_owner_member_of_account(id)` —
  a **manager who created a client account passes it**. Existing trigger: `ownership_accounts_guard_client`.
  `managed_client boolean not null default false` (Sprint 205). Therefore the new column needs a DB-level write guard;
  a missing column grant is **not** enough.
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
- **T1** `components/dashboard/maintenance-section.tsx:250-272` always shows Cost / Vendor / Assignment (`meta` l.63);
  tenant view passes `viewerRole="tenant"` (`app/tenant/page.tsx:419-429`).

## 3. In scope
Manager reminders (schema + action + owner setting UI + manager UI), M7, M8, M5, M6, M2, T1.

## 4. Out of scope
Turning notifications on; reminder copy/body; tenant-side changes beyond T1; M1/M3/M11 (Sprint 237c); money logic;
tightening the existing table-level grants on `ownership_accounts` for other columns (tracked separately — do not change
them); removing cost/vendor fields from the tenant **data payload** (T1 is presentation cleanup: the tenant sees their own
repair; payload trimming is a later privacy item).

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
14. `apps/web/components/ui/sonner-provider.tsx` **only if** the M6 root cause is there
15. Tests for each (name them in the report) + `supabase/tests/sprint237b_manager_reminders.sql` (new, rolled back).
16. **M8 only:** other files with user-facing hits of the newly banned words (see §6.6). Every such file must be listed in
    the report with the line changed. Copy-only edits; no logic changes in those files.

## 6. Implementation requirements
1. **Schema.**
   - `ownership_accounts.managers_can_send_reminders boolean not null default false`.
   - Check constraint `not (managed_client and managers_can_send_reminders)` (client accounts can never have it on).
   - **Write guard:** a `BEFORE INSERT OR UPDATE` trigger (security invoker) on `ownership_accounts` that raises
     `managers_can_send_reminders is changed only by set_managers_can_send_reminders` when the value differs from OLD
     (or is true on INSERT), unless **both** hold: the transaction-local setting `domus.allow_manager_reminder_write = 'on'`
     (set only inside the RPC with `set_config(..., true)`) **and** `current_user` is the RPC's owner role (`postgres`; the
     trigger is security invoker, so inside the SECURITY DEFINER RPC `current_user` is the owner, while a client is
     `authenticated`/`anon`). The marker alone never allows the write. Also: when `managed_client` becomes true, the trigger forces
     `managers_can_send_reminders = false` (so a later client conversion cannot leave it on). Do **not** change existing
     grants or the existing `ownership_accounts_guard_client` trigger.
   - RPC `set_managers_can_send_reminders(p_account_id uuid, p_actor_id uuid, p_value boolean) returns text`
     (`security definer`, `search_path = ''`, revoke from public/anon/authenticated, grant service_role). It returns
     `ok` / `unchanged` / `not_allowed` / `client_account` / `not_found`. It checks `p_actor_id` is an active **owner**
     member of the account (same logic as `public.is_owner_member_of_account`, but for `p_actor_id`, not `auth.uid()`);
     rejects `managed_client = true` accounts; if the value is unchanged returns `unchanged` with **no** audit row;
     otherwise sets the local setting, updates, and writes `audit_logs` (`set_manager_reminders`, before/after).
2. **Owner setting UI.** In owner Settings, per ownership account the owner belongs to (not client accounts): switch
   `Let my manager send rent reminders`, helper `Your manager can remind tenants about rent.` Shown only when the account
   has at least one active manager on its homes. Server action: `requireAuth("owner")`, rate limit, passes the **session
   user id** as `p_actor_id` (never client input), maps codes to copy: `not_allowed` → `Only the owner can change this.`,
   `client_account`/`not_found` → `We could not change this setting.`; any Supabase error → the same, never success.
3. **Action — authority model.** `sendBatchPaymentReminder` allows `requireAuth("owner", "manager")`. `actor_role` and actor
   id are derived from the authenticated session/profile on the server, never from the request.
   - **Owner path** (session role owner): behavior unchanged, including for homes the owner also manages.
   - **Manager path** (session role manager): **preflight before any side effect.** Dedupe the requested ids. Load every
     requested charge with its `property_id` and that home's account (`managers_can_send_reminders`, `managed_client`).
     Reject the **whole** request with `Your owner has not turned on reminders for this home.` and send nothing if: any
     requested id is not found / not readable, any home is not in `getAdministeredPropertyIds(user.id)`, any account has
     the flag off, or any account is `managed_client`. Never authorize by filtering unauthorized ids out. Only after the
     preflight passes run the existing send loop.
   - Empty id list → validation error, zero notification and audit side effects.
   - Preflight is a snapshot: the flag **and** the manager's access are read at request time. Turning the flag off or
     removing the manager blocks later requests; a request already past preflight may finish.
   - Delivery: every reminder still goes through `createNotificationWithDelivery`; the switch and the outside-Domus-tenant
     rule are unchanged and authoritative.
   - Audit: success metadata includes `actor_role` (server-derived). If Domus already audits denied sensitive actions with
     an existing helper, record the manager denial the same way; otherwise don't invent one.
   - Also revalidate `/manager`.
4. **Manager UI.** `app/manager/page.tsx` passes the action and the set of property ids where reminders are allowed. Per-row
   Remind shows only on rows whose home is in that set. **Bulk toolbar:** the Remind toolbar action is enabled only when
   every selected charge is on an allowed home; if the selection mixes allowed and not-allowed homes, the toolbar Remind is
   disabled with `Some homes can't get reminders yet.` (the server preflight still rejects mixed batches). Copy otherwise
   unchanged.
5. **M7.** The sidebar Messages badge shows the same unread number as the inbox (one shared source); 0 → no badge.
6. **M8.** Create-thread copy: heading `Start a conversation`; options `General`, `Repair`, `Lease`, `Rent`, `Papers`;
   placeholder `Subject`; button `Start conversation`; success `Conversation started.`; select title
   `Pick what this is about.` Option **values** unchanged. Add `ticket`, `tickets`, `thread`, `threads`, `entity`,
   `packet`, `packets` to the banned list. Run the guard; for each user-facing hit either change the copy (files allowed by
   §5.16) or add a justified exception (≤ 25 new exceptions total). Code identifiers, routes and DB values are not
   user-facing and are not touched.
7. **M5.** After a successful undo, the inline "Manual payment recorded." alert is cleared (the undo success toast is the
   only message).
8. **M6.** Reproduce why the undo toast stayed for minutes (e.g. a toast created while the dialog unmounts, a stuck
   hover/focus pause, `Infinity` duration, or a duplicate Toaster), fix the cause, and state it in one line. The undo
   toast must auto-dismiss like others. Repair status update shows a toast `Repair updated.`
9. **M2.** Hide Next on the final step. The success banner text wraps instead of clipping (no fixed height / `truncate` /
   `overflow-hidden` on its text; dialog content scrolls if needed).
10. **T1.** Tenant view (`viewerRole="tenant"`) hides Cost, Vendor and Assignment on repair cards; owner and manager views
    still show them.
11. Plain language, lines ≤ 140, files ≤ 500, every Supabase error checked. The user should never need to read
    instructions to complete this flow.

## 7. Validation commands
```
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web` or apply the migration. Claude applies it and runs the SQL fixture live (rolled back).
Manual (Claude, after deploy): M2 banner at 375 px and 1440 px, light and dark; M6 toast timing in the real app.

## 8. Acceptance criteria
1. SQL fixture (rolled back): owner member sets the flag → `ok` + one audit row; same value again → `unchanged`, no new audit
   row; a manager, a tenant, an unrelated owner, an unknown actor → `not_allowed`; client account → `client_account`;
   `authenticated` cannot execute the RPC; as `authenticated` (JWT of an owner member, and of a manager who created a
   client account) a direct `update ownership_accounts set managers_can_send_reminders = true` raises; direct insert with
   true raises; setting `managed_client = true` on an account with the flag on leaves the flag false; the check
   constraint rejects both true — tested **independently of the trigger** (as the table owner inside the fixture:
   `alter table ... disable trigger <new trigger>` within the rolled-back transaction, or a direct insert that the trigger
   would allow), so the constraint's existence is proven on its own. Attacker: as `authenticated`, `select
   set_config('domus.allow_manager_reminder_write','on',true)` then a direct update → still raises. Assert the RPC's
   owner is `postgres` and it is `prosecdef` (so a later ownership change can't silently weaken the guard).
2. Action, manager, flag on, managed home → reminders created through `createNotificationWithDelivery` (mock) for exactly
   those charges; audit `actor_role = "manager"`.
3. Manager, flag off → exact rejection copy, zero notification calls.
4. Empty id list → validation error, zero notification/audit calls. Manager, flag on: one charge on a home they don't manage → whole request rejected, zero calls; a random unknown charge
   UUID → rejected, zero calls; duplicate ids → each charge reminded once; one charge on a `managed_client` account →
   rejected, zero calls.
5. Owner behavior unchanged (existing tests pass); an owner who also manages a home → owner path; tenant → rejected by
   `requireAuth`; a forged role/actor field in the input is ignored.
6. Delivery safety through the manager path (mock the delivery adapter; no real send): switch `off` → zero external
   delivery calls; switch `test` + non-allowlisted recipient → zero external calls; switch `test` + allowlisted recipient →
   existing permitted behavior; outside-Domus tenant → no reminder.
7. Manager UI: per-row Remind only on allowed homes; toolbar Remind disabled with the exact copy for a mixed selection and
   enabled when all selected are allowed.
8. Owner setting: switch hidden with no manager and on client accounts; toggling calls the action with no actor input;
   each error code shows its copy; a Supabase error never shows success.
9. M7 badge equals inbox unread (both from the shared source; 0 → no badge). M8 exact copy + guard flags "ticket",
   "thread", "packet". M5 alert cleared after undo. M6: a test that reproduces the root cause (fails on the old code,
   passes on the new) + repair update toasts `Repair updated.`. M2: no Next on the last step; banner text has no
   clipping classes. T1: tenant card has no Cost/Vendor/Assignment; owner and manager cards still do.
10. Full suite + plain-language guard green.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results, the M6 root cause in one line
**with its regression test name**, and the M8 file/exception list. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report
compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. Notifications switch unchanged. No real person may be notified. No change to
existing grants, policies or triggers on `ownership_accounts` beyond adding the new column, constraint and trigger.
