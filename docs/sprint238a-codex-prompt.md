# Sprint 238a — iPhone shell: privacy manifest, photo-save crash, launch screen, upload safety (L3 iPhone) — rev 3 (rev 1 REJECT → rev 2 APPROVE WITH CHANGES: 4 REQUIRED + 2 OPTIONAL adopted)

## 1. Objective
Make the iPhone app (`apps/ios`, Capacitor 8 shell loading https://domusbase.com/login) safe to upload to TestFlight:
1. Declare the UserDefaults required-reason API in the privacy manifest (without it the upload is rejected, ITMS-91053).
2. Add the Photos "add" usage string so saving a repair photo cannot crash the app.
3. Keep the splash screen up until the first Domus page has loaded (today: black/white screen for 8–15 s after a 1.5 s
   splash — an App Review risk).
4. Update the camera string, the offline "Try again" link, stale docs, and make `testflight.sh` refuse to archive a
   non-production `server.url`.

## 2. Context
- HEAD `11a5556` (main). Readiness audit + Simulator walk: `docs/phone-readiness-plan-2026-10-16.md`,
  `docs/phone-walk-2026-10-16.md` (findings B1, PRIV-5, PRIV-7, PRIV-9, IOS-6, IOS-7, ASR-12, walk P1).
- `apps/ios/ios/App/App/PrivacyInfo.xcprivacy:242-243` — `NSPrivacyAccessedAPITypes` is an empty array, but
  `AppLock.swift:10-28` reads/writes `UserDefaults` (Face ID lock setting). Do not rely on the LinkKitSub bundle manifest.
- `apps/ios/ios/App/App/Info.plist:62-65` — has `NSFaceIDUsageDescription` and `NSCameraUsageDescription` ("Take photos of
  problems to send to your landlord."); **no** `NSPhotoLibraryAddUsageDescription`. Long-pressing the full-size repair
  photo (`apps/web/components/dashboard/maintenance/photo-gallery.tsx:124-128` `<img>` outside a/button) offers "Save to Photos", which
  needs that key.
- `apps/ios/capacitor.config.ts` — `SplashScreen: { launchAutoHide: true, launchShowDuration: 1500 }`. The main frame's
  `didFinish` is observed in `DomusNavigationDelegate.swift:172-174`; `DomusBridgeViewController.capacitorDidLoad()`
  (`:43`) installs the delegate. `@capacitor/splash-screen` 8.0.2 is installed.
- `apps/ios/www/offline.html:28` and its synced copy `apps/ios/ios/App/App/public/offline.html:28` — "Try again" link.
- `apps/ios/scripts/testflight.sh:148` runs `npx cap sync ios` (inherits `CAP_SERVER_URL`); `:151-157` validates the
  archive but not `server.url`.
- `apps/ios/scripts/config.test.cjs` (357 lines) asserts plist/config values and parses the `PRIVACY-AUDIT.md` table
  (`:79-102`); `:97` asserts the empty `NSPrivacyAccessedAPITypes`.
- `apps/ios/README.md:69-70, 167-168, 193-201` still call Face ID and universal links "future work" (shipped 227/229).
- `apps/ios/PRIVACY-AUDIT.md` rows U1, U3, U4, U5, U6 are UNVERIFIED; the audit evidence closes them (see plan PRIV-9).

## 3. In scope
Manifest entry, Photos-add string, camera string, splash-until-first-load (native), offline link, testflight.sh URL
guard, README + PRIVACY-AUDIT updates, tests.

## 4. Out of scope
Web app code (`apps/web/**`), analytics gating and dropping DeviceID/BrowsingHistory label rows (Sprint 238c), push,
App Store Connect, account deletion (238b), any signing/team settings.

## 5. Exact files expected to change
1. `apps/ios/ios/App/App/PrivacyInfo.xcprivacy`
2. `apps/ios/ios/App/App/Info.plist`
3. `apps/ios/capacitor.config.ts` (+ the synced `apps/ios/ios/App/App/capacitor.config.json` via `npx cap sync ios`)
4. `apps/ios/ios/App/App/DomusNavigationDelegate.swift`, `DomusBridgeViewController.swift`, and a new
   `LaunchSplashGate.swift` (gate + `LaunchCoverAdapter`); add the new Swift file to the App target in `App.xcodeproj`
5. a new or existing XCTest file under `apps/ios/ios/App/AppTests/` for the splash rule (e.g. `LaunchSplashTests.swift`)
6. `apps/ios/www/offline.html`, `apps/ios/ios/App/App/public/offline.html`
7. `apps/ios/scripts/testflight.sh`, `apps/ios/scripts/config.test.cjs`
8. `apps/ios/README.md`, `apps/ios/PRIVACY-AUDIT.md`

## 6. Implementation requirements
1. **Manifest (audit first):** inspect the app target's Swift sources **and** every embedded framework/plugin
   (Capacitor 8.5.3 core/iOS, @capacitor/app, splash-screen, status-bar, LinkKit 7.2.2 incl. `LinkKitSub`, any SPM/CocoaPods
   frameworks in the built `App.app/Frameworks`) for all five required-reason categories: UserDefaults, file timestamps,
   disk space, system boot time, active keyboards. For each use, record in `PRIVACY-AUDIT.md` which bundle declares it
   (an SDK's own `PrivacyInfo.xcprivacy` covers its own use; the app target must declare uses made by app code and by any
   embedded code that ships no manifest). The app target's `NSPrivacyAccessedAPITypes` must contain exactly the
   categories the audit requires — at minimum `NSPrivacyAccessedAPICategoryUserDefaults` with [`CA92.1`] (AppLock).
2. **Info.plist:** add `NSPhotoLibraryAddUsageDescription` = `Save photos from Domus to your phone.`; change
   `NSCameraUsageDescription` to `Take photos of repairs, receipts, and your profile.`
3. **Splash (rev 3): Domus-owned launch cover.** Do not drive Capacitor's SplashScreen plugin for this. Set the plugin to
   `launchShowDuration: 0`, `launchAutoHide: true` so it never covers anything. Instead `DomusBridgeViewController` adds
   its own full-screen cover view (built from the app's LaunchScreen storyboard so it looks identical to the system launch
   screen) in `viewDidLoad`, before the web view's first frame. A small pure state machine `LaunchSplashGate` decides when
   to open; a concrete `LaunchCoverAdapter` removes the cover (fade ≤ 0.2 s) on the main thread. If the gate opens
   before the cover is installed, the adapter records it and never installs the cover (no pending stuck state).
   Invariant: **exactly one removal, and the UI is never permanently obscured.** Rules:
   - **destination tracking:** `didFinish` gives a `WKNavigation`, not a frame. Track the identity of the latest main-frame
     navigation (record it from `decidePolicyFor navigationAction` where `targetFrame?.isMainFrame == true` and from
     `didStartProvisionalNavigation`, replacing the tracked one each time); open on `didFinish` only when the finished
     navigation is the tracked current one. HTTP redirects (`/login` → 307 → `/owner`, the magic-link callback) stay in one
     navigation and finish once at the final page. **Stated limit:** client-side route changes after the server-rendered
     page finishes are not waited for — the first finished server-rendered page counts as loaded for this sprint;
   - a genuine main-frame failure does **not** open the gate by itself. Verify against the installed Capacitor 8.5.3
     source (`node_modules/@capacitor/ios/...WebViewDelegationHandler`) that the original failure handler still runs
     through `DomusNavigationDelegate`'s forwarding and loads `errorPath`; track that offline navigation like any other and
     open when it finishes. A failure of the offline page itself must not start another offline load (no reload loop) —
     the watchdog releases the cover;
   - cancelled/superseded navigations (`NSURLErrorCancelled` -999, WebKit "frame load interrupted" 102, or any failure
     whose navigation is no longer the current one) never open the gate;
   - a 12-second watchdog from launch **always** opens the gate, even if no navigation callback ever arrives;
   - backgrounding/foregrounding or the Face ID prompt during the first 12 s never re-installs the cover or restarts the
     watchdog;
   - **Face ID lock:** when the app lock decides to show its lock screen at launch (cold or warm), the gate opens
     immediately so the lock UI is the top, visible, interactive layer (the lock already hides content); the lock is never
     under the splash;
   - duplicate events (finish + timer, two sources) are no-ops after the first hide.
4. **Offline link:** both `offline.html` files: "Try again" goes to `https://domusbase.com/login`.
5. **testflight.sh (rev 2):** (a) before archiving, check `xcodebuild -version` is Xcode 26 or newer and the iOS SDK is
   26 or newer (Apple's upload minimum), else fail with a plain message; (b) run `env -u CAP_SERVER_URL npx cap sync ios`;
   (c) **before** archiving, read the generated `ios/App/App/capacitor.config.json` and fail unless `server.url` is
   exactly `https://domusbase.com/login`; (d) after archiving, locate the archived `.app` robustly (the single `*.app`
   under `Products/Applications`, error if 0 or >1), read its `capacitor.config.json` and require the same exact string;
   (e) also require the archived app to contain `PrivacyInfo.xcprivacy` and an Info.plist with
   `NSPhotoLibraryAddUsageDescription`. No normalization of the URL (exact string compare). Each failure prints a plain,
   actionable message and exits non-zero.
6. **Docs:** README lines that call Face ID / universal links future work → present tense with the sprint numbers;
   PRIVACY-AUDIT: close U1, U3, U4, U5, U6 with cited evidence, keep U2 open, add a LinkKit 7.2.2 section, note Plaid is
   Transactions only (`apps/web/lib/plaid.ts:81`), Face ID data stays on the device, add the e-sign IP/device row.
   Keep the table format `config.test.cjs` parses.
7. Plain-language strings (6th grade, ≤ 12 words). No new dependencies. No signing/team changes.

## 7. Validation commands
```
cd apps/ios && node --test scripts/config.test.cjs
cd apps/ios && plutil -lint ios/App/App/PrivacyInfo.xcprivacy ios/App/App/Info.plist
cd apps/ios && npx cap sync ios
```
(Move `ios/App/Signing.local.xcconfig` aside before `config.test.cjs` and restore it after, if the test requires it —
see `docs/agent-handoff.md:818`.) Do NOT run `testflight.sh` for real and do NOT upload anything. Claude runs `xcodebuild
test` and the Simulator walk.

## 8. Acceptance criteria
1. `config.test.cjs` asserts: `NSPrivacyAccessedAPITypes` deep-equals exactly the audited set (incl. UserDefaults/CA92.1);
   both Info.plist strings exact; offline link `https://domusbase.com/login`; `launchAutoHide` false. Fake-tool cases for
   `testflight.sh`, each non-zero with a plain message unless noted: hostile inherited `CAP_SERVER_URL`; generated config
   wrong after sync; archived config wrong though source is right; archived config missing; malformed JSON; no
   `server.url`; Xcode older than 26; happy path with the exact production URL (zero exit up to the stubbed upload).
   Distinct expectation: inherited `CAP_SERVER_URL=http://localhost:3000` that is **successfully removed** by
   `env -u` → **pass**, with both the generated and archived URLs verified as production; a generated or archived config
   that still contains localhost → **fail before upload**. Every failing case asserts the upload command never ran.
   Also assert the **generated** `ios/App/App/capacitor.config.json` has `launchShowDuration` 0 / `launchAutoHide` true
   (plugin splash off), not only the TypeScript source.
2. `plutil -lint` passes on both plists.
3. XCTest (`LaunchSplashGate` + adapter): success before timeout; timeout before success; real network failure then
   offline-page finish (hide only after the offline finish); offline page itself fails → watchdog hides; `/login` →
   `/owner` redirect hides once at the final page; cancelled/superseded navigation then success hides once at success;
   the same event from two sources hides once; timer after a prior hide is a no-op; lock-enabled cold launch and
   lock-enabled warm launch → cover yields to the lock; subframe finish never hides; a finish for a stale (non-current)
   navigation never hides; backgrounding during launch never re-installs the cover. One integration-level test (real
   `DomusBridgeViewController` view hierarchy) proves the cover view is installed before load and removed exactly once on
   the main thread when the gate opens, and that opening before install leaves no cover.
4. (Claude) Built-bundle check: `plutil -p` on the built `App.app/PrivacyInfo.xcprivacy` and `Info.plist` shows the
   audited API set and `NSPhotoLibraryAddUsageDescription`. Simulator: cold launch shows the splash until the login/home page is visible — no black/white gap; airplane
   mode → offline page visible → Try again → /login; full-size repair photo long-press → Save to Photos prompts, no crash.
5. All existing XCTests stay green.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include "Claude
prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No signing, team ID, bundle ID or entitlement changes. Do not commit
`Signing.local.xcconfig`. The user should never need to read instructions to complete this flow.
