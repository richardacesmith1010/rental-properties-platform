# Sprint 67 — Codex Implementation Prompt

## 1. Objective

Add a step-by-step lease creation wizard (modal, multi-step like the property wizard) and wire manager payment invoices to send via Resend email.

## 2. Context

- **Branch**: `main`
- **HEAD**: `7a2d306`
- **Production URL**: `https://domusbase.com`
- **Existing infrastructure**:
  - Property wizard pattern at `components/dashboard/property-wizard.tsx` + `modal-overlay.tsx`
  - Lease actions at `app/actions/lease-mutations.ts` — `createLease()` exists
  - Leases section at `components/dashboard/leases-section.tsx`
  - Manager payment system from Sprint 62: `app/actions/manager-payments.ts`, `components/dashboard/manager-payments-section.tsx`
  - Email templates at `lib/email-templates.ts` — branded HTML shell with CTA
  - Resend configured: `RESEND_API_KEY` + `RESEND_FROM_EMAIL` set in Vercel
  - Notification system at `lib/notifications.ts`

## 3. In Scope

### Part A: Lease Creation Wizard
Multi-step modal wizard triggered from the leases section "New Lease" button:

**Step 1 — Select Property & Unit**
- Dropdown of owner's properties
- Dropdown of units for selected property (filtered, only vacant units)
- Show unit details (bedrooms, bathrooms) after selection

**Step 2 — Lease Terms**
- Start date (date picker)
- End date (date picker)
- Monthly rent amount (currency input)
- Security deposit (optional, currency input)
- Lease type: Fixed term / Month-to-month toggle

**Step 3 — Assign Tenant**
- Option A: Select existing tenant (dropdown of tenants in system)
- Option B: Invite new tenant (name + email — triggers tenant invitation from Sprint 65)
- Show tenant details after selection

**Step 4 — Review & Create**
- Summary of all selections
- "Create Lease" button
- On success: close wizard, refresh leases section, show success toast

### Part B: Manager Invoice Email Delivery
When a manager payment is recorded (from Sprint 62's manager payment system):
- Generate a professional invoice email using the branded email shell
- Send via Resend to the manager's email
- Include: payment amount, description, property name, date, receipt number
- CC the owner on the invoice email
- Store a record that the invoice was sent

### Part C: Invoice PDF Attachment
- Generate a PDF invoice using the existing `@react-pdf/renderer` setup from Sprint 59
- Attach the PDF to the invoice email
- Invoice includes: Domus branding, from (owner), to (manager), amount, description, date, invoice number

## 4. Out of Scope

- E-signature on leases
- Lease renewal workflow
- Automated rent escalation
- Manager payment scheduling/recurring automation (already exists in Sprint 62)
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (5-7)
1. `apps/web/components/dashboard/lease-wizard.tsx` — main wizard component
2. `apps/web/components/dashboard/lease-wizard-support.tsx` — step components and validation
3. `apps/web/lib/pdf/invoice-template.tsx` — PDF invoice template for manager payments
4. `apps/web/app/api/pdf/invoice/[paymentId]/route.ts` — invoice PDF generation route
5. `apps/web/lib/invoice-email.ts` — invoice email builder
6. `apps/web/lib/__tests__/lease-wizard.test.ts` — unit tests
7. `apps/web/lib/__tests__/invoice-email.test.ts` — unit tests

### Modified Files (4-6)
1. `apps/web/components/dashboard/leases-section.tsx` — add "New Lease" button that opens wizard
2. `apps/web/components/dashboard/index.tsx` — wire wizard modal state
3. `apps/web/app/actions/manager-payments.ts` — add invoice email sending after payment recording
4. `apps/web/lib/email-templates.ts` — add invoice email template
5. `apps/web/app/actions/lease-mutations.ts` — ensure createLease works with wizard data shape
6. `apps/web/components/dashboard/section-map.ts` — register lease wizard if needed

## 6. Implementation Requirements

### Part A: Lease Wizard

Follow the EXACT same modal pattern as `property-wizard.tsx`:
- Uses `modal-overlay.tsx` for the modal shell
- Multi-step with progress indicator (Step 1 of 4, Step 2 of 4, etc.)
- Back/Next buttons at bottom
- Form validation per step before allowing Next
- Final step has "Create Lease" submit button
- Loading state during submission
- Success state with confirmation before closing

**Step 1 — Property & Unit Selection:**
```tsx
// Fetch owner's properties
// On property select, fetch units for that property
// Filter to vacant units only (no active lease)
// Show unit info after selection
```

**Step 2 — Lease Terms:**
```tsx
// Start date: default to 1st of next month
// End date: default to start + 12 months
// Rent: currency input with $ prefix
// Deposit: optional currency input
// Type: toggle between "Fixed Term" and "Month-to-Month"
// For month-to-month: hide end date
```

**Step 3 — Tenant Assignment:**
```tsx
// Two tabs or radio: "Existing Tenant" / "Invite New Tenant"
// Existing: searchable dropdown of profiles with tenant role
// New: name + email fields (will create invitation on lease creation)
// Show selected tenant info card
```

**Step 4 — Review:**
```tsx
// Property: {name} — {address}
// Unit: {label} ({bedrooms}bd/{bathrooms}ba)
// Tenant: {name} ({email})
// Term: {startDate} to {endDate} (or "Month-to-month")
// Rent: ${amount}/month
// Deposit: ${amount} or "None"
// [Create Lease] button
```

**On submit:**
1. Call `createLease` action with form data
2. If tenant is "invite new": also trigger tenant invitation (from Sprint 65's `sendTenantInvitation`)
3. On success: close modal, revalidate leases section
4. On error: show error message, stay on review step

### Part B: Invoice Email

**In `lib/invoice-email.ts`:**
```typescript
export function buildInvoiceEmail(params: {
  managerName: string;
  managerEmail: string;
  ownerName: string;
  amount: string;
  description: string;
  propertyName: string;
  invoiceNumber: string;
  date: string;
  dashboardUrl: string;
}): { subject: string; html: string } {
  // Subject: "Invoice #{invoiceNumber} from {ownerName} — {amount}"
  // Body: Use branded email shell from email-templates.ts
  // Include: invoice details table, "View in Domus" CTA button
}
```

**In `app/actions/manager-payments.ts`:**
After recording a payment, send the invoice:
```typescript
// 1. Build invoice email
// 2. Generate invoice PDF (via @react-pdf/renderer)
// 3. Send email via Resend with PDF attachment
// 4. Log success/failure with sideEffectError pattern
```

### Part C: Invoice PDF Template

**In `lib/pdf/invoice-template.tsx`:**

Follow the same style as `receipt-template.tsx`:
- Domus branding header (purple bar, "Domus" text)
- "INVOICE" title
- Invoice number, date
- From: Owner name
- To: Manager name, email
- Description of service
- Amount
- Property name
- Footer: "Generated by Domus"

### Part D: Unit Tests

Lease wizard tests:
1. Validates required fields per step (property, unit, dates, rent, tenant)
2. End date must be after start date
3. Rent must be positive number
4. Month-to-month hides end date requirement

Invoice email tests:
1. Subject line includes invoice number and amount
2. HTML body includes manager name and amount
3. All required fields present in output

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] "New Lease" button in leases section opens wizard modal
2. [ ] Step 1: property and unit dropdowns work, units filtered to vacant only
3. [ ] Step 2: date pickers, rent input, deposit input, lease type toggle all functional
4. [ ] Step 3: can select existing tenant or enter new tenant info
5. [ ] Step 4: review shows all selections, "Create Lease" submits successfully
6. [ ] Wizard closes on success, leases section refreshes
7. [ ] Manager payment recording sends invoice email via Resend
8. [ ] Invoice email includes PDF attachment with Domus branding
9. [ ] Invoice PDF downloadable via `/api/pdf/invoice/[paymentId]`
10. [ ] Owner CC'd on invoice emails
11. [ ] 6+ unit tests passing
12. [ ] `npm run gate:web` passes
13. [ ] No regressions to existing lease or payment functionality

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
LEASE_WIZARD: working | broken
INVOICE_EMAIL: working | broken
INVOICE_PDF: working | broken
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Follow the EXACT modal pattern from property-wizard.tsx + modal-overlay.tsx
- Use existing createLease action — extend it if needed, don't replace
- Use existing Resend integration pattern for email sending
- Use existing @react-pdf/renderer setup for PDF generation
- Invoice emails are fire-and-forget (use sideEffectError pattern, don't block payment recording)
