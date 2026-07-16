# Sprint 116 — Active/Completed Tabs on Global Maintenance Section

## Objective

Add Active/Completed/All filter tabs to the global maintenance section, matching the pattern Sprint 107 already established in the property detail view. Currently a manager looking at global maintenance sees every ticket flat, regardless of status — they have to scroll through resolved/closed tickets to find what's still open.

## Context

- Branch: `main`
- HEAD: post-Sprint 115
- Global maintenance section at `apps/web/components/dashboard/maintenance-section.tsx` has NO status filtering today
- Property detail view (Sprint 107) already implements this pattern in `property-detail-detail-panels.tsx` (lines 190-196, 211-228)
- Canonical statuses (in `lib/validations-entity.ts` line 95): `"open" | "in_progress" | "resolved" | "closed"`
- Active = `open` OR `in_progress`. Completed = `resolved` OR `closed`. Same definitions as Sprint 107.

### Existing Pattern (Reuse, Don't Reinvent)

```typescript
type MaintenanceFilter = "active" | "completed" | "all";

const filtered = tickets.filter((ticket) => {
  if (filter === "active") return ticket.status === "open" || ticket.status === "in_progress";
  if (filter === "completed") return ticket.status === "resolved" || ticket.status === "closed";
  return true;
});
```

UI: three filter buttons styled as pill/tab toggles at the top of the section header.

## In Scope

1. Add `MaintenanceFilter` state in `maintenance-section.tsx`
2. Add three filter buttons: Active / Completed / All
3. Default to Active (most useful starting view)
4. Show counts in the buttons (e.g., "Active (3)")
5. Existing list rendering stays the same — only the filtered subset is passed to it
6. Empty state per filter: e.g., "No active tickets" / "No completed tickets" / "No tickets yet"
7. Tests covering the filter logic

## Out of Scope

- Modifying the property detail view (Sprint 107's panel — leave it alone)
- Filtering by other fields (priority, property, vendor) — could be added later
- Date range filters
- Bulk actions
- New ticket statuses

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/components/dashboard/maintenance-section.tsx` | Add filter state + filter UI; render filtered subset |
| `apps/web/components/__tests__/maintenance-section.test.tsx` (existing or new) | Tests for the new filter behavior |

## Implementation Requirements

### 1. Filter State + Logic (`maintenance-section.tsx`)

Add inside the component:

```typescript
type MaintenanceFilter = "active" | "completed" | "all";

const [filter, setFilter] = useState<MaintenanceFilter>("active");

const isActive = (status: string) => status === "open" || status === "in_progress";
const isCompleted = (status: string) => status === "resolved" || status === "closed";

const filteredTickets = useMemo(() => {
  if (filter === "active") return tickets.filter((t) => isActive(t.status));
  if (filter === "completed") return tickets.filter((t) => isCompleted(t.status));
  return tickets;
}, [tickets, filter]);

const activeCount = useMemo(() => tickets.filter((t) => isActive(t.status)).length, [tickets]);
const completedCount = useMemo(() => tickets.filter((t) => isCompleted(t.status)).length, [tickets]);
const totalCount = tickets.length;
```

### 2. Filter UI

Place above the existing list rendering. Match the visual pattern from `property-detail-detail-panels.tsx` lines 211-228 (pill/tab toggles). Three buttons:

```
[ Active (3) ]   [ Completed (12) ]   [ All (15) ]
```

Each button toggles the `filter` state. Selected button has a distinct visual treatment (filled background, etc.).

### 3. Empty States Per Filter

Replace the current empty rendering with filter-aware messages:
- `filter === "active"` and `filteredTickets.length === 0`: **"No active tickets right now."**
- `filter === "completed"` and `filteredTickets.length === 0`: **"No completed tickets yet."**
- `filter === "all"` and `tickets.length === 0`: **"No tickets yet."**

### 4. Existing Behavior Preserved

- The expand/collapse "Show More" / "Show Less" preview pattern stays
- Per-ticket rendering (DataRow with title, badges, metadata, etc.) stays
- All existing handlers (status change, comment, etc.) stay
- The sorting order stays (most recent first, presumably)

### 5. Tests

Add or extend the maintenance section test file. Cover:
- Default filter is "active"
- "Active (N)" button shows correct count
- "Completed (N)" button shows correct count
- "All (N)" button shows correct count
- Clicking "Completed" shows only `resolved`/`closed` tickets
- Clicking "All" shows everything
- Empty state changes based on filter (active/completed/all)
- Switching filter does NOT change ticket data, only what's rendered

### 6. Plain Language

- "Active" / "Completed" / "All" — already familiar terms
- "No active tickets right now." (not "Filtered ticket list is empty")
- "No completed tickets yet." (not "Zero resolved or closed tickets found")
- Counts in parentheses: "Active (3)" — clear, scannable

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] `maintenance-section.tsx` has a `filter` state of type `"active" | "completed" | "all"` with default `"active"`
2. [ ] Three filter buttons are rendered above the ticket list: Active, Completed, All
3. [ ] Each button shows a count: "Active (3)", "Completed (12)", "All (15)"
4. [ ] Filter logic: active = `open`/`in_progress`; completed = `resolved`/`closed`; all = no filter
5. [ ] Selected filter button has distinct visual treatment
6. [ ] Empty state message reflects the active filter
7. [ ] Existing list rendering (DataRow), expand/collapse, and handlers are unchanged
8. [ ] Tests cover: default filter, all three filter selections, count accuracy, empty states per filter
9. [ ] Property detail view (Sprint 107 maintenance panel) is NOT modified
10. [ ] All user-facing text uses plain language
11. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-11] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT modify `property-detail-detail-panels.tsx` — Sprint 107's panel keeps working as-is
- Do NOT change ticket statuses or status-related logic
- Do NOT add filters beyond the three tabs in this sprint
- Reuse the same active/completed status definitions used in Sprint 107
- Existing per-ticket rendering, handlers, and animations must work unchanged
- Default filter MUST be "active" — that's the most useful starting view
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
