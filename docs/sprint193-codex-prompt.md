# Sprint 193 — (ChatGPT: REJECT ×3 → APPROVE on rev 4) Owner sees "Tenant says paid" on the Rent row; tenant reports persist (L3: schema + money surface) · Categories 1 (Owner) / 2 (Tenant)

## 1. Objective
Sprint 192 let a tenant tap **I paid this** when online pay is off. The owner only gets an in-app message under Messages → Threads, which is easy to miss, and the tenant's "Sent" state disappears on reload (they can report the same month again). Persist the report on the rent row and show it where the owner manages rent:
- Owner/manager Rent row: a badge **`Tenant says paid · {Mon D}`** next to the status, on unpaid rows only. The existing **Mark paid** button stays the one-tap way to close it.
- Tenant rent card: a month already reported shows `Sent {Mon D}. Your landlord will check and mark it paid.` instead of the button, after reload too.
- A repeat report of the same month returns success without posting a second owner message.

## 2. Context
- Branch `main`, HEAD `4857a1f` or a later docs-only commit. Next 15.5, React 19, Vitest.
- **Schema (Claude applies it before deploy; Codex must not touch the DB):** `supabase/migrations/20261007_sprint193_tenant_reported_paid.sql` adds `public.rent_charges.tenant_reported_paid_at timestamptz null` and recreates `public.owner_dashboard_payload(uuid[], date)` so each object in its `charges` array also has `tenant_reported_paid_at` (string ISO timestamp or `null`). Everything else in that RPC is unchanged. The file is already in the repo; do not edit it.
- Report action: `apps/web/app/actions/inbox-manual-payment.ts` → `requestManualPaymentConfirmation` (tenant role, rate limit, open-charge + lease-ownership checks, posts the owner thread message, notifications gated OFF). Today it selects `id, lease_id, due_date, amount_cents, status` from `rent_charges`.
- Tenant data: `apps/web/lib/tenant-payments.ts` (`TenantCharge` interface line 6; two `rent_charges` selects at lines ~54 and ~61; mapping near line 102). Tenant UI: `apps/web/components/dashboard/tenant-rent-card.tsx` (`ReportPaidRow`, added in Sprint 192).
- Owner data: RPC path `apps/web/lib/dashboard-rpc.ts` (payload `Charge` type ~line 43; row mapping ~lines 120–136) and the fallback `apps/web/lib/dashboard-legacy.ts` (display-charge selects with `notes` at lines ~162 and ~226; mapping ~lines 420–437). Charge type `apps/web/lib/dashboard.ts` (~line 49). Row UI `apps/web/components/dashboard/charge-row.tsx` (`ChargeRowData`; owner-only bits are guarded by `!isTenantView`). Row data passes through `components/dashboard/charges/*`; add the field wherever the type is mapped, without other changes.
- `components/__tests__/charge-row-snapshot.test.tsx` (Sprint 191) locks today's row HTML. Rows **without** a report must render byte-identically, so those snapshots must stay unchanged.
- Plain-language rules: `docs/plain-language.md`; a guard test enforces banned words.

## 3. In scope
1. **Action (`inbox-manual-payment.ts`) — claim-first, race-safe (ChatGPT review, round 1).**
   - **Check order (security):** load the charge (add `tenant_reported_paid_at` to its select) → load the lease → **ownership check** (`lease.tenant_profile_id === user.id`, else today's access error) → only then the closed-charge check (`paid`/`waived` → today's "This payment is already closed."). A tenant must never learn the status or report state of another tenant's charge. (Today the closed check runs before the ownership check; this reorder is intended.)
   - **Atomic claim (the idempotency boundary):** after those checks, before creating any thread or message, run one guarded update and read back the rows:
     `admin.from("rent_charges").update({ tenant_reported_paid_at: claimedAt }).eq("id", chargeId).is("tenant_reported_paid_at", null).is("deleted_at", null).in("status", ["pending", "late"]).select("id")`
     with `claimedAt = new Date().toISOString()`.
     - error → return `{ success: false, error: "Could not send. Please try again." }` (no message).
     - **0 rows** → the row count alone is ambiguous (ChatGPT review, round 3). Re-read the charge (`id, status, tenant_reported_paid_at, deleted_at`, same `id`) and classify, in this order:
       - re-read error → `{ success: false, error: "Could not send. Please try again." }`;
       - row missing or `deleted_at` set → `{ success: false, error: "Payment not found." }`;
       - `tenant_reported_paid_at` set → `{ success: true, message: "Already sent. Your landlord will check and mark it paid." }`;
       - status `paid` or `waived` → `{ success: false, error: "This payment is already closed." }`;
       - otherwise (still open, still null; should be impossible) → log via `sideEffectError` with the distinct step name `tenant_report_claim_contention` (so it is not confused with ordinary Supabase errors) and return `{ success: false, error: "Could not send. Please try again." }`.
       None of these branches creates a thread, message or notification, or revalidates. The ownership check before the claim stays, so no cross-tenant state can leak here.
     - **1 row** → this request won the claim: run today's flow (thread, message, notifications [still gated OFF], thread touch, revalidate) exactly as now.
   - **The claim is the durable report (ChatGPT review, round 2): never undo it.** Once the claim returns 1 row, the report is accepted for good; the owner sees it on the Rent row. The owner message is a secondary side effect. If `findOrCreateTenantThread` returns no thread or `insertInboxMessage` returns an error, log it with the repo's `sideEffectError` pattern, skip the remaining message steps, do **not** clear `tenant_reported_paid_at`, still `revalidatePath("/tenant")` and `revalidatePath("/owner")`, and return `{ success: true, message: "Sent. Your landlord will check and mark it paid." }`. There is no release/rollback mutation anywhere.
   - The claim result is the single source of truth for "already reported"; do not branch on the earlier read. Return strings for existing paths unchanged.
2. **Tenant.** `TenantCharge` gets `tenantReportedPaidAt: string | null`; both selects in `tenant-payments.ts` include the column; map it. In `ReportPaidRow`, if `charge.tenantReportedPaidAt` is set and there is no fresh form result, render `Sent {Mon D}. Your landlord will check and mark it paid.` (`{Mon D}` = the report date in **UTC**: the `YYYY-MM-DD` part of the ISO timestamp, formatted with the file's `monthDay`; the owner badge uses the same UTC rule) in `text-[var(--pos)]` instead of the button. A fresh success result keeps Sprint 192's text (`state.message` from the action, falling back to `Sent. Your landlord will check and mark it paid.`).
3. **Owner/manager.** Add optional `tenantReportedPaidAt?: string | null` to the dashboard charge type and `ChargeRowData`; map it in `dashboard-rpc.ts` (from `row.tenant_reported_paid_at ?? null`) and `dashboard-legacy.ts` (add the column to the two display-charge selects that include `notes`, then map). In `charge-row.tsx`, when `!isTenantView`, status is `pending` or `late`, and `tenantReportedPaidAt` is set, render a small badge next to the status pill: text `Tenant says paid · {Mon D}`, `title="Your tenant says they paid. Check, then tap Mark paid."`, styled with existing tokens (e.g. `border-[var(--accent-line)] text-[var(--accent)]`, same size/shape as the status pill). No badge for paid/waived rows, the tenant view, or rows without the field. Rows without the field render byte-identically to today.
4. **Tests.**
   - Action (`app/actions/__tests__/inbox.test.ts`): (a) first report → claim update called with `.is("tenant_reported_paid_at", null)` and `.in("status", ["pending","late"])` **before** any thread/message call (assert call order), then exactly one message insert, today's success; (b) claim returns 0 rows **and** the re-read shows a timestamp → "Already sent…" success, **no** thread/message/notification/revalidate; (b2) open at first read → owner marks it paid → claim 0 rows → re-read `paid` → "This payment is already closed." (not "Already sent"); (b3) open at first read → deleted (re-read missing or `deleted_at` set) → "Payment not found."; (b4) claim 0 rows but re-read still open with null report → "Could not send. Please try again." and logged with `tenant_report_claim_contention`; (b5) the re-read happens only after the ownership check passed (assert call order); (c) **two concurrent first reports** (`Promise.all`; mock: first claim → 1 row, second → 0 rows and its re-read shows the timestamp) → exactly one message insert, both `success: true`; (d) **concurrent + downstream failure:** A wins the claim, B gets 0 rows ("Already sent…"), A's message insert fails → A still returns `success: true` with "Sent. Your landlord will check and mark it paid.", the failure is logged, and **no** update that clears `tenant_reported_paid_at` is ever made; (e) thread creation returns no thread → same as (d) for a single request; (f) someone else's charge that is closed, or already reported → access error, **zero** writes (no claim update); (g) own closed charge → "This payment is already closed.", no claim; (h) claim update errors → "Could not send. Please try again.", no message. Assert across all cases that no `rent_charges` update ever sets `tenant_reported_paid_at` to `null`.
   - Tenant card (`tenant-rent-card.test.tsx`): a reported month shows `Sent Oct 7. Your landlord will check and mark it paid.` (fixture `tenantReportedPaidAt: "2026-10-07T17:04:35Z"`) and no button for that month, while an unreported month still has its button.
   - Charge row (`charge-row.test.tsx`): the owner view of a `late` row with the field shows the badge `Tenant says paid · Oct 7`; a `paid` row with the field, and the tenant view, show no badge. `charge-row-snapshot.test.tsx` passes **unchanged**.
   - Owner mapping parity: tests for **both** `dashboard-rpc.ts` and `dashboard-legacy.ts` mapping with three inputs: timestamp present → same string; SQL `null` → `null`; property missing → `null`. (Existing files or new `lib/__tests__/dashboard-tenant-report-mapping.test.ts`.)

## 4. Out of scope
- Applying or editing the migration; any other DB change; RLS.
- Clearing the report (it stops mattering once the row is paid or waived); an owner "not received" action; notifications (stay OFF); owner Messages UI; the online-pay flow; receipts.
- Deploy, commit, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/app/actions/inbox-manual-payment.ts`
- `apps/web/lib/tenant-payments.ts`, `apps/web/components/dashboard/tenant-rent-card.tsx`
- `apps/web/lib/dashboard.ts`, `apps/web/lib/dashboard-rpc.ts`, `apps/web/lib/dashboard-legacy.ts`
- `apps/web/components/dashboard/charge-row.tsx` and, only if needed to carry the field through, files under `apps/web/components/dashboard/charges/` (list each)
- Tests: `app/actions/__tests__/inbox.test.ts`, `components/__tests__/tenant-rent-card.test.tsx`, `components/__tests__/charge-row.test.tsx`, and the dashboard-rpc test file.

## 6. Implementation requirements
- Exact copy from §3; sentences ≤ 12 words; no banned words.
- Touched/new lines ≤ 140 characters; every file ≤ 500 lines (`dashboard-legacy.ts` and `charge-row.tsx` included; if one would pass 500, say so before splitting).
- Every Supabase mutation result is checked (L-002). No new dependencies, no `eslint-disable`.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npm run test --workspace @domus/web -- --run app/actions/__tests__/inbox.test.ts components/__tests__/tenant-rent-card.test.tsx components/__tests__/charge-row.test.tsx components/__tests__/charge-row-snapshot.test.tsx` plus the dashboard-rpc test and every test importing a changed file (`grep -rlE "tenant-payments|dashboard-rpc|dashboard-legacy|charge-row|tenant-rent-card|inbox-manual-payment" apps/web --include=*.test.ts --include=*.test.tsx`)
- The plain-language guard test.

## 8. Acceptance criteria (binary)
1. **Invariant: the guarded claim is the durable report; owner messaging is a secondary side effect after it.** The claim runs before any message, is guarded by `.is(…, null)`, not-deleted and open status, and is never reverted. One row = report accepted. Zero rows is classified from a re-read of the charge (reported → Already sent; closed → closed error; missing/deleted → not found; still open → retry error), never assumed to mean "already reported". Concurrent or repeat reports produce at most one owner message. A message failure is logged and still returns success. Ownership is checked before any status/report response; cross-tenant requests write nothing.
2. The tenant card shows the persisted "Sent {Mon D}…" for reported months; unreported months keep the button.
3. Owner/manager unpaid rows with a report show `Tenant says paid · {Mon D}`; paid/waived rows, the tenant view and unreported rows don't; the snapshot test is unchanged.
4. Both owner data paths (RPC and legacy) carry the field.
5. Every §3.4 case is a real assertion (no tautologies); lint, typecheck, targeted tests and the plain-language guard pass. Only §5 files changed.

## 8b. Post-deploy verification (Claude only; not part of Codex completion)
- Claude applies the migration (plain `add column`, no `if not exists`, so drift fails loudly) and verifies the column is `timestamptz`, nullable, no default, plus the new function body = old body + 3 column refs. Then deploy. Smoke tenant: the August month (already reported in S192, so Claude sets its column once by SQL to the S192 message time) shows the persisted "Sent Oct 7…"; tap **I paid this** on September → success; reload → persisted; tap again impossible (no button). DB: exactly one new message for September. RPC output check: call `owner_dashboard_payload` for the smoke property and confirm `charges[].tenant_reported_paid_at` is present (non-null for Aug/Sep, null for Oct). Smoke owner Rent: Aug and Sep rows show the badge, Oct doesn't; light/dark, 1280/375; 0 console errors. Nothing marked paid. Smoke specs, Sentry, CI.

## 9. Report format
JSON per `docs/codex-report-schema.json`. List new test names and any `charges/` files touched. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access or migration apply, no deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
