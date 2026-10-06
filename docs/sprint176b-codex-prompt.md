# Sprint 176b — Fix the accessibility, keyboard and 375 px findings (L2) · Category 10: Visual design & accessibility

## 1. Objective
Sprint 176's new specs are in the uncommitted working tree:
- `smoke-a11y.spec.ts`;
- `smoke-keyboard.spec.ts`;
- `smoke-mobile-layout.spec.ts`;
- the `ModalOverlay` focus trap.

Your sandbox could not launch Chromium. Claude ran the specs against a local production build of this tree (`APP_URL=http://localhost:3123`). **9 of 11 fail.** The exact findings are below.

Fix every finding in app code (or in the spec where the spec is wrong, as noted) so all 11 pass. Keep all the existing behaviour.

## 2. Findings (from Claude's run, verbatim selectors)

### A. axe `color-contrast` (serious)
**/login:**
- `.text-[var(--muted)].text-xs`
- `.max-w-lg` (the long role paragraph)
- `footer`

**/owner:**
- `.rounded-md`
- the warning `.domus-badge.domus-badge-warning` in the sidebar nav item 3
- `.text-[var(--accent-contrast)]`
- `button[title="Show the Bank finance view."]`
- the 11 px uppercase tracking label inside the `--crit-bg` card
- the 11 px uppercase tracking label inside the `--pos-bg` card
- `.text-[var(--pos)].mt-3.text-sm`

**/tenant:**
- `.mt-1.text-[var(--muted)]`
- `.p-4.bg-[var(--surface-2)].text-[var(--muted)] > .mt-1`
- `section > .text-muted-foreground`

Likely root cause: the design tokens `--muted` (on `--surface`/`--surface-2`), `--pos` on `--pos-bg`, `--crit` labels on `--crit-bg`, `--warn` badge text, and `--accent-contrast` fall below 4.5:1 for small text in light mode.
- **Fix at the token level** in `apps/web/app/globals.css`: darken or adjust in the light theme, and check the dark theme too. Use the smallest change that reaches ≥ 4.5:1 for normal text (≥ 3:1 for large text). Prefer token fixes over per-component overrides.
- **Prove each ratio:** add a unit test `apps/web/lib/__tests__/theme-contrast-tokens.test.ts` that parses the light and dark token values from `globals.css` and asserts the pairs: muted/surface, muted/surface-2, muted-foreground/background, pos/pos-bg, crit/crit-bg, warn/warn-bg, accent-contrast/accent, ink/surface. Each must be ≥ 4.5:1, using a WCAG relative-luminance helper.

### B. Keyboard: "No visible focus on BODY"
On `/owner` and on `/tenant`, while tabbing, focus landed on `<body>`. Likely causes:
- a focusable element that unmounts or re-renders during tab, for example after a client data load;
- the skip link moving focus to `#main-content`, which is not focusable.

Investigate:
- make the skip-link target focusable (`tabIndex={-1}` on `main#main-content`);
- make sure no tab stop is removed mid-navigation.

If the spec's tab helper is the cause (for example, it starts tabbing before hydration finishes), wait for hydration or network idle in the spec and say so.

### C. 375 px tap targets under 44 px
- `a.sr-only.focus:not-sr-only` (h=1). **Spec fix:** exclude visually hidden skip links (sr-only) from the size check.
- `button.flex.items-center` (h=36)
- `a.text-sm.text-[var(--accent)]` (h=17), for example "Sort your bank file" / "Details" links on the Home money card
- `a.text-sm.font-semibold` (h=20)
- `a.flex.items-center` (h=28)

Give the real controls `min-h-11` (44 px) with vertical padding or inline-flex alignment. Find each by its selector on the pages listed in `smoke-mobile-layout.spec.ts`.

## 3. In scope
Fix A, B and C. Keep the Sprint 176 spec intent: no blanket rule exclusions, and only the sr-only skip-link exclusion is added.

## 4. Out of scope
New features, copy changes, money or auth logic, schema. `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/app/globals.css`
- the components owning the selectors above
- `apps/web/app/layout.tsx` (or whichever file renders `main#main-content`)
- `apps/web/tests/e2e/smoke-mobile-layout.spec.ts` (sr-only exclusion only)
- `apps/web/tests/e2e/smoke-keyboard.spec.ts` (only if the spec timing is the cause; explain)
- `apps/web/lib/__tests__/theme-contrast-tokens.test.ts` (new)

List every file changed with its finding ID.

## 6. Implementation requirements
- Token changes must keep the existing `smoke-theme` contrast suite passing (Claude runs it).
- Keep the brand look: adjust lightness only. Do not change hues or swap colours.
- Each line at most 140 characters. Do not compact code (L-015).

## 7. Validation commands to run
- `npm run gate:web`
- The new token-contrast unit test.
- Chromium may not launch in your sandbox. If it can, also build and start on 3123 and run the three specs. Otherwise Claude runs them.

## 8. Acceptance criteria (binary)
1. The token-contrast unit test passes for light and dark.
2. Claude's re-run of all three specs against a local production build: 11/11 pass.
3. The existing `smoke-auth` and `smoke-theme` tests still pass (Claude runs them).
4. The gate passes. Only §5 files changed, each mapped to a finding.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Include the before and after contrast ratio for each token pair, and the file → finding map. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies.
