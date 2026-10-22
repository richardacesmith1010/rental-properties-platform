# Sprint 252a — Accessibility fixes from the full axe scan (L2)

## 1. Objective
Claude ran axe (WCAG 2.1 A/AA) on production for every owner, manager and tenant section, Settings tabs and public
pages, light + dark, iPhone-size WebKit (2026-10-22). 52 findings, all fixable:
- **select-name (critical):** dropdowns with no accessible name.
- **label (critical):** date and file inputs with no label.
- **nested-interactive (serious):** a `role="button"` card containing other focusable controls.
- **scrollable-region-focusable (serious):** a scroll box keyboard users cannot reach.
- **color-contrast (serious):** "Last updated" line on /terms and /privacy, `--faint` on `--ground` = 4.46:1 (< 4.5).

## 2. Context — every finding (page | axe target | element)
- `/owner?section=maintenance` and `/manager?section=maintenance` | `.w-32` | small `<select>` (filter) — select-name
- `/owner?section=inbox` | `.grid-cols-1 > select:nth-child(2)`, `select:nth-child(3)` | two `<select>` — select-name
- `/owner|/manager?section=leasing` | `select[name="propertyId"]` — select-name
- `/owner|/manager?section=applications` | `select[name="listingId"]` — select-name
- `/owner?section=invitations` | `select[required]` — select-name
- `/owner?section=ownership` | `select[required]` — select-name
- `/owner|/manager?section=expenses` | `select:nth-child(1)`, `.mb-3 > select:nth-child(2)`, `.space-y-3 > select` —
  select-name; `input[type="date"]:nth-child(3)` and `:nth-child(4)` — label
- `/settings?section=profile` (all roles) | `#settings-avatar` (file input) — label
- `/manager?section=inbox` | `div.max-h-64.overflow-y-auto` — scrollable-region-focusable
- `/manager?section=portfolio` | `div[role="button"][tabindex="0"]` card (title "Open the dashboard f…") containing
  buttons/links — nested-interactive
- `/terms`, `/privacy` | `p.text-sm.text-[var(--faint)]` "Last updated: October 18, 2026" — color-contrast
Find the components by these selectors (grep the `name=` attributes, `w-32`, `max-h-64`, `settings-avatar`,
"Last updated").

## 3. In scope
1. Give every listed `<select>` and `<input>` an accessible name: prefer a visible `<label htmlFor>` when a visible
   label/heading already sits next to it; otherwise `aria-label` with plain words that say what it picks or filters
   (≤ 4 words, e.g. "Filter by status", "Home", "Listing", "Start date", "End date", "Profile photo"). Use the words
   already shown near the control when there are any. No visible layout change unless a label is added where one is
   obviously missing.
2. Manager Homes card: remove the nested-interactive pattern — make the card's main action a real `<button>`/link
   inside the card (or move the click handler to a non-wrapping element) so no focusable control sits inside a
   `role="button"`. Keyboard: Enter/Space still opens the home; inner buttons still work.
3. Manager inbox scroll box: `tabIndex={0}` plus an `aria-label` (e.g. "Messages list") so keyboard users can scroll it.
4. Terms/Privacy "Last updated": use `--muted` instead of `--faint`.
5. Add a jsdom regression test that renders each fixed control and asserts its accessible name
   (`getByRole("combobox", { name })`, `getByLabelText`) and the card's structure.

## 4. Out of scope
Any other visual change, copy outside the new labels, the tab bars.

## 5. Exact files expected to change
The components that render the elements in §2 (list each with line deltas in the report) and
`apps/web/components/__tests__/a11y-names-252a.test.tsx` (new). No other files.

## 6. Implementation requirements
Plain-language guard must pass. Lines ≤ 140 characters. L-022: no child-selector hiding. Every label string unique
within its form.

## 7. Validation
```
cd apps/web
npx vitest run components/__tests__/a11y-names-252a.test.tsx
```
then from the repo root `npm run gate:web`. Claude re-runs the full production axe scan after deploy (target: 0
serious/critical).

## 8. Acceptance criteria
- A1 Every `<select>`/`<input>` in §2 is findable by role + name (combobox/textbox/file input) in the new test, with
  the exact label string chosen (listed in the report).
- A2 The manager Homes card has no focusable element inside a `role="button"` element (assert in the test) and opening
  a home still works by click and by Enter on the main control.
- A3 The manager inbox scroll box has `tabindex="0"` and an aria-label.
- A4 Terms/Privacy "Last updated" uses `text-[var(--muted)]`.
- A5 Gate green (counts verbatim).

## 9. Report format
Compact status only: each finding → file:line → fix → label text; A1–A5 → tests; counts. Do NOT include 'Claude
prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow: screen readers
announce what each control is.
