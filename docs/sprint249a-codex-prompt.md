# Sprint 249a — Polish batch: settings deep link, reset page, FAQ, dark disabled buttons, install banner (L2)

## 1. Objective
Five small things verified present on 2026-10-21 (HEAD `39941a5`):
1. `/settings?section=notifications` (any `?section=`) does not open that tab; Settings always opens the first tab.
2. `/reset-password` shows two near-identical subtitles.
3. The landing FAQ says Domus is free "while we are in early access" — the owner's pricing decision (2026-10-18) is
   free for landlords and tenants, with a paid plan only for managers later.
4. In dark mode, disabled primary buttons (e.g. "Create account" before the form is valid) are hard to read:
   `disabled:opacity-50` fades a light `--action` button into the dark page.
5. The "Install Domus for quick access" banner (`fixed bottom-4 z-[70]`) can sit on top of the phone tab bars
   (`fixed bottom-0 z-40`, owner bar 84 px tall), hiding tabs.

## 2. Context
- `app/settings/page.tsx:53-55` searchParams declare only `connect`; `components/settings/settings-layout.tsx:50`
  `useState(availableNav[0]?.id ?? "profile")`.
- `app/reset-password/page.tsx:27` "Enter a new password for your Domus account.";
  `components/auth/reset-password-form.tsx:58-60` `<p>` "Set a new password for your Domus account."
- `components/marketing/landing-content.tsx:28` FAQ "Is Domus really free?".
- `components/ui/button.tsx:12` `"disabled:pointer-events-none disabled:opacity-50"`; `default` and `gradient`
  variants use `bg-[var(--action)] text-[var(--action-contrast)]`.
- `components/pwa/install-prompt.tsx:242` banner wrapper `pointer-events-none fixed inset-x-0 bottom-4 z-[70] px-4`;
  tab bars: `components/dashboard/owner-bottom-bar.tsx` (`h-[84px]`, `lg:hidden`), `tenant-bottom-bar.tsx` (`lg:hidden`).

## 3. In scope
1. **Settings deep link.** `app/settings/page.tsx` reads `searchParams.section` (string only; arrays ignored) and
   passes it to `SettingsLayout` as `initialSection`; the layout starts on it when it is one of the role's available
   tab ids, else today's first tab. Tab clicks keep working as today (no URL rewriting required).
2. **Reset page.** Remove the `<p>` "Set a new password for your Domus account." from `reset-password-form.tsx`
   (keep the page subtitle).
3. **FAQ.** Change the answer to exactly: "Yes. Domus is free for landlords and tenants. You don't need a credit card."
4. **Disabled buttons.** In `button.tsx`, for the `default` and `gradient` variants only, disabled buttons render
   `bg-[var(--surface-3)] text-[var(--muted)] border-[var(--line)]` with **no** opacity fade; other variants keep
   `disabled:opacity-50`. Contrast of `--muted` on `--surface-3` must be ≥ 4.5:1 in light and dark (compute from the
   tokens in `app/globals.css` in the test; if it fails, use `--ink-2` instead and say so).
5. **Install banner above tab bars.** Below the `lg` breakpoint, the banner wrapper sits above the tab bar:
   `bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] lg:bottom-4`. No other banner changes.

## 4. Out of scope
iOS Safari install-prompt policy, the login marketing panel, any other copy, iPhone code.

## 5. Exact files expected to change
- `apps/web/app/settings/page.tsx`, `apps/web/components/settings/settings-layout.tsx`
- `apps/web/components/auth/reset-password-form.tsx`
- `apps/web/components/marketing/landing-content.tsx`
- `apps/web/components/ui/button.tsx`
- `apps/web/components/pwa/install-prompt.tsx`
- Tests: `apps/web/components/__tests__/settings-layout-section.test.tsx` (new), existing tests for
  reset-password / landing / button / install prompt that assert the changed strings or classes (list each), and
  `apps/web/components/__tests__/button-disabled-contrast.test.ts` (new)

## 6. Implementation requirements
Plain-language guard must still pass. Lines ≤ 140 characters. No new dependencies. (L-022: no child-selector hiding.)

## 7. Validation
```
cd apps/web
npx vitest run components/__tests__/settings-layout-section.test.tsx components/__tests__/button-disabled-contrast.test.ts
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria
- P1 Owner with `initialSection="notifications"` → Notifications panel shown and its tab marked current; tenant with
  `initialSection="bank"` (not available to tenants) → first tab; no `initialSection` → first tab (today).
- P2 The reset form no longer renders "Set a new password for your Domus account."; the page still renders "Enter a new
  password for your Domus account." exactly once.
- P3 FAQ answer string equals the §3.3 text exactly.
- P4 A disabled `default` Button has the three disabled classes and no `disabled:opacity-50`; a disabled `outline`
  Button still has `disabled:opacity-50`; the computed contrast (from globals.css hex values) of `--muted` on
  `--surface-3` is ≥ 4.5 in light and dark (report both ratios).
- P5 Install banner wrapper class contains the §3.5 bottom classes.
- P6 Gate green (counts verbatim).

## 9. Report format
Compact status only: files changed, P1–P6 → tests, the two contrast ratios, validation counts. Do NOT include
'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. Claude checks light + dark screenshots of the disabled Create account button and the
install banner position at phone width.
The user should never need to read instructions to complete this flow: links open the right tab; buttons read clearly.
