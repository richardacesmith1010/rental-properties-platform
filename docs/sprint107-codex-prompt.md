# Sprint 107 — Property Detail Page

## Objective

Add a per-property detail page so a property manager can click into one property and see everything about it in one place: payment history, maintenance, documents, tenants, and activity. This consolidates existing data into a single view — no new features, just better organization.

## Context

- Branch: `main`
- HEAD: `eef09fb` (Sprint 105) + Sprint 106 keep-alive merged
- Property manager Alia Sanders requested: "each property being able to be viewed in its entirety would help. Clicking on the specific property history to see payments, record maintenance actions, property documents with separate sections of viewer access, tenant contact information, anything that pertains to that property."
- All the data already exists in the system — this sprint is about aggregating and presenting it on a per-property page
- Documents already support role-based visibility (`visibility` field: `"owner_manager"` or `"all"`) — leverage existing system
- No `/owner/properties/[propertyId]` route exists yet

### What Already Exists (Use, Don't Rebuild)

| Data | Source |
|------|--------|
| Property + units | `lib/portfolio.ts` `PropertyListItem` |
| Tenants per property | `lib/portfolio.ts` `TenantListItem` |
| Leases per property | `lib/portfolio.ts` `LeaseListItem` |
| Charges + payments | `lib/charges.ts`, `payments` table |
| Maintenance tickets | `lib/maintenance.ts` |
| Property documents | `lib/documents.ts` (with `visibility` field) |
| Tenant activity log | `lib/tenant-activity.ts` (Sprint 104) |

## In Scope

1. New route `/owner/properties/[propertyId]` — property detail page
2. Tabbed interface with sections: Overview, Payments, Maintenance, Documents, Tenants
3. Each section displays existing data scoped to this property
4. "View Details" button on property cards in the portfolio section that links to the new route
5. Same route accessible to managers (`/manager/properties/[propertyId]` OR shared route with permission check)
6. Permission: only owner/manager who can administer this property can access

## Out of Scope

- New data models or features (everything reuses existing data)
- Adding new maintenance ticket creation flow (link to existing flow — don't rebuild)
- New document upload UI (link to existing flow)
- Editing tenants or leases inline (read-only references)
- Cross-property aggregation (this is one property only)
- Real-time updates or websockets
- Mobile-specific layout (responsive but not optimized)

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/app/owner/properties/[propertyId]/page.tsx` | **NEW** — owner-facing property detail page |
| `apps/web/app/manager/properties/[propertyId]/page.tsx` | **NEW** — manager-facing property detail page (or shared layout) |
| `apps/web/lib/property-detail.ts` | **NEW** — server function to load all property-scoped data in parallel |
| `apps/web/components/dashboard/property-detail-view.tsx` | **NEW** — tabbed UI component shared by owner and manager pages |
| `apps/web/components/dashboard/portfolio-section.tsx` (or equivalent) | Add "View Details" link on each property card |

## Implementation Requirements

### 1. Server Data Loader (`lib/property-detail.ts`)

Create a single function that loads all data needed for the detail page in parallel:

```typescript
export async function getPropertyDetailData(propertyId: string, userId: string) {
  // Permission check first
  const canAccess = await canUserAdministerProperty(userId, propertyId);
  if (!canAccess) {
    return null;
  }

  // Parallel fetch
  const [property, units, leases, tenants, charges, payments, maintenance, documents, activity] = await Promise.all([
    getPropertyById(propertyId),
    getUnitsForProperty(propertyId),
    getLeasesForProperty(propertyId),
    getTenantsForProperty(propertyId),
    getChargesForProperty(propertyId),
    getPaymentsForProperty(propertyId),
    getMaintenanceTicketsForProperty(propertyId),
    getPropertyDocuments(propertyId),  // includes ALL visibility levels for owner/manager
    getRecentActivityForProperty(propertyId),  // tenant_activity_log
  ]);

  return { property, units, leases, tenants, charges, payments, maintenance, documents, activity };
}
```

**Note:** Use existing data-fetching functions where they exist. Add new ones only if necessary. Reuse helpers from `lib/portfolio.ts`, `lib/maintenance.ts`, `lib/documents.ts`, `lib/charges.ts`.

### 2. Detail View Component (`property-detail-view.tsx`)

Tabbed interface with 5 tabs:

**Tab 1: Overview**
- Property name, address, owner account
- Total units, occupied units, vacancy
- Monthly revenue (sum of active lease rents)
- Outstanding balance (sum of pending/late charges)
- Quick stats: open maintenance tickets count, recent activity count

**Tab 2: Payments**
- Table of all charges for this property (across all units/leases)
- Columns: Tenant, Unit, Charge type, Amount, Due date, Status, Payment date (if paid)
- Filter: All / Pending / Paid / Late
- Default sort: due date desc

**Tab 3: Maintenance**
- Table of all maintenance tickets for this property
- Columns: Title, Unit, Status, Priority, Created, Last updated
- Filter: Active (open, in_progress) / Completed (resolved, closed) / All
- "Open ticket" button links to existing maintenance ticket creation flow (do NOT rebuild)
- Click row to expand and see comments/status history (existing component)

**Tab 4: Documents**
- Two sections clearly labeled:
  - **Tenant-visible documents** (visibility = `'all'`)
  - **Owner & Manager only** (visibility = `'owner_manager'`)
- Each document: title, uploaded date, uploader, download link
- "Upload document" button links to existing upload flow
- Show empty state per section if no documents

**Tab 5: Tenants**
- Card list of tenants with active leases on this property
- Each card: name, email, phone, unit, lease dates, lease status badge
- "View Activity" link opens tenant activity timeline (Sprint 104 component)
- "Send Message" link opens existing message composer

### 3. Routes

**Owner page:** `apps/web/app/owner/properties/[propertyId]/page.tsx`
- Server component
- Fetches `getPropertyDetailData(propertyId, userId)`
- If null returned (no permission or not found): redirect to `/owner` with error
- Renders `<PropertyDetailView data={data} role="owner" />`

**Manager page:** `apps/web/app/manager/properties/[propertyId]/page.tsx`
- Same pattern but `role="manager"`
- Manager sees the same data (they administer this property)

Both pages should use a back link to return to the dashboard.

### 4. Portfolio Section Integration

Find where property cards are rendered in the dashboard (likely `portfolio-section.tsx` or `account-card.tsx`). Add a "View Details" button or link on each property card that navigates to the new route.

```tsx
<Link href={role === 'owner' ? `/owner/properties/${property.id}` : `/manager/properties/${property.id}`}>
  View Details
</Link>
```

### 5. Permission Model

- Owner: can access details for any property in their ownership accounts
- Manager: can access details only for properties they're assigned to (`property_managers` table, `active = true`)
- Tenant: NO access — they have their own dashboard
- Use existing `canUserAdministerProperty(userId, propertyId)` helper

### 6. Plain Language

- "Property Details" (not "Property Aggregated Data View")
- "Tenant-visible documents" (not "All-visibility documents")
- "Owner & Manager only" (not "Restricted-visibility documents")
- "Open ticket" (not "Create maintenance work order")
- "Active maintenance" / "Completed maintenance" (not "Open Status Tickets / Closed Status Tickets")

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] New route `/owner/properties/[propertyId]` exists and renders property detail
2. [ ] New route `/manager/properties/[propertyId]` exists with same view (manager scope)
3. [ ] `getPropertyDetailData` loads property-scoped data in parallel using existing helpers
4. [ ] Permission check: owner can access their properties; manager can access only assigned properties; unauthorized users redirected
5. [ ] Overview tab shows property summary, unit count, monthly revenue, outstanding balance, ticket count
6. [ ] Payments tab shows all charges for the property with filter (pending/paid/late/all)
7. [ ] Maintenance tab shows tickets with filter (active/completed/all) and link to existing ticket creation flow
8. [ ] Documents tab shows two sections: Tenant-visible (visibility='all') and Owner/Manager only (visibility='owner_manager')
9. [ ] Tenants tab shows tenant cards with contact info, lease info, and links to existing activity/message components
10. [ ] "View Details" link added to property cards in the dashboard portfolio section
11. [ ] All user-facing text follows plain language rules
12. [ ] No new data models created — only aggregation of existing data
13. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-13] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT create new data tables — this sprint aggregates existing data
- Do NOT build new maintenance ticket creation flow — link to existing
- Do NOT build new document upload UI — link to existing
- Do NOT modify existing components used as references (charges, maintenance, documents, tenant activity timeline)
- Do NOT add real-time/websocket updates
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
- Use existing `canUserAdministerProperty` for all permission checks.
- Plain language in all user-facing text.
