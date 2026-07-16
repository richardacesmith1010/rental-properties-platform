# Sprint 85 — Codex Implementation Prompt

## 1. Objective

Make every notification actionable — every email, every in-app notification, and every dashboard alert should have ONE obvious action button that does the thing the user needs to do. No dead-end notifications. No "FYI" without a next step. Also: make the tenant and manager experiences Barney-simple.

## 2. Context

- **Branch**: `main`
- **HEAD**: (latest after Sprint 84)
- **Production URL**: `https://domusbase.com`
- **Zero Friction Principle (CLAUDE.md §18)**: If a user has to think, the design failed. Every notification must answer: "What do I do about this?"

**Current problems:**
1. Email notifications say "Rent charge marked late" with a generic "Pay Now" button — but if you're the OWNER, "Pay Now" makes no sense. You want "Send Reminder" or "Waive."
2. In-app notifications (bell icon) show text with no actions — user reads it, then has to figure out where to go
3. Tenant dashboard doesn't explain things simply enough — what IS a "charge"? Why do I owe money? What happens if I don't pay?
4. Manager dashboard doesn't guide them to their tasks
5. No contextual help anywhere — first-time users are lost

## 3. In Scope

### Part A: Role-Aware Email Notifications
Every email notification must have the RIGHT action button for the RIGHT role:

**"Rent charge marked late":**
- To OWNER: "Send Reminder to [Tenant]" button → deep link to charge with reminder action
- To TENANT: "Pay Now — $2,350" button → deep link to payment checkout
- To MANAGER: "View Charge Details" button → deep link to charge

**"Lease created":**
- To OWNER: "View Lease" button
- To TENANT: "Review Your Lease" button → deep link to tenant lease section

**"Payment received":**
- To OWNER: "View Receipt" button
- To TENANT: "Download Receipt" button → deep link to receipt PDF

**"Maintenance ticket submitted":**
- To OWNER: "Review Ticket" button → deep link to maintenance section
- To TENANT: "Track Your Ticket" button
- To MANAGER: "Respond to Ticket" button

**"Manager payment due":**
- To OWNER: "Pay Manager" button → deep link to manager payments
- To MANAGER: "View Invoice" button

**Pattern:** Every email has exactly ONE primary CTA button. The button text is a VERB that describes what happens when you click it. Never "Click here" or "View."

### Part B: Actionable In-App Notifications
Replace the notification bell dropdown from passive text to actionable cards:

**Each notification shows:**
```
┌─────────────────────────────────────────┐
│ 🔴 Angel's rent is overdue              │
│    $2,350 was due Mar 31                 │
│    [ Send Reminder ]  [ Waive ]    ✕    │
└─────────────────────────────────────────┘
```

NOT:
```
┌─────────────────────────────────────────┐
│ Rent charge marked late                  │
│ 26 minutes ago                      ✕    │
└─────────────────────────────────────────┘
```

**Rules:**
- Every notification has 1-2 action buttons
- Buttons perform the action inline (no navigation required for simple actions like "Send Reminder")
- Complex actions navigate to the right page with the right context
- Dismiss (✕) marks as read
- "Clear all" still available at top

### Part C: Tenant Experience — Barney Simple
When a tenant logs in, they should understand EVERYTHING without any property management knowledge:

**Pay Rent Card (enhanced):**
```
┌─────────────────────────────────────────┐
│                                          │
│   Your Rent                              │
│                                          │
│   $2,350.00                              │
│   Due April 1, 2026 (in 8 days)         │
│                                          │
│   131 Chaste Tree Circle · Unit A        │
│                                          │
│   [ Pay Rent — $2,350.00 ]              │
│                                          │
│   Paid by credit card or bank transfer.  │
│   You'll get a receipt by email.         │
│                                          │
└─────────────────────────────────────────┘
```

Key changes:
- "Your Rent" not "Pending Charge" — use human words
- "Due April 1, 2026 (in 8 days)" — both absolute and relative date
- "Pay Rent" not "Pay Now" — describe what you're doing
- Subtitle explains what happens: "Paid by credit card or bank transfer. You'll get a receipt by email."
- When overdue: red border, "Your rent of $2,350 was due 3 days ago. Please pay as soon as possible to avoid late fees."

**After paying:**
```
┌─────────────────────────────────────────┐
│  ✅ Rent Paid!                           │
│                                          │
│  $2,350.00 paid on March 23, 2026       │
│                                          │
│  [ Download Receipt ]                    │
│                                          │
│  Your next rent is due May 1, 2026.     │
└─────────────────────────────────────────┘
```

**Maintenance ticket submission (simplified):**
- "Report a Problem" not "Submit Maintenance Ticket"
- Simple form: "What's the problem?" (text) + "Add a photo" (camera button)
- No priority dropdown (owner/manager sets priority)
- No category dropdown (just describe it)
- After submit: "Got it! Your landlord has been notified. We'll update you when there's progress."

**Tenant navigation:**
- Only show sections they need: Rent, Problems (maintenance), Messages, Lease
- No "Records", "Analytics", "Ownership" — those are owner concepts
- Use tenant-friendly labels everywhere

### Part D: Manager Experience — Task-Focused
When a manager logs in, show them their task list:

```
┌─────────────────────────────────────────┐
│  Your Tasks                              │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 🔧 New maintenance ticket          │  │
│  │    "Kitchen faucet leaking"        │  │
│  │    Angel Hernandez · 1st Home      │  │
│  │    [ Mark In Progress ] [ Respond ] │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 💰 Invoice ready                   │  │
│  │    $211.50 for March management    │  │
│  │    [ View Invoice ]                │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ✅ No other tasks right now             │
└─────────────────────────────────────────┘
```

### Part E: Contextual Tooltips for First-Time Users
Add subtle help text INLINE (not popup tutorials) for key concepts:

- First time on charges page: small muted text "Charges are automatically created each month based on your leases."
- First time on maintenance: "When your tenant reports a problem, it shows up here."
- First time on reports: "These reports pull from your actual lease and payment data."
- First time on members page: "Everyone you invite here can view and manage this LLC's properties."

**Implementation:** Check `localStorage` for `domus-seen-{section}`. If not set, show the help text. After first visit, set the flag and hide it forever. No modals, no tours, no popups — just a muted text line that disappears after first visit.

## 4. Out of Scope

- Push notifications
- SMS notifications
- Redesigning the entire navigation
- New database tables (reuse existing notification infrastructure)
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (3-4)
1. `apps/web/components/dashboard/actionable-notification.tsx` — notification card with action buttons
2. `apps/web/components/dashboard/first-visit-help.tsx` — contextual help text component
3. `apps/web/lib/notification-actions.ts` — maps notification types to role-specific actions and deep links
4. `apps/web/lib/__tests__/notification-actions.test.ts` — unit tests

### Modified Files (8-12)
1. `apps/web/lib/notifications.ts` — add role-aware action URLs and button labels to notification creation
2. `apps/web/lib/email-templates.ts` — role-aware CTA buttons in emails
3. `apps/web/lib/delinquency.ts` — owner gets "Send Reminder" not "Pay Now" in late charge emails
4. `apps/web/components/dashboard/dashboard-header.tsx` — notification dropdown uses actionable cards
5. `apps/web/components/dashboard/notifications-section.tsx` — actionable notification list
6. `apps/web/components/dashboard/pay-rent-card.tsx` — human-friendly copy, explanatory subtitles
7. `apps/web/components/dashboard/tenant-overview.tsx` — simplified tenant nav labels
8. `apps/web/components/dashboard/maintenance-section.tsx` — "Report a Problem" for tenants, simplified form
9. `apps/web/components/dashboard/ticket-form.tsx` — remove priority/category for tenants (owner sets those)
10. `apps/web/components/dashboard/manager-dashboard.tsx` — task-focused landing
11. `apps/web/components/dashboard/charges-section.tsx` — first-visit help text
12. `apps/web/components/dashboard/section-renderer.tsx` — first-visit help text per section

## 6. Implementation Requirements

### Part A: Notification Action Mapping

```typescript
// lib/notification-actions.ts

interface NotificationAction {
  label: string;          // Button text — always a VERB
  url: string;            // Deep link
  variant: "default" | "outline";
}

export function getNotificationActions(
  type: string,
  role: "owner" | "manager" | "tenant",
  context: { chargeId?: string; ticketId?: string; leaseId?: string; }
): NotificationAction[] {

  const actionMap: Record<string, Record<string, NotificationAction[]>> = {
    late_rent: {
      owner: [
        { label: "Send Reminder", url: `/owner?section=charges&action=remind&id=${context.chargeId}`, variant: "default" },
        { label: "Waive Charge", url: `/owner?section=charges&action=waive&id=${context.chargeId}`, variant: "outline" },
      ],
      tenant: [
        { label: "Pay Rent", url: `/tenant?section=charges&pay=${context.chargeId}`, variant: "default" },
      ],
      manager: [
        { label: "View Details", url: `/manager?section=charges&id=${context.chargeId}`, variant: "default" },
      ],
    },
    payment_received: {
      owner: [{ label: "View Receipt", url: `/payments/receipt/${context.chargeId}`, variant: "default" }],
      tenant: [{ label: "Download Receipt", url: `/api/pdf/receipt/${context.chargeId}`, variant: "default" }],
      manager: [{ label: "View Payment", url: `/manager?section=charges&id=${context.chargeId}`, variant: "default" }],
    },
    new_ticket: {
      owner: [{ label: "Review Ticket", url: `/owner?section=maintenance&id=${context.ticketId}`, variant: "default" }],
      tenant: [{ label: "Track Your Ticket", url: `/tenant?section=maintenance&id=${context.ticketId}`, variant: "default" }],
      manager: [{ label: "Respond to Ticket", url: `/manager?section=maintenance&id=${context.ticketId}`, variant: "default" }],
    },
    // ... add all notification types
  };

  return actionMap[type]?.[role] ?? [{ label: "View", url: "/", variant: "default" }];
}
```

### Part B: Email CTA Buttons

When sending notification emails, use the action mapping to set the correct CTA:

```typescript
// In notification email builder:
const actions = getNotificationActions(type, recipientRole, context);
const primaryAction = actions[0];

// Email CTA button:
// Text: primaryAction.label
// Link: `${APP_URL}${primaryAction.url}`
```

### Part C: Tenant Copy Changes

Replace property management jargon with human words:

| Current | Replace with |
|---|---|
| "Pending Charge" | "Your Rent" |
| "Submit Maintenance Ticket" | "Report a Problem" |
| "Charges" | "Rent" (in tenant nav) |
| "Maintenance" | "Problems" (in tenant nav) |
| "Notifications" | "Messages" (in tenant nav) |
| "Pay Now" | "Pay Rent" |
| "Charge created" | "Rent is due" |
| "Charge marked late" | "Rent is overdue" |
| "Record Payment" | (remove for tenants — owners only) |

### Part D: First-Visit Help

```tsx
// components/dashboard/first-visit-help.tsx

interface FirstVisitHelpProps {
  sectionId: string;
  children: React.ReactNode;  // The help text
}

export function FirstVisitHelp({ sectionId, children }: FirstVisitHelpProps) {
  const [seen, setSeen] = useState(true); // Default hidden

  useEffect(() => {
    const key = `domus-seen-${sectionId}`;
    if (!localStorage.getItem(key)) {
      setSeen(false);
      localStorage.setItem(key, "true");
    }
  }, [sectionId]);

  if (seen) return null;

  return (
    <p className="text-sm text-muted-foreground italic mb-4">
      {children}
    </p>
  );
}

// Usage:
<FirstVisitHelp sectionId="charges">
  Charges are automatically created each month based on your leases.
  You can edit, waive, or delete any charge.
</FirstVisitHelp>
```

### Part E: Simplified Maintenance Form for Tenants

```tsx
// When user role is tenant, show simplified form:

<form>
  <h2 className="text-xl font-bold">Report a Problem</h2>
  <p className="text-muted-foreground">Describe what's wrong and we'll notify your landlord.</p>

  <label className="block mt-4">
    <span className="text-sm font-medium">What's the problem?</span>
    <textarea
      className="w-full mt-1 p-3 border rounded-xl"
      rows={4}
      placeholder="e.g., The kitchen faucet is leaking under the sink"
    />
  </label>

  <div className="mt-4">
    <PhotoUpload label="Add a photo (optional)" />
  </div>

  <Button className="w-full mt-6" size="lg">
    Report Problem
  </Button>

  <p className="text-xs text-muted-foreground text-center mt-2">
    Your landlord will be notified immediately.
  </p>
</form>

// NO priority dropdown (owner/manager sets this)
// NO category dropdown (just describe it)
// NO unit selector (auto-detected from tenant's lease)
```

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Email notifications have role-appropriate CTA buttons (owner gets "Send Reminder", tenant gets "Pay Rent")
2. [ ] In-app notifications show action buttons (not just text)
3. [ ] "Send Reminder" and "Waive" buttons work inline from notification dropdown
4. [ ] Tenant pay rent card uses human-friendly copy ("Your Rent", "Pay Rent", explains what happens)
5. [ ] Tenant nav uses simple labels: "Rent", "Problems", "Messages", "Lease"
6. [ ] Maintenance submission for tenants: just description + photo, no priority/category
7. [ ] After tenant submits ticket: "Got it! Your landlord has been notified."
8. [ ] Manager dashboard shows task list on login
9. [ ] First-visit help text appears once per section, then disappears forever
10. [ ] Every notification answers "What do I do about this?"
11. [ ] No notification is a dead end — every one has at least one action
12. [ ] `npm run gate:web` passes
13. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
ROLE_AWARE_EMAILS: working | broken
ACTIONABLE_NOTIFICATIONS: working | broken
TENANT_COPY: simplified | unchanged
TENANT_MAINTENANCE: simplified | unchanged
MANAGER_TASKS: working | broken
FIRST_VISIT_HELP: working | broken
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Tenant nav label changes must not break URL routing (sections still use internal IDs)
- First-visit help uses localStorage only — no database storage
- Simplified maintenance form only applies to tenant role — owner/manager still see full form
- Email CTA buttons must use absolute URLs (APP_URL + path) for email client compatibility
- The user should NEVER need to read instructions. Every element must be self-explanatory.
- When in doubt, use fewer words. A 3-word button beats a 10-word explanation.
