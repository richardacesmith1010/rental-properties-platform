# Sprint 241a — IOS-4: iPhone status bar follows the Domus theme (L3, iPhone app + web) — rev 2 (rev 1 ChatGPT APPROVE WITH CHANGES → 2 required + 2 optional folded in)

## 1. Objective
When the Domus theme (Settings → Appearance: Light / Dark / System) differs from the iPhone's own light/dark setting, the
status bar text (clock, battery) uses the iPhone's setting and becomes unreadable (dark text on the dark theme or white
text on the light theme). Make the native app's appearance follow the Domus theme so the status bar always matches.

## 2. Context
- HEAD: latest `main`. iOS app: Capacitor 8 shell loading `https://domusbase.com` (`apps/ios/capacitor.config.ts`,
  `StatusBar: { overlaysWebView: true, style: "DEFAULT" }`, `UIViewControllerBasedStatusBarAppearance` in `Info.plist:60`).
  With style DEFAULT the status bar follows the window's interface style, which today follows the iPhone setting.
- Web theme: `apps/web/lib/theme.ts` — `ThemePreference = "light" | "dark" | "system"`, stored in `localStorage["domus-theme"]`,
  applied by `applyTheme` (`:59-66`, sets/removes `data-theme` on `<html>`) and `setTheme` (`:68-74`). Before hydration
  `apps/web/app/layout.tsx:20-43` (`themeInitScript`) applies the stored theme.
- Native message pattern (copy it): `DomusBridgeViewController.swift:99-101` registers `domusShareCsv`, `domusFaceId`,
  `domusPlaidLink` on `DomusNavigationDelegate`; `DomusNavigationDelegate.handleMessage` (`:305-318`) first checks
  `MessageProvenance.accepts` (main frame, https, host `domusbase.com`, port 443/0, trusted current URL), then parses a
  typed request (`FaceIdRequest` `:330-347` validates every field). Web side pattern: `components/settings/face-id-settings.tsx:8-23`
  (`window.webkit?.messageHandlers?.domusFaceId`, only when `isNativeApp()`).
- Windows: `SceneDelegate.swift:10-15` creates the app window and sets `bridge.appWindow`; the Face ID lock uses a second
  window `AppLockController.lockWindow` (`AppLockController.swift:8,42`). The launch cover (`LaunchSplashGate.swift:164-167`)
  uses `.unspecified` and is out of scope.
- WKWebView's `prefers-color-scheme` follows the window's trait collection. With "system" the window must stay
  `.unspecified` so iOS light/dark changes still flow to the page.
- The Xcode project does NOT use synchronized folders: new `.swift` files would need `project.pbxproj` edits. Put new
  Swift code in existing files only (see §5).

## 3. In scope
A `domusTheme` message from the page to the native app; the native app applies it to its windows, remembers it for the
next cold launch, and refreshes the status bar. Tests on both sides.

## 4. Out of scope
The launch cover / splash, `capacitor.config.ts`, `Info.plist`, `project.pbxproj`, the @capacitor/status-bar plugin, any
theme colors or CSS, the Settings UI, Android, the web app outside the two web files in §5.

## 5. Exact files expected to change
1. `apps/ios/ios/App/App/DomusNavigationDelegate.swift` — `ThemeRequest` type + route `domusTheme` to a new `onTheme` callback.
2. `apps/ios/ios/App/App/DomusBridgeViewController.swift` — register the handler; apply + persist the theme.
3. `apps/ios/ios/App/App/SceneDelegate.swift` — apply the remembered theme to the new window before it is shown.
4. `apps/ios/ios/App/AppTests/MessageProvenanceTests.swift` — native tests (§8.1-8.4).
5. `apps/web/lib/theme.ts` — tell the native app on every `applyTheme`.
6. `apps/web/app/layout.tsx` — imports the boot script from `lib/theme.ts` (no other change).
7. `apps/web/lib/__tests__/theme.test.ts` — web tests (§8.5-8.7).

## 6. Implementation requirements
### Native
1. `ThemeRequest` (in file 1, next to `FaceIdRequest`): `init?(body: Any)` accepts only a dictionary with exactly the key
   `theme` whose value is one of `"light"`, `"dark"`, `"system"`; anything else returns nil. Properties
   `let theme: String` (the validated raw value) and `var interfaceStyle: UIUserInterfaceStyle` (light → `.light`,
   dark → `.dark`, system → `.unspecified`).
2. `DomusNavigationDelegate.handleMessage`: add `else if name == "domusTheme", let request = ThemeRequest(body: body)
   { onTheme?(request) }` after the provenance check (the check stays first and unchanged). Add `var onTheme:
   ((ThemeRequest) -> Void)?` like `onFaceId`.
3. Theme store (in file 2): `enum ThemeStore { static let key = "domus.themePreference" }` with
   `static func save(_ value: String, defaults: UserDefaults = .standard)` and
   `static func load(defaults: UserDefaults = .standard) -> UIUserInterfaceStyle` (missing or invalid → `.unspecified`;
   re-validate through `ThemeRequest(body: ["theme": stored])`).
4. In `DomusBridgeViewController`: register `webView.configuration.userContentController.add(handler, name: "domusTheme")`
   next to the other three; set `handler.onTheme = { [weak self] in self?.applyTheme($0) }`. `applyTheme(_ request:)` sets
   `overrideUserInterfaceStyle = request.interfaceStyle` on `appWindow` and on `appLockController?.lockWindow` (if any),
   saves `request.theme` with `ThemeStore.save`, and calls `setNeedsStatusBarAppearanceUpdate()`. Always set the lock
   window first (when it exists and differs). Then skip the remaining work only when ALL hold: `appWindow` already has
   `request.interfaceStyle`, the stored value already equals `request.theme`, and the lock window is nil or already has
   `request.interfaceStyle`. A repeated same-theme request must therefore still repair a mismatched lock window.
5. `SceneDelegate`: right after creating `window`, set `window?.overrideUserInterfaceStyle = ThemeStore.load()` so a cold
   launch shows the right status bar before the page loads. Nothing else in SceneDelegate changes.
6. When the lock window is created later, it must match: in `DomusBridgeViewController`, wherever the lock controller
   installs its window is out of reach, so instead re-apply the stored style to `appLockController?.lockWindow` in the
   existing `lockWindowShown(_:)` observer (`:108`) before `yieldLaunchCoverToLock`. Do not change `AppLockController`.

### Web
7. `lib/theme.ts`: add `notifyNativeTheme(theme: ThemePreference): void` (exported). It calls
   `window.webkit?.messageHandlers?.domusTheme?.postMessage({ theme })` only when that handler exists, inside try/catch
   (never throws). `applyTheme` calls it at the end for every value, including "system". No other behavior change.
8. Move the boot script: `themeInitScript` moves from `app/layout.tsx:20-43` into `lib/theme.ts` as an exported `const
   THEME_INIT_SCRIPT` with the same text, plus, after applying the theme and inside the existing `try`:
   `window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.domusTheme &&
   window.webkit.messageHandlers.domusTheme.postMessage({ theme: theme });`. `layout.tsx` imports it and uses it where it
   used `themeInitScript` (`:106`). Next.js forbids extra exports from `layout.tsx`, so export nothing new there.
9. Lines ≤ 140 characters. No new dependencies.

## 7. Validation commands
```
(cd apps/web && npx vitest run lib/__tests__/theme.test.ts)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
cd apps/ios/ios/App && xcodebuild test -project App.xcodeproj -scheme App -destination 'platform=iOS Simulator,name=iPhone 18 Pro'
```
If `xcodebuild` cannot run in your sandbox, say so in the report; Claude runs it. Do NOT run `npm run gate:web`.

## 8. Acceptance criteria (each a named test asserting on real code)
1. `testThemeRequestAcceptsOnlyKnownValues`: nil for `"dark"`, `[:]`, `["theme": "sepia"]`, `["theme": 1]`,
   `["theme": "dark", "extra": 1]`; non-nil for each of light/dark/system with the right `interfaceStyle`.
2. `testThemeMessageIgnoredFromUntrustedOrigin`: calling `handleMessage(name: "domusTheme", body: ["theme": "dark"], …)`
   with a subframe, http, or another host never calls `onTheme`; the trusted main frame calls it exactly once with dark.
3. `testThemeStoreRoundTripAndFallback`: with a fresh `UserDefaults(suiteName:)`, `load` is `.unspecified`; after
   `save("dark")` it is `.dark`; after writing `"sepia"` directly under the key it is `.unspecified`.
4. `testApplyThemeSetsWindowsAndPersists`: a `DomusBridgeViewController` with a test `appWindow` and test defaults (inject
   defaults through a property, default `.standard`) → `applyTheme(dark)` sets the window to `.dark` and stores "dark";
   `applyTheme(system)` sets `.unspecified` and stores "system". Attach a controller/view to the test window as its root
   (make it visible) and assert the effective trait: after dark, that view's `traitCollection.userInterfaceStyle == .dark`;
   after light, `.light`. For system assert only the override is `.unspecified` (do not assert the Simulator's own trait).
4b. `testRepeatedThemeRepairsMismatchedLockWindow`: give the controller a lock window (inject through a test seam, e.g. an
   internal `lockWindowProvider` closure defaulting to `appLockController?.lockWindow`), apply dark, then set the lock
   window to `.light` by hand, apply dark again → the lock window is `.dark` again.
5. `theme.test.ts` "tells the iPhone app the theme": with `window.webkit.messageHandlers.domusTheme.postMessage` mocked,
   `applyTheme("dark")`, `applyTheme("system")` and `setTheme("light")` post `{ theme: "dark" }`, `{ theme: "system" }`,
   `{ theme: "light" }` in that order.
6. Same file, "does nothing in a normal browser": with no `window.webkit`, `applyTheme("dark")` does not throw and still
   sets `data-theme="dark"`; with a `postMessage` that throws, `applyTheme` still does not throw.
7. Same file, "boot script tells the app": run `THEME_INIT_SCRIPT` (e.g. `new Function(THEME_INIT_SCRIPT)()`) with
   `localStorage["domus-theme"] = "dark"` and a mocked handler → one post of `{ theme: "dark" }` and `data-theme="dark"`;
   with no `window.webkit` it does not throw; with `localStorage["domus-theme"] = "sepia"` it posts `{ theme: "system" }`
   and removes `data-theme` (existing fallback).
8. All existing web tests and all existing `AppTests` still pass.

## 9. Report format
Status (PASS/FAIL); files changed with line counts; test names; command results (say if xcodebuild could not run).
Token usage. Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No `project.pbxproj` edits, no new Swift files, no new dependencies.
- The provenance check stays the first thing in `handleMessage` for every message name (security, L-021 spirit).
- No copy changes. No invented URLs.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
  user needs to think about what to do, the UI needs to be clearer.
