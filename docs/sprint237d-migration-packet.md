# Sprint 237d — Lock direct writes to `ownership_accounts` (L3: money/auth/schema) — rev 2 (rev 1 APPROVE WITH CHANGES: 2 REQUIRED + 3 OPTIONAL adopted → rev 2 **APPROVE**, ChatGPT 2026-10-15)

Migration-only sprint. **Claude** writes and applies the migration (CLAUDE.md §1). **Codex writes no app code** — the
code map below shows no client-session write path exists. Apply live only after ChatGPT review and the owner's yes.

## 1. Objective
Any active **owner member** of an ownership account (or the profile that created it) can write almost every column of
`public.ownership_accounts` directly through PostgREST with their own JWT, bypassing every server action. The worst case:
a co-owner of an LLC sets the LLC's `stripe_account_id` to their own Stripe Connect account and
`stripe_onboarding_complete = true`; `getOwnerStripeAccountForProperty` (`apps/web/lib/stripe-connect.ts:446-459`) then
returns it as the **destination for rent charges**, so the LLC's rent goes to one partner. Remove all client-role write
privileges on the table so only `service_role` and SECURITY DEFINER functions can write it.

## 2. Context
- HEAD `159ff46` (main). Supabase project `vawqdqkaguhdgfhdebqw`, PostgreSQL 17.6. Audit done 2026-10-15.
- **Live ACL** (`pg_class.relacl`, no column-level `attacl` on any column):
  `postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm` — the Supabase default
  (`pg_default_acl` on `public` grants `arwdDxtm` to anon/authenticated for every new table). The `m` is PG17 MAINTAIN.
- **Live policies** (RLS on, not forced):
  - `ownership_accounts_select_member_or_creator` SELECT: `created_by_profile_id = auth.uid() OR is_member_of_account(id)`
  - `ownership_accounts_insert_owner_or_manager` INSERT check: caller's profile role is owner/manager AND
    `created_by_profile_id = auth.uid()`
  - `ownership_accounts_update_member_or_creator` UPDATE using: `created_by_profile_id = auth.uid() OR
    is_owner_member_of_account(id)`; **no WITH CHECK**, no column limits.
  - No DELETE policy.
- **Live trigger** `ownership_accounts_guard_client` (BEFORE INSERT/UPDATE, definer) blocks only `managed_client`,
  `claim_state`, `claimed_at`, `claimed_by_profile_id` (and `created_by_profile_id` on client accounts) unless
  `domus_client_sync_allowed()`. Every other column is unguarded.
- **Live exposure:** 17 accounts; 3 have a Stripe account; **1 LLC has more than one active owner member and a Stripe
  account** — the redirect scenario is possible on real data today.
- **Code map — every write to `ownership_accounts` uses `createAdminClient()` (service_role):**

  | File:line | Op | Columns |
  |---|---|---|
  | `app/actions/onboarding.ts:76` | insert | account_type, display_name, created_by_profile_id, join_code |
  | `app/actions/ownership.ts:46` | insert | account_type, display_name, created_by_profile_id, join_code |
  | `lib/ownership.ts:498` | insert | account_type, display_name, created_by_profile_id |
  | `app/actions/connect.ts:102` | update | stripe_account_id, stripe_onboarding_complete |
  | `app/actions/connect.ts:259` | update | stripe_onboarding_complete |
  | `lib/stripe-webhook-handlers.ts:714` | update | stripe_onboarding_complete (webhook, AdminClient) |
  | `lib/stripe-connect.ts:68` | update | stripe_status, stripe_last_verified_at |
  | `app/api/cron/verify-stripe-accounts/route.ts:69` | update | stripe_status, stripe_last_verified_at |
  | `app/actions/account-governance-setup.ts:225` | update | display_name (after vote) |
  | `app/actions/account-governance-rename-actions.ts:130,161` | update | display_name |
  | `lib/distributions.ts:231` | update | distribution_mode |
  | `app/actions/account-governance-delete-support.ts:66` | delete | — |
  | `app/actions/account-wipe.ts:767` | delete | — |
  | `app/actions/bank-connections.ts`, `app/api/webhooks/plaid/route.ts`, `lib/bank-feed/sync.ts` | plaid writes | admin client |
  | `scripts/seed*.ts`, `scripts/seed-smoke-accounts.mjs`, `tests/e2e/helpers/*` | seed/cleanup | service role key |

  No browser client (`lib/supabase/client`) touches the table. **Database functions:** the only function that writes it
  is `create_client_account` (SECURITY DEFINER, runs as `postgres`) — unaffected by grants. No views or publications
  depend on the table.
- **Exhaustive read inventory** (rev 2; every non-test `ownership_accounts` reference in `apps/web/{app,lib,components}`,
  plus embedded selects and RPCs; line numbers at HEAD `159ff46`):

  | Client | Sites |
  |---|---|
  | **service_role** (`createAdminClient()` / AdminClient) | `app/owner/bank/page.tsx:68`; `app/actions/llc-invitations-support.ts:70`; `connect.ts:86,245,342`; `account-governance-setup.ts:65`; `withdrawals.ts:336`; `lib/client-overview.ts:80`; `lib/llc-invitations.ts:83` and `:150-153` (embedded `ownership_accounts(display_name)`, admin); `lib/portfolio.ts:294,403`; `lib/distributions.ts:139`; `lib/client-accounts.ts:20,75`; `lib/stripe-connect.ts:270,337,448,463,572,576`; `lib/notification-recipients.ts:27,53`; `lib/owner-statement.ts:69`; `lib/ownership.ts:214,239,264,337,365,452,547`; RPC `ownership_accounts_payload` via `admin.rpc` (`lib/ownership.ts:186`); cron `verify-stripe-accounts`; cron `generate-charges` → `sendDelinquencyEscalations` / `sendRentDueReminders` / `generateMonthlyChargesForAllOwnersWithClient(adminClient)` → `getClientHomeFlags(admin…)`; `charge-undo.ts:47`, `analytics-loader.ts:139`, `dashboard.ts:169`, `reports-delinquency.ts:78` pass `admin` to `getClientHomeFlags` |
  | **authenticated** (`createClient()` server, signed-in only) | `lib/cash-on-hand.ts:32` (`loadCashOnHand`, `app/owner/money/page.tsx`, after `user`); `lib/expenses.ts:182` (after `getCurrentUserRole(userId)`); `lib/partners.ts:30` and `app/actions/partners.ts:34` (after `auth.getUser()`); `lib/invitations.ts:142` (`getOwnerInvitations`, owner/manager pages after `user`); `lib/lease-collection.ts:27` via `generateMonthlyChargesForOwner` (`app/owner/generate/route.ts`, redirects to `/login` without `user`) |
  | **anon** | **none.** No browser client (`lib/supabase/client`) references the table; every server `createClient()` reader above runs after a signed-in user check. `generateMonthlyChargesForAllOwners()` (`lib/autopay.ts:301`, user client) has no callers. |
  | **SQL functions** | Only writer: `create_client_account` (SECURITY DEFINER, owner `postgres`; `authenticated` has **no** EXECUTE — called by service_role). Readers that are SECURITY INVOKER (`owner_portfolio_payload`, `ownership_accounts_payload`): `authenticated` has no EXECUTE; called via `admin.rpc`. Definer helpers (`is_member_of_account`, `is_owner_member_of_account`, `is_llc_account`, `is_creator_of_account`, `expense_in_account`, `can_administer_property`, guard triggers) read as `postgres` — unaffected. Query used: `pg_proc` in `public` where `pg_get_functiondef ~* 'ownership_accounts'`, with `prosecdef`, `has_function_privilege('authenticated', oid, 'execute')` and a write regex `(insert into|update|delete from) (public.)?ownership_accounts`. |

  SELECT for `authenticated` stays exactly as today; removing anon SELECT changes no app path.
- **Sprint 237b** adds `managers_can_send_reminders` and its own invoker trigger guard and says "do not change existing
  grants". The two are compatible in either order: 237b's acceptance only asserts a direct update/insert **raises**; after
  237c it raises `42501 permission denied` before the trigger runs. 237b's trigger stays as defense in depth.

## 3. Attacker evidence (2026-10-15, live, every run rolled back)
Method: one `DO` block per run; `set_config('request.jwt.claims', {sub, role}, true)`; `set local role authenticated`;
each attack in its own sub-block; the block ends with `raise exception` so the whole transaction rolls back. Attacker =
smoke owner `a2f5e6af-…` on their own account `1086bcad-…` (owner member + creator). Post-check confirmed the row was
unchanged and the inserted row did not exist.

| # | Attack as `authenticated` | Result today |
|---|---|---|
| A1 | `set stripe_onboarding_complete = true` | **1 row updated** |
| A2 | `set stripe_account_id = 'acct_ATTACKER…', stripe_status = 'active', stripe_last_verified_at = now()` | **1 row** |
| A3 | `set display_name = 'Renamed Without Vote', join_code = 'ATTACK1', distribution_mode = 'split_equal'` | **1 row** (bypasses the LLC rename vote) |
| A4 | `set account_type = 'llc', created_by_profile_id = null, created_at = '2000-01-01'` | **1 row** |
| A5 | `set plaid_item_id, plaid_bank_name, plaid_bank_mask, plaid_balance_cents = 999999999` | **1 row** (fake cash balance) |
| A6 | `set managed_client = true` | blocked by trigger (42501) |
| A7 | `set claim_state = 'unclaimed'` | blocked by trigger (42501) |
| A8 | direct INSERT `llc` with `stripe_onboarding_complete = true, stripe_status = 'active'` | **inserted** |
| A9 | DELETE own account | 0 rows (no DELETE policy) |
| A10 | `anon` UPDATE all rows | 42501 — only because anon cannot execute `is_owner_member_of_account`; the table grant is still there |
| — | `has_table_privilege('authenticated', …, 'TRUNCATE')` | **true** (TRUNCATE ignores RLS) |

Dry run of the §6 migration inside a rolled-back transaction: authenticated UPDATE/INSERT/DELETE → `42501 permission
denied for table ownership_accounts`; authenticated `select id, display_name, managed_client` → still returns its row;
anon SELECT → 42501; `service_role` UPDATE → 1 row. Live ACL re-read after the dry run: unchanged.
Rev 2 dry run of the exact §6 revoke/grant + postcondition (rolled back): **PASSED**; preflight attacl count = 0;
ACL after = `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}`. Keep this evidence in
the apply report (ChatGPT optional).

## 4. In scope
- One migration: `supabase/migrations/20261020_sprint237d_ownership_accounts_grants.sql` (§6).
- Rolled-back verification fixture run by Claude (§7).

## 5. Out of scope
- App code (`apps/**`): no change needed or allowed.
- RLS policies and the `ownership_accounts_guard_client` trigger: unchanged (INSERT/UPDATE policies become inert; keep
  them so rollback is a single GRANT).
- Other tables with the same default grants (57 of 74 `public` tables give `authenticated` UPDATE) and the `public`
  default ACL — separate audit (§11).
- `public.profiles` — **separate, more urgent** finding (§11); not fixed here.

## 6. Requirements — the migration (exact SQL)
```sql
-- Sprint 237d: ownership_accounts is written only by service_role and SECURITY DEFINER functions.
-- Before (live 2026-10-15): anon=arwdDxtm, authenticated=arwdDxtm. After: anon none, authenticated SELECT only.
begin;

revoke all on table public.ownership_accounts from anon, authenticated;
grant select on table public.ownership_accounts to authenticated;

do $$
declare v_acl text;
begin
  select relacl::text into v_acl from pg_class where oid = 'public.ownership_accounts'::regclass;
  if has_table_privilege('authenticated', 'public.ownership_accounts', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     or has_table_privilege('anon', 'public.ownership_accounts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     or not has_table_privilege('authenticated', 'public.ownership_accounts', 'SELECT')
     -- a comma list means "any of", so check service_role's needed privileges one by one
     or not has_table_privilege('service_role', 'public.ownership_accounts', 'SELECT')
     or not has_table_privilege('service_role', 'public.ownership_accounts', 'INSERT')
     or not has_table_privilege('service_role', 'public.ownership_accounts', 'UPDATE')
     or not has_table_privilege('service_role', 'public.ownership_accounts', 'DELETE')
     or has_any_column_privilege('authenticated', 'public.ownership_accounts', 'INSERT,UPDATE,REFERENCES')
     or has_any_column_privilege('anon', 'public.ownership_accounts', 'SELECT,INSERT,UPDATE,REFERENCES')
     or exists (select 1 from pg_attribute where attrelid = 'public.ownership_accounts'::regclass
                and attnum > 0 and attacl is not null) then
    raise exception 'sprint237d postcondition failed: %', v_acl;
  end if;
end $$;

commit;
```
- Rollback (restores the reviewed table-level grants; there were no column ACLs, grant options or other grantors at
  review): `grant all on table public.ownership_accounts to anon, authenticated;` (PG17 `ALL` = `arwdDxtm`).
- **Preflight (must pass before applying; L-012):** re-read and diff against §2 — `relacl` exactly
  `{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}`;
  `select count(*) from pg_attribute where attrelid = 'public.ownership_accounts'::regclass and attnum > 0 and attacl is
  not null` = **0**; the 3 policies and the `ownership_accounts_guard_client` trigger unchanged; the function query in §2
  still shows `create_client_account` as the only writer. Any difference → stop and re-review. A 237b column (if 237b
  landed first) needs no extra handling — the table-level revoke covers all columns, and the attacl check still holds.

## 7. Validation (Claude, after apply)
1. Postcondition block passes inside the migration.
2. Re-run §3 A1–A5, A8 as `authenticated` (rolled back): every one → `42501`. TRUNCATE privilege false.
3. As `authenticated` smoke owner: `select id, display_name, managed_client, stripe_account_id` on own account → 1 row;
   on an unrelated account → 0 rows (RLS unchanged).
4. As `service_role`: no-op UPDATE on the smoke account → 1 row.
5. `npm run gate:web` green; `APP_URL=https://domusbase.com npm run smoke:web` green (3 roles, zero console errors).
6. Walk (signed in, smoke owner): Owner home, Bank page, Settings → Stripe connect status, Partners/LLC page render with
   no errors; Vercel runtime logs for those routes show no `permission denied for table ownership_accounts`.
7. Logged-out: `/`, `/login`, an invitation link page render (anon SELECT now errors instead of returning 0 rows — any
   anon-session reader would surface here).
8. 24 h after apply: Vercel runtime log search for `42501` / `ownership_accounts` → none.

## 8. Acceptance
1. Live ACL is exactly `{postgres=arwdDxtm, authenticated=r, service_role=arwdDxtm}` (no anon entry).
2. §7.2 shows every write attack denied; §7.3 shows reads unchanged; §7.4 shows server writes work.
3. Gate, smoke and the GitHub CI `gate` check for HEAD are green (L-019).
4. No `ownership_accounts` permission error in production logs over 24 h.

## 9. Report format
Status line, migration name + apply time, ACL before/after, §7 results 1–8 as PASS/FAIL, classification.

## 10. Constraints
- Do not apply without ChatGPT review (APPROVE / APPROVE WITH CHANGES) and the owner's yes.
- One transaction; postcondition must raise on mismatch.
- No app code, no policy or trigger edits, no other tables.

## 11. Follow-ups found during the audit (not in this sprint)
1. **`public.profiles` — privilege escalation (critical).** Live, rolled back: the smoke **tenant** ran
   `update profiles set role = 'owner' where id = auth.uid()` → 1 row; also set its own `stripe_account_id` /
   `stripe_onboarding_complete` → 1 row. Policies `profiles_update_own_profile` / `profiles_update_self` allow any
   self-update, `authenticated` holds table-level UPDATE, and `profiles` has **no triggers**. Needs its own L3 packet
   (column-level UPDATE grant for the self-editable columns only, or a guard trigger), after mapping the app's own
   user-session `profiles` writes.
2. **Default grants.** `pg_default_acl` on `public` gives anon/authenticated `arwdDxtm` on every new table; 57 of 74 tables
   grant `authenticated` UPDATE. Audit each table's client write paths and add a CI/runtime check that flags any table
   where `authenticated` holds write privileges not on an allow-list.
