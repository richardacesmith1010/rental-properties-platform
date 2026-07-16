# Sprint 74 — Codex Implementation Prompt

## 1. Objective

Make every piece of owner-entered data editable inline. Properties, units, leases, tenants, managers — anything created through a wizard or form should be modifiable after the fact. Every data card or detail row should have an edit affordance.

## 2. Context

- **Branch**: `main`
- **HEAD**: (latest after Sprint 73)
- **Production URL**: `https://domusbase.com`

**Current problem:** Data entered through wizards (property name, unit label, addresses, tenant info, lease terms, manager details) is frozen after creation. The user has "1st Home Unit Unit A" and can't fix it. There's no way to edit a property name, change a unit label, update a tenant's email, or modify lease dates after initial setup.

**Existing editable things:**
- Charge editing (Sprint 72)
- Rent amount on lease (Sprint 72)
- Profile settings (name, nickname, avatar)
- Ownership account name (Sprint 42)

**Things that should be editable but AREN'T:**
- Property: name, address, city, state, zip
- Unit: label/name, bedrooms, bathrooms, square footage
- Lease: start date, end date, tenant assignment, rent amount, terms
- Tenant profile: name, email, phone (from owner's perspective)
- Manager: name, email, payment percentage/amount, payment schedule

## 3. In Scope

### Part A: Property Editing
- Edit property name, street address, city, state, zip code
- Edit button on property cards in Portfolio section
- Edit button on property summary card
- Inline form or modal with current values pre-filled

### Part B: Unit Editing
- Edit unit label/name, bedrooms, bathrooms, square footage, rent amount
- Edit button on unit cards in Units section
- "Unit A" should be renameable to "Master Bedroom" or whatever the owner wants

### Part C: Lease Editing
- Edit lease start date, end date, monthly rent, notes/terms
- Edit button on lease cards in Leases section
- Cannot change the tenant assignment on an active lease (must create new lease)
- Can change dates and rent amount

### Part D: Tenant Info Editing (Owner View)
- Owner can update tenant's display name, phone, email as shown in their system
- This does NOT change the tenant's login credentials — it updates the owner's records
- Edit button on tenant cards in the tenant list

### Part E: Manager Info Editing
- Edit manager name, email, payment percentage, flat fee amount, payment schedule
- Edit button on manager cards
- Changes to payment terms take effect on next payment cycle

### Part F: Universal Edit Pattern
Create a reusable `EditableField` or `EditableCard` component:

```tsx
// Pattern 1: Inline edit (click text → becomes input)
<EditableField
  value="1st Home"
  onSave={(newValue) => updateProperty(id, { name: newValue })}
  label="Property Name"
/>

// Pattern 2: Edit modal (click edit button → modal with form)
<EditableCard
  title="1st Home"
  fields={[
    { key: "name", label: "Property Name", value: "1st Home" },
    { key: "address", label: "Address", value: "131 Chaste Tree Circle" },
    { key: "city", label: "City", value: "..." },
  ]}
  onSave={(updates) => updateProperty(id, updates)}
/>
```

Use **Pattern 2 (edit modal)** as the primary pattern — it's more discoverable and handles multiple fields. Pattern 1 (inline) can supplement for single-field quick edits like renaming.

### Part G: Edit Actions
Create server actions for each entity:

```typescript
// updateProperty(propertyId, updates: { name?, address?, city?, state?, zip? })
// updateUnit(unitId, updates: { label?, bedrooms?, bathrooms?, sqft? })
// updateLease(leaseId, updates: { start_date?, end_date?, rent_amount_cents?, notes? })
// updateTenantRecord(tenantId, updates: { display_name?, phone?, email? })
// updateManagerRecord(managerId, updates: { name?, email?, payment_pct?, flat_fee_cents?, schedule? })
```

Each action must:
1. Auth check — owner/manager only
2. Verify ownership chain (entity → property → owner)
3. Validate inputs (no empty names, valid dates, positive amounts)
4. Update the record
5. Revalidate the page

## 4. Out of Scope

- Deleting properties/units/leases (that's a separate destructive action with cascading effects)
- Changing tenant's login email (that's an auth change, not a data edit)
- Editing historical/paid financial records (covered in Sprint 72)
- Bulk editing multiple records at once
- Database migrations (use existing schema — all these columns already exist)
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (3-4)
1. `apps/web/components/dashboard/entity-edit-modal.tsx` — reusable edit modal for any entity type
2. `apps/web/app/actions/entity-updates.ts` — server actions for property, unit, lease, tenant, manager updates
3. `apps/web/lib/__tests__/entity-updates.test.ts` — unit tests
4. `apps/web/lib/entity-validation.ts` — shared validation helpers for entity fields (optional, may use existing validations.ts)

### Modified Files (8-12)
1. `apps/web/components/dashboard/portfolio-section.tsx` — add edit button on property cards
2. `apps/web/components/dashboard/units-section.tsx` — add edit button on unit cards
3. `apps/web/components/dashboard/leases-section.tsx` — add edit button on lease cards
4. `apps/web/components/dashboard/property-summary-card.tsx` — add edit button
5. `apps/web/components/dashboard/section-renderer.tsx` — pass edit handlers to sections
6. `apps/web/components/dashboard/invitations-section.tsx` — add edit for manager records
7. `apps/web/components/dashboard/charges-section.tsx` — show editable property/unit names
8. `apps/web/app/actions/properties.ts` — add updateProperty action (or put in entity-updates.ts)
9. `apps/web/app/actions/units.ts` — add updateUnit action
10. `apps/web/app/actions/lease-mutations.ts` — add updateLease action
11. `apps/web/lib/validations.ts` — add validation rules for entity fields

## 6. Implementation Requirements

### Part A: Reusable Entity Edit Modal

**File: `components/dashboard/entity-edit-modal.tsx`**

```tsx
"use client";

interface EditField {
  key: string;
  label: string;
  value: string | number | null;
  type: "text" | "number" | "date" | "email" | "tel" | "select" | "textarea";
  options?: { value: string; label: string }[];  // for select type
  required?: boolean;
  placeholder?: string;
  prefix?: string;  // "$" for currency fields
  validation?: (value: string) => string | null;  // returns error message or null
}

interface EntityEditModalProps {
  open: boolean;
  onClose: () => void;
  title: string;           // "Edit Property", "Edit Unit", etc.
  entityType: string;      // "property", "unit", "lease", etc. (for analytics/logging)
  fields: EditField[];
  onSave: (updates: Record<string, string | number>) => Promise<{ error?: string }>;
}

// Implementation:
// 1. Render a modal with form fields generated from the `fields` array
// 2. Each field renders the appropriate input type
// 3. Currency fields (prefix: "$") render as number inputs with dollar formatting
// 4. Date fields render as date pickers
// 5. Select fields render as dropdowns
// 6. Validate all fields on submit, show inline errors
// 7. Call onSave with only changed fields (don't send unchanged values)
// 8. Show loading state while saving
// 9. Close modal on success, show error toast on failure
// 10. Escape key and backdrop click close the modal
```

### Part B: Edit Buttons on Cards

Every entity card should have a subtle edit affordance:

```tsx
// Pencil icon button, top-right of card, visible on hover or always visible
<button
  onClick={() => setEditModalOpen(true)}
  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
  aria-label={`Edit ${entityName}`}
>
  <PencilIcon className="h-4 w-4" />
</button>
```

Place the edit button:
- **Property cards** (Portfolio section): top-right corner
- **Unit cards** (Units section): top-right corner
- **Lease cards** (Leases section): top-right corner, next to existing actions
- **Property summary card**: next to property name
- **Manager cards**: top-right corner
- **Tenant records in reports**: inline edit icon next to name

### Part C: Server Actions

**File: `app/actions/entity-updates.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";

// updateProperty(formData)
// Required: propertyId
// Optional: name, street_address, city, state, zip_code
// Auth: must be property owner
// Validation: name not empty, address fields not empty if provided

// updateUnit(formData)
// Required: unitId
// Optional: label, bedrooms, bathrooms, square_footage
// Auth: must be owner of unit's property
// Validation: label not empty, numbers >= 0

// updateLease(formData)
// Required: leaseId
// Optional: start_date, end_date, rent_amount_cents, notes
// Auth: must be owner of lease's unit's property
// Validation: end_date >= start_date, rent > 0
// NOTE: rent_amount_cents change only affects the lease record;
// existing charges are NOT retroactively changed (Sprint 72 handles individual charge edits)

// updateTenantDisplayInfo(formData)
// Required: profileId (tenant's profile)
// Optional: full_name, phone
// Auth: must be owner of a property where this tenant has a lease
// NOTE: This updates the profiles table display info only — NOT auth email

// updateManagerInfo(formData)
// Required: managerId (profile_id of manager)
// Optional: payment data on the manager_payments or property_managers table
// Auth: must be property owner
```

### Part D: Field Configurations Per Entity

```typescript
// Property edit fields:
const propertyFields: EditField[] = [
  { key: "name", label: "Property Name", value: property.name, type: "text", required: true },
  { key: "street_address", label: "Street Address", value: property.address, type: "text", required: true },
  { key: "city", label: "City", value: property.city, type: "text", required: true },
  { key: "state", label: "State", value: property.state, type: "text", required: true },
  { key: "zip_code", label: "ZIP Code", value: property.zip, type: "text", required: true },
];

// Unit edit fields:
const unitFields: EditField[] = [
  { key: "label", label: "Unit Name", value: unit.label, type: "text", required: true, placeholder: "e.g., Unit A, Master Suite" },
  { key: "bedrooms", label: "Bedrooms", value: unit.bedrooms, type: "number" },
  { key: "bathrooms", label: "Bathrooms", value: unit.bathrooms, type: "number" },
  { key: "square_footage", label: "Square Footage", value: unit.sqft, type: "number" },
];

// Lease edit fields:
const leaseFields: EditField[] = [
  { key: "start_date", label: "Start Date", value: lease.startDate, type: "date", required: true },
  { key: "end_date", label: "End Date", value: lease.endDate, type: "date", required: true },
  { key: "rent_amount_cents", label: "Monthly Rent", value: lease.rentAmountCents / 100, type: "number", required: true, prefix: "$" },
  { key: "notes", label: "Notes / Terms", value: lease.notes, type: "textarea" },
];
```

### Part E: Unit Tests

Test:
1. updateProperty validates non-empty name
2. updateProperty rejects unauthorized user
3. updateUnit validates label not empty
4. updateUnit validates bedrooms >= 0
5. updateLease validates end_date >= start_date
6. updateLease validates rent > 0
7. updateLease doesn't retroactively change existing charges
8. EntityEditModal renders correct fields for each entity type
9. EntityEditModal only submits changed fields

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Property name, address, city, state, zip are all editable via edit modal
2. [ ] Unit label, bedrooms, bathrooms, square footage are all editable
3. [ ] Lease start date, end date, rent amount, notes are all editable
4. [ ] Manager payment details are editable
5. [ ] Edit button (pencil icon) visible on all entity cards
6. [ ] Reusable EntityEditModal component works for all entity types
7. [ ] Validation: empty names rejected, negative numbers rejected, end < start rejected
8. [ ] Only property owner/manager can edit (auth enforced server-side)
9. [ ] Changes reflect immediately after save (revalidatePath)
10. [ ] Editing a lease's rent doesn't change existing charges
11. [ ] The "1st Home Unit Unit A" issue is fixable by editing the unit label
12. [ ] 9+ unit tests passing
13. [ ] `npm run gate:web` passes
14. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
PROPERTY_EDIT: working | broken
UNIT_EDIT: working | broken
LEASE_EDIT: working | broken
TENANT_EDIT: working | broken
MANAGER_EDIT: working | broken
EDIT_MODAL: reusable | broken
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations (all columns already exist)
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT allow editing of paid charge records (Sprint 72 handles charge editing separately)
- Do NOT allow changing a tenant's auth/login email — only display info
- Do NOT allow deleting entities in this sprint (separate destructive action sprint)
- Lease rent changes do NOT retroactively modify existing charges
- All updates must verify ownership chain server-side — never trust client-side auth
