# Sprint 210c — iPhone: stop auto-zoom on form fields + debug inspection (L3, owner exception)

## 1. Objective
1. **Stop the iPhone auto-zoom.** In the iPhone app Simulator walk, the page stayed zoomed in and scrolled sideways after signing in. iOS zooms when a focused form field has `font-size < 16px`, and the zoom persists after navigation. This happens in iPhone Safari too.
2. **Allow inspecting the app's web view in Debug builds**, so Claude can verify pages with Safari Web Inspector.

## 2. Context (HEAD after `bf60313`)
- Form controls:
  - `components/ui/input.tsx`: `domus-input` class, styled in CSS (find its `font-size` in `app/globals.css` or `theme-utilities.css`);
  - `components/ui/select.tsx`;
  - `components/ui/textarea.tsx`;
  - raw `<input>`, `<select>` and `<textarea>` elements exist in some components, for example `components/auth/login-form.tsx` and `components/dashboard/property-selector.tsx`.
- The iOS shell is in `apps/ios`. `DomusBridgeViewController.capacitorDidLoad()` has access to `webView`.
- Don't change the viewport meta to block zoom (`maximum-scale=1` or `user-scalable=no` are **not allowed**; people need pinch-zoom).

## 3. In scope
1. **Global CSS rule** in `app/globals.css`, under `@media (pointer: coarse)`: `input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, textarea { font-size: max(16px, 1em); }`.
   - Also make sure `.domus-input`, the Select and the Textarea resolve to ≥ 16px on coarse pointers (the rule must win over their own font-size, so mind specificity and `@layer` order).
   - Desktop (`pointer: fine`) font sizes are unchanged.
2. **Test** (Vitest + jsdom can't evaluate media queries reliably), as a CSS test that reads `globals.css`:
   - the coarse-pointer rule exists;
   - it covers input, select, textarea and `.domus-input`;
   - it doesn't contain `maximum-scale` or `user-scalable`;
   - the root `viewport` export has no `maximumScale` or `userScalable`.
3. **Debug inspection:** in `DomusBridgeViewController.capacitorDidLoad()`, set `webView.isInspectable = true` **only in DEBUG builds** (`#if DEBUG`, with an `if #available(iOS 16.4, *)` guard). Release builds must not be inspectable.
   - XCTest or compile check: a test asserts the flag is set in the Debug test build (tests run in Debug).

## 4. Out of scope
Everything else.

## 5. Exact files expected to change
- `apps/web/app/globals.css` (and `theme-utilities.css` only if `.domus-input`'s size lives there)
- a new web test, for example `apps/web/lib/__tests__/touch-input-size.test.ts`
- `apps/ios/ios/App/App/DomusBridgeViewController.swift`
- `apps/ios/ios/App/AppTests/*` (one test)

## 6. Implementation requirements
Lines ≤ 140. No new dependencies. No viewport zoom lock.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- The new test, plus the existing UI component tests for input, select and textarea
- `npm run build --workspace @domus/web`
- `cd apps/ios/ios/App && xcodebuild test -project App.xcodeproj -scheme App -destination 'id=C79BDA37-1967-45CB-A369-85B260EA111D'` (if the simulator service is stale, run `killall -9 com.apple.CoreSimulator.CoreSimulatorService` first)

## 8. Acceptance criteria (binary)
1. The coarse-pointer 16px rule covers every text-like control, with no zoom lock.
2. The tests pass, and desktop sizes are unchanged.
3. Inspection is enabled in Debug only.
4. XCTest passes, and the web checks pass.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, deploy, commit or push. Don't touch `.claude/launch.json` or `apps/mobile`. No signing.
