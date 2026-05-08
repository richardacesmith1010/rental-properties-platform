# Sprint 124 — Comprehensive Hydration Mismatch Audit + Fix

## Objective

Eliminate React error #425 ("text content mismatch") and #422 ("error during hydration") that fire on every dashboard page in production. Sprint 123 fixed the time-of-day greeting (the most obvious source) but the warnings persist — meaning at least one OTHER component is computing different values during SSR vs CSR. Find every remaining source, fix each one, and verify the console is clean post-deploy.

## Context

- Branch: `main`
- HEAD: post-Sprint 123 + hotfix `5c84bde`
- Current production (`https://domusbase.com`) emits React #425 + #422 on every load of `/tenant`, `/owner`, `/manager`. Captured via Chrome MCP `read_console_messages`.
- Pre-investigation already ruled out:
  - Time-of-day greeting (Sprint 123 fixed via `useTimeOfDayGreeting` hook)
  - `ThemeProvider` (correctly initial-states "atlas-light", reads localStorage in useEffect only)
  - `<html data-domus-theme>` script in `app/layout.tsx` (uses `suppressHydrationWarning`; theme defaults to atlas-light when no localStorage value)
  - `getDaysUntil` in `tenant-overview.tsx` (uses UTC explicitly)
  - `dashboard-section-loaders.ts` initial state (uses `props.initialSectionId` from server)
- Remaining likely sources (grep candidates already identified):
  - `formatRelativeTime` in `lib/format.ts` — uses `new Date()` for "now"
  - `formatRelativeNotificationTime` in `lib/notification-feed.ts`
  - `toLocaleString`/`toLocaleDateString` calls without explicit timezone
  - Any `new Date()` at render time outside useEffect/event handlers
  - `Math.random()` or `Date.now()` at render time
  - `window`/`document` access during initial render

## In Scope

1. **Systematic search** for hydration risk patterns across `apps/web/components` and `apps/web/app`:
   - `new Date()` outside `useEffect`/event handlers/server actions
   - `Date.now()` outside `useEffect`/server-only code
   - `Math.random()` at render time
   - `window.*` / `document.*` / `localStorage.*` / `sessionStorage.*` during initial render
   - `toLocaleString`/`toLocaleDateString`/`Intl.DateTimeFormat` without explicit `timeZone` option
2. **Classify each finding** as one of:
   - **SAFE**: server-only code path (e.g., `lib/` utilities called from server actions, cron handlers); no fix needed
   - **HYDRATION RISK**: client component that renders text/attributes from non-deterministic sources during initial render
3. **Fix each HYDRATION RISK**:
   - **Preferred**: defer non-deterministic computation to `useEffect` (initial render returns null/empty)
   - **Acceptable**: compute server-side and pass as a prop (so SSR and initial CSR get the same value)
   - **Last resort**: wrap with `suppressHydrationWarning` ONLY for elements where the mismatch is intentional (e.g., timestamps that should reflect user's local timezone)
4. **Verify** by deploying to a preview URL (or relying on local `next build` + manual smoke) and reading the console. Goal: zero React #425 / #422 errors on `/tenant`, `/owner`, `/manager`.
5. **Tests** — add a test that captures the audit pattern: a vitest test that imports each greeting/relative-time/locale component and asserts initial render matches a deterministic snapshot.

## Out of Scope

- Time-of-day greeting (already fixed in Sprint 123)
- Server-side timezone changes
- Theme system refactor
- Any non-hydration bug

## Suspect List (start here)

| File | Pattern | Risk |
|------|---------|------|
| `apps/web/lib/format.ts` | `formatRelativeTime` defaults `nowValue = new Date()` | If called during render without explicit `nowValue`, hydration risk |
| `apps/web/lib/notification-feed.ts` | `formatRelativeNotificationTime`, `toLocaleDateString` | Likely timezone-dependent |
| `apps/web/components/dashboard/llc-invite-form.tsx` | calls `formatRelativeTime` at render | Risk |
| `apps/web/components/dashboard/financial-overview-panel.tsx` | calls `formatRelativeTime` at render | Risk |
| `apps/web/components/dashboard/actionable-notification.tsx` | calls `formatRelativeNotificationTime` at render | Risk |
| `apps/web/components/dashboard/distribution-approval-card.tsx` | `new Date(value).toLocaleString` | If called per-row at render, timezone-dependent |
| `apps/web/components/dashboard/financial-activity-feed.tsx` | Same | Same |
| `apps/web/components/dashboard/withdrawal-request-card.tsx` | Same | Same |
| `apps/web/lib/analytics.ts` | `start.toLocaleDateString` | Server-only OK; verify |
| `apps/web/lib/notification-preferences.ts` | `toLocaleDateString` | Server-only OK; verify |
| `apps/web/lib/expenses.ts` | `toLocaleDateString` | Server-only OK; verify |

For each entry: read the file, determine if it's used in a client component during render, and if so, fix.

## Implementation Requirements

### 1. Run a comprehensive grep

```bash
grep -rEn "new Date\(\)" apps/web --include="*.tsx" | grep -v node_modules | grep -v "\.test\."
grep -rEn "Date\.now\(\)" apps/web --include="*.tsx" | grep -v node_modules | grep -v "\.test\."
grep -rEn "toLocaleString|toLocaleDateString" apps/web --include="*.tsx" | grep -v node_modules | grep -v "\.test\."
grep -rEn "window\.|document\.|localStorage|sessionStorage" apps/web --include="*.tsx" | grep -v node_modules | grep -v "\.test\."
```

Read each match. Document in the report which are safe (server-only or already in useEffect) and which need fixing.

### 2. Standard fix pattern for client components

For "I-need-to-show-a-relative-time" cases:

```typescript
"use client";
import { useEffect, useState } from "react";

interface RelativeTimeProps {
  isoTime: string;
}

export function RelativeTime({ isoTime }: RelativeTimeProps) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(formatRelativeTime(isoTime));
    const interval = setInterval(() => setText(formatRelativeTime(isoTime)), 60_000);
    return () => clearInterval(interval);
  }, [isoTime]);
  return <span suppressHydrationWarning>{text ?? formatDateAbsolute(isoTime)}</span>;
}
```

Key idea: the SSR / initial-CSR render shows an absolute date (deterministic), then useEffect updates to the relative form. `suppressHydrationWarning` on the span tolerates the eventual update.

### 3. For `formatRelativeTime` and `formatRelativeNotificationTime`

If they're called at render in client components, replace direct calls with the `<RelativeTime />` wrapper above. Keep the helpers as utility functions (server-side cron handlers etc may still want a one-shot string).

### 4. For `new Date(value).toLocaleString("en-US", { ... })`

These convert a stable timestamp to a localized string. The timezone defaults to the runtime's timezone — server (UTC) and client (user's local) differ.

Two fixes acceptable:
- Add `timeZone: "UTC"` to the options for stable output
- OR pass the stable string through to the client and format on client only via useEffect

Codex picks based on UX intent: if showing "Approved on Mar 15, 2026" → stable UTC is fine. If showing "Approved 3 hours ago" → defer to client.

### 5. Tests

Add a vitest test file `apps/web/lib/__tests__/hydration-safety.test.tsx` that:
- Renders each suspected client component using react-testing-library
- Asserts the initial render output is deterministic (no current-time-dependent text)
- Optionally simulates time passing and asserts the component updates correctly

### 6. Final verification (Codex must do this)

Run the local build:

```bash
cd apps/web
npm run build 2>&1 | grep -i "warning\|hydrat" | head -20
```

(Next.js sometimes surfaces hydration mismatches at build time when prerendering.) Document any remaining warnings.

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

After deploy, manual verification:
- Open `/tenant`, `/owner`, `/manager` in Chrome
- Read console: NO `Minified React error #425` or `#422` should appear
- Switch theme to Noctis Neon, navigate around — no new hydration warnings
- Visit a page with notifications/activity feed — verify "X minutes ago" still updates correctly

## Acceptance Criteria

1. [ ] Every `new Date()` outside server-only code is documented and either fixed or marked safe
2. [ ] Every `formatRelativeTime`/`formatRelativeNotificationTime` call from a client component is replaced with a deferred render
3. [ ] Every `toLocaleString`/`toLocaleDateString` in a client component either uses `timeZone: "UTC"` or runs in `useEffect`
4. [ ] No `window.*`/`document.*`/`localStorage`/`sessionStorage` during initial client render
5. [ ] After deploy, `/tenant` → console has zero React #425 / #422 errors
6. [ ] After deploy, `/owner` → same
7. [ ] After deploy, `/manager` → same
8. [ ] Existing functionality for relative times still works (verified by clicking around screens that show "X minutes ago")
9. [ ] Tests added: at least 3 components verified for deterministic initial render
10. [ ] `gate:web` passes
11. [ ] No new dependencies

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
hydration_audit_findings:
  total_grep_matches: N
  safe (server-only): N
  fixed (client-deferred): N
  fixed (timezone-pinned): N
  remaining_warnings: N (zero is the goal)
acceptance_criteria: [1-11] PASS | FAIL each
notes: (any deviations)
MANUAL_VERIFICATION_PATH:
1. Log in as any role
2. Navigate to /tenant, /owner, /manager
3. Open Chrome DevTools console
4. Reload each page
5. Verify NO React #425 or #422 errors appear
6. Spot-check that relative-time displays still work (notifications, activity feed)
```

## Constraints

- Do NOT change time-of-day greeting (already fixed)
- Do NOT modify the theme localStorage script in layout.tsx (it's safe via suppressHydrationWarning)
- Do NOT add `suppressHydrationWarning` indiscriminately — only on elements that intentionally render different on server vs client (like relative timestamps)
- Do NOT remove existing functionality (relative times must still update on the client)
- Do NOT change any server-only code paths (cron handlers, server actions, etc) — those are SAFE
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
