# Sprint 242f-native — Face ID lock screen and offer in graphite (iPhone tier, look only) — rev 1

## 1. Objective
The native Face ID screens still use the old Wallet blue: the "Domus is locked" screen (capsule blue "Open with Face
ID" button, blue "Sign in with password" link, system background) and the "Open Domus with Face ID?" offer alert (iOS
default blue "Use Face ID"). Bring both to the "Registry in graphite" look (`docs/design/domus-design-system.md` §2,
§3, §5). **Look only:** no text, flow, lock logic or timing change.

## 2. Context
- HEAD: latest `main`. iOS app `apps/ios/ios/App/App/`.
- `LockViewController.swift` (108 lines): `static let accent` (`:5-9`, light `#0A5BD3`, dark `#4C8DFF`);
  `view.backgroundColor = .systemBackground` (`:18`); title "Domus is locked" uses `.title1` bold (`:36-43`); primary
  button `UIButton.Configuration.filled()` with `baseBackgroundColor = Self.accent`, foreground white/black, capsule
  (`:44-49`); fallback `.plain()` with `baseForegroundColor = Self.accent` (`:51-54`).
- `AppLockController.swift:131-143` builds the offer `UIAlertController` with a preferred "Use <kind>" action; no tint set.
- Test: `AppTests/LockViewControllerTests.swift` pins the old accent hex values.
- Graphite tokens (light / dark): action `#0B0C0E` / `#F2F3F5`; action text `#FFFFFF` / `#0B0C0E`; ground `#F3F4F6` /
  `#0E0F11`; ink `#0B0C0E` / `#F2F3F5`; link (accent) `#2442B8` / `#8DA2F0`; control radius 4 pt.
- The project does NOT use synchronized folders: no new Swift files (no `project.pbxproj` edits).

## 3. In scope
Colors, corner style and title font in `LockViewController.swift`; the offer alert's tint in `AppLockController.swift`;
tests.

## 4. Out of scope
Every string, the lock state machine, biometrics, timing, `LaunchSplashGate.swift`, `SceneDelegate.swift`, web code,
`Info.plist`, `project.pbxproj`, asset catalogs.

## 5. Exact files expected to change
1. `apps/ios/ios/App/App/LockViewController.swift`
2. `apps/ios/ios/App/App/AppLockController.swift` (the offer alert's tint only)
3. `apps/ios/ios/App/AppTests/LockViewControllerTests.swift`

## 6. Implementation requirements
1. In `LockViewController`, replace `accent` with a small palette (dynamic `UIColor`s, light / dark exactly as §2):
   `static let action`, `static let actionText`, `static let ground`, `static let ink`, `static let link`. Remove `accent`
   (update every reference; `AppLockController` uses the palette for the alert tint).
2. `view.backgroundColor = Self.ground`. Title color `Self.ink`; title font: the `.title1` descriptor with
   `.withDesign(.serif)` and bold traits (falls back to the current font if the serif design is unavailable), still
   Dynamic Type (`adjustsFontForContentSizeCategory` unchanged).
3. Primary button: `baseBackgroundColor = Self.action`, `baseForegroundColor = Self.actionText`,
   `cornerStyle = .fixed` with `background.cornerRadius = 4`. Height rules unchanged.
4. Fallback button: `baseForegroundColor = Self.link`.
5. The app icon image at the top is unchanged (it now shows the doorway from 242b).
6. Offer alert: set `alert.view.tintColor = LockViewController.ink` before presenting (so "Use Face ID" and "Not now"
   render in ink, not system blue). Nothing else in `offerIfNeeded()` changes.
7. Lines ≤ 140 characters.

## 7. Validation commands
```
cd apps/ios/ios/App && xcodebuild test -project App.xcodeproj -scheme App -destination 'platform=iOS Simulator,name=iPhone 18 Pro'
```
If the sandbox blocks the Simulator, say so; Claude runs it.

## 8. Acceptance criteria
1. `LockViewControllerTests.testPaletteResolvesToGraphiteHexValues` (replaces the old accent test): each of `action`,
   `actionText`, `ground`, `ink`, `link` resolves to the §2 hex for light and dark traits.
2. `testLockScreenUsesGraphiteStyling`: after `loadViewIfNeeded()` and `display(cover: false, busy: false, kind: .faceId)`,
   the view background resolves to the ground color; the primary button's configuration has background
   `LockViewController.action`, foreground `actionText`, `cornerStyle == .fixed`, `background.cornerRadius == 4`; the
   fallback's foreground is `link`; the button titles are still "Open with Face ID" and "Sign in with password"; the
   title label text is still "Domus is locked" and its font descriptor has the serif design when available.
3. Existing `AppLockControllerTests` pass unchanged, plus one new test: when the offer is presented, the presented
   `UIAlertController`'s `view.tintColor` resolves to the ink color (use the existing offer-presentation test harness).
4. All other `AppTests` pass.

## 9. Report format
Status; files changed with line counts; test names; whether xcodebuild ran. Token usage.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new files, no `project.pbxproj` edits, no new dependencies, no string changes.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
  user needs to think about what to do, the UI needs to be clearer.
