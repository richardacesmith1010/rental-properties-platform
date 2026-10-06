# Sprint 176c — Last 3 accessibility findings (L2) · Category 10: Visual design & accessibility

## 1. Objective
The uncommitted Sprints 176 and 176b work is in the tree. Claude re-ran the specs against a local production build: 22 of 25 pass. Fix the remaining 3 so all pass. Keep everything else.

## 2. Findings (Claude's run)
1. **`/login?mode=signup&role=owner`, axe color-contrast.**
   - When the Owner card is selected, the other role cards (Manager, Tenant) render with `.pointer-events-none.scale-95.opacity-40`. Their `h3` and `.text-muted-foreground` text fail contrast.
   - These cards are non-interactive in that state. Mark them `inert` and `aria-hidden="true"` while another role is selected, keeping the visual dimming. Or hide them entirely in the signup view. Prefer `inert` + `aria-hidden`, so the layout stays the same.
   - File: `apps/web/components/auth/role-selector.tsx`.
2. **`/owner?section=charges`, axe color-contrast on a rent row** (`#charge-…` in the charges list).
   - The failing elements are the `--crit` "late" badge, `.text-base.text-foreground`, the `.text-muted-foreground` lines, and the outline buttons "Send a rent reminder." / the edit button. Their inner `.transition-opacity.gap-2.duration-150`, which is the Button's inner span, suggests an **opacity or transition state is lowering contrast**, either on the row or on the button content.
   - Find the cause in the charge row and Button components (`components/dashboard/charge-row.tsx`, `components/dashboard/charges/*`, `components/ui/button.tsx`).
   - Fix it so the resting state has full opacity. If the row is intentionally dimmed, for example paid or past rows, use token colours instead of opacity.
   - Do not hide anything from assistive tech here.
3. **`/login` at 375 px:** `button.font-semibold.text-primary` is only 20 px tall. This is the sign-in/sign-up toggle link-button. Give it `min-h-11` with inline-flex alignment. File: `components/auth/login-form.tsx` or `role-selector.tsx`.

## 3. In scope
Fix 1–3, with a component test for 1 (the non-selected cards are `inert`/`aria-hidden` when a role is selected) and for 3 (the toggle has the `min-h-11` class).

## 4. Out of scope
Everything else. `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
`role-selector.tsx`, `login-form.tsx`, the charge row/Button file(s) causing finding 2, and their tests. List each file with its finding number.

## 6. Implementation requirements
No behaviour change. Light and dark both keep passing. Each line at most 140 characters.

## 7. Validation commands to run
`npm run gate:web`. Claude re-runs the browser specs.

## 8. Acceptance criteria (binary)
1. The gate passes, and the new tests exist and pass.
2. Claude's local-build run passes all 25 specs (a11y, keyboard, 375 px, auth, theme).

## 9. Report format
JSON per `docs/codex-report-schema.json`. Name the root cause of finding 2. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies.
