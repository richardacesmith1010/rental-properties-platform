# Sprint 214b — fix crashing XCTest from Sprint 214 (L3 phone follow-up; the uncommitted 214 work is in the tree, keep it)

## 1. Objective
The Sprint 214 code is in place and the config test passes 51/51 (Claude ran it). But the XCTest run **crashes the test runner**:
- "The test runner crashed while preparing to run tests: App at `+[XCTFailableInvocation invokeStandardConventionInvocation:completion:]`".
- Reported failing: `ConnectReturnTests.testConfiguredServerHostAndStartupPathAreRespected`, `testDuplicateActionResponseAndWindowCallbacksRecoverOnlyOnce`. The whole run aborted.

Make the full XCTest suite run and pass. **This run, you can and must run Xcode yourself.**

## 2. Context
- Tests: `apps/ios/ios/App/AppTests/NavigationPolicyTests.swift` (the `ConnectReturnTests` class plus the fakes `CommittedWebView`, `FrameInfo`, `FramedAction`, `ConnectResponse`, `BlankTargetAction`, and a `commit()` helper that calls `WKNavigation()`).
- Likely causes: directly creating WebKit objects that aren't meant to be created by apps (`WKNavigation()`, `WKNavigationResponse` / `WKFrameInfo` subclasses calling `super.init()`) and force-unwraps.
- Test command:
  `cd apps/ios/ios/App && xcodebuild test -project App.xcodeproj -scheme App -destination 'id=C79BDA37-1967-45CB-A369-85B260EA111D'`.
- A local `apps/ios/ios/App/Signing.local.xcconfig` (the owner's) exists. **Never read its value into output, edit, move or delete it.** Don't run `scripts/config.test.cjs` (it refuses while that file exists; Claude runs it).

## 3. In scope
1. **Remove crash-prone WebKit construction from tests.**
   - Add small internal seams in `DomusNavigationDelegate`, so tests drive the logic with plain values: for example `func handleCommittedMainFrame(url: URL?)` called from `didCommit` / `didFinish`, and `func handleMainFrameResponse(url: URL?)` called from `decidePolicyFor response`.
   - The `WKNavigationDelegate` methods stay thin wrappers that call these seams.
   - Tests call the seams and never instantiate `WKNavigation`, `WKNavigationResponse` or `WKFrameInfo`.
   - Keep any existing fake that is proven safe (it runs without crashing).
2. **Keep every behavior and test intent from 214** (§3A–D of `docs/sprint214-codex-prompt.md`): the trusted-URL rules, one recovery, the total-navigation-count test, Safari cancel, normal foreground does nothing, and existing navigation tests.
3. **Run the full suite until it's green** with no crash. Paste the `Executed N tests, with 0 failures` line.

## 4. Out of scope
Any behavior change beyond the seams; signing files; web code.

## 5. Exact files expected to change
- `apps/ios/ios/App/App/DomusNavigationDelegate.swift`
- `apps/ios/ios/App/AppTests/NavigationPolicyTests.swift`

## 6. Implementation requirements
- Swift: 4-space indent, `@MainActor`.
- No force-unwraps in tests on values that can be nil.
- No new dependencies.

## 7. Validation commands to run
The xcodebuild test command in §2. If the simulator service is stale, first try `xcrun simctl shutdown all` and boot again; only as a last resort run `killall -9 com.apple.CoreSimulator.CoreSimulatorService`.

## 8. Acceptance criteria (binary)
1. XCTest runs with no crash and 0 failures, including all 214 Connect cases.
2. No test instantiates `WKNavigation`, `WKNavigationResponse` or `WKFrameInfo`.
3. `Signing.local.xcconfig` is untouched.

## 9. Report format
JSON per `docs/codex-report-schema.json`, plus the `Executed N tests` line. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB access, deploy, commit or push. No network use beyond Xcode's own.
- Don't touch `.claude/launch.json`, `apps/mobile`, web code, or any signing file.
