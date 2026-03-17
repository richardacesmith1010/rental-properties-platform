# Sprint 21 — Structural Hardening, Observability, Loading States, Landing Page Rebuild & Test Depth

## 1. Objective

Make Domus production-grade from the inside out. This sprint has NO optional work — every part is required. Focus areas: (A) replace all 66 silent error catches with structured logging across 17 files, (B) split 4 god components into 16+ focused files totaling ~4,000 lines of refactoring, (C) create loading skeletons for every page route, (D) rebuild the landing page to premium SaaS quality with animations, (E) add per-section dashboard error boundaries, (F) write 80+ new unit tests with exact assertions. No shortcuts — each part specifies exact code.

## 2. Context

- Branch: `main`
- HEAD: `6d73240`
- Deploy URL: `https://domusbase.com`
- Gate: 294/294 tests (16 suites), lint clean, build clean
- Supabase project: `vawqdqkaguhdgfhdebqw`

**No DB migrations needed for this sprint.**

**Existing patterns (MUST follow):**
- `useFormState` from `react-dom` (NOT `useActionState`)
- `StatefulAction` type for dashboard action props
- `createNotificationWithDelivery()` for notifications
- `isMissingSchemaError()` for graceful schema degradation
- Server actions: auth check → validate → permission check → mutate → notify → revalidate
- Every `.update()`, `.insert()`, `.delete()` must have error checked (L-002)
- CSS classes: `.domus-card`, `.domus-input`, `.domus-badge-*`, `.domus-glass`, `.domus-kpi-pill`
- CSS variables: `var(--domus-card-bg)`, `var(--domus-heading-text)`, `var(--domus-muted-text)`, etc.
- Theme provider + `data-domus-theme` attribute system

## 3. In Scope — ALL REQUIRED (no optional work)

| Part | Description | Est. Time | Files Touched |
|---|---|---|---|
| A | Error Observability Overhaul | 1.5 hrs | 18 files |
| B | God File Refactoring (4 components → 16+ files) | 2.5 hrs | 20+ files |
| C | Loading Skeletons for Every Page Route | 1 hr | 10 new files + 4 modified |
| D | Landing Page Premium Rebuild | 1 hr | 3 files |
| E | Dashboard Section Error Boundaries | 30 min | 5 files |
| F | Unit Tests (80+ new tests with exact assertions) | 1 hr | 8 new test files |

**Total: 7.5 hours. ALL parts are required. Do not skip any.**

## 4. Out of Scope

- DB migrations
- New features (no new user-facing functionality beyond landing page)
- Deployment
- New npm packages
- Any work not explicitly listed below

---

## 5. Implementation Requirements

---

### Part A: Error Observability Overhaul (1.5 hrs)

**Problem:** 66 `.catch(() => {})` blocks across 17 files. Zero logging. Production issues are invisible.

#### A1. Create Centralized Logger (`lib/logger.ts` — NEW, ~80 lines)

```typescript
/**
 * Structured logger for fire-and-forget operations.
 * In production, these would feed into a log aggregator (Datadog, Axiom, etc.).
 * For now, uses console.error with structured JSON context.
 */

export interface LogContext {
  action: string;       // e.g., "createProperty", "recordManualPayment"
  operation: string;    // e.g., "notify_tenant", "award_xp", "log_audit"
  userId?: string;
  entityType?: string;  // e.g., "property", "lease", "charge"
  entityId?: string;
}

export function logFailedSideEffect(ctx: LogContext, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const timestamp = new Date().toISOString();

  // Structured log — parseable by log aggregators
  console.error(JSON.stringify({
    level: "warn",
    type: "failed_side_effect",
    timestamp,
    action: ctx.action,
    operation: ctx.operation,
    userId: ctx.userId || "unknown",
    entityType: ctx.entityType || "unknown",
    entityId: ctx.entityId || "unknown",
    error: message,
  }));
}

/**
 * Replacement for .catch(() => {}).
 * Use as: somePromise.catch(sideEffectError("actionName", "operationName", { userId, entityType, entityId }))
 */
export function sideEffectError(
  action: string,
  operation: string,
  ctx?: Partial<Omit<LogContext, "action" | "operation">>
): (error: unknown) => void {
  return (error: unknown) => {
    logFailedSideEffect({
      action,
      operation,
      ...ctx,
    }, error);
  };
}
```

#### A2. Replace EVERY `.catch(() => {})` — File by File

Below are the EXACT replacements for each of the 17 files. Import `sideEffectError` from `@/lib/logger` at the top of each file.

**File 1: `app/actions/maintenance.ts` (13 catches)**

Replace every `.catch(() => {})` with a descriptive catch. Examples for each occurrence:

```typescript
// Line ~97 (after createNotificationWithDelivery for new ticket)
.catch(sideEffectError("createMaintenanceTicket", "notify_property_admin", { userId: user.id, entityType: "ticket" }))

// Line ~139 (after awardXp for ticket_submitted)
.catch(sideEffectError("createMaintenanceTicket", "award_xp", { userId: user.id, entityType: "xp_event" }))

// Line ~156 (after logAudit for ticket creation)
.catch(sideEffectError("createMaintenanceTicket", "log_audit", { userId: user.id, entityType: "ticket" }))

// Line ~173 (after createNotificationWithDelivery for status update)
.catch(sideEffectError("updateTicketStatus", "notify_tenant", { userId: user.id, entityType: "ticket" }))

// Line ~185 (after awardXp for ticket_resolved)
.catch(sideEffectError("updateTicketStatus", "award_xp", { userId: user.id, entityType: "xp_event" }))

// Line ~252 (after logAudit for status change)
.catch(sideEffectError("updateTicketStatus", "log_audit", { userId: user.id, entityType: "ticket" }))

// Line ~263 (after logMaintenanceStatusChange)
.catch(sideEffectError("updateTicketStatus", "log_status_history", { userId: user.id, entityType: "ticket" }))

// Continue same pattern for remaining catches...
// Line ~283 → ("assignVendor", "notify_vendor", ...)
// Line ~297 → ("assignVendor", "log_audit", ...)
// Line ~310 → ("addTicketComment", "notify_participants", ...)
// Line ~451 → ("addTicketComment", "log_audit", ...)
// Line ~468 → ("addTicketComment", "award_xp", ...)
// Line ~482 → ("updateTicketPriority", "log_audit", ...)
```

Apply the SAME pattern to the action name and operation type for ALL catches. The action name is the function the catch is inside. The operation name describes what the fire-and-forget was trying to do. Here are the patterns for the remaining files:

**File 2: `app/actions/invitations.ts` (9 catches)**
- Action names: `inviteUserByEmail`, `inviteManagerByEmail`, `acceptInvitation`
- Operation names: `create_notification`, `award_xp`, `log_audit`, `send_email`, `update_invite_status`

**File 3: `app/actions/leases.ts` (8 catches)**
- Action names: `createLease`, `renewLease`, `terminateLease`
- Operation names: `notify_tenant`, `award_xp`, `log_audit`, `record_rent_increase`

**File 4: `app/api/webhooks/stripe/route.ts` (5 catches)**
- Action names: `handleCheckoutCompleted`, `handlePaymentSucceeded`, `handlePaymentFailed`, `handleAccountUpdated`
- Operation names: `record_payment`, `award_xp`, `update_streak`, `notify_tenant`, `notify_owner`

**File 5: `app/actions/charges.ts` (4 catches)**
- Action names: `recordManualPayment`, `generateChargesForOwner`
- Operation names: `award_xp`, `update_streak`, `notify_tenant`, `log_audit`

**File 6: `app/actions/documents.ts` (4 catches)**
- Action names: `createDocumentTemplate`, `sendDocumentPacket`, `recordDocumentSignature`, `deleteDocument`
- Operation names: `notify_signer`, `award_xp`, `log_audit`, `send_email`

**File 7: `app/actions/properties.ts` (4 catches)**
- Action names: `createProperty`, `updateProperty`
- Operation names: `award_xp`, `log_audit`, `assign_manager`, `create_account_membership`

**File 8: `app/actions/units.ts` (4 catches)**
- Action names: `createUnit`, `updateUnit`
- Operation names: `award_xp`, `log_audit`

**File 9: `app/auth/callback/route.ts` (4 catches)**
- Action names: `authCallback`
- Operation names: `update_streak`, `check_achievements`, `create_gamification_record`, `update_last_login`

**File 10: `app/actions/expenses.ts` (3 catches)**
- Action names: `createExpense`, `updateExpense`, `deleteExpense`
- Operation names: `log_audit`

**File 11: `app/actions/vendors.ts` (2 catches)**
- Action names: `createVendor`, `updateVendor`
- Operation names: `log_audit`

**File 12: `app/actions/connect.ts` (1 catch)**
- Action name: `initiateStripeConnect`
- Operation name: `create_stripe_account`

**DO NOT miss any catch block.** After changes, `grep -rn "\.catch(() => {})" apps/web/app/` should return ZERO results (excluding test files and `tests/e2e/` directory).

#### A3. Also fix `app/actions/inbox.ts` L-002 issue

The thread `updated_at` update at line ~128 swallows its error with just `console.error`. Change it to use `logFailedSideEffect` with proper context:

```typescript
logFailedSideEffect({
  action: "sendInboxMessage",
  operation: "update_thread_timestamp",
  userId: user.id,
  entityType: "inbox_thread",
  entityId: threadId,
}, updateError);
```

---

### Part B: God File Refactoring (2.5 hrs)

**Problem:** 4 components exceed 500 lines. `operations-section.tsx` is 1,342 lines. These are hard to maintain, slow to review, and wasteful on agent context.

#### B1. Split `operations-section.tsx` (1,342 lines → 6 files)

Create a `components/dashboard/forms/` directory.

**File 1: `components/dashboard/forms/form-helpers.tsx` (~50 lines)**

Extract these three helper components from operations-section.tsx (currently at approx lines 90-124):

```typescript
"use client";

import type { ActionState } from "@/app/actions";

export function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  // ... exact current implementation from operations-section.tsx lines 90-106
}

export function FormError({ state }: { state: ActionState }) {
  // ... exact current implementation from lines 107-115
}

export function FormSuccess({ state }: { state: ActionState }) {
  // ... exact current implementation from lines 116-124
}
```

**File 2: `components/dashboard/forms/property-form.tsx` (~300 lines)**

Extract the property creation wizard. This includes:
- The `PropertyDraft` interface (lines 45-53)
- The `PROPERTY_STEP_LABELS` constant (lines 71-80)
- All property form JSX (the "property" task case in the main render — find it in the JSX where `task === "property"`)
- The property-related state: `propertyDraft`, `propertyStep`, form submission handler
- Import `FieldLabel`, `FormError`, `FormSuccess` from `./form-helpers`
- Import `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Input`, `Select`, `SubmitButton`, `Button`

Props interface:
```typescript
interface PropertyFormProps {
  ownershipAccounts: OwnershipAccountDTO[];
  onCreateProperty: StatefulAction;
  onPropertyCreated?: () => void;
  onBack: () => void;
}
```

Component is a `"use client"` component that manages its own step state and draft state internally.

**File 3: `components/dashboard/forms/unit-form.tsx` (~250 lines)**

Extract the unit creation wizard. Includes:
- `UnitDraft` interface (lines 54-61)
- `UNIT_STEP_LABELS` constant (lines 81-89)
- All unit form JSX
- Unit-related state: `unitDraft`, `unitStep`, property selection for the unit

Props interface:
```typescript
interface UnitFormProps {
  portfolio: PortfolioData;
  onCreateUnit: StatefulAction;
  onUnitCreated?: () => void;
  onBack: () => void;
}
```

**File 4: `components/dashboard/forms/lease-form.tsx` (~350 lines)**

Extract the lease creation wizard. Includes:
- `LeaseDraft` interface (lines 32-43)
- `LEASE_STEP_LABELS` constant (lines 62-70)
- All lease form JSX (multi-step: property → unit → tenant → terms → review)
- Lease-related state: `leaseDraft`, `leaseStep`, filtered units based on property selection

Props interface:
```typescript
interface LeaseFormProps {
  portfolio: PortfolioData;
  onCreateLease: StatefulAction;
  onLeaseCreated?: () => void;
  onBack: () => void;
}
```

**File 5: `components/dashboard/forms/index.ts` (~5 lines)**

Barrel export:
```typescript
export { PropertyForm } from "./property-form";
export { UnitForm } from "./unit-form";
export { LeaseForm } from "./lease-form";
export { FieldLabel, FormError, FormSuccess } from "./form-helpers";
```

**File 6: `operations-section.tsx` (REWRITE to ~200 lines)**

Rewrite as thin orchestrator that only manages:
- Which task is selected (`property` | `unit` | `lease` | null)
- The task selection UI (3 cards/buttons to pick which form)
- Renders the appropriate form component based on selection
- Passes through props from `OperationsSectionProps`

```typescript
import { PropertyForm, UnitForm, LeaseForm } from "./forms";

export function OperationsSection({ portfolio, ownershipAccounts, onCreateProperty, onCreateUnit, onCreateLease, onPropertyCreated, onUnitCreated, onLeaseCreated }: OperationsSectionProps) {
  const [task, setTask] = useState<OperationTask | null>(null);

  if (task === "property") return <PropertyForm ownershipAccounts={ownershipAccounts} onCreateProperty={onCreateProperty} onPropertyCreated={onPropertyCreated} onBack={() => setTask(null)} />;
  if (task === "unit") return <UnitForm portfolio={portfolio} onCreateUnit={onCreateUnit} onUnitCreated={onUnitCreated} onBack={() => setTask(null)} />;
  if (task === "lease") return <LeaseForm portfolio={portfolio} onCreateLease={onCreateLease} onLeaseCreated={onLeaseCreated} onBack={() => setTask(null)} />;

  return (
    // Task selection UI - 3 cards
  );
}
```

**CRITICAL:** After refactoring, `OperationsSection` must accept the EXACT same props and render the EXACT same UI as before. This is a refactor, not a redesign. The user should see zero visual difference.

#### B2. Split `documents-section.tsx` (975 lines → 4 files)

Create `components/dashboard/documents/` directory.

**File 1: `components/dashboard/documents/template-builder.tsx` (~300 lines)**

Extract the template creation/editing form. Includes:
- Template step flow (the `TEMPLATE_STEPS` constant)
- Template field management
- Template preview

Props interface:
```typescript
interface TemplateBuilderProps {
  existingTemplate?: DocumentTemplateDTO;
  onSave: StatefulAction;
  onCancel: () => void;
}
```

**File 2: `components/dashboard/documents/packet-manager.tsx` (~250 lines)**

Extract the packet creation and tracking. Includes:
- Packet creation form (select template, select signer, send)
- Packet list with status tracking
- Download/view packet actions

**File 3: `components/dashboard/documents/signer-flow.tsx` (~200 lines)**

Extract the tenant signer experience. Includes:
- Document viewing
- Signature capture
- Completion confirmation

**File 4: `documents-section.tsx` (REWRITE to ~250 lines)**

Thin orchestrator managing which view is active (list, create-template, send-packet, sign) and routing to the appropriate sub-component.

#### B3. Split `expenses-section.tsx` (821 lines → 3 files)

**File 1: `components/dashboard/expenses/expense-form.tsx` (~250 lines)**

Extract expense creation/edit form with category picker, amount, date, property assignment.

**File 2: `components/dashboard/expenses/expense-list.tsx` (~250 lines)**

Extract expense list/table view with filtering, sorting, and delete actions.

**File 3: `expenses-section.tsx` (REWRITE to ~300 lines)**

Orchestrator managing list/form views and passing data.

#### B4. Split `invitations-section.tsx` (795 lines → 3 files)

**File 1: `components/dashboard/invitations/invite-tenant-form.tsx` (~250 lines)**

Tenant invitation form with email, unit selection, and role assignment.

**File 2: `components/dashboard/invitations/invite-manager-form.tsx` (~200 lines)**

Manager invitation form with email and property assignment.

**File 3: `invitations-section.tsx` (REWRITE to ~300 lines)**

Orchestrator with invitation list and buttons to switch to tenant/manager invite forms.

#### B5. Dedup `lib/maintenance.ts`

`getOwnerMaintenanceTickets` (lines ~490-603) and `getManagerMaintenanceTickets` (lines ~607-717) are nearly identical (~110 lines each). Merge into a single function:

```typescript
export async function getAdminMaintenanceTickets(
  userId: string
): Promise<MaintenanceTicket[]> {
  // Uses getAdministeredPropertyIds(userId) — works for both owners and managers
  // Single implementation replaces both functions
}
```

Then update `app/owner/page.tsx` and `app/manager/page.tsx` to call `getAdminMaintenanceTickets` instead of the role-specific functions. Remove the old functions entirely.

#### B6. Verify All Splits

After all splits:
1. Every import path must be updated (grep for old imports)
2. `npm run gate:web` must pass — no broken imports, no type errors
3. The `OperationsSectionProps` interface stays in `operations-section.tsx` (it's the public API)
4. All sub-components are `"use client"` (they use hooks)
5. The `StatefulAction` type should be moved to `app/actions/index.ts` or a shared types file if it isn't already, since multiple form components now need it

---

### Part C: Loading Skeletons for Every Page Route (1 hr)

**Problem:** ZERO `loading.tsx` files exist. Users see blank white screens during navigation.

Create `loading.tsx` for every dynamic route. Each must use the `.domus-skeleton` class and match the page's actual layout structure.

#### C1. `app/owner/loading.tsx` (~60 lines)

```typescript
export default function OwnerLoading() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar skeleton */}
      <div className="hidden w-64 flex-shrink-0 lg:block">
        <div className="gradient-sidebar h-full p-4 space-y-4">
          <div className="domus-skeleton h-8 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="domus-skeleton h-9 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
      {/* Main content skeleton */}
      <div className="flex-1 p-6 space-y-6">
        {/* Header skeleton */}
        <div className="space-y-2">
          <div className="domus-skeleton h-8 w-64" />
          <div className="domus-skeleton h-4 w-48" />
        </div>
        {/* KPI pills skeleton */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="domus-skeleton h-20 rounded-2xl" />
          ))}
        </div>
        {/* Content cards skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="domus-card p-6 space-y-3">
              <div className="domus-skeleton h-4 w-1/3" />
              <div className="domus-skeleton h-3 w-2/3" />
              <div className="domus-skeleton h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

#### C2. `app/manager/loading.tsx` (~50 lines)

Same layout as owner but with manager-specific section count (fewer KPI pills — 3 instead of 4).

#### C3. `app/tenant/loading.tsx` (~50 lines)

Tenant layout: No sidebar on mobile, simpler card grid:
```typescript
export default function TenantLoading() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar skeleton */}
      <div className="hidden w-64 flex-shrink-0 lg:block">
        <div className="gradient-sidebar h-full p-4 space-y-4">
          <div className="domus-skeleton h-8 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="domus-skeleton h-9 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 p-6 space-y-6">
        {/* Welcome header skeleton */}
        <div className="domus-card p-6 space-y-3">
          <div className="domus-skeleton h-6 w-48" />
          <div className="domus-skeleton h-4 w-72" />
        </div>
        {/* Quick status cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="domus-card p-5 space-y-2">
              <div className="domus-skeleton h-4 w-20" />
              <div className="domus-skeleton h-8 w-24" />
            </div>
          ))}
        </div>
        {/* Content skeleton */}
        <div className="domus-card p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="domus-skeleton h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="domus-skeleton h-4 w-1/3" />
                <div className="domus-skeleton h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

#### C4. `app/settings/loading.tsx` (~30 lines)

Settings layout: Section tabs + form skeletons.

```typescript
export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <div className="domus-skeleton h-8 w-32" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="domus-skeleton h-9 w-24 rounded-lg" />
        ))}
      </div>
      <div className="domus-card p-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="domus-skeleton h-4 w-20" />
            <div className="domus-skeleton h-10 w-full rounded-xl" />
          </div>
        ))}
        <div className="domus-skeleton h-10 w-32 rounded-xl" />
      </div>
    </div>
  );
}
```

#### C5. `app/achievements/loading.tsx` (~30 lines)

Achievement grid skeleton:
```typescript
export default function AchievementsLoading() {
  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="domus-skeleton h-8 w-48" />
      <div className="domus-card p-4">
        <div className="domus-skeleton h-4 w-full rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="domus-card p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="domus-skeleton h-10 w-10 rounded-lg" />
              <div className="domus-skeleton h-5 w-32" />
            </div>
            <div className="domus-skeleton h-3 w-full" />
            <div className="domus-skeleton h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### C6. `app/owner/reports/loading.tsx` (~25 lines)

Report tabs + table skeleton.

#### C7. `app/login/loading.tsx` (~20 lines)

Centered card with role buttons skeleton.

#### C8. `app/onboarding/loading.tsx` (~20 lines)

Centered wizard card skeleton.

#### C9. `app/complete-profile/loading.tsx` (~20 lines)

Profile form skeleton.

#### C10. `app/payments/receipt/[chargeId]/loading.tsx` (~20 lines)

Receipt document skeleton.

**IMPORTANT:** Every loading.tsx must be a default export of a React component. Do NOT use `"use client"` — loading files are server components in Next.js 14.

---

### Part D: Landing Page Premium Rebuild (1 hr)

**Problem:** Current landing page is functional but basic. Needs to convince a landlord managing 4 units on spreadsheets to sign up.

#### D1. Rewrite `components/marketing/landing-page.tsx` (target: ~500 lines)

Complete rewrite. Keep the existing data (features, tiers) but dramatically enhance the presentation:

**Section 1: Hero (lines 1-80)**
- Tagline: "Stop managing rentals in spreadsheets."
- Subtext: "Domus gives landlords with 1-10 units a professional command center for payments, tenants, and maintenance — for free."
- Primary CTA: "Start free — no credit card" → `/login`
- Secondary CTA: "See how it works" → scrolls to features
- Right side: Animated dashboard mockup (use CSS grid with domus-card styled fake UI elements showing occupancy %, revenue, ticket count — animated with `animate-in` classes from tailwindcss-animate)
- Trust line below: "Trusted by 500+ landlords managing 2,000+ units" (aspirational stat)

**Section 2: Problem/Solution (lines 81-130)**
- 3-column grid:
  - "Spreadsheets can't track payments" → Domus automates rent collection
  - "Texts and emails get lost" → Domus centralizes tenant communication
  - "Maintenance falls through cracks" → Domus tracks every ticket to resolution
- Each card: Icon + pain point headline + solution text
- Use `.domus-card` styling with hover lift

**Section 3: Feature Showcase (lines 131-250)**
- Interactive tabbed interface (NOT just a grid)
- Tabs: "Payments", "Maintenance", "Documents", "Analytics", "Gamification"
- Each tab shows:
  - Left: Description text + 3 bullet points
  - Right: Styled mockup div (CSS-only, no images) showing a preview of that feature
- Use `useState` for active tab (this makes the component `"use client"`)
- Tabs styled with `.domus-badge` active state

**Section 4: How It Works (lines 251-310)**
- 4-step horizontal flow:
  1. "Create your account" (icon: UserPlus)
  2. "Add your properties" (icon: Building2)
  3. "Invite your tenants" (icon: Users)
  4. "Collect rent automatically" (icon: CreditCard)
- Connecting lines between steps (CSS border-top with absolute positioning)
- Each step: Circle with number + icon + title + one-line description

**Section 5: Testimonials (lines 311-380)**
- 3 testimonial cards in a grid:
  1. "Alex R." — "I manage 6 units and finally stopped using spreadsheets. Domus pays for itself with the time I save on rent tracking alone."
  2. "Jordan K." — "The maintenance tracker is a game changer. My tenants love seeing their ticket progress in real-time."
  3. "Sam T." — "As a tenant, I actually enjoy paying rent now. The gamification makes me feel good about paying on time."
- Each card: Quote text, name, role badge (Owner/Manager/Tenant), star rating (5 stars)
- Style: `.domus-card` with subtle left border accent (violet for owner, emerald for manager, amber for tenant)

**Section 6: Pricing (lines 381-440)**
- Keep current tier data but enhance:
  - Featured tier: Gradient border + "Most Popular" badge
  - Each tier: Price, period, feature list with checkmark icons
  - CTA button on each tier: "Get Started" for free, "Start Trial" for paid
  - Note: "All plans include unlimited tenants, SSL encryption, and 99.9% uptime"

**Section 7: FAQ (lines 441-500)**
- Accordion-style FAQ (use `<details>`/`<summary>` HTML for zero-JS accordion):
  - "Is Domus really free for small landlords?"
  - "How does rent collection work?"
  - "Can I manage multiple properties?"
  - "Is my data secure?"
  - "What happens when a tenant doesn't pay?"
  - "Can my property manager use Domus?"
- Each answer: 2-3 sentences, professional tone
- Style `<summary>` with cursor pointer, font-medium, and `<details>[open] summary` with different icon rotation

**Section 8: Final CTA (lines 501-530)**
- "Ready to professionalize your rental business?"
- Big CTA button
- Below: "Free for up to 3 units. No credit card required."

**Section 9: Footer (lines 531-560)**
- Logo + tagline
- Links: Terms, Privacy, Help (placeholder #)
- Copyright
- "Built with ❤️ for independent landlords"

#### D2. Add Scroll Animation Utility (`components/marketing/animate-on-scroll.tsx` — NEW, ~30 lines)

Simple Intersection Observer wrapper:

```typescript
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function AnimateOnScroll({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setIsVisible(true), delay);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}
```

Use this wrapper around each landing page section for staggered fade-in-up on scroll.

#### D3. Update `components/marketing/landing-shell.tsx` if needed

Ensure the shell (wrapper) works with the new landing page structure. It should provide the dark gradient background that the current landing page expects.

---

### Part E: Dashboard Section Error Boundaries (30 min)

**Problem:** If one dashboard section crashes (e.g., maintenance throws), the entire dashboard dies. Need per-section isolation.

#### E1. Create `components/dashboard/section-error-boundary.tsx` (~50 lines)

```typescript
"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  sectionName: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[Dashboard] Section "${this.props.sectionName}" crashed:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="domus-card p-6 text-center space-y-3">
          <AlertTriangle className="mx-auto h-8 w-8" style={{ color: "var(--domus-warning-text)" }} />
          <p className="domus-heading text-sm font-medium">
            Something went wrong in {this.props.sectionName}
          </p>
          <p className="domus-muted text-xs">
            This section encountered an error. Other sections are unaffected.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="domus-badge text-xs cursor-pointer hover:opacity-80"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

#### E2. Wrap Each Section in `section-renderer.tsx`

In `components/dashboard/section-renderer.tsx`, wrap each rendered section component with `SectionErrorBoundary`:

```typescript
import { SectionErrorBoundary } from "./section-error-boundary";

// In the render logic where sections are mapped:
<SectionErrorBoundary sectionName={section.label}>
  <SectionComponent {...sectionProps} />
</SectionErrorBoundary>
```

This means if the Maintenance section crashes, the user still sees Properties, Charges, etc. The crashed section shows a friendly error with a "Try again" button.

---

### Part F: Unit Tests (80+ new tests, 1 hr)

**Problem:** Current tests cover validations and gamification but miss logger, form helpers, loading states, and refactored components.

#### F1. Logger Tests (`lib/__tests__/logger.test.ts` — NEW, ~60 lines)

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";
import { logFailedSideEffect, sideEffectError } from "@/lib/logger";

describe("logFailedSideEffect", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  test("logs structured JSON to console.error", () => {
    logFailedSideEffect({
      action: "createProperty",
      operation: "award_xp",
      userId: "user-123",
      entityType: "property",
      entityId: "prop-456",
    }, new Error("XP award failed"));

    expect(consoleSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.level).toBe("warn");
    expect(logged.type).toBe("failed_side_effect");
    expect(logged.action).toBe("createProperty");
    expect(logged.operation).toBe("award_xp");
    expect(logged.userId).toBe("user-123");
    expect(logged.entityType).toBe("property");
    expect(logged.entityId).toBe("prop-456");
    expect(logged.error).toBe("XP award failed");
    expect(logged.timestamp).toBeDefined();
  });

  test("handles non-Error objects", () => {
    logFailedSideEffect({
      action: "test",
      operation: "test",
    }, "string error");

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.error).toBe("string error");
  });

  test("handles null/undefined errors", () => {
    logFailedSideEffect({
      action: "test",
      operation: "test",
    }, null);

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.error).toBe("null");
  });

  test("defaults userId and entityType to 'unknown'", () => {
    logFailedSideEffect({
      action: "test",
      operation: "test",
    }, new Error("fail"));

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.userId).toBe("unknown");
    expect(logged.entityType).toBe("unknown");
    expect(logged.entityId).toBe("unknown");
  });
});

describe("sideEffectError", () => {
  test("returns a function that logs when called", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = sideEffectError("myAction", "myOp", { userId: "u1" });

    handler(new Error("boom"));

    expect(consoleSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.action).toBe("myAction");
    expect(logged.operation).toBe("myOp");
    expect(logged.userId).toBe("u1");
  });

  test("can be used as .catch handler", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await Promise.reject(new Error("async fail"))
      .catch(sideEffectError("asyncAction", "asyncOp"));

    expect(consoleSpy).toHaveBeenCalledOnce();
  });
});
```

#### F2. Rate Limit Edge Cases (`lib/__tests__/rate-limit.test.ts` — MODIFY, add 6 tests)

Add to existing file:

```typescript
test("returns remaining count accurately", () => {
  resetRateLimitState();
  const r1 = checkRateLimit("key", 5, 60000);
  expect(r1.remaining).toBe(4);
  const r2 = checkRateLimit("key", 5, 60000);
  expect(r2.remaining).toBe(3);
});

test("boundary: exactly at limit is allowed", () => {
  resetRateLimitState();
  for (let i = 0; i < 5; i++) {
    expect(checkRateLimit("key", 5, 60000).allowed).toBe(true);
  }
  expect(checkRateLimit("key", 5, 60000).allowed).toBe(false);
});

test("zero maxRequests blocks immediately", () => {
  resetRateLimitState();
  expect(checkRateLimit("key", 0, 60000).allowed).toBe(false);
});

test("concurrent keys don't interfere", () => {
  resetRateLimitState();
  for (let i = 0; i < 10; i++) {
    checkRateLimit("key-a", 5, 60000);
  }
  expect(checkRateLimit("key-a", 5, 60000).allowed).toBe(false);
  expect(checkRateLimit("key-b", 5, 60000).allowed).toBe(true);
});

test("very short window resets quickly", () => {
  vi.useFakeTimers();
  resetRateLimitState();
  checkRateLimit("key", 1, 100);
  expect(checkRateLimit("key", 1, 100).allowed).toBe(false);
  vi.advanceTimersByTime(101);
  expect(checkRateLimit("key", 1, 100).allowed).toBe(true);
  vi.useRealTimers();
});

test("negative maxRequests treated as zero", () => {
  resetRateLimitState();
  expect(checkRateLimit("key", -1, 60000).allowed).toBe(false);
});
```

#### F3. Theme Extended Tests (`lib/__tests__/theme.test.ts` — MODIFY, add 8 tests)

Add to existing file:

```typescript
test("normalizeTheme returns atlas-light for invalid input", () => {
  expect(normalizeTheme("invalid-theme")).toBe("atlas-light");
  expect(normalizeTheme("")).toBe("atlas-light");
  expect(normalizeTheme(null as unknown as string)).toBe("atlas-light");
  expect(normalizeTheme(undefined as unknown as string)).toBe("atlas-light");
});

test("normalizeTheme accepts all valid themes", () => {
  expect(normalizeTheme("atlas-light")).toBe("atlas-light");
  expect(normalizeTheme("noctis-neon")).toBe("noctis-neon");
  expect(normalizeTheme("imperium-night")).toBe("imperium-night");
});

test("applyTheme removes attribute for atlas-light", () => {
  document.documentElement.setAttribute("data-domus-theme", "noctis-neon");
  applyTheme("atlas-light");
  expect(document.documentElement.getAttribute("data-domus-theme")).toBeNull();
});

test("applyTheme sets attribute for dark themes", () => {
  applyTheme("noctis-neon");
  expect(document.documentElement.getAttribute("data-domus-theme")).toBe("noctis-neon");
});

test("setTheme persists to localStorage", () => {
  setTheme("imperium-night");
  expect(localStorage.getItem("domus-theme")).toBe("imperium-night");
});

test("getStoredTheme reads from localStorage", () => {
  localStorage.setItem("domus-theme", "noctis-neon");
  expect(getStoredTheme()).toBe("noctis-neon");
});

test("getStoredTheme normalizes invalid stored values", () => {
  localStorage.setItem("domus-theme", "garbage");
  expect(getStoredTheme()).toBe("atlas-light");
});

test("isDarkTheme returns correct for all themes", () => {
  expect(isDarkTheme("atlas-light")).toBe(false);
  expect(isDarkTheme("noctis-neon")).toBe(true);
  expect(isDarkTheme("imperium-night")).toBe(true);
});
```

#### F4. Maintenance Timeline Extended Tests (`lib/__tests__/maintenance-timeline.test.ts` — MODIFY, add 5 tests)

Add edge case tests:

```typescript
test("logMaintenanceStatusChange handles null from_status", async () => {
  // Test with from_status = null (initial ticket creation)
});

test("logMaintenanceStatusChange logs error on insert failure", async () => {
  // Mock insert to return error, verify console.error called
});

test("getMaintenanceTimeline returns empty array for missing ticket", async () => {
  // Mock select to return empty data
});

test("getMaintenanceTimeline handles missing schema gracefully", async () => {
  // Mock select to return isMissingSchemaError, verify empty array returned
});

test("getMaintenanceTimeline orders by created_at ascending", async () => {
  // Verify .order("created_at", { ascending: true }) is called
});
```

#### F5. Validation Extended Tests (`lib/__tests__/validations.test.ts` — MODIFY, add 20 tests)

Add edge case tests for validation schemas that aren't currently covered:

```typescript
describe("lease validation edge cases", () => {
  test("rejects end date before start date", () => { /* ... */ });
  test("rejects zero rent amount", () => { /* ... */ });
  test("rejects negative deposit", () => { /* ... */ });
  test("rejects grace period > 30 days", () => { /* ... */ });
  test("rejects late fee > rent amount", () => { /* ... */ });
  test("accepts minimum valid lease (1 month)", () => { /* ... */ });
  test("rejects due day > 28", () => { /* ... */ });
  test("rejects due day < 1", () => { /* ... */ });
});

describe("property validation edge cases", () => {
  test("rejects empty property name", () => { /* ... */ });
  test("accepts property with only name (partial save)", () => { /* ... */ });
  test("rejects postal code with special characters", () => { /* ... */ });
  test("accepts 5-digit zip codes", () => { /* ... */ });
  test("accepts 9-digit zip+4 codes", () => { /* ... */ });
});

describe("unit validation edge cases", () => {
  test("rejects empty unit number", () => { /* ... */ });
  test("accepts alphanumeric unit numbers", () => { /* ... */ });
  test("rejects negative bedroom count", () => { /* ... */ });
  test("rejects negative bathroom count", () => { /* ... */ });
});

describe("expense validation edge cases", () => {
  test("rejects zero amount", () => { /* ... */ });
  test("rejects future date more than 1 year out", () => { /* ... */ });
  test("accepts valid expense with all fields", () => { /* ... */ });
  test("rejects expense without category", () => { /* ... */ });
});
```

Fill in each test with actual validation schema calls and assertions. Read the validation schemas in `lib/validations.ts` to determine the actual field names and rules.

#### F6. Analytics Data Tests (`lib/__tests__/analytics.test.ts` — NEW, ~50 lines)

Test the analytics data transformation functions:

```typescript
describe("analytics data transformations", () => {
  test("monthly revenue aggregation handles empty charges", () => { /* ... */ });
  test("occupancy rate calculation with partial occupancy", () => { /* ... */ });
  test("occupancy rate is 0 when no units exist", () => { /* ... */ });
  test("expense breakdown by category handles missing categories", () => { /* ... */ });
  test("maintenance metrics count open vs closed correctly", () => { /* ... */ });
});
```

#### F7. Reports Data Tests (`lib/__tests__/reports.test.ts` — MODIFY, add 10 tests)

Add edge cases:

```typescript
test("rent roll handles property with no units", () => { /* ... */ });
test("rent roll handles unit with no tenant", () => { /* ... */ });
test("delinquency report excludes paid charges", () => { /* ... */ });
test("delinquency report calculates days overdue correctly", () => { /* ... */ });
test("monthly P&L handles month with no income", () => { /* ... */ });
test("monthly P&L handles month with no expenses", () => { /* ... */ });
test("tax summary groups by IRS category", () => { /* ... */ });
test("receivables aging buckets are correct (0-30, 31-60, 61-90, 90+)", () => { /* ... */ });
test("tenant ledger shows all transactions for a tenant", () => { /* ... */ });
test("CSV export escapes commas in values", () => { /* ... */ });
```

#### F8. Format Utility Tests (`lib/__tests__/format.test.ts` — MODIFY, add 8 tests)

```typescript
test("formatCurrency handles zero cents", () => { /* ... */ });
test("formatCurrency handles negative amounts", () => { /* ... */ });
test("formatCurrency handles very large amounts", () => { /* ... */ });
test("formatDateTime handles invalid date string", () => { /* ... */ });
test("formatDate handles null input", () => { /* ... */ });
test("formatRelativeTime shows 'just now' for < 1 minute", () => { /* ... */ });
test("formatRelativeTime shows '2 hours ago'", () => { /* ... */ });
test("formatRelativeTime shows '3 days ago'", () => { /* ... */ });
```

**Total new test count target: 80+**

---

## 6. File Summary

| Part | New Files | Modified Files |
|---|---|---|
| A | 1 (logger.ts) | 17 (all action files + webhook + auth callback) |
| B | 12 (form files + barrel exports) | 4 (operations, documents, expenses, invitations orchestrators) + maintenance.ts + 2 page files |
| C | 10 (loading.tsx files) | 0 |
| D | 1 (animate-on-scroll.tsx) | 1 (landing-page.tsx rewrite) + possible landing-shell.tsx |
| E | 1 (section-error-boundary.tsx) | 1 (section-renderer.tsx) |
| F | 2 (logger.test.ts, analytics.test.ts) | 5 (existing test files extended) |
| **Total** | **~27 new** | **~30 modified** |

## 7. Validation Commands

```bash
npm run gate:web
```

After all changes:
- Tests: 294 baseline + 80 new = target 370+
- Lint: clean
- Build: clean
- Typecheck: clean

Additional verification:
```bash
# Verify no remaining silent catches in production code
grep -rn "\.catch(() => {})" apps/web/app/ | grep -v "test" | grep -v "spec"
# Should return 0 results

# Verify all loading files exist
ls apps/web/app/owner/loading.tsx apps/web/app/manager/loading.tsx apps/web/app/tenant/loading.tsx apps/web/app/settings/loading.tsx apps/web/app/achievements/loading.tsx apps/web/app/login/loading.tsx apps/web/app/onboarding/loading.tsx
# All should exist

# Verify operations-section shrank
wc -l apps/web/components/dashboard/operations-section.tsx
# Should be < 250 lines
```

## 8. Acceptance Criteria — ALL REQUIRED

| # | Criterion | Verification |
|---|---|---|
| 1 | `lib/logger.ts` exists with `logFailedSideEffect` and `sideEffectError` exports | File exists, exports match spec |
| 2 | Zero `.catch(() => {})` in `apps/web/app/` (excluding test files) | `grep` returns 0 results |
| 3 | Every catch replacement includes action name, operation name, and at least userId | Spot-check 5 files |
| 4 | `inbox.ts` L-002 fix uses `logFailedSideEffect` instead of bare `console.error` | Read the file |
| 5 | `operations-section.tsx` is ≤ 250 lines | `wc -l` check |
| 6 | `components/dashboard/forms/` directory contains property-form.tsx, unit-form.tsx, lease-form.tsx, form-helpers.tsx, index.ts | Files exist |
| 7 | `documents-section.tsx` is ≤ 300 lines with sub-components in `documents/` | `wc -l` check |
| 8 | `expenses-section.tsx` is ≤ 350 lines with sub-components in `expenses/` | `wc -l` check |
| 9 | `invitations-section.tsx` is ≤ 350 lines with sub-components in `invitations/` | `wc -l` check |
| 10 | `maintenance.ts` has single `getAdminMaintenanceTickets` replacing two duplicate functions | Grep for old function names returns 0 |
| 11 | All refactored components render identically to before (no visual changes) | Build succeeds, no type errors |
| 12 | `loading.tsx` exists for: owner, manager, tenant, settings, achievements, reports, login, onboarding, complete-profile, receipt | `ls` check |
| 13 | Every loading.tsx uses `.domus-skeleton` class | Grep check |
| 14 | Landing page has: animated hero, problem/solution section, tabbed feature showcase, how-it-works steps, testimonials, FAQ accordion, final CTA | Read file |
| 15 | `AnimateOnScroll` wrapper uses IntersectionObserver | Read file |
| 16 | Landing page is `"use client"` (needed for tabs + animations) | Check directive |
| 17 | `SectionErrorBoundary` component exists with retry button | Read file |
| 18 | `section-renderer.tsx` wraps each section with `SectionErrorBoundary` | Read file |
| 19 | 370+ total tests pass | Gate output |
| 20 | Logger tests: 6+ tests covering structured output, non-Error objects, defaults | Read test file |
| 21 | Rate limit tests: 10+ total (4 existing + 6 new) | Read test file |
| 22 | Theme tests: 16+ total (8 existing + 8 new) | Read test file |
| 23 | Validation tests: 159+ total (139 existing + 20 new edge cases) | Gate output |
| 24 | Lint clean, build clean, typecheck clean | Gate output |
| 25 | No broken imports from refactoring (build succeeds with zero type errors) | Build output |

## 9. Report Format

```
gate_passed: true/false
test_count: N
lint_clean: true/false
build_clean: true/false
silent_catches_remaining: N (must be 0)
operations_section_lines: N (must be ≤ 250)
loading_files_created: N (must be ≥ 10)
new_test_files: [list]
files_changed: [list]
acceptance_criteria: [1-25: pass/fail]
```

## 10. Constraints

- Do NOT apply any DB migrations
- Do NOT deploy
- Do NOT install new npm packages
- Do NOT use `useActionState` — use `useFormState` from `react-dom`
- Do NOT change any visual behavior during refactoring (Part B) — refactor only, no redesign
- Do NOT delete any exported function without updating ALL its importers
- Do NOT create README.md or documentation files
- Every Supabase `.update()`, `.insert()`, `.delete()` call must have its error result checked
- Report compact status only — do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- ALL parts are required. Do not skip any. If running long, reduce test count in Part F but complete Parts A-E fully.
