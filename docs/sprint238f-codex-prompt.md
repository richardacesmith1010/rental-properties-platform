# Sprint 238f — iPhone: make the Face ID lock presentation test deterministic (iPhone, test-only) — rev 1

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
1. Replace fixed-time `settle()` waits in this test with condition waits (spin the main run loop until a predicate holds or
   a 3 s timeout, then fail with a message that prints `presentedViewController`, `isBeingDismissed`/`isBeingPresented`,
   key window and lock window state). Use `present`/`dismiss` completion handlers where they exist.
2. `tearDown` (or a helper it calls) dismisses anything `host` presented and waits until dismissed; hides and resigns the
   lock window; restores the prior key window and waits until it is key. Do not reset the static per-scene map (the test
   proves reuse).
3. Keep every existing assertion and its order; do not loosen `===` checks or key-window checks.
4. Lines ≤ 140; no new dependencies; no sleeps longer than the timeout.

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
