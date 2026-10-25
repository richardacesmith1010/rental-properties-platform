---
name: risk-review
description: Red-team pre-mortem for a Domus feature area, launch stage or vendor change — parallel persona agents (plaintiff's lawyer, state AG, card-network auditor, Apple reviewer, IRS auditor, trademark counsel, fraudster, tenant advocate) find what could get us sued, fined, rejected or charged back, with primary sources; Claude verifies against code and live data and updates the rules map. Use before building any feature that touches money, contracts, personal data, housing, identity, messaging or the brand, and before every stage gate.
---

# Risk review (CLAUDE.md §4b)

Goal: find the "unknown unknowns" before customers do. Correctness tests can't see a rule nobody wrote down (L-037).

## 1. Frame it (2 minutes)
Write a short brief: the feature or stage, what it does today (file paths), which states have users' homes
(query `properties.state`), money flows (Stripe charge type, who holds funds), data collected, and vendors involved.
Pre-mortem question: **"It is 12 months later. This got Domus sued, fined, delisted, charged back, or embarrassed. Why?"**

## 2. Run the personas in parallel
Launch one background `Agent` per relevant persona (skip ones that clearly don't apply). Each gets the brief and must:
cite primary sources it actually opened (statutes, rules, regulator pages, vendor terms, USPTO records), give a severity
(critical/high/medium/low) and confidence, and name the concrete product or document change. ≤ 900 words each.

| Persona | Hunts for |
| --- | --- |
| Plaintiff's lawyer | Consumer-protection claims, landlord-tenant violations, contract formation (clickwrap), liability caps that fail |
| State Attorney General | Deceptive fees and pricing (e.g. C.R.S. 6-1-737), unfair practices, breach-notice duties, licensing |
| Card-network / ACH auditor | Surcharge and convenience-fee rules, debit rules, NACHA returns, Reg E, disputes, merchant-of-record |
| Apple App Reviewer | App Review Guidelines (payments 3.1, privacy 5.1, entity 5.1.1(ix), account deletion), privacy label accuracy |
| IRS / tax auditor | 1099-K/TPSO duties, record retention, sales tax on subscriptions, nexus |
| Trademark counsel | Conflicting marks, domains, app names, descriptiveness |
| Fraudster | Account takeover, payout redirection, refund abuse, fake landlords, money-flow gaps |
| Tenant advocate | Fair housing, screening limits, deposits, notices, plain-language and accessibility harms |
| Vendor-terms reviewer | Plan limits (commercial use, backups), DPAs, acceptable use, data residency |

## 3. Verify before believing
Every high/critical claim is checked by Claude against the code (file:line) and live data (read-only SQL) before it is
reported. Record what was verified and what was not.

## 4. Act the same day
- **Park the decision, not the risk:** switch risky behavior to a safe default now (flag off, conservative values).
- Add or update rows in `docs/compliance/rules-map.md` (rule, source, our behavior, status, verified date).
- Owner-only items go to `docs/owner-tracking.md` with the interim protection noted.
- Fixes become packets with **§11 External rules** and compliance acceptance tests.
- Summarize findings in the handoff; if it's for the owner to read, publish a doc and send the link.
