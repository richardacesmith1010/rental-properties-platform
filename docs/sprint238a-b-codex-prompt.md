# Sprint 238a-b — iPhone launch cover is not visible: log it, fix it, no black gap (L3 iPhone, small) — rev 1

## 1. Objective
Sprint 238a (`2fdda7b`) added a Domus-owned launch cover (`LaunchSplashGate.swift`, `DomusBridgeViewController`) so a
cold launch shows the Domus splash until the first page finishes. On the iPhone Simulator it does **not** show: the
screen is black for ~6–12 s until the page appears (same as before 238a). Find and fix the cause, and make sure that even
if the cover is removed early the user never sees black.

## 2. Context
- Evidence (Claude, iPhone 18 Pro Simulator, iOS 27, Debug build of `2fdda7b`, appearance **light**, fresh install, Face
  ID lock **off**): screenshots at 2 s and 6 s are solid black (no logo); at 14 s the signed-in page shows. The system
  launch animation briefly shows the **dark** splash variant (dark background, dim house) although the device is light.
- `apps/ios/ios/App/App/DomusBridgeViewController.swift`: `launchCover.install(in: view)` in `viewDidLoad`; observers on
  `UIWindow.didBecomeVisible/Key` and on `UIScene.didEnterBackground/willEnterForeground` call
  `yieldLaunchCoverToLock()`, which sends `.lockShown` when `appLockController?.lock?.phase` is `.locked`,
  `.authenticating` or `.signingOut`. **Hypothesis A:** at launch `willEnterForeground` fires and the lock phase is one of
  those (or a lock window becomes visible/key) even with the lock off, so the gate opens at once. **Hypothesis B:**
  `view` is Capacitor's `WKWebView`, and the cover added as its subview is not on top / is hidden by the web view's own
  layers. **Hypothesis C:** `UIStoryboard(name: "LaunchScreen").instantiateInitialViewController()?.view` returns nil (then
  the adapter sends `.watchdog` and installs nothing).
- The WKWebView paints black before its first frame (Capacitor default background), which is the black the user sees.
- Asset: `Assets.xcassets/Splash.imageset` (light: white + blue house; dark: near-black + white house);
  `Base.lproj/LaunchScreen.storyboard` (imageView `Splash`, background `systemBackgroundColor`).

## 3. In scope
Diagnosis logging, the cover fix, a no-black fallback, tests.

## 4. Out of scope
Web app code, Face ID lock behavior (other than not opening the launch gate when the lock is off), App Store items.

## 5. Exact files expected to change
1. `apps/ios/ios/App/App/DomusBridgeViewController.swift`
2. `apps/ios/ios/App/App/LaunchSplashGate.swift`
3. `apps/ios/ios/App/AppTests/LaunchSplashTests.swift` (+ `AppLockControllerTests.swift` only if a shared helper needs it)

## 6. Implementation requirements
1. **Logging:** `os.Logger(subsystem: "com.domusbase.app", category: "launch")` lines (no personal data, no URLs with
   query strings) for: cover installed (or why not), every gate event with its source, and the removal reason
   (`finished`, `offlineFinished`, `watchdog`, `lockShown`).
2. **Lock yield only when the lock UI is really shown:** `.lockShown` is sent only if the lock feature is enabled **and**
   the lock window is visible on screen with a locked/authenticating phase; app-lifecycle notifications alone never open
   the gate when the lock is off.
3. **Cover on top:** install the cover in a container that is above the web view for the whole launch (e.g. add it to
   the bridge VC's view **and** call `bringSubviewToFront` after Capacitor adds/updates its web view, or attach it to the
   window), filling the screen, following the device appearance (light/dark splash), non-interactive pass-through not
   required (it may block touches until removed).
4. **No black fallback:** before the first paint, the web view and its scroll view use a non-black background matching
   the launch screen (`systemBackground`, `isOpaque = false`), so an early removal never shows black.
5. Keep every 238a gate rule and test passing.

## 7. Validation commands
```
cd apps/ios && node --test scripts/config.test.cjs
```
(Move `ios/App/Signing.local.xcconfig` aside if required and restore it.) Do NOT run `testflight.sh`. Claude runs XCTest
and the Simulator walk.

## 8. Acceptance criteria
1. XCTest: with the lock **off**, `willEnterForeground`/`didBecomeKey` at launch do not open the gate; with the lock **on**
   and the lock window visible, the gate opens (`lockShown`); the cover is the frontmost subview after the web view is
   added; the web view background is non-black before first paint; all existing launch tests still pass.
2. (Claude) Simulator, fresh install, lock off, light and dark: screenshots at ~1 s, 3 s and 6 s show the Domus splash
   (house logo) until the page; the launch log shows removal reason `finished`.
3. (Claude) Lock on: the Face ID lock screen appears without a 12 s splash wait.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results, root cause in one line. Do NOT
include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No signing/entitlement changes.
