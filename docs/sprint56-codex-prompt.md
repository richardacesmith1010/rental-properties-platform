# Sprint 56 — Codex Implementation Prompt

## 1. Objective

Add Progressive Web App (PWA) support so Domus can be installed on phones and tablets as a native-feeling app with an icon, splash screen, and full-screen experience.

## 2. Context

- **Branch**: `main`
- **HEAD**: `05c9a0b`
- **Production URL**: `https://domusbase.com`
- **Current state**: No manifest, no service worker, no PWA meta tags exist
- **Public assets dir**: `apps/web/public/` — only has `images/dom-the-key.png`
- **Layout file**: `apps/web/app/layout.tsx`
- **next.config.mjs**: No PWA config currently

## 3. In Scope

### Part A: Web App Manifest
- Create `public/manifest.json` with app name, icons, theme color, display mode
- Generate PWA icon set from the existing Domus brand colors (programmatic SVG icons at multiple sizes)

### Part B: Service Worker
- Lightweight service worker for offline shell caching (app shell only, not data)
- Cache the login page and static assets so the app doesn't show a blank screen offline
- Register service worker in the app layout

### Part C: Meta Tags & Head Config
- Add PWA meta tags to layout.tsx (theme-color, apple-mobile-web-app-capable, viewport-fit)
- Add apple-touch-icon links
- Add manifest link

### Part D: Install Prompt
- "Install Domus" button in settings page that triggers the browser install prompt
- Small install banner on first visit (dismissible, remembers dismissal in localStorage)

### Part E: Offline Fallback
- Simple offline fallback page when network is unavailable
- Shows Domus branding + "You're offline. Please check your connection."

## 4. Out of Scope

- Push notifications (requires Apple Developer Account)
- Background sync
- Full offline data caching (Supabase data requires network)
- next-pwa package (too heavy, use lightweight custom service worker)
- Database migrations
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (5-7)
1. `apps/web/public/manifest.json` — web app manifest
2. `apps/web/public/sw.js` — service worker
3. `apps/web/public/offline.html` — offline fallback page
4. `apps/web/public/icons/icon-192.svg` — PWA icon 192px
5. `apps/web/public/icons/icon-512.svg` — PWA icon 512px
6. `apps/web/public/icons/apple-touch-icon.png` — 180px Apple touch icon (can be SVG converted)
7. `apps/web/components/pwa/install-prompt.tsx` — install banner component

### Modified Files (2-3)
1. `apps/web/app/layout.tsx` — add manifest link, meta tags, service worker registration, install prompt
2. `apps/web/app/settings/page.tsx` or settings component — add "Install Domus" button
3. `apps/web/next.config.mjs` — add headers for service worker scope (if needed)

## 6. Implementation Requirements

### Part A: Web App Manifest

**File: `public/manifest.json`**
```json
{
  "name": "Domus — Rental Property Management",
  "short_name": "Domus",
  "description": "Professional rental property management for landlords with 1-10 units.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f0fdf4",
  "theme_color": "#7c3aed",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-192.svg",
      "sizes": "192x192",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.svg",
      "sizes": "512x512",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

### Part B: Icons

Create simple SVG icons that match Domus branding:
- Purple circle (#7c3aed) with white "D" letter, clean and modern
- 192px and 512px versions (SVG scales naturally)
- For apple-touch-icon: same design as a 180x180 PNG (or reference the SVG)

### Part C: Service Worker

**File: `public/sw.js`**

Lightweight — cache app shell only:
```javascript
const CACHE_NAME = "domus-v1";
const SHELL_URLS = [
  "/offline.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle navigation requests (HTML pages)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html"))
    );
  }
});
```

### Part D: Meta Tags in Layout

Add to `<head>` in `app/layout.tsx`:
```tsx
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#7c3aed" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Domus" />
<link rel="apple-touch-icon" href="/icons/icon-192.svg" />
```

### Part E: Service Worker Registration

Add to layout.tsx (client-side only):
```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js');
        });
      }
    `,
  }}
/>
```

Or better: create a small client component `ServiceWorkerRegistrar` that runs `useEffect` to register.

### Part F: Install Prompt Component

**File: `components/pwa/install-prompt.tsx`**

```tsx
"use client";

// Captures the beforeinstallprompt event
// Shows a dismissible banner: "Install Domus for quick access"
// On click: triggers the native install prompt
// Remembers dismissal in localStorage ("domus-install-dismissed")
// Only shows on mobile/tablet (check screen width or touch support)
// Hidden if app is already installed (check display-mode: standalone)
```

Key behaviors:
- Listen for `beforeinstallprompt` event, store the event
- Show banner only if: event fired AND not dismissed AND not already installed
- "Install" button calls `event.prompt()` and awaits the result
- "Not now" button sets localStorage flag and hides for 7 days
- On iOS (no beforeinstallprompt): show "Tap Share → Add to Home Screen" instructions instead

### Part G: Install Button in Settings

Add to the settings page (Appearance section or new "App" section):
- "Install Domus App" button
- Shows current install status: "Installed" (green badge) or "Not installed"
- On click: triggers install prompt (same mechanism as banner)
- On iOS: shows instructions modal

### Part H: Offline Fallback Page

**File: `public/offline.html`**

Simple HTML page with:
- Domus branding (purple gradient header)
- "You're offline" heading
- "Please check your internet connection and try again." message
- "Retry" button that calls `window.location.reload()`
- Inline CSS (no external dependencies — must work offline)

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] `manifest.json` exists at `/manifest.json` with correct app name, icons, theme color, standalone display
2. [ ] SVG icons exist at `/icons/icon-192.svg` and `/icons/icon-512.svg` with Domus branding
3. [ ] Service worker registers successfully and caches offline fallback
4. [ ] Offline fallback page shows when navigating without network
5. [ ] PWA meta tags present in HTML head (theme-color, apple-mobile-web-app-capable, manifest link)
6. [ ] Install prompt banner appears on first mobile visit (dismissible)
7. [ ] Install prompt remembers dismissal for 7 days
8. [ ] Settings page has "Install Domus" button/section
9. [ ] iOS shows "Add to Home Screen" instructions instead of install prompt
10. [ ] App runs in standalone mode after install (no browser chrome)
11. [ ] `npm run gate:web` passes — all unit tests, lint, typecheck, build clean
12. [ ] No regressions to existing functionality

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
MANIFEST: valid | issues
SERVICE_WORKER: registering | broken
INSTALL_PROMPT: working | broken
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT install next-pwa or any PWA npm packages — use lightweight custom implementation
- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Keep service worker minimal — cache offline page only, not data
- Icons must be SVG for scalability (PNG only for apple-touch-icon if SVG not supported)
- Do NOT attempt push notification registration
