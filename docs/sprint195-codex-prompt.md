# Sprint 195 — Manager/owner Messages, Home count, bank card and names (L2) · Category 3 (Manager) / 1 (Owner)

## 1. Objective
Fix the misleading items from the manager dry run (`docs/manager-dry-run-2026-10-07.md`, findings 1–5 and 8). All fixes are display/copy only. No DB or schema changes, and no new queries unless §3.6 allows one.

## 2. Context
- Branch `main`, HEAD `608bba9` or a later docs-only commit. Next 15.5, React 19, Vitest.
- `components/dashboard/inbox-section.tsx` (477 lines) is used by owner/manager (`components/dashboard/sections/render-section-cases.tsx` ~169, no `onStartTenantConversation`) and tenant (`app/tenant/page.tsx` ~450, with `onStartTenantConversation`).
  - Line ~46: default tab = `"threads"` only for tenants; otherwise `"timeline"`. The timeline lists **notifications**. Notifications are OFF until launch, so owner/manager timelines are empty and real conversations sit unseen under **Threads**.
  - Line ~233–236: empty timeline says `No messages yet` / `Your landlord can message you here.` to every role.
  - Lines ~386 and ~404 render `thread.subject` raw. Stored subjects include `TENANT_CONVERSATION_SUBJECT = "Messages with your landlord"` (`lib/inbox/action-helpers.ts:25`) and `` `Manual payment review - ${locationLabel}` `` (`app/actions/inbox-manual-payment.ts`). **Stored subjects must not change**; the manual-payment one is used to find its thread.
- Home: `components/dashboard/dashboard-home-loader.ts:182` sets `newMessageCount: props.inboxThreads?.length ?? 0` (all threads, not unread). `owner-daily-ops-home.tsx:226` renders `{n} new message(s)`, which contradicts Messages' "0 unread".
- `components/dashboard/owner-bank-card.tsx:12–15`: the manager `needs_info` title is `` `${accountName} needs one more thing` `` (the owner account's name), but the body is about the manager's own fees.
- Repairs: `components/dashboard/maintenance-section.tsx:~227–229` shows `ticket.tenantEmail` (e.g. `richard.ace.smith+drytenant@gmail.com`) even when the tenant's name is known elsewhere ("Dry Run Tenant").
- `lib/payment-method-label.ts` (Sprint 194) has no `us_bank_account` entry, so autopay shows `Us_bank_account`.

## 3. In scope (exact copy)
1. **Messages default tab.** Add an optional prop `viewerRole?: "owner" | "manager" | "tenant"` to `InboxSection` (owner/manager call site passes the role it already knows; tenant call site passes `"tenant"`). Default tab: `"threads"` when the viewer is a tenant (today's rule), **or** when there is at least one thread **and** no unread notification; otherwise `"timeline"`.
2. **Empty timeline copy** for owner/manager: title `No updates yet`, description `Rent, repair, and lease updates show up here.` Tenant keeps today's text.
3. **Thread titles (display only).** New helper `lib/inbox/thread-title.ts` → `threadDisplayTitle(subject: string, viewerRole: "owner" | "manager" | "tenant"): string`:
   - subject === `TENANT_CONVERSATION_SUBJECT` and viewer is owner/manager → `Messages with your tenant`;
   - subject starts with `Manual payment review - ` → owner/manager: `Tenant says rent is paid - ` + the rest; tenant: `Rent you said is paid - ` + the rest;
   - anything else → unchanged.
   Use it at both render sites (~386, ~404). Never change stored subjects or the thread-lookup code.
4. **Home count.** Replace `{n} new message(s)` with `{n} conversation(s)` (`1 conversation`, `4 conversations`); keep the button's action. Keep `No open repairs. No new messages.` exactly when both counts are 0. Do not change `newMessageCount`'s source.
5. **Manager bank card.** For `role === "manager"` and `needs_info`, the title is `Your bank needs one more thing` (body and button unchanged). The owner title is unchanged.
6. **Names in Repairs.** Where the ticket's display data is built, add `tenantName` if the tenant's full name is already available in the data being loaded (same query or an already-loaded profile/tenant map; no new DB round trip). `maintenance-section.tsx` shows `tenantName` when present, else the email as today. If the name is not available without a new query, leave the UI unchanged and say so in the report.
7. **Autopay label.** `paymentMethodLabel`: add `us_bank_account` → `Bank account`.
8. **Tests.**
   - `inbox-section` tests: owner/manager with threads and no unread notifications → Threads tab active; owner with an unread notification → Timeline; tenant unchanged; owner empty timeline shows the new copy; tenant keeps the old copy; both thread title mappings render for owner and tenant views.
   - `lib/__tests__/thread-title.test.ts`: all branches.
   - `owner-daily-ops-home` test: `1 conversation` / `4 conversations`; the zero-state text is unchanged.
   - `owner-bank-card.test.tsx`: manager `needs_info` title; owner title unchanged.
   - `payment-method-label.test.ts`: `us_bank_account` → `Bank account`.
   - Repairs: a ticket with `tenantName` shows the name, without it shows the email (only if §3.6 was implemented).

## 4. Out of scope
- DB/schema, stored subjects, the notifications switch (OFF), the nav badge count, Activity log text (stored strings), Automations/Applications/Documents jargon (next sprint), manager reminders.
- Deploy, commit, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
`components/dashboard/inbox-section.tsx`, `components/dashboard/sections/render-section-cases.tsx`, `app/tenant/page.tsx` (one prop), `lib/inbox/thread-title.ts` (new), `components/dashboard/owner-daily-ops-home.tsx`, `components/dashboard/owner-bank-card.tsx`, `components/dashboard/maintenance-section.tsx` + the one loader file that builds ticket display data (name it), `lib/payment-method-label.ts`, and the tests in §3.8 (all paths under `apps/web/`). If `render-section-cases.tsx` lacks the role, pass it from its existing props; list any extra file needed.

## 6. Implementation requirements
- Exact copy; sentences ≤ 12 words; no banned words (plain-language guard must pass).
- Lines ≤ 140 characters; files ≤ 500 lines (`inbox-section.tsx` is at 477; if it would pass 500, move the tab/empty-state helpers into a sibling file).
- No new dependencies, no `eslint-disable`.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- Targeted tests for every changed component/lib, plus every test importing a changed file (`grep -rlE "inbox-section|render-section-cases|owner-daily-ops-home|owner-bank-card|maintenance-section|payment-method-label|thread-title" apps/web --include=*.test.ts --include=*.test.tsx`), plus `lib/__tests__/plain-language.test.ts`.

## 8. Acceptance criteria (binary)
1. Owner/manager Messages opens on Threads when conversations exist and nothing is unread; owner/manager empty timeline shows the new copy; tenant behavior unchanged.
2. Thread titles render per §3.3 for each role; stored subjects and lookups unchanged.
3. Home shows `N conversation(s)`; manager bank title per §3.5; autopay shows `Bank account`.
4. Repairs shows the tenant's name when it is available without a new query (or the report says why not).
5. All §3.8 tests are real assertions; lint, typecheck, targeted tests and the plain-language guard pass; only §5 files changed.

## 8b. Post-deploy verification (Claude only)
Smoke manager and smoke owner: Messages opens on Threads showing `Tenant says rent is paid - Smoke Test Property • Unit S` and `Messages with your tenant`; Home shows `N conversations`; manager bank card title; Repairs shows `Dry Run Tenant` if implemented. Smoke tenant Messages unchanged. Light/dark, 1280/375, 0 console errors. Smoke, Sentry, CI.

## 9. Report format
JSON per `docs/codex-report-schema.json`. List test names and whether §3.6 was implemented. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
