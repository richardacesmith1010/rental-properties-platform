# Launch Phase 1 — "launch-ready" (target: months 0–2, started 2026-10-18)

Goal: a stranger can find Domus, sign up, pay what we charge, and run a real rent month, on the web and in the App
Store, under reviewed legal terms. Done = every row below is ✅. Claude drives; the owner gets one step at a time.

## A. What Claude/Codex do (no owner time)
| # | Item | Status |
|---|---|---|
| A1 | 238g App Review demo accounts (seed + runbook) | Codex running (2026-10-18) |
| A2 | Rescore + scorecard upkeep after each sprint | Ongoing |
| A3 | Manager plan billing | Parked by owner 2026-10-18: manual invoicing (`docs/runbooks/manager-manual-invoicing.md`); automate at ~5 paying managers |
| A4 | Lawyer packet: current drafts + exact questions (§E) | Ready to send once the owner picks a lawyer |
| A8 | Early-access `/terms` + `/privacy` live (Sprint 239a; text `docs/legal/early-access-terms-privacy-2026-10-18.md`) | Queued after 238g |
| A5 | Notifications "on" readiness: review the test week, per-user settings for rent due / late / receipt / repairs | Next sprint after 238g |
| A6 | App Store polish: screenshots (ASC-14), status-bar theme (IOS-4), reset-email dead end (IOS-5) | Queue |
| A7 | Account-deletion fixture dry run (runbook §15) | ✅ PASS 2026-10-18; runbook rev 3.4 |

## B. Owner one-steps (Claude prepares each page first; one action each)
| # | Step | Why it matters |
|---|---|---|
| B1 ✅ 2026-10-18 (PASS) | Say **"go"** for the account-deletion fixture dry run | Must pass before any real deletion request |
| B2 ✅ 2026-10-18 | **Approve the legal defaults** (§C) | Unblocks App Privacy, the 7-year purge job, publishing Terms/Privacy |
| B3 ✅ 2026-10-18 (option 1) | **Pick a pricing option** (§D) | Everything after launch depends on it; App Store rules depend on it |
| B4 | **Choose a lawyer** (small-business / SaaS; flat fee) and send the packet (§E) | Strangers should not sign unreviewed terms |
| B5 | TestFlight build 3: install on your iPhone, one check at a time | Real-device proof for the launch cover and Face ID |
| B6 | App Store Connect: Publish App Privacy, App Review info (demo login from A1), Pricing & Availability, Submit | The store listing |
| B7 | Run your own rentals on Domus for one full month (1st Home, Mom's House) | The "real month" every category is waiting on |
| B8 | Plaid: confirm Transactions access is approved (Plaid dashboard) | Unblocks live bank sync (Owner + Money scores) |
| B9 | Decide when notifications go "on" for real people (after A5) | Tenant score; your no-notifications rule until launch |

## C. Legal defaults for one approval (B2)
- Legal name: **Richard Smith** (already decided, Q9). Seller type: Individual (Q3).
- Privacy-request response time: **30 days**.
- Financial-record retention: **7 years** (common for tax records; the lawyer confirms in §E).
- Notice before price changes: **30 days**.
- Publish now as a draft-reviewed version for TestFlight testers only; publish publicly **after** the lawyer's edits.

## D. Pricing options (B3) — recommendation first
1. **Recommended: free for self-managing landlords + paid Manager plan.** Landlords with their own homes use Domus
   free (growth); property managers pay **per door** (suggest $1.50/door/month, $15 minimum), billed on the web with
   Stripe. Fits the strongest part of the product (manager features) and the market (managers pay per door today).
2. **Per-unit for everyone:** $2/unit/month, $9 minimum, billed on the web. Simple, but competes head-on with free tools.
3. **Free + payment fee:** free app; earn a small platform fee on online rent payments (Stripe application fee).
   No subscription friction, but revenue depends on tenants paying online.
- App Store note: the iPhone app stays free to download; plans are bought on the website. Rent payments are real-world
  services and are not in-app purchases. Claude re-checks Apple's current US rules (3.1.1 / 3.1.3, external purchase
  links) before the paid plan ships.

## E. Lawyer packet (B4)
Send: `docs/legal-draft-terms-privacy-2026-10.md`, the live `/terms` and `/privacy` pages, `docs/runbooks/account-deletion.md`.
Questions: (1) retention period for rent/payment records (we propose 7 years); (2) governing law and disputes; (3) role
of Domus in rent payments (Stripe Connect platform; we never hold funds) and required disclosures; (4) e-sign and IP
logging disclosure; (5) landlord-tenant data: who is the controller for tenant data; (6) AI features (Anthropic API,
no training) disclosure wording; (7) anything needed before charging managers (§D).

## Phase 1 in five stages (2026-10-18)
| Stage | Goal | Claude/Codex | Owner (one step at a time) | Exit | When |
|---|---|---|---|---|---|
| 1A Foundations ✅ mostly | Decisions locked | Legal defaults applied, retention policy adopted, deletion dry run PASS, billing parked → manual invoicing | Pick a lawyer (B4) | Lawyer engaged | Done except B4 |
| 1B Store-ready app | App passes App Review | 238g demo accounts + walk; 239a early-access Terms/Privacy live; screenshots, status-bar fix (IOS-4), reset-email fix (IOS-5); TestFlight build 3 | Tap Install on build 3; one check at a time (B5) | Build 3 OK on a real iPhone | Weeks 1–2 |
| 1C Legal & trust | Final legal text | Lawyer packet sent; fold edits; publish final Terms/Privacy; 7-year purge job (Sprint 231) | Send packet; approve final text; Publish App Privacy (B6) | Lawyer-reviewed pages live | Weeks 2–5 (lawyer pace) |
| 1D Real rent month | Domus runs a real month | Notifications-on readiness (A5); Plaid sync once approved; fix anything the month finds | Run 1st Home + Mom's House on Domus (B7); confirm Plaid (B8); say when notifications go on (B9) | One clean month; Owner/Money/Tenant ≥ 80 | Weeks 2–6 (parallel) |
| 1E Submit & launch | Live in the App Store | App Review notes, listing, Pricing & Availability prepared; answer review questions; launch checklist + first-users list | Submit for review (B6) | App approved; first outside user invited | Weeks 6–8 |
