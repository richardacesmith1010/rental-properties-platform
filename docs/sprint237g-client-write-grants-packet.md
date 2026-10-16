# Sprint 237g — Remove unneeded client write privileges on every `public` table (L3: money/auth/schema) — rev 1

Migration-only sprint. **Claude** writes and applies the migration (CLAUDE.md §1). **Codex writes no app code.**
Finishes the default-grants audit started in 237d (`ownership_accounts`) and 237e (`profiles`).

## 1. Objective
Supabase's default ACL gives `anon` and `authenticated` full write privileges on every new `public` table. RLS write
policies then decide what a signed-in user can do directly through PostgREST — and several of those policies are far
looser than the app's own server actions. Keep only the client writes the app actually performs with the user's own
client; remove everything else; stop new tables inheriting client write grants.

## 2. Context
- HEAD after 237f (`7fcd4d9`). Supabase `vawqdqkaguhdgfhdebqw`, PostgreSQL 17. Audit 2026-10-16.
- **Live inventory:** 74 `public` tables, RLS on for all. 60 grant `authenticated` table-level INSERT/UPDATE/DELETE; anon
  also holds writes on 56. Every table grants TRUNCATE/REFERENCES/TRIGGER/MAINTAIN to anon/authenticated (not reachable
  through PostgREST, removed for defence in depth). Already locked: the 7 `bank_*` tables, `invitations`,
  `lease_deposit_returns`, `notification_deliveries`, `ownership_account_managers`, `ownership_accounts` (237d),
  `profiles` (237e), `rent_charge_lines`.
- **Default ACL** (`pg_default_acl`, grantor `postgres`, tables): `anon=arwdDxtm, authenticated=arwdDxtm`. Migrations run
  as `postgres`. (The `supabase_admin` default ACL is not ours to change and not used by our migrations.)
- **Attacker evidence (live, rolled back; smoke tenant + throwaway LLC fixture):**

  | # | Attack as `authenticated` | Today |
  |---|---|---|
  | W1 | Tenant inserts a `payments` row on their own late charge (policy allows the charge's tenant) | **inserted** — money readers sum payment rows |
  | W2 | Unrelated user votes `approve` on another LLC's $5,000 `withdrawal_requests` | **inserted** (policy checks only `voter_id = auth.uid()`) |
  | W3 | Same on another LLC's `distribution_change_requests` | **inserted** |
  | W4 | Any user inserts `charge_edit_history` for any charge | **inserted** (forged audit trail) |
  | W5 | LLC co-owner sets another partner's `payout_stripe_account_id` and `distribution_pct = 0` | **1 row** |
  | W6 | LLC co-owner deactivates another partner | **1 row** |

- **Code map (2026-10-16): writes performed with the signed-in user's client** (server `createClient()` via
  `requireAuth` / `checkPartnerAccess`; the browser client writes no tables; no storage writes; scripts/e2e use the
  service role; variable-table writes (`account-wipe`, governance, bank-feed, cron) all use the admin client):

  | Table | Ops kept | Where |
  |---|---|---|
  | account_partners | INSERT, UPDATE | `actions/partners.ts:48,60,73` (LLC owner) |
  | account_tasks | INSERT, UPDATE | `actions/account-tasks.ts:53,64,75,96,116` |
  | application_events | INSERT | `actions/leasing.ts:193,274,402,471` |
  | automation_rules | INSERT, UPDATE (upsert) | `actions/automations.ts:38,82` |
  | document_packets | INSERT, UPDATE | `actions/document-packets.ts:74,134` |
  | document_templates | INSERT, UPDATE, DELETE | `actions/document-templates.ts:56,66,95,115` |
  | expense_partner_attributions | INSERT, UPDATE, DELETE | `actions/partners.ts:166,170,176` |
  | inbox_threads | INSERT | `actions/inbox.ts:186` |
  | leases | INSERT, UPDATE | `actions/lease-lifecycle-actions.ts`, `lease-mutations.ts`, `lib/charge-generation.ts:166,177` |
  | maintenance_status_history | INSERT | `lib/maintenance/enrichment.ts:271` |
  | maintenance_tickets | INSERT, UPDATE | `actions/maintenance-ticket-actions.ts:79,255`, `maintenance-comment-actions.ts:55` |
  | manager_payment_configs | INSERT, UPDATE (upsert) | `actions/management-fee.ts:90` |
  | notifications | UPDATE (existing column grant) | `lib/notifications.ts:95,106` |
  | partner_payments | INSERT, UPDATE, DELETE | `actions/partners.ts:99,120,134` |
  | properties | UPDATE | `actions/ownership.ts:241`, `properties.ts:176,231,303` |
  | rent_charges | INSERT, UPDATE | `lib/charge-generation.ts:268,318` (late fees via `/owner/generate`) |
  | rent_increase_history | INSERT | `actions/lease-lifecycle-actions.ts:77` |
  | rental_applications | INSERT, UPDATE | `actions/leasing.ts:175,267` |
  | rental_listings | INSERT, UPDATE | `actions/leasing.ts:58,116` |
  | screening_reports | INSERT | `actions/leasing.ts:459` |
  | units | INSERT, UPDATE | `actions/units.ts`, `lease-mutations.ts`, `lease-lifecycle-actions.ts` |
  | vendors | INSERT | `actions/vendors.ts:65,79` |

  None of W1–W6's tables (`payments`, `withdrawal_votes`, `distribution_change_votes`, `charge_edit_history`,
  `ownership_account_members`) is written with the user client.
- **Column-level grants:** revoking table-level UPDATE also revokes column UPDATE grants, so the migration only revokes
  ops **not** in the keep list (tables with column grants — `account_partners`, `account_tasks`,
  `expense_partner_attributions`, `partner_payments`, `notifications` — keep their exact column grants).
- **Dry run (live, rolled back):** postcondition passed; every kept op still granted (`keptMissing=[]`); W1–W6 → `42501`;
  tables with any client write = 22.

## 3. In scope
Migration `supabase/migrations/20261023_sprint237g_client_write_grants.sql` and Claude's rolled-back verification.

## 4. Out of scope
- App code. RLS policies (loose policies on kept tables — e.g. `rent_charges`/`leases` admin-v2 UPDATE without column
  limits, legacy `*_owner` policies on `owner_profile_id` — are follow-ups; on kept tables only the app's existing roles can
  write).
- SELECT grants (unchanged; RLS governs reads). Function EXECUTE defaults (advisor item, separate).

## 5. Exact files
1. `supabase/migrations/20261023_sprint237g_client_write_grants.sql` (new; SQL in the file, summarized in §6).

## 6. Requirements — the migration
1. For every `public` table/partition: revoke INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN from `anon`;
   revoke TRUNCATE/REFERENCES/TRIGGER/MAINTAIN from `authenticated`; revoke from `authenticated` each of INSERT/UPDATE/DELETE
   that is not in the §2 keep list for that table. No GRANT statements.
2. `alter default privileges for role postgres in schema public revoke insert, update, delete, truncate, references,
   trigger, maintain on tables from anon, authenticated;`
3. Postcondition (raises on any mismatch): for every table, `authenticated` holds INSERT/UPDATE/DELETE (table or column
   level) only where the keep list allows; `anon` holds none; nobody client-side holds TRUNCATE/REFERENCES/TRIGGER/
   MAINTAIN; postgres's default ACL for tables gives anon/authenticated nothing but SELECT.
- **Rollback:** `grant insert, update, delete, truncate, references, trigger, maintain on all tables in schema public to
  anon, authenticated;` then re-run 237d/237e's revokes and restore the default ACL with `alter default privileges for
  role postgres in schema public grant all on tables to anon, authenticated;` (restores today's state exactly except
  column grants, which this migration never removes).

## 7. Validation (Claude, after apply; rolled back)
1. Postcondition passes; re-read live ACLs: kept ops present for all 22 tables, 22 tables total with client writes.
2. W1–W6 → `42501`, values unchanged.
3. Real PostgREST as the smoke tenant: insert into `payments` on own charge → `42501`.
4. Real PostgREST positive path: as the smoke owner, an UPDATE the app does on a kept table (`properties` name to the same
   value on their own home) → success, 1 row.
5. `APP_URL=https://domusbase.com npm run smoke:web` green; GitHub CI `gate` green; Vercel runtime logs: no
   `permission denied for table` over the next 24 h (search `42501`).
6. Live walk (owner): add a one-time fee or mark paid (admin), rename a unit (user client, kept), create a repair as the
   tenant (user client, kept).

## 8. Acceptance
1. Postcondition passes; exactly the §2 keep list remains; anon writes nothing; default ACL fixed.
2. W1–W6 denied; §7.3/7.4 pass.
3. Smoke, CI green; no permission errors in production logs.

## 9. Report format
Status line, migration name + apply time, counts before/after (tables with client writes 60 → 22), §7 results, class.

## 10. Constraints
Owner approved audit → packet → ChatGPT review → apply → ship (2026-10-16). Apply only after ChatGPT APPROVE / APPROVE
WITH CHANGES. One transaction; postcondition must raise. No app code, no policy edits.
