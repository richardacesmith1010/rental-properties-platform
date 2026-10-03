# Owner walk-through findings — 2026-10-03

Method: Claude walked the owner workspace as the smoke owner on production (domusbase.com) via Playwright at 1280px and 390px (mobile); 13 dashboard sections + reports + settings; zero page errors. Dark mode is covered by the automated theme check (11/11 clean).

## Ranked findings

| # | Severity | Finding | Where |
|---|---|---|---|
| 1 | **Bug** | Overdue count disagrees with itself: header says "You have 2 overdue charges totaling $2" while the KPI card says "1 OVERDUE CHARGES". | Owner home / section header KPIs |
| 2 | **Bug** | Floating "Feedback" and "Ask Domus" buttons cover real controls: Feedback sits on the first rent row's "More" button (1280px); on mobile, Ask Domus covers "Connect Bank Account" and Feedback covers the section "next" arrow. | All owner screens |
| 3 | **Bug (verify)** | Mobile: the account menu ("Signed in as … / Sign out") appears open over the header on page load. | Owner home, 390px |
| 4 | **Speed** | Every section switch shows "Loading …" for ~3.0–3.5 s (Maintenance, Portfolio, Expenses, Leases, Charges all ≈3,050 ms — a fixed floor suggests a waterfall or artificial delay). | Owner sections |
| 5 | **Clutter** | Three asks for the same thing stack on top: "Set up rent payments" banner, "Your bank connection needs attention" banner, and the checklist's "Connect Bank Account" button. | Owner home + every section |
| 6 | **Confusing nav** | Sections are a carousel with "1 OF 9 / 3 OF 7 / 3 OF 5 / 3 OF 10" counters and prev/next arrows; the count changes by "mode", so the same screen has different positions. Combined with sidebar + search, there are three ways to navigate. | Section header |
| 7 | **Jargon (§18)** | "Charges", "Upcoming / Late Charges", "Generate This Month Charges", "Daily Operations", "Records & Compliance Mode", "resident operations", "Open Receivables", "Tenant Ledger", "P&L". | Charges, home, reports |
| 8 | **Odd action** | Owner's rent rows show a "Pay now" button (owners don't pay tenant rent). | Charges |
| 9 | **Inconsistent layout** | Some sections show greeting + KPI cards + mode banner above the content (Payments), others don't (Charges, Maintenance). | Section shells |
| 10 | **Data hygiene** | 7 archived, completely empty properties on the owner's real account (5× "1st Home", "Mom's Home", "Sunset Apartments"; 0 units/leases/charges). Already hidden. Optional permanent delete. | Owner account |

## Looks good
- Reports: aging buckets, ledger running balance, P&L, tax summary, A/R all consistent for the smoke data.
- Paid receipt flow, theme contrast, pays-outside-Domus behavior verified earlier today.
