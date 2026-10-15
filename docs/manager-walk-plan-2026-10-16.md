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

## Sprint 236 results — walked 2026-10-15 23:15–23:45 UTC (manager `+walkmanager` "Walk Manager", walk owner, tenant Sam)

**Outcome:** core manager jobs work. Invite (two homes) → join → Home → Rent (Mark paid → Undo → Mark paid, toast stays —
R1 ✅) → Repairs (status In Progress + comment) → Messages → Payments → Clients (add client, owner statement dialog).
Permissions: as the manager, RLS shows 2 of 17 homes, 1 repair, own profile only. Sentry clean. 375 px / dark: covered by
daily smoke (manager views), not re-walked.

### Findings
| # | Sev | Where | What |
|---|---|---|---|
| M10 | **Major (money)** | Manager Payments + many readers | Reversed payments shown as received (3 of 5 listed were reversed). Readers with no `reversed_at` filter: `lib/payment-history.ts`, `lib/dashboard-legacy.ts`, `app/payments/receipt/[chargeId]`, `app/payments/success`, `lib/pdf/pdf-data.ts`, `lib/analytics-loader.ts`, `lib/reports-rent-roll.ts`, `lib/property-detail-queries.ts`, `app/api/ai/chat/route.ts`. Also affects Stripe ACH reversals (since S114). |
| M3 | Medium | Manager invite email | Supabase generic "You have been invited" — no inviter, home, or role (tenant invite is a full Domus email). |
| M7 | Medium | Messages | Sidebar badge 1 vs inbox "0 unread". |
| M8 | Medium | Messages | Create-thread jargon: "Maintenance Ticket", "Rent Payment", "Document Packet", "Create thread" (guard misses option labels). |
| M1 | Medium | Add a manager | One home per invite; no "all homes" choice (second invite worked: "Added Walk Manager to this home"). |
| M6 | Medium | Toasts | "Payment undone…" toast never auto-dismisses (stayed minutes, across sections); no confirmation on repair status update. |
| M11 | Medium | Clients | Owners with Domus accounts (Walk Owner) aren't listed under "Owners whose homes you run"; statements only for clients. |
| M9 | Design | Sidebar | 22 manager nav items. |
| M4 | Design | Manager Home | Old layout, not the Wallet look. |
| M5 | Low | Rent | After undo, stale green "Manual payment recorded." banner stays above the list. |
| M2 | Low | Add a manager | Success banner text clipped inside the dialog; disabled "Next" shown beside Send. |
| T1 | Low (tenant) | Tenant repair card | Shows landlord fields "Cost / Vendor / Assignment". |

### Passed cleanly
Manager Home "Needs you today" (1 open repair, 1 conversation), bank card for fees, rent progress; Rent list scoped to
managed homes; repair status + comment; client add (clear "paid outside Domus" note); owner statement dialog; second
invite recognized without a second email.
