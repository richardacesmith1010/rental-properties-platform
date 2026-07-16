# Sprint 78 — Codex Implementation Prompt

## 1. Objective

Make paying rent the easiest thing a tenant does all month: one prominent "Pay Rent" card the moment they log in. Also add in-app messaging so owners can message tenants directly from Domus without leaving the app.

## 2. Context

- **Branch**: `main`
- **HEAD**: (latest after Sprint 77)
- **Production URL**: `https://domusbase.com`
- **Existing infrastructure**:
  - Tenant dashboard at `components/dashboard/tenant-overview.tsx`
  - Rent urgency banner at `components/dashboard/rent-urgency-banner.tsx`
  - Charges section with payment flow via Stripe checkout
  - Inbox section with `sendInboxMessage` action exists
  - `app/actions/inbox.ts` — existing messaging actions
  - `lib/notifications.ts` — notification system with email delivery
  - `lib/email-templates.ts` — branded email shell
  - Resend configured and working for email delivery

## 3. In Scope

### Part A: One-Tap Rent Payment Card
When a tenant logs in and has a pending or upcoming charge, the FIRST thing they see is a large, prominent payment card:

```
┌─────────────────────────────────────────┐
│                                         │
│   Rent Due April 1st                    │
│                                         │
│        $2,350.00                        │
│                                         │
│   131 Chaste Tree Circle · Unit A       │
│                                         │
│       [ Pay Now — $2,350.00 ]           │
│                                         │
│   or mark as paid manually              │
│                                         │
└─────────────────────────────────────────┘
```

**Key behaviors:**
- This card takes up the top ~40% of the viewport — it's THE primary action
- Single button click → goes directly to Stripe checkout (no intermediate steps)
- Shows property name and unit for clarity
- If multiple charges: stack them or show the most urgent first
- If no charges due: show a friendly "You're all set!" state with the mascot
- "Mark as paid manually" small link for cash/check payments (creates a pending confirmation for owner to approve)

### Part B: Payment Confirmation States
After paying:
- Immediate success feedback (green checkmark animation or confetti)
- "Payment received — $2,350.00" confirmation
- "View receipt" link
- Card transitions to "Paid" state with green styling

### Part C: In-App Messaging (Owner → Tenant)
Add a "Message" button on tenant cards in the owner dashboard:

**Owner side:**
- On the tenant card or tenant detail, add a "Send Message" button
- Click opens a compose modal: subject + message body
- On send: creates an inbox message AND sends an email notification via Resend
- Sent messages appear in the owner's Inbox section

**Tenant side:**
- Messages appear in the tenant's Inbox/Notifications section
- Tenant also receives an email: "You have a new message from your landlord"
- Tenant can reply from within Domus
- Reply sends email notification back to owner

**Email template for messages:**
```
Subject: Message from [Owner Name] about [Property Name]

Hi [Tenant Name],

[Owner Name] sent you a message:

"[Message content]"

[View in Domus →]

---
Domus - Rental Property Management
```

### Part D: Quick Message from Charges Section
When an owner is looking at a tenant's charges, add a "Message Tenant" quick action:
- Pre-fills the tenant's name
- Owner just types the message and sends
- Useful for: "Hey, rent is due tomorrow" or "Got your payment, thanks!"

## 4. Out of Scope

- Group messaging (message all tenants at once)
- File attachments in messages
- Read receipts
- Real-time chat (this is async messaging, not a chat app)
- Tenant-to-tenant messaging
- Database migrations (use existing inbox tables)
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (3-4)
1. `apps/web/components/dashboard/pay-rent-card.tsx` — the prominent one-tap payment card
2. `apps/web/components/dashboard/compose-message-modal.tsx` — message compose modal
3. `apps/web/lib/__tests__/pay-rent-card.test.ts` — unit tests
4. `apps/web/lib/message-email.ts` — email template for in-app messages (optional, may use existing)

### Modified Files (5-7)
1. `apps/web/components/dashboard/tenant-overview.tsx` — replace current layout with pay-rent-card as primary element
2. `apps/web/app/actions/inbox.ts` — add `sendMessageToTenant` action that creates inbox message + sends email
3. `apps/web/components/dashboard/charges-section.tsx` — add "Message Tenant" quick action on charge cards (owner view)
4. `apps/web/components/dashboard/portfolio-section.tsx` or tenant cards — add "Message" button
5. `apps/web/lib/email-templates.ts` — add message notification email template
6. `apps/web/lib/notifications.ts` — add `owner_message` notification type
7. `apps/web/components/dashboard/section-renderer.tsx` — ensure tenant overview gets charge data

## 6. Implementation Requirements

### Part A: Pay Rent Card

**File: `components/dashboard/pay-rent-card.tsx`**

```tsx
"use client";

interface PayRentCardProps {
  charges: {
    id: string;
    amountCents: number;
    dueDate: string;
    status: "pending" | "late";
    propertyName: string;
    unitLabel: string;
  }[];
  onPayClick: (chargeId: string) => void;
}

// The card should:
// 1. Show the most urgent charge first (late > pending, earliest due date)
// 2. Large dollar amount in the center (text-4xl or text-5xl, bold)
// 3. Due date prominently displayed
// 4. Property + unit as context
// 5. Full-width purple "Pay Now" button (large, 56px height, rounded-2xl)
// 6. "Pay Now" button includes the amount: "Pay Now — $2,350.00"
// 7. Small muted link below: "Already paid? Mark as paid"
// 8. If charge is late: red accent border, "Overdue" badge
// 9. If charge is upcoming: purple accent, "Due [date]" label
//
// When NO charges pending:
// Show the mascot (celebrating pose) + "You're all set!" + "No payments due right now"
// Green accent styling

// Card styling:
// - Rounded-2xl, shadow-lg
// - White background with colored left border (purple for pending, red for late, green for paid)
// - Takes full width of the content area
// - At least 200px tall — this is the hero of the tenant dashboard
```

### Part B: Payment Flow

The "Pay Now" button should call the existing Stripe checkout flow:
```typescript
// On click:
// 1. Create Stripe checkout session (existing action)
// 2. Redirect to Stripe checkout
// 3. On success return: show confirmation state
// 4. On cancel return: show "Payment cancelled" with retry option
```

"Mark as paid" link:
```typescript
// Creates a special "manual_payment" record
// Status: "pending_confirmation"
// Owner sees: "[Tenant] marked rent as paid manually — Confirm?"
// Owner clicks Confirm → charge status = paid
// Owner clicks Reject → charge stays pending, tenant notified
```

### Part C: Compose Message Modal

**File: `components/dashboard/compose-message-modal.tsx`**

```tsx
interface ComposeMessageModalProps {
  open: boolean;
  onClose: () => void;
  recipientName: string;
  recipientProfileId: string;
  propertyName?: string;
  prefilledSubject?: string;
}

// Modal content:
// - Header: "Message to [Tenant Name]"
// - Subject input (optional, defaults to "Message from [Owner Name]")
// - Message textarea (required, min 1 char)
// - "Send" button (purple) + "Cancel" button
// - On send: calls sendMessageToTenant action
// - Shows toast on success: "Message sent to [name]"
// - Auto-closes modal on success
```

### Part D: Send Message Action

In `app/actions/inbox.ts` or new file:

```typescript
// sendMessageToTenant(formData)
// Params: recipientProfileId, subject, message, propertyId (optional)
//
// 1. Auth check — must be owner or manager
// 2. Verify recipient is a tenant on one of sender's properties
// 3. Create inbox message (use existing sendInboxMessage pattern)
// 4. Send email notification via Resend:
//    - To: tenant's email
//    - From: notifications@domusbase.com
//    - Subject: "Message from [Owner Name]"
//    - Body: branded template with message content + "View in Domus" CTA
// 5. Create notification record (type: "owner_message")
// 6. Return { success: true }
```

### Part E: Email Template for Messages

```typescript
export function buildOwnerMessageEmail(params: {
  tenantName: string;
  ownerName: string;
  propertyName: string;
  messageContent: string;
  dashboardUrl: string;
}): { subject: string; html: string } {
  // Use existing buildNotificationEmail shell
  // Subject: "Message from [ownerName] about [propertyName]"
  // Body: greeting + quoted message + "View in Domus" CTA button
  // Keep it simple — don't over-design, just clear and readable
}
```

### Part F: Message Button Placement

**On tenant cards (portfolio section or wherever tenants are listed):**
```tsx
<button onClick={() => openComposeModal(tenant)} className="...">
  <MessageSquare className="w-4 h-4" />
  Message
</button>
```

**On charge cards (owner's charges section):**
```tsx
// Small icon button next to tenant name on each charge row
<button onClick={() => openComposeModal(charge.tenant)} title="Message tenant">
  <MessageSquare className="w-3.5 h-3.5" />
</button>
```

### Part G: Unit Tests

Test:
1. Pay rent card shows most urgent charge first (late before pending)
2. Pay rent card shows "all set" when no charges
3. Pay rent card formats amount correctly
4. Compose modal validates message is not empty
5. Send message action rejects unauthorized senders
6. Email template includes message content and CTA

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Tenant dashboard shows large pay-rent card as the PRIMARY element when charges exist
2. [ ] Pay rent card shows amount, due date, property name, unit
3. [ ] "Pay Now" button initiates Stripe checkout in one click
4. [ ] Late charges show red accent with "Overdue" badge
5. [ ] No pending charges shows celebratory "all set" state with mascot
6. [ ] "Mark as paid" creates pending confirmation for owner
7. [ ] Owner can send message to tenant from tenant card
8. [ ] Owner can send message from charges section
9. [ ] Compose modal has subject + message + send/cancel
10. [ ] Sent messages create inbox entry + send email via Resend
11. [ ] Tenant receives email with message content and "View in Domus" link
12. [ ] 6+ unit tests passing
13. [ ] `npm run gate:web` passes
14. [ ] No regressions to existing payment or inbox functionality

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
PAY_RENT_CARD: working | broken
ONE_TAP_CHECKOUT: working | broken
COMPOSE_MESSAGE: working | broken
EMAIL_DELIVERY: working | broken
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations (use existing inbox/notification tables)
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT build real-time chat — this is async messaging only
- The pay rent card must be the DOMINANT visual element on tenant login — not buried in a section
- Use existing Stripe checkout flow — don't rebuild payment processing
- Email notifications use existing Resend setup — don't create new email service connections
- "Mark as paid" must require owner confirmation — tenant can't mark their own charge as paid unilaterally
