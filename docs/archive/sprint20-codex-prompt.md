# Sprint 20 — Modern Design System, Gamification Edge, Full Test Coverage & Code Hardening

## 1. Objective

Transform Domus into a visually stunning, rock-solid, fully-tested SaaS product. This is a comprehensive sprint covering: design system overhaul with proper dark mode, dashboard redesign (Stripe/Linear-quality), real-time maintenance tracker (pizza-tracker UX), gamification as the competitive differentiator, comprehensive Playwright E2E tests across all 3 roles, mock data seeder for demo/testing, security hardening, code quality audit, and accessibility. Target user: individual landlords (1-10 units). Every component must be flawless in both light and dark themes.

**Time budget: 7 hours. Priority order: A → K. Complete P0 + P1 fully. P2 is bonus.**

## 2. Context

- Branch: `main`
- HEAD: `80bb664`
- Deploy URL: `https://domusbase.com`
- Gate: 280/280 tests (13 suites), lint clean, build clean
- Supabase project: `vawqdqkaguhdgfhdebqw`

**DB migration already applied by Claude via MCP:**

1. `sprint20_maintenance_status_history` — `maintenance_status_history` (id uuid PK, ticket_id uuid FK→maintenance_tickets ON DELETE CASCADE, from_status text, to_status text NOT NULL, changed_by uuid FK→profiles, notes text, created_at timestamptz DEFAULT now()). Index: (ticket_id, created_at ASC). RLS: tenants view their tickets' history, property admins manage, service_role full access.

**Existing patterns (MUST follow):**
- `useFormState` from `react-dom` (NOT `useActionState` — React 18)
- `StatefulAction` type for dashboard action props
- `createNotificationWithDelivery()` for notifications
- `isMissingSchemaError()` for graceful schema degradation
- Server actions: auth check → validate → permission check → mutate → notify → revalidate
- Fire-and-forget for audit/notifications: `.catch(() => {})`
- Every `.update()`, `.insert()`, `.delete()` must check error (L-002)
- CSS variables defined in `globals.css` (`--domus-*`)
- Theme switching via `data-domus-theme` HTML attribute + localStorage
- 3 themes exist: default (light), `noctis-neon`, `imperium-night`
- `ThemeSettingsPanel` at `components/settings/theme-settings-panel.tsx`

**Current theme architecture (critical context):**
The existing dark mode works via CSS utility overrides in `globals.css` — when `data-domus-theme` is set to `noctis-neon` or `imperium-night`, CSS rules override Tailwind classes like `bg-white`, `text-zinc-900`, etc. with dark equivalents using `!important`. This works but is brittle and incomplete. Some classes aren't overridden, causing visual bugs in dark mode. The goal is to make this system robust while keeping the existing approach (do NOT switch to a completely different theming architecture — extend what exists).

## 3. In Scope

| Priority | Part | Description | Est. Time |
|---|---|---|---|
| P0 | A | Design System Foundation (theme context, CSS variable expansion, useTheme hook) | 30 min |
| P0 | B | Component Dark Mode Hardening (fix all 90 components for theme consistency) | 2.5 hrs |
| P0 | C | Dashboard Visual Overhaul (Stripe/Linear quality, micro-interactions, polish) | 1.5 hrs |
| P1 | D | Real-Time Maintenance Tracker (pizza-tracker timeline UI) | 40 min |
| P1 | E | Gamification Enhancement (leaderboard, Dom reactions, achievement showcase, animations) | 45 min |
| P1 | F | Mock Data Seeder Script (`npm run seed:demo`) | 25 min |
| P1 | G | Playwright E2E Tests (20+ scenarios, 3 roles) | 40 min |
| P2 | H | Security Hardening (headers, rate limiting, input sanitization) | 20 min |
| P2 | I | Code Quality Audit (dead code, god files, performance, refactoring) | 15 min |
| P2 | J | Accessibility (ARIA, keyboard nav, focus management, screen reader) | 15 min |
| P2 | K | Unit Tests for New Code | 10 min |

## 4. Out of Scope

- DB migrations (pre-applied)
- Stripe live mode switch (operational)
- Resend email integration
- Mobile app changes
- Deployment
- framer-motion or new animation libraries (use tailwindcss-animate + CSS transitions + canvas-confetti)
- Complete CSS variable migration (keep existing Tailwind class override approach, just fix gaps)

---

## 5. Implementation Requirements

---

### Part A: Design System Foundation (P0, 30 min)

**Goal:** Create the infrastructure that makes dark mode reliable across all components.

#### A1. Theme Context + Hook (`lib/theme.ts` — NEW)

Create a theme utility module:

```typescript
export type DomusTheme = "atlas-light" | "noctis-neon" | "imperium-night";

export function getStoredTheme(): DomusTheme {
  if (typeof window === "undefined") return "atlas-light";
  return (localStorage.getItem("domus-theme") as DomusTheme) || "atlas-light";
}

export function setTheme(theme: DomusTheme): void {
  if (theme === "atlas-light") {
    document.documentElement.removeAttribute("data-domus-theme");
  } else {
    document.documentElement.setAttribute("data-domus-theme", theme);
  }
  localStorage.setItem("domus-theme", theme);
}

export function isDarkTheme(theme?: DomusTheme): boolean {
  const t = theme || getStoredTheme();
  return t === "noctis-neon" || t === "imperium-night";
}
```

#### A2. Theme Provider Component (`components/theme-provider.tsx` — NEW)

Client component that initializes theme from localStorage on mount (prevents flash-of-wrong-theme):

```typescript
"use client";
import { useEffect } from "react";
import { getStoredTheme, setTheme } from "@/lib/theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);
  return <>{children}</>;
}
```

Wrap `{children}` in `app/layout.tsx` with `<ThemeProvider>`.

#### A3. Expand CSS Variable Coverage (`globals.css` — MODIFY)

Add these missing CSS variables to ALL three theme variants (root, noctis-neon, imperium-night):

```css
:root {
  /* Existing variables stay */

  /* NEW: Semantic surface tokens */
  --domus-card-bg: rgba(255, 255, 255, 0.95);
  --domus-card-border: rgba(228, 228, 231, 0.8);  /* zinc-200/80 */
  --domus-card-hover: rgba(250, 250, 250, 1);
  --domus-input-bg: #ffffff;
  --domus-input-border: #d4d4d8;  /* zinc-300 */
  --domus-muted-text: #71717a;  /* zinc-500 */
  --domus-heading-text: #18181b;  /* zinc-900 */
  --domus-divider: rgba(228, 228, 231, 0.6);
  --domus-badge-bg: rgba(245, 243, 255, 0.9);  /* violet-50 */
  --domus-badge-text: #6d28d9;  /* violet-700 */
  --domus-success-bg: rgba(236, 253, 245, 0.9);  /* emerald-50 */
  --domus-success-text: #047857;  /* emerald-700 */
  --domus-warning-bg: rgba(255, 251, 235, 0.9);  /* amber-50 */
  --domus-warning-text: #b45309;  /* amber-700 */
  --domus-danger-bg: rgba(255, 241, 242, 0.9);  /* rose-50 */
  --domus-danger-text: #be123c;  /* rose-700 */
  --domus-skeleton: #e4e4e7;  /* zinc-200 for loading states */
  --domus-table-row-hover: rgba(245, 243, 255, 0.5);
  --domus-tooltip-bg: #18181b;
  --domus-tooltip-text: #fafafa;
}

html[data-domus-theme="noctis-neon"] {
  /* Existing variables stay */

  --domus-card-bg: rgba(15, 23, 42, 0.76);
  --domus-card-border: rgba(148, 163, 184, 0.25);
  --domus-card-hover: rgba(20, 30, 55, 0.85);
  --domus-input-bg: rgba(15, 23, 42, 0.6);
  --domus-input-border: rgba(148, 163, 184, 0.35);
  --domus-muted-text: #91a0bd;
  --domus-heading-text: #e7edf8;
  --domus-divider: rgba(148, 163, 184, 0.2);
  --domus-badge-bg: rgba(124, 58, 237, 0.2);
  --domus-badge-text: #c4b5fd;
  --domus-success-bg: rgba(16, 185, 129, 0.15);
  --domus-success-text: #6ee7b7;
  --domus-warning-bg: rgba(245, 158, 11, 0.15);
  --domus-warning-text: #fcd34d;
  --domus-danger-bg: rgba(244, 63, 94, 0.15);
  --domus-danger-text: #fda4af;
  --domus-skeleton: rgba(51, 65, 85, 0.5);
  --domus-table-row-hover: rgba(124, 58, 237, 0.1);
  --domus-tooltip-bg: #1e293b;
  --domus-tooltip-text: #e2e8f0;
}

html[data-domus-theme="imperium-night"] {
  /* Existing variables stay */

  --domus-card-bg: rgba(17, 13, 31, 0.85);
  --domus-card-border: rgba(167, 139, 250, 0.2);
  --domus-card-hover: rgba(25, 19, 41, 0.9);
  --domus-input-bg: rgba(17, 13, 31, 0.6);
  --domus-input-border: rgba(167, 139, 250, 0.25);
  --domus-muted-text: #a8a0c0;
  --domus-heading-text: #f2ecff;
  --domus-divider: rgba(167, 139, 250, 0.15);
  --domus-badge-bg: rgba(124, 58, 237, 0.25);
  --domus-badge-text: #ddd6fe;
  --domus-success-bg: rgba(16, 185, 129, 0.15);
  --domus-success-text: #6ee7b7;
  --domus-warning-bg: rgba(245, 158, 11, 0.15);
  --domus-warning-text: #fcd34d;
  --domus-danger-bg: rgba(244, 63, 94, 0.15);
  --domus-danger-text: #fda4af;
  --domus-skeleton: rgba(37, 22, 65, 0.6);
  --domus-table-row-hover: rgba(167, 139, 250, 0.1);
  --domus-tooltip-bg: #1b1331;
  --domus-tooltip-text: #e8e0ff;
}
```

#### A4. Add CSS Component Classes (`globals.css` — MODIFY)

Add to the `@layer components` section — reusable semantic classes that auto-adapt to theme:

```css
.domus-card {
  background: var(--domus-card-bg);
  border: 1px solid var(--domus-card-border);
  @apply rounded-2xl backdrop-blur-sm;
}

.domus-card:hover {
  background: var(--domus-card-hover);
}

.domus-input {
  background: var(--domus-input-bg);
  border: 1px solid var(--domus-input-border);
  color: var(--domus-heading-text);
  @apply rounded-xl px-3 py-2 text-sm transition-colors;
}

.domus-input:focus {
  border-color: var(--domus-primary);
  @apply outline-none ring-2 ring-violet-500/20;
}

.domus-badge {
  background: var(--domus-badge-bg);
  color: var(--domus-badge-text);
  @apply rounded-full px-2.5 py-0.5 text-xs font-medium;
}

.domus-badge-success {
  background: var(--domus-success-bg);
  color: var(--domus-success-text);
}

.domus-badge-warning {
  background: var(--domus-warning-bg);
  color: var(--domus-warning-text);
}

.domus-badge-danger {
  background: var(--domus-danger-bg);
  color: var(--domus-danger-text);
}

.domus-heading {
  color: var(--domus-heading-text);
}

.domus-muted {
  color: var(--domus-muted-text);
}

.domus-divider {
  border-color: var(--domus-divider);
}

.domus-table-row:hover {
  background: var(--domus-table-row-hover);
}

.domus-skeleton {
  background: var(--domus-skeleton);
  @apply animate-pulse rounded;
}
```

#### A5. Fix Flash-of-Unstyled-Content (`app/layout.tsx` — MODIFY)

Add an inline script in `<head>` to apply theme before React hydrates (prevents white flash on dark mode):

```tsx
<head>
  <script dangerouslySetInnerHTML={{ __html: `
    try {
      const t = localStorage.getItem('domus-theme');
      if (t && t !== 'atlas-light') {
        document.documentElement.setAttribute('data-domus-theme', t);
      }
    } catch(e) {}
  `}} />
</head>
```

---

### Part B: Component Dark Mode Hardening (P0, 2.5 hrs)

**Goal:** Ensure every component looks correct in all 3 themes. The CSS override system in `globals.css` handles the majority of cases, but there are gaps. Fix ALL gaps.

**Approach:** For each component, check for Tailwind classes that aren't overridden by the existing `globals.css` rules. Where possible, use the new `domus-*` CSS component classes from Part A. Where that doesn't fit, add the missing CSS overrides to `globals.css`.

#### B1. Audit and Fix All Dashboard Section Components (28 files)

For each file in `components/dashboard/`, check for and fix:

1. **Background colors not covered:**
   - `bg-gray-*` (any gray variant — globals.css only overrides `bg-zinc-*`, `bg-white`)
   - `bg-slate-*`, `bg-stone-*` (not covered at all)
   - `bg-violet-200`, `bg-violet-300` and higher (only 50/100 are overridden)
   - `bg-emerald-100`, `bg-emerald-200` (only 50 is overridden)
   - `bg-amber-100`, `bg-amber-200` (only 50 is overridden)
   - `bg-red-100`, `bg-red-200` (only 50 is overridden)

2. **Text colors not covered:**
   - `text-gray-*` (globals.css only overrides `text-zinc-*`)
   - `text-slate-*`, `text-stone-*`
   - `text-black` (not overridden)

3. **Border colors not covered:**
   - `border-zinc-100`, `border-zinc-300` (only 200 and 200/80 are overridden)
   - `border-gray-*` (not covered)
   - `border-emerald-*`, `border-red-*`, `border-amber-*`
   - `divide-zinc-*`, `divide-gray-*`

4. **Shadows:**
   - `shadow-lg`, `shadow-xl` (only sm/md are overridden)

5. **Ring colors:**
   - `ring-*` (not overridden for dark mode)

**Fix strategy:** Add missing overrides to the `@layer utilities` section of `globals.css`. Group them logically. Example:

```css
/* Add to globals.css utilities layer */
html[data-domus-theme="noctis-neon"] .bg-gray-50,
html[data-domus-theme="imperium-night"] .bg-gray-50,
html[data-domus-theme="noctis-neon"] .bg-gray-100,
html[data-domus-theme="imperium-night"] .bg-gray-100 {
  background-color: rgba(15, 23, 42, 0.55) !important;
}

/* ... add ALL missing overrides */
```

**IMPORTANT:** Scan EVERY component file. If a Tailwind class is used in ANY component and isn't already overridden in `globals.css`, add the override. Be thorough — this is the most time-consuming part but the most impactful.

#### B2. Fix Specific Component Issues

Go through each of these component files and apply fixes:

1. **`operations-section.tsx` (1,342 lines)** — Largest component. Check every form, modal, table for theme gaps. Forms likely use `bg-white` inputs that need dark treatment. Replace inline input styling with `domus-input` class where possible.

2. **`documents-section.tsx` (975 lines)** — Document cards, upload areas, status badges. Check file type indicators.

3. **`expenses-section.tsx` (821 lines)** — Charts, category badges, date pickers. Check category color coding.

4. **`invitations-section.tsx` (795 lines)** — Invite forms, status pills, email input areas.

5. **`sidebar-nav.tsx` (521 lines)** — Already uses gradient-sidebar. Check mobile top bar, nav item hover states, active indicators.

6. **`section-renderer.tsx` (584 lines)** — The rendering wrapper. Check section headers, tab switchers.

7. **`dashboard/index.tsx` (817 lines)** — Main orchestrator. Check KPI grid backgrounds, header area, role switcher.

8. **`vendors-section.tsx` (483 lines)** — Vendor cards, rating stars, contact info. Check icon backgrounds.

9. **`applications-section.tsx` (472 lines)** — Application cards, status badges, screening results.

10. **`ownership-section.tsx` (449 lines)** — Account cards, member lists, join code display.

11. **`leases-section.tsx` (438 lines)** — Lease cards, date highlights, status indicators.

12. **`inbox-section.tsx` (415 lines)** — Message bubbles, thread list, compose area. Critical for readability.

13. **`charges-section.tsx` (402 lines)** — Payment status badges, amount displays, date cells.

14. **`ticket-form.tsx` (289 lines)** — Form inputs, photo upload area, priority selector.

15. **`leasing-hub-section.tsx` (334 lines)** — Listing cards, showing calendar, applicant list.

16. **`manager-dashboard.tsx` (234 lines)** — Manager-specific layout, stat cards.

17. **`automation-templates-section.tsx` (225 lines)** — Rule cards, trigger/action badges.

18. **`maintenance-section.tsx` (236 lines)** — Ticket list, priority badges, status flow.

19. **`units-section.tsx` (207 lines)** — Unit cards, occupancy indicators.

20. **`portfolio-section.tsx` (218 lines)** — Asset summary cards, value displays.

21. **`user-menu-popover.tsx` (204 lines)** — Dropdown menu, user info, settings links.

22. **`tenant-documents-section.tsx` (180 lines)** — Document viewer, download buttons.

23. **`notifications-section.tsx` (121 lines)** — Notification list, read/unread states.

24. **`autopay-card.tsx` (133 lines)** — Enrollment status, card last4 display.

25. **`maintenance-comment-thread.tsx` (128 lines)** — Comment bubbles, timestamps.

26. **`tenant-lease-details.tsx` (108 lines)** — Lease info card, terms display.

27. **`activity-feed.tsx` (77 lines)** — Timeline entries, action icons.

28. **`global-search.tsx` (119 lines)** — Search input, results dropdown, highlight.

#### B3. Fix Non-Dashboard Components

Also fix:

1. **Auth components** (`login-form.tsx`, `complete-profile-form.tsx`, `role-selector.tsx`) — Login page MUST look stunning in both themes. This is the first impression.

2. **Settings components** (`profile-settings.tsx`, `password-settings.tsx`, `notification-preferences.tsx`, `bank-settings.tsx`) — Forms and toggles.

3. **Onboarding components** (`owner-setup-wizard.tsx`, `onboarding-wizard.tsx`, all steps) — Multi-step wizard forms.

4. **UI base components** (`card.tsx`, `button.tsx`, `badge.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `modal-overlay.tsx`) — These are the foundation. Fix here and all consumers benefit.

5. **Marketing** (`landing-page.tsx`) — Public page must work in both modes.

6. **Report components** (all 7 files in `components/reports/`) — Tables, headers, export buttons.

7. **Shared components** (`confirm-dialog.tsx`, `submit-button.tsx`, `kpi-card.tsx`, etc.)

8. **Gamification components** (all 8 files) — Achievement cards, XP bar, level badge.

#### B4. Fix Page-Level Styles

Check and fix all pages in `app/`:
- `page.tsx` (root)
- `login/page.tsx`
- `onboarding/page.tsx`
- `owner/page.tsx`
- `manager/page.tsx`
- `tenant/page.tsx`
- `settings/page.tsx`
- `privacy/page.tsx`, `terms/page.tsx`
- `payments/receipt/[chargeId]/page.tsx`

#### B5. Chart Dark Mode (`components/dashboard/charts/`)

All 4 chart components use recharts. Ensure:
- Chart background is transparent (uses parent container)
- Axis labels use `var(--domus-muted-text)` or equivalent
- Grid lines use `var(--domus-divider)` or equivalent
- Tooltip has dark-mode-aware background
- Legend text is readable

For recharts, pass theme-aware colors via props or CSS. Example:
```tsx
<XAxis tick={{ fill: 'var(--domus-muted-text)' }} />
<CartesianGrid stroke="var(--domus-divider)" />
<Tooltip contentStyle={{ background: 'var(--domus-card-bg)', border: '1px solid var(--domus-card-border)' }} />
```

---

### Part C: Dashboard Visual Overhaul (P0, 1.5 hrs)

**Goal:** Make the dashboard feel like Stripe or Linear — clean, spacious, with subtle micro-interactions and premium polish. Target: landlords who manage 1-10 units should feel like they're using a $200/mo enterprise tool.

#### C1. Dashboard Header Redesign (`components/dashboard/index.tsx` — MODIFY)

Current: Basic header with gamification summary.

New design:
- **Greeting:** "Good morning, {nickname}" with dynamic time-of-day greeting (morning/afternoon/evening)
- **Date:** Today's date formatted as "Wednesday, March 13, 2026"
- **Quick stats row:** 3-4 KPI pills in a horizontal flex row:
  - For owners: Total revenue this month, Occupancy rate, Open tickets, Overdue charges
  - For managers: Properties managed, Open tickets, Pending tasks, Revenue collected
  - For tenants: Next payment due, Lease expires, Open tickets, XP level
- **KPI pill design:** Glass-morphism card (backdrop-blur, semi-transparent background), icon + value + label, subtle hover lift with `transition-transform`
- **Gamification summary** stays in header but gets a more compact, badge-style treatment

#### C2. Card Component Upgrade (`components/ui/card.tsx` — MODIFY)

Upgrade the Card component to be the visual foundation:

```tsx
// Add variants:
const cardVariants = cva(
  "rounded-2xl backdrop-blur-sm transition-all duration-200",
  {
    variants: {
      variant: {
        default: "domus-card",
        elevated: "domus-card shadow-lg hover:shadow-xl hover:-translate-y-0.5",
        flat: "bg-transparent border-0",
        glass: "domus-card bg-opacity-60 backdrop-blur-md",
      },
      padding: {
        none: "",
        sm: "p-4",
        md: "p-6",
        lg: "p-8",
      }
    },
    defaultVariants: {
      variant: "default",
      padding: "md"
    }
  }
);
```

Add `variant` and `padding` props to Card. Ensure all existing usages still work (default variant = backward compatible).

#### C3. Button Component Upgrade (`components/ui/button.tsx` — MODIFY)

Add subtle animations and new variants:

- `gradient` variant (primary action): Violet-to-purple gradient with glow shadow, scale on hover
- `ghost` variant: Transparent bg, text only, hover shows subtle bg
- `outline` variant: Border only, hover fills
- All variants: `transition-all duration-150`, `active:scale-[0.98]` for tactile click feedback
- Loading state: `disabled:opacity-50` + optional spinner slot

#### C4. Table/List Visual Upgrade

For sections that show lists (charges, leases, tenants, payments):

- Add `domus-table-row` class for hover highlighting
- Zebra striping: alternate row backgrounds (very subtle)
- Status badges should use `domus-badge-*` classes (success, warning, danger)
- Amount displays should use tabular-nums font feature (`font-variant-numeric: tabular-nums`)
- Add smooth hover transition: `transition-colors duration-100`

#### C5. Empty States Upgrade (`components/shared/empty-state.tsx` + `components/dashboard/empty-state.tsx` — MODIFY)

Current: Basic text + icon.

New:
- Larger icon with subtle background circle
- Headline + description text
- Optional CTA button
- Dom mascot variant (show Dom with a helpful message for first-time users)

#### C6. Form Visual Upgrade

For ALL form inputs across the app:
- Replace bare `<input>` styling with `domus-input` class
- Add focus ring: `ring-2 ring-violet-500/20` on focus
- Add label styling: Consistent `text-sm font-medium domus-heading mb-1.5` pattern
- Add error state: Red border + red text below input
- Ensure select dropdowns, textareas, date inputs all match

#### C7. Sidebar Polish (`components/dashboard/sidebar-nav.tsx` — MODIFY)

- Active nav item: Left accent bar (3px violet) + slightly brighter background
- Hover: Smooth background transition (100ms)
- Section dividers between nav groups
- Collapse animation for mobile: Slide from left with backdrop
- User avatar + level badge at bottom of sidebar
- Workspace switcher button: Subtle border, icon + text

#### C8. Loading States

Add skeleton loading states to key sections. Create a generic `SkeletonCard` pattern:

```tsx
function SkeletonCard() {
  return (
    <div className="domus-card p-6 space-y-3">
      <div className="domus-skeleton h-4 w-1/3" />
      <div className="domus-skeleton h-3 w-2/3" />
      <div className="domus-skeleton h-3 w-1/2" />
    </div>
  );
}
```

Use `Suspense` with skeleton fallbacks where possible in dashboard sections.

#### C9. Micro-Interactions (CSS-only, no new libs)

Add these subtle animations using `tailwindcss-animate` + CSS transitions:

1. **Card entrance:** `animate-in fade-in slide-in-from-bottom-2 duration-300` on dashboard section mount
2. **Badge pulse:** New status badges get a 1-time gentle pulse on change
3. **Button press:** `active:scale-[0.98]` on all interactive buttons
4. **Number count-up:** For KPI values, use CSS `@property` for animated number transitions (or just transition opacity)
5. **Toast slide-in:** Achievement toasts slide in from right with fade

#### C10. Receipt Page Polish (`app/payments/receipt/[chargeId]/page.tsx` — MODIFY)

- Professional receipt layout: Company logo, property address, line items
- Print-friendly styles (`@media print`)
- Theme-aware (works in dark mode too)
- QR code placeholder area (for future: link back to payment record)

---

### Part D: Real-Time Maintenance Tracker (P1, 40 min)

**Goal:** Pizza-tracker style timeline for maintenance tickets — tenants can see exactly where their ticket is, like tracking a Domino's delivery.

#### D1. Maintenance Status History Logger (`lib/maintenance.ts` — MODIFY)

Add function to log status transitions:

```typescript
export async function logMaintenanceStatusChange(
  supabase: SupabaseClient,
  ticketId: string,
  fromStatus: string | null,
  toStatus: string,
  changedBy: string,
  notes?: string
): Promise<void> {
  const { error } = await supabase.from("maintenance_status_history").insert({
    ticket_id: ticketId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: changedBy,
    notes: notes || null,
  });
  if (error) console.error("Failed to log status change:", error);
}

export async function getMaintenanceTimeline(
  supabase: SupabaseClient,
  ticketId: string
): Promise<StatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from("maintenance_status_history")
    .select("*, profiles:changed_by(nickname, full_name)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error && !isMissingSchemaError(error)) throw error;
  return data || [];
}
```

#### D2. Wire Status Logging into Actions (`app/actions/maintenance.ts` — MODIFY)

In `updateTicketStatus()`, after the status update succeeds, call `logMaintenanceStatusChange()` fire-and-forget:

```typescript
logMaintenanceStatusChange(supabase, ticketId, oldStatus, newStatus, user.id, notes).catch(() => {});
```

Also call it in `createMaintenanceTicket()` for the initial "submitted" status.

#### D3. Pizza Tracker Component (`components/dashboard/maintenance-tracker.tsx` — NEW)

Visual timeline component:

```
  ●───────●───────●───────○───────○
  Submitted  Reviewed  In Progress  Resolved  Closed
  Mar 10     Mar 10    Mar 11       Pending    Pending
  9:42 AM    2:15 PM   10:00 AM
```

Design specs:
- **Horizontal stepper** on desktop, **vertical** on mobile
- Each step: Circle node + label + timestamp
- Completed steps: Filled violet circle + solid connecting line
- Current step: Pulsing violet circle with glow ring (`animate-pulse`)
- Future steps: Gray outline circle + dashed connecting line
- Below each step: Who made the change (avatar or initials) + time
- Optional notes shown as speech bubbles below the node

**Status flow:** `submitted` → `reviewed` → `in_progress` → `resolved` → `closed`

If a ticket goes backwards (e.g., `in_progress` → `submitted`), show it correctly — only highlight up to current status.

Props:
```typescript
interface MaintenanceTrackerProps {
  currentStatus: string;
  timeline: StatusHistoryEntry[];
  ticketCreatedAt: string;
}
```

#### D4. Integrate into Maintenance Section (`components/dashboard/maintenance-section.tsx` — MODIFY)

When a ticket is expanded/selected, show the `MaintenanceTracker` component above the comment thread. Fetch timeline data from the maintenance lib.

#### D5. Integrate into Tenant View

Also show the tracker in the tenant's maintenance view (wherever they see their tickets). This gives tenants real-time visibility.

#### D6. Fetch Timeline Data

In the tenant page (`app/tenant/page.tsx`) and owner/manager pages where maintenance tickets are loaded, fetch the timeline data for each ticket (or at least for the expanded/selected ticket to avoid N+1).

---

### Part E: Gamification Enhancement (P1, 45 min)

**Goal:** Make gamification the competitive edge. Tenants should WANT to use Domus because the achievement/XP system feels rewarding. Owners should see engaged tenants.

#### E1. Achievements Showcase Page (`app/achievements/page.tsx` — NEW)

Full-page achievements gallery:
- Grid of all 12 achievement cards (earned = full color, locked = grayed out with lock icon)
- Progress tracker: "7/12 achievements unlocked"
- Category tabs: Payment Streaks, Property, Maintenance, Documents
- XP bar prominent at top
- Dom mascot in corner with contextual message:
  - < 3 achievements: "You're just getting started! Keep going!"
  - 3-7 achievements: "Nice progress! You're on a roll!"
  - 8-11: "Almost there! Can you get them all?"
  - 12: "You're a Domus legend! 🏆"
- Link from gamification summary widget in dashboard header
- Works for all roles (owner, manager, tenant)

#### E2. Dom Mascot Reactions (`components/gamification/dom-mascot.tsx` — MODIFY)

Add a `mood` prop to DomMascot:

```typescript
interface DomMascotProps {
  size?: "sm" | "md" | "lg" | "xl";
  mood?: "happy" | "excited" | "encouraging" | "celebrating" | "thinking";
  label?: string;
  animate?: boolean;
}
```

When `animate` is true:
- `happy`: Gentle bob animation (CSS keyframe, up/down 4px, 2s ease-in-out infinite)
- `excited`: Quick bounce (3 bounces, 0.6s total, then rest)
- `encouraging`: Slow gentle tilt left/right (2s)
- `celebrating`: Bounce + rotate 360° once (1s)
- `thinking`: Slow pulse opacity (2s)

Use CSS `@keyframes` in globals.css for these:
```css
@keyframes domus-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes domus-bounce { 0%, 100% { transform: translateY(0); } 25% { transform: translateY(-8px); } 50% { transform: translateY(0); } 75% { transform: translateY(-4px); } }
@keyframes domus-wiggle { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(-3deg); } 75% { transform: rotate(3deg); } }
@keyframes domus-celebrate { 0% { transform: translateY(0) rotate(0deg); } 30% { transform: translateY(-12px) rotate(180deg); } 60% { transform: translateY(-4px) rotate(360deg); } 100% { transform: translateY(0) rotate(360deg); } }
```

#### E3. Enhanced Celebration (`components/gamification/celebration.tsx` — MODIFY)

Upgrade the achievement toast:
- Bigger, more dramatic confetti (200 particles instead of 110)
- Multiple bursts: 3 rapid-fire confetti blasts at 0ms, 200ms, 400ms
- Toast card: Larger, with achievement icon + title + XP reward prominently shown
- Dom mascot in `celebrating` mood
- Sound effect placeholder (add a comment: `// TODO: optional sound effect`)
- Level-up gets EXTRA confetti (300 particles, gold/violet/white colors)

#### E4. Streak Heatmap (`components/gamification/streak-heatmap.tsx` — NEW)

GitHub-style contribution/payment heatmap:
- 12 months × 4-5 weeks grid of small squares
- Colors: Light green (on-time payment), Amber (late payment), Gray (no payment due), Violet (achievement earned)
- Tooltip on hover: Date + what happened
- Shows on the achievements page
- Data source: `xp_events` table (query last 12 months)

Keep it simple — static rendering of historical data, no interactivity beyond tooltips.

#### E5. Level Progress Enhancement (`components/gamification/xp-bar.tsx` — MODIFY)

- Add milestone markers on the XP bar (small tick marks at 25%, 50%, 75%)
- Animate the bar fill on initial render (CSS transition from 0 to actual %)
- Show "X XP to next level" below the bar
- When near level-up (>90%), bar glows with subtle pulse

#### E6. Gamification in Dashboard Config

Add `"achievements"` as a section in the dashboard config for all 3 roles. It should appear as a nav item with a trophy icon that links to `/achievements`.

Actually — since the achievements page is a standalone route (not a dashboard section), instead add a prominent link in the gamification summary widget that navigates to `/achievements`. Add a small badge showing "X new" if there are unviewed achievements.

---

### Part F: Mock Data Seeder Script (P1, 25 min)

**Goal:** `npm run seed:demo` creates a complete demo environment for testing and demos.

#### F1. Seeder Script (`scripts/seed-demo.ts` — NEW)

Node script that uses `@supabase/supabase-js` with service_role key:

```typescript
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-demo.ts
```

Creates this demo dataset:

**Users (5):**
1. `owner@demo.domus.com` — "Alex Rivera" (owner, Level 3, 2500 XP)
2. `manager@demo.domus.com` — "Jordan Kim" (manager, Level 2, 800 XP)
3. `tenant1@demo.domus.com` — "Sam Johnson" (tenant, Level 2, 1200 XP, 6-month streak)
4. `tenant2@demo.domus.com` — "Pat Williams" (tenant, Level 1, 300 XP, no streak)
5. `tenant3@demo.domus.com` — "Casey Brown" (tenant, Level 1, 50 XP, new user)

**Properties (2):**
1. "Riverside Apartments" — 4 units (101-104), address: 123 River St
2. "Oak Park Duplex" — 2 units (A, B), address: 456 Oak Ave

**Ownership Account (1):**
- "Rivera Properties LLC" — owner is Alex, manager is Jordan

**Leases (3 active, 1 expired):**
1. Unit 101 → Sam Johnson, $1,500/mo, started 6 months ago, active
2. Unit 102 → Pat Williams, $1,350/mo, started 2 months ago, active
3. Unit A → Casey Brown, $1,800/mo, started 1 month ago, active
4. Unit 103 → (expired lease, previous tenant, ended 1 month ago)

**Rent Charges (18):**
- 6 months of charges for Sam (all paid on time)
- 2 months for Pat (1 paid, 1 pending + overdue by 5 days)
- 1 month for Casey (pending, due in 3 days)
- Amounts match lease rent_amount_cents

**Payments (7):**
- 6 payments from Sam (on-time, method: "card")
- 1 payment from Pat (on-time, method: "card")

**Maintenance Tickets (4):**
1. "Leaky faucet in kitchen" — Sam, Unit 101, resolved, 3 status changes
2. "AC not cooling" — Pat, Unit 102, in_progress, assigned to vendor, 2 status changes
3. "Front door lock sticking" — Casey, Unit A, submitted, new
4. "Hallway light out" — Sam, Unit 101, closed, resolved last month

**Maintenance Status History:**
- Ticket 1: submitted → reviewed → in_progress → resolved (with timestamps spread over 5 days)
- Ticket 2: submitted → in_progress (2 days)
- Ticket 3: submitted (today)
- Ticket 4: submitted → resolved → closed (10 days ago)

**Expenses (6):**
1. Plumbing repair — $350, maintenance category
2. Lawn service — $150, grounds category
3. Property insurance — $2,400, insurance category
4. New dishwasher Unit 103 — $650, appliance category
5. Pest control — $200, maintenance category
6. Property tax Q1 — $3,500, taxes category

**Notifications (10):** Mix of types for each user.

**XP Events (15):** Historical XP awards matching the payments and actions above.

**Achievements Earned:**
- Sam: first_payment, streak_3, streak_6, first_ticket (4 achievements)
- Pat: first_payment (1 achievement)
- Alex: first_property, portfolio_5 (if 5+ properties — otherwise just first_property)

**Important seeder rules:**
- Use `supabase.auth.admin.createUser()` for users (set `email_confirm: true`)
- Set all passwords to `Demo123!` for easy testing
- Use proper UUIDs via `crypto.randomUUID()`
- Insert data in dependency order: profiles → ownership_accounts → properties → units → leases → charges → payments
- Handle "already exists" errors gracefully (upsert where possible, skip otherwise)
- Print colored summary at end showing what was created
- Check for existing demo data first (look for `@demo.domus.com` emails) and skip if found

#### F2. Package Script (`package.json` in apps/web — MODIFY)

Add script:
```json
"seed:demo": "npx tsx ../../scripts/seed-demo.ts"
```

Or if the script is in the repo root:
```json
"seed:demo": "tsx scripts/seed-demo.ts"
```

Put the script wherever makes sense (root `scripts/` or `apps/web/scripts/`). The key is it's accessible via `npm run seed:demo` from `apps/web/`.

---

### Part G: Playwright E2E Tests (P1, 40 min)

**Goal:** Comprehensive E2E test coverage for all 3 roles. Tests should work against the dev server or production URL.

#### G1. Test Utilities (`tests/e2e/helpers.ts` — NEW)

```typescript
// Shared test helpers
export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for redirect away from login
  await page.waitForURL(/\/(owner|manager|tenant|onboarding)/);
}

export const DEMO_USERS = {
  owner: { email: "owner@demo.domus.com", password: "Demo123!" },
  manager: { email: "manager@demo.domus.com", password: "Demo123!" },
  tenant1: { email: "tenant1@demo.domus.com", password: "Demo123!" },
  tenant2: { email: "tenant2@demo.domus.com", password: "Demo123!" },
  tenant3: { email: "tenant3@demo.domus.com", password: "Demo123!" },
};

export async function expectNoConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", msg => {
    if (msg.type() === "error" && !msg.text().includes("favicon")) {
      errors.push(msg.text());
    }
  });
  return errors;
}
```

**Note:** These tests depend on the seeded demo data from Part F. If demo data doesn't exist, tests should skip gracefully (check for login success).

#### G2. Owner Flow Tests (`tests/e2e/owner-flows.spec.ts` — NEW)

10+ test cases:

```typescript
test.describe("Owner Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  });

  test("loads dashboard with KPIs", async ({ page }) => {
    await expect(page.locator("text=Good")).toBeVisible(); // greeting
    // Check KPI pills are present
  });

  test("can view properties list", async ({ page }) => {
    // Navigate to properties section
    await page.click("text=Properties");
    await expect(page.locator("text=Riverside Apartments")).toBeVisible();
    await expect(page.locator("text=Oak Park Duplex")).toBeVisible();
  });

  test("can view charges and payment status", async ({ page }) => {
    await page.click("text=Charges");
    // Should see charges with paid/pending statuses
  });

  test("can view expenses", async ({ page }) => {
    await page.click("text=Expenses");
    // Should see expense entries
  });

  test("can view analytics", async ({ page }) => {
    await page.click("text=Analytics");
    // Charts should render
  });

  test("can view reports", async ({ page }) => {
    await page.goto("/owner/reports");
    // Report tabs should be visible
  });

  test("can view maintenance tickets", async ({ page }) => {
    await page.click("text=Maintenance");
    await expect(page.locator("text=Leaky faucet")).toBeVisible();
  });

  test("can navigate to settings", async ({ page }) => {
    // Open user menu, click Settings
    await page.goto("/settings");
    await expect(page.locator("text=Profile")).toBeVisible();
  });

  test("can navigate to achievements", async ({ page }) => {
    await page.goto("/achievements");
    await expect(page.locator("text=Achievements")).toBeVisible();
  });

  test("dark mode toggle works", async ({ page }) => {
    await page.goto("/settings");
    // Find theme settings
    // Click a dark theme
    // Verify body background changed
  });
});
```

#### G3. Manager Flow Tests (`tests/e2e/manager-flows.spec.ts` — NEW)

```typescript
test.describe("Manager Dashboard", () => {
  test("loads manager dashboard", async ({ page }) => { /* ... */ });
  test("can view assigned properties", async ({ page }) => { /* ... */ });
  test("can view expenses for managed properties", async ({ page }) => { /* ... */ });
  test("can view analytics for managed properties", async ({ page }) => { /* ... */ });
  test("can manage maintenance tickets", async ({ page }) => { /* ... */ });
});
```

#### G4. Tenant Flow Tests (`tests/e2e/tenant-flows.spec.ts` — NEW)

```typescript
test.describe("Tenant Dashboard", () => {
  test("loads tenant dashboard with welcome", async ({ page }) => { /* ... */ });
  test("can view rent charges", async ({ page }) => { /* ... */ });
  test("can view lease details", async ({ page }) => { /* ... */ });
  test("can view maintenance tickets", async ({ page }) => { /* ... */ });
  test("can submit new maintenance ticket", async ({ page }) => { /* ... */ });
  test("can view maintenance tracker timeline", async ({ page }) => { /* ... */ });
  test("can view documents", async ({ page }) => { /* ... */ });
  test("can view achievements", async ({ page }) => { /* ... */ });
  test("can navigate to settings", async ({ page }) => { /* ... */ });
  test("can view payment history", async ({ page }) => { /* ... */ });
});
```

#### G5. Theme Tests (`tests/e2e/theme.spec.ts` — NEW)

```typescript
test.describe("Theme Switching", () => {
  test("default theme is light (atlas-light)", async ({ page }) => {
    await page.goto("/login");
    const theme = await page.getAttribute("html", "data-domus-theme");
    expect(theme).toBeNull(); // Light has no attribute
  });

  test("noctis-neon theme applies correctly", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-domus-theme", "noctis-neon");
      localStorage.setItem("domus-theme", "noctis-neon");
    });
    // Verify dark background is applied
    const bgColor = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );
    // Should be dark
  });

  test("theme persists across navigation", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("domus-theme", "imperium-night");
    });
    await page.goto("/login");
    const theme = await page.getAttribute("html", "data-domus-theme");
    expect(theme).toBe("imperium-night");
  });
});
```

#### G6. Accessibility Tests (`tests/e2e/accessibility.spec.ts` — NEW)

```typescript
test.describe("Accessibility", () => {
  test("login page has proper form labels", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toHaveAttribute("type", "email");
    // Check label association
  });

  test("dashboard navigation is keyboard accessible", async ({ page }) => {
    await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
    // Tab through nav items
    await page.keyboard.press("Tab");
    // Verify focus is visible
  });

  test("modals trap focus", async ({ page }) => {
    // Open a modal, verify Tab stays within modal
  });

  test("images have alt text", async ({ page }) => {
    await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
    const images = await page.locator("img").all();
    for (const img of images) {
      const alt = await img.getAttribute("alt");
      expect(alt).toBeTruthy();
    }
  });
});
```

---

### Part H: Security Hardening (P2, 20 min)

#### H1. Security Headers (`next.config.mjs` — MODIFY)

Add security headers:

```javascript
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// In next.config:
async headers() {
  return [
    {
      source: "/:path*",
      headers: securityHeaders,
    },
  ];
},
```

Do NOT add CSP yet (would need careful tuning for Stripe, Supabase, etc.). Just the safe headers above.

#### H2. Rate Limiting Utility (`lib/rate-limit.ts` — NEW)

Simple in-memory rate limiter (no external deps):

```typescript
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number = 100,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: maxRequests - entry.count };
}

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap) {
      if (now > entry.resetAt) rateLimitMap.delete(key);
    }
  }, 300_000);
}
```

#### H3. Apply Rate Limiting to Key Actions

Add rate limit checks to:
- `inviteUserByEmail` — 10 invites per hour per user
- `setupAutopay` — 5 per hour per user
- `recordManualPayment` — 20 per hour per user
- All create/update actions — 100 per minute per user

Pattern:
```typescript
const { allowed } = checkRateLimit(`${action}:${user.id}`, limit, window);
if (!allowed) return { error: "Too many requests. Please try again later." };
```

#### H4. Fix L-002 Pattern in inbox.ts

Fix the silent error swallowing at `inbox.ts:121-128`. The thread `updated_at` update error should at minimum be returned as a warning, or the function should retry once.

---

### Part I: Code Quality Audit (P2, 15 min)

#### I1. Split God Files

**`dashboard/index.tsx` (817 lines)** — Too large. Extract:
- Header/greeting into `components/dashboard/dashboard-header.tsx`
- KPI grid into existing `kpi-grid.tsx` (if not already used)
- Role/mode switching logic into a custom hook `hooks/use-dashboard-mode.ts`

**`operations-section.tsx` (1,342 lines)** — Largest component. Extract:
- Property creation form into `components/dashboard/forms/property-form.tsx`
- Unit creation form into `components/dashboard/forms/unit-form.tsx`
- Lease creation form into `components/dashboard/forms/lease-form.tsx`
- Keep operations-section as the orchestrator that imports these forms

**`dashboard-config.ts` (512 lines)** — This is acceptable (config files can be long).

**`validations.ts` (645 lines)** — Acceptable (centralized validation is intentional).

#### I2. Remove Dead Code

Search for:
- Unused imports (ESLint should catch most)
- Commented-out code blocks (remove them — git has history)
- Unused exported functions (grep for the function name across the codebase)
- `console.log` statements that aren't in catch blocks (remove them)

#### I3. Performance Quick Wins

- Add `loading="lazy"` to images that aren't above the fold
- Ensure recharts components are dynamically imported (`next/dynamic` with `ssr: false`)
- Check for unnecessary re-renders in client components (missing `useCallback`/`useMemo` for expensive operations)
- Verify `revalidatePath` calls are targeted (not revalidating `/` which busts all caches)

---

### Part J: Accessibility (P2, 15 min)

#### J1. ARIA Labels

Add proper ARIA labels to:
- All icon-only buttons (`aria-label="Close"`, `aria-label="Delete"`, etc.)
- Navigation landmark (`<nav aria-label="Main navigation">`)
- Form inputs without visible labels (`aria-label` or `<label>`)
- Status badges (`aria-label="Status: Active"`)
- Tab interfaces (`role="tablist"`, `role="tab"`, `aria-selected`)

#### J2. Keyboard Navigation

- All modals: Trap focus, close on Escape
- Dropdown menus: Arrow key navigation, close on Escape
- Dashboard sidebar: Enter/Space to select items
- Forms: Tab order follows visual order

#### J3. Focus Indicators

Ensure all interactive elements have visible focus indicators:
- Buttons: `focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2`
- Links: Same pattern
- Inputs: Already handled by `domus-input` class
- Cards (if clickable): Focus ring

#### J4. Screen Reader

- Add `sr-only` text for icon-only controls
- Add live regions for dynamic content updates (`aria-live="polite"`)
- Ensure images have descriptive alt text (not just "image")
- Dom mascot image: `alt="Dom, the Domus mascot"` (not "Dom the Key mascot" — too technical)

---

### Part K: Unit Tests for New Code (P2, 10 min)

#### K1. Theme Utility Tests (`lib/__tests__/theme.test.ts` — NEW)

```typescript
describe("theme utilities", () => {
  test("isDarkTheme returns false for atlas-light", () => { /* ... */ });
  test("isDarkTheme returns true for noctis-neon", () => { /* ... */ });
  test("isDarkTheme returns true for imperium-night", () => { /* ... */ });
  test("getStoredTheme returns atlas-light when no localStorage", () => { /* ... */ });
});
```

#### K2. Rate Limit Tests (`lib/__tests__/rate-limit.test.ts` — NEW)

```typescript
describe("rate limiting", () => {
  test("allows requests under limit", () => { /* ... */ });
  test("blocks requests over limit", () => { /* ... */ });
  test("resets after window expires", () => { /* ... */ });
  test("tracks different keys independently", () => { /* ... */ });
});
```

#### K3. Maintenance Timeline Tests (`lib/__tests__/maintenance-timeline.test.ts` — NEW)

Test the status history logging and timeline retrieval functions (mock Supabase client).

---

## 6. File Summary

| Part | New Files | Modified Files | Total |
|---|---|---|---|
| A | 2 (theme.ts, theme-provider.tsx) | 2 (globals.css, layout.tsx) | 4 |
| B | 0 | ~50 (all components with dark mode fixes, globals.css) | ~50 |
| C | 0 | ~15 (card.tsx, button.tsx, index.tsx, sidebar-nav.tsx, empty-state.tsx, etc.) | ~15 |
| D | 1 (maintenance-tracker.tsx) | 3 (maintenance.ts, actions/maintenance.ts, maintenance-section.tsx) | 4 |
| E | 2 (achievements page, streak-heatmap.tsx) | 4 (dom-mascot.tsx, celebration.tsx, xp-bar.tsx, globals.css) | 6 |
| F | 1 (seed-demo.ts) | 1 (package.json) | 2 |
| G | 6 (helpers.ts, 5 spec files) | 0 | 6 |
| H | 1 (rate-limit.ts) | ~6 (next.config.mjs, inbox.ts, key action files) | ~7 |
| I | ~3 (extracted component files) | ~5 (refactored god files) | ~8 |
| J | 0 | ~20 (accessibility fixes across components) | ~20 |
| K | 3 (test files) | 0 | 3 |
| **Total** | **~19** | **~95** | **~114** |

Note: Many files are touched in multiple parts (e.g., `globals.css` in A+B+E, component files in B+C+J). Actual unique file count will be lower — estimated ~80 unique files touched.

## 7. Validation Commands

```bash
npm run gate:web
```

This runs: tests (expect 280+, likely 300+ with new tests), lint, typecheck, build.

For E2E (requires seeded data + running app):
```bash
npm run seed:demo
APP_URL=http://localhost:3000 npm run test:e2e
```

## 8. Acceptance Criteria

| # | Criterion | Priority |
|---|---|---|
| 1 | `ThemeProvider` wraps app, theme initializes from localStorage without flash | P0 |
| 2 | All 3 themes (atlas-light, noctis-neon, imperium-night) render correctly across all pages | P0 |
| 3 | No white/light backgrounds visible when dark theme active (check all 90 components) | P0 |
| 4 | New CSS variables (`--domus-card-bg`, `--domus-input-bg`, etc.) defined for all 3 themes | P0 |
| 5 | Semantic CSS classes (`.domus-card`, `.domus-input`, `.domus-badge-*`) work correctly | P0 |
| 6 | Dashboard header shows time-of-day greeting + date + KPI pills | P0 |
| 7 | Card component has `variant` prop (default, elevated, glass, flat) | P0 |
| 8 | Button component has tactile feedback (`active:scale-[0.98]`) | P0 |
| 9 | Charts render correctly in both light and dark themes | P0 |
| 10 | Maintenance pizza tracker renders timeline with correct step states | P1 |
| 11 | Status changes are logged to `maintenance_status_history` table | P1 |
| 12 | `/achievements` page shows all 12 achievements with earned/locked states | P1 |
| 13 | Dom mascot has animated `mood` prop with CSS keyframe animations | P1 |
| 14 | Celebration toast fires multi-burst confetti for achievements | P1 |
| 15 | Streak heatmap renders 12-month grid with color-coded squares | P1 |
| 16 | `npm run seed:demo` creates 5 users, 2 properties, 6 units, 4 leases, charges, payments, tickets | P1 |
| 17 | Playwright E2E: 20+ test cases across owner, manager, tenant, theme, accessibility | P1 |
| 18 | Security headers present in `next.config.mjs` (X-Frame-Options, HSTS, etc.) | P2 |
| 19 | Rate limiting applied to invite, autopay, and payment actions | P2 |
| 20 | `operations-section.tsx` split into smaller form components | P2 |
| 21 | `dashboard/index.tsx` header extracted to `dashboard-header.tsx` | P2 |
| 22 | ARIA labels on icon-only buttons and navigation landmarks | P2 |
| 23 | Keyboard navigation works for modals (Escape to close, focus trap) | P2 |
| 24 | New unit tests pass (theme, rate-limit, maintenance-timeline) | P2 |
| 25 | `npm run gate:web` passes (280+ tests, lint clean, build clean) | P0 |

**P0 = must pass. P1 = should pass. P2 = nice-to-have.**

## 9. Report Format

```
gate_passed: true/false
test_count: N
lint_clean: true/false
build_clean: true/false
files_changed: [list]
acceptance_criteria: [1: pass/fail, 2: pass/fail, ...]
p0_criteria_passed: N/9
p1_criteria_passed: N/8
p2_criteria_passed: N/8
```

## 10. Constraints

- Do NOT apply any DB migrations
- Do NOT deploy
- Do NOT install new npm packages (use existing: tailwindcss-animate, canvas-confetti, recharts, lucide-react, clsx, cva, zod)
- Do NOT use `useActionState` — use `useFormState` from `react-dom`
- Do NOT use framer-motion or any animation library not already installed
- Do NOT create `README.md` or documentation files
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections in your report
- Every Supabase `.update()`, `.insert()`, `.delete()` call must have its error result checked (L-002)
- Report compact status only
- If time runs short, complete P0 fully before P1, and P1 fully before P2
