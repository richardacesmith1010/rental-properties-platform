# Manager-run homes ("client accounts") — design (rev 3, 2026-10-08; ChatGPT: rev 1 and rev 2 APPROVE WITH CHANGES, all adopted; "close to implementation-ready")

**Owner decision (2026-10-08):** Alia (property manager) will run homes for owners who are **not** on Domus, by herself. Alia uses Domus for free.

## 1. Problem (verified in code + live DB)
- `createProperty` (`app/actions/properties.ts`) lets managers add homes. With no `ownerAccountId`, it calls `getOrCreateIndividualOwnershipAccount(manager)`, which creates an **individual ownership account with the manager as an `owner` member**, and sets `properties.owner_profile_id = manager`.
- Result: a client's home is recorded as **owned by Alia**. There's no record of the real owner. All of Alia's clients would be mixed into one "Alia" account. When a real owner later joins, there's no clean handover. And owner-only data (tax summary, bank feed) would be Alia's.
- `ownership_accounts.account_type` is constrained to `individual | llc`.

## 2. Concept
A **client account** is an ownership account that represents one off-Domus owner, run by a manager.
- `ownership_accounts.account_type` gains `'client'`, with `client_name text not null` and `client_email text` (optional, contact only, **not** a login).
- **No owner members** while unclaimed. The manager who created it is linked through a new table `ownership_account_managers(account_id, manager_profile_id, role in ('creator','manager'), active, created_at)`, PK `(account_id, manager_profile_id)`.
- Homes in a client account have `owner_account_id = client account`. For `owner_profile_id` (NOT NULL, legacy, used by a few RLS policies via `p.owner_profile_id = auth.uid()`): keep it = the creating manager while unclaimed, and transfer it to the real owner on claim (§5). Audit those policies so the creator-manager gets **manager-level** rights, not owner-only data (§4).

## 3. What Alia can do in a client account (v1)
| Area | v1 |
|---|---|
| Create client (name, optional email), rename | ✅ |
| Add homes/units, leases, invite tenants, repairs, messages, documents | ✅ (same screens, scoped to the client) |
| Rent tracking | ✅ **outside Domus by default**: leases in client accounts default to `collects_outside_domus = true`; Alia records payments ("Mark paid") |
| Online rent payments (Stripe) | ❌ v1. Money must reach the real owner's bank; that needs the owner to claim and connect (§5) |
| Expenses, reports (rent roll, monthly P&L), receipts | ✅ for her clients |
| **Monthly owner statement** (PDF/CSV per client: rent collected, expenses, net, open balances) | ✅ new. Property managers send this to owners monthly; the scorecard already lists it |
| Owner-only tools (tax summary, bank feed, LLC votes, payouts, wipe) | ❌ hidden for client accounts |
| Manager pay / fees from the client | ❌ v1 (later) |

## 4. Permissions
- New SQL helper `is_client_account_manager(account_id)` (active row in `ownership_account_managers` for `auth.uid()`). `can_administer_property` gets a branch: the property's account is a client account **and** the user is its active manager. The existing `property_managers` assignment is also created per home (so all current manager screens keep working unchanged).
- `canUserAdministerOwnershipAccount` (TS) returns true for active client-account managers, **only** for actions that make sense for a manager (create home, rename client, statements). Owner-only actions check `member_role = 'owner'` membership and therefore stay closed.
- Policy audit for the 6 RLS policies that use `owner_profile_id`: ensure the creator-manager doesn't gain owner-only reads (e.g. tax inputs use owner **membership**, already safe).
- Tenants see nothing different.

## 5. Claim (owner joins later) — v1.1, designed now so v1 doesn't block it
Alia presses "Invite owner" on a client → the existing owner-invite flow with `ownership_account_id = client account` → the owner signs up → becomes an `owner` member; `account_type` changes `client → individual`; `properties.owner_profile_id` for its homes changes to the new owner; Alia stays an active manager (`property_managers` + `ownership_account_managers`). The owner can then connect Stripe and turn on online rent. All in one transaction (SQL function, service role).

## 6. UX (manager)
- New manager nav item **Clients** (under "Homes you manage"): list of clients with home count and this month's rent collected/owed; **Add client** (name, optional email).
- Add-home wizard (manager): first step **"Whose home is this?"** → pick a client or **Add a new client** (inline). Never silently creates a personal account for a manager again.
- Each client page: homes, rent status, **Owner statement** button (month picker → PDF + CSV).
- Section filter "Show: All homes" gets client grouping.

## 7. Data migration (existing)
Find manager-created personal accounts (account owned by a profile whose `role = 'manager'`). Today these are smoke/test data only (verify live). Leave them, but stop creating new ones (§6).

## 8. Tests (high level)
Manager creates client + home (account type client, no owner members, manager linked, `collects_outside_domus` default); another manager can't see/edit it; owner-only tools hidden and refused server-side for client accounts; P&L/rent roll/statement scoped to the client; statement numbers equal the underlying records; creating a home never auto-creates a personal account for a manager; tenant flows unchanged; (v1.1) claim transfers ownership atomically and keeps the manager.

## 10. Rev 2 changes (required by review)
1. **No false owner on client homes.** `properties.owner_profile_id` becomes **nullable**; for homes in a client account it is **NULL** while unclaimed and set to the real owner on claim. Invariant: *`owner_profile_id` never grants owner authority for a property whose account is a client account.* Every RLS policy and TS check that reads `owner_profile_id` is updated (audit list in the implementation packet), and code that assumes it's non-null is fixed.
2. **Central capability matrix** (one SQL function `has_property_capability(property_id, capability)` + one TS mirror used by server actions), instead of widening `can_administer_property`:

   | Capability | Owner member | Client-account manager | Assigned manager (owner's home) |
   |---|---|---|---|
   | view_operations (homes, units, leases, tenants, repairs, messages) | ✅ | ✅ | ✅ |
   | manage_operations (edit the above, invite tenants) | ✅ | ✅ | ✅ (as today) |
   | record_payments (mark paid, record payment) | ✅ | ✅ | ✅ (as today) |
   | view_finance_reports (rent roll, P&L, owner statement) | ✅ | ✅ (own clients) | as today |
   | owner_only (tax summary/inputs, bank feed, payouts, LLC votes, Stripe Connect, wipe, transfer) | ✅ | ❌ | ❌ |
   | manage_client_account (rename client, add home, invite owner to claim) | — | ✅ (creator/manager) | ❌ |

3. **Database-level enforcement.** RLS for the affected tables calls `has_property_capability`; the server checks are a second layer, not the only one.
4. **One source of manager authority.** `ownership_account_managers` is the source for client accounts. Per-home `property_managers` rows are **derived** (created/ended by the same SQL function that adds a home or changes the client manager, in one transaction), never edited separately for client homes. A consistency test asserts they match.
5. **Wording:** "Payments recorded" (not "rent collected") in client lists and statements.
6. **Negative tests:** Client A operations never include Client B data (lists, reports, statements, CSV, search, notifications); another manager can't see or edit a client; a manager can't call owner_only actions on a client home (server and RLS).
7. **Claim safety:** add `claimed_at`, `claimed_by_profile_id`, `created_by_profile_id` (original creator) on `ownership_accounts`; the claim function locks the account row, checks it's still a client account, and is idempotent. Race tests: double claim, claim vs. manager adding a home.

## 11. Rev 3 changes (required by review of rev 2)
1. **Ownership type vs. claim state.** Keep `account_type in ('individual','llc')` for the legal owner type and add `claim_state in ('claimed','unclaimed')` (default `'claimed'` for existing rows) plus `managed_client boolean`. A client account is `managed_client = true`; `claim_state = 'unclaimed'` until an owner claims. Alia picks Individual or LLC when adding a client. (Replaces the `account_type = 'client'` idea in §2.)
2. **Stripe blocked for unclaimed clients, independently of the UI:** Connect onboarding, online checkout, autopay setup, payouts and distributions refuse when the property's account is `unclaimed` (server checks, plus a DB check in the RPCs/policies that create Stripe-linked rows). Tested directly, including privileged server actions.
3. **Owner statement rules (cash basis, v1):** month = calendar month in the property's time zone (America/Denver default). "Payments recorded" = payments with `paid_at` in the month (any method), minus reversals in the month. Late fees count when paid. Waived rent is listed but not counted. Security deposits are listed separately and not counted as income. Expenses = `property_expenses` with `expense_date` in the month. "Net" = payments recorded − expenses. Open balances = unpaid charges due on or before month end. Tenant "I paid" reports are **never** counted until marked paid. PDF and CSV come from one function and must equal the canonical records (reconciliation test).
4. **Account-level permission check:** `has_account_capability(account_id, capability)` for create client, rename, add/remove client manager, invite owner/claim, membership changes, and account deletion. The property-level helper is never used for these.
5. **Locking and claim validation:** "add home to client" and "claim" both lock the `ownership_accounts` row first (same lock order). Claim validates the invitation (intended account, not expired or revoked, claimant email matches) inside the transaction. Derived `property_managers` rows never grant access after the account-manager link is deactivated (checked in the capability function, not only by row state). `created_by_profile_id` is audit metadata only, never an entitlement.
6. Carried forward from rev 1: capability matrix, DB enforcement, negative cross-client tests, claim race tests, claim audit fields.

**Status:** design accepted for implementation planning. Each implementation sprint is L3 with its own ChatGPT packet review.

## 9. Open decisions for the owner
1. v1 = **rent outside Domus only** for client homes (recommended; online rent needs the real owner's bank)?
2. Is the **monthly owner statement** in v1 (recommended: yes, it's what Alia's clients expect)?
3. Build "Invite owner to claim" now, or later (recommended: later, v1.1)?
