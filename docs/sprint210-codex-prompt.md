# Sprint 210 (rev 2) — iPhone app, part 1: Capacitor shell for domusbase.com (L3 by owner exception) · Platform / Phone app

ChatGPT reviewed rev 1 and returned REJECT. Every required item is adopted in this revision, and the optional ones too, except the in-app Safari sheet for links (see §3.2).

## 1. Objective
Create a native iPhone app named **Domus** that runs the live Domus web app (https://domusbase.com) inside a Capacitor 8 iOS shell, so Alia and owners use Domus as a real app.

This sprint delivers:
- the project, icon, launch screen and status bar;
- an authoritative native navigation policy;
- working **file downloads** (PDF/CSV) and **repair-photo uploads**;
- an offline screen;
- the web app knowing it's inside the app.

It must build and run on the iOS Simulator.

**This sprint is NOT App Store submission-ready.** Before submission, a separately reviewed App Store sprint must demonstrate meaningful app-specific utility beyond the website (Guideline 4.2):
- biometric re-entry;
- native push with actionable routing;
- native photo capture and upload;
- native file and share flows;
- universal links.

That sprint must also document them for App Review, provide a reviewer account, and verify all major workflows on a physical iPhone.

## 2. Context (HEAD main)
- **Web app:** Next.js 15 in `apps/web` (npm workspace `@domus/web`), deployed at https://domusbase.com. It renders on the server and uses server actions, so it **cannot** be bundled or statically exported into the app.
  - Auth: Supabase email/password with httpOnly cookies on domusbase.com. There's no OAuth.
  - Payments: Stripe Checkout redirects to `checkout.stripe.com` and returns to `https://domusbase.com/...`. Connect onboarding goes to `connect.stripe.com`.
  - Downloads: owner statement PDF `/api/pdf/owner-statement`, CSV `/api/owner-statement/csv`, other `/api/pdf/*` receipts, and the account export `/api/account/export`. They all respond with `Content-Disposition: attachment`. Some UI CSV exports may use `blob:` URLs (check `lib/csv-export*.ts` `downloadReportCsv`).
  - Repair photos: `<input type="file" accept="image/*">` (check `components/` for maintenance photo upload).
  - `app/layout.tsx`: `viewportFit: "cover"`, `appleWebApp`, `manifest`, `themeColor: "#7c3aed"` (outdated).
  - Safe-area insets are already used in the bottom bars, drawers and sidebar.
  - `components/pwa/install-prompt.tsx` registers `public/sw.js` and shows an install prompt.
  - `public/icons/` is empty.
- **Old app:** `apps/mobile` is an archived Expo app. Don't touch it.
- **Root workspaces:** `["apps/web"]`. Keep the iOS project **out** of them.
- **Machine:** macOS 26.6, Node 24. Xcode is being installed. Claude runs the Simulator builds. Capacitor 8 requires **iOS 15.0** and **Xcode 26+**. Use Swift Package Manager (no CocoaPods).
- **Versions (npm, 2026-10-09):** `@capacitor/core`, `cli` and `ios` 8.5.3; `app` 8.1.2; `splash-screen` 8.0.2; `status-bar` 8.0.4; `@capacitor/assets` 3.0.5.
- **ARCHITECTURE EXCEPTION (owner-approved 2026-10-09):** production uses `server.url = "https://domusbase.com"`. Capacitor documents `server.url` and `allowNavigation` as intended for live reload, not production. This is a deliberate exception, because Domus is server-rendered.
  - **Do not "fix" it** by bundling or exporting the Next.js app, or by changing the architecture.
  - Document the exception in `apps/ios/README.md`.

## 3. In scope

### 1. Project `apps/ios`
Its own `package.json` (`@domus/ios`, private) and lockfile; not a root workspace.
- **Dependencies:** `@capacitor/core`, `@capacitor/ios`, `@capacitor/app`, `@capacitor/splash-screen`, `@capacitor/status-bar`.
- **Dev dependencies:** `@capacitor/cli`, `@capacitor/assets` (plus `sharp` only if needed).
- **Scripts:** `sync`, `open`, `assets`.
- **`capacitor.config.ts`:**
  - `appId: "com.domusbase.app"`, `appName: "Domus"`, `webDir: "www"`.
  - `server: { url: process.env.CAP_SERVER_URL ?? "https://domusbase.com", cleartext: false, errorPath: "offline.html", allowNavigation: [<§3.2 list>] }`.
    - `CAP_SERVER_URL` may only be `https://*` or `http://localhost` / `http://127.0.0.1` (throw otherwise).
  - `ios: { contentInset: "never", appendUserAgent: "DomusApp/1", limitsNavigationsToAppBoundDomains: false }`. **Do not set `ios.scheme`.** The Xcode scheme stays `App`.
  - `plugins.SplashScreen`: `launchAutoHide: true`, `launchShowDuration: 1500`, `backgroundColor: "#FFFFFF"`. The splash simply auto-hides after 1.5 s; there's no readiness signal.
  - `plugins.StatusBar`: `overlaysWebView: true`, `style: "DEFAULT"` (follows the system light/dark setting).
- **Deployment target:** iOS 15.0. **Device family:** iPhone only. Portrait only.
- **`www/offline.html`** (and a minimal `www/index.html` that redirects to it):
  - plain HTML/CSS in Domus colors, with the Domus wordmark;
  - copy `No internet right now.` / `Check your connection, then try again.` and a `Try again` button that loads https://domusbase.com;
  - light and dark via `prefers-color-scheme`; tap target ≥ 44 px.
- **Icon:** `resources/icon.svg`, a rounded-square `#1D4ED8` background with a simple white house glyph (no text, no gradient), rendered to an **opaque** 1024 PNG.
  - **Splash:** the same glyph on `#FFFFFF`, with a dark variant on `#121316`.
  - Generate everything with `@capacitor/assets` into the asset catalog.
- **`ios/App`:** generated by `npx cap add ios`, then customized as below and kept in the repo.

### 2. Authoritative navigation policy (native, not a DOM script)
- **Rule:** Capacitor's native `allowNavigation` + WKNavigationDelegate decide every **top-level** navigation. That covers links, `location` changes, 30x redirects, form posts, `window.open` and `target="_blank"`. Subframes and resources aren't restricted.
- **Stays in the app** (top-level, exact hosts; parsed hostnames only, no suffix matching):
  - `domusbase.com`;
  - `checkout.stripe.com`;
  - `hooks.stripe.com` (3-D Secure and redirect returns);
  - `pay.stripe.com`.
- **Leaves the app** (Capacitor's default): every other `http(s)` destination, including `connect.stripe.com` and `www.domusbase.com` if it isn't canonical, opens in **Safari**.
  - Owners do Stripe Connect onboarding in Safari and return to the app themselves. When the app comes back to the foreground, it reloads the current page. Use `@capacitor/app` `appStateChange` in a tiny native or bridge hook, or an `AppDelegate` `applicationWillEnterForeground` reload, but **only** when the current URL path starts with `/owner/settings` or `/connect/`.
- **System handlers:** `mailto:`, `tel:` and `sms:` go to the system.
- **Everything else:** other custom schemes are rejected. Implement this in the smallest native override if Capacitor doesn't already do it, and test it.
- **No `@capacitor/browser`** and no in-app Safari sheet in this sprint.
- **Ruled out by design:** `domusbase.com.evil.example`, other subdomains of `domusbase.com`, and protocol-relative or malformed URLs are never treated as in-app hosts.
- Put the policy in one Swift file (for example `ios/App/App/NavigationPolicy.swift`, a pure function `decide(url:isMainFrame:) -> .allowInApp | .openExternal | .system | .reject`).
  - Unit-test it with XCTest (`AppTests` target) for every case listed in §8.
  - Wire it into a `CAPBridgeViewController` subclass or Capacitor's navigation hook. Say which.

### 3. Downloads (native)
- Responses with `Content-Disposition: attachment`, a `text/csv` or `application/pdf` MIME type, or a `blob:` download go through a `WKDownloadDelegate` (iOS 15+). The file saves to a temporary file named from the server filename, then the **iOS share sheet** opens (`UIActivityViewController`), so the user can Save to Files, AirDrop, Mail and so on.
- Downloads must use the WKWebView's own session (cookies), so authenticated routes work.
- Cancelling the share sheet or failing a download shows nothing broken: the web view stays on its page. A failure shows a native alert `Download failed. Try again.`
- If the web app creates CSVs with `blob:` URLs and WKWebView can't hand them to the delegate, **instead** change `downloadReportCsv` (web) so that in the app (`isNativeApp()` on the client) it posts the CSV text to a tiny native message handler that shares it. Document which path you used.

### 4. Repair photos
- The existing repair-photo `<input type="file" accept="image/*">` must work in the app: choose from the photo library, and take a photo if the input offers capture.
- Add **only** `NSCameraUsageDescription` = `Take photos of problems to send to your landlord.` (the photo library picker needs no permission string).
- No other permission strings.

### 5. The web app knows it's inside the app (`apps/web`)
- `lib/native-app.ts`: `isNativeApp(userAgent)` checks for `DomusApp/`. There's a server variant using `headers()` and a client variant using `navigator.userAgent`.
- **Rule:** `isNativeApp()` is presentation/runtime detection only. It's **never a security boundary**: it must not grant authorization, widen data access, bypass CSRF or RLS, change payment authorization, expose secrets, or enable privileged server behavior. Put a comment saying so in the helper.
- In the app:
  - don't register `sw.js`, and hide the PWA install prompt;
  - add `class="domus-native"` to `<html>` from the server via the user-agent header, so there's no flash;
  - in `globals.css`, `.domus-native` turns off the long-press callout on links and buttons and the tap highlight. No other visual change.
- **Everywhere:** set `themeColor` to `[{ media: "(prefers-color-scheme: light)", color: "#FBFBF9" }, { media: "(prefers-color-scheme: dark)", color: "#121316" }]`. Set `manifest.json` `theme_color` to `#FBFBF9`.
- **Icons:** add `icons` (192, 512, maskable 512) and an `apple-touch-icon` (180) from the same SVG into `public/icons/`, referenced in the metadata.

### 6. Documentation
`apps/ios/README.md` covers:
- the architecture exception;
- the navigation table;
- download and photo behavior;
- how to sync, open and run on the Simulator;
- `CAP_SERVER_URL`;
- the 4.2 statement from §1.

## 4. Out of scope
- Face ID, push, universal links, App Store submission, signing.
- Android.
- Offline data.
- Auth, payment or server changes beyond §3.5 (and §3.3's fallback, if needed).
- `apps/mobile`.
- No DB, deploy, commit or push.
- No Apple team ID.

## 5. Exact files expected to change
New:
- `apps/ios/**`: `package.json`, lockfile, `capacitor.config.ts`, `www/offline.html`, `www/index.html`, `resources/*`, `README.md`
- `ios/App/**`: generated, plus `NavigationPolicy.swift`, the bridge view controller subclass, the download handler, `AppTests`, assets, and the `Info.plist` change
- `apps/web/lib/native-app.ts`
- `apps/web/public/icons/*`
- tests

Changed:
- `apps/web/app/layout.tsx`
- `apps/web/app/globals.css`
- `apps/web/components/pwa/install-prompt.tsx`
- `apps/web/public/manifest.json`
- `apps/web/lib/csv-export*.ts` (only for §3.3's fallback)
- root `.gitignore` (`apps/ios/node_modules`, `apps/ios/ios/App/build`, `DerivedData`, `xcuserdata`)

Name any other file and give the reason.

## 6. Implementation requirements
- **The user should never need to read instructions to use the app. Every step must be self-explanatory.**
- Plain-language copy: sentences ≤ 12 words.
- No secrets in the native project.
- No new web dependencies.
- Lines ≤ 140 in TS/TSX; Swift formatted with the standard 4-space style.
- Reproducible: `cd apps/ios && npm ci && npx cap sync ios` works on a clean checkout.
- **Before relying on Capacitor runtime globals** (`window.Capacitor`), confirm they exist in the generated Capacitor 8 shell. Prefer native implementations over web-side bridges.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- New and affected web tests
- `npm run build --workspace @domus/web`
- `cd apps/ios && npm ci && npx cap sync ios`
- If Xcode is available:
  - `xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug build`
  - `xcodebuild test -scheme App -destination 'platform=iOS Simulator,name=iPhone 17'`
- Otherwise report `xcode_unavailable: true`.

## 8. Acceptance criteria (binary)
1. `apps/ios` matches §3.1 exactly: no `ios.scheme`, iOS 15.0, iPhone only, portrait, opaque 1024 icon. `npm ci` and `cap sync` succeed. No build output or user data is kept.
2. **`NavigationPolicy` XCTest** covers each of these:
   - `https://domusbase.com/owner` → in app;
   - `https://checkout.stripe.com/c/pay/x`, `hooks.stripe.com` and `pay.stripe.com` → in app;
   - `https://connect.stripe.com/...` → external;
   - `https://example.com` → external;
   - `https://domusbase.com.evil.example` → external;
   - `https://evil.domusbase.com` → external;
   - `http://domusbase.com` → reject (https only);
   - `mailto:`, `tel:`, `sms:` → system;
   - `javascript:` and a custom scheme → reject;
   - a malformed URL → reject;
   - a non-main-frame resource → allow.
3. **Download handler unit tests**: the filename comes from `Content-Disposition`; PDF and CSV MIME types are detected; a non-attachment HTML response is not treated as a download. The share-sheet presentation is behind a protocol so it can be tested.
4. **Info.plist** has `NSCameraUsageDescription` with the exact string and no other usage strings.
5. **Web tests:**
   - `isNativeApp` (server and client);
   - no SW registration or install prompt in the app; unchanged in a normal browser;
   - `domus-native` class only in the app;
   - theme colors and manifest icons;
   - if used, the §3.3 CSV native path, and the normal browser download path unchanged.
6. Lint, typecheck, web tests and the web build pass. Xcode build and test results are reported, or `xcode_unavailable`.

## 8b. Post-implementation (Claude, Simulator; all are gates)
1. Build and run on an iPhone 17 Simulator with the live panel. Check the icon and splash, and that the login page sits correctly under the status bar, in light and dark.
2. **Session persistence:**
   - sign in, force-quit, relaunch: still signed in;
   - sign out, force-quit, relaunch: still signed out;
   - after a Stripe Checkout round trip (smoke tenant, test card, if a payable rent exists; otherwise skip and say so): still signed in.
3. **Walks** for the smoke owner, manager and tenant: Home, Rent, Clients, Messages. Download an owner statement PDF and CSV, and see the share sheet. Attach a repair photo from the library.
4. **Links:** `mailto:` opens Mail; an external link opens Safari; connect.stripe.com opens Safari.
5. **Offline:**
   - airplane mode before launch → offline page; turn the network back on, then Try again → loads;
   - unreachable host via `CAP_SERVER_URL=https://domusbase.invalid` → offline page;
   - drop the connection after load, then navigate → error handling is acceptable (record it).
6. Deploy the web changes, then run smoke, CI and Sentry.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Include:
- `xcode_unavailable`;
- the navigation hook used;
- the download path used (delegate or CSV fallback);
- the foreground-reload mechanism;
- the deployment target;
- the device family.

Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, deploy, commit or push. Never touch `.claude/launch.json` or `apps/mobile`. Notifications stay OFF. Don't sign the app or add any Apple team ID.
