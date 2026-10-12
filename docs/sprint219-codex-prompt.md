# Sprint 219 — Partners: who paid, partner payments, "Put in" report (L3: schema + money) · rev 3 (ChatGPT rev 2 = APPROVE WITH CHANGES, 3 required + 3 optional folded in; rev 1 = REJECT: attribution moved to an owner-only table; DB-enforced profile link + creator; inactive partners; projected %)

The owner decided on 2026-10-11 that the partner sprints come before Face ID. Requirements are in `docs/partner-ledger-requirements.md` (Sheet B: B1, B2, B4, plus the B3 fee entries as manual partner payments).

**Goal:** a co-owner in an LLC can see who put how much into the house, by kind, and their share, without keeping a spreadsheet.

## 1. Objective
For LLC ownership accounts:
1. **Partners list.** Each LLC has partners. A partner is either an app member (linked profile) or a named person without an account (e.g. "Yani", "Mom's Estate"). The LLC itself is the default payer ("The LLC").
2. **Who paid?** Every bill (`property_expenses`) can record which partner paid it personally. Empty means the LLC paid it.
3. **New bill category: "Improvement".**
4. **Partner payments.** These record money between a partner and the LLC, or between two partners: a reimbursement, the managing partner's fee, or a settle-up. Each has a status of `done` or `planned`.
5. **"Partners" report** on Money for an LLC (all time, or one year). For each partner it shows:
   - how much they paid, by kind (Cleaning & repairs, Improvements, Mortgage, Utilities, Other);
   - partner payments in and out;
   - their **total put in**;
   - their **% of everything put in**.
   - Planned payments show separately, as "If planned payments go through".

Personal (`individual`) accounts don't change. Managers never see partner data.

## 2. Context (HEAD = 218's commit, branch `main`)
- **Live schema (verified 2026-10-11):**
  - `property_expenses`: id, property_id, created_by_profile_id, category (CHECK in mortgage | insurance | property_tax | hoa | repair | maintenance | utility | management_fee | legal | other), description, amount_cents (> 0), expense_date, recurring, recurring_frequency, vendor_id, receipt_file_id, created_at.
    - RLS: all four commands use `can_administer_property(property_id)`, which managers pass too.
  - `ownership_accounts`: id, account_type ('individual' | 'llc'), display_name, …
  - `ownership_account_members`: account_id, profile_id, member_role, active, distribution_pct, …
  - `properties.owner_account_id`.
  - Helper `is_owner_member_of_account(uuid)`: SECURITY DEFINER; checks an active member with `member_role = 'owner'`. Use **only** this for the new tables. Do NOT use `is_creator_of_account` (L-021).
- **Live LLC "J&MSP":** members Richard Smith and Ciocia Patel, 1 home (Mom's House). The sister's sheet also has partners without accounts (Yani, Mom's Estate).
- **Code:**
  - bill create/edit/delete: `app/actions/expenses.ts` (281 lines);
  - bill form: `components/dashboard/expenses/expense-form.tsx` (120 lines);
  - bill list: `components/dashboard/expenses/expense-list.tsx`;
  - the bank-file import creates bills too (Sprint 167, `bank_transactions.expense_id`). Imported bills stay "The LLC";
  - category labels: `lib/home-money.ts` (`labels`);
  - Money page: `app/owner/money/page.tsx` plus `components/home-money/*` (Sprint 217b).

## 3. In scope
### 3.1 Migration (Codex writes the file; **Claude reviews and applies it live**)
`supabase/migrations/20261012_sprint219_partners.sql`. It must contain exactly the items below, and nothing else. **`property_expenses` gets no new column.** Partner attribution lives in an owner-only table, so managers can't read or change it.

1. **Helper functions.** Each is `SECURITY DEFINER`, `STABLE`, `SET search_path = ''`, with schema-qualified objects; each returns only a boolean.
   - `public.is_active_owner_member(p_account_id uuid, p_profile_id uuid)`: an active `member_role = 'owner'` row exists.
   - `public.expense_in_account(p_expense_id uuid, p_account_id uuid)`: the expense's `property.owner_account_id = p_account_id`, and that account is `llc`.
   - `public.is_llc_account(p_account_id uuid)`: the account exists and its `account_type = 'llc'`.
   - For both: `revoke all on function … from public, anon;` then `grant execute … to authenticated;` (RLS evaluates them as the caller).
2. **`public.account_partners` table:**
   - columns: `id uuid pk default gen_random_uuid()`, `account_id uuid not null references ownership_accounts(id) on delete cascade`, `display_name text not null check (length(trim(display_name)) between 1 and 80)`, `profile_id uuid null references profiles(id) on delete set null`, `active boolean not null default true`, `created_at timestamptz not null default now()`;
   - `unique (id, account_id)`;
   - a unique index on `(account_id, profile_id)` where `profile_id is not null`;
   - a unique index on `(account_id, lower(trim(display_name)))` where `active` (no two active partners with the same name).
3. **`public.partner_payments` table:**
   - `id`, `account_id` (references `ownership_accounts` on delete cascade);
   - `from_partner_id uuid null`, `to_partner_id uuid null`. Null means "The LLC";
   - `check (from_partner_id is not null or to_partner_id is not null)`;
   - `check (from_partner_id is distinct from to_partner_id)`;
   - `amount_cents integer not null check (amount_cents > 0)`, `paid_on date not null`;
   - `kind text not null check (kind in ('reimbursement','manager_fee','settle_up','other'))`;
   - `status text not null default 'done' check (status in ('done','planned'))`;
   - `note text null check (note is null or length(note) <= 200)`;
   - `created_by_profile_id uuid not null default auth.uid() references profiles(id)`, `created_at`;
   - composite foreign keys `(from_partner_id, account_id)` and `(to_partner_id, account_id)` → `account_partners(id, account_id)`.
4. **`public.expense_partner_attributions` table:**
   - `expense_id uuid primary key references property_expenses(id) on delete cascade`;
   - `account_id uuid not null references ownership_accounts(id) on delete cascade`;
   - `partner_id uuid not null`;
   - a composite foreign key `(partner_id, account_id)` → `account_partners(id, account_id)`;
   - `created_by_profile_id uuid not null default auth.uid() references profiles(id)`, `created_at`.
   - No row means "The LLC paid".
5. **Category:** recreate `property_expenses_category_check` as the **live definition plus `'improvement'`** (L-012: Claude diffs it against live before applying).
6. **RLS** on all three new tables (enable RLS). No anon grants, and no policies for anon.
   - **`account_partners`:**
     - select and delete: `is_owner_member_of_account(account_id)`;
     - insert and update (`with check`): `is_owner_member_of_account(account_id) and is_llc_account(account_id) and (profile_id is null or is_active_owner_member(account_id, profile_id))`.
   - **`partner_payments`:**
     - select and delete: `is_owner_member_of_account(account_id)`;
     - insert `with check`: `is_owner_member_of_account(account_id) and is_llc_account(account_id) and created_by_profile_id = auth.uid()`;
     - update `using` and `with check`: `is_owner_member_of_account(account_id) and is_llc_account(account_id)`.
   - **`expense_partner_attributions`:**
     - select and delete: `is_owner_member_of_account(account_id)`;
     - insert `with check`: `is_owner_member_of_account(account_id) and expense_in_account(expense_id, account_id) and created_by_profile_id = auth.uid()`;
     - update `using` and `with check`: `is_owner_member_of_account(account_id) and expense_in_account(expense_id, account_id)`.
   - **Grants:**
     - `grant select, insert, delete on` all three tables `to authenticated`;
     - **column-level** `grant update (display_name, profile_id, active) on account_partners`;
     - `grant update (from_partner_id, to_partner_id, amount_cents, paid_on, kind, status, note) on partner_payments`;
     - `grant update (partner_id) on expense_partner_attributions`.
     - So `created_by_profile_id`, `account_id` and `expense_id` can never be updated by clients.
7. **Backfill:** insert one `account_partners` row for each active `member_role = 'owner'` member of each `llc` account (`display_name` = the profile's `full_name`, falling back to the email prefix). Use `on conflict do nothing`.

**Deleting a bill:** deleting it (which managers may still do) cascades and removes its attribution row. That's intended: the bill is gone.

**Managers:**
- `property_expenses` policies and grants are untouched, so manager bill behavior is unchanged.
- Managers pass none of the new policies, so they can't read, add, replace or clear attribution, partners or payments.

### 3.2 Server
- **`lib/partners.ts` (new, ≤ 200 lines):**
  - `loadPartners(accountId)`;
  - `loadPartnerReport(accountId, range | 'all')`. It returns, per partner and for "The LLC":
    - `paidByKind`: `{ cleaningRepairs, improvements, mortgage, utilities, other }`;
    - `paymentsInCents`, `paymentsOutCents`;
    - `putInCents`;
    - `sharePct`;
    - plus `plannedDelta` per partner.
  - **Kind mapping:** cleaningRepairs = repair + maintenance; improvements = improvement; mortgage = mortgage; utilities = utility; other = everything else (insurance, property_tax, hoa, management_fee, legal, other).
  - **`putInCents`** = (bills they paid) + (done payments **they made**: `from_partner = them`) − (done payments **they received**: `to_partner = them`).
    - "The LLC" (null) works the same way: LLC-paid bills count toward the LLC's total.
  - **`sharePct`** = putIn ÷ the sum of the positive putIns. Show 0% for negative or zero totals, and round to whole percents.
  - **`plannedDelta`** = planned payments made − planned payments received.
  - **`projectedPutIn`** = `putIn + plannedDelta`.
  - **`projectedSharePct`** is recomputed over **all** participants, using the sum of the positive `projectedPutIn` values; ≤ 0 shows 0%.
  - **Bill attribution** comes from `expense_partner_attributions`: an expense with no row counts for "The LLC".
  - **Inactive partners:**
    - they're excluded from the "Who paid?", From and To pickers;
    - they still resolve by name on old bills and payments;
    - they appear in a report whenever they have activity in its range (All time includes any historical activity).
  - Use batched queries (`.in`) only, check every `error`, and use no query in a loop.
  - **Money math:** use integer cents only, with no floats until the final percent rounding.
  - **Dates:**
    - a range counts bills by `expense_date` and done payments by `paid_on` inside the range;
    - **All time** = everything up to and including today;
    - a done payment dated in the future isn't counted until its date.
  - **Authorization (both loaders):**
    - use the **user-scoped** Supabase client (RLS applies). There must be no service-role or admin client anywhere in `lib/partners.ts`;
    - first verify that the caller is authenticated, is an active owner member of `accountId` (`is_owner_member_of_account` through RPC, or the members table via RLS), and that the account is `llc`;
    - otherwise return `{ ok: false, error: "not_allowed" }`;
    - fail closed on any auth or DB error.
- **`app/actions/partners.ts` (new):**
  - `addPartner(accountId, displayName)`, `renamePartner`, `deactivatePartner`;
  - `addPartnerPayment(...)`, `updatePartnerPayment(...)` (including marking it `done`), `deletePartnerPayment(id)`.
  - Every action follows AGENTS.md §3: auth → role owner → `is owner member of accountId` (server check, plus RLS) → zod validation → mutation with the error checked → `revalidatePath`.
  - Return `{ ok: false, error }` with plain-language messages, never a silent return.
  - A unique-name violation on add or rename returns "Someone in this LLC already has that name."
  - Partner writes use the **user-scoped** client, so RLS applies.
- **`app/actions/expenses.ts`:** the bill create and update path is **unchanged**. It never touches attribution.
- **New action `setExpensePaidBy(expenseId, partnerId | null)`** in `app/actions/partners.ts`:
  - it follows AGENTS.md §3 (auth → owner → owner member of the expense's LLC account);
  - it validates that the partner is active and in the same account. Otherwise it returns "Pick someone from this LLC.";
  - it upserts (partner) or deletes (null) the `expense_partner_attributions` row through the **user-scoped** client, and checks the error;
  - it's idempotent, so calling it twice gives the same single row.
- **Bill form flow (retry-safe):**
  1. Save the bill with the existing action, and keep the returned expense id.
  2. If "Who paid?" isn't "The LLC", call `setExpensePaidBy(id, partnerId)`.
  3. If step 2 fails, show "We saved the bill but not who paid. Try again." with a **Try again** button. That button retries **only** `setExpensePaidBy` for the same id; it never creates the bill again.
  4. Editing a bill calls `setExpensePaidBy` with the new choice, or null for The LLC.
  - If the existing create action doesn't return the new id, extend its success result with `expenseId`. That's the only change to `expenses.ts`.
- Managers and personal-account homes never see "Who paid?", and never call `setExpensePaidBy` (the server also rejects them).

### 3.3 UI (Wallet look, phone first)
1. **Bill form:** for homes owned by an LLC (owner members only), add a "Who paid?" select.
   - Options: "The LLC (from its bank)" (the default), each active partner, and "+ Add a person".
   - "+ Add a person" opens an inline name field; saving it calls `addPartner` and selects the new person.
   - Add "Improvement" to the category select.
2. **Bill list rows:** show "Paid by <name>" muted, for owner members only (from `expense_partner_attributions`). Managers never load it.
3. **Money (`/owner/money`):** when every selected home belongs to one LLC (or a single LLC home is selected), and the viewer is an owner member, show a **Partners** card under the category card. It holds:
   - "Who put in what · <period>": the period follows the switch. "2026" is the year; month views show that month. Add one more segment-independent link, "All time".
   - **One row per partner** (the LLC first, then by name): name, "Put in $X", and "Y%".
     - Tapping a row expands its kinds (Cleaning & repairs, Improvements, Mortgage, Utilities, Other) and "Payments in" / "Payments out".
   - If there are planned payments: a muted line, "If planned payments go through:", with each partner's new total and %.
   - **Buttons:** "Add a payment" opens a sheet with From (The LLC or a partner), To, Amount, Date, Kind ("Paid back", "Manager fee", "Settle up", "Other"), "Done" vs "Planned", and Note. "Manage partners" opens a sheet to add, rename or remove a person.
4. Mixed-account or personal-only views show no Partners card.

## 4. Out of scope
- Tenant ledger, water billing, refunds (the next sprint).
- Deposits held and available cash.
- A duties list.
- Automatic fee calculation.
- Mortgage principal/interest split.
- Changing distributions or payouts.
- Stripe.
- Manager views.

## 5. Exact files expected to change
- `supabase/migrations/20261012_sprint219_partners.sql` (new)
- `apps/web/lib/partners.ts` (new), `apps/web/app/actions/partners.ts` (new)
- `apps/web/app/actions/expenses.ts` (only to return `expenseId` on create, if it doesn't already)
- `apps/web/lib/home-money.ts` (only the `improvement` label)
- `apps/web/lib/validations*.ts` (only the expense schema plus the new partner schemas)
- `apps/web/components/dashboard/expenses/expense-form.tsx`, `expense-list.tsx`
- `apps/web/components/home-money/partners-card.tsx`, `partner-payment-sheet.tsx`, `manage-partners-sheet.tsx` (new, each ≤ 200 lines)
- `apps/web/app/owner/money/page.tsx` (load the report when the conditions hold)
- `apps/web/lib/database.types.ts` or the equivalent generated types, if the repo keeps one (add the new columns and tables by hand to match the migration)
- Tests: new ones for `partners.ts`, `actions/partners.ts`, the expense action changes, and the three components; updates to the existing expense tests.

## 6. Implementation requirements
- Lines ≤ 140 characters; new files ≤ 200 lines; no file over 500.
- Use tokens only, with 44px targets, labels on every field, and contrast ≥ 4.5:1 in light and dark.
- Money uses `.num` tabular numbers. Percents are whole numbers.
- Check every Supabase `error` (L-002). No query inside a loop.
- Copy, exactly:
  - "Who paid?"
  - "The LLC (from its bank)"
  - "+ Add a person"
  - "Improvement"
  - "Paid by <name>"
  - "Partners"
  - "Who put in what"
  - "All time"
  - "Put in"
  - "Payments in"
  - "Payments out"
  - "If planned payments go through:"
  - "Add a payment"
  - "Manage partners"
  - "From"
  - "To"
  - "Amount"
  - "Date"
  - "Kind"
  - "Paid back"
  - "Manager fee"
  - "Settle up"
  - "Other"
  - "Done"
  - "Planned"
  - "Note"
  - "Pick someone from this LLC."
  - "We saved the bill but not who paid. Try again."
  - "Someone in this LLC already has that name."
  - "Cleaning & repairs"
  - "Improvements"
  - "Mortgage"
  - "Utilities"
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.
- **Invariants:**
  - Personal-account bills, bank-file imports, the Money totals and "Left after bills" are unchanged. `paid_by` doesn't change any existing number; it only attributes.
  - Managers' bill create/edit behavior is unchanged.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`
- Run `rm -rf apps/web/.next` first if tsc reports " 2" duplicates.
- Don't apply the migration or run `gate:web`.

## 8. Acceptance criteria (binary; each one needs a named test that calls real code)
1. **`loadPartnerReport`:**
   - (a) the kind mapping (each of the 5 kinds);
   - (b) `putIn` = bills paid + done payments made − done payments received, including "The LLC";
   - (c) `sharePct` rounds and gives 0% for non-positive totals;
   - (d) planned payments affect only `plannedDelta` / `projectedPutIn`. The projected % is recomputed over all participants, including a denominator change and a participant crossing to ≤ 0;
   - (e) a range filters bills by `expense_date` and payments by `paid_on`;
   - (f) a query error → `{ ok: false }`;
   - (g) **conservation:** for done payments between any two participants (including The LLC), the sum of all `putIn` values is unchanged;
   - (h) **inactive partners:** an inactive partner with activity in the range appears in the report, and one without activity doesn't; All time includes historical activity; names still resolve on old bills.
   - (i) **loader authorization:** a manager, a tenant, an unrelated owner, an unauthenticated caller and an individual-account owner each get `not_allowed`, with no partner data, for both loaders;
   - (j) **dates:** All time excludes a done payment dated in the future, and range filtering works;
2. **Partner actions:**
   - (a) a non-owner-member gets an error for each action;
   - (b) validation: name 1–80 characters, amount > 0, from ≠ to, not both null;
   - (c) `deletePartnerPayment` only deletes that row;
   - (d) every mutation checks its `error`.
3. **Expenses and `setExpensePaidBy`:**
   - (a) a partner from another account → "Pick someone from this LLC.";
   - (b) a personal-account home is rejected;
   - (c) a manager caller is rejected;
   - (d) "improvement" is accepted;
   - (e) **retry-safe:** the bill saves, then attribution fails, then "Try again" succeeds. Exactly one bill exists, `create` was called once, and one attribution row exists;
   - (f) `setExpensePaidBy` is idempotent;
   - (g) the existing bill create and update tests are unchanged and pass.
4. **UI:**
   - (a) "Who paid?" shows only for LLC homes, for owner members, and lists only active partners;
   - (b) "+ Add a person" adds and selects;
   - (c) the Partners card shows the LLC first, with put in and %;
   - (d) a row expands into its kinds;
   - (e) the planned line appears only when there are planned payments;
   - (f) the card is hidden for mixed or personal views.
5. **Migration file text test:**
   - RLS is enabled on all 3 tables;
   - it has no `is_creator_of_account`;
   - it has no grants to anon;
   - `property_expenses` gets no new column;
   - the 3 helpers use `search_path = ''` and revoke from public and anon;
   - `is_llc_account` appears in the insert and update checks of `account_partners` and `partner_payments`;
   - there are column-level update grants;
   - it has the composite foreign keys;
   - the category check includes all 10 live values plus `improvement`.
   - **(Claude separately runs live attacker SQL as `authenticated` for:**
     - a manager adding, replacing, clearing or reading attribution, partners and payments;
     - an owner linking `profile_id` to an unrelated profile;
   - an **individual-account owner** inserting or updating `account_partners` and `partner_payments` for their own account;
     - a spoofed `created_by_profile_id`;
     - a cross-account expense/partner pair.
     - All must fail.**)**
6. Lint, typecheck, the full suite and the build are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with the test names mapped to §8. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- **Don't apply the migration** or touch the live DB (Claude applies and verifies it, including an attacker simulation as `authenticated` per L-021).
- No deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or any "* 2.*" files.
- Don't invent copy beyond what's specified here.
