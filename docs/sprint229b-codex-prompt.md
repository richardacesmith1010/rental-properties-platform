# Sprint 229b — two iOS test failures from Sprint 229 (phone, small fix)

## 1. Objective
Claude ran Sprint 229's iOS tests on the Simulator (Codex's sandbox couldn't). 101 of 103 pass. Fix the 2 failures.

## 2. Context (uncommitted Sprint 229 work is in the tree; keep all of it)
1. **`UniversalLinkTests.testMatchesOnlyExactHTTPSHostAndAppPath`** fails on `https://domusbase.com/owner/bank/oauth-app/`.
   - `SceneDelegate.isPlaidReturn` compares `url.path`, and Foundation's `URL.path` strips a trailing slash, so the trailing-slash URL is wrongly accepted.
2. **`AppLockControllerTests.testOneLockWindowPerSceneReusedCoversPresentedControllersAndRestoresKeyPresentation`** fails at the assertion `host.presentedViewController === second` (line ~344).
   - Claude's diagnosis: `host.dismiss(animated: false)` finishes on the next run-loop turn. With `RunLoop.main.run(until: Date().addingTimeInterval(0.5))` after the dismiss and after the second `present`, the test passes and the second VC **is** presented.
   - So this is a test-timing issue, not an app bug.

## 3. In scope
1. In `SceneDelegate.isPlaidReturn`, compare the **raw path** from `URLComponents(url:resolvingAgainstBaseURL: false)?.path == "/owner/bank/oauth-app"` (with the existing scheme/host/port/credential checks), so a trailing slash is rejected.
2. In the lock-window test, after each `host.dismiss(animated: false)` and each `host.present(_, animated: false)`, spin the main run loop briefly with a small helper `settle()` (`RunLoop.main.run(until: Date().addingTimeInterval(0.3))`). Don't weaken any assertion.

## 4. Out of scope
Everything else. No other files, and no copy changes.

## 5. Exact files expected to change
- `apps/ios/ios/App/App/SceneDelegate.swift`
- `apps/ios/ios/App/AppTests/AppLockControllerTests.swift`

## 6. Implementation requirements
Lines ≤ 140 characters. Keep both tests' existing cases and add no assertions that weaken them.

## 7. Validation commands to run
Compile the App and AppTests (the Simulator may be sandbox-blocked; Claude runs `xcodebuild test`).

## 8. Acceptance criteria
- `isPlaidReturn` rejects `.../oauth-app/` and still accepts `.../oauth-app` and `.../oauth-app?oauth_state_id=…`.
- The lock-window test keeps every assertion and only adds `settle()` calls.
- Both files compile.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Compact status only; no "Claude prompt" section.

## 10. Constraints
No commit, push, deploy or DB access. Don't touch any other file.
