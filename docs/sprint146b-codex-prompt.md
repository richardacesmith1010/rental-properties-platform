# Sprint 146b — "Tenant pays outside Domus" lease setting

**Severity: L3** (rent late-status / late-fee logic + overdue metrics). Split from Sprint 146 (whose design passed Domus ChatGPT review as rev 3; the notification half shipped as 146a). This packet carries forward the reviewed design for the lease flag, scoped with Codex's own Sprint 146 inventory. Domus ChatGPT review of 146b: APPROVE WITH CHANGES — all 4 required changes + 3 optional suggestions adopted (rev 2).

## 1. Objective
An owner can mark a lease **"Tenant pays outside Domus."** For such a lease, Domus never marks rent late, never creates late fees, and never counts it as overdue/late in overdue-specific metrics. Rent charges are still generated each month, and ordinary rent accounting (balances, receivables, rent roll, ledger, P&L, collection) is unchanged — the owner marks months paid by hand.

## 2. Context
- Branch `main`, HEAD `d5f47dd`. Real case: tenant Angel Hernandez (lease `b9c47e88-3cc9-4ed5-87d9-c8bc5f3d20c8`) pays the owner via Fidelity, always on time; Domus marked him late and added late fees (corrected by hand 2026-10-03). Next due date Nov 1, grace 5 days.
- **Column already exists in production** (applied + verified by Claude 2026-10-03): `public.leases.collects_outside_domus boolean NOT NULL DEFAULT false`. Code may assume it; NO missing-column fallbacks. Still add the matching idempotent migration file `supabase/migrations/20261003_sprint146_pays_outside_domus.sql` (`alter table public.leases add column if not exists collects_outside_domus boolean not null default false;` + `comment on column ...`) so the repo matches.
- Notifications are globally OFF since Sprint 146a; do not touch notification code.
- **Fresh global inventory FIRST (required):** before editing, search `apps/web` AND Supabase SQL/RPCs/triggers (read-only MCP + `supabase/migrations/`) for `late`, `overdue`, `late_fee`, grace-date comparisons, `status === "late"`, `.eq("status", "late")`, and `daysPastDue`. Any additional reader or writer affecting late status, late fees, or overdue-only metrics must be handled or listed in the report before editing. The list below is the starting point, not the limit.
- Codex's Sprint 146 inventory (2026-10-03), starting point:
  - **Only late writer:** `applyLateFeesToOverdueCharges` in `apps/web/lib/charge-generation.ts` (~:182-356): sets `status: "late"` (~:246) and builds/inserts `late_fee` rows (~:266-287).
  - **Overdue readers to change:** `lib/delinquency.ts` escalation candidates; `lib/reports-delinquency.ts` aging report ONLY; `lib/dashboard.ts` lateRentCents / lateAccountCount / overdueRentCents / displayed late status; `lib/manager-dashboard.ts` late KPIs / displayed late status; `lib/analytics.ts` lateCents ONLY; `lib/action-items.ts` overdue actions; `lib/tenant-payments.ts` historical late display; `lib/rent-urgency.ts` date-based overdue classification; tenant overview component(s) that render overdue state.
  - **Must stay unchanged (include flagged leases):** `getReceivablesReport` (reports-delinquency.ts), rent-roll balances (`lib/reports-rent-roll.ts`), dashboard outstandingCents / outstandingAccountCount, property-detail balances, AI outstanding balances, ledger, P&L, autopay eligibility, payment/mark-paid flows, analytics dueCents / collectedCents / collection rate.
  - Lease create/update: `app/actions/lease-mutations.ts` (+ its zod schema, e.g. `lib/validations*.ts`), `components/dashboard/forms/lease-form.tsx`, lease mapping in `lib/portfolio.ts`, lease list/detail display (e.g. `components/dashboard/leases-section.tsx`).
- Codex has a read-only `supabase` MCP; no browser.

## 3. In scope
1. **Central predicate:** one shared module exporting `isCollectedOutsideDomus(lease)`; mandatory for every in-memory decision. Queries that must exclude flagged leases BEFORE aggregation may filter on `collects_outside_domus` directly (list each such query).
2. **Late writers:** the flag must gate BOTH mutations independently — a flagged lease must never receive `status = "late"` and must never get a newly inserted `late_fee`, even if one branch can run without the other. Unflagged behavior is behaviorally unchanged. Historical `late_fee` rows are NOT deleted or hidden from ordinary ledger/accounting history (only overdue-only views exclude them).
3. **Overdue readers:** exclude flagged-lease charges from the overdue/late metrics and displays listed above. Already-late historical charges on a flagged lease are excluded at read time and NOT mutated. A flagged lease's past-due unpaid rent shows as plain "Unpaid" / "Due" (no "late"/"overdue" badge) wherever a status label is shown.
4. **Unchanged accounting:** everything in the "Must stay unchanged" list still includes flagged leases.
5. **Lease form:** checkbox **"Tenant pays outside Domus"**, helper text **"Domus won't mark rent late or add late fees. You can still mark rent paid."** Persisted through create AND update with the existing zod validation and auth/role checks unchanged (AGENTS.md §3). Default unchecked. **Checkbox normalization:** an unchecked HTML checkbox is absent from form data — explicitly normalize so an update submission reliably persists `false` (never silently keeps a previous `true`).
6. **Badge:** small neutral **"Pays outside Domus"** badge on the owner/manager lease row/details where the lease is shown (at least the lease list/detail the form belongs to). v2 tokens only.
7. Plain-language rules (CLAUDE.md §18).

## 4. Out of scope
- Notifications (146a), payments/Stripe/autopay logic, auth.
- Setting the flag on any lease (Claude does it after deploy with owner approval).
- Bulk "mark paid" or bank-import features.
- No DB apply, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
The shared predicate module (new); `supabase/migrations/20261003_sprint146_pays_outside_domus.sql` (new); `apps/web/lib/charge-generation.ts`; the overdue readers listed in §2 (`lib/delinquency.ts`, `lib/reports-delinquency.ts`, `lib/dashboard.ts`, `lib/manager-dashboard.ts`, `lib/analytics.ts`, `lib/action-items.ts`, `lib/tenant-payments.ts`, `lib/rent-urgency.ts`, tenant overview component); `lib/portfolio.ts`; `app/actions/lease-mutations.ts` + its zod schema file; `components/dashboard/forms/lease-form.tsx`; the lease list/detail component for the badge; and tests. If the real list exceeds 20 non-test files, STOP after re-verifying the inventory and report.

## 6. Implementation requirements
- Tests (Vitest): flagged lease past grace → no `late` update and no late fee; running the late job repeatedly on a flagged lease creates zero late fees (idempotency); unflagged → unchanged; **per-reader regression tests:** for EACH changed overdue reader, a targeted assertion that a flagged (incl. historical already-late) charge disappears from that reader's late/overdue result while still appearing in the corresponding ordinary accounting data where applicable, and is left unmutated; receivables / rent-roll balances / outstanding totals / analytics dueCents + collectedCents identical with and without the flag; lease create and update persist the checkbox, including update true → false and false → true; predicate unit tests; status label for a flagged past-due unpaid charge is not "late"/"overdue".
- No auth/role changes. No PII in logs. Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run gate:web
rg -n "collects_outside_domus|isCollectedOutsideDomus" apps/web supabase/migrations
git diff --stat
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- Flagged leases: no late status / late fee; excluded from overdue-specific metrics and labels only.
- Every "must stay unchanged" metric proven unchanged by tests.
- Lease form persists the setting; badge shows for flagged leases.
- Migration file present and matches production; no missing-column fallbacks.
- ≤ 20 non-test files changed.

## 9. Report format
Conform to `docs/codex-report-schema.json`. `self_verification.findings`: the fresh global inventory (including SQL/RPC/trigger results), searched late/overdue paths intentionally left unchanged and why, the late-writer list, each overdue reader changed (file + what), each query filtered DB-side, and the list of metrics confirmed unchanged. `copy_changes`: checkbox, helper text, badge, any status label changes.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
