# Sprint 238i — Repair photo viewer: full screen, plus a visible "Save photo" button (L2) — rev 1

## 1. Objective
Real-iPhone finding **F3** (2026-10-16, TestFlight build 2, reproduced by Claude on the iPhone 18 Pro Simulator as the walk
tenant): opening a repair photo shows the viewer **inside the repair card** instead of over the whole screen (the image sits
partly behind the tab bar and needs scrolling), and pressing and holding the photo shows **no Save menu**. Make the viewer
cover the screen and give people a plain button to save or share the photo. The user should never need to read
instructions to complete this flow.

## 2. Context
- `apps/web/components/dashboard/maintenance/photo-gallery.tsx` (151 lines): thumbnails are `<button>`s (`:66-78`); the
  viewer is `activePhoto ? <div className="fixed inset-0 z-50 …">` (`:103`) rendered inside the gallery, which is inside
  the repair card in `components/dashboard/maintenance-section.tsx:272-290`. A `fixed` element inside an ancestor with a
  transform, filter or backdrop-filter is positioned against that ancestor, not the screen, which matches what we saw.
- Native download path already exists: in the iPhone app a main-frame navigation to a Domus `blob:` URL becomes a
  `WKDownload` (`apps/ios/ios/App/App/DomusNavigationDelegate.swift:104-107`, `NavigationPolicy.isDomusBlob`), and
  `DownloadHandler.swift` shows the iOS share sheet (which offers "Save Image"; `NSPhotoLibraryAddUsageDescription` is set).
  In a desktop browser the same click downloads the file.
- `apps/web/app/globals.css:532-535` sets `-webkit-touch-callout: none` on links and buttons in the native app (keep it).
- Photo URLs are short-lived signed Storage URLs (`photo.url`).

## 3. In scope
Viewer rendered at page level (portal), sized to the screen with safe areas; a `Save photo` button in the viewer; tests.

## 4. Out of scope
Uploading (Sprint 238j), deleting photos, native code, the thumbnail grid layout, other galleries.

## 5. Exact files expected to change
1. `apps/web/components/dashboard/maintenance/photo-gallery.tsx`
2. `apps/web/components/dashboard/maintenance/__tests__/photo-gallery.test.tsx` (new or extended)

## 6. Implementation requirements
1. Render the viewer with `createPortal(…, document.body)` (client only; nothing on the server render). It covers the full
   viewport, respects `env(safe-area-inset-*)`, sits above the tab bar, locks background scroll while open, closes on the
   X button and on Escape, and returns focus to the thumbnail that opened it. Keep the existing previous/next buttons.
2. The image fits the screen without scrolling (`object-contain`, max height = viewport minus header and footer).
3. Add a button below the image: label `Save photo`, title `Save or share this photo.` On click: `fetch(photo.url)`, make a
   `blob:` URL, click a temporary `<a href={blobUrl} download={photo.fileName}>`, then revoke the URL after a short delay.
   While working, show `Saving...` and disable it; on any failure show `Could not save the photo. Try again.` under the
   button (no `alert`). Tap target ≥ 44 px; readable in light and dark.
4. Do not add `-webkit-touch-callout: none` or anything that blocks the system long-press menu on the image.
5. Plain language, ≤ 12 words per sentence. Lines ≤ 140. No new dependencies.

## 7. Validation commands
```
cd apps/web && npx vitest run components/dashboard/maintenance --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web`. Claude walks it on the iPhone Simulator.

## 8. Acceptance criteria
1. Opening a photo renders the viewer as a child of `document.body` (not inside the gallery's DOM subtree); Escape and the
   X close it and return focus to the thumbnail; `document.body` scroll is locked while open and restored after.
2. `Save photo` fetches the photo URL once, clicks an anchor whose `download` equals the file name and whose `href` starts
   with `blob:`, and revokes that URL; a rejected fetch shows `Could not save the photo. Try again.` and re-enables the button.
3. Existing gallery behavior (thumbnails, delete button for allowed users, previous/next) stays green.
4. (Claude) Simulator, light and dark: the viewer covers the screen above the tab bar with the whole image visible;
   `Save photo` opens the share sheet with "Save Image".

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include "Claude prompt"
or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No server or database changes.
