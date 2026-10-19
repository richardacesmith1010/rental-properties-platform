# Sprint 242a — Redesign foundations: tokens, fonts, primitives (L2, web, look only)

## 1. Objective
Apply the owner-approved "Registry in graphite" look at the foundation layer so every screen picks it up: new color
token values (light + dark), new `action` and `hero` tokens, radii and shadows, Public Sans + Source Serif 4 fonts, and
the shared UI primitives. Spec: `docs/design/domus-design-system.md` (§2 colors, §3 type, §4 shape, §5 buttons).
**Look only:** no layout, spacing, copy, behavior or component-structure change.

## 2. Context
- HEAD: latest `main`. Paths under `apps/web/`.
- Tokens: `app/globals.css` (535 lines) — light `:root` block (`:8-80`), automatic dark under
  `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` (`:82-112`), forced dark `:root[data-theme="dark"]`
  (`:114-140`). The two dark blocks must stay identical. `--domus-*` aliases point at the base tokens.
- Fonts: `app/layout.tsx:2,13-18,85` loads `Geist` as `--font-geist`; `tailwind.config.ts:11-13` maps `font-sans` to it.
- Radii already flow through tokens: Tailwind `rounded-xl` = `--radius-control`, `rounded-2xl` = `--radius-card`
  (`tailwind.config.ts:23-26`); `globals.css` sets `input, select, textarea, button { border-radius: var(--radius-control) }`.
- Primitives (`components/ui/`): `button.tsx` (119; `default`/`gradient` variants fill with `--accent` + `text-white`),
  `badge.tsx` (33; `rounded-full` pills using `.domus-badge*` classes in `globals.css:257-282`), `input.tsx`,
  `select.tsx`, `textarea.tsx` (`.domus-input`, `globals.css:220-256`), `card.tsx` (78; `rounded-2xl` + `.domus-card`),
  `alert.tsx` (36). `.gradient-btn` (`globals.css:~181-190`) is a legacy primary-fill class.
- Contrast test: `lib/__tests__/theme-contrast-tokens.test.ts` parses the three blocks and checks pairs.
- 41 screen files fill with `bg-[var(--accent)]` directly; those are NOT changed here (sprints 242c–242e).

## 3. In scope
Token values and new tokens; fonts; the seven primitives and the `.domus-input`, `.domus-badge*`, `.domus-card`,
`.gradient-btn` classes; tests.

## 4. Out of scope
Any screen/component file outside §5, layouts, spacing, copy, icons/app icon (242b), emails (242c), charts' own palettes,
`lib/theme.ts`, the iOS app.

## 5. Exact files expected to change
1. `apps/web/app/globals.css`
2. `apps/web/app/layout.tsx`
3. `apps/web/tailwind.config.ts`
4. `apps/web/components/ui/button.tsx`
5. `apps/web/components/ui/badge.tsx`
6. `apps/web/components/ui/card.tsx`
7. `apps/web/components/ui/alert.tsx` (only if it hard-codes rounding or colors that conflict with §6)
8. `apps/web/lib/__tests__/theme-contrast-tokens.test.ts`
9. `apps/web/components/__tests__/ui-primitives-look.test.tsx` (new)

## 6. Implementation requirements
1. **Tokens** — in all three blocks set exactly the light/dark values in the spec §2 table for: `ground`, `surface`,
   `surface-2`, `surface-3`, `ink`, `ink-2`, `muted`, `faint`, `line`, `line-2`, `accent`, `accent-strong`,
   `accent-weak`, `accent-line`, `accent-contrast`, `crit`, `crit-bg` (`warn*`, `pos*` unchanged). Add the new tokens
   `--action`, `--action-strong`, `--action-contrast`, `--hero`, `--hero-ink`, `--hero-muted`, `--hero-line` with the
   §2 values in all three blocks. Keep every existing `--domus-*` alias as is.
2. **Shape** — `--radius-control: 4px; --radius-card: 4px; --radius-pass: 6px;` `--radius-pill` unchanged; shadows
   `--shadow-sm: 0 1px 2px rgba(11,12,14,.05)`, `--shadow-md: 0 1px 3px rgba(11,12,14,.08)`,
   `--shadow-lg: 0 8px 24px -12px rgba(11,12,14,.25)` (light); dark blocks keep their black shadows.
3. **Fonts** — in `layout.tsx` replace Geist with `Public_Sans` (weights 400, 500, 600; variable `--font-sans`) and add
   `Source_Serif_4` (weights 500, 600; variable `--font-display`), both `subsets: ["latin"]`, `display: "swap"`; put both
   variables on `<body>`. `tailwind.config.ts`: `sans: ["var(--font-sans)", "-apple-system", "system-ui", "sans-serif"]`,
   add `display: ["var(--font-display)", "Georgia", "serif"]`. Remove all `--font-geist` references.
4. **Button** — `default` and `gradient`: `bg-[var(--action)] text-[var(--action-contrast)]
   hover:bg-[var(--action-strong)]` (no `text-white`). `outline`: `border-[var(--ink)] bg-transparent text-[var(--ink)]
   hover:bg-[var(--surface-2)]`. `ghost`: `border-transparent bg-transparent text-[var(--ink-2)]
   hover:bg-[var(--surface-2)] hover:text-[var(--ink)]`. `link`, `destructive`, `success`: unchanged. Base class keeps
   `rounded-xl` (now 4px via token); remove `active:scale-[0.98]` (no bouncy motion, spec §1.5). Sizes unchanged.
5. **Badge** — base class: `rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]`
   (replaces `rounded-full px-2.5 text-xs`). `.domus-badge*` in `globals.css`: transparent background, 1 px border and
   text in the status color (`default` → `--accent`, `success` → `--pos`, `warning` → `--warn`, `danger` → `--crit`);
   `outline` → `--line-2` border, `--ink-2` text.
6. **Card** — keep `rounded-2xl` (token is now 4px). `.domus-card`: `border: 1px solid var(--line)`, no shadow by
   default; `elevated` keeps `--domus-shadow-md`.
7. **Inputs** — `.domus-input`: `border: 1px solid var(--line-2)`, background `--surface`; focus ring 2 px `--accent-line`
   (keep existing focus mechanics).
8. **`.gradient-btn`** — background `--action`, color `--action-contrast`, hover `--action-strong`.
9. **Base type** — in `globals.css` base layer: `h1 { font-family: var(--font-display), Georgia, serif; }` and add a
   component class `.domus-section-label { font-size: 12px; font-weight: 600; text-transform: uppercase;
   letter-spacing: .1em; color: var(--muted); }` (defined, not yet used — screen sprints adopt it).
10. Lines ≤ 140 characters. No new dependencies (`next/font/google` is already used).

## 7. Validation commands
```
(cd apps/web && npx vitest run lib/__tests__/theme-contrast-tokens.test.ts components/__tests__/ui-primitives-look.test.tsx)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
/usr/bin/grep -rn "font-geist\|Geist(" apps/web/app apps/web/tailwind.config.ts apps/web/components
```
The last command prints nothing. Do NOT run `npm run gate:web`.

## 8. Acceptance criteria
1. `theme-contrast-tokens.test.ts`: existing pairs still pass with the new values; add pairs `["action-contrast","action",4.5]`,
   `["hero-ink","hero",4.5]`, `["hero-muted","hero",4.5]` for light, dark and automatic dark.
2. Same file, new test "dark blocks match": every `--name: value` in the automatic-dark block equals the forced-dark block.
3. Same file, new test "spec values": light `--action` is `#0B0C0E`, `--accent` `#2442B8`, `--ground` `#F3F4F6`;
   dark `--action` `#F2F3F5`, `--hero` `#1F2226`; `--radius-control` `4px`, `--radius-card` `4px`.
4. `ui-primitives-look.test.tsx` (new): a default `<Button>` has classes `bg-[var(--action)]` and
   `text-[var(--action-contrast)]` and not `bg-[var(--accent)]` or `text-white`; `variant="outline"` has
   `border-[var(--ink)]`; no variant class contains `active:scale`; `<Badge>` has `uppercase` and `rounded-[2px]` and
   not `rounded-full`; `<Card>` still has `rounded-2xl`.
5. Every existing test passes (update only assertions that pin the old blue button / pill badge classes, and name each
   such test in the report).

## 9. Report format
Compact status only: files changed with line counts, test names, command results, any test whose assertion changed.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5 (plus existing test files whose old-look assertions must change — list them). No copy changes.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
  user needs to think about what to do, the UI needs to be clearer.
