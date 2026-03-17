# Sprint 18 — Ship-Ready Mega Sprint

## 1. Objective

Make Domus production-ready overnight. This sprint covers everything that doesn't require user input: lease lifecycle management, maintenance conversation threads, tenant payment history + receipts, tenant lease details view, lease expiration cron, late fee configuration UI, dashboard polish, Sprint 16 code audit, and unit tests.

## 2. Context

- Branch: `main`
- HEAD: `10a0a11`
- Deploy URL: `https://domusbase.com`
- Gate: 239/239 tests, lint clean, build clean
- Supabase project: `vawqdqkaguhdgfhdebqw`

**DB migrations already applied by Claude via MCP:**

1. `sprint18_lease_lifecycle`:
   - `leases.renewed_from_lease_id` (uuid FK → leases)
   - `leases.termination_reason` (text)
   - `leases.terminated_at` (timestamptz)
   - `rent_charges.category` constraint: `('rent', 'late_fee', 'deposit', 'utility', 'other')`
   - `leases.lease_status` constraint: `('active', 'expired', 'terminated', 'renewed')`

2. `sprint18_maintenance_comments`:
   - New table: `maintenance_comments` (id, ticket_id, author_id, body, is_internal, created_at)
   - RLS: tenants see non-internal comments on their tickets; property admins see all comments; users can insert on accessible tickets; service role full access

**Pre-existing columns (already in DB):**
- `leases.lease_status` (text, default 'active')
- `leases.late_fee_cents` (integer, default 0)
- `leases.grace_period_days` (integer, default 5)
- `leases.active` (boolean, default true) — existing active flag
- `rent_charges.category` (text, default 'rent')
- `rent_charges.parent_charge_id` (uuid, nullable)
- `maintenance_tickets.priority` (text, default 'medium')
- `maintenance_tickets.resolved_at` (timestamptz, nullable)

**Late fee automation already exists in `lib/charges.ts`:** The `generateMonthlyChargesForPropertyIdsWithClient` function already marks overdue charges as "late", creates `late_fee` charges with `parent_charge_id`, and sends `late_rent` notifications. What's missing is the UI to configure `late_fee_cents` and `grace_period_days` on the lease form.

## 3. In Scope

- Part A: Lease Lifecycle (renewal, termination, status badges, late fee config UI)
- Part B: Maintenance Comments (conversation thread, internal notes)
- Part C: Tenant Payment History + Printable Receipts
- Part D: Tenant Lease Details View
- Part E: Lease Expiration Cron
- Part F: Dashboard Polish (empty states, loading)
- Part G: Sprint 16 Code Audit
- Part H: Unit Tests

## 4. Out of Scope

- Stripe live mode switch (operational, not code)
- Partial payments
- Charge disputes
- Pricing tiers / Stripe Billing
- Mobile app changes
- DB migrations (already applied)
- Any external service configuration (Resend, Stripe Dashboard)

## 5. Exact Files Expected to Change

| # | File | Action | Part |
|---|---|---|---|
| 1 | `lib/validations.ts` | MODIFY | A, B |
| 2 | `app/actions/leases.ts` or `app/actions/index.ts` | MODIFY | A |
| 3 | `lib/leases.ts` or relevant lib | MODIFY | A, D |
| 4 | `components/dashboard/leases-section.tsx` | MODIFY | A |
| 5 | `lib/maintenance.ts` | MODIFY | B |
| 6 | `app/actions/index.ts` | MODIFY | B |
| 7 | `components/dashboard/maintenance-section.tsx` | MODIFY | B |
| 8 | `components/dashboard/maintenance-comment-thread.tsx` | NEW | B |
| 9 | `lib/payments.ts` or new `lib/payment-history.ts` | MODIFY/NEW | C |
| 10 | `app/tenant/page.tsx` | MODIFY | C, D |
| 11 | `app/payments/receipt/[chargeId]/page.tsx` | NEW | C |
| 12 | `components/dashboard/tenant-lease-details.tsx` | NEW | D |
| 13 | `lib/charges.ts` | MODIFY | E |
| 14 | `app/api/cron/generate-charges/route.ts` | MODIFY | E |
| 15 | `components/dashboard/empty-state.tsx` | NEW | F |
| 16 | Various section files | MODIFY | F |
| 17 | Sprint 16 files (if issues found) | MODIFY | G |
| 18 | `lib/__tests__/leases.test.ts` | NEW | H |
| 19 | `lib/__tests__/maintenance-comments.test.ts` | NEW | H |
| 20 | `components/dashboard/types.ts` | MODIFY | A, B |

**Estimated: ~5 new files, ~15 modified files**

## 6. Implementation Requirements

---

### Part A: Lease Lifecycle

#### A1. Validation Schemas (`lib/validations.ts`)

Add these schemas:

```typescript
export const renewLeaseSchema = z.object({
  leaseId: z.string().uuid("Invalid lease ID."),
  newStartDate: z.string().min(1, "Start date is required."),
  newEndDate: z.string().min(1, "End date is required."),
  newMonthlyRentDollars: z.coerce.number().min(0.01, "Rent must be positive."),
  newDueDayOfMonth: z.coerce.number().int().min(1).max(28, "Due day must be 1-28."),
});

export const terminateLeaseSchema = z.object({
  leaseId: z.string().uuid("Invalid lease ID."),
  terminationReason: z.string().min(1, "Reason is required.").max(500),
});

export const updateLateFeeSchema = z.object({
  leaseId: z.string().uuid("Invalid lease ID."),
  lateFeeDollars: z.coerce.number().min(0, "Cannot be negative."),
  gracePeriodDays: z.coerce.number().int().min(0).max(30, "Must be 0-30 days."),
});
```

#### A2. Server Actions

**`renewLease` action:**
1. Auth check: user must be owner or manager of the property
2. Validate with `renewLeaseSchema`
3. Fetch the existing lease, verify `lease_status = 'active'`
4. Create a NEW lease row with same `unit_id`, `tenant_profile_id`, new dates/rent, `renewed_from_lease_id = oldLeaseId`
5. Update old lease: set `lease_status = 'renewed'`, `active = false`
6. Notify tenant: "Your lease has been renewed"
7. Return ActionState

**`terminateLease` action:**
1. Auth check: user must be owner or manager of the property
2. Validate with `terminateLeaseSchema`
3. Fetch the lease, verify `lease_status = 'active'`
4. Update lease: `lease_status = 'terminated'`, `active = false`, `termination_reason`, `terminated_at = now()`
5. Notify tenant: "Your lease has been terminated"
6. Return ActionState

**Export both from `app/actions/index.ts`.**

#### A3. Late Fee Configuration UI

In the lease create and update forms (wherever they exist — likely in the leases section or onboarding wizard), add two optional fields:

- **Late Fee ($):** number input, `name="lateFeeDollars"`, default: 5% of monthly rent (calculated). If monthly rent is $1,500, show default $75.00.
- **Grace Period (days):** number input, `name="gracePeriodDays"`, default: 5, range 0-30.

Update `createLeaseSchema` and `updateLeaseSchema` to include these optional fields:
```typescript
lateFeeDollars: z.coerce.number().min(0).optional().default(0),
gracePeriodDays: z.coerce.number().int().min(0).max(30).optional().default(5),
```

In the `createLease` and `updateLease` actions, persist these to the database as `late_fee_cents` (dollars × 100) and `grace_period_days`.

#### A4. Lease Status Badges

In the leases section UI, show a badge next to each lease indicating status:
- `active` → green badge "Active"
- `expired` → amber badge "Expired"
- `terminated` → red badge "Terminated"
- `renewed` → blue badge "Renewed"

Add "Renew" and "Terminate" action buttons on active leases (owner/manager only).

#### A5. Dashboard Props

Add `onRenewLease` and `onTerminateLease` as optional `StatefulAction` props in `DashboardProps` (`types.ts`). Pass from both owner and manager pages.

---

### Part B: Maintenance Comments

#### B1. Types and Data Fetching (`lib/maintenance.ts`)

Add:
```typescript
export interface MaintenanceComment {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;    // joined from profiles
  authorRole: string;    // "owner" | "manager" | "tenant"
  body: string;
  isInternal: boolean;
  createdAt: string;
}
```

Add function:
```typescript
export async function getTicketComments(ticketId: string): Promise<MaintenanceComment[]>
```

Query `maintenance_comments` joined with `profiles` (for name). RLS will filter based on the user's role. Order by `created_at ASC`.

Also update the existing `getOwnerMaintenanceData` / `getTenantMaintenanceData` to include a `commentCount` field on each ticket (subquery or left join count).

#### B2. Validation Schema (`lib/validations.ts`)

```typescript
export const addTicketCommentSchema = z.object({
  ticketId: z.string().uuid("Invalid ticket ID."),
  body: z.string().min(1, "Comment cannot be empty.").max(2000),
  isInternal: z.enum(["true", "false"]).optional().default("false"),
});
```

#### B3. Server Action

**`addTicketComment` action:**
1. Auth check: user must be the ticket's tenant OR an owner/manager of the property
2. Validate with `addTicketCommentSchema`
3. If `isInternal = "true"`, verify the user is an owner/manager (tenants cannot add internal notes)
4. Get the user's profile role for this property context
5. Insert into `maintenance_comments`: `{ ticket_id, author_id: userId, body, is_internal }`
6. If the comment author is owner/manager, notify the tenant: "New update on your maintenance request: {ticketTitle}"
7. If the comment author is tenant, notify property admins: "Tenant added a comment on: {ticketTitle}"
8. Return ActionState

Export from `app/actions/index.ts`.

#### B4. Comment Thread Component (`maintenance-comment-thread.tsx`)

New client component. Props:
```typescript
interface CommentThreadProps {
  ticketId: string;
  comments: MaintenanceComment[];
  onAddComment: StatefulAction;
  canAddInternal?: boolean;  // true for owner/manager
}
```

UI:
- Chronological message list (like a chat)
- Author name + role badge + timestamp per message
- Internal notes highlighted with a subtle amber background and "Internal" badge
- Text input + "Add Comment" button at the bottom
- Checkbox: "Internal note (visible only to owner/manager)" — only shown if `canAddInternal`

#### B5. Maintenance Section Updates

Modify `maintenance-section.tsx` to:
- Show comment count badge on each ticket card
- Add an expandable section or modal for each ticket showing the comment thread
- Pass `onAddComment` action through from dashboard props

Add `onAddTicketComment` as optional `StatefulAction` in `DashboardProps` (`types.ts`). Pass from owner, manager, and tenant pages.

---

### Part C: Tenant Payment History + Receipts

#### C1. Data Fetching

Add function to `lib/charges.ts` or new `lib/payment-history.ts`:

```typescript
export interface PaymentHistoryItem {
  chargeId: string;
  paymentId: string;
  paidAt: string;
  amountCents: number;
  method: string;           // "card", "manual", "autopay"
  category: string;         // "rent", "late_fee"
  dueDate: string;
  propertyName: string;
  unitNumber: string;
  referenceNote: string | null;
}

export async function getTenantPaymentHistory(userId: string): Promise<PaymentHistoryItem[]>
```

Query: `payments` → `rent_charges` → `leases` → `units` → `properties`, filtered by `leases.tenant_profile_id = userId`. Order by `paid_at DESC`. Limit 50.

#### C2. Tenant Page Integration

In `app/tenant/page.tsx`:
1. Call `getTenantPaymentHistory(user.id)` in the data fetch block
2. Add a "Payment History" section below the charges section
3. Show a table/list: Date, Amount, Property/Unit, Method, Category
4. Each row has a "View Receipt" link → `/payments/receipt/{chargeId}`

#### C3. Receipt Page (`app/payments/receipt/[chargeId]/page.tsx`)

New server component. Auth-gated: user must be the tenant on the lease.

Layout (printable):
- Domus logo + "Payment Receipt" header
- Property name, unit number
- Charge details: category, due date, amount
- Payment details: date paid, method, reference
- Footer: "Thank you for your payment" + timestamp
- Print button: `window.print()` in a small client component
- Use `@media print` CSS to hide the button and nav during printing

---

### Part D: Tenant Lease Details View

#### D1. Data Fetching

Add function (in `lib/leases.ts` or `lib/dashboard.ts`):

```typescript
export interface TenantLeaseDetails {
  leaseId: string;
  propertyName: string;
  unitNumber: string;
  startDate: string;
  endDate: string;
  monthlyRentCents: number;
  depositCents: number;
  dueDayOfMonth: number;
  lateFeeCents: number;
  gracePeriodDays: number;
  leaseStatus: string;
  daysRemaining: number;    // computed
}

export async function getTenantLeaseDetails(userId: string): Promise<TenantLeaseDetails[]>
```

Query: `leases` → `units` → `properties`, filtered by `tenant_profile_id = userId` AND `active = true` (or `lease_status = 'active'`).

#### D2. Tenant Page Integration

Add a "My Lease" section to the tenant page, above charges. Show:
- Property name + Unit number
- Lease period (start → end) with days remaining
- Monthly rent amount
- Security deposit
- Due day, late fee, grace period
- Status badge

If the lease is within 30 days of expiring, show an amber "Expiring Soon" badge.

---

### Part E: Lease Expiration Cron

#### E1. Expiration Detection (`lib/charges.ts`)

Add function:

```typescript
export async function detectExpiredLeases(supabase: SupabaseClient): Promise<string> {
  // 1. Find active leases where end_date < today
  // 2. Update lease_status = 'expired', active = false
  // 3. Notify tenant: "Your lease for {unit} at {property} has expired"
  // 4. Notify property admins: "Lease for {tenantEmail} at {unit} has expired"
  // 5. Return summary: "Expired leases detected: N"
}
```

Also add:

```typescript
export async function sendLeaseExpirationWarnings(supabase: SupabaseClient): Promise<string> {
  // 1. Find active leases where end_date is within 30 days from today
  //    AND lease_status is still 'active' (not already warned — use a simple "don't re-warn" check)
  // 2. Send notification: "Your lease expires on {endDate}. Contact your landlord about renewal."
  // 3. Return summary: "Expiration warnings sent: N"
}
```

For "don't re-warn": check if a notification of type `lease_expiring_soon` already exists for this lease entity within the last 30 days. If so, skip.

Add `"lease_expiring_soon"` and `"lease_expired"` to the NotificationType union in `lib/notifications.ts`.

#### E2. Cron Route Integration

In `app/api/cron/generate-charges/route.ts`, add after autopay processing and before reminders:

```typescript
const expirationSummary = await detectExpiredLeases(adminClient);
const warningSummary = await sendLeaseExpirationWarnings(adminClient);
```

Include both summaries in the response JSON.

---

### Part F: Dashboard Polish

#### F1. Reusable Empty State Component (`components/dashboard/empty-state.tsx`)

```typescript
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}
```

Clean card with centered icon, title, description, and optional action button. Use zinc-100 background, zinc-400 icon.

#### F2. Apply Empty States

Add empty states to these sections when data is empty:
- **Charges:** "No charges yet. Charges are generated automatically on the 1st of each month."
- **Maintenance:** "No maintenance tickets. Your properties are in great shape!"
- **Payments:** "No payments recorded yet."
- **Leases:** "No leases yet. Create a lease to start collecting rent."
- **Documents:** "No documents yet."
- **Payment History (tenant):** "No payments yet. Your payment history will appear here."

Use the existing section files — just add a conditional render at the top when the data array is empty.

---

### Part G: Sprint 16 Code Audit

Review these Sprint 16 files for correctness:
1. `components/ui/modal-overlay.tsx` — check escape key handler cleanup, body scroll lock cleanup
2. `components/onboarding/onboarding-wizard.tsx` — check step progression, state management
3. `components/onboarding/steps/*.tsx` — check form submissions, error handling, `useFormState` usage
4. `components/auth/login-form.tsx` — check loading state transitions, no race conditions
5. `lib/format.ts` — verify `formatCurrency` handles edge cases
6. `lib/stripe-connect.ts` — verify fallback owner lookup is correct
7. `app/tenant/page.tsx` — verify the redesigned tenant page has no import/render issues

If you find any bugs or issues, fix them. If everything is clean, report "Sprint 16 audit: no issues found."

---

### Part H: Unit Tests

#### H1. Lease Lifecycle Tests (`lib/__tests__/leases.test.ts`)

Test the validation schemas:
- `renewLeaseSchema`: valid input, missing fields, invalid dates
- `terminateLeaseSchema`: valid input, missing reason, too-long reason
- `updateLateFeeSchema`: valid input, negative fee, grace period out of range

#### H2. Maintenance Comment Tests (`lib/__tests__/maintenance-comments.test.ts`)

Test the validation schema:
- `addTicketCommentSchema`: valid input, empty body, body too long, internal flag

#### H3. Format Tests (already exist — 7 tests in `format.test.ts`)

No changes needed.

---

## 7. Validation Commands to Run

```bash
npm run gate:web
```

This runs: tests (expect 250+), lint, typecheck, and production build.

## 8. Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | `renewLease` action creates new lease, marks old as 'renewed', notifies tenant |
| 2 | `terminateLease` action marks lease terminated with reason, notifies tenant |
| 3 | Lease status badges (active/expired/terminated/renewed) visible in leases section |
| 4 | Late fee config fields (amount + grace period) on lease create/update forms |
| 5 | `addTicketComment` action inserts comment, notifies other party |
| 6 | Comment thread component renders chronological messages with role badges |
| 7 | Internal notes only visible to/creatable by owners/managers |
| 8 | Tenant payment history section shows past payments |
| 9 | Receipt page at `/payments/receipt/[chargeId]` renders printable receipt |
| 10 | Tenant "My Lease" section shows lease details + days remaining |
| 11 | Cron detects expired leases and sends notifications |
| 12 | Cron sends 30-day expiration warnings (without re-warning) |
| 13 | `lease_expiring_soon` and `lease_expired` added to NotificationType |
| 14 | Empty state component used in 6+ sections |
| 15 | Sprint 16 audit completed (issues fixed or "no issues found" reported) |
| 16 | New validation schema tests pass (leases + comments) |
| 17 | `npm run gate:web` passes (250+ tests, lint clean, build clean) |
| 18 | No DB migrations created (all schema changes pre-applied) |
| 19 | `onRenewLease`, `onTerminateLease`, `onAddTicketComment` added to DashboardProps |
| 20 | Both owner and manager pages pass the new actions |

## 9. Report Format

```
gate_passed: true/false
test_count: N
lint_clean: true/false
build_clean: true/false
files_created: [list]
files_modified: [list]
sprint16_audit: clean/issues_fixed
acceptance_criteria: [1-20: pass/fail]
```

## 10. Constraints

- Do NOT apply any DB migrations — all schema changes are pre-applied
- Do NOT deploy
- Do NOT create documentation files
- Do NOT pass `onUpdateManagementFee` to manager dashboard (owner-only)
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Report compact status only
- Every Supabase `.update()`, `.insert()`, `.delete()` call must have its error result checked (even secondary operations)
- Use `useFormState` from `react-dom` (NOT `useActionState` from `react`) — React 18 / Next.js 14.2.5
- Follow existing patterns: `StatefulAction` type, `parseFormData()` for validation, `createNotificationWithDelivery()` for notifications
- Late fee default: when creating a lease, if no late fee specified, suggest 5% of monthly rent as the default value in the UI
