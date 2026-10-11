# Sprint 214 — iPhone app: Stripe return fix + device signing identity (L3, owner phone-app exception) · rev 2 (ChatGPT APPROVE WITH CHANGES: 3 required + optional 2, 3, 4 adopted)

## 1. Objective
Fix two problems found on the owner's real iPhone (2026-10-11):
1. **Stripe return reopens Stripe.**
   - The owner tapped the Stripe setup button. The web view navigated to `https://domusbase.com/connect/onboard`, which server-redirects to `https://connect.stripe.com/...`. `NavigationPolicy` sent that to Safari and set `pendingConnect`.
   - The web view was left blank (white).
   - On return, `reloadAfterConnectIfNeeded()` called `reload()`, which re-requested `/connect/onboard`, redirected to Stripe again, and opened Safari again.
2. **Device builds aren't signed.** The project-level `CODE_SIGN_IDENTITY = ""` (project.pbxproj lines ~262 and ~319) made a device build succeed **unsigned**, so install failed with "No code signature found". It only worked with the command-line override `CODE_SIGN_IDENTITY="Apple Development"` plus `-allowProvisioningDeviceRegistration`.

## 2. Context (HEAD `d1d94eb`, branch `main`)
- **Files:**
  - `apps/ios/ios/App/App/DomusNavigationDelegate.swift`: `pendingConnect`, `openOutsideApp`, `reloadAfterConnectIfNeeded`, and the test seams `MainWebViewLoading` and `NavigationOpening`;
  - `SceneDelegate.swift`: calls the reload on foreground;
  - `NavigationPolicy.swift`;
  - tests in `AppTests/NavigationPolicyTests.swift`.
- **Signing:** set up in Sprint 212 (`Signing.xcconfig` + the gitignored `Signing.local.xcconfig`; the owner's file now exists locally).
- **Real device available:** "Ace's iPhone" `00008150-001203DC1185401C`. Claude runs the device check; you only use the Simulator.
- **Simulator test command:** `cd apps/ios/ios/App && xcodebuild test -project App.xcodeproj -scheme App -destination 'id=C79BDA37-1967-45CB-A369-85B260EA111D'`.

## 3. In scope
### A. Return to the last safe Domus page
1. Track `lastSafeURL`: the URL of the **last committed main-frame navigation** (`didCommit` / `didFinish`) whose host is `domusbase.com` (the configured server host) and whose path does **not** start with `/connect/`.
   - Also exclude `/auth/` callback paths and the offline error document.
   - Its initial value is the app's start URL.
2. When `openOutsideApp` sends a Connect URL to Safari **for a main-frame navigation**, also load `lastSafeURL` in the main web view **right away**, so the app isn't left blank while the user is in Safari.
3. `reloadAfterConnectIfNeeded()`:
   - if `pendingConnect` is set, clear it and **load `lastSafeURL`** (not `reload()`), so updated Stripe status shows;
   - never re-request a `/connect/` URL;
   - a normal foreground with no pending Connect does nothing (unchanged).
4. If Stripe's `return_url` or `refresh_url` (`/connect/return`, `/connect/refresh`) opens in **Safari**, that's fine and unchanged. The app only needs to land on a normal Domus page when the user switches back.

### B. Device signing identity
1. In `Signing.xcconfig` add `CODE_SIGN_IDENTITY[sdk=iphoneos*] = Apple Development`. Remove the project-level `CODE_SIGN_IDENTITY = ""` (or make it so the xcconfig value wins; the effective device value must be `Apple Development`).
2. **Simulator:** unchanged. It must still build and test with **no** local signing file.
3. **README (`apps/ios/README.md`):**
   - document the device command: `xcodebuild ... -destination 'id=<device>' -allowProvisioningUpdates -allowProvisioningDeviceRegistration build`, then `xcrun devicectl device install app --device <id> <App.app>`;
   - say the first install registers the phone automatically.
4. **`config.test.cjs`:**
   - add the effective `CODE_SIGN_IDENTITY` checks: Debug and Release iphoneos = `Apple Development`, both with and without the synthetic local team;
   - check the iphonesimulator value doesn't break the no-team simulator build;
   - keep all 48 existing checks.

### C. Tests (XCTest, via the existing seams)
1. With a committed Domus page (`/owner`), a Connect redirect to Safari sets pending **and** immediately loads `/owner`. Return loads `/owner` once and clears pending.
2. With committed `/connect/onboard` (or `/auth/callback`), `lastSafeURL` stays the previous page.
3. A normal foreground does nothing.
4. A second foreground after the return does nothing.
5. If there was no prior safe page, the start URL is used.
6. Non-Connect external links (`mailto`, other sites) don't set pending and don't load anything.


### D. Rev 2 requirements (ChatGPT)
1. **What may become `lastSafeURL`:**
   - only a **successfully committed main-frame** navigation, on exactly `https` + the configured server host (no other scheme, no look-alike host like `domusbase.com.evil.com`, no subframes);
   - excluded paths: `/connect` itself, `/connect/*`, `/auth/*`, the offline document, and any URL whose navigation failed (`didFailProvisionalNavigation` / `didFail`).
   - **Fallback:** the configured start URL, validated with the same rule. If that's somehow invalid, use `https://domusbase.com/login`. Never a Stripe or `/connect` URL.
2. **One recovery, never a loop.** Invariant: *one Stripe launch, one safe-page recovery, at most one refresh after return, and never an automatic visit to `/connect/onboard`.*
   - When Connect opens in Safari: open Safari once. If the main web view is blank or stuck on a `/connect` route, load `lastSafeURL` once and mark recovery as done.
   - On foreground with pending Connect: load `lastSafeURL` exactly once (to show updated Stripe status), then clear pending. Repeated foregrounds do nothing.
   - XCTest asserts the **total** number of navigations across the whole flow (open → recover → foreground → foreground), not just the loads after foreground.
   - Also test returning without finishing Stripe (Safari cancelled): Domus stays usable and doesn't reopen Stripe.
3. **Prove signing on the real app:**
   - Debug and Release iphoneos resolve to `Apple Development` with `CODE_SIGNING_ALLOWED = YES` and Automatic style;
   - the simulator stays unsigned and needs no team;
   - **distribution export is unchanged:** archive/export with `method=app-store-connect` and automatic signing still re-signs with Apple Distribution. Don't hard-code a distribution identity; note this in the README.
   - Claude's device check runs `codesign --verify --deep --strict` on the built `.app` and installs it **without** any `CODE_SIGN_IDENTITY` command-line override. The report must separate config-test results from device results (Codex reports config only).
4. **README:** automatic device registration needs a signed-in Xcode account with provisioning permission; don't promise it always succeeds.
5. **Keep every existing navigation test.** The new cases add to them; nothing is replaced.

## 4. Out of scope
- Any web code (`/connect/*` pages) or `capacitor.config.ts`.
- Face ID, push, deep links.
- A real archive or upload.

## 5. Exact files expected to change
- `apps/ios/ios/App/App/DomusNavigationDelegate.swift`
- `apps/ios/ios/App/App/DomusBridgeViewController.swift` (only if wiring needs it)
- `apps/ios/ios/App/AppTests/NavigationPolicyTests.swift` (or a new `ConnectReturnTests.swift` added to the test target)
- `apps/ios/ios/App/Signing.xcconfig`
- `apps/ios/ios/App/App.xcodeproj/project.pbxproj`
- `apps/ios/scripts/config.test.cjs`
- `apps/ios/README.md`

## 6. Implementation requirements
- Swift: 4-space indent, `@MainActor` as today. Keep Capacitor's original delegate forwarding.
- No new dependencies.
- No team ID in any committed file.

## 7. Validation commands to run
- The Simulator XCTest command in §2
- `cd apps/ios && node scripts/config.test.cjs`. If your sandbox can't run `xcodebuild`, say so; Claude runs it.
- `xcodebuild -showBuildSettings` for Debug and Release iphoneos (report `CODE_SIGN_IDENTITY`)

## 8. Acceptance criteria (binary)
1. The §C XCTest cases exist and pass, and every existing XCTest passes.
2. The effective device `CODE_SIGN_IDENTITY` = `Apple Development`, and the simulator builds with no local signing file.
3. The config test passes (existing 48 checks + new ones).
4. The §D cases are covered by XCTest, including the total-navigation-count and Safari-cancel tests.
5. **Claude's real-device check:** tap the Stripe setup button → Safari opens and the app shows the prior Domus page (not white) → switch back → the Domus page appears once and Stripe doesn't reopen.

## 9. Report format
JSON per `docs/codex-report-schema.json`, plus the XCTest count. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB access, deploy, commit or push. No real archive or upload.
- Don't run `gate:web`.
- Don't touch `.claude/launch.json` or `apps/mobile`.
