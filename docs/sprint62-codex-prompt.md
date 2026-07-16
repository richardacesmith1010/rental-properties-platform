# Sprint 62 — Codex Implementation Prompt

## 1. Objective

Build a manager payment system with recurring commission/fee support, one-off reimbursements, PDF invoice generation, fix all low-contrast status summary bars, and add a proper step-by-step property creation wizard.

## 2. Context

- **Branch**: `main`
- **HEAD**: `a8a0e6b`
- **Production URL**: `https://domusbase.com`
- **Supabase project**: `vawqdqkaguhdgfhdebqw`

**Existing infrastructure:**
- `property_managers` table: `property_id`, `manager_profile_id`, `active`
- `property_expenses` table: `category`, `amount_cents`, `recurring`, `recurring_frequency`, `vendor_id`
- `lib/pdf/` — PDF generation with `@react-pdf/renderer` (receipt + lease templates exist)
- `lib/email-templates.ts` — branded email shell
- `lib/status-colors.ts` — status color utility
- Manager invite flow in `app/actions/invitations.ts`
- No existing commission/management fee tables

**Contrast issue:** `charges-section.tsx` line ~334 uses `text-amber-700` on `bg-zinc-50/80` — poor contrast in dark mode. Similar pattern may exist in other summary bars.

## 3. In Scope

### Part A: Manager Payment Migration
- New `manager_payments` table for tracking all payments to managers
- New `manager_payment_configs` table for recurring commission/fee setup

### Part B: Manager Payment Configuration
- Owner can set up payment terms per manager per property:
  - **Percentage-based**: e.g., 9% of monthly rent ($2,350 → $211.50/month)
  - **Flat fee**: e.g., $500/month
- Payment frequency: monthly
- Description/label for the payment (e.g., "Property Management Fee")

### Part C: Manager Payment Types
Three payment types:
1. **Recurring commission/fee** — auto-calculated monthly based on config (percentage of rent or flat fee)
2. **Reimbursement** — one-off payment for out-of-pocket expenses the manager paid (e.g., changing locks, emergency repair)
3. **Custom payment** — owner-defined payment with custom description and amount

Each payment has:
- Amount (auto-calculated for recurring, manual for reimbursement/custom)
- Category/type (commission, reimbursement, custom)
- Description (what it's for)
- Status (pending, paid, cancelled)
- Date
- Associated property
- Associated manager

### Part D: PDF Invoice Generation
- Professional invoice PDF for each manager payment
- Includes: invoice number, date, from (owner), to (manager), property address, line items, total, payment type
- Downloadable by both owner and manager
- Uses existing `lib/pdf/` infrastructure

### Part E: Manager Payment Dashboard Section
- New "Manager Payments" section in the owner dashboard
- Shows: active payment configs, pending payments, payment history
- "Record Payment" button for one-off reimbursements and custom payments
- "Set Up Recurring" button to configure commission/fee
- Invoice download button on each payment record

### Part F: Email Invoice Delivery
- When a payment is recorded, email the invoice PDF to both owner and manager
- Uses existing Resend + email template infrastructure

### Part G: Fix Low-Contrast Status Summary Bars
- Fix `charges-section.tsx` summary bar (line ~334): replace `bg-zinc-50/80` with a dark-mode-compatible background
- Search for ALL similar summary/status bars across the app and fix them
- Use the `status-colors.ts` system consistently
- Ensure WCAG AA contrast ratio for all status text on all backgrounds

### Part H: Property Creation Wizard
Currently, clicking "New Property" in the sidebar just switches the dashboard mode label — it does NOT open a form or wizard. This is broken UX.

**Build a proper step-by-step wizard** that opens when the user clicks "New Property":

**Step 1 — Property Details:**
- Property name (e.g., "Oak Street Duplex")
- Address (street, city, state, zip)
- Property type (single family, duplex, triplex, apartment, condo, townhouse)
- Submit creates the property in the DB

**Step 2 — Add Units:**
- "Add Unit" button to add one or more units
- Each unit: label (e.g., "Unit A", "1BR Upstairs"), bedrooms, bathrooms, square footage (optional)
- Shows added units in a list with remove button
- "Add Another Unit" button
- Can skip if single-family (auto-create one unit named "Main")

**Step 3 — Assign Manager (optional):**
- "Do you have a property manager?" Yes/No
- If yes: email input to invite them, or select from existing managers
- Can skip

**Step 4 — Done:**
- Success screen: "Property created! Here's what you can do next:"
- Quick links: "Create a Lease", "Invite a Tenant", "Back to Dashboard"

**Implementation:**
- Create a new component: `apps/web/components/dashboard/property-wizard.tsx`
- The wizard should be a **modal/dialog** that opens over the dashboard, NOT a page navigation
- Use the existing `createProperty` and `createUnit` actions from `app/actions/properties.ts` and `app/actions/units.ts`
- Use the existing `inviteManager` action from `app/actions/invitations.ts`
- Progress indicator showing which step you're on (1 of 4)
- Back/Next buttons on each step
- The wizard should close and refresh the dashboard on completion

**Wire it up:**
- When user clicks "New Property" in sidebar nav, open the wizard modal instead of switching mode
- Also trigger from the onboarding checklist "Add Your First Property" button

### Part I: Paginated Dashboard Layout (No-Scroll)

The current Daily Ops view stacks everything vertically — greeting, KPI pills, overview snapshot, KPI grid, collection bar, etc. — requiring the user to scroll. This is bad UX.

**Redesign the Daily Ops layout into a paginated, no-scroll experience:**

**Fixed header zone** (always visible, never scrolls):
- Greeting ("Good afternoon, Ace")
- Status line ("Everything looks good - no action items today")
- 4 KPI pills (Monthly Revenue, Occupancy, Open Tickets, Overdue Charges)
- Mode label bar ("Daily Operations Mode")

**Content zone** (below the header, fills remaining viewport height):
- Shows ONE section at a time, sized to fit the viewport without scrolling
- Left/right arrow buttons to navigate between sections
- Section title with current section name (e.g., "Overview", "Charges", "Portfolio")
- Optional: dot indicators or breadcrumb showing which page you're on (e.g., "2 of 7")

**Section order when pressing right arrow:**
1. Overview (snapshot + KPI grid + collection bar — condensed to fit one screen)
2. Charges
3. Portfolio
4. Maintenance
5. Leases
6. Manager Payments (new)
7. Analytics

**Key behaviors:**
- The content zone should use `height: calc(100vh - headerHeight)` or flexbox to fill exactly the remaining viewport
- Each section's content must be designed to fit within this zone WITHOUT scrolling. If a section has too much content (e.g., a long list of charges), show the first N items with a "View all" link that expands or opens a detail view
- Left arrow on first section wraps to last, right arrow on last wraps to first (carousel behavior)
- Keyboard support: left/right arrow keys navigate between sections
- The sidebar nav items (Records, Analytics, Reports) should also set the active section when clicked
- On initial load, show the Overview section (or no section — just the header with KPI pills, requiring one right-arrow press to see Overview)

**Implementation approach:**
- Modify `section-renderer.tsx` to render only the active section (it may already do this)
- Ensure the content zone has `overflow: hidden` (no scrollbar) and each section is constrained to the available height
- The arrow buttons already exist at the top right of the "Overview" heading — keep them but make them more prominent
- Remove the vertical stacking of the header + content — use a flex column layout where the header is fixed and the content zone fills the rest

**IMPORTANT:** The greeting + KPI pills at the top should NOT be part of the paginated content. They are always visible. Only the section below them paginates.

**On mobile:** The arrows should be swipeable (touch gesture left/right) in addition to tap targets.

## 4. Out of Scope

- Actual Stripe payouts to managers (manual payment tracking only for now)
- Autopay to managers
- Tax form generation (1099, W-9)
- Manager-side payment dashboard (manager can see invoices but can't manage payments)
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (10-12)
1. `supabase/migrations/20260321_sprint62_manager_payments.sql`
2. `apps/web/app/actions/manager-payments.ts` — CRUD actions for payments and configs
3. `apps/web/lib/manager-payments.ts` — DTOs, helpers, commission calculation
4. `apps/web/lib/pdf/manager-invoice-template.tsx` — PDF invoice template
5. `apps/web/app/api/pdf/manager-invoice/[paymentId]/route.ts` — invoice PDF API route
6. `apps/web/components/dashboard/manager-payments-section.tsx` — owner dashboard section
7. `apps/web/components/dashboard/manager-payment-form.tsx` — payment recording form
8. `apps/web/components/dashboard/manager-config-form.tsx` — recurring payment setup form
9. `apps/web/components/dashboard/property-wizard.tsx` — step-by-step property creation wizard modal
10. `apps/web/lib/__tests__/manager-payments.test.ts` — unit tests
11. `apps/web/lib/__tests__/commission-calc.test.ts` — commission calculation tests

### Modified Files (6-8)
1. `apps/web/components/dashboard/charges-section.tsx` — fix summary bar contrast
2. `apps/web/components/dashboard/section-map.ts` — register manager payments section
3. `apps/web/components/dashboard/section-renderer.tsx` — wire up manager payments
4. `apps/web/components/dashboard/sidebar/nav-items.ts` — add Manager Payments nav item + fix New Property click to open wizard
5. `apps/web/components/dashboard/types.ts` — add manager payment types
6. `apps/web/components/dashboard/index.tsx` or `dashboard-layout.tsx` — render property wizard modal
7. `apps/web/components/dashboard/welcome-card.tsx` — wire "Add Your First Property" button to open wizard
8. Any other files with low-contrast summary bars (search and fix all)

## 6. Implementation Requirements

### Part A: Migration

**File: `supabase/migrations/20260321_sprint62_manager_payments.sql`**

```sql
-- Manager payment configuration (recurring terms)
CREATE TABLE IF NOT EXISTS manager_payment_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  manager_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('percentage', 'flat')),
  percentage_rate NUMERIC(5,2),  -- e.g., 9.00 for 9%
  flat_amount_cents INTEGER,      -- e.g., 50000 for $500.00
  base_rent_cents INTEGER,        -- rent amount the percentage is calculated on
  label TEXT NOT NULL DEFAULT 'Property Management Fee',
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'biweekly', 'weekly')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property_id, manager_profile_id),
  CHECK (
    (payment_type = 'percentage' AND percentage_rate IS NOT NULL) OR
    (payment_type = 'flat' AND flat_amount_cents IS NOT NULL)
  )
);

-- Individual manager payments (both recurring and one-off)
CREATE TABLE IF NOT EXISTS manager_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  manager_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  config_id UUID REFERENCES manager_payment_configs(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('commission', 'reimbursement', 'custom')),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_at TIMESTAMPTZ,
  invoice_number TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_manager_payment_configs_property ON manager_payment_configs(property_id);
CREATE INDEX IF NOT EXISTS idx_manager_payment_configs_manager ON manager_payment_configs(manager_profile_id);
CREATE INDEX IF NOT EXISTS idx_manager_payments_property ON manager_payments(property_id);
CREATE INDEX IF NOT EXISTS idx_manager_payments_manager ON manager_payments(manager_profile_id);
CREATE INDEX IF NOT EXISTS idx_manager_payments_status ON manager_payments(status);
CREATE INDEX IF NOT EXISTS idx_manager_payments_date ON manager_payments(payment_date);

-- RLS
ALTER TABLE manager_payment_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_payments ENABLE ROW LEVEL SECURITY;

-- Config policies: owner of the property can manage, manager can view their own
CREATE POLICY "Property owner can manage payment configs" ON manager_payment_configs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Manager can view own payment configs" ON manager_payment_configs
  FOR SELECT USING (manager_profile_id = auth.uid());

-- Payment policies: owner can manage, manager can view their own
CREATE POLICY "Property owner can manage payments" ON manager_payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Manager can view own payments" ON manager_payments
  FOR SELECT USING (manager_profile_id = auth.uid());
```

### Part B: Commission Calculation Helper

**File: `lib/manager-payments.ts`**

```typescript
export interface ManagerPaymentConfigDTO {
  id: string;
  propertyId: string;
  managerProfileId: string;
  managerName: string;
  managerEmail: string;
  paymentType: "percentage" | "flat";
  percentageRate: number | null;    // 9.00 = 9%
  flatAmountCents: number | null;
  baseRentCents: number | null;
  label: string;
  frequency: string;
  active: boolean;
  calculatedAmountCents: number;    // computed: either flat or percentage * base
}

export interface ManagerPaymentDTO {
  id: string;
  propertyId: string;
  propertyAddress: string;
  managerProfileId: string;
  managerName: string;
  managerEmail: string;
  category: "commission" | "reimbursement" | "custom";
  description: string;
  amountCents: number;
  status: "pending" | "paid" | "cancelled";
  paymentDate: string;
  paidAt: string | null;
  invoiceNumber: string | null;
  notes: string | null;
  createdAt: string;
}

export function calculateCommission(baseRentCents: number, percentageRate: number): number {
  return Math.round(baseRentCents * (percentageRate / 100));
}

export function generateInvoiceNumber(paymentId: string): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const idPart = paymentId.slice(0, 6).toUpperCase();
  return `INV-${datePart}-${idPart}`;
}
```

### Part C: Server Actions

**File: `app/actions/manager-payments.ts`**

Actions to implement:

```typescript
// setupManagerPaymentConfig(formData)
// Creates or updates recurring payment config for a manager on a property
// Fields: propertyId, managerProfileId, paymentType, percentageRate?, flatAmountCents?, baseRentCents?, label
// Validates: owner must own the property, manager must be assigned to it

// recordManagerPayment(formData)
// Creates a one-off payment record (reimbursement or custom)
// Fields: propertyId, managerProfileId, category, description, amountCents, notes
// Auto-generates invoice number
// Sends email notification to manager with invoice

// markPaymentPaid(formData)
// Updates payment status to 'paid', sets paid_at timestamp
// Sends confirmation email to both owner and manager

// cancelPayment(formData)
// Updates payment status to 'cancelled'

// generateMonthlyManagerPayments()
// Called by cron or manually
// For each active config: creates a pending payment record for the current month
// Calculates amount based on config (percentage of base rent or flat fee)
// Generates invoice number
// Emails invoice to manager

// getManagerPayments(propertyId?, managerId?)
// Fetches payments with optional filters
// Returns ManagerPaymentDTO[]

// getManagerPaymentConfigs(propertyId?)
// Fetches active configs
// Returns ManagerPaymentConfigDTO[]
```

### Part D: PDF Invoice Template

**File: `lib/pdf/manager-invoice-template.tsx`**

Follow the existing receipt template pattern in `lib/pdf/receipt-template.tsx`:

```typescript
interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  fromName: string;          // owner name
  fromEmail: string;
  toName: string;            // manager name
  toEmail: string;
  propertyAddress: string;
  lineItems: {
    description: string;
    amount: string;           // formatted currency
  }[];
  totalFormatted: string;
  category: string;           // "Property Management Fee", "Reimbursement", etc.
  status: string;             // "Paid" or "Pending"
  notes?: string;
}

// Layout:
// - Purple header with "INVOICE" title and Domus branding
// - Invoice number and date (top right)
// - From/To sections (owner → manager)
// - Property address
// - Line items table (description | amount)
// - Total row (bold, purple)
// - Category badge
// - Notes section (if present)
// - Footer: "Generated by Domus — domusbase.com"
```

### Part E: Invoice API Route

**File: `app/api/pdf/manager-invoice/[paymentId]/route.ts`**

Same auth pattern as receipt route:
1. Authenticate user
2. Fetch payment with property + manager profile joins
3. Verify user is property owner OR the manager
4. Build InvoiceData
5. Render PDF with `renderToBuffer`
6. Return with `Content-Type: application/pdf`

### Part F: Dashboard Section

**File: `components/dashboard/manager-payments-section.tsx`**

Layout:
- **Header**: "Manager Payments" with "Set Up Recurring" and "Record Payment" buttons
- **Active Configs Card**: Shows each manager's recurring payment setup (name, property, rate, calculated amount)
- **Pending Payments**: List of unpaid payments with "Mark Paid" and "Download Invoice" buttons
- **Payment History**: Table of past payments with status badges, amounts, dates, invoice download

**File: `components/dashboard/manager-payment-form.tsx`**

Form for recording one-off payments:
- Manager selector (dropdown of assigned managers)
- Property selector (dropdown of properties the manager is on)
- Category: Radio buttons — "Reimbursement" | "Custom Payment"
- Description: Text input (e.g., "Lock replacement at Unit 3B", "Emergency plumbing coordination")
- Amount: Dollar input
- Notes: Optional textarea
- Submit button

**File: `components/dashboard/manager-config-form.tsx`**

Form for setting up recurring payments:
- Manager selector
- Property selector
- Payment type: Radio — "Percentage of Rent" | "Flat Fee"
- If percentage: percentage input + base rent input (pre-filled from lease if available)
- If flat: amount input
- Label: Text input (default "Property Management Fee")
- Frequency: "Monthly" (default, only option for now)
- Submit button

### Part G: Fix Low-Contrast Summary Bars

**In `charges-section.tsx` line ~334:**

Replace:
```tsx
<div className="mb-4 rounded-xl border border-border/50 bg-zinc-50/80 px-3 py-2 text-sm shadow-sm">
```

With a dark-mode-compatible version:
```tsx
<div className="mb-4 rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm">
```

And update the text colors to use darker/lighter variants that work in both themes:
```tsx
<span className="font-semibold text-amber-600 dark:text-amber-400">{pendingCount} pending</span>
<span className="mx-2 text-muted-foreground">•</span>
<span className="font-semibold text-red-600 dark:text-red-400">{lateCount} late</span>
<span className="mx-2 text-muted-foreground">•</span>
<span className="font-semibold text-emerald-600 dark:text-emerald-400">{paidThisMonthCount} paid this month</span>
```

**Search the ENTIRE `components/dashboard/` directory** for similar patterns:
- `bg-zinc-50` or `bg-gray-50` with colored text
- Any status summary with `text-amber-700`, `text-red-700`, `text-emerald-700` on light backgrounds
- Fix ALL instances to use dark-mode-compatible colors

### Part H: Wire Up Navigation

In `sidebar/nav-items.ts`, add "Manager Payments" nav item under the owner Daily Ops section:
```typescript
{ label: "Manager Payments", icon: BanknoteIcon, section: "manager-payments" }
```

In `section-map.ts`, register the new section.
In `section-renderer.tsx`, wire up the section rendering.

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Migration creates `manager_payment_configs` and `manager_payments` tables with RLS
2. [ ] Owner can set up percentage-based commission (e.g., 9% of $2,350 = $211.50)
3. [ ] Owner can set up flat-fee payment
4. [ ] Owner can record one-off reimbursements with description
5. [ ] Owner can record custom payments with description
6. [ ] Each payment gets an auto-generated invoice number
7. [ ] PDF invoice downloads with Domus branding, from/to, line items, total
8. [ ] Invoice accessible to both owner and manager
9. [ ] Manager Payments section appears in owner sidebar
10. [ ] Payment history shows status badges (pending/paid/cancelled)
11. [ ] "Mark Paid" button updates payment status
12. [ ] Charges summary bar contrast fixed — visible in both light and dark mode
13. [ ] All other low-contrast summary bars fixed
14. [ ] Commission calculation has unit tests
15. [ ] Invoice number generation has unit tests
16. [ ] `npm run gate:web` passes
17. [ ] Clicking "New Property" in sidebar opens a wizard modal (not a mode switch)
18. [ ] Wizard has 4 steps: Property Details → Add Units → Assign Manager → Done
19. [ ] Wizard creates property and units in the database on completion
20. [ ] Wizard has back/next navigation and progress indicator
21. [ ] "Add Your First Property" button in onboarding checklist also opens the wizard
22. [ ] Dashboard uses paginated layout — greeting/KPIs fixed at top, content zone fills viewport
23. [ ] No vertical scrolling needed to see section content (content fits viewport)
24. [ ] Left/right arrows navigate between sections (Overview → Charges → Portfolio → etc.)
25. [ ] Arrow keys (left/right) also navigate between sections
26. [ ] Sections that have long lists show first N items with "View all" expansion
27. [ ] Current section name and position indicator visible (e.g., "2 of 7")
28. [ ] No regressions to existing features

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
PAYMENT_CONFIG: percentage working | flat working | broken
PAYMENT_RECORDING: commission | reimbursement | custom working
PDF_INVOICE: working | broken
CONTRAST_FIX: x files fixed
NAV_WIRED: yes | no
NOTES: [any issues]
```

## 10. Constraints

- Do NOT apply the migration to Supabase (Claude will apply it)
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT implement actual Stripe payouts to managers — this is manual payment tracking with invoices
- Do NOT add to the cron job yet — monthly payment generation can be triggered manually for now
- Use existing PDF infrastructure (`lib/pdf/pdf-styles.ts`, `@react-pdf/renderer`)
- Use existing email template infrastructure (`lib/email-templates.ts`)
- Follow existing section patterns for dashboard integration
- Invoice PDF route must check auth — only owner or the specific manager can download
