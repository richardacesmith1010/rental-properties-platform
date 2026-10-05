# Bank feed — design (APPROVED by owner 2026-10-05)

Mockup: https://claude.ai/artifact/Wp4XfbAcPvXTXmiGyY1FwU (boards: Daily "Money to check" (interactive), Monthly profit + alerts, Connect bank / upload statement, 1st Home ledger).

## Goal
Owner opens Domus daily and sees every rental dollar sorted automatically: Angel's Fidelity rent recorded against his lease, the solar and ISPC water bills filed as 1st Home expenses, a per-home ledger, monthly profit, and alerts — without Angel using Domus.

## Owner answers (2026-10-05)
- Rental money moves through a **personal account mixed with personal spending**; banks: **Fidelity + a credit union**.
- Matching: **ask once, then automatic** ("Always do this").
- Daily view wants: to-do list of new items, per-home ledger, monthly profit per home, alerts for surprises.

## Privacy model (non-negotiable)
- Read-only access; Domus can never move money.
- Only **rental** items are stored (matched by a rule or confirmed by the owner). Personal items are **not stored**; Domus keeps only a one-way fingerprint (hash of account + date + amount + description) so it never asks twice. A "Not rental" answer can become a rule too (e.g. "never ask about this payee").
- Owner can delete the connection and all imported data at any time.

## How it works
1. **Sources (same pipeline):**
   - Phase 1 — **Statement upload (CSV)** from Fidelity / credit union. Works immediately, no third-party approval.
   - Phase 2 — **Plaid daily sync** (`/transactions/sync` + webhook or daily cron). Requires Plaid production access. Fidelity: Plaid announced Fidelity support in Aug 2026 (access may need to be requested in the Plaid Dashboard; Fidelity CMA may need micro-deposits). Credit union: check coverage by name during setup.
2. **Normalize** each row → {date, amount, direction, description, account}.
3. **Match** in order: owner rules → built-in suggestions (incoming amount ≈ an active lease's rent within ±7 days of the due day → that lease's rent; recurring outgoing payee seen ≥2 months → suggest a bill type) → otherwise ask, or skip if it looks personal and no rule matches.
4. **File:** rent → a payment on that lease's charge for that month (method "ach", note "Fidelity", backdated to the deposit date; works with "pays outside Domus" leases); bills → a property expense with a category (add `solar`, `loan`, `water` as needed).
5. **Review queue** ("Money to check"): one-tap Yes / Not rental, with "Always do this".
6. **Views:** owner Home card, per-home ledger (in/out/running balance, tax download), monthly profit, alerts (late rent = no matching deposit by the grace day; bill ≥ 30% above its 3-month average).

## Data (new, L3 — migration designed and applied by Claude)
- `bank_connections` (owner account, source `plaid|upload`, institution, status, Plaid item id + encrypted access token, cursor).
- `bank_accounts` (connection, mask, name, type).
- `bank_transactions` — **rental items only** (account, external id unique, date, amount, direction, description, property, kind rent|expense|other, link to payment / expense, matched_by rule|owner).
- `bank_skipped_fingerprints` (account, fingerprint unique) — personal items, no amounts or text stored.
- `bank_rules` (owner account, match: payee text / amount range / direction / day window; action: rent for lease X | expense type Y for property Z | skip).
- RLS: owner-account members only; service role for sync.

## Phases (each a sprint; L3 where money/auth/schema)
1. **Schema + CSV upload + matching + review queue + file rent/expense** (L3, ChatGPT review). Owner can use it monthly right away.
2. **Ledger, monthly profit, alerts** (L2).
3. **Plaid production daily sync** (L3) — after the owner's Plaid production approval (+ Fidelity access request).

## Owner actions needed
- Phase 1: download one month of activity CSV from Fidelity and from the credit union (to build the importers against real formats). Claude will not need your login.
- Phase 3: apply for Plaid production access (Plaid Dashboard) and request Fidelity; Claude can open the pages and fill everything except identity/business details.

## Real bank patterns (owner screenshots, 2026-10-05; rental items only)
- Money path: Angel (Navy Federal) → **Fidelity** deposit "DIRECT DEPOSIT NFCU ACH P2P ANGEL J HERNAND…" +$2,350 (Oct 2) → Fidelity "Electronic Funds Transfer Paid" −$2,350 (Oct 5) → **Navy Federal checking** "Deposit / ACH Credit" +$2,350.
- **Count rent once:** the Fidelity deposit from Angel is the rent. The Fidelity EFT out and the matching NFCU ACH credit (same amount, within 5 days) are a **transfer between the owner's own accounts** and must be skipped automatically, never counted as income or expense.
- Bills paid from Navy Federal checking: "Transfer To Mortgage" −$1,039.44 (1st, NFCU category Mortgages); "Payment to Solar Servicing" −$266.40 (~14th, Loans); "- Ispc XX0028" −$92.00 (~16th, Other Expenses).
- Look-alike to never match as rent: the owner's own apartment rent goes out from the same checking (~$2,280). Only incoming money can match a lease.
- Unconfirmed (ask the owner): xfinity −$81.81, a pest-control charge −$59.99.
- Rough October profit for 1st Home: $2,350 − $1,039.44 − $266.40 − $92.00 = **$952.16** (before any unconfirmed bills).

## Open questions
- Is xfinity / pest control for 1st Home or personal?
- Should the J&MSP LLC account get its own feed later? (Out of scope for now.)
