# Sprint 79 — Codex Implementation Prompt

## 1. Objective

Verify and fix the mobile experience across all key pages, and add notification controls so owners can pause/configure what emails get sent (preventing the "accidental late charge email" problem).

## 2. Context

- **Branch**: `main`
- **HEAD**: (latest after Sprint 78)
- **Production URL**: `https://domusbase.com`
- **Mobile state**: Dashboard was rebuilt multiple times since last mobile verification (Sprint 51). Paginated layout, wizards, modals, financial panels — all untested on mobile.
- **Notification problem**: The cron job sends rent reminders and late charge emails automatically. During setup, this caused erroneous emails to the user's tenant. Owners need the ability to control or pause notifications.

## 3. In Scope

### Part A: Mobile Layout Fixes
Audit and fix every key page at 375px width (iPhone SE) and 390px (iPhone 14):

**Pages to verify:**
1. Marketing page — hero, problem cards, features, footer
2. Login page — split layout collapses to stacked on mobile
3. Owner dashboard Home — greeting, KPI pills, financial panel
4. Owner dashboard section pages — pagination arrows, content area
5. Property wizard — all steps fit on mobile screen, inputs reachable
6. Lease wizard — same
7. Tenant invite wizard — same
8. Charges section — charge cards, edit modal, create form
9. Reports page — report cards, data tables
10. Settings page — tabs, form inputs
11. Tenant dashboard — pay rent card (must be prominent on mobile!)
12. Sidebar — hamburger menu on mobile, closes on nav

**Common mobile issues to check/fix:**
- Text overflow / truncation
- Buttons too small (min 44x44px touch targets)
- Horizontal scrolling (should NEVER happen)
- Modals extending beyond viewport
- Inputs too narrow to type in
- Cards stacking correctly (1 column on mobile)
- Pagination arrows reachable with thumb
- Sidebar as overlay/drawer, not persistent

### Part B: Notification Control Panel
Add a notification preferences section in Settings:

**Per-notification-type toggles:**
```
Notification Preferences
─────────────────────────────
☑ Rent due reminders          (3 days before due date)
☑ Late rent alerts             (when charge becomes overdue)
☑ Payment received             (when tenant pays)
☑ Maintenance ticket updates   (new tickets, status changes)
☑ Lease expiration warnings    (30 days before expiry)
☐ Delinquency escalations     (repeated late notices)
☑ Manager payment invoices     (monthly manager payment)

──────────────────────────────
⏸ Pause all notifications
  "Stop all email notifications temporarily. In-app
   notifications will still appear."
  [ Pause for 24 hours ]
  [ Pause for 1 week ]
  [ Pause until I resume ]
```

**Behavior:**
- Toggles stored per-user in a `notification_preferences` column on `profiles` table (JSONB)
- OR a new `notification_preferences` table (simple key-value)
- The cron job checks preferences before sending each notification type
- "Pause all" sets a `notifications_paused_until` timestamp
- In-app notifications (inbox messages, dashboard badges) are NOT affected by pause — only emails

### Part C: Notification Pause Banner
When notifications are paused, show a persistent banner at the top of the dashboard:

```
⏸ Notifications paused until March 25, 2026  [Resume now]
```

Yellow/amber styling, dismissible only by clicking "Resume now."

### Part D: Cron Integration
Update the cron job notification functions to respect preferences:

```typescript
// Before sending any notification email:
// 1. Check if user has notifications_paused_until > now() → skip email
// 2. Check if specific notification type is disabled → skip email
// 3. Log skipped notifications for debugging (console.log, not DB)
// 4. In-app notification records still created (just no email)
```

## 4. Out of Scope

- Push notifications
- SMS notifications
- Per-property notification settings (global only for now)
- Notification history/log page
- Real-time notification updates (WebSocket)
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (3-4)
1. `apps/web/components/settings/notification-preferences.tsx` — notification toggle panel
2. `apps/web/app/actions/notification-preferences.ts` — save/load preference actions
3. `apps/web/components/dashboard/notification-pause-banner.tsx` — pause banner
4. `apps/web/lib/__tests__/notification-preferences.test.ts` — unit tests

### Migration (1)
1. `supabase/migrations/20260322_sprint79_notification_preferences.sql` — add JSONB column or table

### Modified Files (8-12)
1. `apps/web/app/settings/page.tsx` — add notification preferences section
2. `apps/web/components/dashboard/index.tsx` — add pause banner
3. `apps/web/lib/notifications.ts` — check preferences before sending
4. `apps/web/app/api/cron/generate-charges/route.ts` — respect pause/preferences
5. `apps/web/lib/delinquency.ts` — check preferences
6. `apps/web/components/marketing/landing-page.tsx` — mobile layout fixes
7. `apps/web/app/login/page.tsx` — mobile layout fixes
8. `apps/web/components/dashboard/owner-daily-ops-home.tsx` — mobile layout fixes
9. `apps/web/components/dashboard/pay-rent-card.tsx` — mobile sizing
10. `apps/web/components/dashboard/sidebar/sidebar-nav.tsx` — mobile drawer behavior
11. `apps/web/components/dashboard/property-wizard.tsx` — mobile viewport fit
12. `apps/web/components/dashboard/financial-overview-panel.tsx` — mobile responsive

## 6. Implementation Requirements

### Part A: Mobile Fixes

**General rules to apply everywhere:**
```css
/* No horizontal overflow — ever */
.main-content { overflow-x: hidden; max-width: 100vw; }

/* Cards: single column on mobile */
@media (max-width: 640px) {
  .grid-cols-2, .grid-cols-3, .grid-cols-4 {
    grid-template-columns: 1fr;
  }
}

/* Buttons: minimum touch target */
button, a[role="button"], [role="button"] {
  min-height: 44px;
  min-width: 44px;
}

/* Modals: full-width on mobile */
@media (max-width: 640px) {
  .modal-content {
    width: 100%;
    max-width: 100%;
    margin: 0;
    border-radius: 1rem 1rem 0 0;
    max-height: 90vh;
    overflow-y: auto;
  }
}
```

**Login page mobile:**
```tsx
// Split layout → stacked on mobile
<div className="min-h-screen flex flex-col lg:flex-row">
  {/* Branding: compact on mobile, full on desktop */}
  <div className="lg:w-1/2 p-6 lg:p-12 bg-gradient-to-br from-purple-600 to-purple-900">
    {/* Mobile: just logo + tagline, no mascot */}
    {/* Desktop: full branding panel */}
  </div>
  <div className="flex-1 flex items-center justify-center p-6 lg:p-8">
    {/* Login form — same on both */}
  </div>
</div>
```

**Pay rent card mobile:**
- Full width, no side margins
- Amount text: `text-3xl` on mobile (not text-5xl)
- Button: full width, 56px height
- Property name on its own line

**Sidebar mobile:**
- Hamburger button in top-left
- Sidebar slides in as overlay from left
- Tap outside or X button to close
- Semi-transparent backdrop behind sidebar

### Part B: Notification Preferences

**Migration:**
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notifications_paused_until TIMESTAMPTZ;
```

**Preferences JSONB shape:**
```json
{
  "rent_due_reminder": true,
  "late_rent": true,
  "payment_received": true,
  "maintenance_updates": true,
  "lease_expiration": true,
  "delinquency_escalation": false,
  "manager_invoice": true
}
```

**Settings UI component:**
```tsx
// Each row: icon + label + description + toggle switch
// Toggle switch should be the standard shadcn Switch component
// Save on each toggle change (optimistic update + server action)
// "Pause all" section at bottom with duration buttons
```

**Server action:**
```typescript
// updateNotificationPreferences(formData)
// Params: preferences (JSONB), pauseUntil (ISO timestamp or null)
// 1. Auth check
// 2. Update profiles set notification_preferences = $1, notifications_paused_until = $2
// 3. Revalidate settings path

// getNotificationPreferences(userId)
// Returns: { preferences: Record<string, boolean>, pausedUntil: string | null }
```

### Part C: Cron Notification Guard

In every notification-sending function:
```typescript
async function shouldSendNotification(
  supabase: SupabaseClient,
  userId: string,
  notificationType: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("notification_preferences, notifications_paused_until")
    .eq("id", userId)
    .single();

  if (!profile) return true; // Default: send

  // Check pause
  if (profile.notifications_paused_until) {
    const pausedUntil = new Date(profile.notifications_paused_until);
    if (pausedUntil > new Date()) return false; // Paused
  }

  // Check type preference
  const prefs = profile.notification_preferences || {};
  if (prefs[notificationType] === false) return false; // Disabled

  return true; // Default: send
}
```

Call this before every `buildNotificationEmail` / Resend send call. Still create the in-app notification record regardless.

### Part D: Unit Tests

Test:
1. `shouldSendNotification` returns false when paused
2. `shouldSendNotification` returns false when type disabled
3. `shouldSendNotification` returns true when no preferences set (default)
4. `shouldSendNotification` returns true when pause has expired
5. Notification preferences JSONB validates correctly
6. Pause duration calculation (24h, 1 week, indefinite)
7. Mobile: pay rent card renders at 375px width without overflow

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] No horizontal scrolling on any page at 375px viewport width
2. [ ] Login page stacks vertically on mobile
3. [ ] Pay rent card is prominent and usable on mobile (full-width button, readable amount)
4. [ ] Sidebar behaves as drawer overlay on mobile
5. [ ] Modals are full-width on mobile with bottom-sheet style
6. [ ] All buttons meet 44x44px minimum touch target
7. [ ] Property/lease/tenant invite wizards complete without viewport issues on mobile
8. [ ] Notification preferences panel in Settings with per-type toggles
9. [ ] "Pause all notifications" with duration options (24h, 1 week, indefinite)
10. [ ] Pause banner shows on dashboard when notifications paused
11. [ ] "Resume now" button on pause banner clears pause
12. [ ] Cron job respects notification preferences (skips disabled types)
13. [ ] Cron job respects pause (skips all emails during pause)
14. [ ] In-app notifications still created even when emails paused
15. [ ] Migration adds notification_preferences and notifications_paused_until to profiles
16. [ ] 7+ unit tests passing
17. [ ] `npm run gate:web` passes
18. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
MOBILE_MARKETING: fixed | issues
MOBILE_LOGIN: fixed | issues
MOBILE_DASHBOARD: fixed | issues
MOBILE_TENANT: fixed | issues
MOBILE_WIZARDS: fixed | issues
NOTIFICATION_PREFS: working | broken
PAUSE_FEATURE: working | broken
CRON_GUARD: working | broken
NOTES: [any issues]
```

## 10. Constraints

- Do NOT deploy to Vercel (Claude will deploy)
- Do NOT apply the migration to Supabase (Claude will apply)
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies (use existing shadcn Switch component)
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Mobile sidebar must NOT be permanently visible — drawer overlay only
- Notification pause affects ONLY emails, not in-app notifications
- Default all notification types to true (opt-out, not opt-in)
- Use optimistic UI updates for toggle switches (don't wait for server response)
