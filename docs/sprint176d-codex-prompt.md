# Sprint 176d — "Add a manager" sheet accessibility (L2) · Category 10: Visual design & accessibility

## 1. Objective
24 of 25 smoke specs pass on a local production build of the uncommitted Sprint 176/176b/176c tree. The last failure is in the "Add a manager" sheet (`apps/web/components/dashboard/invitations/invite-manager-form.tsx`). Fix it.

## 2. Findings (axe, owner "Add a manager" sheet)
1. **`color-contrast` on the step chips.** The active chip is `.border-[var(--accent-line)].bg-[var(--accent-weak)].rounded-md`. The inactive chips are `.rounded-md.px-2.bg-[var(--surface-2)]`, children 2–4 ("Manager Email", "Manager Name", "Review & Send").
   - Their text colour or opacity is too faint on those backgrounds.
   - Use `text-[var(--accent-strong)]` (active) and `text-[var(--ink)]` or `--muted` (inactive) at full opacity, so each pair is ≥ 4.5:1.
   - Also check whether the sheet's open animation (opacity/scale) causes the failure, like the AnimatedList case in 176c. If so, make sure content is at full opacity once settled, or remove the opacity animation from the sheet content.
2. **`select-name`:** the property `<select>` ("Pick a home") has no accessible name. Add a visible `<label>` tied to it ("Home"), or an `aria-label="Pick a home"` if there is no room for a visible label.

While you're there, apply the plain-language chip text:
- "Pick Property" → "Home"
- "Manager Email" → "Email"
- "Manager Name" → "Name"
- "Review & Send" → "Send"

## 3. In scope
1–2, plus a component test asserting:
- the select has an accessible name (`getByRole("combobox", { name: /home/i })`);
- the chips render the new labels.

## 4. Out of scope
Everything else.

## 5. Exact files expected to change
`invite-manager-form.tsx`, its test (`apps/web/components/__tests__/invite-manager-form.test.tsx`), and `components/ui/modal-overlay.tsx` only if the animation is the cause.

## 6. Implementation requirements
No behaviour change. Light and dark both keep passing. Each line at most 140 characters.

## 7. Validation commands to run
`npm run gate:web`

## 8. Acceptance criteria (binary)
1. The gate passes, and the new assertions pass.
2. Claude's local-build run passes all 25 specs.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies.
