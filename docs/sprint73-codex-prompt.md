# Sprint 73 — Codex Implementation Prompt

## 1. Objective

Fix all contrast issues in the existing light mode, redesign the marketing page to use the light theme by default, and elevate the login page to feel modern and premium. This is NOT a new theme — it's fixing the light mode that already exists and ensuring every component looks correct in it.

## 2. Context

- **Branch**: `main`
- **HEAD**: (latest after Sprint 72)
- **Production URL**: `https://domusbase.com`
- **Existing theme infrastructure**:
  - Light mode already exists and is toggleable in Settings > Appearance
  - CSS variables defined in `app/globals.css` for light and dark modes
  - Tailwind uses `hsl(var(--background))`, `hsl(var(--foreground))`, etc.
  - Marketing page currently uses dark background regardless of theme
  - Login page is functional but plain

**Known contrast issues in light mode:**
- Late/pending charge status badges are hard to read — text color doesn't contrast against badge background
- KPI cards with gradient backgrounds may wash out on light backgrounds
- Sidebar elements may have insufficient contrast
- Marketing page "Spreadsheets can't track payments" cards have white backgrounds that blend into white page background
- Some muted text is too light to read in light mode

## 3. In Scope

### Part A: Light Mode Contrast Audit & Fix
Go through EVERY component and verify text is readable against its background in light mode:

**Status badges (CRITICAL):**
- `paid` badge: green text on green-tinted background — ensure dark enough green text
- `pending` badge: amber text on amber-tinted background — ensure dark enough amber text
- `late` badge: red text on red-tinted background — ensure dark enough red text
- `waived` badge: gray text on gray background — ensure readable

**KPI cards:**
- If using gradient backgrounds: text must be white and legible
- If using white cards with border accents: text must be dark and legible
- Ensure the value numbers (dollar amounts, percentages) have strong contrast

**Sidebar:**
- Active nav item text clearly distinguishable from inactive
- Account switcher text readable
- Search input placeholder visible

**Tables and lists:**
- Column headers visible
- Row text readable
- Alternating row colors (if any) don't wash out text

**Modals and overlays:**
- Modal backgrounds clearly distinct from page background
- Form labels and inputs have visible borders
- Buttons clearly visible

**General text:**
- All `text-muted-foreground` instances must be WCAG AA compliant (4.5:1 ratio minimum)
- Headings must be clearly darker than body text
- Links must be distinguishable from regular text

### Part B: Marketing Page Light Theme
- Switch marketing page from dark background to light/white
- The dashboard mockup image can keep its dark background (provides contrast as a screenshot)
- "Spreadsheets can't track payments" problem cards: give them a subtle gray background (#f8fafc) or visible border + shadow so they don't blend into white
- "How it works" step cards: subtle shadow + border
- Feature showcase cards: visible borders or light gray backgrounds
- Testimonial cards: visible styling
- Footer: light gray background (#f1f5f9)
- ALL text must pass WCAG AA contrast on the new light background
- CTA buttons stay purple — they should pop against white
- "Trusted by 500+ landlords" text must be readable

### Part C: Login Page Redesign
Elevate the login page from plain form to something that feels like a premium product. Reference: Notion, Linear, Clerk, or Vercel login pages.

**Layout:**
- Split layout: left side = branding/value prop, right side = login form
- OR: centered card with background illustration
- The key is it shouldn't feel like a generic auth form

**Left side (or background):**
- Domus mascot (large, one of the new poses)
- Tagline: "Manage your rentals like a pro."
- Subtle purple gradient or brand pattern
- Maybe 1-2 social proof stats ("500+ landlords", "2,000+ units managed")

**Right side (login form):**
- Clean white card with shadow
- "Welcome back" heading
- Email input with floating label or clean placeholder
- Password input with show/hide toggle
- "Sign in" button — purple, full width
- "Forgot password?" link
- "Don't have an account? Get started" link
- Subtle Domus logo at top of form

**Mobile:** Stack vertically — branding on top (compact), form below

### Part D: Marketing Page Navigation to Login
- "Sign in" button in marketing nav should feel connected to the login experience
- Consistent branding between marketing → login → app

## 4. Out of Scope

- Creating new theme options (the 3-way toggle idea — defer)
- Dark mode changes
- New features or functionality
- Database migrations
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### Modified Files (10-15)
1. `apps/web/app/globals.css` — fix light mode CSS variable values for better contrast
2. `apps/web/app/marketing/page.tsx` — redesign to light background
3. `apps/web/app/login/page.tsx` — redesign login page
4. `apps/web/lib/status-colors.ts` — ensure status colors have WCAG AA contrast in light mode
5. `apps/web/components/shared/kpi-card.tsx` — ensure readable in light mode
6. `apps/web/components/dashboard/kpi-grid.tsx` — light mode card styling
7. `apps/web/components/dashboard/rent-collection-bar.tsx` — contrast check
8. `apps/web/components/dashboard/charges-section.tsx` — status badge contrast
9. `apps/web/components/dashboard/maintenance-section.tsx` — status badge contrast
10. `apps/web/components/dashboard/leases-section.tsx` — status badge contrast
11. `apps/web/components/dashboard/sidebar/sidebar-nav.tsx` — light mode nav contrast
12. `apps/web/components/dashboard/account-switcher.tsx` — light mode contrast
13. `apps/web/components/dashboard/compact-greeting-bar.tsx` — light mode contrast
14. `apps/web/components/dashboard/command-palette.tsx` — light mode contrast
15. `apps/web/components/dashboard/modal-overlay.tsx` — light mode backdrop

### New Files (0-1)
1. `apps/web/components/auth/login-layout.tsx` — split-screen login layout (optional, may be inline in login/page.tsx)

## 6. Implementation Requirements

### Part A: Status Badge Contrast Fix

In `lib/status-colors.ts`, ensure light mode colors pass WCAG AA:

```typescript
// Current might be too light. Ensure these specific values:
case "success":
  return {
    text: "text-emerald-800",      // was text-emerald-700 — darken
    bg: "bg-emerald-100",          // was bg-emerald-50 — slightly more opaque
    border: "border-emerald-300",  // was border-emerald-200 — more visible
    dot: "bg-emerald-600",
  };
case "warning":
  return {
    text: "text-amber-800",
    bg: "bg-amber-100",
    border: "border-amber-300",
    dot: "bg-amber-600",
  };
case "danger":
  return {
    text: "text-red-800",
    bg: "bg-red-100",
    border: "border-red-300",
    dot: "bg-red-600",
  };
case "neutral":
  return {
    text: "text-gray-700",
    bg: "bg-gray-100",
    border: "border-gray-300",
    dot: "bg-gray-500",
  };
```

### Part B: KPI Card Light Mode

The gradient cards may be fine in light mode, but verify the white text is readable. If any gradient is too light, darken the gradient slightly for light mode:

```tsx
// If using CSS variables, add light-mode-specific gradient overrides
// OR: use a darker gradient in light mode
// The key: value text (dollar amounts, percentages) must be clearly readable
```

### Part C: Marketing Page Light Redesign

**Color palette for marketing:**
- Page background: `#ffffff`
- Section separators: alternating `#ffffff` and `#f8fafc`
- Cards: `#ffffff` with `border border-gray-200 shadow-sm`
- Headings: `#0f172a` (slate-900)
- Body text: `#334155` (slate-700)
- Muted text: `#64748b` (slate-500) — but NOT lighter than this
- Purple accents: `#7c3aed`
- CTA buttons: `bg-purple-600 hover:bg-purple-700 text-white`

**Problem cards fix:**
```tsx
// Instead of white cards on white background:
<div className="bg-white border border-gray-200 shadow-md rounded-2xl p-8">
  {/* Purple icon */}
  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center mb-4">
    <Icon className="w-6 h-6 text-purple-600" />
  </div>
  <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
  <p className="text-slate-600">{description}</p>
</div>
```

Or use a very light gray section background:
```tsx
<section className="bg-slate-50 py-20">
  {/* problem cards here — white cards on gray background = visible */}
</section>
```

### Part D: Login Page Redesign

**Split layout approach:**

```tsx
<div className="min-h-screen flex">
  {/* Left: Branding */}
  <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-purple-600 to-purple-900 p-12 flex-col justify-between">
    <div>
      <div className="flex items-center gap-3 mb-12">
        <Image src="/icons/icon-192.svg" alt="Domus" width={40} height={40} />
        <span className="text-2xl font-bold text-white">Domus</span>
      </div>
      <h1 className="text-4xl font-bold text-white leading-tight mb-4">
        Manage your rentals<br />like a pro.
      </h1>
      <p className="text-purple-200 text-lg">
        The command center for landlords with 1-10 units.
      </p>
    </div>

    {/* Mascot */}
    <div className="flex justify-center">
      <Image src="/images/mascot/poses/waving.png" alt="Domus mascot" width={200} height={200} />
    </div>

    {/* Social proof */}
    <div className="flex gap-8 text-purple-200">
      <div><span className="text-white font-bold">500+</span> landlords</div>
      <div><span className="text-white font-bold">2,000+</span> units</div>
      <div><span className="text-white font-bold">Free</span> forever</div>
    </div>
  </div>

  {/* Right: Login form */}
  <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
    <div className="w-full max-w-md">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-2 mb-8">
        <Image src="/icons/icon-192.svg" alt="Domus" width={32} height={32} />
        <span className="text-xl font-bold text-purple-600">Domus</span>
      </div>

      <h2 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h2>
      <p className="text-slate-500 mb-8">Sign in to your Domus account</p>

      {/* Form with clean styling */}
      <form>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
        <input className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 mb-4" />

        <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
        <input type="password" className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 mb-2" />

        <div className="flex justify-end mb-6">
          <a href="#" className="text-sm text-purple-600 hover:text-purple-700">Forgot password?</a>
        </div>

        <button className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition">
          Sign in
        </button>
      </form>

      <p className="text-center text-slate-500 mt-6">
        Don't have an account? <a href="/marketing" className="text-purple-600 font-medium">Get started</a>
      </p>
    </div>
  </div>
</div>
```

### Part E: Muted Text Minimum Contrast

Grep the entire component tree for `text-muted-foreground`, `text-gray-400`, `text-gray-300`, `text-slate-400` and ensure none appear on white backgrounds. Minimum acceptable:
- On white bg: `text-gray-500` / `text-slate-500` or darker
- Never use `text-gray-400` or lighter on white backgrounds in light mode

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] All status badges (paid/pending/late/waived) clearly readable in light mode
2. [ ] KPI card values clearly readable in light mode
3. [ ] Sidebar nav items have sufficient contrast in light mode
4. [ ] All muted text passes WCAG AA (4.5:1) against its background
5. [ ] Marketing page uses light/white background
6. [ ] Marketing problem cards visually distinct from page background (shadow/border/bg)
7. [ ] Marketing CTA buttons pop against white background
8. [ ] Login page has split layout: branding left, form right
9. [ ] Login page shows mascot and value proposition
10. [ ] Login page mobile: stacks vertically, logo + form
11. [ ] Login form has clean, modern styling (rounded inputs, purple focus ring, full-width button)
12. [ ] No `text-gray-400` or lighter on white backgrounds anywhere in light mode
13. [ ] Command palette readable in light mode
14. [ ] Modal overlays have visible backdrops in light mode
15. [ ] `npm run gate:web` passes
16. [ ] No regressions to dark mode or existing functionality

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
STATUS_BADGES: contrast fixed | still issues
KPI_CARDS: readable | issues
MARKETING_PAGE: light redesign | unchanged
LOGIN_PAGE: redesigned | unchanged
MUTED_TEXT: all WCAG AA | violations found
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create new theme options (keep existing light/dark toggle as-is)
- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change dark mode — only fix light mode
- Marketing page is ALWAYS light regardless of user's theme setting
- Login page styling should work in both light and dark modes
- All contrast fixes must be backward compatible — don't break dark mode while fixing light mode
