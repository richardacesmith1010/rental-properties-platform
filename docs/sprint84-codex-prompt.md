# Sprint 84 — Codex Implementation Prompt

## 1. Objective

Eliminate the three biggest friction points in the owner experience: (1) unify property+unit+lease+tenant into one continuous wizard, (2) fix charge generation so it never creates charges before a lease starts, and (3) replace the informational dashboard with an actionable "what needs attention" view.

## 2. Context

- **Branch**: `main`
- **HEAD**: (latest after Sprint 83)
- **Production URL**: `https://domusbase.com`
- **Zero Friction Principle (CLAUDE.md §18)**: If a user has to think about what to do next, the design has failed. Every step must be self-explanatory. Minimize clicks, eliminate manual cleanup, make actions obvious.

**Current problems:**
1. Creating a property, unit, lease, and inviting a tenant requires 4 separate flows in different parts of the app
2. The cron job generated charges for March even though the lease starts April 1 — owner had to manually delete
3. The dashboard shows "Good evening, Ace" + KPI cards but doesn't tell the owner what to DO

## 3. In Scope

### Part A: Unified Property Setup Wizard
Replace the separate property/unit/lease/tenant flows with ONE continuous wizard triggered by "New Property":

**Step 1: Property Details** (existing property wizard step 1)
- Property name, address, city, state, zip
- Property type (single family, multi-family, condo, etc.)

**Step 2: Unit** (auto-advances from step 1)
- Unit label (default: "Unit A" for single-family, or let them add multiple)
- Bedrooms, bathrooms, sq ft
- Monthly rent amount
- "This property has multiple units" toggle → shows "Add another unit" button

**Step 3: Lease** (auto-advances from step 2)
- "Do you have a tenant yet?" toggle
  - If NO → skip to finish, show "You can add a tenant later"
  - If YES → continue:
- Tenant email (this will send them an invitation)
- Lease start date, end date
- Monthly rent (pre-filled from unit)
- Security deposit (optional)

**Step 4: Confirmation**
- Summary card showing: property, unit(s), lease, tenant
- "Create Everything" button
- On click: creates property → unit(s) → lease → sends tenant invitation email
- ALL in one server action, one click

**After completion:**
- Success screen with mascot (celebrating pose)
- "Your property is set up! [tenant name] will receive an invitation email."
- "Go to Dashboard" button → lands on the property's overview

**Key behaviors:**
- Back button on each step (don't trap them)
- Progress indicator (Step 1 of 4)
- Each step auto-focuses the first input
- Tab advances to next field, Enter advances to next step
- The wizard is a modal overlay (consistent with existing wizard pattern)
- If they close mid-wizard, data is NOT saved (clean exit)

### Part B: Charge Generation Guard
Fix the cron job so it NEVER generates charges before a lease's start date:

**In `lib/charge-generation.ts` or wherever charges are created:**

```typescript
// Before creating a charge for a lease:
// 1. Check if lease.start_date > first day of current charge month
// 2. If yes → skip this lease for this month
// 3. Only generate charges for months where the lease is ACTIVE

// Example:
// Lease starts April 1, 2026
// Cron runs March 23, 2026 for April charges → ✅ generate (April >= April)
// Cron runs March 23, 2026 for March charges → ❌ skip (March < April)
// Cron runs March 1, 2026 for March charges → ❌ skip (March < April)

const leaseStartMonth = new Date(lease.start_date);
leaseStartMonth.setDate(1); // First of the month
leaseStartMonth.setHours(0, 0, 0, 0);

const chargeMonth = new Date(chargeDueDate);
chargeMonth.setDate(1);
chargeMonth.setHours(0, 0, 0, 0);

if (chargeMonth < leaseStartMonth) {
  // Skip — lease hasn't started yet
  continue;
}
```

Also check: if `lease.end_date` is in the past, don't generate charges either.

### Part C: Actionable Dashboard ("What Needs Attention")
Replace the current Home page content (greeting + KPI snapshot) with an action-focused view:

**When there ARE action items:**
```
┌─────────────────────────────────────────┐
│  Good evening, Ace                       │
│                                          │
│  2 things need your attention            │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 🔴 Angel's rent is overdue         │  │
│  │    $2,350 was due Mar 31           │  │
│  │    [ Send Reminder ] [ Waive ]     │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 🟡 Alia's manager payment is due   │  │
│  │    $211.50 due April 1             │  │
│  │    [ Pay Now ] [ Defer ]           │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 🔔 2 new feedback messages         │  │
│  │    [ View Feedback ]               │  │
│  └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**When there are NO action items:**
```
┌─────────────────────────────────────────┐
│  Good evening, Ace                       │
│                                          │
│  ✅ Everything looks good                │
│                                          │
│  No action items right now.              │
│  Your next rent collection is in 8 days. │
│                                          │
│  [mascot celebrating pose]               │
└─────────────────────────────────────────┘
```

**Action items to detect:**
1. **Overdue charges** → "X's rent is overdue" → [Send Reminder] [Waive] [View]
2. **Upcoming charges (within 3 days)** → "X's rent is due in Y days" → [Send Reminder]
3. **Pending manager payments** → "Manager payment due" → [Pay Now]
4. **Open maintenance tickets (high priority)** → "X urgent maintenance tickets" → [View Tickets]
5. **Pending LLC invitations awaiting acceptance** → "2 pending member invitations" → [View Members]
6. **Unread feedback** → "X new feedback messages" → [View Feedback]
7. **Lease expiring within 30 days** → "X's lease expires in Y days" → [View Lease]

**Each action card:**
- Color-coded left border (red = urgent, yellow = attention, blue = info)
- Clear one-line description
- 1-2 action buttons that DO the thing (not just navigate)
- Tapping the card navigates to the relevant section

**Sorting:** Red items first, yellow second, blue third.

## 4. Out of Scope

- Tenant or manager dashboard changes (this sprint is owner only)
- Notification system changes
- Email template changes
- Database migrations (except charge generation logic fix)
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (3-4)
1. `apps/web/components/dashboard/unified-property-wizard.tsx` — the all-in-one wizard
2. `apps/web/components/dashboard/action-items.tsx` — actionable dashboard component
3. `apps/web/app/actions/unified-setup.ts` — single server action that creates property+unit+lease+invites tenant
4. `apps/web/lib/__tests__/action-items.test.ts` — unit tests

### Modified Files (5-7)
1. `apps/web/components/dashboard/owner-daily-ops-home.tsx` — replace greeting/KPI with action items
2. `apps/web/components/dashboard/index.tsx` — wire unified wizard, pass action items data
3. `apps/web/components/dashboard/dashboard-data-loader.tsx` — compute action items from existing data
4. `apps/web/lib/charge-generation.ts` — add lease start/end date guards
5. `apps/web/app/api/cron/generate-charges/route.ts` — ensure guards are applied
6. `apps/web/components/dashboard/sidebar/nav-items.ts` — "New Property" triggers unified wizard
7. `apps/web/components/dashboard/property-wizard.tsx` — replace with unified wizard or redirect to it

## 6. Implementation Requirements

### Part A: Unified Property Wizard

```tsx
// components/dashboard/unified-property-wizard.tsx

interface UnifiedPropertyWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  accountId: string;
}

// Step tracking:
const [step, setStep] = useState<"property" | "unit" | "lease" | "confirm">("property");

// Data accumulation (each step adds to this):
const [wizardData, setWizardData] = useState({
  property: { name: "", address: "", city: "", state: "", zip: "", type: "single_family" },
  units: [{ label: "Unit A", bedrooms: 1, bathrooms: 1, sqft: null, rentCents: 0 }],
  lease: { hasTenant: false, tenantEmail: "", startDate: "", endDate: "", rentCents: 0, deposit: 0 },
});

// Step transitions:
// property → unit (auto-fill rent from property type estimate)
// unit → lease (auto-fill rent from unit.rentCents)
// lease → confirm (if hasTenant, show tenant invitation preview)
// confirm → submit (single server action)
```

### Server Action: `createPropertyWithSetup`

```typescript
// app/actions/unified-setup.ts

export async function createPropertyWithSetup(formData: FormData): Promise<ActionState> {
  // 1. Auth check
  // 2. Validate all fields
  // 3. Transaction-like flow (if any step fails, report which):
  //    a. INSERT property
  //    b. INSERT unit(s) linked to property
  //    c. IF lease data provided:
  //       - INSERT lease linked to unit + tenant email
  //       - Send tenant invitation email (reuse tenant-invitations.ts pattern)
  //    d. Link property to ownership account
  // 4. Return { success: true, propertyId, unitIds, leaseId, tenantInvited }
}
```

### Part B: Charge Generation Guard

In the charge generation logic, add this check BEFORE creating any charge:

```typescript
function shouldGenerateCharge(lease: LeaseRow, chargeMonth: Date): boolean {
  // Don't generate if lease hasn't started yet
  const leaseStart = new Date(lease.start_date);
  const monthStart = new Date(chargeMonth.getFullYear(), chargeMonth.getMonth(), 1);

  if (monthStart < new Date(leaseStart.getFullYear(), leaseStart.getMonth(), 1)) {
    return false; // Lease hasn't started in this month
  }

  // Don't generate if lease has already ended
  if (lease.end_date) {
    const leaseEnd = new Date(lease.end_date);
    if (monthStart > new Date(leaseEnd.getFullYear(), leaseEnd.getMonth(), 1)) {
      return false; // Lease ended before this month
    }
  }

  return true;
}
```

### Part C: Action Items Component

```typescript
// lib/action-items.ts

export interface ActionItem {
  id: string;
  severity: "urgent" | "attention" | "info";
  icon: string; // emoji or icon name
  title: string;
  description: string;
  actions: {
    label: string;
    onClick: string; // action identifier
    variant: "default" | "destructive" | "outline";
  }[];
  linkTo?: string; // section to navigate to on card click
}

export function computeActionItems(data: {
  charges: ChargeDTO[];
  tickets: MaintenanceTicket[];
  managerPayments: any[];
  leases: LeaseDTO[];
  pendingInvitations: any[];
  feedback: any[];
}): ActionItem[] {
  const items: ActionItem[] = [];

  // 1. Overdue charges
  for (const charge of data.charges.filter(c => c.status === "late")) {
    items.push({
      id: `charge-overdue-${charge.id}`,
      severity: "urgent",
      icon: "🔴",
      title: `${charge.tenantName}'s rent is overdue`,
      description: `$${(charge.amountCents / 100).toFixed(2)} was due ${formatDate(charge.dueDate)}`,
      actions: [
        { label: "Send Reminder", onClick: `remind-${charge.id}`, variant: "default" },
        { label: "Waive", onClick: `waive-${charge.id}`, variant: "outline" },
      ],
      linkTo: "charges",
    });
  }

  // 2. Charges due within 3 days
  // 3. Pending manager payments
  // 4. High-priority maintenance tickets
  // 5. Pending LLC invitations
  // 6. Expiring leases (30 days)
  // 7. Unread feedback

  // Sort: urgent first, then attention, then info
  return items.sort((a, b) => {
    const order = { urgent: 0, attention: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
}
```

### Action Item Card Component

```tsx
// components/dashboard/action-items.tsx

function ActionItemCard({ item }: { item: ActionItem }) {
  const borderColor = {
    urgent: "border-l-red-500",
    attention: "border-l-amber-500",
    info: "border-l-blue-500",
  }[item.severity];

  return (
    <div className={`rounded-xl border border-border ${borderColor} border-l-4 p-4 bg-card shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-foreground">{item.icon} {item.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        {item.actions.map(action => (
          <Button key={action.label} size="sm" variant={action.variant}>
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
```

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] "New Property" opens a unified wizard: property → unit → lease → tenant → confirm
2. [ ] Wizard auto-advances between steps with smooth transitions
3. [ ] "Do you have a tenant yet?" toggle allows skipping lease/tenant steps
4. [ ] Monthly rent auto-fills from unit to lease step
5. [ ] "Create Everything" button creates property + unit + lease + sends tenant invite in ONE action
6. [ ] Success screen shows summary with mascot
7. [ ] Charge generation skips months before lease start_date
8. [ ] Charge generation skips months after lease end_date
9. [ ] Dashboard Home shows action items when they exist (overdue charges, due-soon charges, pending payments, etc.)
10. [ ] Each action item card has 1-2 action buttons that work (Send Reminder, Waive, View, etc.)
11. [ ] Action items sorted by severity (red → yellow → blue)
12. [ ] Empty state: "Everything looks good ✅" with mascot when no action items
13. [ ] Empty state shows countdown to next event ("Next rent collection in X days")
14. [ ] The user NEVER needs to think about what to do — the dashboard tells them
15. [ ] `npm run gate:web` passes
16. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
UNIFIED_WIZARD: working | broken
CHARGE_GUARD: working | broken
ACTION_ITEMS: working | broken
EMPTY_STATE: working | broken
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations (no schema changes needed)
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- The unified wizard must use the existing modal-overlay pattern
- Charge generation fix must be backward-compatible (don't break existing valid charges)
- Action item buttons must actually perform the action (not just navigate) — use existing server actions
- The "Send Reminder" button should call the existing notification system
- Keep the paginated section pages (Overview, Charges, etc.) — the Home page just becomes the action center
- The user should NEVER need to read instructions to complete any flow
