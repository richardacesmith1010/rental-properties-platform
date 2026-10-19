# Sprint 242b — Brand mark: doorway app icon, splash and web icons (iPhone tier) — rev 2 (rev 1 ChatGPT APPROVE WITH CHANGES folded in)

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
- `apps/ios/capacitor.config.ts`: `SplashScreen.backgroundColor: "#FFFFFF"` — Capacitor 8 documents this as Android-only; the
  iOS splash comes from `Splash.imageset` (light entries + `luminosity: dark` entries at 1x/2x/3x).
- Web favicon: there is NO `apps/web/app/favicon.ico` (checked 2026-10-18); `app/layout.tsx:53-58` `metadata.icons`
  points at `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/apple-touch-icon.png` (regenerated here) plus the
  `icon.tsx` / `apple-icon.tsx` routes.
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
2. **`assets.mjs`** — flatten color `#0B0C0E` (was `#1D4ED8`) for every PNG. Splash: extract the INNER content of the
   `<g id="mark" …>…</g>` group (its two paths and the knob circle, not the icon's transform) and place it on the
   2732×2732 canvas inside exactly `<g id="mark" transform="translate(596 502) scale(14)">` (mark ≈ 980 px wide, centered).
   Recolor ONLY the `stroke` attributes of the two `path` elements (light: `#0B0C0E`, dark: `#FFFFFF`); never a global
   string replace; the knob keeps `fill="#8DA2F0"`. Grounds: light `#F3F4F6`, dark `#0E0F11`. Throw if `id="mark"` is
   missing. Running `npm run assets` twice must produce no further file changes.
   Export the pure SVG-building functions (`buildSplashSvg(source, background, foreground)`) so they can be tested; the
   script still runs top-level when executed directly.
3. Run `npm run assets` in `apps/ios` to regenerate every file in §5.4. If the sandbox cannot run it, say so in the
   report; Claude runs it.
4. **`capacitor.config.ts`** — `SplashScreen.backgroundColor: "#F3F4F6"` for cross-platform consistency only (Android).
   It is not an iOS acceptance item. Nothing else in that file changes.
5. **Web icons** — `icon.tsx` (32×32) and `apple-icon.tsx` (keep its current size): `#0B0C0E` square, the doorway as an
   inline `<svg>` (two white stroked paths, no knob below 120 px), centered at ~62% of the tile. `opengraph-image.tsx`:
   keep its size, text and layout; change the background to `#0B0C0E`, text to `#FFFFFF`/`#A5ABB4`, and replace any old
   mark with the doorway (white, with the knob). No gradients, no old colors (`#1D4ED8`, `#4f46e5`, `#7c3aed`) and no
   "D" letter mark anywhere in the three routes. Use only Satori-supported SVG (`svg`, `path`, `circle`, plain attributes).
6. **Favicon audit** — confirm in the report that `apps/web/app/favicon.ico` and `apps/web/public/favicon.ico` do not
   exist and that every `metadata.icons` URL in `app/layout.tsx` points at a file regenerated in this sprint.

## 7. Validation commands
```
cd apps/ios && node --test scripts/assets.test.mjs && node scripts/config.test.cjs && bash -n scripts/testflight.sh
(cd apps/web && npx vitest run app/__tests__/brand-icons.test.tsx)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
cd apps/ios/ios/App && xcodebuild test -project App.xcodeproj -scheme App -destination 'platform=iOS Simulator,name=iPhone 18 Pro'
```
If `xcodebuild` or `npm run assets` cannot run in your sandbox, say so; Claude runs them (and re-runs `npm run assets`
once more to prove `git status` shows no new changes). Do NOT run `npm run gate:web`.

## 8. Acceptance criteria
1. `assets.test.mjs` "master icon is full-bleed graphite": `icon.svg` has no `rx`, width/height 1024, a `#0B0C0E` rect and
   a `g#mark` with exactly two paths and one `circle#knob`.
2. Same file, "splash SVG is exact": `buildSplashSvg(src, "#F3F4F6", "#0B0C0E")` contains the transform
   `translate(596 502) scale(14)`, both doorway paths with `stroke="#0B0C0E"`, the knob with `fill="#8DA2F0"`, and the
   `#F3F4F6` ground; the dark variant has `#FFFFFF` strokes on `#0E0F11`; a source whose only other white is a future
   `fill="#FFFFFF"` element keeps that fill unchanged; a source without `id="mark"` throws.
3. Same file, "every AppIcon catalog image is right": parse `AppIcon.appiconset/Contents.json`; for EVERY entry with a
   `filename`: the file exists, its pixel size equals the entry's `size` × `scale` (or 1024 for single-size entries), and
   `hasAlpha === false` (sharp metadata); its corner pixel is `#0B0C0E`. No file in the folder is unreferenced.
4. Same file, "splash catalog is wired for light and dark": parse `Splash.imageset/Contents.json`; for each of 1x/2x/3x there
   is one entry without `appearances` and one with `{"appearance":"luminosity","value":"dark"}`; every referenced file
   exists, is opaque, and its corner pixel is `#F3F4F6` (light entries) or `#0E0F11` (dark entries); the center pixel
   region contains the mark color (`#0B0C0E` light / `#FFFFFF` dark) somewhere on the mark's baseline row.
5. Same file, "web PNGs are graphite": `apps/web/public/icons/icon-192.png` 192×192, `icon-512.png` and
   `icon-maskable-512.png` 512×512, `apple-touch-icon.png` 180×180; all opaque with corner pixel `#0B0C0E`;
   `resources/icon-only.png` 1024×1024 opaque.
6. `brand-icons.test.tsx`: for `icon.tsx`, `apple-icon.tsx` and `opengraph-image.tsx` (mock `next/og` to capture the
   element): root background `#0B0C0E`, an `svg` with two `path` elements, and none of `linear-gradient`, `#1D4ED8`,
   `#4f46e5`, `#7c3aed`, or a text node equal to `D` anywhere in the tree. Also, if the real `ImageResponse` can run in
   Vitest's node environment, one unmocked test per route asserts a 200 PNG response; if it cannot, say so in the report
   (Claude's `npm run gate:web` production build exercises the real routes).
7. All existing web tests, `config.test.cjs` and all `AppTests` pass.

## 9. Report format
Status; files changed (generated files may be listed by folder); test names; command results; whether `npm run assets`
and `xcodebuild` ran. Token usage.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies (`sharp` and `@capacitor/assets` are already installed in `apps/ios`).
- Do not touch `build-number.txt`, signing files, or run `testflight.sh`.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
  user needs to think about what to do, the UI needs to be clearer.
