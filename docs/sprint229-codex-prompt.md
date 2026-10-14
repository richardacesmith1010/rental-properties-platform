# Sprint 229 — iPhone app: connect a bank with Plaid's native iOS SDK (L3, phone top tier) · rev 1

Approved by the owner on 2026-10-14 ("plan 229"). The owner reviews this plan before Codex starts.

## 1. Objective
In the iPhone app, "Connect a bank" and "Sign in again" should work end to end, including OAuth banks (Navy Federal and Fidelity are both OAuth). Today the app shows "To connect a bank, use Domus on a computer for now." (Sprint 228).

Plaid's iOS docs (https://plaid.com/docs/link/ios/) say:
- Link inside an app must use **LinkKit** (`https://github.com/plaid/plaid-link-ios-spm`, product `LinkKit`, 7.x, iOS 15+, session API).
- OAuth needs a `redirect_uri` that is a **Universal Link**: "For iOS, /link/token/create must include the redirect_uri parameter."
- That in turn needs the **Associated Domains** entitlement and an `apple-app-site-association` file served with no redirects.

**Keep phone-browser users unaffected.** The app claims only a separate path, `/owner/bank/oauth-app`. Mobile Safari keeps using `/owner/bank/oauth` (Sprint 228) and is never pulled into the app.

## 2. Context (HEAD `6a00a23`, branch `main`)
**Web:**
- `app/actions/bank-connections.ts` (166 lines):
  - `startBankLink({ownerAccountId})` and `startBankRelink({connectionId})` return `{success, linkToken}`;
  - `finishBankLink({ownerAccountId, publicToken, selectedAccountIds})` and `finishBankRelink({connectionId})`.
  - Schemas are in `lib/validations-bank-feed.ts` (`createBankLinkSchema`, `bankConnectionSchema`).
- `lib/plaid.ts` (212 lines):
  - `createLinkToken({userId, mode, accessToken?})` adds `redirect_uri` from `PLAID_REDIRECT_URI`, but only when `validRedirectUri()` passes;
  - that check currently allows exactly `/owner/bank/oauth`.
- `components/bank-feed/bank-connections-card.tsx` (171 lines):
  - has the `nativeApp` prop (server-computed);
  - when `nativeApp` is true, hides "Connect a bank" and "Sign in again" and shows the computer message;
  - uses `link-session.ts` (`finishLinkSession`, `saveLinkSession`, …) for the web flow.
- **Middleware matcher:** `apps/web/middleware.ts` runs on every path except static assets. `/.well-known/...` must not redirect.

**iOS** (`apps/ios/ios/App/App/`):
- **Bridge and messages:**
  - `DomusBridgeViewController.swift` (Capacitor bridge, `AuthCookies`, `AppLockController` wiring);
  - `DomusNavigationDelegate.swift` (has `MessageProvenance.accepts(...)`, the shared main-frame/HTTPS/`domusbase.com` check, plus `FaceIdRequest` and `handleMessage(name:…)`).
- **App lock (Sprint 227):**
  - `AppLock.swift`, a pure state machine with phases open/covered/locked/authenticating/signingOut;
  - `AppLockController.swift`: the overlay is a **child view** of the bridge VC, so a modally presented view controller would sit **above** it.
- **`SceneDelegate.swift`** (32 lines) forwards lifecycle events to the lock controller. `scene(_:continue:)` forwards to `SceneDelegateProxy`.
- **No entitlements file exists yet.** Signing comes from `Signing.xcconfig` + gitignored `Signing.local.xcconfig` (the team ID lives only there; never commit it).
- **Simulator:** iPhone 18 Pro `C79BDA37-1967-45CB-A369-85B260EA111D`.

## 3. In scope
### A. Web
1. **AASA route `app/.well-known/apple-app-site-association/route.ts`** (GET):
   - reads `APPLE_APP_ID` (format `^[A-Z0-9]{10}\.com\.domusbase\.app$`);
   - when valid, returns `{"applinks":{"details":[{"appIDs":["<APPLE_APP_ID>"],"components":[{"/":"/owner/bank/oauth-app","comment":"Plaid OAuth return"}]}]}}` with `Content-Type: application/json`, status 200, and `Cache-Control: public, max-age=3600`;
   - when missing or invalid, returns 404 and logs `aasa_app_id_missing`;
   - **must not redirect.** Exclude `/.well-known/` from the middleware matcher, or early-return for it, so auth middleware never touches it.
2. **iOS redirect URI.** `lib/plaid.ts`:
   - `createLinkToken` takes an optional `platform: "web" | "ios"` (default `"web"`).
   - For `ios`, use `PLAID_REDIRECT_URI_IOS`, validated by `validRedirectUri(value, "ios")`. That allows exactly `https://domusbase.com/owner/bank/oauth-app`, with the same no-port/query/hash/credential rules as web.
   - For `web`, keep today's behavior.
   - An invalid or missing iOS value logs `plaid_redirect_uri_invalid` and omits `redirect_uri`.
3. **Start actions.** `startBankLink` / `startBankRelink` accept an optional `platform` (Zod enum, default `"web"`) and pass it through. Nothing else in the actions changes.
4. **`/owner/bank/oauth-app` page** (owner auth, like `/owner/bank/oauth`). It's what Safari shows if the app isn't installed or the link didn't open it:
   - heading "Open the Domus app to finish.";
   - primary link "Back to your banks" (`/owner/bank`).
5. **Card, native mode.** When `nativeApp` is true **and** `window.webkit?.messageHandlers?.domusPlaidLink` exists (checked after mount):
   - **Show** "Connect a bank" and "Sign in again" again. Until mount, keep rendering the Sprint 228 message, so the first paint never shows a button that may not work.
   - **Click flow:**
     - call `start({ ownerAccountId, platform: "ios" })` or `startRelink({ connectionId, platform: "ios" })`;
     - post `{ action: "open", requestId, linkToken }` to `domusPlaidLink`;
     - wait for `domus-plaid-link` with a matching `requestId`.
   - **`{status:"success", publicToken, accountIds}`:** call `finishLinkSession` with `{accounts: accountIds.map(id => ({id}))}` as metadata, then follow the same success, `needsMatch` and error handling as the web flow.
   - **`{status:"exit"}`:** stop busy, no error.
   - **`{status:"error"}`:** show "Try again.".
   - **No reply within 30 minutes:** stop busy silently.
   - **Never** use `link-session` localStorage in native mode; the native SDK keeps the session.
   - **Old app builds** without the handler keep the Sprint 228 message.

### B. iOS
1. **Package.** Add LinkKit 7.x via SPM ("Up to Next Major") to the App target, in `project.pbxproj` and `Package.resolved`. No other packages.
2. **Entitlements.** New `App/App.entitlements` with `com.apple.developer.associated-domains = ["applinks:domusbase.com"]`, wired via `CODE_SIGN_ENTITLEMENTS` for Debug and Release.
3. **New `PlaidLinkBridge.swift`** (≤ 200 lines):
   - **Registration.** It handles `domusPlaidLink` messages through the **same** `MessageProvenance.accepts` check (extend `handleMessage`).
   - **Body.** `{action:"open", requestId: String ≤ 64, linkToken: String starting "link-" and ≤ 200}`; anything else is ignored.
   - **One session at a time.** If a session is open, reply `{requestId, status:"error"}`.
   - **Open:**
     - build a `LinkTokenConfiguration` (onSuccess / onExit; onEvent logs only the event name via `os_log`);
     - call `Plaid.createPlaidLinkSession`;
     - retain the session;
     - open it using the bridge view controller.
   - **Replies,** built with `JSONSerialization` via `window.dispatchEvent(new CustomEvent('domus-plaid-link',{detail:…}))`:
     - `onSuccess` → `{requestId, status:"success", publicToken, accountIds:[metadata.accounts.map(\.id)]}`;
     - `onExit` → `{requestId, status: error == nil ? "exit" : "error"}`.
     - Before evaluating JS, re-check `MessageProvenance.trustedURL(webView.url)`. Release the session after either callback.
   - **Never log** the link token, public token or account ids.
4. **Universal link return.**
   - In `SceneDelegate`, handle `scene(_:continue:)` **and** the cold-start `connectionOptions.userActivities`, for `NSUserActivityTypeBrowsingWeb` whose `webpageURL` is HTTPS `domusbase.com` with path exactly `/owner/bank/oauth-app`.
   - **If a Plaid session is open,** hand the URL to LinkKit using the API the current LinkKit 7 docs specify for continuing OAuth from a Universal Link. Cite the doc section in a code comment; if LinkKit 7 resumes automatically, document that and do nothing.
   - **Otherwise,** load `https://domusbase.com/owner/bank` in the web view (stale link).
   - **Always forward** the activity to `SceneDelegateProxy` too (unchanged).
5. **The app lock must cover Plaid Link.** Today the overlay is a child view, so a presented Link sheet would sit above the lock.
   - Move the lock/cover overlay into a dedicated `UIWindow` (same window scene, `windowLevel = .alert + 1`, `rootViewController = LockViewController`) that's shown and hidden by the existing effects. It then covers any presented controller, including Plaid Link and system share sheets.
   - **Keep every Sprint 227 rule** (phases, auto-prompt once, stale-attempt guard, signing-out keeps the overlay, cold launch covered before the web view is visible). While the lock window is visible, `webView.accessibilityElementsHidden` stays true.
   - **The OAuth round trip leaves the app** (to Safari or the bank's app), so on return the app locks and asks for Face ID. **Do not add a grace period.** After unlock, the Link session continues (LinkKit keeps its state). A test proves a Link session reference survives lock → unlock.
6. **README.** Add an `apps/ios/README.md` section "Connect a bank (Plaid)" covering: the bridge messages, the AASA path, the entitlement, the env vars, the lock-window change, and how to test with Plaid Sandbox on the Simulator.

## 4. Out of scope
- **Live setup:** any Plaid dashboard or Vercel env change, the Apple Developer portal, signing or TestFlight. Claude and the owner do these after review.
- **Server logic:** changes to the finish actions or the sync engine.
- **Android, and** `apps/mobile`, `.claude/`, `docs/`, and "* 2.*" files.
- **No grace-period or lock-policy changes** beyond §3.B.5.

## 5. Exact files expected to change
- **Web:**
  - `apps/web/app/.well-known/apple-app-site-association/route.ts` (new);
  - `apps/web/middleware.ts` (exclude `/.well-known` only);
  - `apps/web/lib/plaid.ts`, `apps/web/lib/validations-bank-feed.ts`, `apps/web/app/actions/bank-connections.ts`;
  - `apps/web/app/owner/bank/oauth-app/page.tsx` (new);
  - `apps/web/components/bank-feed/bank-connections-card.tsx`, plus a new small `native-plaid-link.ts` helper if it keeps the card ≤ 200 lines.
- **iOS:**
  - `App/PlaidLinkBridge.swift` (new), `App/App.entitlements` (new);
  - `App/DomusNavigationDelegate.swift`, `App/DomusBridgeViewController.swift`, `App/SceneDelegate.swift`;
  - `App/AppLockController.swift` (lock window), `App.xcodeproj/project.pbxproj`, `App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`.
- **Tests:**
  - `AppTests/PlaidLinkBridgeTests.swift` (new), `AppTests/UniversalLinkTests.swift` (new), and updates to `AppLockControllerTests.swift`;
  - web tests for the AASA route, the iOS redirect validation, the platform pass-through, the oauth-app page and the native card flow.
- **Docs:** `apps/ios/README.md`.

## 6. Implementation requirements
- **Limits:** lines ≤ 140 characters; new files ≤ 200 lines; no force unwraps on message, JSON or URL paths.
- **Errors:** check every Supabase error.
- **Copy, exactly:**
  - "Open the Domus app to finish."
  - "Back to your banks"
  - "Connect a bank"
  - "Sign in again"
  - "Try again."
  - "To connect a bank, use Domus on a computer for now." (old-build fallback only)
- **No invented copy.**
- **Self-explanatory flow:** the user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.

## 7. Validation commands to run
- `npm run lint:web`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`, **then** `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/ios/ios/App && xcodebuild -resolvePackageDependencies -project App.xcodeproj -scheme App`
- `cd apps/ios/ios/App && xcodebuild test -project App.xcodeproj -scheme App -destination 'id=C79BDA37-1967-45CB-A369-85B260EA111D'` (if the sandbox blocks it, compile the tests and say so; Claude runs it)

## 8. Acceptance criteria (binary; named tests that call real code)
1. **AASA route:**
   - with a valid `APPLE_APP_ID`, returns 200 JSON with exactly one component `/owner/bank/oauth-app` and `application/json`;
   - missing or invalid → 404;
   - the middleware matcher excludes `/.well-known/` (test the matcher regex or the middleware early-return).
2. **`validRedirectUri(value, "ios")`:**
   - accepts only `https://domusbase.com/owner/bank/oauth-app`;
   - rejects the web path, other paths, ports, a query, a hash, `*` and credentials;
   - `createLinkToken({platform:"ios"})` sends that `redirect_uri`, and `platform:"web"` still sends the web one (mocked Plaid client, request body asserted).
3. **Actions:**
   - `startBankLink` / `startBankRelink` pass `platform` through;
   - an invalid platform is rejected;
   - the default is web.
4. **Card:**
   - native **without** the handler → the 228 message shows and no buttons;
   - native **with** the handler → after mount, the buttons render and the first render shows the message;
   - success → `finish` gets `selectedAccountIds` from `accountIds`;
   - relink success → `finishRelink`;
   - a reply with the wrong `requestId` is ignored;
   - exit → not busy, no error;
   - error → "Try again.";
   - native mode never writes `localStorage` `domus.plaidLink`.
5. **`/owner/bank/oauth-app`** renders the heading and the link, and needs owner auth.
6. **`PlaidLinkBridge`**, with a fake session factory, so LinkKit is injected behind a protocol:
   - rejects bad provenance, bad bodies and a token without `link-`;
   - a second open while one is active → error reply;
   - success and exit reply JSON shapes (via the builder), with no token in logs;
   - the session is released after a callback.
7. **Universal links:**
   - matches only the exact HTTPS `domusbase.com` `/owner/bank/oauth-app` path;
   - with an active session, the URL goes to the session (fake);
   - without one, the web view loads `/owner/bank`;
   - cold-start `userActivities` are handled.
8. **Lock window:**
   - the overlay lives in a separate window above presented controllers (a test presents a dummy VC and asserts the lock window's level and visibility);
   - every Sprint 227 `AppLockControllerTests` case still passes;
   - an open Plaid session survives lock → unlock.
9. **Entitlements:** the file contains `applinks:domusbase.com` and is referenced by `CODE_SIGN_ENTITLEMENTS` (plist/config test).
10. **Validation:** all §7 commands are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with test names mapped to §8, the LinkKit version resolved, and line counts of the new files. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- **No live or remote actions:** no DB access, deploy, commit or push. Don't run `gate:web`. No Plaid or Vercel changes. Don't change `Signing*.xcconfig`, and never write the team ID anywhere.
- **Network:** fetching the LinkKit package and reading Plaid docs is allowed.
- **Secrets:** never put real tokens in tests.
