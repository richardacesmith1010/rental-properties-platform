# Sprint 242c — Redesign: the front door (landing, sign-in, auth pages, emails) (L2, web, look only)

## 1. Objective
Bring the first screens a person sees into the "Registry in graphite" look: the landing page, sign-in, create account,
reset password, confirm, check-email, complete-profile, support, and the email shell. Spec:
`docs/design/domus-design-system.md` (§1 principles, §3 type, §4 shape, §5 buttons, §6 mark, §7 email).
242a already changed the tokens, fonts and primitives. **Look only:** no copy, layout, field, flow or behavior change.

## 2. Context
- HEAD: latest `main` (242a `29c9fbe`). Paths under `apps/web/`.
- The old logo is a lucide `Home` icon in an accent tile: `app/login/page.tsx:116-117` (`rounded-2xl bg-[var(--accent)]`),
  `components/marketing/landing-page.tsx:16`. New mark (spec §6): arched doorway outline on a baseline —
  SVG `viewBox="0 0 110 110"`, paths `M33 92 V50 A22 22 0 0 1 77 50 V92` and `M20 92 H90`, stroke width 7 (9 at ≤40 px,
  12 at ≤28 px), no knob below 120 px. Same art as `apps/ios/resources/icon.svg` (242b).
- Pills and soft corners still hard-coded in these files: `rounded-full` eyebrow/badges (`login/page.tsx:61,73`,
  `landing-page.tsx:44,84,123`), fields `rounded-[14px]` (`sign-in-form.tsx:14,88`, `create-account-form.tsx:20`), cards
  `rounded-[14px]` (`landing-page.tsx:62,74`), icon circles `rounded-full` (`check-email.tsx:38`,
  `auth/confirm/page.tsx:52,70,99`), strength bars (`password-strength-meter.tsx:8,25`).
- Email: `lib/email/shell.ts` (133 lines) hard-codes `#FBFBF9` ground, `#1D4ED8` pill button (`:77`) and link (`:99`),
  16 px radii, Arial.
- Tailwind now has `font-display` (Source Serif 4); `.domus-section-label` exists in `globals.css`; tokens `--action`,
  `--action-contrast`, `--action-strong` exist.

## 3. In scope
The files in §5 only.

## 4. Out of scope
Copy (every string stays identical), layout and spacing, the dashboard and app screens (242d/242e), `/terms` and
`/privacy` (already serif via the base `h1` rule), icons other than the logo, `globals.css`, primitives.

## 5. Exact files expected to change
1. `apps/web/components/brand/domus-mark.tsx` (new)
2. `apps/web/app/login/page.tsx`
3. `apps/web/components/marketing/landing-page.tsx`
4. `apps/web/components/auth/sign-in-form.tsx`
5. `apps/web/components/auth/create-account-form.tsx`
6. `apps/web/components/auth/reset-password-form.tsx`
7. `apps/web/components/auth/complete-profile-form.tsx`
8. `apps/web/components/auth/check-email.tsx`
9. `apps/web/components/auth/password-strength-meter.tsx`
10. `apps/web/app/auth/confirm/page.tsx`
11. `apps/web/app/reset-password/page.tsx`
12. `apps/web/app/support/page.tsx`
13. `apps/web/lib/email/shell.ts`
14. `apps/web/components/__tests__/front-door-look.test.tsx` (new)
15. `apps/web/lib/email/__tests__/shell-look.test.ts` (new)
16. Existing tests/snapshots whose assertions pin the old classes (list each in the report)

## 6. Implementation requirements
1. **`domus-mark.tsx`** exports `DomusMark({ size = 40, tile = true, className })` — with `tile`, a `size`×`size`
   square (`rounded-[22%]`, `bg-[var(--action)]`) holding the white doorway at 62% of the tile; without `tile`, the bare
   doorway stroked in `currentColor`. Stroke width per §2's size rule. Always `aria-hidden="true"`. Also exports
   `DomusWordmark({ size = 40 })`: the tiled mark plus the word "Domus" in `font-display font-semibold`
   (`text-[24px]` at size 40), gap 12 px, `data-testid="domus-wordmark"`.
2. **Logo** — replace the `Home`-in-accent-tile logos (`login/page.tsx`, `landing-page.tsx` header) with `DomusWordmark`
   (or `DomusMark` where only the tile is shown). Keep the visible text "Domus" exactly once per header.
3. **Type** — every `h1` and `h2` in §5's files gets `font-display font-semibold` and drops `font-bold`/`tracking-*`
   overrides; large sample amounts on the landing page (`$3,450`) use `font-display`.
4. **Shape** — remove every `rounded-full` and `rounded-[14px]` from §5's files: fields and buttons → `rounded-xl`
   (= 4 px control token); cards → `rounded-2xl` (= 4 px card token); icon circles → `rounded-2xl` squares with a 1 px
   `--line` border; progress / strength bars → `rounded-[1px]`; step numbers → `rounded-[2px]` with a 1 px `--ink`
   border. Eyebrow pills ("Your rental workspace", "For landlords with a few units") → plain text with class
   `domus-section-label` (no border, no fill). Status chips in the landing sample → the `Badge` component.
5. **Color** — primary fills that use `bg-[var(--accent)]` in §5's files → `bg-[var(--action)] text-[var(--action-contrast)]`
   (hover `--action-strong`); accent icon colors on decorative icons → `text-[var(--ink-2)]`. Links stay `--accent`.
6. **Email shell** — ground `#F3F4F6`; card `#FFFFFF` with `1px solid #D9DCE1` and 4 px radius; title
   `font-family: Georgia, 'Times New Roman', serif; font-weight: 600; color: #0B0C0E`; body
   `font-family: 'Public Sans', Arial, Helvetica, sans-serif; color: #2E3238`; meta `#4D535C`; button
   `bgcolor="#0B0C0E"`, white text, `border-radius: 4px`; links `#2442B8`. No `#1D4ED8`, `#FBFBF9`, `999px` or `16px`
   radius remains. Header text "Domus" in the serif. Structure (tables, preheader, preferences link) unchanged.
7. Lines ≤ 140 characters. No new dependencies.

## 7. Validation commands
```
(cd apps/web && npx vitest run components/__tests__/front-door-look.test.tsx lib/email/__tests__/shell-look.test.ts)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
/usr/bin/grep -n "rounded-full\|rounded-\[14px\]\|#1D4ED8\|#FBFBF9" <each file in §5 items 2-13>
```
The last command prints nothing. Do NOT run `npm run gate:web`.

## 8. Acceptance criteria
1. `front-door-look.test.tsx` "mark": `DomusMark` renders an `svg` (aria-hidden) with exactly two `path` elements and no
   `circle`; `tile` adds `bg-[var(--action)]`; `DomusWordmark` contains the text "Domus" with `font-display`.
2. Same file, "login": rendering the login page (mock its server helpers as existing login tests do) shows
   `domus-wordmark`, no `lucide-house` icon, an `h1` with `font-display`, and no element whose class contains
   `rounded-full`.
3. Same file, "landing": the landing page renders `domus-wordmark`, every `h1`/`h2` has `font-display`, no element has
   `rounded-full` or `rounded-[14px]`, and every original heading text is still present (list them from the file).
4. Same file, "auth forms": sign-in and create-account render inputs and buttons without `rounded-[14px]`; the sign-in
   submit button has `bg-[var(--action)]`.
5. `shell-look.test.ts`: the HTML from the shell's exported builder (use real arguments as existing email tests do)
   contains `bgcolor="#0B0C0E"`, `#F3F4F6`, `Georgia`, `#2442B8`, and does not contain `#1D4ED8`, `#FBFBF9` or
   `border-radius:999px`; the preheader and preferences link are still present.
6. All existing tests pass; any updated old-look assertion is named in the report.

## 9. Report format
Compact status only: files changed with line counts, test names, command results, updated old-look assertions.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No copy changes (every visible string identical). No new dependencies.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
  user needs to think about what to do, the UI needs to be clearer.
