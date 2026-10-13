# Partner & tenant ledger requirements (from the co-owner's spreadsheets) — 2026-10-11

The owner's sister (a J&MSP LLC member) keeps two Google Sheets for the jointly owned home "Mom's House" (212 Sheas Terrace). **Goal (owner, 2026-10-11): everything she gets from those sheets must be obvious in Domus, so she never feels the need to build her own spreadsheet.** This is about the kinds of information, not this specific data.

## Sheet A — tenant rent and water ledger (one home, one lease year)
What she gets from it:
- The lease term and monthly rent at a glance.
- One row per month: rent billed, the water bill passed through to the tenant, the tenant's payment, any refund, and the running balance (does the tenant owe, or have they overpaid).
- Short months jump out (highlighted), with totals at the bottom.
- A refund back to the tenant (e.g. October's water overpayment).

## Sheet B — LLC partner investment report
What she gets from it:
- Each partner's own spending on the house, by kind: cleaning and maintenance, improvements, mortgage principal, utilities, other.
- Partner-to-partner payments (e.g. one partner paid another $2,000).
- A 20% managerial fee owed to the managing partner, and proposed partner payments to even things out.
- Each partner's total put in and their % of the whole.
- The LLC bank balance, minus the security deposit being held = money that's really available.
- A list of recurring duties (monthly, annually, ad hoc) with who owns each one.

## Gap analysis (codebase, 2026-10-11)
| Need | Status | Notes |
|---|---|---|
| A1 Lease term + rent header | partial | Data exists (`leases`); the ledger report has no header. |
| A2 Monthly rows with water pass-through | partial | Running-balance ledger exists (`lib/reports-ledger.ts`). `rent_charges.category` is only rent/late_fee, and a unique `(lease_id, due_date, category)` blocks an extra charge. There's no utility category and no monthly grouping. |
| A3 Short-month highlight + totals | partial | Totals are computed but not shown; no highlight. |
| A4 Refund/credit to tenant | no | There's only reverse (void) or waive. |
| B1 Who paid which expense | no | `property_expenses` has no `paid_by` member column, no "improvement" category, and no principal/interest split. |
| B2 Partner-to-partner payments | no | — |
| B3 Managing partner fee | partial | `manager_payment_configs` has percentage fees, but only for managers, not LLC members. |
| B4 Invested total and % per partner | no | `distribution_pct` is a fixed setting, not computed. |
| B5 Bank balance − deposit held | partial | The Plaid balance is on `ownership_accounts`; deposits aren't tracked as held. |
| B6 Duties with owner + frequency | no | — |

## Proposed sprints (draft — owner to approve; most are L3: money and schema)
1. **Tenant ledger by month (A1–A4):**
   - a `utility` charge category (bill the tenant for water), with an optional link to the matching owner expense;
   - tenant credits/refunds;
   - a monthly ledger view with a lease header, a short-month flag and totals.
2. **Partner contributions (B1, B2, B4):**
   - "Who paid?" on every bill (an LLC member, or the LLC bank account);
   - an "Improvement" category and a mortgage principal/interest split;
   - partner-to-partner payments;
   - a per-partner "Put in" total and %.
3. **Managing partner fee and settling up (B3):** a member-level fee setting (e.g. 20%) and a "Who owes whom" suggestion.
4. **Available cash (B5):** deposits held per lease, and LLC balance − deposits held.
5. **Shared duties (B6):** a simple list with frequency and owner, shown to every member.

## Owner decisions (2026-10-12)
- **Order:** bank sync (Plaid live, automatic transactions) comes next, ahead of 221–223. Reason: bank connection is the adoption blocker for Alia and the siblings. The owner wants it Robinhood/Kalshi-easy: NFCU and Fidelity; Angel's Fidelity payment and the NFCU solar bill should show up in Domus without uploads. The owner would ideally move everything into one business account.
- **Managing fee:** no automatic fee calculation. The sister's fee exists because she keeps the spreadsheets and talks to the tenant; the owner expects to drop it once Domus works. "Manager fee" stays available as a manual partner-payment kind (219).
- **Settle-up:** "even" = equal shares among partners. Small add-on, later.
