# Sprint 19 — Production SaaS Completion (Overnight Mega Sprint)

## 1. Objective

Transform Domus from a feature-rich prototype into a production-ready SaaS. This sprint covers: financial reporting (6 reports), audit trail, notification preferences, global search, preventive maintenance scheduling, move-in/move-out inspections, delinquency escalation, rent increase tracking, vendor performance dashboard, and bulk operations. Priority order: A → L. Complete as many parts as possible.

## 2. Context

- Branch: `main`
- HEAD: `7602e4e`
- Deploy URL: `https://domusbase.com`
- Gate: 256/256 tests (11 suites), lint clean, build clean
- Supabase project: `vawqdqkaguhdgfhdebqw`

**DB migrations already applied by Claude via MCP:**

1. `sprint19_audit_logs` — `audit_logs` (id, user_id, action, entity_type, entity_id, metadata jsonb, created_at). Indexes on user_id, entity, created_at. RLS: service_role full + property admins can view.

2. `sprint19_notification_preferences` — `notification_preferences` (id, profile_id, notification_type, email_enabled, in_app_enabled, created_at, updated_at). UNIQUE(profile_id, notification_type). RLS: users own rows + service_role.

3. `sprint19_preventive_maintenance` — `preventive_maintenance_schedules` (id, property_id, title, description, frequency_days, last_completed_at, next_due_at, assigned_vendor_id, created_by, active, created_at). RLS: property admins + service_role.

4. `sprint19_inspections` — `inspections` (id, unit_id, lease_id, type, inspector_id, status, notes, completed_at, created_at) + `inspection_items` (id, inspection_id, area, condition, notes, photo_path, created_at). RLS: property admins manage, tenants view their own.

5. `sprint19_rent_increase_history` — `rent_increase_history` (id, lease_id, previous_rent_cents, new_rent_cents, effective_date, reason, created_by, created_at). RLS: property admins manage, tenants view.

**Existing patterns to follow:**
- Server actions: auth check → validate → permission check → mutate → notify → revalidate
- `useFormState` from `react-dom` (NOT `useActionState`)
- `StatefulAction` type for dashboard action props
- `createNotificationWithDelivery()` for notifications
- `isMissingSchemaError()` for graceful schema error handling
- `DashboardProps` in `components/dashboard/types.ts` for new action props
- CSV export pattern in `lib/csv-export.ts`

## 3. In Scope

| Priority | Part | Description | Est. Complexity |
|---|---|---|---|
| P0 | A | Financial Reporting Hub (6 reports + CSV export) | High |
| P0 | B | Audit Trail (logging + activity feed) | Medium |
| P0 | C | Notification Preferences (settings UI + delivery gating) | Medium |
| P1 | D | Global Search (search component + filtering) | Medium |
| P1 | E | Delinquency Escalation (30/60/90 day tiered notifications) | Low |
| P1 | F | Preventive Maintenance Scheduling (CRUD + cron) | Medium |
| P1 | G | Move-in/Move-out Inspections (form + checklist) | Medium |
| P2 | H | Rent Increase Tracking (history + UI) | Low |
| P2 | I | Vendor Performance Dashboard (metrics + rating) | Medium |
| P2 | J | Bulk Operations (CSV import for properties/units) | Medium |
| P2 | K | Multi-Property Consolidated Reports | Low |
| P2 | L | Insurance & Compliance Tracking | Low |

**If running long, complete P0 + P1 first. P2 is nice-to-have.**

## 4. Out of Scope

- DB migrations (all pre-applied)
- Stripe live mode switch (operational)
- SMS/Twilio integration
- External API integrations (QuickBooks, Zillow)
- Mobile app changes
- Deployment
- Pricing tiers / Stripe Billing

## 5. Implementation Requirements

---

### Part A: Financial Reporting Hub (P0)

#### A1. Reports Library (`lib/reports.ts`)

Create a new module with these data fetcher functions. All take `userId: string` and use `getAdministeredPropertyIds(userId)` to scope to the user's properties.

**1. Rent Roll Report:**
```typescript
export interface RentRollItem {
  propertyName: string;
  unitNumber: string;
  tenantName: string | null;
  tenantEmail: string | null;
  monthlyRentCents: number;
  leaseStart: string;
  leaseEnd: string;
  leaseStatus: string;
  currentBalance: number;  // sum of pending + late charges
  lastPaymentDate: string | null;
}
export async function getRentRollReport(userId: string): Promise<RentRollItem[]>
```
Query: properties → units → leases (active) → profiles (tenant) + rent_charges (pending/late sum) + payments (latest).

**2. Delinquency Aging Report:**
```typescript
export interface DelinquencyItem {
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  unitNumber: string;
  current: number;     // 0-30 days past due (cents)
  thirtyDay: number;   // 31-60 days
  sixtyDay: number;    // 61-90 days
  ninetyPlus: number;  // 90+ days
  totalOwed: number;
}
export async function getDelinquencyReport(userId: string): Promise<DelinquencyItem[]>
```
Query: rent_charges where status IN ('pending', 'late'), grouped by tenant. Calculate aging buckets based on `due_date` vs today.

**3. Tenant Ledger Report:**
```typescript
export interface TenantLedgerEntry {
  date: string;
  type: 'charge' | 'payment';
  description: string;
  amount: number;       // positive = charge, negative = payment
  balance: number;      // running balance
  propertyName: string;
  unitNumber: string;
}
export interface TenantLedger {
  tenantName: string;
  tenantEmail: string;
  entries: TenantLedgerEntry[];
  totalCharges: number;
  totalPayments: number;
  currentBalance: number;
}
export async function getTenantLedgerReport(userId: string, tenantProfileId?: string): Promise<TenantLedger[]>
```
Query: rent_charges + payments for each tenant, sorted chronologically. Running balance computed client-side.

**4. Monthly P&L Report:**
```typescript
export interface MonthlyPnLRow {
  month: string;           // "2026-01"
  propertyName: string;
  rentalIncome: number;    // payments received
  lateFeeIncome: number;
  totalIncome: number;
  expenses: number;        // property_expenses
  netIncome: number;
}
export async function getMonthlyPnLReport(userId: string, year?: number): Promise<MonthlyPnLRow[]>
```
Query: payments (grouped by month + property) + property_expenses (grouped by month + property). Default year = current year.

**5. Annual Tax Summary (Schedule E format):**
```typescript
export interface TaxSummaryRow {
  propertyName: string;
  propertyAddress: string;
  totalRentalIncome: number;
  advertisingExpenses: number;
  autoAndTravel: number;
  cleaningAndMaintenance: number;
  commissions: number;
  insurance: number;
  legalAndProfessional: number;
  managementFees: number;
  mortgageInterest: number;
  repairs: number;
  supplies: number;
  taxes: number;
  utilities: number;
  otherExpenses: number;
  totalExpenses: number;
  netIncome: number;
}
export async function getTaxSummaryReport(userId: string, year?: number): Promise<TaxSummaryRow[]>
```
Query: payments grouped by property for income. property_expenses grouped by category for each Schedule E line item. Map expense categories to IRS categories.

**6. Accounts Receivable:**
```typescript
export interface ReceivableItem {
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  chargeCount: number;
  totalOwedCents: number;
  oldestDueDate: string;
}
export async function getReceivablesReport(userId: string): Promise<ReceivableItem[]>
```
Query: rent_charges where status IN ('pending', 'late'), grouped by tenant.

#### A2. CSV Export for Reports (`lib/csv-export-reports.ts`)

Create CSV export functions for each report:
```typescript
export function rentRollToCsv(data: RentRollItem[]): string
export function delinquencyToCsv(data: DelinquencyItem[]): string
export function tenantLedgerToCsv(data: TenantLedger[]): string
export function monthlyPnlToCsv(data: MonthlyPnLRow[]): string
export function taxSummaryToCsv(data: TaxSummaryRow[]): string
export function receivablesToCsv(data: ReceivableItem[]): string
```

Follow existing pattern in `lib/csv-export.ts`.

#### A3. Reports Page (`app/owner/reports/page.tsx`)

New server-rendered page. Auth-gated: owner or manager role only.

Layout:
- Page title: "Financial Reports"
- Grid of 6 report cards, each with: icon, title, description, "View Report" button
- Each card links to the report section below OR uses client-side state to show the selected report inline

Reports:
1. 📊 Rent Roll — "Current tenant roster with rent amounts and balances"
2. ⏰ Delinquency Aging — "Outstanding balances by 30/60/90+ day aging"
3. 📒 Tenant Ledger — "Complete charge and payment history per tenant"
4. 💰 Monthly P&L — "Revenue vs expenses by property by month"
5. 🏛️ Tax Summary — "Annual rental income and deductions (Schedule E format)"
6. 💳 Accounts Receivable — "All outstanding balances by tenant"

Each report rendered as a data table with sortable columns. Include "Export CSV" button per report.

Add a year selector dropdown for P&L and Tax Summary (default: current year).

#### A4. Navigation

- Add "Reports" link to sidebar nav for owner and manager roles
- The page should be accessible at `/owner/reports`
- Add the route to middleware if needed

---

### Part B: Audit Trail (P0)

#### B1. Audit Logging Utility (`lib/audit.ts`)

```typescript
export async function logAudit(params: {
  userId: string;
  action: string;        // "create_lease", "terminate_lease", "record_payment", etc.
  entityType: string;    // "lease", "property", "unit", "charge", "ticket", etc.
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void>
```

Uses admin client to insert into `audit_logs`. Fire-and-forget pattern (`.catch(() => {})`) — audit logging must never break the main action.

#### B2. Instrument Critical Actions

Add `logAudit()` calls to these server actions (at the end, after the mutation succeeds):
- `createProperty`, `updateProperty`, `deleteProperty`
- `createUnit`, `updateUnit`, `deleteUnit`
- `createLease`, `updateLease`, `deleteLease`, `renewLease`, `terminateLease`
- `recordManualPayment`
- `createMaintenanceTicket`, `updateTicketStatus`, `addTicketComment`
- `inviteTenant`, `inviteManager`, `inviteOwner`
- `createExpense`, `updateExpense`, `deleteExpense`
- `createVendor`, `assignVendorToTicket`
- `updateManagementFee`

That's ~25 actions. Each gets a one-liner at the bottom:
```typescript
void logAudit({ userId: user.id, action: "create_lease", entityType: "lease", entityId: newLease.id, metadata: { unitId, tenantProfileId } });
```

#### B3. Activity Feed Component (`components/dashboard/activity-feed.tsx`)

New client component. Props:
```typescript
interface ActivityFeedProps {
  logs: AuditLogEntry[];
  limit?: number;
}
interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  userName: string;
}
```

Renders a chronological list of recent actions with:
- Action icon (based on entityType)
- Human-readable description: `formatAuditAction(action, entityType, metadata)` → "Created lease for Unit 101"
- User name + timestamp
- Limit to most recent 20 by default

#### B4. Fetch Function (`lib/audit.ts`)

```typescript
export async function getRecentAuditLogs(userId: string, limit?: number): Promise<AuditLogEntry[]>
```

Query `audit_logs` joined with `profiles` for user names. Scope to properties the user administers. Order by `created_at DESC`. Default limit 50.

#### B5. Dashboard Integration

Add the activity feed as a new "Activity" section in the owner and manager dashboards. Wire it into the section renderer and dashboard config.

---

### Part C: Notification Preferences (P0)

#### C1. Preferences Library (`lib/notification-preferences.ts`)

```typescript
export interface NotificationPreference {
  notificationType: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
}

export async function getUserNotificationPreferences(userId: string): Promise<NotificationPreference[]>
export async function updateNotificationPreference(userId: string, type: string, emailEnabled: boolean, inAppEnabled: boolean): Promise<void>
```

If no row exists for a type, default to both enabled.

#### C2. Delivery Gating

Modify `createNotificationWithDelivery()` in `lib/notifications.ts`:
1. Before creating the notification, check `notification_preferences` for the recipient
2. If `in_app_enabled` is false for this type, skip the notification insert
3. If `email_enabled` is false for this type, skip the email delivery
4. Use `isMissingSchemaError` pattern if the table doesn't exist (graceful fallback to "all enabled")

#### C3. Settings UI

Add a "Notification Preferences" section in the Settings page (`app/settings/page.tsx` or the relevant settings component).

Show a list of all notification types with two toggles each: Email / In-App.

Notification types to list:
- New maintenance ticket
- Late rent
- Ticket resolved
- Payment recorded
- Lease updated
- Document sent
- Document signed
- Application reviewed
- Rent due reminder
- Invite accepted
- Achievement unlocked
- Lease expiring soon
- Lease expired

Use server action `updateNotificationPreference` to save changes.

---

### Part D: Global Search (P1)

#### D1. Search Component (`components/dashboard/global-search.tsx`)

Client component. A search input in the sidebar or top of the dashboard. Debounced (300ms).

Searches across the currently loaded dashboard data (client-side filtering — no new API):
- Properties by name
- Units by number
- Tenants by name/email
- Maintenance tickets by title
- Leases by tenant name

Shows results in a dropdown with category headers. Clicking a result navigates to that section with the item highlighted/filtered.

#### D2. Integration

Add the search component to the dashboard layout (above the section list in sidebar or as a top bar). Available for owner, manager, and tenant roles.

---

### Part E: Delinquency Escalation (P1)

#### E1. Escalation Logic (`lib/charges.ts`)

Add function:
```typescript
export async function sendDelinquencyEscalations(supabase: SupabaseClient): Promise<string>
```

Logic:
- 30 days past due: Send "friendly reminder" notification (if not already sent within 30 days)
- 60 days past due: Send "urgent" notification with stronger language
- 90+ days past due: Send "final notice" notification to tenant + notify owner

Add new notification type: `"delinquency_escalation"`.

Prevent re-sending: check `notifications` table for existing `delinquency_escalation` with matching `entity_id` (charge ID) within the last 30 days.

#### E2. Cron Integration

Add `sendDelinquencyEscalations(adminClient)` to the cron route, after lease expiration checks.

---

### Part F: Preventive Maintenance Scheduling (P1)

#### F1. Library (`lib/preventive-maintenance.ts`)

```typescript
export interface PmSchedule {
  id: string;
  propertyName: string;
  title: string;
  description: string | null;
  frequencyDays: number;
  lastCompletedAt: string | null;
  nextDueAt: string;
  vendorName: string | null;
  isOverdue: boolean;
}

export async function getPmSchedules(userId: string): Promise<PmSchedule[]>
```

#### F2. Server Actions

- `createPmSchedule`: create a new schedule
- `completePmTask`: mark as completed, auto-calculate next_due_at = now + frequency_days
- `deletePmSchedule`: soft-delete (active=false)

#### F3. Cron: Auto-Create Tickets

Add to cron route:
```typescript
export async function processOverduePmSchedules(supabase: SupabaseClient): Promise<string>
```

For each overdue schedule (next_due_at < today AND active), auto-create a maintenance ticket with title = schedule title, description = schedule description, assign the vendor if specified.

#### F4. Dashboard Section

Add "Preventive Maintenance" as a new section in the owner/manager dashboard. Show scheduled tasks with status (upcoming/overdue), frequency, last completed, next due, and vendor.

---

### Part G: Move-in/Move-out Inspections (P1)

#### G1. Library (`lib/inspections.ts`)

```typescript
export interface Inspection {
  id: string;
  unitNumber: string;
  propertyName: string;
  type: 'move_in' | 'move_out' | 'routine';
  inspectorName: string;
  status: 'draft' | 'completed' | 'signed';
  itemCount: number;
  completedAt: string | null;
  createdAt: string;
}

export interface InspectionDetail extends Inspection {
  notes: string | null;
  items: InspectionItem[];
}

export interface InspectionItem {
  id: string;
  area: string;
  condition: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
  notes: string | null;
  photoPath: string | null;
}

export async function getInspectionsForUser(userId: string): Promise<Inspection[]>
export async function getInspectionDetail(inspectionId: string): Promise<InspectionDetail | null>
```

#### G2. Server Actions

- `createInspection`: create inspection + initial items for standard areas (living room, kitchen, bathroom, bedroom, exterior, appliances)
- `updateInspectionItem`: update condition/notes for an item
- `completeInspection`: mark as completed, set completed_at

#### G3. Dashboard Section

Add "Inspections" section to owner/manager dashboard. List inspections with type badge, unit, date, status. Expandable detail view showing all items with condition badges.

Standard areas for auto-created items: Living Room, Kitchen, Bathroom(s), Bedroom(s), Hallway/Entry, Exterior, Appliances, HVAC, Plumbing, Electrical.

---

### Part H: Rent Increase Tracking (P2)

#### H1. Library (`lib/rent-increases.ts`)

```typescript
export interface RentIncreaseEntry {
  id: string;
  leaseId: string;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  previousRentCents: number;
  newRentCents: number;
  changePercent: number;
  effectiveDate: string;
  reason: string | null;
}

export async function getRentIncreaseHistory(userId: string): Promise<RentIncreaseEntry[]>
```

#### H2. Auto-Record on Lease Renewal

In the `renewLease` action, after creating the new lease, insert a `rent_increase_history` record IF the new rent differs from the old rent.

#### H3. Dashboard Display

Show rent increase history in the leases section or a sub-section. Table with: tenant, property/unit, old rent, new rent, % change, effective date, reason.

---

### Part I: Vendor Performance Dashboard (P2)

#### I1. Metrics Calculation (`lib/vendor-metrics.ts`)

```typescript
export interface VendorMetrics {
  vendorId: string;
  vendorName: string;
  tradeName: string | null;
  totalTickets: number;
  resolvedTickets: number;
  avgResolutionDays: number;
  totalCostCents: number;
  avgCostCents: number;
  rating: number;    // computed: resolved% * speed_factor
}

export async function getVendorMetrics(userId: string): Promise<VendorMetrics[]>
```

Query: vendors → maintenance_assignments → maintenance_tickets. Calculate avg time from assignment to resolution, total cost, resolution rate.

#### I2. Dashboard Section

Add vendor performance view to the vendors section. Show a metrics table with sortable columns: name, tickets, resolved %, avg resolution time, total cost.

---

### Part J: Bulk Operations (P2)

#### J1. CSV Import for Properties

Create a client component `components/dashboard/csv-import.tsx`:
- File upload input (accepts .csv)
- Parse CSV with headers: name, address, city, state, zip
- Show preview table
- "Import" button creates properties via server action

Server action `bulkCreateProperties`:
- Accepts array of property objects
- Validates each with existing schema
- Creates all, reports success/failure count

#### J2. Bulk Tenant Messaging

Create action `sendBulkMessage`:
- Takes propertyId + message body
- Sends an inbox message to all active tenants in that property
- Uses existing `sendInboxMessage` pattern

Add a "Message All Tenants" button in the operations section when a property is selected.

---

### Part K: Multi-Property Consolidated Reports (P2)

Extend the Monthly P&L report in Part A to include a "Portfolio Summary" row at the bottom: total income, total expenses, total net across all properties.

Extend the Tax Summary to include a "Total Portfolio" row summing all properties.

No separate implementation needed — just add summary rows to Part A's report components.

---

### Part L: Insurance & Compliance Tracking (P2)

Add to the leases section:
- A "Renter's Insurance" field on lease create/update forms: `insurance_policy_number` (text, optional) and `insurance_expiry_date` (date, optional)

This requires two new columns on `leases`. Since I (Claude) handle migrations, just add the form fields and action handling. If the columns don't exist yet, use `isMissingSchemaError` pattern to gracefully degrade.

Also add an insurance expiry check in the cron: warn tenants 30 days before their insurance expires. Use `lease_expiring_soon` notification type (or create `insurance_expiring`).

Note: I will apply the migration for these columns after you report back. For now, code the form fields and actions with graceful schema error handling.

---

## 6. Files Expected to Change

**New files (~25):**
- `lib/reports.ts`
- `lib/csv-export-reports.ts`
- `lib/audit.ts`
- `lib/notification-preferences.ts`
- `lib/preventive-maintenance.ts`
- `lib/inspections.ts`
- `lib/rent-increases.ts`
- `lib/vendor-metrics.ts`
- `app/owner/reports/page.tsx`
- `components/reports/report-layout.tsx`
- `components/reports/rent-roll-report.tsx`
- `components/reports/delinquency-report.tsx`
- `components/reports/tenant-ledger-report.tsx`
- `components/reports/monthly-pnl-report.tsx`
- `components/reports/tax-summary-report.tsx`
- `components/reports/receivables-report.tsx`
- `components/dashboard/activity-feed.tsx`
- `components/dashboard/global-search.tsx`
- `components/dashboard/pm-schedule-section.tsx`
- `components/dashboard/inspections-section.tsx`
- `components/dashboard/csv-import.tsx`
- `app/actions/inspections.ts`
- `app/actions/preventive-maintenance.ts`
- `lib/__tests__/reports.test.ts`
- `lib/__tests__/audit.test.ts`

**Modified files (~25):**
- `app/actions/index.ts` — export new actions
- `app/actions/leases.ts` — audit logging + rent increase tracking
- `app/actions/maintenance.ts` — audit logging
- `app/actions/properties.ts` — audit logging
- `app/actions/units.ts` — audit logging
- `app/owner/page.tsx` — fetch audit logs, PM schedules, inspections; pass new actions
- `app/manager/page.tsx` — same as owner
- `app/settings/page.tsx` — notification preferences section
- `lib/notifications.ts` — preference checking before delivery
- `lib/charges.ts` — delinquency escalation
- `lib/validations.ts` — new schemas
- `app/api/cron/generate-charges/route.ts` — PM schedule processing + delinquency escalation
- `components/dashboard/dashboard-config.ts` — new sections
- `components/dashboard/index.tsx` — new section flags
- `components/dashboard/section-renderer.tsx` — new section rendering
- `components/dashboard/types.ts` — new props
- `components/dashboard/sidebar-nav.tsx` — Reports link + search
- `components/dashboard/vendors-section.tsx` — vendor metrics
- `components/dashboard/leases-section.tsx` — rent increase display + insurance fields
- `middleware.ts` — allow /owner/reports route

## 7. Validation Commands

```bash
npm run gate:web
```

Expect 270+ tests, lint clean, build clean.

## 8. Acceptance Criteria

| # | Criterion | Priority |
|---|---|---|
| 1 | Reports page at `/owner/reports` renders 6 report cards | P0 |
| 2 | Each report fetches correct data and renders a sortable table | P0 |
| 3 | CSV export works for all 6 reports | P0 |
| 4 | `logAudit()` called in 20+ server actions | P0 |
| 5 | Activity feed shows recent actions in owner/manager dashboard | P0 |
| 6 | Notification preferences settings UI with per-type toggles | P0 |
| 7 | `createNotificationWithDelivery` respects preferences | P0 |
| 8 | Global search filters dashboard data across categories | P1 |
| 9 | Delinquency escalation sends 30/60/90 day notifications | P1 |
| 10 | Delinquency escalation in cron route | P1 |
| 11 | PM schedules CRUD + dashboard section | P1 |
| 12 | PM overdue auto-creates tickets in cron | P1 |
| 13 | Inspection create/update/complete actions | P1 |
| 14 | Inspection checklist UI with condition ratings | P1 |
| 15 | Rent increase auto-recorded on lease renewal | P2 |
| 16 | Rent increase history displayed | P2 |
| 17 | Vendor metrics (avg resolution, cost, ticket count) | P2 |
| 18 | CSV import for properties | P2 |
| 19 | Bulk tenant messaging | P2 |
| 20 | Gate passes (270+ tests, lint clean, build clean) | P0 |

## 9. Report Format

```
gate_passed: true/false
test_count: N
lint_clean: true/false
build_clean: true/false
files_created: [list]
files_modified: [list]
parts_completed: [A through L]
parts_skipped: [list with reason]
acceptance_criteria: [1-20: pass/fail]
```

## 10. Constraints

- Do NOT apply any DB migrations
- Do NOT deploy
- Do NOT create documentation files
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Report compact status only
- Every Supabase `.update()`, `.insert()`, `.delete()` must have its error result checked
- Use `useFormState` from `react-dom` (NOT `useActionState`)
- Use `isMissingSchemaError` pattern for graceful degradation if tables don't exist
- Fire-and-forget pattern for audit logging (must never break main action)
- All report data fetchers must scope to user's administered properties via `getAdministeredPropertyIds(userId)`
- Priority order: P0 first, then P1, then P2. If time constrained, complete highest priority fully before starting next tier.
