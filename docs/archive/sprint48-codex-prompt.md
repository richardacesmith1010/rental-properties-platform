# Sprint 48 — Codex Implementation Prompt

## 1. Objective

Add inline editing for common fields (property name, unit rent, tenant contact), batch operations for charges and messaging, and polish the tenant portal with a more welcoming experience.

## 2. Context

- **Branch**: `main`
- **HEAD**: `ef5c4bf`
- **Gate baseline**: all unit tests passing, lint clean, typecheck clean, build clean
- **Production URL**: `https://domusbase.com`

**Existing infrastructure:**
- `components/dashboard/portfolio-section.tsx` — property list with edit/delete
- `components/dashboard/units-section.tsx` — unit list
- `components/dashboard/charges-section.tsx` — charge list with status badges
- `components/dashboard/leases-section.tsx` — lease list
- `app/actions/properties.ts` — property CRUD actions
- `app/actions/units.ts` — unit CRUD actions
- `app/actions/charges.ts` — charge actions
- `app/actions/maintenance.ts` — ticket actions
- `app/tenant/page.tsx` — tenant dashboard entry point
- `components/dashboard/section-renderer.tsx` — handles tenant sections too
- `lib/status-colors.ts` — consistent status color system
- `components/shared/empty-state.tsx` — reusable empty state
- `components/dashboard/contextual-greeting.tsx` — time-aware greeting (owner only currently)

## 3. In Scope

### Part A: Inline Editing
Add click-to-edit capability on key fields throughout the owner dashboard:

1. **Property name** — in portfolio section, click property name to edit inline
2. **Unit rent amount** — in units section, click rent amount to edit
3. **Unit label/number** — in units section, click unit label to edit
4. **Tenant display name** — in tenant list, click name to edit (if owner has permission)

Pattern: Click text → transforms to input → Enter saves, Escape cancels → shows success toast or error

### Part B: Batch Operations
Add multi-select + batch action capability to the charges section:

1. **Select charges** — checkboxes on charge rows
2. **Select all** — checkbox in header to select all visible charges
3. **Batch actions toolbar** — appears when 1+ charges selected:
   - "Send Reminder" — sends payment reminder notification to selected charge tenants
   - "Export Selected" — exports selected charges as CSV
4. **Selection count badge** — "X selected" indicator

### Part C: Tenant Portal Polish
Enhance the tenant experience:

1. **Tenant contextual greeting** — reuse the time-aware greeting pattern from owner dashboard
   - "Good morning, [Name]"
   - Summary: "Your rent of $X is due in Y days" or "You're all caught up — no payments due"
2. **Upcoming payment card** — prominent card showing next payment due date, amount, and pay button
3. **Quick action buttons** — at top of tenant overview:
   - "Pay Rent" (links to charges)
   - "Submit Request" (links to maintenance)
   - "View Documents" (links to documents)
4. **Lease summary card** — compact card showing current lease dates, property/unit, monthly rent

## 4. Out of Scope

- Manager dashboard changes
- New database migrations
- Actual payment processing changes (Stripe flows unchanged)
- Email sending for batch reminders (just create in-app notifications)
- Mobile app / responsive redesign
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (3-4)
1. `apps/web/components/dashboard/inline-edit.tsx` — reusable inline edit component
2. `apps/web/components/dashboard/batch-toolbar.tsx` — batch actions toolbar
3. `apps/web/components/dashboard/tenant-overview.tsx` — tenant overview with greeting, quick actions, payment card, lease summary
4. `apps/web/lib/__tests__/inline-edit.test.ts` — tests for inline edit behavior

### Modified Files (6-8)
1. `apps/web/components/dashboard/portfolio-section.tsx` — inline edit on property names
2. `apps/web/components/dashboard/units-section.tsx` — inline edit on unit label and rent
3. `apps/web/components/dashboard/charges-section.tsx` — checkboxes, select all, batch toolbar
4. `apps/web/components/dashboard/section-renderer.tsx` — render tenant overview in tenant overview section
5. `apps/web/components/dashboard/dashboard-data-loader.tsx` — pass tenant-specific data for overview
6. `apps/web/app/actions/properties.ts` — add `renameProperty` action if not exists (simple display_name update)
7. `apps/web/app/actions/units.ts` — add `updateUnitField` action for inline rent/label updates
8. `apps/web/app/actions/notifications.ts` — add `sendBatchReminder` action for batch charge reminders

## 6. Implementation Requirements

### Part A: Inline Edit Component

**New file: `inline-edit.tsx`**

```tsx
interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => Promise<{ error?: string }>;
  className?: string;
  inputType?: "text" | "number";
  prefix?: string;  // e.g., "$" for currency fields
  placeholder?: string;
  validate?: (value: string) => string | null;  // return error message or null
}

export function InlineEdit({ value, onSave, className, inputType = "text", prefix, placeholder, validate }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSave = async () => {
    if (editValue === value) { setEditing(false); return; }
    if (validate) {
      const err = validate(editValue);
      if (err) { setError(err); return; }
    }
    setSaving(true);
    setError(null);
    const result = await onSave(editValue);
    setSaving(false);
    if (result?.error) { setError(result.error); }
    else { setEditing(false); }
  };

  if (!editing) {
    return (
      <button
        onClick={() => { setEditing(true); setEditValue(value); }}
        className={cn("hover:bg-muted/50 rounded px-1.5 py-0.5 transition-colors cursor-text text-left", className)}
        title="Click to edit"
      >
        {prefix}{value}
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      {prefix && <span className="text-muted-foreground">{prefix}</span>}
      <input
        ref={inputRef}
        type={inputType}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={handleSave}
        disabled={saving}
        className="border rounded px-1.5 py-0.5 text-sm w-auto min-w-[60px] focus:outline-none focus:ring-2 focus:ring-primary/50"
        placeholder={placeholder}
      />
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
```

**Usage in portfolio-section.tsx:**
```tsx
<InlineEdit
  value={property.name}
  onSave={async (newName) => {
    const result = await renameProperty(property.id, newName);
    if (result?.error) return { error: result.error };
    router.refresh();
    return {};
  }}
  className="font-semibold text-lg"
/>
```

**Usage in units-section.tsx for rent:**
```tsx
<InlineEdit
  value={String(unit.rentCents / 100)}
  inputType="number"
  prefix="$"
  onSave={async (newRent) => {
    const cents = Math.round(Number(newRent) * 100);
    const result = await updateUnitRent(unit.id, cents);
    if (result?.error) return { error: result.error };
    router.refresh();
    return {};
  }}
  validate={(v) => {
    const n = Number(v);
    if (isNaN(n) || n < 0) return "Must be a positive number";
    if (n > 100000) return "Amount too large";
    return null;
  }}
/>
```

### Part B: Batch Operations

**New file: `batch-toolbar.tsx`**

```tsx
interface BatchToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSendReminder: () => void;
  onExport: () => void;
  allSelected: boolean;
}

export function BatchToolbar(props: BatchToolbarProps) {
  if (props.selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/20 px-4 py-2 mb-4">
      <span className="text-sm font-medium">{props.selectedCount} selected</span>
      <div className="h-4 w-px bg-border" />
      <button
        onClick={props.onSendReminder}
        className="text-sm text-primary hover:underline"
      >
        Send Reminder
      </button>
      <button
        onClick={props.onExport}
        className="text-sm text-primary hover:underline"
      >
        Export CSV
      </button>
      <div className="flex-1" />
      <button
        onClick={props.onDeselectAll}
        className="text-sm text-muted-foreground hover:underline"
      >
        Clear selection
      </button>
    </div>
  );
}
```

**In charges-section.tsx:**
- Add `selectedChargeIds: Set<string>` state
- Add checkbox column to charge rows
- Add select-all checkbox in the header row
- Render `<BatchToolbar>` above the charge list when selections exist
- "Send Reminder" creates in-app notifications for selected charge tenants (call a server action)
- "Export CSV" generates and downloads a CSV of selected charges (client-side generation)

**CSV export (client-side):**
```typescript
function exportChargesCSV(charges: Charge[]) {
  const headers = ["Tenant", "Amount", "Due Date", "Status"];
  const rows = charges.map(c => [
    c.tenantName, formatCurrency(c.amountCents), c.dueDate, c.status
  ]);
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `charges-export-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

### Part C: Tenant Portal Polish

**New file: `tenant-overview.tsx`**

```tsx
interface TenantOverviewProps {
  userName: string;
  nextCharge: { amountCents: number; dueDate: string } | null;
  lease: { startDate: string; endDate: string; propertyName: string; unitLabel: string; monthlyRentCents: number } | null;
  openTicketCount: number;
  goToSection: (section: string) => void;
}

export function TenantOverview(props: TenantOverviewProps) {
  // Time-aware greeting (reuse pattern from contextual-greeting.tsx)
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Summary line
  let summary: string;
  if (props.nextCharge) {
    const daysUntil = Math.ceil((new Date(props.nextCharge.dueDate).getTime() - Date.now()) / 86400000);
    if (daysUntil < 0) {
      summary = `You have a payment of ${formatCurrency(props.nextCharge.amountCents)} that is overdue`;
    } else if (daysUntil === 0) {
      summary = `Your payment of ${formatCurrency(props.nextCharge.amountCents)} is due today`;
    } else {
      summary = `Your rent of ${formatCurrency(props.nextCharge.amountCents)} is due in ${daysUntil} day${daysUntil > 1 ? "s" : ""}`;
    }
  } else {
    summary = "You're all caught up — no payments due";
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{greeting}, {props.userName}</h1>
        <p className="text-sm text-muted-foreground mt-1">{summary}</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <QuickActionButton icon={CreditCard} label="Pay Rent" onClick={() => props.goToSection("charges")} />
        <QuickActionButton icon={Wrench} label="Submit Request" onClick={() => props.goToSection("maintenance")} />
        <QuickActionButton icon={FileText} label="View Documents" onClick={() => props.goToSection("documents")} />
      </div>

      {/* Upcoming Payment Card (if charge exists) */}
      {props.nextCharge && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Next Payment Due</p>
              <p className="text-2xl font-bold">{formatCurrency(props.nextCharge.amountCents)}</p>
              <p className="text-sm text-muted-foreground">{formatDate(props.nextCharge.dueDate)}</p>
            </div>
            <button
              onClick={() => props.goToSection("charges")}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Pay Now
            </button>
          </div>
        </div>
      )}

      {/* Lease Summary Card (if lease exists) */}
      {props.lease && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="font-semibold mb-3">Your Lease</h3>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-muted-foreground">Property</span>
            <span>{props.lease.propertyName} — {props.lease.unitLabel}</span>
            <span className="text-muted-foreground">Lease Period</span>
            <span>{formatDate(props.lease.startDate)} – {formatDate(props.lease.endDate)}</span>
            <span className="text-muted-foreground">Monthly Rent</span>
            <span className="font-medium">{formatCurrency(props.lease.monthlyRentCents)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Quick action button helper
function QuickActionButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <Icon className="h-5 w-5 text-primary" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
```

**Integration:**
- In `section-renderer.tsx`, when role is tenant and activeSection is "overview", render `<TenantOverview>` instead of the default tenant overview
- Pass data from dashboard-data-loader (charges, lease info, user name)
- Check the existing tenant data shape in dashboard-data-loader to find the correct props

### Part D: Server Actions

**In `app/actions/properties.ts`:**
Add or use existing rename capability:
```typescript
export async function renameProperty(propertyId: string, newName: string) {
  // Auth check, validate name, update properties.name
}
```

**In `app/actions/units.ts`:**
Add inline update capability:
```typescript
export async function updateUnitField(unitId: string, field: "label" | "rent_amount_cents", value: string | number) {
  // Auth check, validate, update single field
}
```

**In `app/actions/notifications.ts` or `charges.ts`:**
Add batch reminder:
```typescript
export async function sendBatchPaymentReminder(chargeIds: string[]) {
  // Auth check, load charges, create notification for each tenant
  // Use sideEffectError pattern for non-critical failures
}
```

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] InlineEdit component works: click to edit, Enter saves, Escape cancels
2. [ ] Property names editable inline in portfolio section
3. [ ] Unit rent and label editable inline in units section
4. [ ] Inline edits show loading spinner during save
5. [ ] Inline edits show error message on failure
6. [ ] Charge rows have selection checkboxes
7. [ ] Select-all checkbox in charge list header
8. [ ] Batch toolbar appears with "Send Reminder" and "Export CSV" when charges selected
9. [ ] CSV export downloads file with correct charge data
10. [ ] Tenant overview shows time-aware greeting with payment summary
11. [ ] Tenant quick action buttons navigate to correct sections
12. [ ] Upcoming payment card shows amount, due date, and pay button
13. [ ] Lease summary card shows property, dates, and rent
14. [ ] All components handle empty/null data gracefully
15. [ ] `npm run gate:web` passes — all unit tests, lint, typecheck, build clean
16. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
INLINE_EDIT: working | broken
BATCH_OPS: working | broken
TENANT_PORTAL: working | broken
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT change payment processing (Stripe flows unchanged)
- Do NOT change manager dashboard
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Inline edits must validate input before saving
- Batch operations use existing notification system, not email
- CSV export is client-side only (no server endpoint)
- All server actions must include auth checks
- Use sideEffectError pattern for non-critical operations
