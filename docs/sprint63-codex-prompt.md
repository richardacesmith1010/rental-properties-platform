# Sprint 63 — Codex Implementation Prompt

## 1. Objective

Replace the legacy mascot with the new character across the entire app, AND fix critical Sprint 62 bugs in the property wizard and dashboard pagination.

## 2. Context

- **Branch**: `main`
- **HEAD**: `5ae3434`
- **Production URL**: `https://domusbase.com`

**New mascot assets are already in the repo:**
```
apps/web/public/images/mascot/
├── poses/
│   ├── happy.png        (2.2MB)
│   ├── waving.png       (2.2MB)
│   ├── celebrating.png  (656KB)
│   ├── thinking.png     (804KB)
│   ├── pointing.png     (2.2MB)
│   └── sleeping.png     (490KB)
├── icons/
│   └── head.png         (1.9MB)
└── ASSET-GUIDE.md
```

**Legacy mascot:** `public/images/dom-the-key.png` — used in 2 files:
1. `components/gamification/dom-mascot.tsx` (line 42) — renders with mood-based sizes (sm/md/lg/xl)
2. `lib/email-templates.ts` (line 67) — hardcoded URL `https://domusbase.com/images/dom-the-key.png`

**Current icon files (to be replaced):**
- `public/icons/icon-192.svg` — simple purple "D" letter
- `public/icons/icon-512.svg` — simple purple "D" letter
- `public/icons/apple-touch-icon.png` — PNG version

## 3. In Scope

### Part A: Image Optimization
- Resize all pose PNGs to 512x512 max (they're currently oversized)
- Create optimized versions at needed sizes
- Generate icon sizes from `head.png`: 32x32, 180x180, 192x192, 512x512

### Part B: Update dom-mascot.tsx
- Change from single image to pose-based rendering
- Map the existing `mood` prop to the correct pose file:
  - `happy` / default → `/images/mascot/poses/happy.png`
  - `excited` / `celebrating` → `/images/mascot/poses/celebrating.png`
  - `encouraging` / `waving` → `/images/mascot/poses/waving.png`
  - `thinking` → `/images/mascot/poses/thinking.png`

### Part C: Replace PWA Icons
- Replace `public/icons/icon-192.svg` with mascot head icon (192px PNG)
- Replace `public/icons/icon-512.svg` with mascot head icon (512px PNG)
- Replace `public/icons/apple-touch-icon.png` with mascot head icon (180px PNG)
- Update `public/manifest.json` icon entries (change type from SVG to PNG)
- Update `app/layout.tsx` icon metadata

### Part D: Update All Mascot Usage Points
- `components/dashboard/welcome-card.tsx` — use `waving` pose for onboarding
- `components/shared/empty-state.tsx` — use `pointing` pose for empty states
- `app/error.tsx` and `app/global-error.tsx` — use `sleeping` pose
- `app/tenant/error.tsx`, `app/owner/error.tsx`, `app/manager/error.tsx` — use `sleeping` pose
- `public/offline.html` — embed `sleeping` pose (inline base64 or relative path)
- `components/dashboard/onboarding-checklist.tsx` — use `waving` pose
- Login page — use `happy` pose if mascot is shown there

### Part E: Update Email Template
- Update `lib/email-templates.ts` to use new mascot URL: `https://domusbase.com/images/mascot/poses/happy.png`
- Keep the hardcoded absolute URL (required for email rendering)

### Part F: Delete Legacy Asset
- Delete `public/images/dom-the-key.png` after all references are updated
- Verify no file references the old path (grep the entire codebase)

### Part G: FIX — Property Wizard Bugs (Critical)

The property wizard from Sprint 62 has 3 critical bugs that must be fixed:

**Bug 1 — Wizard modal can't scroll and isn't centered:**
The wizard modal content overflows the viewport but has no scroll. The modal should be vertically centered on screen with `overflow-y: auto` and `max-height: 90vh` so all content is reachable. Fix in `components/dashboard/property-wizard.tsx`:
```tsx
// The modal container needs:
className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
// The modal content needs:
className="... max-h-[90vh] overflow-y-auto ..."
```

**Bug 2 — Street address input causes form to jump back to Property Name:**
When typing in the Street Address field, the form re-renders and focus jumps back to Property Name. This is caused by the component re-rendering on every keystroke and resetting focus. The root cause is likely:
- State being stored in a way that causes full re-renders (e.g., lifting state too high)
- OR an `autoFocus` prop on the Property Name input that fires on every render
- OR the form using controlled inputs with a state shape that triggers re-mount

**Fix:**
1. Remove any `autoFocus` on the Property Name input (only auto-focus on initial mount, not re-renders)
2. Make sure each input's `onChange` only updates its own field without causing sibling inputs to re-mount
3. Use a single form state object and update individual fields: `setForm(prev => ({...prev, street: value}))` — do NOT replace the entire state object if it causes re-renders
4. If using `useForm` from react-hook-form or similar, make sure the form isn't re-registering fields on state change

**Bug 3 — Step 2 (Units) immediately resets back to Step 1:**
After completing Step 1 (Property Details) and clicking Next, Step 2 (Add Units) briefly appears then jumps back to Step 1. This is likely caused by:
- The property creation action in Step 1 triggers a re-render/revalidation that resets the wizard step state
- OR `revalidatePath` in the createProperty server action causes the parent component to re-mount, losing the wizard's step state
- OR the wizard step is stored in component state that gets reset when the dashboard data reloads

**Fix:**
1. Store the wizard step in a ref or in state that persists through parent re-renders
2. If `createProperty` calls `revalidatePath`, the wizard must maintain its step state despite the dashboard re-rendering behind it
3. Consider using `useRef` for the current step and only using state for triggering re-renders when needed
4. The simplest fix: make the wizard a portal that renders outside the dashboard component tree, so dashboard re-renders don't affect it
5. OR: delay the `revalidatePath` call until the wizard is fully closed (don't revalidate after each step)

**Test the fix by:** Opening the wizard → typing "131 Chaste Tree Circle" in the street address → confirming focus stays → clicking Next → confirming Step 2 stays visible and functional.

### Part H: FIX — Dashboard Pagination Not Working

The Sprint 62 paginated dashboard layout is not working correctly. The greeting ("Good afternoon, Ace") section and the Overview section are still stacked vertically, requiring scrolling.

**Expected behavior:**
1. The greeting + KPI pills fill the viewport on initial load — NO other section visible
2. Right arrow button (or right arrow key) navigates to "Overview" page
3. Another right arrow navigates to "Charges" page
4. Each page fills the viewport — no scrolling needed

**Current behavior:** The greeting and Overview are stacked, same as before Sprint 62.

**Fix in `components/dashboard/index.tsx` and/or `section-renderer.tsx`:**

1. The greeting/KPI area must be its own "page" in the pagination — it's page 0 (home), and Overview is page 1
2. The content area below the greeting must be HIDDEN by default (not rendered below)
3. Only when the user clicks the right arrow does the content area appear, replacing the greeting
4. Use `overflow: hidden` on the main content area to prevent any scrolling
5. Each section must be constrained to `height: calc(100vh - topBarHeight)` so it fits the viewport
6. If a section's content is too tall (e.g., long charge list), show "View all (N items)" with a truncated list

**Navigation flow:**
```
[Home: Greeting + KPIs] → [Overview] → [Charges] → [Portfolio] → [Maintenance] → [Leases] → [Manager Payments] → [Analytics]
     ←                      ←            ←             ←              ←              ←                ←               ←
```

The left/right arrows and keyboard arrow keys cycle through these pages. The current section name and position (e.g., "3 of 8") should be visible.

## 4. Out of Scope

- Creating new poses or modifying the images
- Animations or transitions between poses
- Database migrations
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (0-4, icon size variants)
1. `apps/web/public/icons/icon-192.png` — mascot head 192px (replaces SVG)
2. `apps/web/public/icons/icon-512.png` — mascot head 512px (replaces SVG)
3. `apps/web/public/icons/icon-32.png` — favicon size

### Modified Files (8-12)
1. `apps/web/components/gamification/dom-mascot.tsx` — pose-based image selection
2. `apps/web/lib/email-templates.ts` — new mascot URL
3. `apps/web/public/manifest.json` — update icon paths and types
4. `apps/web/app/layout.tsx` — update icon metadata
5. `apps/web/components/dashboard/welcome-card.tsx` — waving pose
6. `apps/web/components/shared/empty-state.tsx` — pointing pose
7. `apps/web/app/error.tsx` — sleeping pose
8. `apps/web/app/global-error.tsx` — sleeping pose
9. `apps/web/public/offline.html` — sleeping pose
10. `apps/web/components/dashboard/onboarding-checklist.tsx` — waving pose

### Deleted Files
1. `apps/web/public/images/dom-the-key.png` — legacy mascot
2. `apps/web/public/icons/icon-192.svg` — old "D" icon
3. `apps/web/public/icons/icon-512.svg` — old "D" icon

## 6. Implementation Requirements

### Part A: Image Optimization

The raw PNGs from ChatGPT are oversized (1-2MB each). Use Next.js `<Image>` component with width/height props to handle runtime optimization. However, the PWA icons need to be pre-sized PNGs since they're referenced from manifest.json.

**For PWA icons**, use a build script or manually create sized versions. Since we can't install sharp as a CLI tool easily, the simplest approach is:

1. Use the `head.png` at its current size — Next.js will serve optimized versions via its image optimization
2. For manifest/PWA icons, reference the full `head.png` and let the browser resize, OR create a simple Node script that resizes using canvas

**Simplest approach:** Reference the full-size images with explicit width/height in `<Image>` components (Next.js handles optimization), and for manifest icons point to the head.png with appropriate `sizes` declarations. The browser handles the rest.

### Part B: dom-mascot.tsx Update

```typescript
const POSE_MAP: Record<string, string> = {
  happy: "/images/mascot/poses/happy.png",
  excited: "/images/mascot/poses/celebrating.png",
  celebrating: "/images/mascot/poses/celebrating.png",
  encouraging: "/images/mascot/poses/waving.png",
  waving: "/images/mascot/poses/waving.png",
  thinking: "/images/mascot/poses/thinking.png",
  pointing: "/images/mascot/poses/pointing.png",
  sleeping: "/images/mascot/poses/sleeping.png",
  working: "/images/mascot/poses/thinking.png",  // fallback to thinking
};

// In the component:
const poseSrc = POSE_MAP[mood] ?? POSE_MAP.happy;

<Image
  src={poseSrc}
  alt={`Domus mascot - ${mood}`}
  width={sizeMap[size].width}
  height={sizeMap[size].height}
  className={animationClass}
/>
```

### Part C: Manifest Update

```json
{
  "icons": [
    {
      "src": "/images/mascot/icons/head.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/images/mascot/icons/head.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

### Part D: Context-Specific Poses

| Location | Pose | Why |
|----------|------|-----|
| Dashboard greeting | `happy` | Default welcoming state |
| Welcome/onboarding card | `waving` | Greeting new users |
| Achievement unlocked | `celebrating` | Celebration moment |
| Loading states | `thinking` | Processing indicator |
| Empty states | `pointing` | Directing user to take action |
| Error pages | `sleeping` | Something went wrong, passive |
| Offline page | `sleeping` | Can't connect |
| Email header | `happy` | Friendly notification |

### Part E: Offline.html

Since `offline.html` can't use Next.js Image component (it's a static HTML file), reference the pose directly:
```html
<img src="/images/mascot/poses/sleeping.png" alt="Domus mascot sleeping" width="120" height="120" />
```

### Part F: Cleanup Verification

Before deleting legacy files, run:
```bash
grep -r "dom-the-key" apps/web/ --include="*.tsx" --include="*.ts" --include="*.html" --include="*.json"
grep -r "icon-192.svg" apps/web/ --include="*.tsx" --include="*.ts" --include="*.html" --include="*.json"
grep -r "icon-512.svg" apps/web/ --include="*.tsx" --include="*.ts" --include="*.html" --include="*.json"
```

Only delete files when zero references remain.

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] `dom-mascot.tsx` renders pose-specific images based on mood prop
2. [ ] Dashboard greeting shows `happy` pose
3. [ ] Onboarding/welcome shows `waving` pose
4. [ ] Empty states show `pointing` pose
5. [ ] Error pages show `sleeping` pose
6. [ ] Offline page shows `sleeping` pose
7. [ ] Email template uses new mascot URL
8. [ ] PWA manifest references new mascot head icon
9. [ ] Apple touch icon updated to mascot head
10. [ ] Layout metadata updated with new icon paths
11. [ ] Legacy `dom-the-key.png` deleted
12. [ ] Legacy SVG icons deleted
13. [ ] No references to old assets remain in codebase
14. [ ] `npm run gate:web` passes
15. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
DELETED_FILES: [list]
POSES_WIRED: happy | waving | celebrating | thinking | pointing | sleeping
ICONS_UPDATED: manifest | layout | apple-touch
LEGACY_CLEANED: yes | no
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify or resize the actual PNG files — use Next.js Image optimization for runtime resizing
- Do NOT install image processing dependencies (sharp CLI, imagemagick, etc.)
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- For manifest icons, it's OK to reference the full-size head.png with sizes declarations — the browser handles resizing
- Keep the existing animation classes in dom-mascot.tsx — just change the image source
