# Sprint 257b — Upgrade Tailwind CSS 3.4 → 4 with no visual change (L2: build + styles) — rev 1

## 1. Objective
The last production `npm audit` findings (1 high, 4 moderate) are all in the Tailwind 3 / PostCSS chain
(`postcss <= 8.5.22` XSS-in-stringify + sourceMappingURL file read; `postcss-nested`, `postcss-selector-parser`
quadratic parsing). Upgrade to Tailwind 4 (latest 4.x) so the whole app looks **exactly** as it does today.

## 2. Context
- `apps/web/package.json`: `tailwindcss ^3.4.19`, `tailwindcss-animate ^1.0.7`, `autoprefixer ^10.4.24`,
  `postcss ^8.4.49`; `postcss.config.js` uses `tailwindcss` + `autoprefixer`.
- `apps/web/tailwind.config.ts` (69 lines): `darkMode: ["class"]`, `content` globs, theme extensions, plugin
  `tailwindcss-animate`.
- `apps/web/app/globals.css` (580 lines): `@tailwind base/components/utilities`, `@layer base/components`, 9 `@apply`.
- ~300 files use `className`. Theme is CSS variables (`--ink`, `--surface`, `--accent`, …) and a `.dark` class.
- Next.js 15.5.28 (PostCSS pipeline).

## 3. In scope
1. Run the official upgrade tool from `apps/web`: `npx @tailwindcss/upgrade@latest` (it updates dependencies,
   migrates the config, rewrites renamed utilities such as `shadow-sm → shadow-xs`, `rounded → rounded-sm`,
   `outline-none → outline-hidden`, `ring → ring-3`, and the PostCSS config to `@tailwindcss/postcss`).
2. Keep behavior identical where v4 changed defaults, using the official compatibility rules in `globals.css`:
   default border color (v3 used `gray-200`; keep the project's current visible border colors), placeholder color,
   button cursor, `ring` width/color, and `hover:` (v4 applies hover only on hover-capable devices — keep that, it is
   desired on phones). Dark mode stays class-based (`@custom-variant dark (&:where(.dark, .dark *));`).
3. `tailwindcss-animate`: keep via `@plugin "tailwindcss-animate";` (or the maintained `tw-animate-css` drop-in if the
   plugin does not load) — every existing `animate-*` / `data-[state]` animation class keeps working.
4. Remove `autoprefixer` if the upgrade makes it unused (v4 handles prefixes).

## 4. Out of scope
Any intentional visual change, new utilities, design tokens, component logic, other dependencies.

## 5. Exact files expected to change
`apps/web/package.json`, `package-lock.json`, `apps/web/postcss.config.*`, `apps/web/tailwind.config.ts` (migrated or
removed), `apps/web/app/globals.css`, and the component/app files the upgrade tool rewrites (class renames only).
List every file with its line delta in the report.

## 6. Implementation requirements
- Class changes in `.tsx`/`.ts` files must be **mechanical renames from the tool** only; report any manual edit.
- L-022: no `[&>*]:hidden` / child-selector hiding introduced. Lines ≤ 140 characters.
- If the plain-language, snapshot or hydration tests fail only because a class string changed, update the expected
  class string and list each.

## 7. Validation
```
cd apps/web
npm ls tailwindcss @tailwindcss/postcss postcss
npx next build
```
then from the repo root `npm audit --omit=dev` and `npm run gate:web`.

## 8. Acceptance criteria
- T1 `tailwindcss@4.x` and `@tailwindcss/postcss@4.x` installed; `npm audit --omit=dev` reports **0** high and no
  `postcss`, `postcss-nested`, `postcss-selector-parser`, `tailwindcss` findings (report the full remaining list).
- T2 Build and gate green (counts verbatim).
- T3 Report: list of utilities renamed (counts per rename) and the compatibility CSS added.
- T4 Visual parity is verified by Claude (pixel diff of 20 screens × light/dark against the pre-upgrade build); Codex
  only needs to keep the tool's renames and compatibility rules complete.

## 9. Report format
Compact status only: T1–T3, files with line deltas, manual edits (if any). Do NOT include 'Claude prompt' or
'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow (no visible
change). Rollback: revert the commit (restores Tailwind 3 and the old config).
