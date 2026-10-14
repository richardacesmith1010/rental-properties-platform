# Sprint 228 — Plaid bank-sign-in return page + lock-screen polish (L3: bank connect flow + iPhone UI) · rev 3 (rev 1 REJECT → rev 2 APPROVE WITH CHANGES → 3 required + optional 1, 3 adopted)

Owner approved 2026-10-14. **Scope is narrowed from the proposal:** in-app (iPhone) bank OAuth is **not** in this sprint. It needs Plaid's native iOS SDK plus universal links and will be Sprint 229.

## 1. Objective
1. **Bank return page (web).** Most big banks (Navy Federal and Fidelity included) use OAuth: the user signs in on the bank's own site. On phone browsers and in web views, Plaid needs a `redirect_uri` and a page that **re-opens Link with the same link token** plus `receivedRedirectUri`. Plaid docs, https://plaid.com/docs/link/oauth/:
   - "Setting a redirect_uri is still required for Link web SDK integrations within a mobile application."
   - Mobile web reinitialization is "recommended".
   - The redirect URI must not include query parameters, wildcards or `#`.

   Add the return page and wire the redirect URI.
2. **iPhone app until Sprint 229.** Bank connect in the iPhone app can't finish an OAuth bank. In the app only, replace the bank connect buttons with a plain message, so nobody hits a dead end.
3. **Lock-screen polish (Sprint 227 walk findings).** Make the lock screen match the Wallet look:
   - a rounded app icon;
   - a bold title;
   - the Domus accent color.

## 2. Context (HEAD `4eeb4e0`+docs, branch `main`)
- **Link token:** `lib/plaid.ts` `createLinkToken` already adds `redirect_uri: process.env.PLAID_REDIRECT_URI` when set. It's **not set** in Vercel yet.
  - **Codex makes no Plaid dashboard or Vercel change.** After this sprint is reviewed and deployed, Claude registers `https://domusbase.com/owner/bank/oauth` in Plaid and then sets the env var. That is a separate operational step.
  - **Do not change `lib/plaid.ts`**, except the validation in §3.A.1.
- **Bank card:** `components/bank-feed/bank-connections-card.tsx` (161 lines, client) has `openLink(connectionId?)`:
  - it calls `actions.start` (create) or `actions.startRelink`;
  - then `loadPlaidScript()` and `window.Plaid.create({ token, onSuccess, onExit }).open()`;
  - `onSuccess` calls `actions.finish` (create; needs `ownerAccountId`, `publicToken`, `selectedAccountIds` from `metadata.accounts`) or `actions.finishRelink({ connectionId })`;
  - a result with `needsMatch` shows the match UI; otherwise `router.refresh()`.
- **Script loader:** `components/bank-feed/plaid-script.ts` (50 lines) types `window.Plaid.create` config. It needs `receivedRedirectUri?: string` added.
- **Bank page:** `app/owner/bank/page.tsx` is the owner bank page; it passes server actions as `actions`. Server actions live in `app/actions/bank-connections.ts` (`startBankLink`, `finishBankLink`, `startBankRelink`, `finishBankRelink`).
  - A pending account match persists server-side as status `pending_account_match`, and the bank page shows "Finish connecting" for it.
- **Native detection:** `lib/native-app.ts` `isNativeApp()` (presentation only); `lib/native-app-server.ts` `isNativeAppServer()`.
- **iOS lock screen:** `apps/ios/ios/App/App/LockViewController.swift` (82 lines):
  - icon `UIImage(named: "AppIcon60x60")`, square, 80pt;
  - title `.title1` regular;
  - primary `UIButton.Configuration.filled()` in the default system tint.
- **Design tokens:** `--accent` is `#0A5BD3` in light and `#4C8DFF` in dark. `--accent-contrast` is `#FFFFFF` in light and `#000000` in dark.

## 3. In scope
### A. Web: link session + return page
1. **`lib/plaid.ts` (validation only).** If `PLAID_REDIRECT_URI` is set, it must:
   - parse as a URL;
   - **either** protocol `https:`, `hostname === "domusbase.com"`, no port;
   - **or** protocol `http:`, `hostname === "localhost"`, any port (dev);
   - `pathname === "/owner/bank/oauth"` exactly;
   - no username or password, empty `search`, empty `hash`, no `*` anywhere.

   Otherwise, log `console.error("plaid_redirect_uri_invalid")` and **omit** `redirect_uri`; don't throw. This is a pure helper, `validRedirectUri(value)`.
2. **New `components/bank-feed/link-session.ts`** (client, ≤ 80 lines). Storage key `domus.plaidLink`, using **`localStorage`**. Not `sessionStorage`: on mobile, the bank opens in a new tab, so the return may land in a different tab. Every access is wrapped in try/catch; failure means "no session". The saved object includes `expiresAt = startedAt + 30 min`.
   - **`saveLinkSession({ linkToken, mode: "create" | "relink", ownerAccountId?, connectionId?, startedAt })`.** Returns `true` only if the write **and** an immediate read-back both succeed; otherwise `false`.
   - **`loadLinkSession(now)`** returns the session or null when:
     - it's missing or malformed;
     - `startedAt` or `expiresAt` is not a finite number, `expiresAt !== startedAt + 30 min`, or `startedAt > now + 60 s` (future);
     - it's older than 30 minutes (`now >= expiresAt`);
     - `mode === "create"` without `ownerAccountId`;
     - `mode === "relink"` without `connectionId`.
   - **`clearLinkSession()`.** It is called on success, on exit, on any finish failure, and whenever `loadLinkSession` finds an expired or malformed value (so stale tokens never linger).
3. **`bank-connections-card.tsx`:**
   - Right after a successful start, and before `.open()`, call `saveLinkSession(...)`. **If it returns `false`, don't open Link.** Show "Try again." (existing copy) and stop. The return page could not finish an OAuth bank without the saved token.
   - Clear it in `onSuccess` (after finish completes) and in `onExit`.
   - Move the shared "finish" branching (create vs relink, `selectedAccountIds` from metadata) into a small exported function `finishLinkSession(session, publicToken, metadata, actions)` in `link-session.ts`, so the card and the return page share one implementation (no duplicate).
4. **New route `app/owner/bank/oauth/page.tsx`** (server; owner auth like `/owner/bank`). It passes the same `actions` to a new client component `components/bank-feed/oauth-return.tsx` (≤ 120 lines). On mount:
   - **No valid session:** show the heading "Let's try that again" and a primary link "Back to your banks" (`/owner/bank`).
   - **Valid session:**
     - show "Finishing your bank connection…";
     - load the Plaid script;
     - call `window.Plaid.create({ token: session.linkToken, receivedRedirectUri: window.location.href, onSuccess, onExit }).open()`.
   - **`onSuccess` state machine** (deterministic; a `handled` ref makes it run **at most once** even if callbacks repeat or the component remounts):
     - show "Finishing your bank connection…";
     - `await finishLinkSession(...)` inside try/catch;
     - **`success: true`** (with or without `needsMatch`): `clearLinkSession()`, then `router.replace("/owner/bank")` (the bank page already shows "Finish connecting" for a pending match);
     - **`success: false`:** `clearLinkSession()`, show the returned `error` (existing strings only; fallback "Try again.") with the "Back to your banks" link. **No automatic redirect.**
     - **thrown error:** same as `success: false`, with "Try again.".
   - **`onExit`:** if `handled` isn't set, run `clearLinkSession()` then `router.replace("/owner/bank")`.
   - **Init failure:** if `loadPlaidScript()` rejects, `window.Plaid` is missing, or `Plaid.create`/`open` throws, run `clearLinkSession()` and show "Try again." with "Back to your banks". Never leave the page on an endless "Finishing…" state.
   - **Run once:** the init effect runs once (a ref guard against React strict double-invoke).
   - **Look:** Wallet style, the same page shell as `/owner/bank`, phone-first, 44px targets, tokens only.
5. **Native-app message.** `app/owner/bank/page.tsx` computes `nativeApp = await isNativeAppServer()` and passes it as a prop to `BankConnectionsCard`. Because the server decides, the first paint is already correct: no flash and no hydration mismatch. When `nativeApp` is true:
   - **hide** "Connect a bank" and "Sign in again";
   - show the muted line "To connect a bank, use Domus on a computer for now.";
   - keep all other controls (Refresh, Disconnect, Finish connecting, match UI).
6. **Middleware/auth:** confirm no code strips the query string (`oauth_state_id`) on the signed-in path to `/owner/bank/oauth`. **Intended behavior, documented in a code comment:** if the user isn't signed in at return, the existing login redirect applies and that Link attempt is abandoned. After login they start again from `/owner/bank`.

### B. iOS: lock-screen polish (`LockViewController.swift` only)
1. **Icon:** 80×80pt, `layer.cornerRadius = 18`, `cornerCurve = .continuous`, `clipsToBounds = true`. Centered horizontally; the icon must not stretch to the stack width (wrap it in a container or set `alignment = .center` with explicit width).
2. **Title:** "Domus is locked" uses `.preferredFont(forTextStyle: .title1)` with a **bold** trait (`UIFontDescriptor.withSymbolicTraits(.traitBold)`), keeping Dynamic Type.
3. **Primary button:**
   - filled configuration with `baseBackgroundColor` = a dynamic `UIColor` of `#0A5BD3` (light) / `#4C8DFF` (dark);
   - `baseForegroundColor` = white (light) / black (dark);
   - capsule corner style, minimum height 50pt, full stack width.
4. **"Sign in with password":** plain style, foreground = the same dynamic accent.
5. **No other behavior or copy changes.** Existing `AppLockControllerTests` stay green. Add one test that the dynamic accent resolves to the two hex values under light and dark trait collections.

## 4. Out of scope
- **In-app (WKWebView) OAuth, Plaid iOS SDK, universal links, `apple-app-site-association`** (Sprint 229).
- **Live setup:** any Plaid dashboard or Vercel env change (Claude does these).
- **Unrelated code:** server-action logic changes, `lib/plaid.ts` beyond §3.A.1, and other iOS files.
- **Off-limits files:** `apps/mobile`, `.claude/launch.json`, `docs/`, and "* 2.*" files.

## 5. Exact files expected to change
- `apps/web/lib/plaid.ts` (validator only)
- `apps/web/components/bank-feed/link-session.ts`, `oauth-return.tsx` (new); `bank-connections-card.tsx`, `plaid-script.ts`
- `apps/web/app/owner/bank/oauth/page.tsx` (new), `apps/web/app/owner/bank/page.tsx` (pass `nativeApp` only)
- `apps/ios/ios/App/App/LockViewController.swift`
- Tests:
  - `apps/web/lib/__tests__/plaid-redirect-uri.test.ts`;
  - `apps/web/components/bank-feed/__tests__/link-session.test.ts`, `oauth-return.test.tsx`;
  - updates to the existing bank-connections-card tests;
  - `apps/ios/ios/App/AppTests/LockViewControllerTests.swift` (new), plus a `project.pbxproj` entry for it.

## 6. Implementation requirements
- **Limits:** lines ≤ 140 characters; new files within the limits above.
- **Errors:** check every Supabase error (no new queries are expected).
- **Logging:** never log the link token, public token or `oauth_state_id`.
- **Copy, exactly:**
  - "Let's try that again"
  - "Back to your banks"
  - "Finishing your bank connection…"
  - "To connect a bank, use Domus on a computer for now."
- **No invented copy.**
- **Self-explanatory flow:** the user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`
- `cd apps/ios/ios/App && xcodebuild test -project App.xcodeproj -scheme App -destination 'id=C79BDA37-1967-45CB-A369-85B260EA111D'` (if the sandbox blocks the Simulator, compile the test sources and report it; Claude will run it)

## 8. Acceptance criteria (binary; named tests that call real code)
1. **`validRedirectUri`:**
   - accepts `https://domusbase.com/owner/bank/oauth` and `http://localhost:3000/owner/bank/oauth`;
   - rejects:
     - `http://domusbase.com/owner/bank/oauth`, `https://evil.com/owner/bank/oauth`, `https://domusbase.com:8443/owner/bank/oauth`;
     - other paths: `https://domusbase.com/owner/bank`, `https://domusbase.com/owner/bank/oauth/x`, `http://localhost:3000/other`;
     - credentials, `?x=1`, `#a`, `*`, and garbage;
   - with an invalid env value, `createLinkToken` omits `redirect_uri` (mock the Plaid client and assert the request body).
2. **`link-session`** (uses `localStorage`):
   - save/load round-trip, including from a fresh module instance (simulating a new tab);
   - null when expired (> 30 min), malformed, or missing required ids;
   - null when `localStorage.getItem` throws; `saveLinkSession` returns false when `setItem` throws or the read-back doesn't match;
   - null (and the key cleared) for non-finite `startedAt`/`expiresAt`, a mismatched `expiresAt`, or a future `startedAt`;
   - `clearLinkSession` removes the key.
3. **`finishLinkSession`:**
   - create mode calls `finish` with `ownerAccountId`, `publicToken` and the account ids from metadata;
   - relink mode calls `finishRelink({connectionId})`.
4. **`OAuthReturn`:**
   - no session → "Let's try that again" plus the link;
   - with a session and a URL like `/owner/bank/oauth?oauth_state_id=abc-123`: `Plaid.create` is called once with the same token, and `receivedRedirectUri` is byte-for-byte `window.location.href`, even under a strict-mode double render;
   - an expired session is cleared from storage;
   - `onSuccess` success → finish, then clear, then `replace("/owner/bank")`;
   - `success: false` → clear, error shown with the link, **no** `replace`;
   - finish **throws** → clear, "Try again." shown, no `replace`;
   - `onSuccess` fired twice → `finish` called once;
   - `onExit` → clear plus `replace` (and no `replace` from `onExit` after a handled success);
   - script load failure and `Plaid.create` throwing → clear plus "Try again." with the link (no endless spinner).
5. **Card:**
   - saves the session before `open()`, and clears it on success and on exit;
   - when `saveLinkSession` returns false, `open()` is never called and "Try again." is shown;
   - with `nativeApp` true, "Connect a bank" and "Sign in again" are absent **from the first render** and the message is shown;
   - with `nativeApp` false, they are rendered as before;
   - the bank page passes `nativeApp` from `isNativeAppServer()` (page test or a mocked-module test).
6. **iOS:** the dynamic accent resolves to `#0A5BD3` (light) and `#4C8DFF` (dark); all existing AppTests stay green.
7. **Validation:** all §7 commands are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with test names mapped to §8 and line counts for the new files. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- **No live or remote actions:** no DB access, deploy, commit or push. Don't run `gate:web`. No Plaid or Vercel changes.
- **No new dependencies:** no new npm or Swift packages.
- **Secrets:** never put real tokens in tests.
