# Sprint 258a — Pause automatic late fees until state rules can be proven (L3) — rev 3 (rev 1 REJECT → rev 2 AWC)

**Rev 3 changes (ChatGPT rev 2 APPROVE WITH CHANGES, all adopted):** an unmocked integration test (P9); Claude's full
fee-writer audit and production fee-row count in §2 (Codex re-checks in P8); `[fees on]` tests labeled as dormant-path
coverage, not compliance; a mixed-candidate log test (P4b). Enablement checklist added to the rules map.

Codex: `gpt-6.1-sol` · high (L3 money logic; first trial of 6.1-sol, CLAUDE.md §3a). ChatGPT review: GPT-6 · High.

**Rev 2 changes.** ChatGPT rejected rev 1 (Colorado cap + 7-day timing): Colorado also requires the fee to be in the
lease, bars fees on a subsidy provider's share, and bars any fee without written notice to the tenant within 180 days
(C.R.S. 38-12-105(1)(c), (f), (j), confirmed in the official 2024 text, §11). Domus can't prove those today. Rev 2
takes the reviewer's stated alternative: keep automatic late-fee insertion **off in every state** until a later sprint
proves each condition. Late status and late notices stay as they are.

## 1. Objective
The nightly job adds the lease's late fee to unpaid rent once the lease's grace period passes, in every state, with no
legal checks. No such fee has ever been charged, and no lease collected in Domus has a late fee today. Stop the job
from ever adding a late fee until Domus can prove each state's conditions, without changing anything else it does.

## 2. Context (HEAD `fce18b6`)
- `apps/web/lib/charge-generation.ts` (490 lines) `applyLateFeesToOverdueCharges(supabase, leaseIds, todayIso)`
  (lines 183–395) is the only place Domus creates late fees (`category: "late_fee"`, line 293). It:
  - loads pending rent candidates (191–209), leases (218–221), units (227–231), client flags (232);
  - marks rent `late` when past grace (233–242, 253–263);
  - builds fee rows `lateFeeChargeRows` (243–249), checks existing fees (264–280) and inserts (281–306);
  - sends late notices from `lateStatusChargeRows` only (308–394): tenant title "Rent payment overdue", body
    "Your rent due <date> is now late."; owner/team title "Rent is late", body "Rent due <date> is now late."
    (`event: "late_fee"` is the notification-policy category for late-rent notices, `lib/notification-policy.ts:27`).
- Called by `generateMonthlyChargesForPropertyIdsWithClient` (line 480) from the daily cron.
- Tests: `apps/web/lib/__tests__/charge-generation.test.ts` (552 lines). Fee assertions today: "D5 marks October 26
  rent late…" (lines 216–227), "D4s inserts one late fee…" (229–240), "preserves late status and late-fee behavior…"
  (499–517), "null lease collection flag keeps the fee…" (519–532). The fake client `createLateFeeSupabaseMock`
  (lines 33–157) and `setToday` (159–162) live in that file today.
- **Fee-writer audit (Claude, 2026-10-25):**
  - App code: the only late-fee insert is `charge-generation.ts:281–306`, reached from the cron (admin client) and from
    `generateMonthlyChargesForOwner` (session client, line 487). Other `"late_fee"` hits are reads, labels, the
    notification category (`charge-generation.ts:354, 378`) and the manual-charge category list
    (`lib/validations-payment.ts:23–31`, a landlord adding a one-off charge by hand — not automatic; Sprint 258b).
  - Database: no function or `pg_cron` job inserts late fees (functions mentioning `late_fee`:
    `owner_portfolio_payload` reads, `guard_client_rent_charge_write` validates). The trigger
    `rent_charges_guard_client_write` lets a signed-in client insert a late fee only for an open rent charge at the
    lease amount (`supabase/migrations/20261023_sprint237g_client_write_grants.sql:85–110`); after this sprint no app
    path uses that allowance (revoking it is Sprint 258b, with a migration). Cron jobs: keep-alive ping, bank-review
    purge, retention report. No Supabase Edge Functions exist.
  - Production: 0 `rent_charges` rows with `category = 'late_fee'` (any status), so no existing fee can be collected.

## 3. In scope
1. New `apps/web/lib/late-fee-policy.ts` exporting `automaticLateFeesEnabled(): boolean` that returns `false`, with this
   comment above it (exact):
   `// Automatic late fees are paused (2026-10-24). Colorado (C.R.S. 38-12-105) requires the fee in the lease, no fee on`
   `// a subsidy's share, one fee per late payment, and written notice within 180 days. Domus can't prove these yet.`
   `// Turning this on needs a reviewed sprint that proves each condition (docs/compliance/rules-map.md).`
2. In `applyLateFeesToOverdueCharges`: when `automaticLateFeesEnabled()` is false, build no fee rows — skip the
   existing-fee query and the insert entirely. When at least one charge would have qualified for a fee under today's
   rules (not collected outside Domus, past grace, `late_fee_cents > 0`), log once per run:
   `console.log("[late-fees] paused:", count, "fee(s) not added")` (count only — no ids, names or amounts).
3. Everything else unchanged: which charges are marked `late` and when, collected-outside-Domus and client-home
   handling, notices (recipients, titles, bodies, events), return strings, and the fee code path itself (kept intact
   behind the switch for the future sprint).

## 4. Out of scope
Any state-specific fee logic (Colorado cap/timing, subsidies, notices), the lease form and pages (a "Domus doesn't add
late fees for you yet" note is Sprint 258b), grace defaults, migrations, `lib/lease-collection.ts`, the cron route.

## 5. Exact files expected to change
- `apps/web/lib/late-fee-policy.ts` (new)
- `apps/web/lib/charge-generation.ts`
- `apps/web/lib/__tests__/late-fee-policy.test.ts` (new)
- `apps/web/lib/__tests__/late-fee-test-helpers.ts` (new — `createLateFeeSupabaseMock` and `setToday` moved here
  unchanged except for the new `lateFeeCents` and second-candidate options)
- `apps/web/lib/__tests__/charge-generation.test.ts`

## 6. Implementation requirements
- `charge-generation.ts` stays at or under 500 lines. Lines ≤ 140 characters.
- In `charge-generation.test.ts`, mock the switch: `vi.mock("@/lib/late-fee-policy", () => ({ automaticLateFeesEnabled:
  vi.fn(() => false) }))`; reset it to `false` in a `beforeEach`; the four fee tests listed in §2 call
  `vi.mocked(automaticLateFeesEnabled).mockReturnValue(true)` and keep their current assertions (dormant path stays
  covered). Rename them with a `[fees on]` prefix and put this comment above them (exact): `// Dormant-path coverage
  // only. Passing these tests does not make automatic late fees legal; see lib/late-fee-policy.ts.`
- No `expect` inside mock implementations (L-028). Every Supabase error still checked (L-002). No new dependencies.
  Do not commit.

## 7. Validation
```
cd apps/web
npx vitest run lib/__tests__/late-fee-policy.test.ts lib/__tests__/charge-generation.test.ts \
  lib/__tests__/notifications.test.ts lib/__tests__/notification-fanout.test.ts \
  lib/__tests__/denver-evening-rules.test.ts lib/__tests__/autopay.test.ts
npx tsc -p tsconfig.json --noEmit
cd .. && npm run lint:web
```
Claude runs the full `npm run gate:web` before deploy.

## 8. Acceptance criteria (exact values; `toEqual` for payloads, L-030)
- P1 `late-fee-policy.test.ts` imports the real module: `automaticLateFeesEnabled()` returns `false`.
- P2 Switch off (default), lease not collected outside Domus, `late_fee_cents` 5000, due 2026-09-01, today
  2026-10-03: `update` called once with `{ status: "late" }`; `insert` **not** called; no `rent_charges` select that
  includes `parent_charge_id`; the paused log line printed exactly once with count 1; return string
  "Late notices: 1 sent, 0 emailed, 0 skipped.".
- P3 Switch off, same setup: the tenant notice args equal `{ … title: "Rent payment overdue", body: "Your rent due
  <formatDate("2026-09-01")> is now late.", type: "late_rent", entityType: "rent_charge", entityId: "charge-1" … }`
  and the team notice has `title: "Rent is late"`, `body: "Rent due <formatDate("2026-09-01")> is now late."`,
  `event: "late_fee"`; neither title nor body contains "fee" (case-insensitive).
- P4 Switch off, two candidate charges on two leases (both qualify) → one log line with count 2; no insert.
- P4b Switch off, three candidates: one qualifies, one has `late_fee_cents` 0, one is within grace → one log line with
  count 1; no insert.
- P5 Switch off, lease `late_fee_cents` 0 or collected outside Domus → no paused log line, no insert.
- P6 Switch on (`[fees on]` tests): D5, D4s, "preserves…" and "null lease collection flag…" pass with their current
  assertions unchanged.
- P7 Existing tests for collected-outside-Domus, client homes, account-lookup errors, idempotency and notifications
  pass unchanged (switch off).
- P8 Fee-writer re-check: report the output of
  `grep -rnE "late_fee['\"\`]" apps/web/app apps/web/lib apps/web/components apps/web/scripts supabase --include='*.ts'
  --include='*.tsx' --include='*.sql' | grep -v __tests__` and of
  `grep -rnE "from\(['\"]rent_charges['\"]\)" apps/web/app apps/web/lib --include='*.ts' -A3 | grep -E "insert|upsert"`;
  confirm each automatic writer found matches the §2 audit (only `charge-generation.ts` inserts late fees).
- P9 Unmocked integration (in `late-fee-policy.test.ts`, which must **not** mock `@/lib/late-fee-policy`): the real
  policy and the real `applyLateFeesToOverdueCharges` with the shared fake client (notification modules mocked as in
  `charge-generation.test.ts`); a fee-eligible charge (not collected outside Domus, `late_fee_cents` 5000, due
  2026-09-01, today 2026-10-03) → `update` called with `{ status: "late" }`, `insert` not called, no select including
  `parent_charge_id`, tenant and team notices sent as in P3. This test must fail if the policy returns `true`.
- G1 the four test files pass; `tsc` and lint clean.

## 9. Report format
Compact status only: each criterion → test name; test counts; `wc -l` of `charge-generation.ts`; the P8 grep output.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. No user-facing copy changes. The switch is a code constant on purpose: turning fees on
must go through a reviewed sprint, never an environment variable.

## 11. External rules (CLAUDE.md §4b)
Colorado, C.R.S. 38-12-105(1) (2024 official text, [Title 38 PDF](https://content.leg.colorado.gov/sites/default/files/images/olls/crs2024-title-38.pdf), p. 84; [SB21-173](https://leg.colorado.gov/bills/sb21-173)), verbatim:
> A landlord shall not take any of the following actions or direct any agent to take any of the following actions on
> the landlord's behalf: (a) Charge a tenant or home owner a late fee unless a rent payment is late by at least seven
> calendar days; (b) Charge a tenant or home owner a late fee in an amount that exceeds the greater of: (I) Fifty
> dollars; or (II) Five percent of the amount of the past due rent payment; (c) Require a tenant or home owner to pay a
> late fee unless the late fee is disclosed in the rental agreement; (d) Remove or exclude a tenant … because the
> tenant fails to pay one or more late fees …; (e) Terminate a tenancy … because a tenant … fails to pay one or more
> late fees …; (f) Impose a late fee … for the late payment or nonpayment of any portion of the rent that a rent subsidy
> provider, rather than the tenant or home owner, is responsible for paying; (g) Impose a late fee more than once for
> each late payment, except … if the total amount of such late fees does not exceed the amount described in subsection
> (1)(b) …; (h) Require a tenant or home owner to pay any amount of interest on a late fee; (i) Recoup any amount of a
> late fee from a rent payment made to the landlord by a tenant or home owner; or (j) Charge a tenant or home owner a
> late fee unless the landlord provided the tenant or home owner written notice of the late fee within one hundred
> eighty days after the date upon which the rent payment was due.

Penalties: $50 per violation (3); 7 days to cure after notice (4); then damages, $150–$1,000 per violation and
attorney fees (5). A non-complying lease provision is void (2).

| Condition | Can Domus prove it today? | This sprint |
| --- | --- | --- |
| (a) 7 days, (b) cap, (g) once | Computable, not built | Fees off (P2, P4) |
| (c) in the signed lease | No proof the amount was in a signed lease | Fees off |
| (f) subsidy share | Subsidies not tracked | Fees off |
| (j) written notice ≤ 180 days | No written fee notice exists (notifications are off until launch) | Fees off |
| (h) interest, (i) recoup from rent | Domus charges no interest; autopay pays rent charges only (`lib/autopay.ts:92`) | Unchanged |
| (d), (e) eviction | Domus never evicts; late notices don't mention fees | P3 |

Other states with real homes (Illinois, Pennsylvania, South Carolina) are not researched; fees off there too.
