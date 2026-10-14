# Domus for iPhone

This is a Capacitor 8 shell for the live Domus website, with local automatic signing.
Deployment target: **iOS 15.0**. Device family: **iPhone only**. Orientation: **portrait**.
The Xcode scheme is **App**. The Apple team ID belongs only in your ignored local signing file.
Notifications remain off. No database changes are needed.

## Architecture exception

The owner approved remote production loading on October 9, 2026.
`server.url` defaults to `https://domusbase.com/login`.
`apps/web/app/login/page.tsx` redirects signed-in users via `getRoleHomePath(role)`.
Domus uses server rendering, httpOnly cookies, and Next.js server actions.
It cannot be bundled or statically exported for this shell.

[Capacitor configuration documentation](https://capacitorjs.com/docs/config)
labels `server.url` and `allowNavigation` as live-reload facilities.
Using them in production is this sprint's explicit architecture exception.
The bundled website contains only the offline page and its redirect.
WebKit's persistent website data store retains the website's session cookies.
No credentials or service keys belong in this project.

## Native navigation

`DomusBridgeViewController.capacitorDidLoad()` installs `DomusNavigationDelegate`.
It implements WKNavigationDelegate and WKUIDelegate.
`NavigationPolicy.swift` owns the pure, exact-host decision function.
Capacitor's `allowNavigation` contains the same four production hosts.
The stricter native delegate replaces Capacitor's permissive URL decisions.
It forwards remaining lifecycle and dialog callbacks to Capacitor's original delegate.

| Top-level destination | Behavior |
| --- | --- |
| `https://domusbase.com` | Stay in app |
| `https://checkout.stripe.com` | Stay in app |
| `https://hooks.stripe.com` | Stay in app |
| `https://pay.stripe.com` | Stay in app |
| HTTP versions of those four hosts | Reject |
| Other HTTP(S), including Connect and `www.domusbase.com` | Open Safari |
| `mailto:`, `tel:`, `sms:` | Open system handler |
| Other schemes, malformed or scheme-less URLs | Reject |
| Subframes and resources | Leave unrestricted |

Hostnames are parsed, lowercased, and compared exactly.
Lookalike suffixes and unlisted subdomains never enter the app.
WebKit resolves relative link syntax before giving native delegates URLs.
The pure policy rejects protocol-relative inputs without a scheme.

Actions and final responses are checked, including redirect destinations.
Blank-target Domus and Stripe links load in the main web view.
GET requests are preserved; non-GET requests load their URL with GET.
External and system destinations use their normal handlers.
Rejected destinations do nothing. No second web view is created.

Two narrowly scoped internal exceptions exist:
- Capacitor's exact bundled `offline.html` URL can load.
- The exact configured startup URL can load at startup.

Neither exception adds a production host wildcard.
Domus-origin blob downloads enter the download delegate, never page navigation.

Connect onboarding opens Safari. Users return to Domus themselves.
`DomusNavigationDelegate` sets a pending flag for HTTPS Connect external opens.
The delegate remembers the last committed main-frame HTTPS page on the configured server host,
excluding `/connect`, `/connect/*`, `/auth/*`, the offline document and failed navigations.
It falls back to the validated configured start URL, or `https://domusbase.com/login`.
If the main view is blank or left on Connect, the handoff immediately loads that safe page once.
Duplicate handoff callbacks do not reopen Safari or repeat recovery.
`SceneDelegate.sceneWillEnterForeground` consumes the pending flag and loads the safe page once
to refresh Stripe status, including when the user cancels onboarding. It never reloads a Connect URL.
Ordinary app switching never refreshes, regardless of the current URL.
Stripe return/refresh URLs may remain in Safari; switching back keeps Domus usable.
This uses the generated Capacitor 8 scene lifecycle, without a JavaScript hook.
There is no `@capacitor/browser` dependency or Safari sheet.

## Files and photos

`DownloadHandler` implements WKDownloadDelegate for authenticated response downloads.
Attachments, PDFs, and CSV responses become downloads before page replacement.
WKDownload uses the web view's session, including httpOnly cookies.
Each download gets a unique temporary directory.
Content-Disposition supplies the filename; path traversal is stripped.
UTF-8 `filename*` takes precedence over `filename`.

Completion presents UIActivityViewController through the `DownloadPresenting` protocol.
Users can save, share, or cancel using the standard sheet.
Completion and cancellation both remove the temporary directory.
Failures show: **Download failed. Try again.**
Navigation cancellation does not replace the current page with an error page.

### CSV fallback

The web's `downloadReportCsv` posts CSV text and its filename natively.
It uses `window.webkit.messageHandlers.domusShareCsv`, registered by this shell.
The older analytics CSV helper now reuses that download function.
Ordinary browsers retain the existing Blob/link download behavior.

This fallback covers the iOS 15 minimum deployment target.
[WebKit issue 216918](https://bugs.webkit.org/show_bug.cgi?id=216918)
documents older WKWebView blob-download failures, resolved on later iOS versions.
Other Domus-origin blob downloads use WKDownload where WebKit supports them.

The message handler checks the main frame's actual HTTPS origin.
Only `domusbase.com` on its default HTTPS port can share CSVs.
The user-agent marker never grants authorization or changes server security.
No code depends on `window.Capacitor` runtime globals.

Repair photo inputs use WebKit's native file picker unchanged.
Users can choose existing photos or use the camera capture option.
Only `NSCameraUsageDescription` is added:
**Take photos of problems to send to your landlord.**
No photo-library permission string or other permission is requested.
Simulator photo-library testing and physical camera testing remain required.

## Offline, appearance, and web detection

Capacitor's `server.errorPath` points to bundled `offline.html`.
Native failure handling loads it for failed page navigations.
The heading is **Can't reach Domus right now.**
Its retry button always loads `https://domusbase.com`.
There is no offline data store or cached business workflow.

The icon is an opaque 1024px blue-and-white house.
Launch assets include white and `#121316` backgrounds.
The splash auto-hides after 1.5 seconds, without a readiness handshake.
The status bar uses DEFAULT and follows the system appearance.
Safe-area layout remains the web app's responsibility.

`DomusApp/1` is appended to the web view user agent.
The server renders `domus-native` directly on the root HTML element.
The app suppresses service-worker registration and both install surfaces.
Native CSS removes tap highlighting and link/button long-press callouts.
Landing headers and login containers receive native-only top safe-area padding.
Dashboards retain their existing single inset in `MobileTopBar`.
`native-app-server.ts` isolates `next/headers` from the client helper.

## Reproduce and run

Requirements: Node 24, Xcode 26+, and an installed iPhone Simulator runtime.
Run these commands from `apps/ios`:

```sh
npm ci
npx cap sync ios
npm run assets
npm run open
```

Choose **App**, then **iPhone 18 Pro**, and press Run in Xcode.
No team selection or signing is needed for the Simulator.
The project uses Swift Package Manager; CocoaPods is not used.
TypeScript is a development dependency because Capacitor loads a TS configuration.
Sharp renders the shared SVG; Capacitor Assets generates the native catalog.
The asset script also creates the four web installation icons.
The root npm workspace list remains unchanged.

Command-line validation, still from `apps/ios`:

```sh
node --test scripts/config.test.cjs
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -sdk iphonesimulator -configuration Debug build
xcodebuild test -project ios/App/App.xcodeproj -scheme App \
  -destination 'id=C79BDA37-1967-45CB-A369-85B260EA111D'
```

`AppTests` covers navigation decisions, blank-target routing, safe Connect recovery/return, response classification,
server filenames, file cleanup, CSV sharing, and failure presentation.
Build output, synced web copies, dependencies, and user data are ignored.

### CAP_SERVER_URL

```sh
CAP_SERVER_URL=https://domusbase.invalid npx cap sync ios
```

This should show the offline page after launch fails.
HTTPS URLs and HTTP localhost/127.0.0.1 URLs are accepted.
Other HTTP hosts, credentials, and invalid URL syntax throw during configuration.
`cleartext` remains false. No App Transport Security exception is added.
HTTP localhost acceptance is configuration validation, not an ATS bypass.
Only the startup request receives the development URL exception.
The normal production navigation policy remains unchanged afterward.

Restore the production configuration before building the normal app:

```sh
npx cap sync ios
```

## Submission boundary

**This sprint is not App Store submission-ready.**
Before submission, a separately reviewed sprint must demonstrate app-specific utility.
Guideline 4.2 evidence must include biometric re-entry, actionable native push,
native photo capture/upload, native file/share flows, and universal links.
That sprint must document the utility for App Review.
It must provide a reviewer account and verify major physical-iPhone workflows.
Signing and the TestFlight script are prepared. A real signed archive, upload, physical-device install,
and App Store Connect records were not performed or created by Sprint 212.
Account deletion, native features and Guideline 4.2 compliance remain future work.

## Required runtime verification

1. Run on iPhone 18 Pro; inspect icon, splash, login, and status bar.
2. Inspect light and dark appearances, including existing web theme choices.
3. Sign in, force-quit, relaunch, and confirm session persistence.
4. Sign out, force-quit, relaunch, and confirm the signed-out state.
5. Walk Home, Rent, Clients, and Messages for each applicable role.
6. Download owner statement PDF/CSV; share, cancel, and retry.
7. Export a report CSV; confirm its filename and readable contents.
8. Attach a repair photo from the library and submit it.
9. Open mail, external links, and Stripe Connect; verify system routing.
10. Open Connect from an owner page; confirm Safari opens once and Domus keeps a usable page. Return (also try cancelling); confirm one safe-page refresh and no Stripe reopen. Switch apps again; confirm no refresh.
11. Perform test Checkout when payable smoke rent exists; verify session retention.
12. Start offline, restore networking, and tap Try again.
13. Test the unreachable host override, then restore the production configuration.
14. Drop networking after load, navigate, and record the resulting offline behavior.
15. Verify the separately deployed web changes with smoke, CI, and Sentry.

Deployment and authenticated runtime walks were not performed by this sprint.

## Put Domus on your iPhone

1. Open `apps/ios/ios/App/App.xcodeproj` in Xcode. Copy `Signing.local.xcconfig.example` to `Signing.local.xcconfig` in that same App folder. Replace `YOUR_TEAM_ID` with the Team ID at developer.apple.com → Account → Membership details. Keep this local file private; it is ignored by git. Don't enter your team into the shared project settings.
2. Add your Apple Developer account in Xcode → Settings → Accounts. Plug in your iPhone, unlock it and choose **Trust this computer** if prompted. Enable **Settings → Privacy & Security → Developer Mode** on the phone and follow its restart instructions.
3. In Xcode select **App**, choose your connected phone, and press **Run**. On the first run, Xcode may download device support and create a signing profile. These steps are normal. Simulator runs do not need a local signing file or an Apple account.

Command-line device build and install, from `apps/ios/ios/App`:

```sh
xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
  -destination 'id=<device>' -derivedDataPath build/device \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
codesign --verify --deep --strict build/device/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device install app --device <id> build/device/Build/Products/Debug-iphoneos/App.app
```

For the first install, the build can register the phone automatically. This requires a signed-in
Xcode account with permission to manage provisioning; registration can fail if permissions or
Apple's services are unavailable. Both Debug and Release device builds resolve to
`Apple Development`, with automatic signing enabled, without a command-line identity override.
Simulator signing remains disabled and requires no team or local signing file.
Config tests verify these effective settings; real-device signature verification and installation
are separate checks, not proven by config tests.

## Send a TestFlight build

Distribution export is unchanged: archiving and exporting with `method=app-store-connect`
and automatic signing lets Xcode re-sign with Apple Distribution. Do not hard-code a distribution
identity. Device development signing does not replace distribution signing at export.

1. Once, create the App Store Connect app record for **com.domusbase.app**, using your Apple Developer account. Set up the local signing file and Xcode account as above. Review [PRIVACY-AUDIT.md](PRIVACY-AUDIT.md), including its unverified items. This script does not make the app App Store-compliant.
2. Before uploading from a new computer, check App Store Connect → TestFlight for the latest build. `build-number.txt` records the last confirmed upload (initial baseline `1`; build 1 was never uploaded). The first normal upload uses `2`. If another computer uploaded a higher number, use `--build N` with a number above both the counter and App Store Connect's latest build.
3. From the repository root run `apps/ios/scripts/testflight.sh`. From another folder use the script's full path. It syncs the app, archives Release and uploads automatically. Review any uncommitted changes before choosing `--allow-dirty`. For a preview use `apps/ios/scripts/testflight.sh --dry-run`: it validates local inputs and prints the plan with `<team>`, without running Xcode, sync, archive or upload, writing files, or signing in.
4. When the script says **Upload submitted**, check App Store Connect for processing status. Commit `apps/ios/build-number.txt` afterward so the next computer uses a higher build. App version stays **1.0**; build numbers are positive integers of at most 9 digits.
5. If an upload is interrupted or its status is unknown, the next run is blocked by `build-number.pending`. Check App Store Connect first, then run `apps/ios/scripts/testflight.sh --resolve uploaded` to advance the counter, or `--resolve not-uploaded` to clear only the pending guard. These commands do not upload. Do not guess. A second concurrent run is blocked by `testflight.lock`; after a forced kill, remove that ignored lock directory only after confirming no upload is still running.

Success requires exit status 0 and the exact `** EXPORT SUCCEEDED **` line. This line is present
in the installed Xcode 27.0 (27A266a) `IDEDistribution` binary; `xcodebuild -help` confirms
`-exportArchive`, `app-store-connect` and `destination=upload`. No real export was run to test
Apple's acceptance. Failed/ambiguous export or counter-save failure retains the pending guard.
Sync/archive failures occur before that guard is written. Generated export options contain the
team; terminal and export logs redact it. `build/testflight` is cleared before each real upload.

Local regression checks (no DB, no real archive/upload):

```sh
cd apps/ios
node scripts/config.test.cjs
bash -n scripts/testflight.sh
```

The config suite uses isolated fake upload tools and real Xcode settings/unsigned Release
build checks. It never archives or uploads with real Xcode. Real Xcode checks need a working
local Xcode/Simulator service and writable developer caches. Failures remain failures, not skips.
The suite requires `Signing.local.xcconfig` to be absent and refuses to overwrite it. Temporarily
preserve your existing file outside the project before testing, then restore it afterward.

## Face ID

When Face ID is on, Domus asks for Face ID every time it starts and every time it comes back from the background.
Short interruptions that do not leave the app (Control Center, alerts, the camera) only show a privacy cover.
This is a lock on this iPhone, not a server check: your sign-in stays in iOS's protected app storage, and Face ID does not encrypt it.

The password is never stored. Auth cookies stay in WebKit's default persistent store; they are never copied, moved, or rewritten.
Password fallback deletes only Domus Supabase auth cookies, verifies deletion, then loads `/login`.
The overlay remains until that main-frame commit and a second cookie check succeed. Failure or a 10-second timeout keeps it locked.
After a failed sign-out, backgrounding or a biometric success cannot bypass the required login commit, even if cookies are gone.
Face ID stays enabled after fallback. A successful biometric check with missing or changed enrollment state also signs out.
Canceling or failing a biometric check does not count as an enrollment change.

| Event | Phase and effects |
| --- | --- |
| Cold launch, enabled and signed in | `locked`; show lock before loading the page |
| Cold launch otherwise | `open` |
| Resign active from open | `covered`; privacy cover, no prompt |
| Enter background, enabled and signed in | `locked` synchronously; invalidate attempt; reset automatic prompt |
| Enter background otherwise | `covered`; retain privacy cover |
| Become active from covered | `open`; remove cover; run pending Connect reload |
| Become active from locked, first time | `authenticating(attempt)`; one automatic prompt |
| Become active after prompt, or while authenticating | No new prompt |
| Tap unlock from locked | `authenticating(attempt)`; retry |
| Matching attempt succeeds with unchanged enrollment | `open`; remove overlay; run pending Connect reload |
| Matching attempt succeeds with nil or changed enrollment | `signingOut`; keep opaque overlay |
| Matching attempt cancels or fails | `locked`; clear message |
| Biometrics unavailable, unenrolled, or locked out | `locked`; show password fallback message |
| Stale biometric result | Ignore |
| Tap password | `signingOut`; disable controls; retain enabled setting |
| Signing out, any biometric or lifecycle event | Keep overlay; ignore biometric results |
| Sign-out completes, cookies absent and login committed | `open`; signed out; remove overlay |
| Sign-out error or timeout | `locked`; retry remains available |
| Auth cookie read completes | Update signed-in setting from cookies only, never from the URL |
| Enable confirmed with non-nil enrollment state | Persist enabled, offered, and enrollment state |
| Enable confirmed with nil state | Stay off |
| Disable | Clear enabled and enrollment state |
| Offer answered, including Not now | Persist offered; Settings remains available |

`AppLock` is a deterministic reducer. Its controller supplies attempt IDs and executes effects on the main thread.
A success that arrives during an inactive interruption retains the privacy cover until the scene becomes active.
Connect reloads are released only from an open phase; the navigation delegate consumes its pending flag exactly once.

**Cold-launch hook:** Capacitor 8's final `loadView` creates its WKWebView without loading its initial URL.
`SceneDelegate` supplies the app window before loading the bridge view.
`DomusBridgeViewController.viewDidLoad` installs the scene's dedicated lock window before calling `super.viewDidLoad()`.
The lock window sits above presented sheets. All overlay modes hide web accessibility; unlocking restores it.
Message updates announce themselves to VoiceOver.

The offer appears once after a signed-in main-frame commit and a cookie read. Settings → Security can enable or disable it later.
Touch ID devices get the Touch ID copy, including the offer, lock buttons, Settings label, and timeout message.
Bridge requests require the trusted HTTPS Domus main frame and current page, and use correlated JSON replies.

### Simulator verification

1. Launch on the iPhone simulator; choose **Features → Face ID → Enrolled**.
2. Sign in, choose **Use Face ID**, then **Features → Face ID → Matching Face**.
3. Background and return. Verify the opaque lock appears, then use **Matching Face** to open Domus.
4. Repeat using **Features → Face ID → Non-matching Face**. The page must remain inaccessible.
5. Cancel; confirm no automatic re-prompt. Tap **Open with Face ID** to retry.
6. Open and close Control Center, an alert, and the camera/photo picker without backgrounding.
   Verify cover/uncover only. Backgrounding during a prompt must invalidate its result.
7. Kill and relaunch the app. Verify the page never flashes before the lock appears.
8. With VoiceOver on, verify the underlying page is unreachable while covered or locked.
   Check large Dynamic Type, light/dark appearance, and both lock actions.
9. Tap **Sign in with password**. Verify the cover remains until `/login` loads; cookies unrelated to auth survive.
   Offline navigation must remain locked and allow another password attempt.
10. Exercise a Stripe Connect Safari return: no reload before successful unlock, exactly one reload afterward.
11. In Settings → Security, toggle Face ID off/on; verify only correlated replies change the switch.
    Check Atlas Light, Noctis Neon, and Imperium Night; browser-only Settings must have no biometric row.
12. Change biometric enrollment and return. A successful check with changed/unknown domain state must require the password.
    Confirm enrollment changes on physical hardware as well; simulator enrollment does not model every hardware behavior.

For local-only native tests, temporarily omit `server.url` from the generated, ignored `App/capacitor.config.json`
so the test host loads bundled content; restore it afterward. Do not use live cookies or tokens in fixtures.


## Connect a bank (Plaid)

The App target uses LinkKit **7.2.2**, with SPM's Up to Next Major requirement starting at 7.2.2.
The package is `https://github.com/plaid/plaid-link-ios-spm`, product `LinkKit`.
The public `PlaidLinkSession` API has `open(using:)` and `sheet()`, but no Universal Link continuation method.
Keep the session retained through OAuth and lock/unlock. LinkKit handles its own return.
See [Plaid iOS: Standard Link](https://plaid.com/docs/link/ios/#standard-link).

The trusted HTTPS Domus main frame posts `{action: "open", requestId, linkToken}` to `domusPlaidLink`.
The native bridge replies through the `domus-plaid-link` CustomEvent with the same `requestId`:

- Success: `{requestId, status: "success", publicToken, accountIds}`.
- Cancellation: `{requestId, status: "exit"}`.
- Error or an overlapping request: `{requestId, status: "error"}`.

The page uses the existing finish actions. Native sessions never use `domus.plaidLink` localStorage.
Old builds without the handler retain the computer fallback. Replies time out silently after 30 minutes.
Each native session binds to the committed document and SHA-256 hashes of the auth-cookie value set.
Navigation, changed auth, or signing out drops its reply and releases the session.
Only event names and `plaid_link_reply_dropped` are logged; tokens and account IDs are never logged.

### Universal Links and deployment settings

`/.well-known/apple-app-site-association` serves JSON without authentication or redirects.
It claims only `/owner/bank/oauth-app`. Mobile Safari keeps `/owner/bank/oauth`.
`App/App.entitlements` enables `applinks:domusbase.com` in Debug and Release.
The fallback page requires owner auth and links back to `/owner/bank`.

Configure these after review; local implementation does not change live settings:

- `APPLE_APP_ID`: the deployment team's app identifier, ending in `.com.domusbase.app`.
  The prefix must contain ten uppercase letters or digits. Never commit the real value.
- `PLAID_REDIRECT_URI_IOS`: exactly `https://domusbase.com/owner/bank/oauth-app`.
  Both create and update modes fail before calling Plaid when this is absent or invalid.
- `PLAID_REDIRECT_URI`: keep the existing web `/owner/bank/oauth` URI.
- Existing `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `NEXT_PUBLIC_APP_URL`, and `BANK_TOKEN_KEY` remain required.

An active Plaid return never navigates the web view or forwards to Capacitor's proxy.
Capacitor 8.5.3's `CAPSceneDelegateProxy` posts `capacitorOpenUniversalLink`;
`AppPlugin.handleUniversalLink` turns that into `appUrlOpen`, which can compete with Link.
Without an active session, including process death, the return loads `/owner/bank` and forwards normally.
An app restart cannot resume an in-memory Link session.

### Lock window

The cover uses one reused `UIWindow` per scene, at `.alert + 1`, rooted in `LockViewController`.
It covers Link and presented share sheets. Unlock hides the window and restores the bridge window as key.
The hidden lock window never becomes key. Covered web content remains hidden from accessibility.
Real scene lifecycle events still drive Sprint 227's policy, including stale biometric checks and sign-out coverage.
There is no OAuth grace period or synthetic background event.

### Sandbox Simulator checks

Use a separately configured Plaid Sandbox environment and synthetic bank credentials.
Never connect a real bank or send notifications for local testing.
For native unit tests, omit `server.url` from the generated ignored Capacitor config temporarily;
restore it afterward. This keeps the test host on bundled content.

```sh
cd apps/ios/ios/App
xcodebuild -resolvePackageDependencies -project App.xcodeproj -scheme App
xcodebuild test -project App.xcodeproj -scheme App \
  -destination 'id=C79BDA37-1967-45CB-A369-85B260EA111D'
```

In a Sandbox app session, use **Connect a bank** and complete a test institution's flow.
Confirm selected accounts reach the bank page. Test **Sign in again** with a Sandbox item requiring login.
Cancel Link, retry after an error, and repeat with Face ID enabled.
Check matching uploaded accounts, light/dark appearance, large text, and VoiceOver.
Plaid notes Universal Links can be unreliable on Simulator; these checks do not prove device OAuth handoff.

### Physical-iPhone deployment checklist

- [ ] Verify AASA returns 200 JSON directly, anonymously, with the correct app ID and app-only path.
- [ ] Verify the signed app's Associated Domains entitlement and Apple provisioning.
- [ ] Register the exact iOS redirect URI in the Plaid dashboard.
- [ ] Confirm Navy Federal and Fidelity OAuth handoffs and return on a physical iPhone.
- [ ] Check both **Connect a bank** and **Sign in again**, cancellation, retry, and account selection.
- [ ] Confirm mobile Safari's `/owner/bank/oauth` flow stays in Safari.
- [ ] Complete the matrix below with Face ID enabled, including failed unlock and password fallback.
- [ ] Confirm the hidden lock window does not capture taps or keyboard input after unlocking.

| Test | Expected behavior |
| --- | --- |
| In-app OAuth sheet, inactive only | Privacy cover; no lock; same Link session remains usable. |
| App-to-App OAuth | Actual background locks immediately; unlock reveals the retained session. |
| Background/foreground return | Lock covers Link; one auto-prompt; no competing page navigation. |
| Process-death recovery | Cold Universal Link opens banks; no claim of resuming the old session. |

AASA availability, Plaid dashboard URI registration, and physical-iPhone OAuth success are **deployment gates**.
They must be checked after deploy. Local unit tests and Simulator tests do not prove those outcomes.
