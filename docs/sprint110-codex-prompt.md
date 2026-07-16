# Sprint 110 — Property Selector for Managers

## Objective

Enable the existing property selector dropdown for managers. The selector already exists, the data is already loaded for managers, but a role gate hides it from the manager dashboard.

## Context

- Branch: `main`
- HEAD: post-Sprint 109
- Manager dashboard currently has no way to scope the dashboard to a specific property — managers see everything across all assigned properties at once
- Owners already have this selector. The component, the data fetch, and the wiring all exist
- Single role check blocks managers: `props.data.profileRole !== "owner"` in `section-renderer-support.tsx`

## In Scope

1. Allow `manager` role to see the property selector (one-line change)
2. Verify managers' property data is already populated (it is — `getAdministeredPropertyOptions` runs for managers in `app/manager/page.tsx`)
3. Tests that confirm managers see the selector and selection scopes the dashboard

## Out of Scope

- New components or new data fetching
- Changing the selector's UI or behavior
- Auto-select when only one property exists (separate feature)
- Tenant-side selector (tenants don't have multiple properties)
- Mobile-specific changes

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/components/dashboard/section-renderer-support.tsx` | Update `PropertyScopeControl` role gate to include `"manager"` |
| `apps/web/components/__tests__/section-renderer-support.test.tsx` (NEW or existing) | Test: manager role sees selector when properties exist |

## Implementation Requirements

### 1. Role Gate Fix (`section-renderer-support.tsx`, lines 40-47)

Current:
```typescript
function PropertyScopeControl({ props }: { props: SectionRendererProps }) {
  if (
    props.data.profileRole !== "owner" ||
    props.availableProperties.length === 0 ||
    props.activeSection === "members"
  ) {
    return null;
  }
  // ... renders PropertySelector
}
```

Updated:
```typescript
function PropertyScopeControl({ props }: { props: SectionRendererProps }) {
  const isOwnerOrManager = props.data.profileRole === "owner" || props.data.profileRole === "manager";

  if (
    !isOwnerOrManager ||
    props.availableProperties.length === 0 ||
    props.activeSection === "members"
  ) {
    return null;
  }
  // ... renders PropertySelector unchanged
}
```

The rest of the component (selector rendering, property scope handling) stays identical.

### 2. Test Coverage

Add a test verifying the gate behavior. Use the existing test patterns in the project.

Test cases:
- Manager + properties available → selector renders
- Manager + zero properties → selector hidden (existing behavior preserved)
- Owner + properties available → selector renders (existing behavior preserved)
- Tenant + properties available → selector hidden (tenants shouldn't see this)
- Active section is "members" → selector hidden (existing behavior preserved)

If a test file doesn't exist for `section-renderer-support`, create one. Otherwise, add tests to the existing file.

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] `PropertyScopeControl` role gate accepts `"owner"` AND `"manager"` (rejects others)
2. [ ] Managers see the property selector when they have administered properties
3. [ ] Managers with zero administered properties don't see the selector (empty-state behavior preserved)
4. [ ] Owner behavior is unchanged
5. [ ] Tenant behavior is unchanged (no selector)
6. [ ] "Members" section still hides the selector
7. [ ] Test added verifying manager sees selector when properties exist
8. [ ] Test added verifying owner still sees selector (regression guard)
9. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-9] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT modify the `PropertySelector` component itself
- Do NOT modify property data fetching (`getAdministeredPropertyOptions`)
- Do NOT change selector UI
- Do NOT add auto-select-on-single-property logic (separate sprint if needed)
- Keep the change to the role gate — surgical
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
