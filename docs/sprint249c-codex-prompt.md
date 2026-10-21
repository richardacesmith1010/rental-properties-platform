# Sprint 249c — No install banner on sign-in and setup pages (L1)

## 1. Objective
Live check 2026-10-21 (WebKit iPhone, `/login`): the "Install Domus for quick access" banner (y 437–643) overlaps the
**Sign in** button (y 484–538). This predates 249a. Asking someone to install the app before they have signed in is
also the wrong moment. Do not show the banner on sign-in and setup pages.

## 2. Context
HEAD `08e5248`. `apps/web/components/pwa/install-prompt.tsx:219-228` `InstallPromptBanner` returns null when
`isNativeApp() || !shouldRender`. Mounted for every page in `app/layout.tsx`. Routes: `app/login`, `app/auth`,
`app/reset-password`, `app/complete-profile`, `app/onboarding`, `app/join`.

## 3. In scope
`InstallPromptBanner` also returns null when the current pathname (`usePathname()` from `next/navigation`) is equal
to or under any of: `/login`, `/auth`, `/reset-password`, `/complete-profile`, `/onboarding`, `/join`.
Dismissal storage and every other behavior unchanged. The Settings install card is unchanged.

## 4. Out of scope
Everything else (banner copy, position, iOS policy).

## 5. Exact files expected to change
- `apps/web/components/pwa/install-prompt.tsx`
- `apps/web/components/pwa/__tests__/install-prompt.test.tsx`

## 6. Implementation requirements
Hooks called unconditionally (rules of hooks). Lines ≤ 140 characters.

## 7. Validation
```
cd apps/web
npx vitest run components/pwa/__tests__/install-prompt.test.tsx
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria
- I1 With an iPhone Safari user agent and pathname `/login` (also `/login?mode=signup` → pathname `/login`,
  `/auth/confirm`, `/reset-password`, `/onboarding`, `/join/abc`): banner not rendered.
- I2 Pathname `/owner` and `/tenant`: banner rendered as today (existing test still passes).
- I3 `/loginx` (not a segment match) renders the banner.
- I4 Gate green.

## 9. Report format
Compact status only. Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact
status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow: nothing covers
Sign in.
