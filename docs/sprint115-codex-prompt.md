# Sprint 115 — Cross-Property Tenant List View

## Objective

Add a standalone "Tenants" section to the dashboard that shows every tenant across all administered properties in one flat list. Property managers (and owners) currently have to navigate through individual leases or property detail pages to find a tenant — this gives them a single, searchable view.

## Context

- Branch: `main`
- HEAD: post-Sprint 114
- No standalone tenant list exists today. Tenants are visible:
  - Grouped by lease in `leases-section.tsx`
  - Per-property in `property-detail-tenants-panel.tsx` (Sprint 107)
- Data already exists in `portfolio.tenants` (fields: `id`, `email`, `fullName`, `phone`, `propertyIds`) and `portfolio.leases`
- Existing section pattern: each section is a case in `section-renderer.tsx` + a nav item in `nav-items.ts`

## In Scope

1. New section `tenants` — flat list of every administered tenant
2. New nav item "Tenants" in the sidebar
3. Per tenant: name, email, phone, properties/units they live at, active lease count
4. Search by name/email
5. Click-through to existing tenant details (activity timeline, message)
6. Test coverage

## Out of Scope

- New data fetching — reuse `portfolio.tenants` and `portfolio.leases`
- Tenant editing or invitation flows (those exist elsewhere)
- Bulk actions (delete, message-all, etc.)
- Filters beyond search (e.g., by property, by lease status) — could be added later
- New backend tables or columns
- Tenant-side view (this is for owners/managers only)

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/components/dashboard/tenants-section.tsx` | **NEW** — list component |
| `apps/web/components/dashboard/section-renderer.tsx` | Add `case "tenants"` → render `TenantsSection` |
| `apps/web/components/dashboard/section-map.ts` | Register the new section |
| `apps/web/components/dashboard/sidebar/nav-items.ts` | Add Tenants nav entry (icon: `Users` from lucide-react) |
| `apps/web/components/__tests__/tenants-section.test.tsx` | **NEW** — tests |

## Implementation Requirements

### 1. New Component (`tenants-section.tsx`)

Props (mirror existing section component patterns):

```typescript
interface TenantsSectionProps {
  tenants: TenantOption[];        // from portfolio.tenants
  leases: LeaseListItem[];         // from portfolio.leases
  properties: PropertyListItem[];  // from portfolio.properties
  units: UnitListItem[];           // from portfolio.units
  onSendMessage?: (tenantId: string) => void;  // optional handler — opens existing message modal
  onViewActivity?: (tenantId: string, propertyId: string) => void;  // optional — opens activity timeline
}
```

Layout:

```
┌────────────────────────────────────────────────────────────┐
│ Tenants (12)                                              │
│ [🔍 Search by name or email...                          ] │
├────────────────────────────────────────────────────────────┤
│ ▸ Angel Hernandez                                  Active │
│   angelhernabdez369@gmail.com · 555-1234                  │
│   1st Home — Unit A                                       │
│   [View Activity] [Send Message]                          │
├────────────────────────────────────────────────────────────┤
│ ▸ Test Tenant                                      Active │
│   richard.ace.smith+alt@gmail.com                         │
│   1st Home — Unit A                                       │
│   [View Activity] [Send Message]                          │
└────────────────────────────────────────────────────────────┘
```

Requirements:
- Tenants deduplicated by `id` (a tenant with leases at multiple properties appears once)
- Show tenant count in header
- For each tenant, list ALL units they have a lease at (e.g., "1st Home — Unit A" + "Mom's House — Unit B" if they have multiple)
- Lease status badge: "Active" (any active lease), "No active lease" (all leases ended)
- Active lease count is computed from `leases` array filtered by `tenantProfileId === tenant.id` and `active === true`
- Search filter: case-insensitive substring match on `fullName` OR `email`
- Empty state: if no tenants administered, show "No tenants yet. Invite a tenant from the Leases section."
- "View Activity" and "Send Message" buttons reuse existing handlers (callable from owner/manager pages)

### 2. Section Registration (`section-renderer.tsx` + `section-map.ts`)

Add a case for `"tenants"`:

```typescript
case "tenants":
  return renderSection(
    "Tenants",
    <TenantsSection
      tenants={props.filteredPortfolio.tenants}
      leases={props.filteredPortfolio.leases}
      properties={props.filteredPortfolio.properties}
      units={props.filteredPortfolio.units}
      onSendMessage={props.onSendMessage}
      onViewActivity={props.onViewActivity}
    />
  );
```

Update `section-map.ts` to include the new section in `SectionRendererProps` if needed (mirror existing entries).

### 3. Nav Item (`nav-items.ts`)

Add an entry near the existing "Leases" item:

```typescript
{
  id: "tenants",
  label: "Tenants",
  icon: Users,
  description: "All tenants across your properties.",
  clickHint: "open tenant directory"
}
```

Import `Users` icon from `lucide-react` if not already imported.

### 4. Wiring `onSendMessage` and `onViewActivity`

These handlers already exist in the dashboard for use in `leases-section.tsx`. The callers are `app/owner/page.tsx` and `app/manager/page.tsx`. Pass the same handlers through to `TenantsSection` (no new server actions needed).

If the existing handlers expect specific shapes (e.g., a tenant profile object), normalize as needed inside `TenantsSection` so the section's own onClick handlers can call into them with the right arguments.

### 5. Tests (`tenants-section.test.tsx`)

Add tests covering:
- Renders tenant count in header matching the deduplicated list
- Tenant with leases at 2 properties appears once with both unit labels
- Search filters by name (case-insensitive)
- Search filters by email
- Empty tenants array → empty state message
- Active lease badge shows when tenant has at least one active lease
- "No active lease" badge shows when all leases ended
- "View Activity" button calls `onViewActivity` with tenant id + first property
- "Send Message" button calls `onSendMessage` with tenant id

### 6. Plain Language

- "Tenants" (not "Tenant Profiles" or "Renters Directory")
- "Search by name or email..." (not "Filter tenant records")
- "Active" / "No active lease" (not "Has Active Lease" / "Lease Ended")
- "View Activity" / "Send Message" (already-used labels in the codebase)
- "No tenants yet. Invite a tenant from the Leases section." (not "No tenant records found in portfolio")

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] New file `tenants-section.tsx` exists with the props interface above
2. [ ] Tenants are deduplicated by `id` — a tenant with multiple leases appears once
3. [ ] Each row shows name, email, phone (if present), and ALL their property+unit labels
4. [ ] Lease status badge: "Active" if any active lease, otherwise "No active lease"
5. [ ] Header shows tenant count
6. [ ] Search filter is case-insensitive substring on name OR email
7. [ ] Empty state renders when zero tenants
8. [ ] `section-renderer.tsx` has a `case "tenants"` rendering `TenantsSection`
9. [ ] `section-map.ts` includes the new section
10. [ ] `nav-items.ts` has a "Tenants" entry with `Users` icon
11. [ ] `onSendMessage` and `onViewActivity` handlers are threaded through (reuse existing)
12. [ ] Tests pass for all behaviors listed in section 5
13. [ ] No new server actions, data fetches, or schema changes
14. [ ] All user-facing text uses plain language
15. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-15] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Reuse `portfolio.tenants`, `portfolio.leases`, `portfolio.properties`, `portfolio.units` — do NOT add new data fetching
- Do NOT add new server actions
- Do NOT modify the leases section or property detail tenants panel (they continue to work independently)
- Do NOT add tenant editing UI (that exists elsewhere)
- Do NOT add filters beyond search in this sprint
- Section follows the existing dashboard section pattern (no new layout system)
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
