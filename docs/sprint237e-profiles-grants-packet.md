# Sprint 237e — Lock direct writes to `profiles` (L3: auth/money/schema) — rev 2 (rev 1 ChatGPT APPROVE WITH CHANGES: 2 REQUIRED + 4 OPTIONAL adopted)

Migration-only sprint. **Claude** writes and applies the migration (CLAUDE.md §1). **Codex writes no app code** — every
app, script and test write to `profiles` already uses the service role (code map below). Same pattern as Sprint 237d
(`ownership_accounts`, shipped `e5af488`).

## 1. Objective
Any signed-in user can write every column of **their own** `public.profiles` row directly through PostgREST with their
JWT. A tenant can set `role = 'owner'` (every `requireAuth` / `getCurrentUserRole` check reads this column), attach any
`stripe_account_id` with `stripe_onboarding_complete = true`, swap `stripe_customer_id` (used for off-session autopay
charges), set `is_tester`, or change `email` (used as the canonical recipient for notifications and the test allowlist).
Remove all client-role write privileges so only `service_role` and SECURITY DEFINER functions write the table.

## 2. Context
- HEAD `f51c5c9` (main). Supabase `vawqdqkaguhdgfhdebqw`, PostgreSQL 17. Audit 2026-10-16. 35 profiles.
- **Live ACL:** `{postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}`; column ACLs: 0.
- **Live policies** (RLS on): `profiles_insert_self` INSERT check `auth.uid() = id`; `profiles_update_own_profile` UPDATE
  using/check `id = auth.uid()`; `profiles_update_self` UPDATE using `auth.uid() = id` (no check); SELECT policies
  `profiles_select_self`, `profiles_select_owner_for_management`, `profiles_select_owner_for_managers`. No DELETE policy.
- **Triggers on `profiles`:** none.
- **DB functions that write `profiles`:** only `handle_new_user` (SECURITY DEFINER, owner `postgres`, trigger
  `auth.users.on_auth_user_created`; `authenticated` cannot execute) — unaffected by grants.
- **App writes — all `createAdminClient()` (service role):**

  | File:line | Op | Columns |
  |---|---|---|
  | `app/actions/profile.ts:70,130` | update | avatar_url; full_name / nickname / phone (profile form) |
  | `app/actions/entity-profile-updates.ts:96,247` | update | profile payloads (admin) |
  | `app/actions/autopay.ts:124` | update | stripe_customer_id |
  | `app/actions/connect.ts:41,292` | update | stripe_account_id, stripe_onboarding_complete |
  | `lib/notification-preference-store.ts:263,278` | update | notification_preferences, notifications_paused_until |
  | `lib/llc-invitations.ts:268` | upsert | invited partner profile |
  | `lib/stripe-webhook-handlers.ts:715` | update | stripe_onboarding_complete (webhook) |
  | `tests/e2e/helpers/auth.ts:61`, `scripts/seed*.ts`, `scripts/seed-smoke-accounts.mjs` | upsert | service-role key |

  No browser client (`lib/supabase/client`) references `profiles`. Many server pages **read** `profiles` with the user
  client (`lib/auth.ts`, `lib/partners.ts`, `lib/invitations.ts`, `lib/documents.ts`, `lib/applications.ts`,
  `lib/maintenance/read.ts`, `app/ops/page.tsx`, `app/onboarding/page.tsx`, …) — reads are unchanged by this sprint.
- **Decision: keep SELECT for `anon` and `authenticated`.** Unlike 237d, several shared helpers query `profiles` with the
  user client; a signed-out call today returns 0 rows under RLS. Revoking anon SELECT would turn that into a 42501 error on
  some path not mapped here. Reads stay exactly as today; only writes change.

## 3. Attacker evidence (2026-10-16, live, rolled back)
As the smoke **tenant** (`set local role authenticated` + JWT claims; block ends with `raise exception`):

| # | Attack | Result today |
|---|---|---|
| P1 | `update profiles set role = 'owner' where id = auth.uid()` | **1 row** (self-promotion to owner) |
| P2 | `set stripe_account_id = 'acct_ATTACKER', stripe_onboarding_complete = true, stripe_status = 'active'` | **1 row** |
| P3 | `set email = 'someone@example.com', is_tester = true` | **1 row** |
| P4 | `set stripe_customer_id = 'cus_OTHER'` | **1 row** |
| P5 | update any other profile | 0 rows (RLS) |
| — | `has_table_privilege('authenticated','public.profiles','TRUNCATE')` | **true** |

## 4. In scope
- Migration `supabase/migrations/20261021_sprint237e_profiles_grants.sql` (§6).
- Rolled-back verification run by Claude (§7).

## 5. Out of scope
- App code (`apps/**`).
- RLS policies (INSERT/UPDATE policies become inert; kept so rollback is a single GRANT).
- **Read exposure (separate follow-up):** `profiles_select_owner_for_management` lets any owner who owns at least one home
  read **every** tenant profile (email, phone, `stripe_customer_id`), not only their own tenants; `…_for_managers` does
  the same for manager profiles. Needs its own reviewed packet with a mapped read inventory.
- Other tables with default grants (follow-up from 237d).

## 6. Requirements — the migration (exact SQL; the migration runner provides the transaction)
```sql
-- Sprint 237e: profiles is written only by service_role and SECURITY DEFINER functions (handle_new_user).
-- Before (live 2026-10-16): anon=arwdDxtm, authenticated=arwdDxtm. After: anon and authenticated SELECT only.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;

do $$
declare v_acl text;
begin
  select relacl::text into v_acl from pg_class where oid = 'public.profiles'::regclass;
  if has_table_privilege('authenticated', 'public.profiles', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     or has_table_privilege('anon', 'public.profiles', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     or not has_table_privilege('authenticated', 'public.profiles', 'SELECT')
     or not has_table_privilege('anon', 'public.profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.profiles', 'INSERT')
     or not has_table_privilege('service_role', 'public.profiles', 'UPDATE')
     or not has_table_privilege('service_role', 'public.profiles', 'DELETE')
     or has_any_column_privilege('authenticated', 'public.profiles', 'INSERT,UPDATE,REFERENCES')
     or has_any_column_privilege('anon', 'public.profiles', 'INSERT,UPDATE,REFERENCES')
     or exists (select 1 from pg_attribute where attrelid = 'public.profiles'::regclass
                and attnum > 0 and attacl is not null) then
    raise exception 'sprint237e postcondition failed: %', v_acl;
  end if;
end $$;
```
- **Rollback:** `grant all on table public.profiles to anon, authenticated;`
- **Preflight (L-012):** re-read and diff against §2 — ACL exactly as listed, 0 column ACLs, 6 policies unchanged, no
  triggers, `handle_new_user` the only DB writer. Any difference → stop and re-review.

## 7. Validation (Claude, after apply)
1. Postcondition passes inside the migration.
2. Re-run P1–P4 as the smoke tenant (rolled back) → every one `42501`; a self INSERT and a self DELETE → `42501`;
   `has_table_privilege` TRUNCATE and MAINTAIN → false for `authenticated` and `anon`. Then re-read the tenant row and
   assert `role`, `email`, `is_tester`, `stripe_account_id`, `stripe_onboarding_complete`, `stripe_customer_id` equal
   their pre-test values.
2b. **Real PostgREST check:** sign in as the smoke tenant with supabase-js (anon key + `SMOKE_*` credentials from
   `apps/web/.env.local`, the same way smoke does) and `update profiles set role='owner', stripe_account_id=…,
   stripe_customer_id=…, is_tester=true where id = self` → error code `42501`; then read the row with the service role and
   assert those values are unchanged.
3. As the smoke tenant: `select role from profiles where id = auth.uid()` → 1 row (reads unchanged).
4. As `service_role`: no-op update on the smoke tenant → 1 row. A sign-up path test: `handle_new_user` still inserts
   (rolled back: insert into `auth.users` as `postgres` → exactly one profile row with that `id`, that `email`, and the
   default role `handle_new_user` assigns when no role metadata is given).
5. `npm run gate:web` green; `APP_URL=https://domusbase.com npm run smoke:web` green (owner, manager, tenant sign-in and
   pages); GitHub CI `gate` green for HEAD.
6. Live: profile name save and notification-preference toggle (both admin writes) still work; Vercel runtime logs show no
   `permission denied for table profiles`.
7. Logged-out `/`, `/login`, `/join/<id>`, `/join-llc` → 200.

## 8. Acceptance
1. Live ACL is exactly `{postgres=arwdDxtm, service_role=arwdDxtm, anon=r, authenticated=r}` (order may differ).
2. §7.2/§7.2b every write attack denied and values unchanged; §7.3 reads unchanged; §7.4 server writes and sign-up work.
3. Gate, smoke and CI green (L-019); no `profiles` permission error in production logs.

## 9. Report format
Status line, migration name + apply time, ACL before/after, §7 results 1–7 as PASS/FAIL, classification.

## 10. Constraints
- Do not apply without ChatGPT review (APPROVE / APPROVE WITH CHANGES) and the owner's yes (given 2026-10-16:
  "write the L3 packet … send it to ChatGPT review, then apply and ship").
- One transaction; postcondition must raise on mismatch. No app code, no policy edits, no other tables.
