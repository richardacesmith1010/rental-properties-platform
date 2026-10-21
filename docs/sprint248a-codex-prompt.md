# Sprint 248a — Retention report job (report only, deletes nothing) (L3: schema + data policy) — rev 4 APPROVED (rev 1 AWC → rev 2 AWC → rev 3 AWC → rev 4 APPROVE)

## 1. Objective
`docs/policies/data-retention-policy.md` §3 (owner-approved 2026-10-18; lawyer to confirm) keeps money records 7 years
after their tax year, leases 7 years after they end, and repairs 3 years after they close. Build a **daily, report-only**
job that counts what each rule would make eligible, so the rules are proven and visible long before anything is old
enough. **It must not delete or change any user data.** Real deletion is a later sprint that needs the lawyer's
confirmation and the owner's one-step approval.
Also close one data gap: repairs set to `closed` never get a close date (`resolved_at` is set only for `resolved`).

## 2. Context
- HEAD: see `git log -1`. Supabase Postgres 17, pg_cron enabled (`20260708_sprint125_db_keepalive.sql`).
- Pattern to follow: `supabase/migrations/20261017_sprint230_review_queue_purge.sql` (`security definer`,
  `set search_path = ''`, fully qualified names, `revoke all … from public, anon, authenticated, service_role`,
  `cron.schedule('<name>', '<cron>', …)` upsert by name).
- Live columns (checked 2026-10-21): `payments(paid_at, reversed_at, rent_charge_id)`, `rent_charges(due_date,
  deleted_at, waived_at, lease_id)`, `property_expenses(expense_date)`, `bank_transactions(posted_on, bank_change)`,
  `manager_payments(payment_date, paid_at, status)`, `partner_payments(paid_on, status)`,
  `lease_deposit_returns(returned_on)`, `property_tax_years(tax_year)`, `leases(end_date, active, lease_status,
  terminated_at)`, `document_packets(lease_id, signed_at, status)`, `documents(lease_id)`,
  `maintenance_tickets(status, resolved_at, created_at)`, `maintenance_status_history(ticket_id, to_status, created_at)`,
  `maintenance_photos(ticket_id, storage_path)`.
- Earliest live dates (2026-10-21): payments 2026-02-01, charges 2026-02-01, expenses 2026-01-02, bank items
  2026-01-02, lease end 2027-02-01, repairs resolved 2026-02-13, tax year 2026. Expected counts today: all 0.
- `cron_runs` rows are deleted after 90 days by the charges cron, so the report needs its own table.
- `apps/web/app/actions/maintenance-ticket-actions.ts:254-256` sets `resolved_at` only when status is `resolved`.

## 3. In scope
1. **Table** `public.retention_reports` (`id uuid pk default gen_random_uuid()`, `run_at timestamptz not null default
   now()`, `category text not null`, `rule text not null`, `cutoff date not null`, `eligible_count integer not null`,
   `oldest_anchor date`, `blocked_count integer not null default 0`, `notes text`). Unique `(run_at, category)`. RLS enabled, **no policies**;
   `revoke all on table … from public, anon, authenticated, service_role` (only postgres reads it; RLS is not the
   security argument). No PII columns (counts and dates only).
2. **Function** `public.report_retention_candidates() returns integer` (rows written), `security definer`,
   `set search_path = ''`, read-only on user tables, inserts one row per category for this run:
   **Run key and clock:** declare `set timezone = 'UTC'` in the function definition. At the start compute once
   `v_run_at := greatest(clock_timestamp(), coalesce((select max(run_at) from public.retention_reports), '-infinity')
   + interval '1 microsecond')` and `v_today := (v_run_at at time zone 'UTC')::date`; use `v_run_at` for every row and
   `v_today` instead of `current_date` everywhere (timestamp anchors are converted with `at time zone 'UTC'` before
   `::date`). Two calls in one transaction therefore get distinct, increasing keys.
   **Boundary rules (pinned):** money rows are eligible from Jan 1 of (tax year + 8), i.e. `anchor <= make_date(
   extract(year from v_today)::int - 8, 12, 31)` ("7 years after the tax year"); leases eligible when
   `anchor <= v_today - interval '7 years'` (eligible on the anniversary day); repairs when
   `anchor <= v_today - interval '3 years'`. `cutoff` stores the date compared against.
   - `payments` — anchor `(paid_at at time zone 'UTC')::date`.
   - `rent_charges` — anchor = greatest of `due_date`, its newest payment `(paid_at at time zone 'UTC')::date`,
     `(waived_at at time zone 'UTC')::date`, `(deleted_at at time zone 'UTC')::date` (so an eligible charge can never have a non-eligible payment; `blocked_count` is still computed
     and expected 0 — pinned by a test).
   - `property_expenses` (`expense_date`), `bank_transactions` (`posted_on`), `manager_payments`
     (`coalesce((paid_at at time zone 'UTC')::date, payment_date)`), `partner_payments` (`paid_on`), `lease_deposit_returns`
     (`returned_on`), `property_tax_years` (`make_date(tax_year, 12, 31)`).
   - `leases` — only `active = false` and `lease_status in ('expired','terminated','renewed')`. Anchor: for
     `terminated`, `coalesce((terminated_at at time zone 'UTC')::date, end_date)`; for `expired`/`renewed`, `end_date` (ignore any stale
     `terminated_at`). `blocked_count` = eligible leases that would block or wrongly cascade on a future delete, from the
     **live FK graph (checked 2026-10-21)**: (a) NO ACTION children exist — `documents.lease_id`, `inspections.lease_id`,
     or another lease with `renewed_from_lease_id` = this lease; or (b) a CASCADE money descendant is not itself
     eligible — `rent_charges` (and their `payments`), `bank_transactions.lease_id`, `lease_deposit_returns`,
     `rent_charge_lines.lease_id`. (`document_packets.lease_id` is SET NULL, `tenant_activity_log` SET NULL,
     `autopay_enrollments`/`bank_rules`/`rent_increase_history` CASCADE without money dates — not blockers.)
   - `lease_document_packets` — packets whose lease is eligible (they would survive a lease delete with
     `lease_id` set null, so they are reported separately).
   - `repairs` — `status in ('resolved','closed')`; anchor = the **latest** terminal moment: `(greatest(resolved_at,
     (select max(created_at) from maintenance_status_history h where h.ticket_id = t.id and h.to_status in
     ('resolved','closed'))) at time zone 'UTC')::date` (so resolved → reopened → closed uses the final close). `notes` =
     `eligible_photos=<n>` (count of `maintenance_photos` rows of eligible tickets; never paths, names or ids).
   `rule` holds a short text like `tax_year+7` / `ended+7y` / `closed+3y`; `cutoff` the computed cutoff date.
   Grants: `revoke all on function … from public, anon, authenticated, service_role` (postgres only).
3. **Schedule** `cron.schedule('domus-retention-report', '45 9 * * *', 'select public.report_retention_candidates()')`
   (UTC, after the 09:30 review-queue purge).
4. **Report retention** — the function also runs exactly `delete from public.retention_reports where run_at < v_run_at -
   interval '400 days'` (its own table only; same invocation clock as eligibility). Date-only columns (`due_date`,
   `expense_date`, `posted_on`, `payment_date`, `paid_on`, `returned_on`, `end_date`) are used as-is.
   Concurrent runs: two overlapping invocations may compute the same `v_run_at`; the unique key then fails one of them
   (documented, accepted for a daily report — no advisory lock).
5. **Repair close date** — in `updateTicketStatus`, set `resolved_at = now()` when the new status is `closed` and the
   ticket has no `resolved_at` yet (same as `resolved` today). No other behavior change.
6. Tests in §8.

## 4. Out of scope
Any DELETE/UPDATE of user data (other than item 5's timestamp and the report table's own pruning). Storage. App UI.
Legal-hold flags. Changing the policy text (Claude owns docs).

## 5. Exact files expected to change
- `supabase/migrations/20261102_sprint248a_retention_report.sql` (new)
- `apps/web/app/actions/maintenance-ticket-actions.ts` (item 5 only)
- `apps/web/app/actions/__tests__/maintenance-ticket-notifications.test.ts` (or the existing status test file)
- `apps/web/lib/__tests__/retention-report-migration.test.ts` (new; static checks of the SQL)

## 6. Implementation requirements
- **Allowlisted SQL surface (exhaustive):** the function body may contain only `select`/CTEs over the tables named in
  §3.2 and `maintenance_status_history`/`maintenance_photos`/`inspections`/`documents`; the only callable functions are
  exactly `count, max, min, greatest, coalesce, make_date, extract, clock_timestamp, sum` (no others, qualified or not);
  `insert into public.retention_reports`, and exactly `delete from public.retention_reports where run_at < v_run_at -
  interval '400 days'`. No calls to any `public.*`/app function, no dynamic SQL (`execute`), no `perform`, no `update`, no
  `truncate`, no `storage.` or `auth.` references.
- Rollback comment block: `select cron.unschedule('domus-retention-report'); drop function …; drop table …;`.
- Lines ≤ 140 characters.

## 7. Validation
```
cd apps/web
npx vitest run lib/__tests__/retention-report-migration.test.ts app/actions/__tests__/maintenance-ticket-notifications.test.ts
```
then from the repo root `npm run gate:web`. Claude runs the live SQL suite (§10).

## 8. Acceptance criteria
- G1 (static SQL test) tokenizes the function body (strip comments and string literals first): every identifier
  immediately followed by `(` must be in the §6 function allowlist or be one of `exists, in, values, select` or a CTE
  name; every `from`/`join` target must be in the §6 table allowlist (or a CTE); the only `insert`/`delete` target is
  `public.retention_reports` and the delete statement must equal the §3.4 text; fails on `now(`, `update`, `truncate`, `execute`, `perform`, `copy`, `storage.`, `auth.`, `pg_`
  calls. A fixture test proves G1 rejects a body containing `pg_sleep(1)`, `public.anything()`, `set_config(…)` and an
  `update`. `security definer` with
  `set search_path = ''`; EXECUTE revoked from `public, anon, authenticated, service_role`; table RLS on, unique
  `(run_at, category)`, all privileges revoked from `public, anon, authenticated, service_role`; cron name, schedule and
  command exactly as §3.3.
- G2 (static) every category in §3.2 appears with its anchor expression and rule text; the function has
  `set timezone = 'UTC'` and computes `v_run_at` with `clock_timestamp()` as in §3.2.
- G2b (static) empty categories still write one row with `eligible_count = 0`, `oldest_anchor` null; rows whose anchor
  is null (e.g. a charge with no dates, a terminated lease with null `end_date` and `terminated_at`) are skipped, never
  counted; no trigger is created on `retention_reports`.
- G3 `updateTicketStatus` → `closed` on a ticket with `resolved_at` null writes `resolved_at` (ISO string); with a
  `resolved_at` already set, does not overwrite it; → `resolved` unchanged (pinned); → `in_progress` writes no
  `resolved_at`.
- G4 Gate green (counts verbatim).

## 9. Report format
Compact status only: files changed, G1–G4 → tests, migration SQL verbatim, validation counts. Do NOT include 'Claude
prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. Do not apply the migration. Claude applies it after a rolled-back dry run and runs a
live SQL suite inside a rolled-back transaction: synthetic old rows (a 2015 payment/charge/expense/bank item, a lease
ended 2016, a terminated lease with a stale later `terminated_at`, an expired lease with a stale `terminated_at`, a
lease blocked by a `documents` row and one blocked by a 2025 bank item, a repair resolved 2021 → reopened → closed
2024, a repair closed 2021 with a photo, plus recent rows) → exact expected counts, blocked counts and
`eligible_photos=<n>`; boundary fixtures for leases and repairs on the day before / exact anniversary / day after
(eligible only on and after the anniversary); money rows of tax year current−8 eligible and current−7 not; two runs in one
transaction both succeed, each adds exactly one row per category with a distinct, increasing `run_at`, and each returns
the number of rows it inserted; the session set to `America/Denver` gives the same results as UTC around midnight and
anniversary fixtures; distinct blocker fixtures for `inspections`, `renewed_from_lease_id`, `rent_charge_lines` and a
`document_packets` row (SET NULL — counted in `lease_document_packets`, not as a blocker), with a lease having several
blocker rows counted once; an **md5 of every user table's full contents** (rows ordered by primary key, serialized with
`row_to_json`/`to_jsonb` so nulls are unambiguous) taken **after inserting fixtures and before** the first run is
identical after both runs; the 400-day pruning tested separately (a report row 401 days old removed, 399 days kept); `public`/`anon`/`authenticated`/`service_role` denied EXECUTE and SELECT/INSERT on
the report table; the installed `cron.job` row has the expected name, schedule, command and `active = true`.
The user should never need to read instructions to complete this flow (no UI).
