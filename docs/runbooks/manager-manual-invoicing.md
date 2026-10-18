# Runbook — Manager plan, manual invoicing (until ~5 paying managers)

Owner decision 2026-10-18: "Park billing automation; invoice the first paying managers manually with your monthly door
statement, and build automation at about 5 paying managers." Automation design (rev 5 + ChatGPT round-4 items):
`docs/design/manager-billing-design.md`.

## Price (owner decisions)
- $1.50 per door per month, $15 minimum. Self-managing landlords and tenants: free.
- Door = an active unit on an active home; a home with no unit rows counts as 1 door.
- A co-manager a paying manager invited is a team seat: the original payer pays for the home once.
- Managers an owner adds directly are separate businesses: each pays for that home.
- Comped: Alia (free forever), all test accounts (`richard.ace.smith+…`, `manager@demo.domus.com`).
- 30-day free trial for a new manager. Nobody is charged before Terms with the plan text are live, and never less than
  30 days after the manager was told the price.

## Who is a paying manager
Kept in this file (no table yet). Add a row only after the owner says a manager agreed to pay.

| Manager (name) | Profile id | Trial ends | First billed month | Notes |
|---|---|---|---|---|
| — | — | — | — | none yet |

## Monthly (Claude, first business day of the month)
1. Run the statement query below (read-only) for each paying manager. Save the result in the handoff as that month's
   statement: homes, doors per home, team seats, total doors, amount = max(doors, 10) × $1.50.
2. Check team seats by hand: a home where the manager's access came from another manager's invite bills that inviter.
   Today `property_managers` has no `granted_by`, so use `invitations` (role manager, `invited_by` a manager, accepted)
   plus the handoff history; when unsure, ask the owner rather than bill.
3. Give the owner one prepared action: Stripe Dashboard → Invoices → Create, customer = the manager, one line
   "Domus Manager plan — <Month YYYY> — <N> doors", amount from step 1, "Charge automatically" or "Email invoice".
   The owner clicks Send. Claude never sends invoices.
4. Record in the handoff: month, manager, doors, amount, Stripe invoice id once the owner sends it.

## Statement query (read-only)
```sql
select p.id as property_id, p.name,
       greatest(1, count(u.id) filter (where u.active)) as doors,
       pm.assigned_directly
from property_managers pm
join properties p on p.id = pm.property_id and p.active
left join units u on u.property_id = p.id
where pm.manager_profile_id = '<manager profile id>' and pm.active
group by p.id, p.name, pm.assigned_directly
order by p.name;
```

## Unpaid invoices
Stripe retries the card. If an invoice is still unpaid 7 days after its due date, tell the owner; there is no automatic
read-only mode until automation ships. The owner decides what to do.

## When to build automation
At about 5 paying managers (owner rule), or earlier if manual invoicing takes the owner more than ~15 minutes a month.
