# Sprint 142 — Legacy palette sweep: every remaining component onto v2 tokens

**Severity: L2** (styling only across many files; zero logic, data, copy, link, or auth changes). Attached image: v2 app reference screenshot.

## 1. Objective
Replace every remaining hard-coded Tailwind palette class (`zinc-`, `violet-`, `red-`, `amber-`, `emerald-`, …) and `bg-white` in `apps/web/app` and `apps/web/components` with v2 design tokens, so every screen reads correctly in light AND dark. None of these 98 files has any `dark:` handling today, so some screens are likely broken in dark mode. Also hide the floating Feedback button when printing.

## 2. Context
- Branch `main`, HEAD `daf395f`. Tokens are defined in `apps/web/app/globals.css` (light `:root` + two dark blocks): `--ground --surface --surface-2 --surface-3 --ink --ink-2 --muted --faint --line --line-2 --accent --accent-strong --accent-weak --accent-line --crit --crit-bg --warn --warn-bg --pos --pos-bg --shadow-sm --shadow-md --shadow-lg`. Primitives live in `components/ui/*`.
- Scope = exactly the files printed by this command (98 files, 783 palette hits, as of HEAD):
```bash
cd apps/web && rg -l '\b(bg|text|border|from|to|via|ring|shadow|divide|outline|fill|stroke|placeholder|decoration)-(zinc|violet|slate|emerald|gray|purple|indigo|fuchsia|neutral|stone|red|amber|green|yellow|blue|sky|orange|rose|teal|cyan|lime|pink)-[0-9]{2,3}\b|\bbg-white\b' app components --glob '!**/__tests__/**' --glob '!**/marketing/**'
```
  Largest groups: `components/dashboard/**` (~52), `components/reports/**` (6), `components/onboarding/**` (4), plus app pages (`connect`, `error`, `global-error`, `join-llc`, `layout`, `not-found`, `privacy`, `reset-password`, `settings`, `terms`), `components/{auth,ops,pwa,settings,shared,feedback}`, and `app/theme-utilities.css`.
- `app/theme-utilities.css` ~300-316 contains overrides that target legacy `zinc` classes in the sidebar user menu; once those components use tokens, delete the now-dead overrides.

## 3. In scope
1. **Mapping (apply consistently; variants like `hover:`/`focus:`/`group-hover:` keep their prefix):**
| Legacy | v2 |
|---|---|
| `bg-white` | `bg-[var(--surface)]` |
| `bg-{zinc,slate,gray,neutral,stone}-50` | `bg-[var(--surface-2)]` |
| `bg-{zinc,slate,gray}-100/200` | `bg-[var(--surface-3)]` |
| `bg-{zinc,slate,gray}-800/900/950` (dark panels) | `bg-[var(--ink)]` with `text-[var(--surface)]`, or a primitive — only if the element is meant to be inverted; otherwise `bg-[var(--surface)]` |
| `text-{zinc,slate,gray}-900/800` | `text-[var(--ink)]` |
| `text-{zinc,slate,gray}-700/600` | `text-[var(--ink-2)]` |
| `text-{zinc,slate,gray}-500` | `text-[var(--muted)]` |
| `text-{zinc,slate,gray}-400/300` | `text-[var(--faint)]` |
| `border-/divide-/ring-{zinc,slate,gray}-100/200` | `…-[var(--line)]` |
| `border-/ring-{zinc,slate,gray}-300+` | `…-[var(--line-2)]` |
| `{violet,purple,indigo,blue,sky}` text/border/ring | `--accent` / `--accent-line` |
| `bg-{violet,purple,indigo,blue,sky}-50/100` | `bg-[var(--accent-weak)]` |
| `bg-{violet,purple,indigo,blue}-500/600/700` | `bg-[var(--accent)]` (hover → `--accent-strong`); text on it stays `text-white` |
| `{emerald,green,teal,lime}` | `--pos` (text/border), `--pos-bg` (bg) |
| `{amber,yellow,orange}` | `--warn` / `--warn-bg` |
| `{red,rose,pink}` | `--crit` / `--crit-bg` |
| gradients (`from-/via-/to-` palette) | remove the gradient; use the solid token the element's role implies |
| `placeholder-*` | `placeholder:text-[var(--faint)]` |
| `shadow-{color}-*` (colored shadows) | remove, or `shadow-[var(--shadow-sm)]` only if a shadow is needed |
   Where a primitive (`Button`, `Badge`, `Card`, `Input`, `Alert`) already exists for the element, prefer the primitive over re-tokenizing raw classes — but only if it is a drop-in swap with identical behavior/props.
2. `components/feedback/feedback-button.tsx`: add `print:hidden` to the floating button's root.
3. `app/theme-utilities.css`: delete overrides that target legacy classes no longer present anywhere (prove with grep).

## 4. Out of scope
- Any logic, props, data, handlers, routes, links, email addresses, or text/copy. (If copy looks wrong, list it in `deviations`; do not change it.)
- `components/marketing/**` (already v2), `components/ui/**` primitives (do not change their API), `app/globals.css` token definitions.
- Layout/spacing changes beyond what a class swap implies.
- No DB, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
Exactly the files printed by the §2 command, plus `app/theme-utilities.css`, `components/feedback/feedback-button.tsx`, and any test whose assertions reference a changed class name (list each). Nothing else.

## 6. Implementation requirements
- **Use multi-agent / parallel workers** to split the file list (e.g., dashboard A–M, dashboard N–Z, reports+onboarding, app pages+misc). One coherent diff at the end; one agent re-runs the sweep over everything.
- Tokens only; every `var(--…)` you write must exist in `app/globals.css`.
- No `dark:` variants needed — tokens already switch with the theme. Do not add `dark:` classes.
- Diff per file must be className/CSS-only. Re-check: `git diff -U0 | grep '^[+-]' | grep -v className` should show only CSS-file lines and import lines for primitives you swapped in.
- Do not invent URLs/emails (L-012).

## 7. Validation commands
```bash
npm run gate:web
cd apps/web && rg -n '\b(bg|text|border|from|to|via|ring|shadow|divide|outline|fill|stroke|placeholder|decoration)-(zinc|violet|slate|emerald|gray|purple|indigo|fuchsia|neutral|stone|red|amber|green|yellow|blue|sky|orange|rose|teal|cyan|lime|pink)-[0-9]{2,3}\b|\bbg-white\b' app components --glob '!**/__tests__/**' --glob '!**/marketing/**'
cd apps/web && rg -o "var\(--[a-z0-9-]+\)" app components --glob '!**/__tests__/**' -N --no-filename | sort -u   # each must exist in app/globals.css
cd apps/web && rg -n 'dark:' app components --glob '!**/__tests__/**' | wc -l   # must not increase vs HEAD
```
Command 2 must return zero lines.

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled — real result).
- Legacy sweep (cmd 2) = 0 lines.
- All CSS vars used are defined in `globals.css`.
- No `dark:` classes added; no copy/link/logic diffs (className/CSS + primitive imports only).
- Feedback button hidden in print.
- No files outside §5 changed.

## 9. Report format
Final message must conform to `docs/codex-report-schema.json`. In `self_verification.findings`, list how the work was split across agents and any element where the mapping was ambiguous (file:line + choice made). `deviations`: anything left unconverted and why.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
