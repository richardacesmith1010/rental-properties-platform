# Sprint 103 — Lease Wizard Empty-State + Unit Guidance Fix

## Objective

Fix the lease creation experience so LLC members never see a blank or unexplained form. When data is missing (no properties, no units, no tenants), the wizard should tell the user exactly what's missing and what to do next.

## Context

- Branch: `main`
- HEAD: `64f3c5f` (Sprint 101)
- **Problem:** An LLC owner reported that the lease creation screen "shows nothing to fill in." Live data shows the LLC has two properties — one with a unit, one without. If the user selects the property without a unit, the unit dropdown is empty with no explanation. If no property is pre-selected, the form shows empty dropdowns.
- The lease wizard is a multi-step form: Step 1 (Property & Unit) → Step 2 (Tenant) → Step 3 (Lease terms) → Step 4 (Confirmation)
- The form receives `properties`, `units`, `tenants` arrays from the server via portfolio data
- If any array is empty, the corresponding dropdown is blank with no guidance

### Lease Wizard Files

- `apps/web/components/dashboard/lease-wizard.tsx` — modal wrapper, passes data to form
- `apps/web/components/dashboard/forms/lease-form.tsx` — multi-step form, renders dropdowns
- `apps/web/lib/portfolio.ts` — loads properties/units/tenants for the current account

## In Scope

1. **No properties available:** Show clear message instead of empty dropdown. "You don't have any properties yet. Create a property first."
2. **Property selected but no units:** Show clear message. "This property has no units. Add a unit before creating a lease."
3. **No tenants invited:** Show clear message at tenant step. "No tenants have been invited to this property yet. Invite a tenant first."
4. **Guide the user:** Each empty state should have a clear action (link or button) to resolve it
5. **Auto-select when obvious:** If only one property exists, auto-select it. If only one unit exists for the selected property, auto-select it.

## Out of Scope

- Redesigning the full lease wizard workflow
- Changing lease business rules or validation
- Changing permissions or property access logic
- Adding inline property/unit/tenant creation within the wizard (future feature)
- Tenant onboarding or invite flow changes

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/components/dashboard/forms/lease-form.tsx` | Add empty-state messages for each step; auto-select single options |
| `apps/web/components/dashboard/lease-wizard.tsx` | Pass action handlers or links for "Create Property" / "Add Unit" / "Invite Tenant" |

## Implementation Requirements

### 1. No Properties Empty State (`lease-form.tsx`)

At Step 1 (Property & Unit selection), if `portfolio.properties` is empty:

```
┌──────────────────────────────────────────┐
│  📋 No properties found                  │
│                                          │
│  You need to create a property before    │
│  you can set up a lease.                 │
│                                          │
│  [Create Property]                       │
└──────────────────────────────────────────┘
```

- Hide the property dropdown entirely
- Show the message card instead
- "Create Property" links to the New Property flow (or closes the wizard and navigates to it)
- Disable the "Next" button

### 2. No Units Empty State (`lease-form.tsx`)

At Step 1, when a property IS selected but `unitsForSelectedProperty` is empty:

```
┌──────────────────────────────────────────┐
│  🏠 [Property Name] has no units         │
│                                          │
│  Add a unit to this property before      │
│  creating a lease.                       │
│                                          │
│  [Add a Unit]                            │
└──────────────────────────────────────────┘
```

- Show the property dropdown (so user can switch properties)
- Replace the unit dropdown with this message
- "Add a Unit" links to the unit creation flow for the selected property
- Disable the "Next" button

### 3. No Tenants Empty State (`lease-form.tsx`)

At Step 2 (Tenant selection), if `tenantsForSelectedProperty` is empty. **Use the exact same filtering logic and data source that the existing tenant dropdown already uses** (currently `portfolio.tenants.filter(...)` in `lease-form.tsx` lines 79-84). Do NOT introduce new filtering logic or infer new tenant-property relationships:

```
┌──────────────────────────────────────────┐
│  👤 No tenants available                 │
│                                          │
│  Invite a tenant to this property first. │
│  They'll receive an email to set up      │
│  their account.                          │
│                                          │
│  [Invite Tenant]                         │
└──────────────────────────────────────────┘
```

- Hide the tenant dropdown
- Show the guidance message
- "Invite Tenant" opens the tenant invite flow or closes wizard to navigate
- Disable the "Next" button

### 4. Auto-Select Single Options (`lease-form.tsx`)

Auto-select must follow these safety rules:
- **Only run when the field is currently unset** (null/undefined/empty). Never overwrite a value the user has already selected.
- **Run once per field** — on initial mount (for properties) or when the upstream dependency changes (e.g., unit auto-select runs when `propertyId` changes, tenant auto-select runs when `propertyId` changes). Do NOT re-run on every render.
- **Never overwrite user-selected values.** If the user manually selects a property and then a second property becomes available, do NOT switch their selection.

Implementation:
- If `portfolio.properties.length === 1` AND `draft.propertyId` is unset: auto-select that property
- If `unitsForSelectedProperty.length === 1` AND `draft.unitId` is unset: auto-select that unit
- If `tenantsForSelectedProperty.length === 1` AND `draft.tenantProfileId` is unset: auto-select that tenant

This eliminates the "blank dropdown with one option" confusion.

### 5. Wizard Action Props (`lease-wizard.tsx`)

Add optional callback/link props so the form can navigate to the correct creation flow:

```typescript
interface LeaseWizardProps {
  // ... existing props ...
  onCreateProperty?: () => void;   // NEW
  onAddUnit?: (propertyId: string) => void;  // NEW
  onInviteTenant?: () => void;  // NEW
}
```

Thread these through to `LeaseForm`.

**All empty-state action buttons MUST:**
1. Close the lease wizard first
2. Then navigate to the correct existing page/route (e.g., New Property flow, unit management, tenant invite)

Do NOT leave the user inside the wizard after clicking an action button. The wizard should close, and the user lands on the page where they can resolve the missing data. When they return and reopen the wizard, the data will be available.

If callbacks are not provided, the action buttons should close the wizard and navigate to a sensible default route (e.g., the owner dashboard).

### 6. Plain Language (CLAUDE.md §18)

- "You need to create a property before you can set up a lease." (not "No administered properties found in portfolio data")
- "This property has no units. Add a unit before creating a lease." (not "Unit array length is 0 for selected property ID")
- "Invite a tenant to this property first." (not "No tenant profiles associated with property scope")
- "Add a Unit" (not "Create Unit Entity")
- "Invite Tenant" (not "Initiate Tenant Invitation Flow")

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] When `properties` array is empty, lease wizard Step 1 shows "No properties found" with "Create Property" action — dropdown is hidden
2. [ ] When a property is selected but has no units, Step 1 shows "[Property Name] has no units" with "Add a Unit" action — unit dropdown is replaced
3. [ ] When property + unit selected but no tenants available, Step 2 shows "No tenants available" with "Invite Tenant" action
4. [ ] All empty states disable the "Next" button so the user cannot proceed to incomplete steps
5. [ ] When only one property exists AND `propertyId` is unset, it is auto-selected on mount — does NOT overwrite user selection
6. [ ] When only one unit exists for selected property AND `unitId` is unset, it is auto-selected — does NOT overwrite user selection
7. [ ] When only one tenant exists for selected property AND `tenantProfileId` is unset, it is auto-selected — does NOT overwrite user selection
8. [ ] All empty-state action buttons close the wizard THEN navigate to the correct existing page — user is NOT left inside the wizard
9. [ ] Normal lease creation flow (properties, units, tenants all available) is unchanged
10. [ ] All user-facing text follows plain language rules
11. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-11] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT change lease business rules or validation logic
- Do NOT change `createLease` server action
- Do NOT change property access or permission logic
- Do NOT add inline property/unit/tenant creation within the wizard (close wizard first, then navigate to existing flows)
- Tenant filtering for empty-state detection MUST use the exact same data source and logic as the existing tenant dropdown. Do NOT introduce new filtering or infer new relationships.
- Auto-select MUST only run when the target field is unset. MUST NOT overwrite user-selected values. MUST run once per dependency change, not on every render.
- Do NOT create database migrations
- Do NOT modify auth or middleware
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
- Plain language in all user-facing text.
