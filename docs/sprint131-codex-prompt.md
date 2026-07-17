# Sprint 131 — Reskin Phase 0: v2 token system, two themes, restyled primitives

**Severity: L2** (global UI foundation; no money/auth/schema logic). Source of truth: `docs/design-system.md` **v2** (2026-07-17). This sprint installs the foundation every later reskin phase builds on. It ships live: dashboards will look partially new (new shell/primitives, old per-screen styling) — that mix is accepted and expected.

## 1. Objective
Replace the three-theme purple design system with the v2 foundation: meridian-blue token system (light + dark only, system-default), neutral sidebar rail, restyled UI primitives, tabular numerals — with every existing semantic class/utility still resolving so no screen logic changes.

## 2. Context
- Branch `main`, HEAD `6bdd9c7`.
- **Inter is already loaded** via `next/font/google` in `apps/web/app/layout.tsx` (`--font-inter`), and Tailwind `font-sans` already maps to it. Do not re-add; Q9's "Inter everywhere" needs only the tabular-numeral treatment below.
- Current architecture (verified):
  - `apps/web/app/globals.css` — `--domus-*` custom properties; default `:root` is the light theme; `html[data-domus-theme="noctis-neon"]` (line ~47) and `html[data-domus-theme="imperium-night"]` (line ~84) override blocks; `.bg-white` dark-theme patch selectors (lines ~311+).
  - `apps/web/app/theme-utilities.css` — 217 lines incl. `sidebar-shell-*` classes styled white-on-gradient (assume colored sidebar).
  - `apps/web/tailwind.config.ts` — hardcoded `sidebar.from/to` gradient pair (#7c3aed→#064e3b) and `domus.*` hex constants.
  - `apps/web/lib/theme.ts` — `DomusTheme = "atlas-light" | "noctis-neon" | "imperium-night"`, localStorage persistence (`DOMUS_THEME_KEY`), `isDarkTheme()`.
  - `apps/web/components/theme-provider.tsx` — context provider, default `atlas-light`.
  - Theme consumers (complete list): `app/layout.tsx`, `components/theme-provider.tsx`, `components/settings/theme-settings-panel.tsx`, `components/dashboard/sidebar/nav-items.ts`, `components/dashboard/sidebar/sidebar-nav.tsx`.
  - Primitives: `components/ui/` (button, card, badge, input, select, textarea, alert, modal-overlay, mobile-drawer, sonner-provider + animated helpers).

## 3. In scope
1. **v2 token layer** in `globals.css` (exact palettes below) with the three-hook dark pattern.
2. **Two-theme model**: `light | dark | system` preference; legacy stored values migrate; three-theme machinery deleted.
3. **Tailwind re-point**: semantic names resolve to CSS vars; gradient/hex constants removed.
4. **Primitive restyle** to v2 spec (button, card, badge, input, select, textarea, alert, modal-overlay).
5. **Neutral sidebar rail** (shell only — nav structure/behavior untouched).
6. **Tabular numerals** utility + application in primitives that render amounts.
7. Test updates for the new theme model.

## 4. Out of scope
- NO per-screen reskins (owner/tenant/manager section styling is Phases 1–3). Hardcoded `violet-*`/`purple-*` classes inside feature components stay for now — accepted visual mix.
- NO gamification removal (Phase 5). NO marketing/email/PDF changes (Phases 6–7). NO mobile (parallel sprint after this).
- NO copy changes, NO server action/lib logic changes, NO DB/migrations, NO deploy.
- Do not touch `scripts/`, `app/actions/`, `lib/` (except `lib/theme.ts`), or any `page.tsx` beyond what §5 lists.

## 5. Exact files expected to change
- `apps/web/app/globals.css`
- `apps/web/app/theme-utilities.css`
- `apps/web/tailwind.config.ts`
- `apps/web/lib/theme.ts`
- `apps/web/components/theme-provider.tsx`
- `apps/web/components/settings/theme-settings-panel.tsx`
- `apps/web/app/layout.tsx` (no-flash init script + body classes only)
- `apps/web/components/dashboard/sidebar/sidebar-nav.tsx`
- `apps/web/components/dashboard/sidebar/nav-items.ts` (only if it holds theme-dependent styling constants)
- `apps/web/components/ui/{button,card,badge,input,select,textarea,alert,modal-overlay}.tsx`
- `apps/web/lib/__tests__/theme.test.ts`
- Component tests that assert old classes/theme names (update assertions only; list each in the report)

## 6. Implementation requirements

### 6.1 Token layer (globals.css)
Define the v2 palette as CSS custom properties on `:root` (light) with dark applied via BOTH hooks:

```css
:root { /* light tokens */ }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* dark tokens */ } }
:root[data-theme="dark"] { /* dark tokens */ }
```

**Light:** `--ground:#FBFBF9; --surface:#FFFFFF; --surface-2:#F5F5F1; --surface-3:#EFEFE9; --ink:#191B1E; --ink-2:#3A3F45; --muted:#6F757C; --faint:#9AA0A6; --line:#E6E6E0; --line-2:#EEEEE8; --accent:#1D4ED8; --accent-strong:#1A3FAE; --accent-weak:#E8EEFC; --accent-line:#C7D6F8;`
**Dark:** `--ground:#121316; --surface:#191B1F; --surface-2:#202328; --surface-3:#272B31; --ink:#ECEDEF; --ink-2:#C5C8CE; --muted:#959AA2; --faint:#6C727B; --line:#282C33; --line-2:#222630; --accent:#7E9FF7; --accent-strong:#9DB5F9; --accent-weak:#182238; --accent-line:#2C3B5C;`
**Semantic (define both modes):** crit text/tint `#B91C1C`/`#FDE8E8` (dark `#F1867E`/`#2C1615`); warn `#B45309`/`#FCF0DC` (dark `#E0A34E`/`#28200F`); pos `#15803D`/`#E4F5E9` (dark `#6BC98B`/`#14261A`).
**Shadows:** keep three levels but reduce to barely-there resting (`--shadow-sm`) per v2; remove `--domus-glow` and all glow usage.

**Compatibility aliasing (critical, non-breaking):** every existing `--domus-*` variable name MUST continue to exist, re-pointed to the v2 palette (e.g. `--domus-primary: var(--accent)`, `--domus-body-bg: var(--ground)` — flat color, no gradients; `--domus-sidebar-bg: var(--surface)`; success/warning/danger pairs → the semantic tints above). Grep for every `--domus-` consumer to make sure none is orphaned. The old `html[data-domus-theme=...]` blocks and ALL `.bg-white` dark-patch selectors (globals.css ~311+) are deleted outright.

### 6.2 Theme model (lib/theme.ts, theme-provider.tsx, theme-settings-panel.tsx, layout.tsx)
- New types: `ThemePreference = "light" | "dark" | "system"`, `ResolvedTheme = "light" | "dark"`.
- Persistence: same localStorage key. **Legacy migration on read:** `"atlas-light"` → `"light"`; `"noctis-neon"` or `"imperium-night"` → `"dark"`; absent/unknown → `"system"`.
- Applying: set `data-theme="light" | "dark"` on `<html>` ONLY for explicit preference; for `system`, remove the attribute (the `prefers-color-scheme` hook handles it) and track resolution via `matchMedia` listener so `isDarkTheme()` consumers stay correct live.
- **No-flash init:** inline script in `layout.tsx` `<head>` reads the stored preference (with legacy mapping) and stamps `data-theme` before first paint. No hydration mismatch (script only touches `<html>` attribute).
- `theme-settings-panel.tsx`: three plain-language options — "Light", "Dark", "Match my device" (default). Remove all naming/branding of the old three themes.
- `isDarkTheme()` keeps its export name with the new resolution semantics; update the 2 sidebar consumers accordingly.

### 6.3 Tailwind (tailwind.config.ts)
- Delete the `sidebar.from/to` gradient pair and hardcoded `domus.*` hexes; re-point `domus.*` color names at the CSS vars (`domus.primary: "var(--accent)"` etc.) so existing `text-domus-primary`-style utilities keep compiling and now follow the theme.
- Keep radii (`xl:12px`, `2xl:16px`) and existing animations except glow/confetti-adjacent ones (leave keyframes used elsewhere alone — removal beyond glow is Phase 5).

### 6.4 Primitives (components/ui/)
Restyle to v2, preserving every component's public props/API and existing class-merge behavior:
- **button.tsx:** primary = `--accent` fill, white label, 12px radius, hover `--accent-strong`, focus ring from `--accent-line`; ghost = `--surface` bg + `--line` border + `--ink-2` label; destructive uses crit pair. No gradients, no glow.
- **card.tsx:** `--surface` bg, 1px `--line` border, 16px radius, `--shadow-sm` resting; hover border → `--accent-line` only when the card is interactive (preserve existing interactivity detection/props).
- **badge.tsx:** pill (999px), tint bg + deep text tone; variant mapping: success→pos pair, warning→warn pair, danger→crit pair, default/info→`--accent-weak`+`--accent`.
- **input.tsx / select.tsx / textarea.tsx:** `--surface` bg, `--line` border, 12px radius, focus border `--accent` + 2px `--accent-line` ring; placeholder `--faint`.
- **alert.tsx / modal-overlay.tsx:** surfaces/lines from tokens; modal gets the only real elevation (`--shadow-lg`).
- **Tabular numerals:** add a `tabular-nums` utility (`font-variant-numeric: tabular-nums`) in globals and apply it inside any primitive that renders numeric amounts (count-up, badge amounts) — broader application is later phases.

### 6.5 Sidebar shell (theme-utilities.css, sidebar-nav.tsx)
- `sidebar-shell-*` classes: retone from white-on-gradient to the neutral rail — `--surface` panel bg, `--line` hairline right edge, items in `--ink-2`, hover `--surface-2`, the single active item `--accent-weak` bg + `--accent` text/icon. Remove backdrop-blur where it no longer has a gradient to blur.
- `sidebar-nav.tsx`: remove gradient/whiteness assumptions (classes referencing the old look); keep structure, items, behavior, collapse/mobile logic byte-identical.

### 6.6 General
- Every deleted selector/class must have zero remaining references (`rg` the tree; list anything intentionally left).
- No new files except if a token partial (`tokens.css`) improves clarity — allowed, imported first in globals.
- All new user-visible text (the three theme options) follows plain-language rules.

## 7. Validation commands
```bash
npm run gate:web
```
(Claude runs the deploy + authenticated smoke + fintech-polish visual walk after review.)

## 8. Acceptance criteria (binary)
- `gate:web` passes.
- Zero references remain to `atlas-light`, `noctis-neon`, `imperium-night`, `data-domus-theme`, or the `.bg-white` dark-patch selectors (repo-wide grep, excluding docs/).
- `:root` light + both dark hooks define the exact v2 hexes above; every legacy `--domus-*` name still resolves (no orphaned consumers).
- Legacy localStorage values migrate as specified; default preference is `system`; no first-paint theme flash (init script present).
- Primitives match §6.4 (assert key classes/vars in component tests where tests exist).
- Sidebar renders as neutral rail with accent-weak active state; nav structure/behavior unchanged.
- No diffs outside §5's file list (plus explicitly-flagged test-assertion updates).
- All existing tests pass (966 baseline) with updated assertions listed in the report.

## 9. Report format (required status booleans)
`gate_passed`, `three_theme_machinery_removed`, `legacy_domus_vars_all_alias`, `no_flash_init_present`, `legacy_storage_migrates`, `primitives_match_spec`, `sidebar_neutral_rail`, `no_out_of_scope_diffs`, `tests_updated_and_passing`.
Plus: files changed, every updated test assertion listed, deviations with justification.
`MANUAL_VERIFICATION_PATH`: 1) log in as smoke owner → shell shows neutral rail, blue active item, new primitives in both themes (toggle via Settings → Appearance: Light/Dark/Match my device); 2) legacy check — set localStorage to `noctis-neon`, reload → resolves dark, setting shows "Dark"; 3) tenant + manager smoke render clean.
No "Claude prompt" sections.

## 10. Constraints
No DB apply. No deploy. No env changes. No commit/push (Claude reviews, commits, deploys). Leave working tree changes uncommitted.
