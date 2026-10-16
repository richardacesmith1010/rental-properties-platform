# Sprint 237f — Narrow who can read `profiles` (L3: privacy/auth/schema) — rev 2 (rev 1 ChatGPT APPROVE WITH CHANGES: 5 REQUIRED + 4 OPTIONAL adopted)

Migration-only sprint. **Claude** writes and applies the migration (CLAUDE.md §1). **Codex writes no app code.**
Follows Sprint 237e (`profiles` writes locked, `e7fc4c8`).

## 1. Objective
Today any owner who owns at least one home can read **every** tenant profile and **every** manager profile in Domus
(name, email, phone, `stripe_customer_id`, Stripe fields), not just people on their own homes. Replace the two broad
SELECT policies with one policy: a signed-in user sees their own profile, tenants who have (or had) a lease on a home they
administer, and managers assigned to a home they administer.

## 2. Context
- HEAD `d13053b` (main). Supabase `vawqdqkaguhdgfhdebqw`, PostgreSQL 17. 35 profiles. Audit 2026-10-16.
- **Live SELECT policies on `profiles`** (all roles `{public}`):
  - `profiles_select_self`: `auth.uid() = id` — **kept**.
  - `profiles_select_owner_for_management`: `role = 'tenant' AND EXISTS (properties p WHERE p.owner_profile_id =
    auth.uid())` — **any** tenant, for any owner with any home.
  - `profiles_select_owner_for_managers`: same with `role = 'manager'`.
  The second and third ignore which home the tenant/manager belongs to, and use the legacy `owner_profile_id` (LLC
  co-owners and account members are not covered at all).
- **Grants after 237e:** anon/authenticated SELECT only; service_role all.
- **Existing helper reused:** `public.can_administer_property(uuid)` (SECURITY DEFINER, `search_path=''`): active owner
  member of the home's account, OR active `property_managers` row (client accounts also need an active
  `ownership_account_managers` row), OR creator of the home's account.
- **Exposure proven (live, rolled back):** as the smoke owner (2 related tenants, 1 related manager) →
  `visible_tenants=14`, `visible_managers=4`, including 1 tenant with a `stripe_customer_id`.
- **User-client readers of other people's profiles** (full code map 2026-10-16; everything else uses the service role or
  reads only the viewer's own row):

  | # | Site | Needs | Viewer |
  |---|---|---|---|
  | 6 | `lib/invitations.ts:229` `getTenantInviteOnboardingContext` | inviter (owner/manager) `full_name, email` | new tenant |
  | 7 | `lib/applications.ts:144` `getApplicationsForUser` | reviewers/actors `id, email` (co-owners, managers) | owner, manager |
  | 8 | `lib/charge-generation.ts:348` via `app/owner/generate/route.ts` (user client) | tenants of late leases `id, email` | owner, manager |

  #6 already returns nothing today (no policy lets a tenant read an owner/manager) — unchanged by this sprint, not a
  regression. #7 co-owners are not visible today either — unchanged. #8 is covered by the new policy (and managers gain it,
  which today returns nothing for them). Own-row readers (`lib/auth.ts`, `lib/partners.ts`, `lib/documents.ts`,
  onboarding, ops) are covered by `profiles_select_self`.
- **Dry run (live, rolled back) of §6 for every profile as viewer:** owners 19 → 1–4 visible rows each; managers 1 → 2–3
  (their homes' tenants); tenants unchanged; **related rows lost = 0** for every owner/manager under any ownership signal
  (legacy `owner_profile_id`, account owner membership, account creator, active manager).

## 3. In scope
- Migration `supabase/migrations/20261022_sprint237f_profiles_read_policy.sql` (§6).
- Rolled-back verification run by Claude (§7).

## 4. Out of scope
- App code. INSERT/UPDATE policies (inert since 237e). Grants.
- Letting a new tenant read their inviter (#6) — a new access path; separate decision.
- Co-owner visibility for #7 — unchanged; separate decision.

## 5. Exact files
1. `supabase/migrations/20261022_sprint237f_profiles_read_policy.sql` (new)

## 6. Requirements — the migration (exact SQL; the migration runner provides the transaction)
```sql
-- Sprint 237f: a signed-in user may read their own profile, CURRENT tenants who have/had a lease on a home they
-- administer (historical leases intentional: rent history needs past tenants), and CURRENT managers with an ACTIVE
-- assignment on a home they administer (inactive assignments intentionally excluded). Replaces two policies that
-- exposed every tenant/manager to any owner. Nested SECURITY DEFINER helpers run as postgres (no FORCE RLS on the
-- tables they read), so nothing recurses into profiles RLS.
create function public.can_view_profile(p_profile_id uuid, p_role text)
returns boolean
language sql stable security definer set search_path = ''
as $f$
  select p_profile_id = auth.uid()
    or (p_role = 'tenant' and exists (
      select 1 from public.leases l join public.units u on u.id = l.unit_id
      where l.tenant_profile_id = p_profile_id and public.can_administer_property(u.property_id)))
    or (p_role = 'manager' and exists (
      select 1 from public.property_managers pm
      where pm.manager_profile_id = p_profile_id and pm.active = true
        and public.can_administer_property(pm.property_id)));
$f$;
revoke execute on function public.can_view_profile(uuid, text) from public, anon;
grant execute on function public.can_view_profile(uuid, text) to authenticated, service_role;

drop policy profiles_select_owner_for_management on public.profiles;
drop policy profiles_select_owner_for_managers on public.profiles;
create policy profiles_select_related on public.profiles
  for select to authenticated using (public.can_view_profile(id, role));

do $$
declare v_fn oid := 'public.can_view_profile(uuid, text)'::regprocedure; v_adm oid := 'public.can_administer_property(uuid)'::regprocedure;
begin
  -- exactly two SELECT-capable policies, both the intended ones, both permissive
  if (select count(*) from pg_policy where polrelid = 'public.profiles'::regclass and polcmd in ('r', '*')) <> 2
     or not exists (select 1 from pg_policy where polrelid = 'public.profiles'::regclass and polname = 'profiles_select_self'
                    and polcmd = 'r' and polpermissive and pg_get_expr(polqual, polrelid) = '(auth.uid() = id)')
     or not exists (select 1 from pg_policy where polrelid = 'public.profiles'::regclass and polname = 'profiles_select_related'
                    and polcmd = 'r' and polpermissive and polroles = array['authenticated'::regrole]::oid[]
                    and pg_get_expr(polqual, polrelid) = 'can_view_profile(id, role)')
     -- helper: definer, owner postgres, empty search_path, stable, boolean, execute only authenticated/service_role
     or not (select prosecdef and proowner = 'postgres'::regrole and provolatile = 's' and prorettype = 'boolean'::regtype
               and proconfig = array['search_path=""'] from pg_proc where oid = v_fn)
     or has_function_privilege('anon', v_fn, 'execute')
     or not has_function_privilege('authenticated', v_fn, 'execute')
     or not has_function_privilege('service_role', v_fn, 'execute')
     or exists (select 1 from aclexplode((select proacl from pg_proc where oid = v_fn)) a where a.grantee = 0)
     -- dependency unchanged in the properties we rely on
     or not (select prosecdef and proowner = 'postgres'::regrole and proconfig = array['search_path=""'] from pg_proc where oid = v_adm)
     -- no FORCE RLS on tables the helpers read
     or exists (select 1 from pg_class where oid in ('public.leases'::regclass, 'public.units'::regclass,
                 'public.property_managers'::regclass, 'public.properties'::regclass, 'public.ownership_accounts'::regclass,
                 'public.ownership_account_members'::regclass, 'public.ownership_account_managers'::regclass)
                 and relforcerowsecurity) then
    raise exception 'sprint237f postcondition failed';
  end if;
end $$;
```
- **Rollback:** `drop policy profiles_select_related on public.profiles;` then recreate the two old policies with their
  exact §2 expressions; `drop function public.can_view_profile(uuid, text);`.
- **Intentional semantics (rev 2):** historical tenants stay visible (rent history, receipts); managers are visible only
  while their assignment is active; both branches require the target's **current** `profiles.role` (passed from the row),
  so a role-changed profile is not exposed through an old FK row. Own row is always visible.
- **Safety facts checked 2026-10-16:** `can_administer_property` SECURITY DEFINER, owner postgres, `search_path=""`; no
  FORCE RLS on `leases`, `units`, `property_managers`, `properties`, `ownership_accounts`, `ownership_account_members`,
  `ownership_account_managers`; indexes on `leases(tenant_profile_id)`, `leases(unit_id)`,
  `property_managers(manager_profile_id)`, `property_managers(property_id, …)`, `properties(owner_account_id)`.
- **Preflight (L-012):** SELECT policies exactly as §2; `can_administer_property` definition unchanged since 2026-10-16.

## 7. Validation (Claude, after apply; all rolled back)
1. Postcondition passes.
2. As the smoke owner: `visible_tenants` = number of distinct tenants with a lease on their homes, `visible_managers` = their
   homes' managers; a named unrelated tenant (another owner's tenant) → 0 rows; `stripe_customer_id` of an unrelated tenant
   unreadable.
3. **Exact sets** for every profile as viewer: compute the expected set independently with explicit joins (self ∪
   current tenants with any lease on a home where the viewer is an active owner member / account creator / active manager
   (client accounts: plus active `ownership_account_managers`) ∪ current managers with an active assignment on such a
   home) and assert actual = expected in both directions (no missing, no unexpected rows). Tenants still read only self.
3b. Inactive-manager negative case (rolled back): set one walk manager assignment `active = false` → the owner no longer
   sees that manager (unless another active assignment exists); re-activate.
3c. EXPLAIN (ANALYZE) of `select id from profiles` as the smoke owner — record the plan and time.
4. As the smoke manager: sees own homes' tenants; an unrelated tenant → 0 rows.
5. As anon: 0 rows, no error.
6. Real PostgREST: smoke owner signed in with supabase-js → `select id from profiles where role='tenant'` returns exactly the
   related tenants.
7. `APP_URL=https://domusbase.com npm run smoke:web` green (owner, manager, tenant); GitHub CI `gate` green; Vercel logs show
   no new `profiles` errors. Live walk: owner Rent / Tenants list and manager Rent show tenant names.

## 8. Acceptance
1. Old policies gone, new policy present, helper SECURITY DEFINER, anon cannot execute it.
2. §7.2–7.6 pass; no related row lost for any viewer.
3. Smoke, CI green; tenant names still shown on owner/manager pages.

## 9. Report format
Status line, migration name + apply time, policy list before/after, §7 results as PASS/FAIL, classification.

## 10. Constraints
- Owner approved writing, reviewing, applying and shipping (2026-10-16). Apply only after ChatGPT APPROVE / APPROVE WITH
  CHANGES. One transaction; postcondition must raise. No app code; no other tables.
