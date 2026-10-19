# Sprint 242b — Brand mark: doorway app icon, splash and web icons (iPhone tier) — rev 1

## 1. Objective
Replace the blue house icon with the owner-approved graphite **doorway** mark everywhere the app shows its icon: iOS app
icon, iOS splash (light + dark), web favicon, Apple touch icon, PWA icons and the Open Graph image. Spec:
`docs/design/domus-design-system.md` §6. Look only.

## 2. Context
- HEAD: latest `main`.
- Master art `apps/ios/resources/icon.svg` (4 lines): blue `#1D4ED8` rounded rect (`rx=224`) + one white house `<path>`.
- `apps/ios/scripts/assets.mjs` (`npm run assets` in `apps/ios` = `node scripts/assets.mjs && capacitor-assets generate --ios`):
  - flattens `icon.svg` on `#1D4ED8` to `resources/icon-only.png` and to web icons in `apps/web/public/icons/`
    (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`);
  - builds `resources/splash.png` (`#FFFFFF` ground, blue glyph) and `splash-dark.png` (`#121316`, white glyph) by
    regex-extracting the FIRST `<path …/>` from the SVG (`:17`) and replacing `#FFFFFF` with the foreground.
  - `capacitor-assets generate --ios` then writes `ios/App/App/Assets.xcassets/AppIcon.appiconset` and `Splash.imageset`.
- `apps/ios/capacitor.config.ts`: `SplashScreen.backgroundColor: "#FFFFFF"`.
- Web: `apps/web/app/icon.tsx` (32×32 `ImageResponse`, purple gradient + "D"), `app/apple-icon.tsx` (40 lines, same
  style), `app/opengraph-image.tsx` (79 lines).
- Apple requires the app icon to be a full-bleed square with no transparency (iOS applies the mask).

## 3. In scope
New master SVG; the asset script's colors and mark extraction; regenerated PNGs and asset catalogs; the three web icon
routes; the Capacitor splash background; tests.

## 4. Out of scope
Any screen UI, colors in `globals.css` (242a), `LaunchScreen.storyboard`, `LaunchSplashGate.swift`, `Info.plist`,
`project.pbxproj`, build numbers, uploading.

## 5. Exact files expected to change
1. `apps/ios/resources/icon.svg`
2. `apps/ios/scripts/assets.mjs`
3. `apps/ios/scripts/assets.test.mjs` (new)
4. Generated: `apps/ios/resources/icon-only.png`, `splash.png`, `splash-dark.png`;
   `apps/ios/ios/App/App/Assets.xcassets/AppIcon.appiconset/*`, `Splash.imageset/*`;
   `apps/web/public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`
5. `apps/ios/capacitor.config.ts` (splash background only)
6. `apps/web/app/icon.tsx`, `apps/web/app/apple-icon.tsx`, `apps/web/app/opengraph-image.tsx`
7. `apps/web/app/__tests__/brand-icons.test.tsx` (new)

## 6. Implementation requirements
1. **`icon.svg`** — exactly this (full-bleed square, no `rx`):
   ```
   <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
     <rect width="1024" height="1024" fill="#0B0C0E"/>
     <g id="mark" transform="translate(204 166) scale(5.6)">
       <path d="M33 92 V50 A22 22 0 0 1 77 50 V92" fill="none" stroke="#FFFFFF" stroke-width="7"/>
       <path d="M20 92 H90" fill="none" stroke="#FFFFFF" stroke-width="7"/>
       <circle id="knob" cx="66" cy="70" r="4" fill="#8DA2F0"/>
     </g>
   </svg>
   ```
2. **`assets.mjs`** — flatten color `#0B0C0E` (was `#1D4ED8`) for every PNG. Splash: extract the whole
   `<g id="mark" …>…</g>` group (not the first path); light splash `#F3F4F6` ground with the mark's strokes in
   `#0B0C0E` (knob stays `#8DA2F0`); dark splash `#0E0F11` ground with white strokes (knob `#8DA2F0`). Keep the splash
   canvas 2732×2732 and center the mark at about 38% of the canvas width. Fail loudly (throw) if `id="mark"` is missing.
   Export the pure SVG-building functions (`buildSplashSvg(source, background, foreground)`) so they can be tested; the
   script still runs top-level when executed directly.
3. Run `npm run assets` in `apps/ios` to regenerate every file in §5.4. If the sandbox cannot run it, say so in the
   report; Claude runs it.
4. **`capacitor.config.ts`** — `SplashScreen.backgroundColor: "#F3F4F6"`. Nothing else in that file changes.
5. **Web icons** — `icon.tsx` (32×32) and `apple-icon.tsx` (keep its current size): `#0B0C0E` square, the doorway as an
   inline `<svg>` (two white stroked paths, no knob below 120 px), centered at ~62% of the tile. `opengraph-image.tsx`:
   keep its size, text and layout; change the background to `#0B0C0E`, text to `#FFFFFF`/`#A5ABB4`, and replace any old
   mark with the doorway (white, with the knob). No gradients anywhere.

## 7. Validation commands
```
cd apps/ios && node --test scripts/assets.test.mjs && node scripts/config.test.cjs && bash -n scripts/testflight.sh
(cd apps/web && npx vitest run app/__tests__/brand-icons.test.tsx)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
cd apps/ios/ios/App && xcodebuild test -project App.xcodeproj -scheme App -destination 'platform=iOS Simulator,name=iPhone 18 Pro'
```
If `xcodebuild` or `npm run assets` cannot run in your sandbox, say so; Claude runs them. Do NOT run `npm run gate:web`.

## 8. Acceptance criteria
1. `assets.test.mjs` "master icon is full-bleed graphite": `icon.svg` has no `rx`, width/height 1024, a `#0B0C0E` rect and
   a `g#mark` with exactly two paths and one `circle#knob`.
2. Same file, "splash uses the whole mark": `buildSplashSvg(src, "#F3F4F6", "#0B0C0E")` contains both doorway paths with
   stroke `#0B0C0E`, the knob `#8DA2F0`, and the `#F3F4F6` ground; the dark variant uses `#FFFFFF` strokes on `#0E0F11`;
   a source without `id="mark"` throws.
3. Same file, "generated PNGs are opaque and sized" (uses `sharp` metadata on the committed files): `icon-only.png` is
   1024×1024 with `hasAlpha === false`; `apple-touch-icon.png` 180×180, `icon-512.png` 512×512 without alpha;
   `splash.png` 2732×2732; the AppIcon set's 1024 image has no alpha.
4. `brand-icons.test.tsx`: rendering the element returned inside `icon.tsx` / `apple-icon.tsx` (mock `next/og`'s
   `ImageResponse` to capture its first argument) yields a root with background `#0B0C0E`, contains an `svg` with two
   `path` elements, and no `linear-gradient` anywhere in the tree; `opengraph-image.tsx` likewise has no `linear-gradient`
   and a `#0B0C0E` background.
5. All existing web tests, `config.test.cjs` and all `AppTests` pass.

## 9. Report format
Status; files changed (generated files may be listed by folder); test names; command results; whether `npm run assets`
and `xcodebuild` ran. Token usage.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies (`sharp` and `@capacitor/assets` are already installed in `apps/ios`).
- Do not touch `build-number.txt`, signing files, or run `testflight.sh`.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
  user needs to think about what to do, the UI needs to be clearer.
