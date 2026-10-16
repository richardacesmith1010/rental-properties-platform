# Sprint 238a — iPhone shell: privacy manifest, photo-save crash, launch screen, upload safety (L3 iPhone) — rev 1

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
4. `apps/ios/ios/App/App/DomusNavigationDelegate.swift` and/or `DomusBridgeViewController.swift` (splash hide)
5. a new or existing XCTest file under `apps/ios/ios/App/AppTests/` for the splash rule (e.g. `LaunchSplashTests.swift`)
6. `apps/ios/www/offline.html`, `apps/ios/ios/App/App/public/offline.html`
7. `apps/ios/scripts/testflight.sh`, `apps/ios/scripts/config.test.cjs`
8. `apps/ios/README.md`, `apps/ios/PRIVACY-AUDIT.md`

## 6. Implementation requirements
1. **Manifest:** `NSPrivacyAccessedAPITypes` gets exactly one dict: `NSPrivacyAccessedAPIType` =
   `NSPrivacyAccessedAPICategoryUserDefaults`, `NSPrivacyAccessedAPITypeReasons` = [`CA92.1`].
2. **Info.plist:** add `NSPhotoLibraryAddUsageDescription` = `Save photos from Domus to your phone.`; change
   `NSCameraUsageDescription` to `Take photos of repairs, receipts, and your profile.`
3. **Splash:** `launchAutoHide: false` (keep `launchShowDuration` irrelevant). Hide the splash natively the **first** time
   the main frame finishes loading a page (`didFinish` for the main frame), **or** the first `didFail`/
   `didFailProvisionalNavigation` (so the offline page is visible), **or** after a 12-second fallback timer — whichever is
   first; never hide twice; never block the Face ID lock overlay (the lock must still appear above content when enabled).
   Keep the logic in a small pure, testable unit (e.g. `LaunchSplashGate`) called from the delegate.
4. **Offline link:** both `offline.html` files: "Try again" goes to `https://domusbase.com/login`.
5. **testflight.sh:** run `env -u CAP_SERVER_URL npx cap sync ios`; after archive, read
   `App.app/capacitor.config.json` and fail with a plain message unless `server.url` is exactly
   `https://domusbase.com/login`.
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
1. `config.test.cjs` asserts: `NSPrivacyAccessedAPITypes` deep-equals exactly the one UserDefaults/CA92.1 entry; both
   Info.plist strings exact; offline link `https://domusbase.com/login`; `launchAutoHide` false; a fake-tool case where
   `CAP_SERVER_URL=http://localhost:3000` is set and `testflight.sh` still archives the production URL or fails.
2. `plutil -lint` passes on both plists.
3. XCTest: the splash gate hides once on first main-frame finish; hides on first failure; hides on the 12 s fallback;
   never hides twice; subframe finishes do not count.
4. (Claude) Simulator: cold launch shows the splash until the login/home page is visible — no black/white gap; airplane
   mode → offline page visible → Try again → /login; full-size repair photo long-press → Save to Photos prompts, no crash.
5. All existing XCTests stay green.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include "Claude
prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No signing, team ID, bundle ID or entitlement changes. Do not commit
`Signing.local.xcconfig`. The user should never need to read instructions to complete this flow.
