# Sprint 210b — iPhone app fixes from the Simulator walk (L3, owner exception) · follow-up to 210 (uncommitted in the working tree; keep it all)

## 1. Objective
Sprint 210 builds and runs on the iPhone 18 Pro Simulator (iOS 27): 10/10 XCTest pass, and the live site loads. Fix the issues found.

## 2. Context
- The 210 packet (`docs/sprint210-codex-prompt.md`) is **rev 3**. The implementation followed several rev 2 rules instead.
- Xcode 27 is now installed and usable:
  - `cd apps/ios/ios/App && xcodebuild test -project App.xcodeproj -scheme App -destination 'id=C79BDA37-1967-45CB-A369-85B260EA111D'`
  - If the simulator service is stale, run `killall -9 com.apple.CoreSimulator.CoreSimulatorService` first.
- The web changes from 210 aren't deployed yet, so the live site still shows the PWA install card. That's expected.

## 3. In scope
1. **Offline copy (rev 3):** `www/offline.html` heading → `Can't reach Domus right now.` (keep the body line and the button). Update any test or README text.
2. **Pending-Connect reload (rev 3):** replace the path-based `shouldReloadOnForeground` with a native **pending-Connect flag**.
   - Set it when the policy sends `https://connect.stripe.com/...` to Safari.
   - On the next scene foreground, if it's set, reload the **main** web view **once** and clear the flag.
   - Ordinary app switching never reloads.
   - XCTest: the flag is set only by a Connect external open; reload happens once; a normal foreground does nothing.
3. **No second web views (rev 3, UX bug):** `createWebViewWith` must **not** create popup `WKWebView`s. Popups today have no close control and can trap the user.
   - **Domus/Stripe in-app** destinations: load `action.request` in the **main** web view and return `nil`. For a non-GET request, load the request's URL with GET instead of dropping it.
   - **External:** open in Safari via `UIApplication.shared.open`.
   - **System schemes:** open with the system handler.
   - **Reject:** do nothing.
   - Remove the `popups` bookkeeping and `currentPopup`.
   - XCTest: a `target=_blank` Domus link loads in the main web view, and an external one opens Safari. Use a test seam (a protocol for the opener and loader).
4. **App start page:** the app opens at `https://domusbase.com/login` instead of the marketing home page (`/login` already redirects signed-in users to their role home; verify that in code and say where).
   - Change `server.url` in `capacitor.config.ts` (the default stays `https://domusbase.com/login`, and `CAP_SERVER_URL` still overrides).
   - Keep the allowNavigation host check on host only.
   - Test it in the config test.
5. **Status-bar overlap (web):** in the app (`html.domus-native`), the **marketing landing header** and the **login page** must start below the status bar.
   - Add `padding-top: env(safe-area-inset-top)` to their top containers **only under `.domus-native`**, in `globals.css` or the components' classes. Browsers are unchanged.
   - Dashboard layouts already handle safe areas: verify there's no double padding on `/owner`, `/manager` and `/tenant` (`MobileTopBar` / `dashboard-layout`) under `.domus-native`, and fix that only if it doubles.
6. **Measure, don't guess:** add nothing for speed. Report the time to first load from the Simulator log (`WebPageProxy::didGeneratePageLoadTiming`) after a second launch.

## 4. Out of scope
Everything else: Face ID, push, deep links, signing; DB, deploy, commit, push.

## 5. Exact files expected to change
- `apps/ios/www/offline.html`
- `apps/ios/capacitor.config.ts`
- `apps/ios/scripts/config.test.cjs`
- `apps/ios/ios/App/App/DomusNavigationDelegate.swift`
- `apps/ios/ios/App/App/DomusBridgeViewController.swift`
- `apps/ios/ios/App/App/NavigationPolicy.swift`
- `apps/ios/ios/App/App/SceneDelegate.swift`
- `apps/ios/ios/App/AppTests/*`
- `apps/ios/README.md`
- `apps/web/app/globals.css` (and the landing and login top containers, only if a class hook is needed)
- related web tests

## 6. Implementation requirements
- Keep Capacitor's own delegate handling (call the original, as 210 does).
- Swift 4-space style.
- Lines ≤ 140 in TS/TSX.
- No new dependencies.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- Affected web tests
- `npm run build --workspace @domus/web`
- `cd apps/ios && node scripts/config.test.cjs` (or the existing script)
- `npx cap sync ios`
- The xcodebuild test command in §2 (it's available now; run it)

## 8. Acceptance criteria (binary)
1. The offline copy is exact.
2. The pending-Connect flag works, with XCTest coverage.
3. There's no popup `WKWebView` code left, with XCTest for blank-target routing.
4. The start URL is `/login`, tested.
5. `.domus-native` safe-area padding applies on landing and login only, with no double padding on dashboards (tested via a class or snapshot test).
6. The full XCTest run passes in the Simulator, and the web checks pass.

## 9. Report format
JSON per `docs/codex-report-schema.json`, plus the XCTest count and the measured load timing. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, deploy, commit or push. Don't touch `.claude/launch.json` or `apps/mobile`. No signing or team ID.
