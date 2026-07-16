# Sprint 57 — Codex Implementation Prompt

## 1. Objective

Enhance the automated rent reminder system with tenant-facing dashboard banners and configurable reminder preferences. The cron job already sends reminders — this sprint adds visible in-app urgency cues and owner controls.

## 2. Context

- **Branch**: `main`
- **HEAD**: (latest after Sprint 56)
- **Production URL**: `https://domusbase.com`
- **Existing infrastructure**:
  - `app/api/cron/generate-charges/route.ts` — already runs `sendRentDueReminders()`, `sendDelinquencyEscalations()`, `sendLeaseExpirationWarnings()`
  - `lib/notifications.ts` — notification types include `rent_due_reminder`, `late_rent`, `delinquency_escalation`
  - `lib/email-templates.ts` — branded HTML email shell with CTA buttons
  - Charges have `status` (pending/paid/late) and `due_date`
  - Tenant dashboard exists at `components/dashboard/tenant-overview.tsx`

## 3. In Scope

### Part A: Tenant Dashboard Urgency Banners
- "Rent due in X days" warning banner on tenant dashboard when a pending charge is within 5 days of due date
- "Rent is overdue by X days" alert banner when a charge is past due
- "You're all caught up!" success state when no charges are pending
- Banners link directly to the payment action

### Part B: Owner Reminder Preferences
- Per-property reminder settings: enable/disable automatic reminders, choose reminder timing (3 days before, 1 day before, day of, 1 day after, 3 days after)
- Settings UI in the property detail or settings area
- Store preferences in a new column on properties table or a separate config

### Part C: Enhanced Email Templates for Reminders
- Friendly "upcoming" reminder: "Hi {name}, your rent of ${amount} is due on {date}"
- Urgent "overdue" reminder: "Your rent of ${amount} was due on {date} — please pay as soon as possible"
- Include a direct link to the tenant dashboard payment page
- Use the existing branded email shell from `lib/email-templates.ts`

### Part D: Reminder Activity Log
- Show owners which reminders were sent in the charges section
- Small "Reminder sent" badge or timestamp on charge cards
- Use existing notification records — no new logging table needed

## 4. Out of Scope

- SMS/text reminders (requires Twilio)
- Push notifications (requires Apple Developer Account)
- Changing the cron schedule (managed via Vercel cron)
- Auto-late-fee generation
- Payment plan / installment features
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (2-3)
1. `apps/web/components/dashboard/rent-urgency-banner.tsx` — tenant-facing urgency banner
2. `apps/web/lib/__tests__/rent-urgency.test.ts` — tests for urgency calculation
3. `apps/web/app/actions/reminder-preferences.ts` — owner reminder settings actions (optional if using existing property settings)

### Modified Files (4-6)
1. `apps/web/components/dashboard/tenant-overview.tsx` — add urgency banner
2. `apps/web/components/dashboard/charges-section.tsx` — add "reminder sent" indicator on charge cards
3. `apps/web/lib/notifications.ts` — enhance reminder email content with direct payment links
4. `apps/web/lib/email-templates.ts` — add reminder-specific email templates (upcoming vs overdue)
5. `apps/web/components/dashboard/portfolio-section.tsx` or property detail — reminder preference toggle
6. `apps/web/app/api/cron/generate-charges/route.ts` — respect per-property reminder preferences

## 6. Implementation Requirements

### Part A: Tenant Urgency Banner

**New component: `rent-urgency-banner.tsx`**

```tsx
interface RentUrgencyBannerProps {
  charges: ChargeDTO[];  // tenant's current charges
}

// Logic:
// 1. Find charges with status "pending" or "late"
// 2. Calculate days until/since due_date
// 3. Show appropriate banner:
//    - No pending/late charges → green "You're all caught up!" banner (or hide)
//    - Due within 5 days → amber "Rent of $X due in Y days" with "Pay Now" button
//    - Due today → amber "Rent of $X is due today!" with "Pay Now" button
//    - Overdue → red "Rent of $X was due Y days ago" with "Pay Now" button
// 4. "Pay Now" links to charges section or payment flow

// Styling:
// - Use status-colors.ts for consistent coloring
// - Green/amber/red backgrounds matching the app's color system
// - Prominent but not obnoxious — rounded card with icon
```

Place at the TOP of tenant-overview.tsx, above other content.

### Part B: Urgency Calculation Helper

```typescript
// In a helper (can be in rent-urgency-banner.tsx or lib/):
export function getChargeUrgency(charge: { status: string; dueDate: string }): {
  level: "none" | "upcoming" | "due_today" | "overdue";
  daysUntilDue: number;
} {
  if (charge.status === "paid") return { level: "none", daysUntilDue: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(charge.dueDate);
  due.setHours(0, 0, 0, 0);

  const diffMs = due.getTime() - today.getTime();
  const daysUntilDue = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (daysUntilDue > 5) return { level: "none", daysUntilDue };
  if (daysUntilDue > 0) return { level: "upcoming", daysUntilDue };
  if (daysUntilDue === 0) return { level: "due_today", daysUntilDue: 0 };
  return { level: "overdue", daysUntilDue }; // negative = overdue
}
```

### Part C: Enhanced Email Templates

Add to `lib/email-templates.ts`:

```typescript
export function buildRentReminderEmail(params: {
  tenantName: string;
  amountFormatted: string;
  dueDate: string;
  propertyName: string;
  type: "upcoming" | "due_today" | "overdue";
  dashboardUrl: string;
}): { subject: string; html: string } {
  const subjects = {
    upcoming: `Rent Reminder: ${params.amountFormatted} due on ${params.dueDate}`,
    due_today: `Rent Due Today: ${params.amountFormatted}`,
    overdue: `Overdue Rent: ${params.amountFormatted} was due ${params.dueDate}`,
  };

  const messages = {
    upcoming: `Hi ${params.tenantName}, this is a friendly reminder that your rent of ${params.amountFormatted} for ${params.propertyName} is due on ${params.dueDate}.`,
    due_today: `Hi ${params.tenantName}, your rent of ${params.amountFormatted} for ${params.propertyName} is due today.`,
    overdue: `Hi ${params.tenantName}, your rent of ${params.amountFormatted} for ${params.propertyName} was due on ${params.dueDate} and is now overdue. Please pay as soon as possible.`,
  };

  // Use existing buildNotificationEmail shell with subject and body
  // Add "Pay Now" CTA button linking to dashboardUrl
}
```

### Part D: Charge Card Reminder Indicator

In `charges-section.tsx`, when rendering charge cards for owners:
- Check if a `rent_due_reminder` notification exists for this charge (match by charge ID or tenant + date)
- If found, show a small muted text: "Reminder sent {date}" or an envelope icon
- Keep it subtle — don't clutter the card

### Part E: Unit Tests

Test the urgency calculation:
1. Charge due in 10 days → level "none"
2. Charge due in 3 days → level "upcoming", daysUntilDue = 3
3. Charge due today → level "due_today"
4. Charge overdue by 5 days → level "overdue", daysUntilDue = -5
5. Paid charge → level "none" regardless of date
6. Charge due in 1 day → level "upcoming"

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Tenant dashboard shows urgency banner for pending/late charges
2. [ ] Banner shows correct message: upcoming (amber), due today (amber), overdue (red)
3. [ ] Banner hidden when all charges are paid
4. [ ] "Pay Now" button on banner navigates to payment flow
5. [ ] Enhanced email templates for upcoming/due_today/overdue reminders
6. [ ] Owner charges section shows "Reminder sent" indicator when applicable
7. [ ] Urgency calculation has 6+ passing unit tests
8. [ ] `npm run gate:web` passes
9. [ ] No regressions to existing charge or payment functionality

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
URGENCY_BANNER: working | broken
EMAIL_TEMPLATES: enhanced | unchanged
REMINDER_INDICATOR: working | broken
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations (use existing notification records)
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change the cron schedule or cron route structure
- Use existing email template shell — extend, don't replace
- Urgency banner must handle zero charges gracefully
