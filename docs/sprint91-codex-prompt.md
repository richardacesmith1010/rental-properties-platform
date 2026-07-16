# Sprint 91 — Mobile Viewport Fix + Logo

## 1. Objective

Fix the blank white screen on iOS Safari caused by `100svh` viewport clipping combined with `overflow-hidden`, and replace the "D" text placeholder logo with the actual Domus mascot head image (Dom) in the sidebar and login page.

## 2. Context

- **Branch:** main
- **Production URL:** https://domusbase.com
- **Supabase project ID:** vawqdqkaguhdgfhdebqw

**iOS viewport bug:** The outer dashboard container in `apps/web/components/dashboard/dashboard-layout.tsx` (line 90) uses `h-[100svh] min-h-[100svh] overflow-hidden`. On iOS Safari, `100svh` (small viewport height) is shorter than the actual visible screen height. Combined with `overflow-hidden`, content gets clipped to zero visible height, producing a blank white screen for iOS users.

**Logo placeholder:** The navigation logo is currently rendered as `<div className="...rounded-2xl...">D</div>` — a capital letter in a box. It must be replaced with the existing mascot head image: `<Image src="/images/mascot/icons/head.png" ... />`. This file already exists at `apps/web/public/images/mascot/icons/head.png`.

## 3. In Scope

- Fix iOS viewport clipping in `dashboard-layout.tsx`
- Fix any inner container `overflow-hidden` that clips scrollable content on mobile
- Replace the "D" placeholder with the Dom mascot head image in the sidebar and login page
- Update PWA manifest splash screen background color

## 4. Out of Scope

- Any changes to E2E test files
- Database migrations
- New npm dependencies
- Deploy to production
- Changes to CLAUDE.md or AGENTS.md
- Desktop layout changes — desktop sidebar behavior must not regress
- Changes to any page or component not listed in section 5

## 5. Exact Files Expected to Change

**Modified:**
- `apps/web/components/dashboard/dashboard-layout.tsx`
- `apps/web/components/dashboard/index.tsx`
- `apps/web/components/dashboard/sidebar-nav.tsx`
- `apps/web/app/login/page.tsx`
- `apps/web/app/manifest.json` (or `apps/web/app/manifest.ts` — whichever exists)

**No new files needed** — the mascot head image already exists at `apps/web/public/images/mascot/icons/head.png`.

## 6. Implementation Requirements

### Part A: Fix iOS Viewport Clipping

**File:** `apps/web/components/dashboard/dashboard-layout.tsx`

On the outermost container div (currently using `h-[100svh] min-h-[100svh] overflow-hidden`):
- Remove `h-[100svh]` — do not use a fixed viewport height lock
- Change `min-h-[100svh]` to `min-h-screen`
- Change `overflow-hidden` to `overflow-x-hidden` — allow vertical scroll, block horizontal scroll only

The desktop `lg:flex-row` layout must remain intact. The sidebar on desktop pins via its own `sticky top-0 h-screen` or equivalent — do not remove that. Only the outer wrapper height lock is being removed.

**File:** `apps/web/components/dashboard/index.tsx`

Find the inner content area using `flex min-h-0 flex-1 flex-col overflow-hidden`. Change `overflow-hidden` to `overflow-y-auto` so the main content area is scrollable on mobile instead of clipped.

Verify no other containers in `dashboard-layout.tsx` or `index.tsx` use `overflow-hidden` in a way that would clip content on mobile. If found, apply the same `overflow-x-hidden` or `overflow-y-auto` fix as appropriate.

### Part B: Replace the "D" Placeholder Logo

The mascot head image already exists at `apps/web/public/images/mascot/icons/head.png`. Use Next.js `<Image>` to render it everywhere the "D" box currently appears.

**File:** `apps/web/components/dashboard/sidebar-nav.tsx`

Locate the current `<div>D</div>` logo (or equivalent rounded box with the letter D). Replace it with:

```tsx
import Image from "next/image";

// In the logo area:
<div className="flex items-center gap-2.5">
  <Image
    src="/images/mascot/icons/head.png"
    alt="Domus"
    width={32}
    height={32}
    className="rounded-xl"
    priority
  />
  <span className="hidden font-semibold lg:block">Domus</span>
</div>
```

Size guide:
- Sidebar desktop logo: 32×32px with "Domus" wordmark visible
- Mobile top bar: 28×28px, wordmark hidden (space-constrained)

**File:** `apps/web/app/login/page.tsx`

Locate all instances of the "D" placeholder. Replace each with the mascot head image:

```tsx
import Image from "next/image";

// Left panel (desktop hero):
<div className="flex items-center gap-3">
  <Image src="/images/mascot/icons/head.png" alt="Domus" width={44} height={44} className="rounded-2xl" priority />
  <div>
    <p className="text-lg font-semibold tracking-tight">Domus</p>
    <p className="text-xs uppercase tracking-[0.2em] text-white/70">Rental operations</p>
  </div>
</div>

// Mobile card (small version):
<div className="flex items-center gap-3">
  <Image src="/images/mascot/icons/head.png" alt="Domus" width={40} height={40} className="rounded-2xl" priority />
  <div>
    <p className="text-lg font-semibold text-foreground">Domus</p>
    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Rental operations</p>
  </div>
</div>
```

The image has a light pink background — it will look clean on both the dark purple login panel and the white mobile card. Do not add a colored background div behind it; the rounded corners on the image itself are sufficient.

### Part D: Update PWA Manifest

**File:** `apps/web/app/manifest.json` or `apps/web/app/manifest.ts`

Update:
- `background_color`: change from `"#f0fdf4"` (greenish) to `"#ffffff"` (white)
- `theme_color`: must remain `"#7c3aed"` (purple) — do not change

## 7. Validation Commands to Run

```bash
npm run gate:web
```

Also manually verify (do not skip):
1. Open Chrome DevTools → toggle device emulation to iPhone 14 (390×844)
2. Navigate to the dashboard — the page must show content, not a blank white area
3. Scroll down in the main content — content must be reachable
4. Switch back to desktop (1440px) — sidebar must still be pinned on the left, content fills remaining width

## 8. Acceptance Criteria

- [ ] Opening the dashboard in Chrome mobile simulation at 390px width shows actual content — no blank white screen
- [ ] The main dashboard content area is scrollable on mobile — content is not clipped
- [ ] Desktop sidebar layout is unchanged — sidebar pins on the left, content fills the right
- [ ] The "D" letter-in-a-box is replaced by Dom's mascot head image in the sidebar nav
- [ ] The "D" letter-in-a-box is replaced by Dom's mascot head image on the login page
- [ ] The image renders at the correct size with rounded corners in both locations
- [ ] PWA manifest `background_color` is `"#ffffff"` (white, not green-tinted)
- [ ] `npm run gate:web` passes with zero errors

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
MOBILE_VIEWPORT: fixed | still broken
DOM_LOGO_SIDEBAR: yes | no
DOM_LOGO_LOGIN: yes | no
MANIFEST_UPDATED: yes | no
GATE_PASSED: true | false
NOTES: [any issues]
```

## 10. Constraints

- Do NOT install new npm dependencies
- Do NOT modify E2E test files
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT deploy to production
- Do NOT create database migrations
- Use the EXISTING image at `apps/web/public/images/mascot/icons/head.png` — do NOT create a new SVG logo
- Desktop layout must not regress — only mobile overflow/height behavior changes
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Report compact status only
