# Sprint 146 — Notifications master switch (default OFF) + "Tenant pays outside Domus" lease setting

**Severity: L3** (schema change + rent-charge generation logic). Rev 3 — Domus ChatGPT review: rev 1 REJECTED, rev 2 APPROVE WITH CHANGES (intent required with no default; SMS in criteria; DB-side filtering rule; deploy blocked until column verified) — all adopted. Rev 2 changes: (1) rollout order changed — the additive column is applied BEFORE code deploys, so no pre-migration code path exists; (2) notifications gated by explicit delivery intent (automatic vs owner-initiated), not a blanket chokepoint return; (3) inventory covers email/push send paths and helper callers, not just table writes; (4) inventory and gate every late-status and late-fee writer; (5) tests added for intent gating, all late writers, historical late charges, and receivables unchanged.

## 1. Objective
1. **Pre-launch quiet mode:** until the owner explicitly turns it on, Domus sends **no automatic notifications** — no in-app notification rows and no notification emails — to anyone. Controlled by one server env var, default OFF.
2. **Pays outside Domus:** an owner can mark a lease "Tenant pays outside Domus." For such a lease, Domus never marks rent late, never creates late fees, and never counts it as overdue — the owner records payments by hand when they want a record.

## 2. Context
- Branch `main`, HEAD `23f7505`. Owner's direction (2026-10-03): "until I tell you that people are using the app, I don't see the value in having it generate any notifications to people. Let's focus on perfecting the app."
- Real case: tenant Angel Hernandez (lease `b9c47e88-3cc9-4ed5-87d9-c8bc5f3d20c8`) pays the owner outside Domus every month, on time; Domus marked him late, added late fees, and created 15 overdue/escalation/reminder notices. Data was corrected by hand on 2026-10-03; the next due date (Nov 1) will repeat the problem without this sprint.
- **Notification chokepoint:** `apps/web/lib/notifications.ts:177` `createNotificationWithDelivery(...)` creates the in-app row and sends the email (Resend at ~:562). Wrappers: `notifyOwnerMembersForProperty` (~:328), `notifyOwnerOfStripeIssue` (~:403), `notifyAccountMembers` (~:431), `notifyOwnerMembersOfAcceptedTenantInvite` (~:498). Other direct inserts into `notifications` exist in `lib/delinquency.ts` (~:63 area), `lib/lease-lifecycle.ts` (~:163 area), `lib/dashboard.ts` (~:343) — inventory every write path (`rg -n 'from\("notifications"\)'`) and classify read vs write.
- **Explicit, owner-initiated emails are NOT notifications** and must keep working: tenant invites (`lib/invite-email.ts`), LLC invites (`lib/llc-invitation-email.ts`), manager invoices (`lib/invoice-email.ts`), and internal ops alerts (`lib/platform-alerts.ts`). Do not gate these.
- **Late logic:** `apps/web/lib/charge-generation.ts` — marks charges `late` (~:246) and creates `late_fee` charges (~:257-282) using `leases.grace_period_days` / `late_fee_cents`; lease selects at ~:223 and ~:388. Cron entry: `app/api/cron/generate-charges/route.ts` (daily). Overdue/delinquency logic also in `lib/delinquency.ts` and dashboard/report aggregations (inventory with `rg -n "\"late\"|daysPastDue|overdue" lib components app`).
- Lease editing UI: `components/dashboard/forms/lease-form.tsx` and the lease create/update server actions in `app/actions/` (find them). `leases` columns today: id, unit_id, tenant_profile_id, start_date, end_date, monthly_rent_cents, due_day_of_month, deposit_cents, active, created_at, grace_period_days, late_fee_cents, lease_status, renewed_from_lease_id, termination_reason, terminated_at.
- Codex has a read-only `supabase` MCP for schema/data checks. Codex cannot run a browser.

## 3. In scope
**A. Notifications master switch**
1. New helper `lib/notifications-switch.ts`: `export function notificationsEnabled(): boolean` → `process.env.DOMUS_NOTIFICATIONS_ENABLED === "true"` (anything else, including unset, = OFF).
2. **Delivery intent:** add a REQUIRED parameter (no default) to `createNotificationWithDelivery` and every `notify*` wrapper: `intent: "automatic" | "owner_initiated"`, so TypeScript forces every caller to classify itself. When the switch is OFF and intent is `"automatic"`, return immediately — no DB insert, no delivery rows, no email; log the type only (no recipient PII). `"owner_initiated"` sends are never gated. Inventory every caller of `createNotificationWithDelivery` and each `notify*` helper and set intent explicitly at each call site that is a direct result of an owner/manager clicking a send action (e.g., "Send Announcement", messages); everything else stays automatic.
3. **Full send inventory:** list (a) every write to the `notifications` table, (b) every email send (all `fetch("https://api.resend.com/emails"...)` and any other mail helper), (c) any push/SMS send, and (d) every caller of the notification helpers. Each gets GATED (automatic) or NOT GATED (owner-initiated / auth / ops) in the report. Every automatic path outside the helper must also check the switch. Cron operations whose only purpose is notifying (rent-due reminders, overdue/delinquency escalations, lease-expiry warnings, Stripe-issue notices) must skip their sends when OFF and report e.g. "Notifications off: 0 sent" in their result string — their non-notification work (charge generation, status updates, Stripe verification) must still run.
4. Reading, marking read, and the notification UI keep working (they just show nothing new).
5. Do NOT gate: tenant/LLC invite emails, manager invoice emails, platform ops alerts, auth emails (Supabase), and any email the owner explicitly clicks to send. List every send path in the report as GATED or NOT GATED with one-line reasoning.

**B. "Tenant pays outside Domus"**
1. Migration file `supabase/migrations/20261003_sprint146_pays_outside_domus.sql`: `alter table public.leases add column if not exists collects_outside_domus boolean not null default false;` plus a comment. Idempotent, additive, no data changes. **Rollout order: Claude applies this migration to production BEFORE this code deploys** (an added defaulted column is invisible to the current code). Therefore the new code may assume the column exists; do NOT add missing-column fallbacks for it. Do not apply it yourself.
2. **Central predicate:** add `isCollectedOutsideDomus(lease)` (or equivalent) in one shared module; it is mandatory for every in-memory/business-logic decision below — no copy-pasted checks. SQL/Supabase queries that must exclude flagged leases before aggregation may filter directly on `collects_outside_domus` (e.g., `.eq("leases.collects_outside_domus", false)`) instead of post-query filtering; list each such query.
3. **Every late writer:** inventory EVERY code path that sets a charge's status to `late` or creates a `late_fee` charge (search status updates and inserts across `lib/`, `app/`, crons, server actions — e.g., `rg -n "status: \"late\"|'late'|late_fee" apps/web/lib apps/web/app --glob '!**/__tests__/**'`). Gate each with the predicate so flagged leases never become late and never get late fees. Monthly rent charges are still generated normally.
4. **Overdue readers:** charges on flagged leases must not count as overdue/late in overdue-specific metrics (delinquency follow-ups, dashboard overdue counts/totals, "late" badges, aging/overdue report figures). Ordinary rent accounting is UNCHANGED: unpaid balance, receivables, expected rent, ledger, P&L still include these charges. Already-late historical charges on a flagged lease are excluded from overdue metrics at read time but are NOT mutated.
5. Lease form: add a checkbox **"Tenant pays outside Domus"** with helper text: **"Domus won't mark rent late or add late fees. You can still mark rent paid."** Wire it through lease create and update actions with existing validation (zod) and auth/role checks unchanged. Show a small neutral badge **"Pays outside Domus"** next to the lease/tenant where lease details are shown on owner/manager views (one place minimum: the lease row/details component the form belongs to).
6. Plain-language rules (CLAUDE.md §18) for all new text.

## 4. Out of scope
- Applying the migration (Claude applies it BEFORE deploying this code); setting the flag on any lease (Claude does it after deploy, with owner approval).
- Retroactively changing existing charges or notifications.
- Removing or redesigning the notification system, preferences UI, or email templates.
- Payment flows, Stripe, autopay, auth. No env/secret changes (Claude sets env vars), no deploy, commit, or push.

## 5. Exact files expected to change
`apps/web/lib/notifications-switch.ts` (new), `apps/web/lib/notifications.ts`, every other notification write/send path found by the inventory (list them), the shared predicate module (new), `apps/web/lib/charge-generation.ts`, `apps/web/lib/delinquency.ts`, every late writer and overdue reader found by the inventory (list them), the callers whose notification intent changes to `owner_initiated` (list them), `apps/web/components/dashboard/forms/lease-form.tsx`, the lease create/update action file(s) and their zod schema file, the one lease display component that gets the badge, `supabase/migrations/20261003_sprint146_pays_outside_domus.sql` (new), and tests. If the inventory finds more than ~25 files to change, STOP after the inventory and report instead of implementing.

## 6. Implementation requirements
- Tests (Vitest): switch OFF (unset and `"false"`) + automatic intent → zero DB writes and zero fetch calls; switch OFF + `owner_initiated` → sends normally; switch `"true"` → current behavior unchanged; one cron notification operation reports 0 sent when OFF while its non-notification work still runs; EVERY late writer from the inventory: flagged lease past grace → no `late` update and no late fee, unflagged → unchanged; a historical already-late charge on a flagged lease is excluded from overdue/aging metrics and left unmutated; receivables/unpaid-balance totals unchanged by the flag; lease create/update persists the checkbox.
- No changes to auth/role checks; every server action keeps its existing checks (AGENTS.md §3).
- Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run gate:web
rg -n 'from\("notifications"\)' apps/web/lib apps/web/app --glob '!**/__tests__/**'
rg -n "collects_outside_domus" apps/web supabase/migrations
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- With `DOMUS_NOTIFICATIONS_ENABLED` unset, no AUTOMATIC path inserts into `notifications` or sends a notification email, push, SMS, or any other notification delivery; owner-initiated sends still work (proven by tests + the 4-part inventory table).
- Owner-initiated invite/invoice emails and ops alerts untouched.
- Flagged leases: no late status or late fee from ANY writer in the inventory; excluded from overdue-specific metrics only; receivables/ledger/P&L unchanged; unflagged behavior unchanged (existing tests pass).
- Migration file present and idempotent; not applied by Codex; no missing-column fallbacks added for the new column.
- No files outside §5 (as reported) changed.

## 9. Report format
Conform to `docs/codex-report-schema.json`. In `self_verification.findings`: the 4-part GATED/NOT GATED send inventory, the call sites set to `owner_initiated`, the list of late writers gated, and the list of overdue readers changed (plus confirmation receivable metrics were left alone). `copy_changes`: the checkbox label, helper text, badge text, cron result strings.
Include one release note line: "Deploy blocked until Claude verifies `leases.collects_outside_domus` exists in production."
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
