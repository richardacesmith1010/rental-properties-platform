# Sprint 238a-b — iPhone launch cover is not visible: log it, fix it, no black gap (L3 iPhone, small) — rev 2 (rev 1 APPROVE WITH CHANGES → REQUIRED and OPTIONAL adopted)

## 1. Objective
Sprint 238a (`2fdda7b`) added a Domus-owned launch cover (`LaunchSplashGate.swift`, `DomusBridgeViewController`) so a
cold launch shows the Domus splash until the first page finishes. On the iPhone Simulator it does **not** show: the
screen is black for ~6–12 s until the page appears (same as before 238a). Find and fix the cause, and make sure that even
if the cover is removed early the user never sees black.

## 2. Context
- Evidence (Claude, iPhone 18 Pro Simulator, iOS 27, Debug build of `2fdda7b`, appearance **light**, fresh install, Face
  ID lock **off**): screenshots at 2 s and 6 s are solid black (no logo); at 14 s the signed-in page shows. The system
  launch animation briefly shows the **dark** splash variant (dark background, dim house) although the device is light.
- **Confirmed architecture (Claude read the source):** `CAPBridgeViewController.loadView()` is `final` and ends with
  `view = webView` (`node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift:46`). So
  `launchCover.install(in: view)` in `DomusBridgeViewController.viewDidLoad` adds the cover **inside the WKWebView**,
  not above it. Capacitor sets the web view and scroll view background to `UIColor.systemBackground` when no
  `ios.backgroundColor` is configured (same file, lines 308–315); our config sets only `SplashScreen.backgroundColor`.
- `SceneDelegate` sets `bridge.appWindow = window`, `window.rootViewController = bridge`, then `makeKeyAndVisible()`.
  `AppLockController.install(window:)` creates one lock `UIWindow` per scene at `.alert + 1` (hidden until needed) and
  sends `.coldLaunch`; with the lock off the phase is `.open`. `sceneWillResignActive` sends `.willResignActive`, which
  moves `.open → .covered` and **shows the lock window as a privacy cover** (`show(cover: true)`).
- Hypotheses to prove or rule out with logs (each must be named in the report as confirmed / ruled out):
  - **A:** a lifecycle or key-window notification at launch sends `.lockShown` and opens the gate early.
  - **B (expected):** the cover is a WKWebView descendant and is hidden or overdrawn by web view content.
  - **C:** `UIStoryboard(name: "LaunchScreen").instantiateInitialViewController()?.view` returns nil (watchdog, no cover).
  - **D:** `DomusBridgeViewController` is not the controller actually instantiated in this build.
  - **E:** the cover exists but is detached, zero-sized, clipped, or laid out before it has a window/scene.
  - **F:** another gate event (early `finished`, `watchdog`) opens the gate before the page is visible.
  - **G:** a lock window or notification from another window/scene is treated as ours.
  - **H:** the lock window's privacy cover (`.covered`) is shown at launch above the app window and is the black.
- Asset: `Assets.xcassets/Splash.imageset` (light: white + blue house; dark: near-black + white house);
  `Base.lproj/LaunchScreen.storyboard` (imageView `Splash`, background `systemBackgroundColor`).

## 3. In scope
Diagnosis logging, the cover architecture fix, a strict lock-visible rule, a no-black fallback, tests.

## 4. Out of scope
Web app code, Face ID lock behavior (other than not opening the launch gate unless the lock UI is really visible), App
Store items, `SceneDelegate.swift`, `AppLock.swift`, `AppLockController.swift`, `LockViewController.swift`.

## 5. Exact files expected to change
1. `apps/ios/ios/App/App/DomusBridgeViewController.swift`
2. `apps/ios/ios/App/App/LaunchSplashGate.swift`
3. `apps/ios/ios/App/AppTests/LaunchSplashTests.swift` (+ `AppLockControllerTests.swift` only if a shared helper needs it)

## 6. Implementation requirements
1. **Logging** with `os.Logger(subsystem: "com.domusbase.app", category: "launch")`. No personal data and no URLs with
   query strings. Log each as a separate fact:
   - the bridge controller class that ran `viewDidLoad` (proves Hypothesis D);
   - storyboard loaded yes/no, view loaded yes/no, and the cover's resolved `traitCollection.userInterfaceStyle`;
   - cover attachment: its window (non-nil), window scene (non-nil), frame (non-zero), `isHidden`, `alpha`, and whether
     it is the frontmost window in its scene at the normal level;
   - lock state at each candidate: feature enabled, phase, lock window exists, same scene, `isHidden`, `alpha`;
   - **every** gate event with its source, including ignored `.lockShown` candidates and the reason they were ignored;
   - the **single winning removal reason** (`finished`, `offlineFinished`, `watchdog`, `lockShown`).
2. **Cover outside the WKWebView hierarchy.** Do not add the cover to `view` (it is the WKWebView). Install it in a
   dedicated cover `UIWindow` created for the **same `UIWindowScene` as `appWindow`**, at `UIWindow.Level.normal + 1`
   (above the app window, below the lock window at `.alert + 1`, so the Face ID lock always draws over it). The cover
   window never becomes key (`canBecomeKey`-equivalent: do not call `makeKey`), has `backgroundColor = .systemBackground`,
   fills the scene bounds, follows the device appearance, and may block touches until removed. On the winning gate
   event, hide it (`isHidden = true`), drop its root view, and release the window, exactly once on the main thread. If
   `appWindow` or its scene is nil at install time, log why and fall back to the no-black rules in item 4 (no cover).
3. **Lock visible = mechanical rule.** Send `.lockShown` only when **all** hold: the lock feature is enabled
   (`lockSettings.enabled`), the phase is `.locked` or `.authenticating`, the lock window exists, belongs to the same
   `UIWindowScene` as `appWindow`, `isHidden == false`, `alpha > 0`, and `windowScene != nil`. Do **not** require
   `isKeyWindow`. Lifecycle (`UIScene` background/foreground) and window (`didBecomeVisible/Key`) notifications only
   trigger an evaluation of this rule; they never send `.lockShown` by themselves. Notifications whose window is not our
   lock window, or whose scene differs, are ignored and logged. **`.signingOut` no longer yields** (decision: the lock
   window at `.alert + 1` already draws over the cover; the cover then ends on `finished` or `watchdog`).
4. **No black fallback:** in `viewDidLoad`, before the first load: `webView.isOpaque = false`,
   `webView.backgroundColor`, `webView.scrollView.backgroundColor` and `webView.underPageBackgroundColor` =
   `.systemBackground`, and `appWindow?.backgroundColor = .systemBackground` (the view under a non-opaque web view).
5. **Idempotent gate:** competing events (`finished` + `watchdog` + `lockShown` in any order) remove the cover once; the
   winning reason is recorded and never changes after removal.
6. Keep every 238a gate rule and test passing (update only tests whose subject moved from `view` to the cover window,
   and say which in the report).

## 7. Validation commands
```
cd apps/ios && node --test scripts/config.test.cjs
```
(Move `ios/App/Signing.local.xcconfig` aside if required and restore it.) Do NOT run `testflight.sh`. Claude runs XCTest
and the Simulator walk.

## 8. Acceptance criteria
1. XCTest (named tests in `LaunchSplashTests.swift`):
   - the cover is **not** a descendant of the WKWebView; it is in a window of the same scene at `.normal + 1`, non-key,
     with a non-zero frame equal to the scene bounds, `isHidden == false` before removal;
   - lock **off**: `willEnterForeground`, `didEnterBackground`, `didBecomeVisible` and `didBecomeKey` at launch do not
     open the gate;
   - lock **enabled but window hidden** (or `alpha == 0`) → no `.lockShown`; lock window from **another scene** → no
     `.lockShown`; lock enabled + visible + `.locked`/`.authenticating` → gate opens with reason `lockShown`;
     `.signingOut` → no `.lockShown`;
   - competing `finished`/`watchdog`/`lockShown` in all orders → one removal, reason fixed after the first;
   - no-black fallback: web view `isOpaque == false`, web view, scroll view and `underPageBackgroundColor` and the app
     window background all equal `.systemBackground`, resolved non-black in a **light** trait collection and equal to the
     system background in **dark**;
   - all existing launch tests still pass.
2. (Claude) Simulator, fresh install, lock off, light and dark: screenshots at ~1 s, 3 s and 6 s show the Domus splash
   (house logo) until the page; the launch log shows removal reason `finished`.
3. (Claude) Lock on: the Face ID lock screen appears without a 12 s splash wait.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results, each hypothesis A–H as
confirmed / ruled out / unknown with one line of evidence. Do NOT include "Claude prompt" or "recommended next steps for
Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No signing/entitlement changes.
