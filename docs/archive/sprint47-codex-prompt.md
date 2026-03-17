# Sprint 47 — Codex Implementation Prompt

## 1. Objective

Add a ⌘K command palette for power-user navigation, enhance the existing global search with tenant/property/transaction results, and build a richer notification activity feed with timestamps and action links.

## 2. Context

- **Branch**: `main`
- **HEAD**: `1f88e73`
- **Gate baseline**: all unit tests passing, lint clean, typecheck clean, build clean
- **Production URL**: `https://domusbase.com`

**Existing infrastructure:**
- `components/dashboard/sidebar/sidebar-nav.tsx` — sidebar with search input
- `components/dashboard/sidebar/nav-items.ts` — nav item definitions with labels and descriptions
- `components/dashboard/notifications-section.tsx` — notifications list
- `components/dashboard/dashboard-data-loader.tsx` — manages `activeSection`, `goToSection`, all loaded data (properties, tenants, charges, tickets)
- `lib/status-colors.ts` — status color system from Sprint 44
- Notification bell icon in header (top-right of sidebar)

## 3. In Scope

### Part A: Command Palette (⌘K / Ctrl+K)
- Modal overlay triggered by ⌘K (Mac) / Ctrl+K (Windows)
- Also triggered by clicking the existing search input in the sidebar
- Search across: section names, property names, tenant names, recent actions
- Keyboard navigable (arrow keys, Enter to select, Escape to close)
- Results grouped by category: "Sections", "Properties", "Tenants"
- Selecting a result navigates to that section or filters to that property/tenant

### Part B: Enhanced Search Results
- The command palette search should fuzzy-match against:
  - All nav section labels and descriptions (from nav-items.ts)
  - All property names and addresses (from loaded portfolio data)
  - All tenant names and emails (from loaded data)
  - Quick actions: "Add Property", "Create Lease", "New Tenant", etc.
- Results appear instantly as user types (client-side filtering, no API calls)
- Each result shows: icon, primary text, secondary text (category), keyboard shortcut hint

### Part C: Notification Activity Feed
- Enhance notifications-section.tsx with:
  - Relative timestamps ("2 hours ago", "Yesterday", "Mar 12")
  - Category grouping: "Today", "This Week", "Earlier"
  - Action links on notifications (e.g., "View Charge" links to charges section, "View Ticket" links to maintenance)
  - Read/unread visual distinction (bold for unread, normal for read)
  - "Mark all as read" button
- Notification bell in header shows unread count badge

### Part D: Contextual Dashboard Greeting
- Replace the static "Welcome, [Name]!" with a time-aware greeting:
  - "Good morning, Ace" (before noon)
  - "Good afternoon, Ace" (noon-5pm)
  - "Good evening, Ace" (after 5pm)
- Below the greeting, show a contextual summary line:
  - If charges are overdue: "You have X overdue charges totaling $Y"
  - If maintenance tickets open: "X maintenance tickets need attention"
  - If all good: "Everything looks good — no action items today"

## 4. Out of Scope

- Server-side search / full-text search API
- Push notifications / real-time WebSocket
- Notification preferences/settings changes
- Tenant or manager dashboard changes
- Database migrations
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (2-3)
1. `apps/web/components/dashboard/command-palette.tsx` — ⌘K modal with search
2. `apps/web/components/dashboard/contextual-greeting.tsx` — time-aware greeting + summary
3. `apps/web/lib/__tests__/command-palette.test.ts` — tests for search/filter logic

### Modified Files (5-7)
1. `apps/web/components/dashboard/dashboard-data-loader.tsx` — register ⌘K keyboard shortcut, pass search data to palette
2. `apps/web/components/dashboard/sidebar/sidebar-nav.tsx` — connect search input click to open command palette
3. `apps/web/components/dashboard/section-renderer.tsx` — render contextual greeting in overview, render command palette
4. `apps/web/components/dashboard/notifications-section.tsx` — enhanced feed with timestamps, grouping, action links, read/unread
5. `apps/web/components/dashboard/index.tsx` — export new components if needed
6. `apps/web/lib/notifications.ts` — add relative time formatting helper if not already present

## 6. Implementation Requirements

### Part A: Command Palette

**New file: `command-palette.tsx`**

```tsx
interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  sections: Array<{ id: string; label: string; description: string; icon: LucideIcon }>;
  properties: Array<{ id: string; name: string; address?: string }>;
  tenants: Array<{ id: string; name: string; email: string }>;
  onSelectSection: (sectionId: string) => void;
  onSelectProperty: (propertyId: string) => void;
  onSelectTenant: (tenantId: string) => void;
}
```

**UI structure:**
```
┌─────────────────────────────────────┐
│ 🔍 Search...                    ⌘K  │
├─────────────────────────────────────┤
│ SECTIONS                            │
│  📊 Daily Ops          Overview     │
│  💳 Charges            Payments     │
│  🔧 Maintenance        Tickets     │
│                                     │
│ PROPERTIES                          │
│  🏠 123 Main St        Property    │
│  🏠 456 Oak Ave        Property    │
│                                     │
│ QUICK ACTIONS                       │
│  ➕ Add Property                    │
│  ➕ Create Lease                    │
└─────────────────────────────────────┘
```

**Key behaviors:**
- Opens as a centered modal with backdrop blur
- Auto-focuses search input on open
- Results filter as user types (case-insensitive substring match)
- Arrow keys move selection highlight, Enter selects, Escape closes
- Clicking outside closes
- Maximum 10 results shown (prioritize: sections > properties > tenants)
- Empty state: show all sections as default when no query typed

**Keyboard shortcut registration:**
```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen(prev => !prev);
    }
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, []);
```

**Search algorithm (simple, client-side):**
```typescript
function searchItems(query: string, sections, properties, tenants): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return sections.map(s => ({ type: "section", ...s }));

  const results: SearchResult[] = [];

  // Search sections
  for (const s of sections) {
    if (s.label.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) {
      results.push({ type: "section", id: s.id, label: s.label, secondary: s.description, icon: s.icon });
    }
  }

  // Search properties
  for (const p of properties) {
    if (p.name.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q)) {
      results.push({ type: "property", id: p.id, label: p.name, secondary: p.address ?? "Property" });
    }
  }

  // Search tenants
  for (const t of tenants) {
    if (t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q)) {
      results.push({ type: "tenant", id: t.id, label: t.name, secondary: t.email });
    }
  }

  return results.slice(0, 10);
}
```

### Part B: Sidebar Search Integration

**In `sidebar-nav.tsx`:**
- Make the existing search input a trigger that opens the command palette
- On click or focus of the search input, call `onOpenCommandPalette()`
- Show "⌘K" hint text inside or next to the search input
- The actual search input inside the palette handles the typing

### Part C: Enhanced Notification Feed

**In `notifications-section.tsx`:**

Add relative time formatting:
```typescript
function relativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
```

Group notifications:
```typescript
function groupNotifications(notifications) {
  const today: Notification[] = [];
  const thisWeek: Notification[] = [];
  const earlier: Notification[] = [];

  const now = new Date();
  for (const n of notifications) {
    const date = new Date(n.created_at);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 0) today.push(n);
    else if (diffDays < 7) thisWeek.push(n);
    else earlier.push(n);
  }

  return { today, thisWeek, earlier };
}
```

**Notification item rendering:**
- Left: colored dot (unread = primary color, read = gray)
- Middle: notification text + relative timestamp
- Right: action link based on notification type (e.g., charge notification → "View" button that navigates to charges section)

**Unread count badge on notification bell:**
Pass unread count from notifications data to the sidebar header bell icon. Render as a small red circle with count.

### Part D: Contextual Greeting

**New file: `contextual-greeting.tsx`**

```tsx
interface ContextualGreetingProps {
  userName: string;
  overdueChargeCount: number;
  overdueAmountCents: number;
  openTicketCount: number;
}

export function ContextualGreeting(props: ContextualGreetingProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  let summary: string;
  if (props.overdueChargeCount > 0) {
    summary = `You have ${props.overdueChargeCount} overdue charge${props.overdueChargeCount > 1 ? "s" : ""} totaling ${formatCurrency(props.overdueAmountCents)}`;
  } else if (props.openTicketCount > 0) {
    summary = `${props.openTicketCount} maintenance ticket${props.openTicketCount > 1 ? "s" : ""} need attention`;
  } else {
    summary = "Everything looks good — no action items today";
  }

  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight">
        {greeting}, {props.userName}
      </h1>
      <p className="text-sm text-muted-foreground mt-1">{summary}</p>
    </div>
  );
}
```

Place in section-renderer.tsx overview section, replacing or augmenting the existing welcome heading. Only show on overview section, not other sections.

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] ⌘K / Ctrl+K opens command palette modal
2. [ ] Command palette searches sections, properties, tenants as user types
3. [ ] Arrow keys navigate results, Enter selects, Escape closes
4. [ ] Selecting a section navigates to it, selecting a property filters dashboard
5. [ ] Sidebar search input click opens command palette
6. [ ] Search input shows "⌘K" keyboard hint
7. [ ] Notifications grouped by "Today", "This Week", "Earlier"
8. [ ] Notifications show relative timestamps ("2h ago", "Yesterday", etc.)
9. [ ] Notification items have action links to relevant sections
10. [ ] Unread notifications visually distinct from read
11. [ ] Notification bell shows unread count badge
12. [ ] Contextual greeting shows time-appropriate message
13. [ ] Greeting shows actionable summary (overdue charges, open tickets, or all-clear)
14. [ ] `npm run gate:web` passes — all unit tests, lint, typecheck, build clean
15. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
COMMAND_PALETTE: working | broken
NOTIFICATIONS_ENHANCED: working | broken
CONTEXTUAL_GREETING: working | broken
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies (use existing lucide-react icons, existing UI components)
- Do NOT add server-side search — all search is client-side from loaded data
- Do NOT change tenant or manager dashboards
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Command palette must not interfere with existing keyboard shortcuts
- All new components must handle empty data gracefully
