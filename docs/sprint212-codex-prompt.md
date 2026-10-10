# Sprint 212 — iPhone app: ready for a real iPhone and TestFlight (L3, owner phone-app exception) · rev 1

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
  - If the simulator service is stale, run `killall -9 com.apple.CoreSimulator.CoreSimulatorService` first.

## 3. In scope
### A. Signing without committing the team ID
1. Add a committed `apps/ios/ios/App/Signing.xcconfig`:
   ```
   CODE_SIGN_STYLE = Automatic
   DEVELOPMENT_TEAM =
   #include? "Signing.local.xcconfig"
   ```
2. Add a committed `Signing.local.xcconfig.example` containing `DEVELOPMENT_TEAM = YOUR_TEAM_ID` and a one-line comment on where to find the ID (developer.apple.com → Account → Membership details → Team ID).
3. Add `apps/ios/ios/App/Signing.local.xcconfig` to the repo `.gitignore`.
4. **Debug config:** make `debug.xcconfig` `#include "App/Signing.xcconfig"` (fix the relative path to the real location).
5. **Release config:** add a new `release.xcconfig` (next to `debug.xcconfig`) that includes `Signing.xcconfig`, and set it as the App target's Release `baseConfigurationReference` (add the file reference to the project).
6. **Remove `CODE_SIGNING_ALLOWED = NO`** from the App target's Debug and Release. Leave the test target alone.
7. **Simulator builds and tests must still pass with no local signing file** and no team. If Xcode refuses this, set `CODE_SIGNING_ALLOWED[sdk=iphonesimulator*] = NO` in `Signing.xcconfig`, and report that you did.

### B. App Store requirements
1. `Info.plist`:
   - `UIRequiredDeviceCapabilities` → `arm64`;
   - add `ITSAppUsesNonExemptEncryption` = `false` (the app uses only standard HTTPS);
   - keep `NSCameraUsageDescription` as is.
   - If the repair-photo flow can save to the photo library, report it but add no new permission strings (the web file picker uses PHPicker, which needs none).
2. **Privacy manifest** `App/PrivacyInfo.xcprivacy`, added to the App target's Resources build phase:
   - `NSPrivacyTracking` = false, and `NSPrivacyTrackingDomains` = empty.
   - **`NSPrivacyCollectedDataTypes`:** use exactly these types. Each is Linked = true, Tracking = false, with purposes = [`NSPrivacyCollectedDataTypePurposeAppFunctionality`]:
     - `NSPrivacyCollectedDataTypeName`
     - `NSPrivacyCollectedDataTypeEmailAddress`
     - `NSPrivacyCollectedDataTypePhoneNumber`
     - `NSPrivacyCollectedDataTypePhysicalAddress`
     - `NSPrivacyCollectedDataTypePhotosorVideos`
     - `NSPrivacyCollectedDataTypeOtherFinancialInfo`
     - `NSPrivacyCollectedDataTypeUserID`
     - `NSPrivacyCollectedDataTypeOtherUserContent`
   - **`NSPrivacyAccessedAPITypes`:** grep **our** Swift files (`App/*.swift`) for required-reason APIs: `UserDefaults`, file timestamps, `systemUptime`, disk space. Declare only what our code uses, with Apple's matching reason code (`UserDefaults` → `CA92.1`). If none are used, give an empty array. Capacitor's SPM packages ship their own manifests; don't copy them.
3. **Build number:** don't edit the project. The upload script passes `CURRENT_PROJECT_VERSION=<UTC yyMMddHHmm>` to `xcodebuild archive`, which always increases and fits in 32 bits. `MARKETING_VERSION` stays `1.0`.

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
     - `-allowProvisioningUpdates` and `CURRENT_PROJECT_VERSION=<stamp>`;
   - `xcodebuild -exportArchive -exportOptionsPlist <generated> -exportPath "$BUILD_DIR/export" -allowProvisioningUpdates`.
4. **Export options:** generate the plist into `$BUILD_DIR` from the committed template `apps/ios/scripts/ExportOptions.template.plist`:
   - `method` = `app-store-connect`, `destination` = `upload`, `signingStyle` = `automatic`;
   - `teamID` = the team read from the local file;
   - `manageAppVersionAndBuildNumber` = false, `uploadSymbols` = true.
5. `--dry-run` prints every command with the stamp and **runs nothing** (no sync, no archive, no export).
6. At the end, print: `Uploaded build <stamp>. It appears in TestFlight in about 10–30 minutes.`

### D. README
Update `apps/ios/README.md` with two short sections, each a few numbered steps for a non-developer:
- **Put Domus on your iPhone:** open Xcode → set the team via the local xcconfig → plug in the phone → turn on Developer Mode → Run.
- **Send a TestFlight build:** run `apps/ios/scripts/testflight.sh`.

### E. Tests (`apps/ios/scripts/config.test.cjs`, extend it)
1. `Info.plist` has `arm64`, no `armv7`, and `ITSAppUsesNonExemptEncryption` false (parse with `plutil -convert json -o -`).
2. `PrivacyInfo.xcprivacy` exists, passes `plutil -lint`, contains exactly the 8 data types above with Tracking false, and is referenced in the App target's Resources build phase in `project.pbxproj`.
3. No committed file under `apps/ios` sets a non-empty `DEVELOPMENT_TEAM`, and `.gitignore` contains `Signing.local.xcconfig`.
4. The App target has no `CODE_SIGNING_ALLOWED = NO` in Debug or Release, and Release uses `release.xcconfig`.
5. `testflight.sh --dry-run`:
   - with a temp fake `Signing.local.xcconfig` (`DEVELOPMENT_TEAM = ABCDE12345`), it prints the archive and export commands with `-allowProvisioningUpdates` and a 10-digit stamp, and creates no archive;
   - with a missing or malformed team, it exits 1 with the exact message.
   - Clean up the temp file in a `finally` block.

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
2. Release `showBuildSettings` shows `CODE_SIGN_STYLE = Automatic`, signing allowed for device builds, and an empty team.
3. `Info.plist` and the privacy manifest meet §B exactly (checked by the config test).
4. `testflight.sh` dry-run and preflight behave as in §C (checked by the config test).
5. No team ID is committed anywhere, and `Signing.local.xcconfig` is ignored.
6. The `InspectionPolicy` Release check still compiles to `false` (Release has no `DEBUG`).

## 9. Report format
JSON per `docs/codex-report-schema.json`, plus:
- the `showBuildSettings` output lines;
- the XCTest count;
- the dry-run output (with the fake team shown as `ABCDE12345`).

Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB access, deploy, commit or push.
- No real archive or upload, and no Apple account sign-in.
- Don't run `npm run gate:web` (it reads the DB).
- Don't touch `.claude/launch.json` or `apps/mobile`.
