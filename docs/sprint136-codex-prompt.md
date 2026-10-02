# Sprint 136 — Reskin Phases 3+4: manager surface + settings components to v2

**Severity: L2** (visual conversion; no logic). Source: `docs/design-system.md` v2. Attached image: a v2 reference screenshot (owner dashboard, light) — match its register.

## 1. Objective
Finish the role sweep: the manager surface and all settings components on v2 tokens/primitives, both themes, zero legacy color classes.

## 2. Context
- Branch `main`, HEAD `3b5b065`. Owner, tenant, first-touch surfaces are v2. Manager pages reuse the already-converted `components/dashboard/*`, so remaining work is small.
- Verified remnant inventory (2026-10-02; pattern `violet-|purple-|indigo-|bg-white|text-(zinc|slate|gray)-(800|900)`):
  - `app/manager/error.tsx` (4), `components/role/role-shell.tsx` (2)
  - `components/settings/settings-layout.tsx` (4), `notification-preferences.tsx` (4), `profile-settings.tsx` (3), `bank-settings.tsx` (2)
- Known dark-mode trap (Sprint 134, L-class): `text-zinc/slate/gray-800/900` on token surfaces is invisible in dark — convert to `text-[var(--ink)]`. Undefined tokens (e.g. a phantom `--ink-3`) are a past bug: use ONLY tokens defined in `app/globals.css`.
- Your sandbox now has network access: `npm run gate:web` should run fully, including `verify:phase9-runtime`. A real gate result is expected — not an excused one.

## 3. In scope
1. Convert the 6 files above to v2 tokens/primitives (reuse `components/ui/*` where a hand-rolled duplicate exists).
2. Settings sub-nav (`settings-layout.tsx`): active item = `--accent-weak` bg + `--accent` text (matches the app sidebar convention); inactive `--ink-2`.
3. Plain-language pass on touched labels (log each change).
4. **Self-verification (new):** if your environment can run the app locally (`npm run dev --workspace @domus/web`) and use the browser tool, load `/login` and any page reachable without credentials, plus render-check the converted components in both themes (toggle `data-theme` on `<html>`). Attach findings to your report. If local serving or browser use is blocked, say so plainly — do not fake it.

## 4. Out of scope
- Gamification removal (Phase 5), marketing/landing (Phase 6), PDFs (Phase 7).
- No logic, data, routing, copy-meaning, or action changes. No DB, deploy, env changes, commit, push.

## 5. Exact files expected to change
The 6 files in §2, plus component tests whose class assertions change (list each). Nothing else.

## 6. Implementation requirements
- Tokens only (defined in `globals.css`); no hexes; status via semantic pairs / `lib/status-colors.ts`.
- Focus rings per the Phase 0 primitive pattern. Tabular numerals on numbers/dates.
- No layout restructuring — token/class swaps and primitive reuse only.

## 7. Validation commands
```bash
npm run gate:web
rg "violet-|purple-|indigo-|bg-white|text-(zinc|slate|gray)-(800|900)" apps/web/app/manager apps/web/components/role apps/web/components/settings
rg -o "var\(--[a-z0-9-]+\)" apps/web/app/manager apps/web/components/role apps/web/components/settings | sort -u
```
The third command lists every token referenced; confirm each exists in `apps/web/app/globals.css`.

## 8. Acceptance criteria (binary)
- `gate:web` passes for real (all stages, including the runtime probe).
- Sweep returns zero lines.
- Every referenced CSS variable is defined in globals.css.
- Only §5 files changed.

## 9. Report format
Your final message must conform to the attached JSON schema (`--output-schema`). Fill every field honestly; put anything that doesn't fit in `deviations`. `manual_verification_path` is for Claude: smoke manager + smoke owner Settings (Profile, Bank, Notifications, Appearance) in light and dark; authenticated smoke 3/3.
No "Claude prompt" sections.

## 10. Constraints
No DB apply. No deploy. No env changes. No commit/push — leave the working tree for Claude.
