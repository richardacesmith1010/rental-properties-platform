# Sprint 80 — Codex Implementation Prompt

## 1. Objective

UX polish sprint: make charge management actions discoverable without scrolling, add notification clear-all, fix sidebar overflow, and improve small interaction details.

## 2. Context

- **Branch**: `main`
- **HEAD**: `a3e3764`
- **Production URL**: `https://domusbase.com`

**Visual audit findings:**
1. Charge card Edit/Waive/Delete buttons are below the fold — invisible without scrolling
2. Trash icon has no label — other actions say "Edit" and "Waive" but trash is icon-only
3. Notification bell shows count (3) but no way to clear/dismiss old notifications
4. Sidebar nav clips "Reports" and "Manager Payments" on shorter viewports
5. Message icon next to tenant name on charge cards is too small to discover
6. Mobile: user menu popover shouldn't auto-open on page load

## 3. In Scope

### Part A: Charge Card Action Consolidation
Replace the current vertical stack of buttons (Pay now / Record Payment / Edit / Waive / 🗑️) with a compact layout that's visible without scrolling:

**New charge card layout:**
```
┌─────────────────────────────────────────────────────┐
│ ☐  1st Home • Unit A                    $2,350      │
│    Angel Hernandez 💬  ·  Due Mar 31     Pending     │
│                                                      │
│    [ Pay now ]  [ Record ]  [ ⋮ More ]              │
└─────────────────────────────────────────────────────┘
```

- **"Pay now"** and **"Record Payment"** stay as primary buttons (visible immediately)
- **"⋮ More"** dropdown menu contains: Edit, Waive, Delete
- Delete in the dropdown should say "Delete" with a trash icon — not just an icon
- Delete should be red/destructive styled in the dropdown
- The entire card should fit in ~120px height so it's fully visible without scrolling
- Charge amount and status badge on the same line as the property name

### Part B: Notification Bell — Clear All
When the user clicks the notification bell (🔔 3):

- Show the notification dropdown/panel as usual
- Add a **"Clear all"** button at the top of the dropdown
- "Clear all" marks all notifications as read/dismissed
- Individual notifications should also have a small "×" dismiss button
- After clearing, the badge count goes to 0 and disappears

### Part C: Sidebar Scroll Fix
The sidebar nav items ("Daily Ops", "New Property", etc.) clip at the bottom on shorter viewports. "Reports" and "Manager Payments" are cut off.

**Fix:**
- Add `overflow-y-auto` to the nav items container
- The sidebar should scroll independently of the main content
- The user footer (Ace / Owner) at the bottom should stay pinned — only the nav items scroll
- Use `flex-1 min-h-0 overflow-y-auto` on the nav list container

### Part D: Message Icon Enhancement
The 💬 icon next to tenant names on charge cards is too small (looks like it could be a footnote marker).

**Fix:**
- Increase icon size from ~14px to ~18px
- Add a tooltip on hover: "Message Angel Hernandez"
- On mobile: make it a tappable 44x44px touch target
- Consider adding "Message" text label on desktop: `💬 Message`

### Part E: Trash Icon Label
The delete button on charge cards is a trash icon with no text. Every other action has a label.

**Fix:**
- If keeping the button visible (not moved to dropdown): add "Delete" text next to icon
- If moved to "⋮ More" dropdown: show as "Delete" with trash icon, red text
- Either way, the action must have a text label

### Part F: Mobile User Menu Fix
On mobile, the user menu popover (Ace / Owner at bottom of sidebar) auto-opens on page load.

**Fix:**
- The popover should only open on explicit tap/click
- Check for any `useEffect` or `autoFocus` that's triggering the popover on mount
- Ensure it works correctly as a tap-to-toggle on mobile

## 4. Out of Scope

- New features
- Database migrations
- Payment flow changes
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### Modified Files (5-8)
1. `apps/web/components/dashboard/charges-section.tsx` — charge card layout consolidation, "⋮ More" dropdown
2. `apps/web/components/dashboard/sidebar/sidebar-nav.tsx` — sidebar overflow-y-auto, pinned footer
3. `apps/web/components/dashboard/notifications-section.tsx` or notification bell component — "Clear all" button, individual dismiss
4. `apps/web/components/dashboard/dashboard-header.tsx` or wherever the bell is rendered — notification dropdown with clear
5. `apps/web/app/actions/notifications.ts` — `clearAllNotifications` and `dismissNotification` actions
6. `apps/web/components/dashboard/sidebar/user-footer.tsx` — fix auto-open popover on mobile
7. `apps/web/lib/notifications.ts` — mark-as-read/dismissed helper

## 6. Implementation Requirements

### Part A: Charge Card Compact Layout

```tsx
// Each charge card should be a single row with inline actions:
<div className="flex items-center justify-between py-3 px-4 border-b border-border">
  {/* Left: checkbox + property + tenant */}
  <div className="flex items-center gap-3 min-w-0">
    <input type="checkbox" className="h-4 w-4" />
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-medium truncate">1st Home • Unit A</span>
        <span className="text-2xl font-bold">${amount}</span>
        <StatusBadge status={charge.status} />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{tenantName}</span>
        <button title={`Message ${tenantName}`} className="p-1 hover:bg-muted rounded">
          <MessageSquare className="w-4.5 h-4.5" />
        </button>
        <span>·</span>
        <span>Due {formatDate(charge.dueDate)}</span>
      </div>
    </div>
  </div>

  {/* Right: actions */}
  <div className="flex items-center gap-2 flex-shrink-0">
    <Button size="sm" variant="default">Pay now</Button>
    <Button size="sm" variant="outline">Record</Button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost"><MoreVertical className="w-4 h-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
        <DropdownMenuItem><Ban className="w-4 h-4 mr-2" /> Waive</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-red-600">
          <Trash2 className="w-4 h-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</div>
```

Use shadcn DropdownMenu component if available. If not, a simple popover menu.

### Part B: Notification Clear All

```tsx
// In the notification dropdown/panel header:
<div className="flex items-center justify-between p-3 border-b">
  <h3 className="font-semibold text-sm">Notifications</h3>
  {notificationCount > 0 && (
    <button
      onClick={handleClearAll}
      className="text-xs text-muted-foreground hover:text-foreground"
    >
      Clear all
    </button>
  )}
</div>

// Each notification item:
<div className="flex items-start gap-2 p-3 border-b hover:bg-muted/50">
  <div className="flex-1">
    <p className="text-sm">{notification.message}</p>
    <span className="text-xs text-muted-foreground">{timeAgo}</span>
  </div>
  <button onClick={() => dismiss(notification.id)} className="p-1 hover:bg-muted rounded">
    <X className="w-3.5 h-3.5 text-muted-foreground" />
  </button>
</div>
```

Server action:
```typescript
// clearAllNotifications()
// UPDATE notifications SET read = true WHERE profile_id = userId AND read = false

// dismissNotification(notificationId)
// UPDATE notifications SET read = true WHERE id = notificationId AND profile_id = userId
```

### Part C: Sidebar Scroll

```tsx
// sidebar-nav.tsx layout:
<aside className="flex flex-col h-full">
  {/* Header: logo, search, account switcher */}
  <div className="flex-shrink-0">
    {/* ... */}
  </div>

  {/* Nav items: scrollable */}
  <nav className="flex-1 min-h-0 overflow-y-auto py-2">
    {navItems.map(item => ...)}
  </nav>

  {/* Footer: pinned at bottom */}
  <div className="flex-shrink-0 border-t">
    <UserFooter />
  </div>
</aside>
```

### Part D: Mobile Popover Fix

Check `user-footer.tsx` for:
- Any `defaultOpen={true}` prop on the popover
- Any `useEffect` that calls `setOpen(true)` on mount
- Any `autoFocus` prop that might trigger the popover

Fix: ensure `open` state defaults to `false` and only changes on click.

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Charge card shows all actions (Pay now, Record, ⋮ More) without scrolling
2. [ ] "⋮ More" dropdown contains Edit, Waive, Delete with labels
3. [ ] Delete action in dropdown is red/destructive styled with "Delete" text
4. [ ] Notification bell dropdown has "Clear all" button
5. [ ] Individual notifications have dismiss "×" button
6. [ ] After clearing, notification badge count goes to 0
7. [ ] Sidebar nav scrolls independently when viewport is short
8. [ ] User footer (Ace/Owner) stays pinned at sidebar bottom
9. [ ] "Reports" and "Manager Payments" visible by scrolling sidebar
10. [ ] Message icon next to tenant name is ≥18px with tooltip
11. [ ] Mobile: user menu doesn't auto-open on page load
12. [ ] `npm run gate:web` passes
13. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
CHARGE_CARD: compact | unchanged
DROPDOWN_MENU: working | broken
NOTIFICATION_CLEAR: working | broken
SIDEBAR_SCROLL: working | broken
MOBILE_POPOVER: fixed | still opens
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Use existing shadcn components (DropdownMenu, Popover) where available
- Charge card must remain functional — don't break Pay now or Record Payment flows
- Notification dismissal should be soft-delete (mark as read), not hard delete
