# Manager category plan — Sprints 236–237 (2026-10-16)

**Score today:** Manager 76. **Bar:** 80. Last manager dry run 2026-10-07 (findings 1–7 fixed in S195/196), before
client accounts (205–209), the Wallet look (215–218), and today's rent changes (235a–c).

## Sprint 236 — Fresh manager live walk (no code, like the onboarding walk)
**Accounts:** the walk owner (`+walkowner`) invites a new manager `richard.ace.smith+walkmanager@gmail.com` (pattern of
existing test accounts; owner confirms). Manager manages the two walk homes; tenants Walk Tenant and Sam Tester exist.
No real money. Claude drives Chrome; one tab only; owner steps = password / email-link clicks.

**Walk (✅ / ❌ / ✋):**
- A. Owner Home → Add → "Add a manager" → invite `+walkmanager` for both walk homes (set the manager fee if offered).
- B. ✋ Manager opens the invite email, sets a password → manager Home. Is it clear what to do first?
- C. Every-day jobs as the manager:
  1. Rent: see both homes; Due soon / Late; Mark paid → Undo → Mark paid (235a); "Add this month's rent now" (235b).
  2. Repairs: open a repair the tenant reported (Claude creates one as Sam first if none), update status, message.
  3. Messages: owner ↔ manager and tenant ↔ manager threads; counts match Home.
  4. Money: manager pay / fee line; monthly owner statement PDF + CSV for the walk owner.
  5. Client homes: add a client account + one home through "Whose home is this?"; Show filter by client.
- D. Phone width 375 px + dark mode on Home, Rent, Repairs.
- E. DB check (permissions: manager sees only the two walk homes + own client), Sentry clean.
**Output:** findings table → Sprint 237 packet.

## Sprint 237 — Fixes + manager rent reminders (L3: auth/permission change → ChatGPT review)
- Fix the walk's findings.
- **Manager "Remind"** (the scorecard's open item): allow `sendBatchPaymentReminder` for managers, scoped to homes they
  manage, only when the owner turned on "Let my manager send rent reminders" (per account, default off).
  Delivery still goes through the notifications switch, so **nothing reaches real people until launch** (owner rule);
  in test mode only allowlisted test accounts receive it.
- Attacker SQL/permission tests: manager without permission, manager of another home, tenant → all denied.

**Expected outcome:** Manager 76 → 80 (walk + fixes + reminders built and permission-safe). A real manager month
remains the step above 80.
