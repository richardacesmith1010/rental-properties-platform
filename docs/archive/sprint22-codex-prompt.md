# Sprint 22 — "Premium Feel" Micro-Interactions & Modern UX Polish

## Objective

Transform every user interaction in Domus from functional to premium. Add page transitions, toast notifications, button loading/success states, staggered list animations, shimmer skeletons, form validation animations, count-up stats, animated tabs, mobile drawer navigation, and a comprehensive micro-interaction polish pass. When done, Domus should feel like Linear or Stripe — every click, every page change, every list load should have intentional, polished motion.

## Context

- **Branch:** `main`
- **HEAD:** `6d73240`
- **Runtime:** Next.js 14.2.5, React 18, Tailwind CSS, `tailwindcss-animate` plugin installed
- **Current animation deps:** `canvas-confetti`, `tailwindcss-animate`
- **No existing:** `sonner`, `vaul`, `framer-motion`, `template.tsx`, toast system
- **Current button:** Has `active:scale-[0.98]` and `transition-all duration-150` but no loading/success states
- **Current card:** Has `hover:-translate-y-0.5 hover:shadow-xl` on elevated variant
- **Current skeletons:** Use `animate-pulse` (basic), no shimmer sweep
- **Current mobile nav:** `MobileTopBar` in `sidebar-nav.tsx` lines 410-524, static — no drawer

## In Scope

1. Install `sonner` and `vaul` npm packages
2. Page transition system via `template.tsx`
3. Toast notification system replacing all alert/celebration patterns
4. Button component upgrade with `loading` and `success` props
5. Staggered list animation component + keyframes
6. Shimmer skeleton upgrade replacing `animate-pulse`
7. Form validation animations (shake + smooth error reveal)
8. Count-up animation component for stats/numbers
9. Animated tabs component with sliding underline
10. Mobile drawer navigation replacing static `MobileTopBar`
11. Micro-interaction polish across cards, inputs, toggles, dropdowns

## Out of Scope

- No backend changes, no database migrations, no Supabase changes
- No new features or pages — this is purely UX polish
- No Framer Motion (too heavy)
- No changes to server actions, API routes, or auth logic
- No Stripe changes
- Do NOT refactor component logic — only add/modify animation/interaction CSS and wrapper components

## Exact Files Expected to Change

### New files (create):
1. `apps/web/app/template.tsx`
2. `apps/web/components/ui/animated-list.tsx`
3. `apps/web/components/ui/count-up.tsx`
4. `apps/web/components/ui/animated-tabs.tsx`
5. `apps/web/components/ui/mobile-drawer.tsx`
6. `apps/web/components/ui/sonner-provider.tsx`

### Modified files:
7. `apps/web/package.json` (add sonner + vaul)
8. `apps/web/tailwind.config.ts` (add keyframes + animations)
9. `apps/web/app/globals.css` (add shimmer, shake, fade-in-up keyframes + classes)
10. `apps/web/app/layout.tsx` (add Toaster from sonner)
11. `apps/web/components/ui/button.tsx` (add loading + success props)
12. `apps/web/components/ui/card.tsx` (add border glow on hover)
13. `apps/web/components/ui/input.tsx` (upgrade focus states)
14. `apps/web/components/ui/select.tsx` (upgrade focus states)
15. `apps/web/components/ui/textarea.tsx` (upgrade focus states)
16. `apps/web/components/ui/modal-overlay.tsx` (refine entrance animation)
17. `apps/web/components/dashboard/sidebar-nav.tsx` (replace MobileTopBar with drawer trigger)
18. `apps/web/components/gamification/celebration.tsx` (use sonner toast)
19. `apps/web/components/gamification/xp-bar.tsx` (add count-up on XP numbers)
20. `apps/web/components/dashboard/dashboard-header.tsx` (add count-up on KPI pills)
21-35. All dashboard section files that render lists — add `<AnimatedList>` wrapper

### Files that use `window.alert` or inline feedback — replace with `toast()`:
- Search entire codebase for `window.alert`, `alert(`, and any inline success/error messages that should become toasts

## Implementation Requirements

### Part A: Install Dependencies

```bash
cd apps/web && npm install sonner@^2 vaul@^1
```

Verify both appear in `package.json` dependencies (not devDependencies).

---

### Part B: Tailwind Config — Add Keyframes & Animations

Replace `apps/web/tailwind.config.ts` with:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        sidebar: {
          from: "#7c3aed",
          to: "#064e3b",
        },
        domus: {
          primary: "#7C3AED",
          "primary-light": "#A78BFA",
          secondary: "#10B981",
          accent: "#F59E0B",
          danger: "#F43F5E",
        },
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-4px)" },
          "50%": { transform: "translateX(4px)" },
          "75%": { transform: "translateX(-4px)" },
        },
        "checkmark-draw": {
          "0%": { strokeDashoffset: "24" },
          "100%": { strokeDashoffset: "0" },
        },
        "slide-up-fade": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        shimmer: "shimmer 1.5s ease-in-out infinite",
        shake: "shake 400ms ease-in-out",
        "checkmark-draw": "checkmark-draw 300ms ease forwards",
        "slide-up-fade": "slide-up-fade 300ms ease",
        "scale-in": "scale-in 150ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

---

### Part C: globals.css — Add New Animation Classes

Append these to `apps/web/app/globals.css` at the end of the file, BEFORE any existing `@keyframes` blocks:

```css
/* ─── Shimmer skeleton ─── */
.domus-skeleton-shimmer {
  position: relative;
  overflow: hidden;
  background: var(--domus-skeleton-bg, hsl(240 5% 92%));
  border-radius: 0.5rem;
}
.domus-skeleton-shimmer::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent 25%,
    hsl(0 0% 100% / 0.08) 50%,
    transparent 75%
  );
  animation: shimmer 1.5s ease-in-out infinite;
}

/* Dark theme shimmer */
[data-domus-theme="noctis-neon"] .domus-skeleton-shimmer,
[data-domus-theme="imperium-night"] .domus-skeleton-shimmer {
  background: hsl(240 5% 18%);
}
[data-domus-theme="noctis-neon"] .domus-skeleton-shimmer::after,
[data-domus-theme="imperium-night"] .domus-skeleton-shimmer::after {
  background: linear-gradient(
    90deg,
    transparent 25%,
    hsl(0 0% 100% / 0.04) 50%,
    transparent 75%
  );
}

/* ─── Error shake ─── */
.domus-shake {
  animation: shake 400ms ease-in-out;
}

/* ─── Form error reveal ─── */
.domus-error-reveal {
  overflow: hidden;
  transition: max-height 200ms ease, opacity 200ms ease;
  max-height: 0;
  opacity: 0;
}
.domus-error-reveal[data-visible="true"] {
  max-height: 2rem;
  opacity: 1;
}

/* ─── Card border glow on hover ─── */
.domus-card {
  border: 1px solid var(--domus-card-border, hsl(240 5% 90%));
  transition: all 200ms ease;
}
.domus-card:hover {
  border-color: var(--domus-primary-glow, hsl(263 70% 58% / 0.3));
  background: var(--domus-card-hover);
}

/* ─── Stagger delay utilities ─── */
.stagger-1 { animation-delay: 50ms; }
.stagger-2 { animation-delay: 100ms; }
.stagger-3 { animation-delay: 150ms; }
.stagger-4 { animation-delay: 200ms; }
.stagger-5 { animation-delay: 250ms; }
.stagger-6 { animation-delay: 300ms; }
.stagger-7 { animation-delay: 350ms; }
.stagger-8 { animation-delay: 400ms; }
.stagger-9 { animation-delay: 450ms; }
.stagger-10 { animation-delay: 500ms; }
```

Also add the CSS variable `--domus-primary-glow` to ALL THREE theme blocks:
- `atlas-light`: `--domus-primary-glow: hsl(263 70% 58% / 0.3);`
- `noctis-neon`: `--domus-primary-glow: hsl(263 70% 58% / 0.4);`
- `imperium-night`: `--domus-primary-glow: hsl(263 70% 58% / 0.35);`

Also update the existing `.domus-skeleton` class to use shimmer instead of pulse:
```css
.domus-skeleton {
  /* Replace animate-pulse with shimmer */
}
```
Change `.domus-skeleton` to extend `.domus-skeleton-shimmer` OR replace its animation with the shimmer pattern. Keep the existing class name working so all existing usages automatically upgrade.

---

### Part D: Page Transition — `app/template.tsx`

Create `apps/web/app/template.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";

export default function Template({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    requestAnimationFrame(() => {
      if (!el) return;
      el.style.transition = "opacity 300ms ease, transform 300ms ease";
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
  }, []);

  return <div ref={ref}>{children}</div>;
}
```

This wraps EVERY page. `template.tsx` re-mounts on route changes (unlike `layout.tsx`), so every navigation gets a subtle fade + slide-up.

---

### Part E: Toast System — Sonner Provider + Integration

Create `apps/web/components/ui/sonner-provider.tsx`:

```tsx
"use client";

import { Toaster } from "sonner";

export function SonnerProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        className: "domus-card !border-violet-200/50 !shadow-lg",
        duration: 4000,
      }}
      richColors
      closeButton
    />
  );
}
```

Add `<SonnerProvider />` to `apps/web/app/layout.tsx` inside the `<body>`, after `<ThemeProvider>`:

```tsx
import { SonnerProvider } from "@/components/ui/sonner-provider";

// Inside body:
<ThemeProvider>
  {children}
  <SonnerProvider />
</ThemeProvider>
```

Update `apps/web/components/gamification/celebration.tsx`:
- Import `toast` from `sonner`
- Replace the custom `CelebrationToast` rendering with a sonner toast call
- Keep `triggerConfetti()` as-is (it works great)
- The celebration should call both: `triggerConfetti()` + `toast.success(message, { icon: <DomMascot ... /> })`

Search the ENTIRE codebase for these patterns and replace with `toast()`:
- `window.alert(` → replace with `toast.error()` or `toast.success()` as appropriate
- `alert(` (standalone) → same
- Any inline `<p className="text-red-...">Error...</p>` that appears temporarily → consider `toast.error()`

For every server action that returns `{ success: true, message: "..." }` or `{ success: false, error: "..." }`:
- The calling component should display a toast with that message
- Find components that currently show success/error inline and add `toast()` calls

**Do NOT remove the `CelebrationToast` component entirely** — keep it exported for backward compatibility, but have it internally use sonner.

---

### Part F: Button Upgrade — Loading + Success States

Replace `apps/web/components/ui/button.tsx` with:

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/format";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default: "gradient-btn hover:shadow-lg",
        gradient:
          "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/20 hover:-translate-y-0.5 hover:from-violet-600 hover:to-purple-700",
        outline:
          "border border-zinc-200 bg-white/80 text-zinc-700 shadow-none hover:bg-zinc-50 hover:text-zinc-900",
        ghost:
          "bg-transparent text-zinc-600 shadow-none hover:bg-zinc-100/70 hover:text-zinc-900",
        destructive:
          "bg-red-500 text-white shadow-sm hover:bg-red-600 hover:shadow-md",
        link: "text-violet-600 underline-offset-4 hover:underline",
        success:
          "bg-emerald-500 text-white shadow-sm scale-[1.02] pointer-events-none",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

/* Animated checkmark SVG */
function CheckmarkIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path
        d="M5 13l4 4L19 7"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ strokeDasharray: 24, animation: "checkmark-draw 300ms ease forwards" }}
      />
    </svg>
  );
}

/* Spinner SVG */
function SpinnerIcon() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  success?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, success, children, disabled, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        />
      );
    }

    const isDisabled = disabled || loading;
    const activeVariant = success ? "success" : variant;

    return (
      <button
        className={cn(
          buttonVariants({ variant: activeVariant, size, className }),
          loading && "relative cursor-wait"
        )}
        ref={ref}
        disabled={isDisabled}
        {...props}
      >
        {/* Text layer — fades out when loading or success */}
        <span
          className={cn(
            "inline-flex items-center gap-2 transition-opacity duration-150",
            (loading || success) && "opacity-0"
          )}
        >
          {children}
        </span>

        {/* Loading spinner overlay */}
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <SpinnerIcon />
          </span>
        )}

        {/* Success checkmark overlay */}
        {success && (
          <span className="absolute inset-0 flex items-center justify-center">
            <CheckmarkIcon />
          </span>
        )}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

Key changes:
- `active:scale-[0.97]` (from 0.98 — slightly more tactile, matches Linear)
- New `loading` prop: text fades out, spinner fades in, button stays same width
- New `success` prop: button turns green with animated checkmark
- New `success` variant for the green state
- `SpinnerIcon` and `CheckmarkIcon` internal components
- Preserved all existing variants, `asChild`, and CVA structure

---

### Part G: AnimatedList Component

Create `apps/web/components/ui/animated-list.tsx`:

```tsx
"use client";

import { Children, type ReactNode } from "react";
import { cn } from "@/lib/format";

interface AnimatedListProps {
  children: ReactNode;
  className?: string;
  /** Delay between each item in ms. Default: 50 */
  stagger?: number;
  /** Max delay cap in ms. Default: 500 */
  maxDelay?: number;
  /** Base animation class. Default: animate-fade-in-up */
  animation?: string;
}

export function AnimatedList({
  children,
  className,
  stagger = 50,
  maxDelay = 500,
  animation = "animate-fade-in-up",
}: AnimatedListProps) {
  return (
    <div className={className}>
      {Children.map(children, (child, i) => {
        if (!child) return null;
        const delay = Math.min(i * stagger, maxDelay);
        return (
          <div
            className={cn("opacity-0", animation)}
            style={{
              animationDelay: `${delay}ms`,
              animationFillMode: "forwards",
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
```

Apply `<AnimatedList>` to these dashboard sections (wrap the list/grid of items):
- Property cards in operations section
- Unit cards/rows
- Lease rows
- Notification list items
- Expense rows
- Document cards
- Achievement cards in achievements page
- Maintenance ticket rows
- Payment history rows
- Any other repeated list of items in dashboard sections

When applying, wrap the container of repeated items. Example:
```tsx
// Before:
<div className="space-y-3">
  {items.map(item => <DataRow key={item.id} ... />)}
</div>

// After:
<AnimatedList className="space-y-3">
  {items.map(item => <DataRow key={item.id} ... />)}
</AnimatedList>
```

Apply to AT LEAST 10 different list renders across the app.

---

### Part H: CountUp Component

Create `apps/web/components/ui/count-up.tsx`:

```tsx
"use client";

import { useEffect, useState, useRef } from "react";

interface CountUpProps {
  /** Target number to count up to */
  target: number;
  /** Animation duration in ms. Default: 1000 */
  duration?: number;
  /** Number of decimal places. Default: 0 */
  decimals?: number;
  /** Prefix (e.g., "$"). Default: "" */
  prefix?: string;
  /** Suffix (e.g., "%"). Default: "" */
  suffix?: string;
  /** Format with locale commas. Default: true */
  localeFormat?: boolean;
  className?: string;
}

export function CountUp({
  target,
  duration = 1000,
  decimals = 0,
  prefix = "",
  suffix = "",
  localeFormat = true,
  className,
}: CountUpProps) {
  const [display, setDisplay] = useState("0");
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    const start = performance.now();

    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic: fast start, gentle land
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * target;

      const formatted = decimals > 0
        ? current.toFixed(decimals)
        : Math.floor(current).toString();

      const localed = localeFormat
        ? Number(formatted).toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : formatted;

      setDisplay(localed);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }, [target, duration, decimals, localeFormat]);

  return (
    <span className={className}>
      {prefix}{display}{suffix}
    </span>
  );
}
```

Apply `<CountUp>` to:
1. `dashboard-header.tsx` — KPI pill numbers (occupancy %, rent collected $, etc.)
2. `xp-bar.tsx` — XP number display
3. `streak-heatmap.tsx` — streak count number (if displayed)
4. `achievements/page.tsx` — total XP, achievement counts
5. `owner/reports/page.tsx` — report totals
6. Any other numeric stat displays in the dashboard

Example usage:
```tsx
// Before:
<span className="text-2xl font-bold">${totalCollected.toLocaleString()}</span>

// After:
<CountUp target={totalCollected} prefix="$" duration={1200} className="text-2xl font-bold" />
```

---

### Part I: AnimatedTabs Component

Create `apps/web/components/ui/animated-tabs.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface AnimatedTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export function AnimatedTabs({ tabs, activeTab, onTabChange, className }: AnimatedTabsProps) {
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = tabRefs.current.get(activeTab);
    if (el) {
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeTab]);

  return (
    <div className={cn("relative", className)}>
      <div className="flex gap-1" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el);
            }}
            role="tab"
            aria-selected={tab.id === activeTab}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "relative z-10 inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors duration-150",
              tab.id === activeTab
                ? "text-violet-700 dark:text-violet-300"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      {/* Sliding underline indicator */}
      <div
        className="absolute bottom-0 h-0.5 bg-violet-500 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] rounded-full"
        style={{ left: indicator.left, width: indicator.width }}
      />
    </div>
  );
}
```

Apply `<AnimatedTabs>` to replace basic tab switching in:
1. Dashboard section tabs (if any section has tabs)
2. Settings page tabs (if tabbed)
3. Any component that currently uses plain buttons for tab-like switching

If a component currently uses conditional rendering based on a state variable to switch "tabs", wrap the tab buttons with `<AnimatedTabs>` and keep the conditional rendering for content.

---

### Part J: Mobile Drawer Navigation

Create `apps/web/components/ui/mobile-drawer.tsx`:

```tsx
"use client";

import { Drawer } from "vaul";
import { type ReactNode } from "react";
import { cn } from "@/lib/format";

interface MobileDrawerProps {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
}

export function MobileDrawer({ trigger, children, className }: MobileDrawerProps) {
  return (
    <Drawer.Root>
      <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 mt-24 flex flex-col rounded-t-2xl bg-white dark:bg-zinc-900",
            className
          )}
        >
          {/* Drag handle */}
          <div className="mx-auto mt-3 mb-2 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
          <div className="max-h-[85vh] overflow-y-auto px-4 pb-8">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

Modify `apps/web/components/dashboard/sidebar-nav.tsx`:

Replace the `MobileTopBar` component (lines ~410-524) to use the `MobileDrawer`:

1. Keep the top bar header (logo, notifications, user avatar)
2. Replace the static nav list with a hamburger button that opens `<MobileDrawer>`
3. Inside the drawer, render the same nav items that appear in the desktop sidebar
4. Include theme toggle inside the drawer
5. The drawer should have the same gradient background as the desktop sidebar OR use a clean white/dark surface

The hamburger icon should be a simple 3-line menu icon:
```tsx
<button className="p-2 rounded-lg hover:bg-white/10 transition-colors">
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
</button>
```

The drawer content should include:
- All nav items from `defaultNavItems`
- Active state highlighting (matching current route)
- Notification badges on relevant items
- Theme toggle at the bottom
- User info / logout at the bottom

---

### Part K: Form Input Focus + Validation Upgrades

Update `apps/web/components/ui/input.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/format";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "domus-input flex h-10 w-full transition-all duration-150",
          "focus-visible:ring-2 focus-visible:ring-violet-500/20 focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-red-400 focus-visible:ring-red-500/20 domus-shake",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
```

Apply the same `error` prop pattern to `select.tsx` and `textarea.tsx`.

For form error messages throughout the app, wrap error text in the smooth reveal pattern:

```tsx
{/* Error message with smooth reveal */}
<div
  className="domus-error-reveal"
  data-visible={!!errorMessage}
>
  <p className="text-sm text-red-500 mt-1">{errorMessage}</p>
</div>
```

Find AT LEAST 5 forms in the app where error messages currently appear/disappear abruptly and wrap them with this pattern.

---

### Part L: Micro-Interaction Polish Pass

#### L1. Card border glow
The `.domus-card:hover` border glow was added in Part C CSS. Verify it applies to all cards across the app. No code changes needed if all cards use the `.domus-card` class.

#### L2. Modal entrance refinement
In `modal-overlay.tsx`, verify the entrance animation uses `animate-scale-in` (the new keyframe). The current `animate-in fade-in zoom-in-95 duration-200` from tailwindcss-animate should work. Ensure the backdrop uses `transition-opacity duration-200`.

#### L3. Dropdown/popover entrance
If any dropdown or popover components exist, add `animate-scale-in` as the entrance animation class.

#### L4. XP bar transition
In `xp-bar.tsx`, ensure the progress bar width uses `transition-all duration-500 ease-[cubic-bezier(0.65,0,0.35,1)]` for smooth fill animation.

#### L5. Landing page scroll animations
On the landing page (`components/marketing/landing-page.tsx` or wherever the landing page lives):
- Wrap each major section in a scroll-triggered fade-in using `IntersectionObserver`
- Create a small `useInView` hook or inline the observer:

```tsx
function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}
```

Wrap each landing page section:
```tsx
function AnimateOnScroll({ children }: { children: ReactNode }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700",
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      )}
    >
      {children}
    </div>
  );
}
```

Apply to EVERY section on the landing page (hero excluded — hero should be visible immediately).

---

## Validation Commands

After all changes, run:

```bash
# 1. Verify deps installed
cd apps/web && node -e "require('sonner'); require('vaul'); console.log('DEPS OK')"

# 2. Verify new files exist
ls -la apps/web/app/template.tsx \
  apps/web/components/ui/animated-list.tsx \
  apps/web/components/ui/count-up.tsx \
  apps/web/components/ui/animated-tabs.tsx \
  apps/web/components/ui/mobile-drawer.tsx \
  apps/web/components/ui/sonner-provider.tsx

# 3. Verify no window.alert remaining
grep -r "window\.alert\|[^.]alert(" apps/web/app/ apps/web/components/ apps/web/lib/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test." || echo "NO ALERTS FOUND - PASS"

# 4. Verify shimmer keyframe exists
grep -c "shimmer" apps/web/tailwind.config.ts

# 5. Verify sonner Toaster in layout
grep -c "SonnerProvider\|Toaster" apps/web/app/layout.tsx

# 6. Verify template.tsx exists and has transition
grep -c "translateY" apps/web/app/template.tsx

# 7. Verify button has loading prop
grep -c "loading" apps/web/components/ui/button.tsx

# 8. Verify AnimatedList is used in at least 10 files
grep -rl "AnimatedList" apps/web/components/ | wc -l

# 9. Verify CountUp is used in at least 4 files
grep -rl "CountUp" apps/web/components/ apps/web/app/ | wc -l

# 10. Full gate
npm run gate:web
```

---

## Acceptance Criteria (Binary Pass/Fail)

1. `sonner` and `vaul` are in `package.json` dependencies — PASS/FAIL
2. `apps/web/app/template.tsx` exists and applies fade + slide-up on route change — PASS/FAIL
3. `<SonnerProvider>` / `<Toaster>` is rendered in root layout — PASS/FAIL
4. Zero `window.alert` calls remain in non-test source files — PASS/FAIL
5. `Button` component accepts `loading` prop that shows spinner — PASS/FAIL
6. `Button` component accepts `success` prop that shows green checkmark — PASS/FAIL
7. `AnimatedList` component exists and is used in ≥10 list renders — PASS/FAIL
8. `CountUp` component exists and is used in ≥4 stat displays — PASS/FAIL
9. `AnimatedTabs` component exists with sliding underline indicator — PASS/FAIL
10. `MobileDrawer` component exists using `vaul` — PASS/FAIL
11. Mobile navigation uses drawer (not static list) — PASS/FAIL
12. Shimmer skeleton replaces `animate-pulse` in `.domus-skeleton` — PASS/FAIL
13. `shake` keyframe exists in Tailwind config — PASS/FAIL
14. `fade-in-up` keyframe exists in Tailwind config — PASS/FAIL
15. `Input` component has `error` prop with shake animation — PASS/FAIL
16. Form error messages use smooth reveal (`max-h` transition) in ≥5 forms — PASS/FAIL
17. `.domus-card:hover` has border glow (border-color transition to primary) — PASS/FAIL
18. Landing page sections use scroll-triggered fade-in via IntersectionObserver — PASS/FAIL
19. `CelebrationToast` integrates with sonner (not standalone rendering) — PASS/FAIL
20. All existing tests pass (`npm run gate:web`) — PASS/FAIL
21. Lint clean — PASS/FAIL
22. Build clean (`next build` succeeds) — PASS/FAIL
23. No TypeScript errors — PASS/FAIL
24. Active scale changed from `0.98` to `0.97` on buttons — PASS/FAIL
25. XP bar has smooth width transition with ease-in-out cubic-bezier — PASS/FAIL

---

## Report Format

When complete, report:

```
Sprint 22 Status:
- commit_hash: <hash>
- files_changed: <number>
- lines_added: <number>
- lines_removed: <number>
- tests_passed: <number>/<total>
- test_suites: <number>
- lint: PASS | FAIL
- build: PASS | FAIL
- typecheck: PASS | FAIL
- new_deps_installed: [sonner, vaul] YES | NO
- template_tsx_created: YES | NO
- toast_system_active: YES | NO
- window_alerts_remaining: <count>
- animated_list_usage_count: <number>
- count_up_usage_count: <number>
- shimmer_active: YES | NO
- mobile_drawer_active: YES | NO
- acceptance_criteria: <passed>/<total>
```

---

## Constraints

- Do NOT add Framer Motion or any heavy animation library
- Do NOT modify server actions, API routes, or auth logic
- Do NOT change database schema or Supabase configuration
- Do NOT break existing functionality — this is additive polish only
- Do NOT refactor component business logic — only add animation/interaction layers
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Report compact status only per the format above
- ALL changes must be on the `main` branch
- Commit with message: `feat: sprint 22 premium feel micro-interactions`
