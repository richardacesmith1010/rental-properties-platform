# Sprint 238f — iPhone: make the Face ID lock presentation test deterministic (iPhone, test-only) — rev 2 (rev 1 AWC adopted)

## 1. Objective
`AppLockControllerTests/testOneLockWindowPerSceneReusedCoversPresentedControllersAndRestoresKeyPresentation` fails in the
full suite about 2 runs in 3 and never alone. Make it deterministic without weakening what it proves.

## 2. Context
- Evidence (Claude, 2026-10-16, iPhone 18 Pro Simulator, iOS 27, HEAD `7cc6be4`): alone with `-test-iterations 8` →
  8/8 pass. Full suite three times in a row → 116/116, then 115/116, 115/116. Both failures:
  `AppTests/AppLockControllerTests.swift:348` `XCTAssertTrue(host.presentedViewController === second)`, test position 14
  of 116, right after `testFaceIDUsageDescriptionIsExact`, `testFailedLoginNavigationStaysCoveredAcrossBackgroundAfter…`,
  `testNilEnrollmentAtOptInStaysOffAndAtUnlockSignsOut`.
- The test (`:324-358`) presents `first`, locks/unlocks, then `host.dismiss(animated: false)`, waits a fixed 0.3 s
  (`settle()`), presents `second`, waits 0.3 s, and asserts. The fixture (`:36-73`) makes a fresh `UIWindow` per test in
  the shared scene; `AppLockController` keeps **one lock window per scene in a static map**, which outlives each test.
  `tearDown` hides the lock window and app window and re-keys the prior key window but does not dismiss presented
  controllers or wait for transitions.
- Likely causes (prove which in the report): a presentation/dismissal still in flight after the fixed 0.3 s; the shared
  static lock window (from earlier tests) still key or visible; a controller left presented by an earlier test.

## 3. In scope
Find the cause and fix the test fixture/test so it is deterministic; keep every assertion it has today.

## 4. Out of scope
Any change to app code in `apps/ios/ios/App/App/**` (if the cause is a real app bug, stop and report it with evidence);
other test classes; `LaunchSplashTests.swift` (Sprint 238a-b owns it).

## 5. Exact files expected to change
1. `apps/ios/ios/App/AppTests/AppLockControllerTests.swift`

## 6. Implementation requirements
0. **Diagnose before fixing.** First add (temporarily, then keep as the timeout message) a one-line state snapshot at
   `:348`: controller type + `ObjectIdentifier` of `host.presentedViewController`, `first`, `second`;
   `isBeingPresented`/`isBeingDismissed`; `host.view.window`; `main`/`cover` `isKeyWindow` and `isHidden`. Claude runs
   the full suite until it fails and reports the snapshot; the cause line in the report must quote the false predicate
   (e.g. "presentedViewController was still `first` after dismiss"), not "UIKit race". Codex writes the snapshot code;
   Claude provides the failing snapshot back if Codex cannot run XCTest.
1. Replace fixed-time `settle()` waits in this test with condition waits (spin the main run loop until a predicate holds or
   a 3 s timeout, then fail with a message that prints `presentedViewController`, `isBeingDismissed`/`isBeingPresented`,
   key window and lock window state). Use `present`/`dismiss` completion handlers where they exist. Each wait only
   observes: it never repeats a `present`, `dismiss` or `makeKey` call while polling.
2. `tearDown` touches only `host`, `appWindow`, `testedLock?.lockWindow` and `priorKeyWindow` (never walk the shared
   scene or dismiss other controllers/windows), in this order: dismiss what `host` presented and wait until
   `presentedViewController == nil` with no transition in progress (while `appWindow` is still visible); hide and resign
   the lock window; hide `appWindow`; if `priorKeyWindow` is non-nil, make it key and wait until it is. Do not reset the
   static per-scene map (the test proves reuse).
3. Keep every existing assertion and its order; do not loosen `===` checks or key-window checks.
4. Each line ≤ 140 characters (line length, not file length); no new dependencies; no sleeps longer than the timeout.

## 7. Validation commands
```
cd apps/ios && node --test scripts/config.test.cjs
```
(Move `ios/App/Signing.local.xcconfig` aside if required and restore it.) Claude runs XCTest (Codex cannot).

## 8. Acceptance criteria
1. (Claude) Full suite 5 times in a row on the Simulator: 5/5 green.
2. (Claude) The test alone with `-test-iterations 20`: 20/20 green.
3. The report names the proven cause in one line with the evidence (which predicate was false before the fix).

## 9. Report format
Compact status only: files changed with line counts, cause in one line, command results. Do NOT include "Claude prompt"
or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the file in §5. No app code. No new dependencies. No signing/entitlement changes.

## Round 2 — the failing snapshot (Claude, full suite, 2026-10-16 23:22, iPhone 18 Pro Simulator)
Round 1 (diagnostic message only) is in the working tree. The full suite then failed at `:368` with:
`host.presentedViewController === second: false; presentedViewController=<first>{isBeingPresented=false,
isBeingDismissed=true, hasTransitionCoordinator=true}; second={isBeingPresented=false, isBeingDismissed=false,
hasTransitionCoordinator=false}; host={hasTransitionCoordinator=true}; main isKeyWindow=true; cover isHidden=true`.
**Proven cause:** after `host.dismiss(animated: false)` plus the fixed 0.3 s `settle()`, `first` was still being dismissed
(transition coordinator active), so `host.present(second)` was ignored by UIKit. Now do §6 items 1–4: wait (observe only)
until `host.presentedViewController == nil` and no transition is in progress before presenting `second`, using the dismiss
completion handler; same pattern after presenting; and the scoped teardown. Keep the diagnostic message as the timeout text.
Report the cause line above in the report. Do not touch `LaunchSplashTests.swift` or any app code.
