# Sprint 237g — Remove unneeded client write privileges on every `public` table (L3: money/auth/schema) — rev 3 (rev 1 REJECT → rev 2 APPROVE WITH CHANGES: 5 REQUIRED adopted)

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
- **Relation kinds (rev 2):** `public` contains only ordinary tables (`relkind = 'r'`); no views, materialized views,
  foreign tables or partitions. The postcondition fails if any appear.
- **Default ACLs (rev 2):** no global default ACL exists (`pg_default_acl` with `defaclnamespace = 0`: none). The only
  table defaults in `public` are `postgres` (changed here) and `supabase_admin` (not used by our migrations; left as is).
- **Retained-table hardening (rev 2):** the 26 UPDATE policies on kept tables have no `WITH CHECK`, so PostgreSQL applies
  their `USING` to the new row (rows cannot be moved into homes the user does not administer). In addition, UPDATE on the
  5 core tables becomes **column-limited** to the columns the app's user-client updates write:
  `leases` (lease_status, active, termination_reason, terminated_at, end_date, due_day_of_month, monthly_rent_cents,
  deposit_cents, grace_period_days, late_fee_cents, collects_outside_domus); `units` (unit_number, bedrooms, bathrooms,
  monthly_rent_cents, occupied, active); `rent_charges` (status); `properties` (name, address_line1, city, state,
  postal_code, active, owner_account_id); `maintenance_tickets` (status, resolved_at, actual_cost_cents). Sources:
  `lease-mutations.ts:43-51,96-104,177,261-265`, `lease-lifecycle-actions.ts:74,150,160`, `charge-generation.ts:166,177,268`,
  `units.ts:118,187 (unit_number | monthly_rent_cents),265`, `properties.ts:176,231,303`, `ownership.ts:241`,
  `maintenance-comment-actions.ts:55`, `maintenance-ticket-actions.ts:250-255`. `property_tax_years` (client INSERT/UPDATE
  today) is written only via admin (`actions/property-tax-year.ts:23`) → revoked.
- **Dry run 1 (live, rolled back, rev 2 SQL incl. postcondition):** postcondition passed; W1–W6 → `42501`. As the smoke
  owner on their own rows: lease `tenant_profile_id` swap, lease `unit_id` move, charge `amount_cents`, charge `lease_id`
  move, charge `deleted_at`, property `owner_profile_id`, unit `property_id` move → all `42501`; property moved to an account
  they do not administer → `42501` (RLS); app columns still update (lease, charge status, unit, property name → 1 row each);
  `service_role` charge update → 1 row.
- **Dry run 2 (rollback equivalence, rolled back):** snapshot → migration (64 tables changed) → rollback logic (revoke all
  from anon/authenticated, replay the snapshot's 149 grant statements, restore default ACL) → **0 tables differ** (normalized
  grant sets incl. column grants), default ACL identical.

## Rev 3 changes (ChatGPT rev 2 APPROVE WITH CHANGES)
1. **`rent_charges` values guard** — trigger `rent_charges_guard_client_write` (security invoker; only acts when
   `current_user` is `authenticated`/`anon`): client INSERT only a `pending` `late_fee` whose parent is an open `rent`
   charge on the same lease, same due date, amount = the lease's `late_fee_cents`, no deleted/waived/reported-paid fields;
   client UPDATE of `status` only `pending → late`. Matches the only user-client writes (`charge-generation.ts:268,296-318`).
2. **Partner/fee tables attacked** (dry run 3, rolled back): outsider (owner of another LLC) insert/update/delete on
   `partner_payments` → denied/0/0; relink or add `account_partners` → 0/denied; member relinking a partner to a non-member
   → denied (WITH CHECK `is_active_owner_member`); manager inserting/updating `manager_payment_configs` → denied/0.
3. **Status boundary** (dry run 3): fake `paid` charge insert, wrong-amount late fee, `pending→paid`, `→waived`,
   `late→pending` → all `42501`; legitimate late-fee insert and `pending→late` → 1 row each.
4. **Real PostgREST positive paths** after apply as the smoke owner: leases, units, rent_charges, maintenance_tickets,
   properties updates on own rows + one upsert (§7.4).
5. **Deployment-specific rollback:** migration preflight compares an md5 of the live anon/authenticated table+column ACL
   entries (948) with the baseline `e2776adb1cd220f3233cf372338e6753` used to build the rollback file; any drift aborts.
   The rollback file also drops the new trigger/function.

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
   that is not in the §2 keep list for that table.
1b. Column-limited UPDATE on `leases`, `units`, `rent_charges`, `properties`, `maintenance_tickets` (exact lists in §2).
2. `alter default privileges for role postgres in schema public revoke insert, update, delete, truncate, references,
   trigger, maintain on tables from anon, authenticated;`
3. Postcondition (raises on any mismatch), **both sides**: every kept op present and no other op (table or column level);
   exact UPDATE column sets on the 5 core tables and no table-level UPDATE there; exactly 22 tables with any client write;
   `anon` holds no writes; nobody client-side holds TRUNCATE/REFERENCES/TRIGGER/MAINTAIN; no view/matview/foreign relation in
   `public`; no default ACL (postgres in `public`, or any global one) grants anon/authenticated/PUBLIC more than SELECT.
- **Rollback (rev 2):** `supabase/rollback/20261023_sprint237g_rollback.sql` — revoke all from anon/authenticated on every
  `public` table, replay the exact pre-237g snapshot (131 table grants + 18 column grants captured live 2026-10-16, which
  already include the 237d/237e locks), restore postgres's default ACL. Proven equivalent in dry run 2.

## 7. Validation (Claude, after apply; rolled back)
1. Postcondition passes; re-read live ACLs: kept ops present for all 22 tables, 22 tables total with client writes.
2. W1–W6 → `42501`, values unchanged.
3. Real PostgREST as the smoke tenant: insert into `payments` on own charge → `42501`.
3b. Kept-table attacks (dry run 1 list) re-run after apply → all `42501`.
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
