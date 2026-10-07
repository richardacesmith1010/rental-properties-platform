# Sprint 186 — Code health part 2: split 5 oversized notification/analytics/palette files (L2: pure refactor) · Category 12: Code health

## 1. Objective
20 source files in `apps/web` are over 500 lines. This batch splits these 5, with **zero behaviour change**:

| File | Lines | Non-whitespace chars | Max line length today |
|---|---|---|---|
| `apps/web/lib/notification-actions.ts` | 631 | 11,966 | 119 |
| `apps/web/lib/notifications.ts` | 622 | 13,384 | 126 |
| `apps/web/lib/notification-preferences.ts` | 568 | 12,539 | 94 |
| `apps/web/lib/analytics.ts` | 566 | 12,689 | 124 |
| `apps/web/components/dashboard/command-palette.tsx` (`"use client"`) | 547 | 12,599 | 174 |

After the sprint, every one of these files, and every new file created from them, is ≤ 500 lines.

## 2. Context
- Branch `main`, HEAD `bb3958e` or a later docs-only commit. Next 15.5.27, React 19.
- Sprint 185 split 5 files with the same rules and passed. L-015: a previous refactor crammed code onto huge lines and was rejected. The shape rules in §6 are hard gates.
- **Critical invariant:** `lib/notifications.ts` imports `notificationsEnabled` from `@/lib/notifications-switch` and checks `if (!notificationsEnabled())` (line ~179) before delivering anything.
  - The product sends **no notifications to anyone until launch**.
  - Every code path that creates or delivers a notification must still pass through this exact check, with unchanged semantics.
  - Moving the check, duplicating it with different logic, or adding any path that bypasses it is an automatic FAIL.
- `lib/notifications.ts` has an `export { ... }` block at line ~23; keep its re-exports.
- `command-palette.tsx` is a client component and exports pure helpers (`searchCommandPalette`, `groupCommandResults`) used by tests.

## 3. In scope
1. **Split each file by cohesive responsibility.** For example:
   - notification action definitions vs. presentation vs. URL helpers;
   - notification read/mark vs. create/deliver vs. member fan-out;
   - preference types/constants vs. resolution logic vs. DB read/write;
   - analytics metric builders vs. data loader;
   - palette search/grouping helpers vs. UI.

   Put new files next to the original or in a sibling folder (`lib/notifications/`, `lib/notification-preferences/`, `lib/analytics/`, `components/dashboard/command-palette/`), named for what they contain.
2. **Keep every existing import path working.** Each original path must still export every symbol it exports today (the lists are in §8), with identical names and signatures. **Do not edit importers** unless a re-export is technically impossible; if so, list each one and the reason.
3. **Boundaries:**
   - Server-only modules (DB, admin client, email) must not be importable into client bundles any more than they are today.
   - Pure constants and types that client components already import from these paths must stay importable without pulling in server code. Keep the current split of what client files import; do not make a client import transitively reach a module that uses the admin client.
   - Every new client file that needs it keeps `"use client"`.
4. **Long lines:** break existing over-long lines so every line in the touched/new files is ≤ 140 characters. Rendered strings and class lists must stay byte-identical once joined.

## 4. Out of scope
- Any logic, copy, query or behaviour change; renames; changing `notifications-switch`; enabling any notification.
- The other 15 oversized files; the money and deletion files.
- Deploy, commit, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- The 5 files above.
- New files created from them, only under `apps/web/lib/` (including the new subfolders named above) and `apps/web/components/dashboard/` (including `command-palette/`).
- Tests: only import-path fixes for moved private symbols, each one listed. No test logic changes.

## 6. Implementation requirements (hard gates, L-015)
- Every touched or new file is ≤ 500 lines, with each line ≤ 140 characters.
- **Character budget:** the total non-whitespace characters of the 5 originals plus all new files is within **56,859–69,495**: ±10% of 63,177. Re-export boilerplate counts, so keep it lean (prefer `export { a, b } from` lines over wrappers).
- No compaction: no multiple statements per line, no deleting comments to save lines, no minified code.
- No behaviour change, and the notifications switch invariant (§2) is kept exactly.
- No new dependencies, and no `eslint-disable` added.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npm run gate:web` (includes `next build`)
- `grep -rn "notificationsEnabled" apps/web/lib`: report every hit, showing that delivery still goes through the single switch check.
- Report, for each file: lines, max line length and non-whitespace characters, plus the combined total vs. 63,177.

## 8. Acceptance criteria (binary)
1. All 5 originals and all new files are ≤ 500 lines, with max line length ≤ 140.
2. The combined non-whitespace total is within 56,859–69,495.
3. Each original path still exports exactly these symbols (plus `notifications.ts`'s existing `export { ... }` block):
   - `notification-actions.ts`: NotificationActionDefinition, NotificationActionKind, NotificationActionSource, NotificationPresentation, NotificationRecipientRole, getNotificationActions, getNotificationPresentation, getPrimaryNotificationAction, toAbsoluteNotificationUrl.
   - `notifications.ts`: NotificationDTO, NotificationType, createNotificationWithDelivery, getNotificationsForUser, markAllNotificationsReadForUser, markNotificationReadForUser, notifyAccountMembers, notifyOwnerMembersForProperty, notifyOwnerMembersOfAcceptedTenantInvite, notifyOwnerOfStripeIssue.
   - `notification-preferences.ts`: DEFAULT_NOTIFICATION_EMAIL_PREFERENCES, NOTIFICATION_EMAIL_PREFERENCE_KEYS, NOTIFICATION_EMAIL_PREFERENCE_OPTIONS, NOTIFICATION_PAUSE_DURATIONS, NotificationDeliveryPreference, NotificationEmailPreferenceKey, NotificationEmailPreferences, NotificationPauseDuration, NotificationPreference, NotificationPreferenceOption, NotificationPreferenceSettings, areNotificationEmailsPaused, formatNotificationsPausedLabel, getNotificationPreference, getNotificationPreferenceKeyForType, getPropertyNotificationDeliveryPreferences, getUserNotificationPreferenceSettings, getUserNotificationPreferenceSettingsMap, normalizeNotificationEmailPreferences, resolveCombinedNotificationDeliveryPreference, resolveNotificationDeliveryPreference, resolveNotificationPauseUntil, resolveNotificationPreferenceKey, setNotificationEmailPause, updateNotificationEmailPreference, updateNotificationPreference.
   - `analytics.ts`: AnalyticsChargeRow, AnalyticsDashboardData, AnalyticsExpenseRow, AnalyticsLeaseRow, AnalyticsTicketRow, ExpenseCategoryMetric, MaintenanceMetric, MonthWindow, MonthlyRentMetric, OccupancyMetric, buildExpenseCategoryMetrics, buildMaintenanceMetrics, buildOccupancyMetrics, buildRentMetrics, calculateOccupancyRate, formatAverageDaysToPayment, getOwnerAnalyticsData, monthKey.
   - `command-palette.tsx`: CommandPalette, CommandPaletteProperty, CommandPaletteQuickAction, CommandPaletteResult, CommandPaletteSection, CommandPaletteTenant, CommandPaletteTransaction, groupCommandResults, searchCommandPalette.
4. The notifications switch check is still the single gate on every delivery path (shown by the grep and a code reference in the report). The existing notification tests pass unchanged.
5. The full test suite passes (count ≥ 1,463) with no test logic changes. Lint, typecheck and build pass. Only §5 paths changed.
6. **Claude, after deploy:**
   - a browser walk in light and dark mode: owner command palette (⌘K, search, results), Settings notifications page, owner Reports/analytics section, and the notification bell, with no console errors;
   - 27/27 browser specs, Sentry clean, CI green;
   - no notification rows created by the walk (DB count unchanged).

## 9. Report format
JSON per `docs/codex-report-schema.json`, plus the per-file metrics table, the export lists and the `notificationsEnabled` grep. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access beyond the gate's read-only checks, no deploy, commit or push. Never touch `.claude/launch.json`. Do not "fix" anything you notice; list it in the report.
