# Sprint 212 — iPhone app: ready for a real iPhone and TestFlight (L3, owner phone-app exception) · rev 3 (rev 1 REJECT → rev 2 APPROVE WITH CHANGES → all 5 required + optional 2, 3 adopted)

## 1. Objective
The Domus iPhone app (`apps/ios`, Capacitor 8) runs only in the Simulator today, because signing is switched off. Make it ready to:
1. install on the owner's own iPhone from Xcode;
2. upload to TestFlight (Apple's beta app) with one script.

The owner's Apple Developer account is active. **No Apple team ID may be committed to git.**

## 2. Context (HEAD `9023983`, branch `main`)
- **Project:** `apps/ios/ios/App/App.xcodeproj`, scheme `App`, bundle `com.domusbase.app`, iPhone only, iOS 15+.
- **App target build settings:**
  - Debug and Release both have `CODE_SIGNING_ALLOWED = NO`, `MARKETING_VERSION = 1.0` and `CURRENT_PROJECT_VERSION = 1`.
  - Debug uses `../debug.xcconfig` (`CAPACITOR_DEBUG = true`). Release has no base xcconfig.
  - Debug sets `-DDEBUG`; Release has no `DEBUG` condition (Sprint 210c `InspectionPolicy` relies on this).
- **`App/Info.plist`:**
  - `UIRequiredDeviceCapabilities` is `armv7`, a template leftover; current iPhones are `arm64`.
  - It has no `ITSAppUsesNonExemptEncryption` key.
  - Its only permission string is `NSCameraUsageDescription`.
- **No privacy manifest:** there's no `PrivacyInfo.xcprivacy` in the App target.
- **App icon:** a single 1024 px PNG with no alpha (already OK).
- **Native code:** `App/*.swift` (`NavigationPolicy`, `DomusNavigationDelegate`, `DomusBridgeViewController`, `DownloadHandler`, `SceneDelegate`), tests in `AppTests`, and a config test in `apps/ios/scripts/config.test.cjs`.
- **Test command:** `cd apps/ios/ios/App && xcodebuild test -project App.xcodeproj -scheme App -destination 'id=C79BDA37-1967-45CB-A369-85B260EA111D'`.
  - If the simulator service is stale, first try `xcrun simctl shutdown all` and boot again. Only as a last resort, run `killall -9 com.apple.CoreSimulator.CoreSimulatorService`.

## 3. In scope
### A. Signing without committing the team ID
1. Add a committed `apps/ios/ios/App/Signing.xcconfig`:
   ```
   CODE_SIGN_STYLE = Automatic
   DEVELOPMENT_TEAM =
   #include? "Signing.local.xcconfig"
   ```
2. Add a committed `Signing.local.xcconfig.example` containing `DEVELOPMENT_TEAM = YOUR_TEAM_ID` and a one-line comment on where to find the ID (developer.apple.com → Account → Membership details → Team ID).
3. Add to the repo `.gitignore`:
   - `apps/ios/ios/App/Signing.local.xcconfig`;
   - `*.xcarchive`, `*.ipa`, `*.mobileprovision`, `*.p12`, `*.cer`;
   - `apps/ios/ios/App/build/`;
   - `apps/ios/build-number.pending`;
   - `apps/ios/ios/App/build/testflight.lock`.
4. **Debug config:** `debug.xcconfig` (in `apps/ios/ios/`) keeps `CAPACITOR_DEBUG = true` and adds `#include "App/Signing.xcconfig"`. Xcode resolves `#include` relative to the including file's folder, and `Signing.xcconfig`'s `#include? "Signing.local.xcconfig"` is relative to `ios/App/`. Verify both resolve.
5. **Release config:** add a new `apps/ios/ios/release.xcconfig` (next to `debug.xcconfig`) containing exactly `#include "App/Signing.xcconfig"`, and set it as the App target's Release `baseConfigurationReference` (add the file reference to the project).
6. **Remove `CODE_SIGNING_ALLOWED = NO`** from the App target's Debug and Release. Leave the test target alone.
7. **Simulator builds and tests must still pass with no local signing file** and no team. If Xcode refuses this, set `CODE_SIGNING_ALLOWED[sdk=iphonesimulator*] = NO` in `Signing.xcconfig`, and report that you did.
8. **Prove the effective settings** with `xcodebuild -showBuildSettings` for each case:

   | Case | Must show |
   |---|---|
   | Debug, iphonesimulator, no local file | builds; team empty |
   | Release, iphoneos, no local file | `CODE_SIGN_STYLE = Automatic`; signing allowed (not `NO`); team empty |
   | Release, iphoneos, temporary local file with the synthetic `ABCDE12345` | `DEVELOPMENT_TEAM = ABCDE12345` (the local file overrides the empty default) |
   | Debug, iphoneos, temporary local file | same team |
   | Release | `SWIFT_ACTIVE_COMPILATION_CONDITIONS` has no `DEBUG`; `OTHER_SWIFT_FLAGS` has no `-DDEBUG` |
   | Test target | its settings unchanged (diff before/after) |

   Put these checks in `config.test.cjs` (they run `xcodebuild -showBuildSettings`, which needs no Apple account). Always delete the temp local file in `finally`.

### B. App Store requirements
1. `Info.plist`:
   - `UIRequiredDeviceCapabilities` → `arm64`;
   - add `ITSAppUsesNonExemptEncryption` = `false` (the app uses only standard HTTPS);
   - keep `NSCameraUsageDescription` as is.
   - If the repair-photo flow can save to the photo library, report it but add no new permission strings (the web file picker uses PHPicker, which needs none).
2. **Privacy manifest** `App/PrivacyInfo.xcprivacy`, added to the App target's Resources build phase. Use Apple's exact keys and values.
   - `NSPrivacyTracking` = false, and `NSPrivacyTrackingDomains` = empty. Domus has no ads and no cross-app tracking. Confirm this in the audit.
   - **Data audit first (evidence-based).** Write `apps/ios/PRIVACY-AUDIT.md`. It lists every kind of data the app collects through the native shell **and** the remote Domus website (the app is a web view of domusbase.com), with columns:
     - data type (Apple's `NSPrivacyCollectedDataType…` key);
     - where it's collected (file:line or service);
     - linked to the user (yes/no, and why);
     - tracking (no, and why);
     - purposes.
   - **Known services to check:**
     - Supabase (accounts, profiles: name, email, phone, home addresses, messages and problem reports, photos);
     - Stripe Checkout and Connect (payments; a third party collecting payment info counts);
     - Plaid (bank accounts and transactions);
     - Sentry (`@sentry/nextjs`: crash and performance data; check `sendDefaultPii` and replay settings);
     - Vercel Analytics (`@vercel/analytics`: product interaction);
     - Anthropic (`@anthropic-ai/sdk`: find what user data is sent and why);
     - Resend (email addresses).
   - **Starting list to confirm or correct with evidence:** Name, EmailAddress, PhoneNumber, PhysicalAddress, PhotosorVideos, OtherFinancialInfo, PaymentInfo, UserID, OtherUserContent, CrashData, PerformanceData, ProductInteraction.
   - **Audit sections:**
     - (1) native shell (our Swift);
     - (2) SDK manifests (Capacitor SPM);
     - (3) remote web and third-party services;
     - (4) **App Store Connect privacy questionnaire answers** (the full nutrition label the owner will enter, covering everything the app does, including web and third parties);
     - (5) **what goes in `PrivacyInfo.xcprivacy`**, with one machine-readable markdown table that the test parses.
   - Any fact that can't be checked from the repo (for example production Sentry settings or a vendor's server-side retention) is marked **UNVERIFIED** with what would confirm it. The audit must not say "complete" while any UNVERIFIED rows remain; list them at the top.
   - The manifest's `NSPrivacyCollectedDataTypes` must match the audit's section 5 exactly: each entry's linked/tracking flags and purposes come from the audit (`AppFunctionality`; `Analytics` for analytics or diagnostics where that's the real use).
   - Do **not** change what the app collects.
   - **Required-reason APIs (first-party, a separate section of the audit):**
     - grep **our** Swift files (`App/*.swift`) for `UserDefaults`, file timestamp APIs, `systemUptime` and disk-space APIs;
     - declare only what our code uses, choosing the reason code from Apple's approved list that matches the actual use (don't assume `CA92.1`); quote the reason in the audit; if none are used, give an empty array.
     - List the SPM dependencies' own `PrivacyInfo.xcprivacy` files (Capacitor and plugins) in the audit, without copying them.

3. **Build number (persisted counter).** Use a committed file `apps/ios/build-number.txt` holding the **last uploaded** build number (start at `1`, since build 1 was never uploaded). The script:
   - reads it, and fails if it isn't a positive integer of at most 9 digits;
   - computes `next = last + 1`, and refuses if `next` is above 999999999;
   - passes `CURRENT_PROJECT_VERSION=<next>` to `xcodebuild archive` (the project stays at 1);
   - **Lock:** take a lock (`mkdir "$BUILD_DIR.lock"`), or fail with `Another upload is running.` Always remove the lock in an `EXIT` trap.
   - **Pending guard:** before exporting, atomically (temp file + `mv`) write `apps/ios/build-number.pending` (gitignored) containing `next`.
     - If a pending file already exists when the script starts, refuse: `Build <n> may already be uploaded. Check App Store Connect → TestFlight, then run with --resolve uploaded or --resolve not-uploaded.`
     - `--resolve uploaded` sets the counter to `<n>` and removes the pending file. `--resolve not-uploaded` only removes the pending file.
   - **Override:** `--build <n>` uses an explicit number. It must be greater than the counter, and is for when App Store Connect shows a higher build (e.g. uploaded from another computer). The README says to check App Store Connect's latest build before uploading from a new computer.
   - **Upload success boundary:** `xcodebuild -exportArchive` with `destination=upload` exits 0 only when the upload was accepted. Success = exit 0 **and** the output contains `EXPORT SUCCEEDED` (or the Xcode-reported upload success line; verify the exact text against the installed Xcode's `xcodebuild` and report it).
     - On success: atomically write `next` to `build-number.txt` and remove the pending file.
     - On any non-zero exit after export starts: keep the pending file and print `Upload status unknown for build <next>. Check App Store Connect → TestFlight, then run with --resolve.`
     - If writing the counter fails after a successful upload: keep the pending file and print the same message.
   - then prints `Commit apps/ios/build-number.txt so the next upload uses a higher number.`
   - `MARKETING_VERSION` stays `1.0`.
   - Put the number logic in `apps/ios/scripts/build-number.cjs` (pure functions `parseLast`, `nextBuild`), and have the shell script call it.
   - **Tests:**
     - sequential runs (1 → 2 → 3);
     - a non-numeric file, zero or negative, and a value above the max;
     - `--build` lower than or equal to the counter is rejected;
     - the pending file blocks the next run, and both `--resolve` paths work;
     - the lock blocks a second run.
     - Upload outcomes: use a fake `xcodebuild` on `PATH` in the tests to simulate success, failed export, ambiguous output (exit 0 without the success line → status unknown), and a counter write failure.

### C. One-command TestFlight upload: `apps/ios/scripts/testflight.sh`
1. `set -euo pipefail`. It runs from any directory (resolves its own path).
2. **Preflight**, with plain-English messages and exit 1:
   - Xcode exists (`xcodebuild -version`);
   - `ios/App/Signing.local.xcconfig` exists, and its `DEVELOPMENT_TEAM` is 10 uppercase letters or digits. Otherwise print `Add your Apple Team ID to apps/ios/ios/App/Signing.local.xcconfig (see Signing.local.xcconfig.example).`;
   - the git working tree for `apps/ios` is clean. Otherwise print a warning and continue only with `--allow-dirty`.
3. **Steps:**
   - `npx cap sync ios`;
   - `xcodebuild archive -project ... -scheme App -configuration Release -destination 'generic/platform=iOS'`, with:
     - `-archivePath "$BUILD_DIR/Domus.xcarchive"` (`BUILD_DIR` = `apps/ios/ios/App/build/testflight`, already gitignored);
     - `-allowProvisioningUpdates` and `CURRENT_PROJECT_VERSION=<next>`;
   - `xcodebuild -exportArchive -exportOptionsPlist <generated> -exportPath "$BUILD_DIR/export" -allowProvisioningUpdates`.
4. **Export options:** generate the plist into `$BUILD_DIR` from the committed template `apps/ios/scripts/ExportOptions.template.plist`:
   - `method` = `app-store-connect`, `destination` = `upload`, `signingStyle` = `automatic`;
   - `teamID` = the team read from the local file;
   - `manageAppVersionAndBuildNumber` = false, `uploadSymbols` = true.
5. `--dry-run` prints every command with the build number and **runs nothing**: no sync, no archive, no export, no file writes, no Apple sign-in, no change to `build-number.txt`. The team appears as `<team>`.
6. **Failure handling:**
   - delete `$BUILD_DIR` at the start of every real run (no stale archive or export);
   - stop on any failed step (sync, archive, export) with `Upload failed at <step>. Nothing was uploaded.` (for export: `may not have been uploaded`);
   - check that `Domus.xcarchive/Products/Applications/App.app` exists before exporting;
   - before exporting, check the archive's `Info.plist` has `CFBundleIdentifier` = `com.domusbase.app` and `CFBundleVersion` = `<next>`, and that the archive contains `PrivacyInfo.xcprivacy`.
7. **Logs:** never echo the team ID; print `<team>` instead.
8. At the end, print: `Upload submitted for build <next>. Check App Store Connect for processing status.` The README notes that an App Store Connect app record for `com.domusbase.app` must exist first, created once by the owner.
9. **Version check:** at the start, check that `xcodebuild -help` lists `-exportArchive`, and fail with a clear message if not.

### D. README
Update `apps/ios/README.md` with two short sections, each a few numbered steps for a non-developer:
- **Put Domus on your iPhone:** open Xcode → set the team via the local xcconfig → plug in the phone → turn on Developer Mode → Run. Note that the first time, Xcode may download device support, create a signing profile, and ask the phone to "Trust this computer". These steps are normal.
- **Send a TestFlight build:** run `apps/ios/scripts/testflight.sh`.

### E. Tests (`apps/ios/scripts/config.test.cjs`, extend it)
1. `Info.plist` has `arm64`, no `armv7`, and `ITSAppUsesNonExemptEncryption` false (parse with `plutil -convert json -o -`).
2. `PrivacyInfo.xcprivacy` exists, passes `plutil -lint`, and its `NSPrivacyCollectedDataTypes` equal the manifest rows of `PRIVACY-AUDIT.md`, parsed from a machine-readable table, including linked, tracking and purposes. Tracking is false, and the file is referenced in the App target's Resources build phase in `project.pbxproj`.
3. No committed file under `apps/ios` sets a non-empty `DEVELOPMENT_TEAM`, and `.gitignore` contains `Signing.local.xcconfig`.
4. The App target has no `CODE_SIGNING_ALLOWED = NO` in Debug or Release, and Release uses `release.xcconfig`.
5. **Built bundle contains the manifest:** after the Release simulator build (and an unsigned `-sdk iphoneos CODE_SIGNING_ALLOWED=NO` Release build), the built `App.app` contains `PrivacyInfo.xcprivacy`, and its parsed content equals the source manifest.
6. `testflight.sh --dry-run`:
   - with a temp fake `Signing.local.xcconfig` (`DEVELOPMENT_TEAM = ABCDE12345`) and `build-number.txt` = `1`, it prints the archive and export commands with `-allowProvisioningUpdates` and `CURRENT_PROJECT_VERSION=2`;
   - it creates no archive, writes no counter, pending or lock file, and never prints `ABCDE12345`;
   - with a missing or malformed team, it exits 1 with the exact message.
   - Clean up the temp file in a `finally` block.

### F. Not the same as App Store ready
This sprint makes the app installable and uploadable. It does **not** make it App Store-compliant: Guideline 4.2 (minimum functionality), account deletion and native features come later. Don't claim otherwise in the README or report.

## 4. Out of scope
- Face ID, push, deep links, account deletion and app-version UI.
- Any change to web code or `capacitor.config.ts`.
- Running a real archive or upload; creating App Store Connect records.
- `apps/mobile`, `.claude/launch.json`.

## 5. Exact files expected to change
- `apps/ios/ios/App/Signing.xcconfig` (new)
- `apps/ios/ios/App/Signing.local.xcconfig.example` (new)
- `apps/ios/ios/debug.xcconfig`
- `apps/ios/ios/release.xcconfig` (new)
- `apps/ios/ios/App/App.xcodeproj/project.pbxproj`
- `apps/ios/ios/App/App/Info.plist`
- `apps/ios/ios/App/App/PrivacyInfo.xcprivacy` (new)
- `apps/ios/scripts/testflight.sh` (new, executable)
- `apps/ios/scripts/ExportOptions.template.plist` (new)
- `apps/ios/scripts/build-number.cjs` (new)
- `apps/ios/build-number.txt` (new, `1`)
- `apps/ios/PRIVACY-AUDIT.md` (new)
- `apps/ios/scripts/config.test.cjs`
- `apps/ios/README.md`
- `.gitignore`

## 6. Implementation requirements
- Shell: `bash -n` clean, and `shellcheck`-clean if `shellcheck` is installed.
- No new npm dependencies.
- Don't hand-edit object IDs in `project.pbxproj` in a way that breaks Xcode: after editing, `xcodebuild -list` must work and the project must open (build passes).
- Don't print the team ID in any log line except the export options file.

## 7. Validation commands to run
- `cd apps/ios && node scripts/config.test.cjs`
- `bash -n apps/ios/scripts/testflight.sh`
- `apps/ios/scripts/testflight.sh --dry-run` (with and without the fake local file)
- `npx cap sync ios`
- The xcodebuild test command in §2, with **no** `Signing.local.xcconfig` present
- `xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphonesimulator build`
- `xcodebuild -project App.xcodeproj -scheme App -configuration Release -showBuildSettings | grep -E "CODE_SIGN_STYLE|CODE_SIGNING_ALLOWED|DEVELOPMENT_TEAM"`. Report the output; the team must be empty.
- `plutil -lint` on `Info.plist` and `PrivacyInfo.xcprivacy`

## 8. Acceptance criteria (binary)
1. With no local signing file, Debug Simulator tests pass (all existing XCTest) and the Release Simulator build succeeds.
2. Every row of the §A8 settings table holds (checked by the config test).
3. `Info.plist` meets §B1. The privacy manifest matches `PRIVACY-AUDIT.md` entry for entry, and every audit row has evidence. The built bundle contains the manifest.
3b. The build-number logic and its tests meet §B3.
4. `testflight.sh` dry-run and preflight behave as in §C (checked by the config test).
5. No team ID is committed anywhere, and `Signing.local.xcconfig` is ignored.
6. The `InspectionPolicy` Release check still compiles to `false` (Release has no `DEBUG`).

## 9. Report format
JSON per `docs/codex-report-schema.json`, plus:
- the `showBuildSettings` lines for each §A8 case (only the synthetic team may appear);
- the final data-type list with a one-line reason for each;
- the XCTest count;
- the dry-run output (with the fake team shown as `ABCDE12345`).

Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB access, deploy, commit or push.
- No real archive or upload, and no Apple account sign-in.
- Don't run `npm run gate:web` (it reads the DB).
- Don't touch `.claude/launch.json` or `apps/mobile`.
