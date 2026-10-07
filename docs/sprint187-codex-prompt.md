# Sprint 187 — UI hotfix: clipped notification bell + misleading "has no units" (L1) · Categories 10 (Visual) / 1 (Owner)

## 1. Objective
Two pre-existing bugs, both seen live on 2026-10-06:
1. **URGENT, clipped content.** In the desktop left sidebar, the notification bell dropdown opens **leftward** (default `align = "end"` → `right-0` in `components/dashboard/notification-bell-menu.tsx:45,155-156`). The panel extends past the left edge of the screen, and its heading and the start of every notification are cut off.
2. **Misleading copy.** The lease wizard (`components/dashboard/lease-wizard.tsx:170` uses `getVacantUnitsForProperty`) shows "`<home>` has no units / Add a unit to this property before creating a lease." when the home **has** units but every one already has an active lease (e.g. Smoke Test Property: units D and S, both leased). `components/dashboard/forms/lease-form.tsx:107,302` has the same message; check whether its `unitsForSelectedProperty` is vacant-filtered and apply the same rule if so.

## 2. Context
- Branch `main`, HEAD `87d006b` or a later docs-only commit. Next 15.5.27, Tailwind.
- The bell is rendered twice in `components/dashboard/sidebar/sidebar-nav.tsx`:
  - line ~245, `notificationButton`, in the desktop sidebar header (left side of the screen);
  - line ~391, a second placement, likely the mobile/top bar. **Determine where each renders.**
- The panel width is `w-[min(24rem,calc(100vw-1.5rem))]`.
- Plain-language rules: `docs/plain-language.md`. A test guard enforces banned words.

## 3. In scope
1. **Bell:** every bell placement must open fully inside the viewport at 375 px, 768 px and 1280 px widths. Pass `align="start"` where the bell sits on the left side of the screen (the desktop sidebar), and keep `"end"` where it sits on the right. Do not change the default or the panel's contents. If the mobile placement can still overflow at 375 px, constrain it so it stays fully on screen; that can be the existing width rule plus a correct anchor.
2. **"No units" copy:** when the selected home has **zero** units, keep today's message and the Add a Unit button exactly. When it **has units but none is free**, show instead:
   - title: `Every unit at {home name} has a lease`
   - body: `Add a new unit, or end a lease first.`
   - the same `Add a Unit` button.

   Apply this in `lease-wizard-steps.tsx` (pass whatever minimal extra prop it needs from `lease-wizard.tsx`, e.g. `totalUnitsForProperty` or a boolean), and in `lease-form.tsx` if its list is vacant-filtered. If `lease-form.tsx` already counts all units, leave it unchanged and say so.
3. **Tests:**
   - `lease-wizard-steps.test.tsx`: keep the existing "has no units" test passing, and add a case for "has units, all leased" asserting the new title and body.
   - `notification-bell-menu.test.tsx` (or the sidebar test): assert the desktop sidebar placement renders with `align="start"`, i.e. the panel has the `left-0` class, and the right-side placement keeps `right-0`.

## 4. Out of scope
- The bell's notification contents and actions, the unit-vacancy logic itself, other wizards, refactors, and splitting files (`lease-wizard-steps.tsx` is 540 lines; do not grow it by more than ~15 lines).
- Deploy, commit, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/components/dashboard/sidebar/sidebar-nav.tsx`
- `apps/web/components/dashboard/lease-wizard.tsx`
- `apps/web/components/dashboard/lease-wizard-steps.tsx`
- `apps/web/components/dashboard/forms/lease-form.tsx` (only if needed per §3.2)
- `apps/web/components/__tests__/lease-wizard-steps.test.tsx`
- `apps/web/components/__tests__/notification-bell-menu.test.tsx` or the existing sidebar-nav test

## 6. Implementation requirements
- Use the exact copy in §3.2; do not invent other wording.
- Lines ≤ 140 characters.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npm run test --workspace @domus/web -- --run` on the touched tests
- `npm run gate:web`

## 8. Acceptance criteria (binary)
1. The desktop sidebar bell uses `align="start"`; the right-side placement keeps `"end"`. Tests prove both.
2. A home with units that are all leased shows the new title and body. A home with zero units shows the old message unchanged. Tests prove both.
3. The gate passes, and only §5 files changed.
4. **Claude, after deploy:** the bell is opened at 1280 px and 375 px in light and dark mode, the whole panel is visible (screenshots, plus `getBoundingClientRect().left >= 0` and `right <= innerWidth`), and the smoke owner's lease wizard shows the new message for Smoke Test Property. 27/27 specs, Sentry clean, CI green.

## 9. Report format
JSON per `docs/codex-report-schema.json`. State where each bell placement renders and what `lease-form.tsx` counts. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies.
