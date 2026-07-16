# Sprint 87 — Actionable Notifications

## 1. Objective

Make every notification in the bell dropdown actionable with context-specific buttons. Add dismiss and clear-all functionality. No notification should be a dead end — every one must have at least one action button that takes the user to the relevant page.

## 2. Context

- **Branch:** main
- **HEAD:** 00446c0
- **Production URL:** https://domusbase.com
- **Supabase project ID:** vawqdqkaguhdgfhdebqw

## 3. In Scope

- Add action buttons to every notification type in the bell dropdown
- Add "Clear all" button at the top of the notification dropdown
- Add individual dismiss ("x") button on each notification
- Server actions for clearAllNotifications and dismissNotification
- Navigation from action buttons to relevant pages

## 4. Out of Scope

- Email notification changes (email templates are separate)
- Push notifications / service workers
- Notification preferences / settings page
- Database schema changes (use existing inbox_messages table)
- Real-time subscription changes

## 5. Exact Files Expected to Change

- `apps/web/components/notifications/notification-bell.tsx` (or equivalent bell dropdown component)
- `apps/web/components/notifications/notifications-section.tsx` (or equivalent notification list)
- `apps/web/app/actions/notifications.ts` (new or updated server actions)
- `apps/web/lib/notifications.ts` (notification type helpers)
- Potentially: `apps/web/components/notifications/notification-item.tsx` (new component for individual items)

## 6. Implementation Requirements

### Notification Action Buttons

For each notification type, add the specified action buttons. Buttons should be small, inline, and use the existing Button component with `variant="ghost"` or `variant="outline"` and `size="sm"`.

| Notification Type | Action Buttons |
|---|---|
| Rent charge marked late | [Send Reminder] [Waive] [View Charge] |
| Lease created | [View Lease] |
| Payment received | [View Receipt] |
| Maintenance ticket submitted | [View Ticket] |
| Invite accepted | [View Members] |
| New tenant added | [View Tenant] |
| Payout completed | [View Payout] |
| Generic / unknown type | [View Details] (links to relevant section) |

Each button must:
1. Navigate to the correct page/section using `router.push()` or Next.js `Link`
2. Include the relevant entity ID in the URL (e.g., `/owner/charges?id=xxx`)
3. Auto-dismiss the notification after clicking an action (mark as read)

### Notification Type Detection

Detect notification type from the `inbox_messages` table content. Use pattern matching on the message `title` or `type` field:
- Contains "late" or "overdue" → late charge type
- Contains "lease" and "created" → lease created type
- Contains "payment" and "received" → payment received type
- Contains "maintenance" or "ticket" → maintenance type
- Fallback: generic with [View Details]

### Clear All Button

1. Add a "Clear all" button in the notification dropdown header, right-aligned
2. Clicking calls `clearAllNotifications` server action
3. Server action marks all unread notifications as read for the current user
4. UI updates optimistically (clear list immediately, rollback on error)

### Individual Dismiss

1. Add an "x" button (top-right corner) on each notification item
2. Clicking calls `dismissNotification(notificationId)` server action
3. Server action marks that single notification as read
4. UI removes the item with a fade-out animation (optional) or instantly

### Server Actions

Create or update `apps/web/app/actions/notifications.ts`:

```typescript
"use server"

export async function clearAllNotifications(accountId: string): Promise<{ success: boolean; error?: string }>
// Marks all unread inbox_messages as read for the given account

export async function dismissNotification(notificationId: string): Promise<{ success: boolean; error?: string }>
// Marks a single inbox_message as read
```

Both actions must:
- Validate the user owns the notification (auth check)
- Return explicit error states (never silent return)
- Check `.error` on every Supabase mutation

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

- [ ] Every notification type displays at least one action button
- [ ] Action buttons navigate to the correct page with the correct entity context
- [ ] "Clear all" button appears in dropdown header and marks all as read
- [ ] Individual "x" dismiss button marks single notification as read and removes from list
- [ ] Server actions validate auth and check Supabase errors
- [ ] Notifications with no recognized type show a generic [View Details] button
- [ ] `npm run gate:web` passes (lint, typecheck, build, tests)
- [ ] No unrelated file changes

## 9. Report Format

```
action_buttons_added: true/false
notification_types_covered: [list of types]
clear_all_works: true/false
dismiss_individual_works: true/false
server_actions_created: true/false
auth_validated: true/false
gate_passed: true/false
files_changed: [list]
```

## 10. Constraints

- Do NOT deploy to production
- Do NOT edit CLAUDE.md or AGENTS.md
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change database schema or run migrations
- Do NOT modify email notification templates
- Report compact status only
