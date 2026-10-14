# Sprint 227 — iPhone app: open Domus with Face ID (L3, owner phone-app exception) · rev 3 (rev 1 REJECT → rev 2 APPROVE WITH CHANGES → 4 required + optional 1, 3, VoiceOver adopted)

**rev 1 → ChatGPT REJECT.** Rev 1 moved auth cookies between WebKit and the Keychain on every background. That is non-atomic and races with token refresh and lifecycle events, so it couldn't honestly meet its own security claim. Rev 2 is a **biometric app lock**, the pattern banking apps use:
- **The lock:** Face ID gates the *screen* every time Domus opens or returns.
- **The session:** it stays in WebKit's normal storage, which iOS Data Protection protects. **No cookie is moved, copied or rewritten.**
- **The claim** (in docs, in the questionnaire, and to users) is exactly this, and nothing stronger.

Rev 2 also adopts ChatGPT's required items that still apply: synchronous locking, lifecycle race tests, the message-handler provenance tests, and cover-before-web-view at cold launch. It adopts the optional item on Face ID enrollment changes too, as a fail-closed sign-out.

## 1. Objective
On the iPhone app (`apps/ios`, Capacitor 8 shell around https://domusbase.com), a signed-in user who turns on Face ID (or Touch ID) must pass Face ID **every time Domus comes to the screen**: at cold launch and on return from the background. Until then, a full-screen lock view covers the web view.
- **Fallback:** "Sign in with password" removes the auth cookies and opens the normal sign-in page.
- **Opt-in:** offered once after the first sign-in on the device. It can be turned on or off in **Settings → Security**.
- **Enrollment changes:** if the device's Face ID enrollment changes after opt-in (a new face added), Domus signs out and asks for the password. This fails closed.
- **The password is never stored.**

**Security claim (exact, for README):** "When Face ID is on, Domus asks for Face ID every time it starts and every time it comes back from the background. Short interruptions that do not leave the app (Control Center, alerts, the camera) only show a privacy cover. This is a lock on this iPhone, not a server check: your sign-in stays in iOS's protected app storage, and Face ID does not encrypt it."

## 2. Context (HEAD `0c2a6ba`, branch `main`)
- **Shell files** (`apps/ios/ios/App/App/`):
  - `SceneDelegate.swift` (29 lines). `sceneWillEnterForeground` calls `reloadAfterConnectIfNeeded()`, which handles the Stripe Connect Safari return.
  - `DomusBridgeViewController.swift` (36, a `CAPBridgeViewController` subclass that installs the delegate in `capacitorDidLoad`).
  - `DomusNavigationDelegate.swift` (268): WKNavigationDelegate/WKUIDelegate, plus the `domusShareCsv` script message handler with an origin check on the HTTPS `domusbase.com` main frame.
  - Also `DownloadHandler.swift`, `NavigationPolicy.swift` and `Info.plist` (only `NSCameraUsageDescription` today).
  - Tests live in `ios/App/AppTests/`.
- **iOS:** iOS 15.0 minimum, iPhone only, scene lifecycle. User agent gets `DomusApp/1`.
- **Session:** Supabase SSR cookies on `domusbase.com`, named `sb-vawqdqkaguhdgfhdebqw-auth-token`, optionally chunked as `.0`, `.1`. They are httpOnly and live in WebKit's default persistent store.
- **Signed-in pages:** paths start with `/owner`, `/manager`, `/tenant` or `/settings`. `/login` and `/` are signed-out pages.
- **Web:**
  - `apps/web/app/settings/page.tsx` has a `security` section whose content is `<PasswordSettings />`.
  - `apps/web/lib/native-app.ts` has `isNativeApp()`, for presentation only.
- **Simulator:** `iPhone 18 Pro`, id `C79BDA37-1967-45CB-A369-85B260EA111D`.

## 3. In scope
### A. Pure lock logic: new `AppLock.swift` (no UIKit/WebKit/LocalAuthentication imports, ≤ 200 lines)
1. **Persisted settings** go through an injected `LockSettingsStoring` protocol (UserDefaults in the app, a fake in tests):
   - `enabled` (`domus.faceId.enabled`);
   - `offered` (`domus.faceId.offered`);
   - `signedIn` (`domus.faceId.signedIn`). **Authority = the auth cookie, never the URL.** The controller sets it from `WKHTTPCookieStore`: true as soon as a cookie matching §3.C.2's pattern is observed (`WKHTTPCookieStoreObserver.cookiesDidChange` plus a read after each main-frame commit); false **only** after a read confirms no auth cookie remains. Default when unknown: true (conservative);
   - `enrollmentState: Data?` (`domus.faceId.domainState`, the `LAContext.evaluatedPolicyDomainState` saved at opt-in).
2. **`phase`:**
   - `.open`;
   - `.covered` (privacy cover, no prompt);
   - `.locked` (lock view, waiting);
   - `.authenticating(attempt: UUID)`;
   - `.signingOut` (opaque lock view stays; buttons disabled; every biometric result is ignored).
3. **`autoPromptUsed: Bool`:** reset on each new lock.
4. **Events → (new phase, effects).** Effects are an enum the controller performs:
   - `showCover`, `showLockView`, `hideOverlay`;
   - `startBiometric(attempt)`, `showMessage(String?)`;
   - `signOutToLogin`, `runPendingConnectReload`, `saveSettings`.

| Event | Rule |
|---|---|
| `coldLaunch` | If `enabled && signedIn`: phase `.locked`, `showLockView`. The overlay must be in place before the web view is ever visible (§3.C.2). Otherwise `.open`. |
| `willResignActive` | If `.open`: `.covered`, `showCover`. If already `.locked`/`.authenticating`: no change. |
| `didEnterBackground` | **Synchronous.** If `enabled && signedIn`: `.locked`, `showLockView`, `autoPromptUsed = false`, and **cancel any in-flight attempt** (its id becomes stale). Else stay `.covered`. |
| `didBecomeActive` | `.covered` → `.open`, `hideOverlay`, `runPendingConnectReload`. `.locked` with `autoPromptUsed == false` → `autoPromptUsed = true`, `.authenticating(new)`, `startBiometric`. `.locked` with `autoPromptUsed == true` → no change. `.authenticating` → no change. |
| `unlockTapped` | `.locked` → `.authenticating(new)`, `startBiometric`. |
| `biometricResult(attempt, result)` | **Ignored unless `attempt` equals the current `.authenticating` id.** This handles results that arrive after another lifecycle transition. `success(domainState)`: if `domainState` is nil, or the saved `enrollmentState` is nil, or they differ → `.signingOut`, `signOutToLogin` (enrollment changed or unknown; fail closed). Else `.open`, `hideOverlay`, `runPendingConnectReload`. Only `success` is ever compared; cancel or fail never counts as an enrollment change. `cancelled`/`failed`: `.locked`, `showMessage(nil)`. `lockout`/`notAvailable`/`notEnrolled`: `.locked`, `showMessage("<Kind> is locked. Sign in with your password.")`. |
| `passwordTapped` | `.signingOut`, `signOutToLogin`. **`enabled` stays true.** |
| `signOutFinished(ok)` | Only from `.signingOut`. `ok` (cookie deletions done **and** the `/login` main-frame commit observed): `signedIn = false`, `.open`, `hideOverlay`. Not `ok` (a deletion or navigation error, or no `/login` commit within 10 s): `.locked`, `showLockView`, `showMessage(nil)`. **The web view is never revealed**; the user can tap "Sign in with password" again. |
| `authCookieObserved(present)` | `present` → `signedIn = true`. Not present (confirmed read) → `signedIn = false`. The URL never changes `signedIn`. |
| `enableConfirmed(domainState)` | Only if `domainState` is non-nil: `enabled = true`, `offered = true`, `enrollmentState = domainState`. Nil → no change (stays off). |
| `disableRequested` | `enabled = false`, `enrollmentState = nil`. |

5. **The Connect reload** (`runPendingConnectReload`) never runs while the phase is `.locked` or `.authenticating`. `SceneDelegate` no longer calls it directly; `AppLock` triggers it on `.open`.
6. **`shouldOfferFaceId(offered:, biometricsAvailable:, url:)`** (pure) is true iff all of these hold:
   - not `offered`;
   - biometrics are available;
   - the URL is HTTPS `domusbase.com` with a signed-in path.

   The offer sets `offered = true` whichever answer is chosen. **"Not now"** sets `offered = true` too. The feature stays in Settings.

### B. Biometric adapter: new `BiometricAuth.swift` (≤ 100 lines)
- **Protocol** `BiometricAuthenticating`: `availability() -> (kind: .faceId | .touchId | .none, available: Bool)` and `authenticate(reason:, completion: (BiometricResult) -> Void)`.
- **Real implementation:** a fresh `LAContext` per attempt, `.deviceOwnerAuthenticationWithBiometrics`, `localizedReason` "Open Domus", `localizedFallbackTitle = ""` (no passcode fallback; our fallback is the Domus password).
- **Results:**
  - `LAError` codes map to `success(domainState)`, `cancelled` (userCancel, appCancel, systemCancel), `failed`, `lockout`, `notAvailable`, `notEnrolled`;
  - completion is delivered on the main thread.

### C. UI and wiring
1. **`LockViewController`** (new, ≤ 150 lines):
   - **Lock mode:** a full-screen opaque view in the system background color, with the app icon, the title "Domus is locked", a primary button "Open with Face ID"/"Open with Touch ID", a plain button "Sign in with password", and a message label (VoiceOver-readable, live region).
   - **Cover mode:** the same view without buttons or message.
   - **Layout:** 44pt minimum targets; Dynamic Type; correct in light and dark.
2. **`AppLockController`** (new, ≤ 200 lines): owns `AppLock`, `BiometricAuthenticating`, the overlay and the effects.
   - **Overlay:** a child view controller of `DomusBridgeViewController`, pinned to all edges, above the web view.
   - **Cold launch:** add the overlay in `viewDidLoad`, before `super.viewDidLoad()` returns the web view to screen. Choose the hook that guarantees the overlay is in the hierarchy before the first frame shows the web view, and explain it in the README.
   - **`signOutToLogin`:**
     - delete the cookies matching `^sb-[a-z0-9]+-auth-token(\.[0-9]+)?$` on domain `domusbase.com` (with or without a leading dot) from `WKWebsiteDataStore.default().httpCookieStore`;
     - when all deletions finish, load `https://domusbase.com/login`;
     - report `signOutFinished(ok)` per §3.A.4;
     - log nothing about cookie values.
   - **VoiceOver:** while any overlay is shown, set `webView.accessibilityElementsHidden = true` (restore it on `hideOverlay`), so VoiceOver can't reach the page underneath.
3. **`SceneDelegate`:** forward `sceneWillResignActive`, `sceneDidEnterBackground`, `sceneDidBecomeActive` and `sceneWillEnterForeground` to the controller. Remove the direct Connect reload call; the controller owns it now (§3.A.5).
4. **Opt-in prompt** (`UIAlertController`), shown when `shouldOfferFaceId` is true after `mainFrameCommitted`:
   - title "Open Domus with Face ID?";
   - message "Next time, just look at your phone to open Domus.";
   - actions "Use Face ID" (preferred) and "Not now".
   - **Touch ID variants:** "Open Domus with Touch ID?", "Next time, just touch the sensor to open Domus.", "Use Touch ID".
   - **"Use …"** runs `authenticate`. On success, `enableConfirmed(domainState)`. On failure, no change (offered stays true).
5. **`DomusNavigationDelegate`:** add a closure `onMainFrameCommit: ((URL) -> Void)?`, called from the existing main-frame commit callback. No lock policy lives in the delegate.
6. **Script message handler `domusFaceId`**, registered next to `domusShareCsv`.
   - **One shared provenance check for both handlers** (refactor; no duplicate). The message must satisfy all of these:
     - `frameInfo.isMainFrame == true`;
     - `frameInfo.securityOrigin` is protocol `https`, host exactly `domusbase.com`, port 0 or 443;
     - the web view's current main-frame URL is also HTTPS `domusbase.com`.
   - **Body:** a dictionary with `action` ∈ {`get`, `enable`, `disable`}. Ignore anything else.
   - **Actions:**
     - `get` replies with the state;
     - `enable` runs `authenticate`, then `enableConfirmed`, then replies;
     - `disable` runs `disableRequested`, then replies.
   - **Correlation:** each message carries `requestId` (a string of at most 64 characters; otherwise ignore it), and every reply echoes it.
   - **Reply:** `window.dispatchEvent(new CustomEvent('domus-face-id',{detail:<json>}))` with `{requestId, available, enabled, kind}`. The JSON comes only from a tested builder function using `JSONSerialization`.
7. **`Info.plist`:** add `NSFaceIDUsageDescription` = "Use Face ID to open Domus and keep your info safe."

### D. Web: Settings row (native app only)
1. **New `apps/web/components/settings/face-id-settings.tsx`** (client, ≤ 120 lines).
   - It renders **nothing** unless `isNativeApp()` and `window.webkit?.messageHandlers?.domusFaceId` exist.
   - On mount it posts `{action:"get"}` and listens for `domus-face-id`.
   - If `available` is false, it renders nothing.
   - Otherwise it renders a row: label "Open Domus with Face ID" (or "Touch ID", from `kind`) and a switch (`role="switch"`, `aria-checked`, 44px target).
   - Toggling posts the action with a new `requestId`. The UI updates **only** from the event whose `requestId` matches the latest request; older replies are ignored. No optimistic state. The switch is disabled while a request is pending.
   - If no event arrives within 5 s, show "Face ID didn't respond. Try again." (Touch ID variant uses "Touch ID").
2. **`settings/page.tsx`:** the `security` content becomes `<div className="space-y-4"><FaceIdSettings /><PasswordSettings /></div>`. Nothing else changes.
3. **Types:** a minimal local `window.webkit` type (no global `any`).

### E. README
Add an `apps/ios/README.md` section **"Face ID"** with:
- the exact security claim from §1;
- the phase table;
- the cold-launch overlay hook;
- Simulator test steps: Features → Face ID → Enrolled, Matching Face, and Non-matching Face;
- a note that Touch ID devices get the Touch ID copy.

## 4. Out of scope
- **No cookie or session movement:** no Keychain storage of cookies, no changes to WebKit's data store, no server or Supabase change.
- **Other features:** web 2-step login, Android, push, a grace period (Domus locks every time it leaves the screen), and a device-passcode fallback.
- **Plaid OAuth:** the redirect page (separate sprint).
- **Off-limits files:** `apps/mobile`, `.claude/launch.json`, `docs/`, and "* 2.*" files.

## 5. Exact files expected to change
- `apps/ios/ios/App/App/AppLock.swift`, `BiometricAuth.swift`, `AppLockController.swift`, `LockViewController.swift` (new)
- `apps/ios/ios/App/App/SceneDelegate.swift`, `DomusBridgeViewController.swift`, `DomusNavigationDelegate.swift`, `Info.plist`
- `apps/ios/ios/App/App.xcodeproj/project.pbxproj`
- `apps/ios/ios/App/AppTests/AppLockTests.swift`, `AppLockControllerTests.swift`, `MessageProvenanceTests.swift` (new); existing tests only where the refactor moves code
- `apps/ios/README.md`
- `apps/web/components/settings/face-id-settings.tsx` (new), `apps/web/app/settings/page.tsx`, `apps/web/components/settings/__tests__/face-id-settings.test.tsx` (new)

## 6. Implementation requirements
- **Swift safety:** no force unwraps. All UI work runs on the main thread. `AppLock` is deterministic and has no timers.
- **Logging:** only event and phase names (`os_log`); never cookie values, URLs with query strings, or `domainState` bytes.
- **Length limits:** lines ≤ 140 characters; new files within the limits above.
- **Copy, exactly:**
  - "Domus is locked"
  - "Open with Face ID" / "Open with Touch ID"
  - "Sign in with password"
  - "Face ID is locked. Sign in with your password." / "Touch ID is locked. Sign in with your password."
  - "Open Domus with Face ID?" / "Open Domus with Touch ID?"
  - "Next time, just look at your phone to open Domus." / "Next time, just touch the sensor to open Domus."
  - "Use Face ID" / "Use Touch ID"
  - "Not now"
  - `localizedReason` "Open Domus"
  - Settings: "Open Domus with Face ID" / "Open Domus with Touch ID"
  - "Face ID didn't respond. Try again." / "Touch ID didn't respond. Try again."
  - `NSFaceIDUsageDescription` "Use Face ID to open Domus and keep your info safe."
- **No invented copy.**
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.

## 7. Validation commands to run
- `cd apps/ios/ios/App && xcodebuild test -project App.xcodeproj -scheme App -destination 'id=C79BDA37-1967-45CB-A369-85B260EA111D'`
- `cd apps/ios && node --test scripts/config.test.cjs`
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`

## 8. Acceptance criteria (binary; named tests that call real code)
1. **`AppLock` table:** one test per row of §3.A.4.
2. **Lifecycle races** (`AppLock` plus `AppLockController` with a fake biometric adapter), each a named test:
   - (a) background → immediate foreground: phase is `.locked` synchronously at `didEnterBackground`, and `didBecomeActive` never hides the overlay without a success;
   - (b) a biometric success arriving after a new `didEnterBackground` (stale attempt) is ignored and stays locked;
   - (c) repeated `willResignActive`/`didBecomeActive` without background (Control Center, notification shade, system alerts) → cover/uncover only, never a prompt, never locked;
   - (d) a camera or photo-picker style resign/active without background → same as (c);
   - (e) Stripe Connect handoff: background → foreground → locked → success → the Connect reload runs exactly once, after unlock;
   - (f) cold launch with `enabled && signedIn` → locked, with the overlay installed before the web view is visible (controller test asserts the overlay is in the view hierarchy when `viewDidLoad` completes);
   - (g) only one automatic prompt per lock; `unlockTapped` can retry;
   - (h) `enabled` but `signedIn == false` → never locks;
   - (i) enrollment change → `signOutToLogin`, not unlock;
   - (j) `passwordTapped` keeps `enabled`, enters `.signingOut` with the overlay still shown, and a biometric success during `.signingOut` is ignored;
   - (k) `signOutFinished(false)` returns to `.locked` with the overlay shown (never `.open`);
   - (l) with an auth cookie present, navigation to `/`, `/login` or a public page does **not** set `signedIn = false`, and the next background still locks;
   - (m) enrollment: a nil domain state at opt-in leaves Face ID off; at unlock, a nil or mismatched state signs out; cancel and fail never sign out;
   - (n) while the overlay is shown, `webView.accessibilityElementsHidden` is true.
3. **`shouldOfferFaceId`:** one case per condition (offered, no biometrics, a signed-out path, a wrong host, HTTP).
4. **Message provenance:**
   - rejects a subframe (even with a trusted origin);
   - rejects HTTP;
   - rejects `www.domusbase.com` and a lookalike host;
   - rejects a non-443 port;
   - rejects when the web view's current URL is off-host;
   - rejects a malformed body and an unknown action;
   - the CSV handler uses the same check (its existing tests stay green).
5. **Reply builder:** produces valid JSON for each `kind`. No string interpolation of external data.
6. **`signOutToLogin`:** deletes only matching auth cookies (a non-auth cookie on the same domain survives), and loads `/login` only after deletions complete (fake cookie store).
7. **Web `FaceIdSettings`** (including: a stale reply with an old `requestId` doesn't change the switch):
   - renders nothing without the native user agent, without the handler, or when `available` is false;
   - uses the correct Face ID/Touch ID label;
   - a toggle posts the right action, and the UI updates only after the event;
   - shows the timeout message after 5 s (fake timers).
8. **`Info.plist`** has the exact `NSFaceIDUsageDescription`.
9. All §7 commands are green, with no regressions in the existing `AppTests`.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with test names mapped to §8 and the line counts of the new files. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- **No remote actions:** no DB access, deploy, commit or push. Don't run `gate:web`. No signing or TestFlight changes.
- **No new dependencies:** no new npm or Swift packages (LocalAuthentication and WebKit only).
- **No real secrets:** never put real cookies or tokens in tests.
