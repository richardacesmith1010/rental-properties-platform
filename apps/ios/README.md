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
`SceneDelegate.sceneWillEnterForeground` consumes that flag and reloads the main view once.
Ordinary app switching never reloads, regardless of the current URL.
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

`AppTests` covers navigation decisions, blank-target routing, one-shot Connect reloads, response classification,
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
10. Return from Connect; confirm one main-view reload. Switch apps again; confirm no reload.
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

## Send a TestFlight build

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
