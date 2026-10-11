# Sprint 215 — Wallet redesign foundation: tokens, font, cards, owner tab bar + correct Home "year to date" (L3: money number) · rev 2 (ChatGPT APPROVE WITH CHANGES: 5 required + optional 1–5 adopted)

Owner approved the "Wallet" (Apple Card-style) direction on 2026-10-11. Mockups: https://claude.ai/artifact/FsvezREEzyFY6WXg9PDqo4 (artboards "B · Home", "B · Money", "B · Homes").

This sprint changes the **foundation only**: colors, font, card shape and the phone tab bar. The Home, Money and Homes screen layouts get rebuilt in Sprints 216–217. It also fixes a wrong money number on Home.

## 1. Objective
1. **New look everywhere at once:** replace the design tokens and font so every existing screen (owner, manager, tenant, light and dark) picks up the Wallet look, with no per-screen rewrites.
2. **A real phone tab bar for owners:** Home · Money · Homes · Inbox · More, shown on every owner page, including `/owner/money` and `/owner/bank`.
3. **Fix Home "Year-to-date" income.** It currently sums only the few recent payments the dashboard payload loads, so it shows $2,350 instead of $21,150.

## 2. Context (HEAD after 214, branch `main`)
- **Tokens** are CSS variables in `apps/web/app/globals.css`:
  - light `:root` at lines 8–72; dark in two duplicated blocks, `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` (75–104) and `:root[data-theme="dark"]` (106–134);
  - about 35 legacy `--domus-*` aliases (37–71) point at the core tokens;
  - component classes are in `app/theme-utilities.css`;
  - Tailwind maps `domus.*` colors to the variables (`tailwind.config.ts:12-20`), with radius overrides `xl:12px`, `2xl:16px`;
  - there are no radius variables.
- **Theme choice:** `light | dark | system` in localStorage `domus-theme`, applied as `data-theme` on `<html>` (`lib/theme.ts`, an inline script in `app/layout.tsx`). Keep all of this unchanged.
- **Font:** Inter via `next/font/google` (`app/layout.tsx:2,13-16`, variable `--font-inter`); Tailwind `sans` = `var(--font-inter)`.
- **Owner phone bottom bar:** `components/dashboard/owner-bottom-bar.tsx`.
  - It's portaled, `lg:hidden`, owner-only, with slots Home (`overview`), Rent (`charges`, "N late" badge), Repairs (`maintenance`) and More (opens the `MobileDrawer` from `sidebar-nav.tsx`).
  - It uses an undefined `--warn-line`.
  - Shell: `components/dashboard/dashboard-layout.tsx:92-112`. Sections are `?section=` on `/owner` (`components/dashboard/navigation/owner.ts:20-38`).
  - `/owner/money` (`app/owner/money/page.tsx:44-46`) and `/owner/bank` render their own `<main>` with a "← Home" link and **no** shell or tab bar.
- **YTD bug:** `components/dashboard/dashboard-kpi-loader.ts:403-405` sums `dashboardData.charges` with `status==="paid"` and `dueDate >= Jan 1`.
  - Those charges come from the RPC `owner_dashboard_payload`: pending/late/waived only (limit 30), plus `recent_payments` from the last 30 days (limit 10).
  - So year-to-date income is wrong for every owner.
  - The Money page computes the year correctly in `lib/home-money.ts` (`loadRows`, lines 55–128: rent charges for the home's leases, then payments with `paid_at` in range, skipping reversed ones).
- **Tests that are sensitive to tokens:**
  - `lib/__tests__/theme-contrast-tokens.test.ts` (parses those three selectors and needs 6-digit hex);
  - `tests/e2e/smoke-theme.spec.ts`, `theme.spec.ts`, `dark-mode.spec.ts`;
  - `components/__tests__/charge-row-snapshot.test.tsx`;
  - `components/__tests__/owner-navigation.test.tsx`;
  - `lib/__tests__/native-layout.test.tsx` (mocks `Inter`).

## 3. In scope
### A. Tokens (globals.css), same variable names, new values
1. **Light `:root`:**

   | Token | Value |
   |---|---|
   | `--ground` | `#F2F2F5` |
   | `--surface` | `#FFFFFF` |
   | `--surface-2` | `#F7F7F9` |
   | `--surface-3` | `#ECEDF0` |
   | `--ink` | `#111214` |
   | `--ink-2` | `#3A3D42` |
   | `--muted` | `#5D6168` |
   | `--faint` | `#8A8E95` |
   | `--line` | `#E3E4E8` |
   | `--line-2` | `#D3D5DB` |
   | `--accent` | `#0A5BD3` |
   | `--accent-strong` | `#0848A8` |
   | `--accent-contrast` | `#FFFFFF` |
   | `--accent-weak` | `#E6EEFB` |
   | `--accent-line` | `#BFD3F5` |
   | `--pos` / `--pos-bg` | `#0E7A3E` / `#DDF3E6` |
   | `--crit` / `--crit-bg` | `#B4361C` / `#FBE6E1` |
   | `--warn` / `--warn-bg` | `#7A4B00` / `#FFF1D6` |
   | `--warn-line` (new) | `#F2D49B` |

2. **Dark (both blocks, identical values):**

   | Token | Value |
   |---|---|
   | `--ground` | `#000000` |
   | `--surface` | `#1C1C1E` |
   | `--surface-2` | `#2C2C2E` |
   | `--surface-3` | `#3A3A3C` |
   | `--ink` | `#F5F5F7` |
   | `--ink-2` | `#D1D1D6` |
   | `--muted` | `#A1A1A6` |
   | `--faint` | `#8E8E93` |
   | `--line` | `#2C2C2E` |
   | `--line-2` | `#3A3A3C` |
   | `--accent` | `#4C8DFF` |
   | `--accent-strong` | `#7AA9FF` |
   | `--accent-contrast` | `#000000` |
   | `--accent-weak` | `#16233A` |
   | `--accent-line` | `#2A4475` |
   | `--pos` / `--pos-bg` | `#34C77B` / `#0F2A1B` |
   | `--crit` / `--crit-bg` | `#FF7A66` / `#331410` |
   | `--warn` / `--warn-bg` | `#FFC56B` / `#2E2209` |
   | `--warn-line` | `#5A4417` |

3. **Contrast:** every pair checked by `theme-contrast-tokens.test.ts` must reach 4.5:1. If a listed value fails, adjust **lightness only** (same hue) until it passes, and report the final hex.
4. **New radius tokens** in `:root`: `--radius-card: 16px`, `--radius-pass: 22px`, `--radius-control: 12px`, `--radius-pill: 999px`.
   - `.domus-card` (and the shadcn `Card` if it doesn't use `.domus-card`) uses `border-radius: var(--radius-card)`, no border in light mode (`border-color: transparent`), with shadow `0 1px 2px rgba(17,18,20,.06)`; dark mode keeps a 1px `--line` border.
   - Inputs, selects and buttons use `--radius-control`.
   - Tailwind: `rounded-xl` → `var(--radius-control)`, `rounded-2xl` → `var(--radius-card)`.
5. **Shadows:** `--shadow-sm: 0 1px 2px rgba(17,18,20,.06)`, `--shadow-md: 0 4px 16px -4px rgba(17,18,20,.12)`, `--shadow-lg: 0 12px 30px -12px rgba(17,18,20,.35)` (dark: same shapes with `rgba(0,0,0,.5)`).
6. **Money numbers:** a utility class `.num` = `font-variant-numeric: tabular-nums`. Also apply `tabular-nums` to `body`.
7. Leave `--domus-*` aliases pointing at the core tokens (no renames).

### B. Font
- Replace Inter with **Geist** via `next/font/google` (`Geist`, weights 400/500/600/700, `display: swap`, variable `--font-geist`).
- Update `tailwind.config.ts` `sans` to `var(--font-geist)` with fallbacks `-apple-system, system-ui, sans-serif`. Remove the Inter import.
- Update `native-layout.test.tsx`'s mock.

### C. Owner phone tab bar (rework `owner-bottom-bar.tsx`)
1. **Five tabs, in this order:**

   | Tab | Goes to | Icon |
   |---|---|---|
   | **Home** | `/owner` (overview) | house |
   | **Money** | `/owner/money` | bar chart |
   | **Homes** | `/owner?section=portfolio` | two buildings |
   | **Inbox** | `/owner?section=inbox` | speech bubble |
   | **More** | opens the existing `MobileDrawer`, which keeps everything else, including Rent, Repairs, Settings and the theme toggle | — |

   - Use inline stroke SVG icons (24 px, stroke 2), or `lucide-react` equivalents (already a dependency).
   - **Badges:**
     - **Home** shows a small red count of late rent (the existing "N late" logic, moved here);
     - **Inbox** shows an unread count if one is already available on the client (don't add a new query);
     - each badge has an `aria-label` like "2 late".
2. **Style (iOS):**
   - height 84px including the safe area (`padding-bottom: env(safe-area-inset-bottom)`);
   - background `color-mix(in srgb, var(--surface) 92%, transparent)` with `backdrop-filter: blur(20px)`;
   - top border `1px var(--line)`;
   - labels 11px/600;
   - active tab = `--accent`, inactive = `--faint`;
   - every tab is a real `<a href>` (More is a `<button>`), at least 44px tall, with `aria-current="page"` on the active one.
3. **Active tab rules:**
   - `/owner` with no section (or `overview`) → Home;
   - `/owner/money` and `/owner/bank` → Money;
   - `section=portfolio`, `units`, `leases` or `tenants`, or `/owner/properties/*` → Homes;
   - `section=inbox` → Inbox;
   - any other section → More.
4. **Show the tab bar on `/owner/money` and `/owner/bank` too**, below `lg`, without wrapping them in the full dashboard shell.
   - Mount the same component there and give their `<main>` enough bottom padding.
   - Keep their "← Home" link on desktop only (`lg:inline-flex`, hidden on phones, since the tab bar replaces it).
5. Desktop (`lg+`) is unchanged: sidebar, no tab bar. Manager and tenant phone navigation are unchanged in this sprint.

### D. Correct Home "Year-to-date" income (money). Controlling rule: **Home = Money, exactly, in cents**
1. **One shared calculation.**
   - Extract the rent-received aggregation that the Money page uses today (`lib/home-money.ts` `loadRows` and the `totals.inCents` logic) into a shared, pure function plus a loader. Both the Money page and the new Home loader call it, so both screens can never disagree.
   - Don't change Money's existing rules. Its current handling of `paid_at` vs due date, reversed payments, deleted charges, categories, partial and multiple payments per charge, timezone and year range is the definition. Document the rules you found in a comment and in the report.
   - Money's existing tests must still pass unchanged.
2. **Multi-home loader** `loadOwnerYearRentReceived()`:
   - **Who:** the authenticated user comes from the server session inside the loader, never as a caller-supplied id. The optional `accountId` is validated against that user's permitted owner accounts.
   - **Which homes:** exactly the ones the Money page would let this user open. Use the same authorization helper and rule as the Money page (`canUserAdministerProperty` or its batched equivalent), applied to the owner's account scope as the Home screen uses it. No wider set.
   - **Queries:** explicit columns; deterministic, complete pagination (ordered by id, paged until a short page) for every `.in()` batch, deduplicated by id; integer-cent sums only (no floats).
   - **If any page or batch fails:** the whole result fails. A partial total is never returned.
3. **Result type:** `{ ok: true; byPropertyId: Record<string, number> } | { ok: false; error: "load_failed" }`.
   - Success with nothing received shows **$0**.
   - Failure shows **"—"** with **"Couldn't load"**.
   - A YTD failure never fails or blocks the rest of the owner dashboard. It runs concurrently with the other loaders, and the rest of Home renders normally.
4. In `dashboard-kpi-loader.ts`, `ytdIncomeCents` = the sum of `byPropertyId` over the selected homes (respecting the existing "Show" filter). Remove the old charge-based sum, and never use the dashboard's limited `charges` / `recent_payments` arrays for it.
5. Year-to-date expenses stay as they are.
6. **Tests:**
   - **Parity:** for the same fixture and homes, Home YTD == Money "This year" rent, exactly in cents (one home, several homes, the filter applied).
   - **Paging:** more than 1000 qualifying payments (beyond one page) are all counted.
   - **Exclusions:** a failed second page → `load_failed`; reversed and deleted rows excluded the same way Money does; payments in the previous December and a future date (whatever Money does); multiple leases for one home; a home with no rent.
   - **Errors and edges:** zero income → `$0`; an empty authorized list → `ok` with `{}`; an `accountId` the user doesn't own → no homes from it.

### E. Regression protection for the global look
1. **Contrast:** extend `theme-contrast-tokens.test.ts` to every foreground/background pair components actually use, at ≥4.5:1 (3:1 for large text, icons and focus rings), in light and dark:
   - text: `ink` / `ink-2` / `muted` on `ground`, `surface`, `surface-2`;
   - status and accent: `pos` / `crit` / `warn` on their `-bg` and on `surface`; `accent` on `surface`; `accent-contrast` on `accent`;
   - other: `faint` on `surface` for disabled (3:1); the focus ring color vs `surface`.
2. A test that the two dark blocks hold identical values.
3. Focus rings, validation (error) states, hover and selected nav states stay visible. Don't remove any `focus-visible` styles.
4. **Tab bar:**
   - `/owner/bank` → **Money** is active;
   - exactly **one** tab bar per page, including Money and Bank (test this);
   - safe-area bottom padding so content is never hidden behind it on Home, Money, Bank and owner sub-sections;
   - More opens and closes the drawer, with Escape and the keyboard;
   - tabs are real links, so browser back/forward works;
   - the Home badge reads as "Home, 2 late rent payments" for screen readers, without a duplicate announcement.
5. Keep the selected-home "Show" filter when moving between tabs, if it's already persisted (URL or storage). Don't add new persistence.
6. **Font:** `next/font/google` Geist with fallback `-apple-system, system-ui, sans-serif`. The build must succeed (it already has network); report whether the font is self-hosted at build.
7. **E2E:** make sure `tests/e2e/smoke-theme.spec.ts` covers the owner, manager and tenant views at a phone viewport in light and dark. Extend its routes only if needed; no new screens.

## 4. Out of scope
- Rebuilding the Home, Money or Homes layouts (216–217).
- Manager and tenant tab bars.
- New features, DB migrations, copy changes beyond tab labels and the "Couldn't load" state.
- Touching `.claude/launch.json`, `apps/mobile` or `apps/ios`.

## 5. Exact files expected to change
- `apps/web/app/globals.css`
- `apps/web/app/theme-utilities.css`
- `apps/web/tailwind.config.ts`
- `apps/web/app/layout.tsx`
- `apps/web/components/dashboard/owner-bottom-bar.tsx`
- `apps/web/components/dashboard/dashboard-layout.tsx` (only if needed)
- `apps/web/components/dashboard/sidebar/sidebar-nav.tsx` (only to expose the drawer's open handler, if needed)
- `apps/web/app/owner/money/page.tsx`
- `apps/web/app/owner/bank/page.tsx`
- `apps/web/lib/home-money.ts` or a new `apps/web/lib/owner-ytd.ts`
- `apps/web/app/owner/owner-page-data.ts` (and its types)
- `apps/web/components/dashboard/dashboard-kpi-loader.ts`
- `apps/web/components/ui/card.tsx` (only if `Card` doesn't use `.domus-card`)
- tests: `lib/__tests__/theme-contrast-tokens.test.ts`, `lib/__tests__/native-layout.test.tsx`, `components/__tests__/owner-navigation.test.tsx`, the `charge-row` snapshot (update only), a new `owner-ytd` test, a new `owner-bottom-bar` test

## 6. Implementation requirements
- Lines ≤ 140. No new dependencies (Geist ships with `next/font/google`; `lucide-react` already exists).
- Every Supabase result is checked.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run` (full suite)
- `npm run build --workspace @domus/web`
- Don't run `gate:web` (it reads the DB; Claude runs it).

## 8. Acceptance criteria (binary)
1. Token values match §A (or lightness-adjusted with the final hex reported). The contrast test passes for light and both dark blocks, the dark blocks are identical, and the radius tokens exist.
2. Geist is the only app font; Inter is gone.
3. **Tab bar tests:** five tabs in order, correct `href`s, the active rules in §C3 (one test per rule), More opens the drawer, the late badge appears with its aria-label, and it renders on the Money and Bank pages.
4. **YTD tests** (all of §D6 and §E1–4 present and passing). The original list:
   - a mocked Supabase with payments across years: Jan–Oct this year counts, last December doesn't, reversed doesn't, deleted charges don't, and non-rent categories don't;
   - per-home sums respect the selected homes;
   - a query error gives the error state, not a number;
   - the year boundary equals the Money page's.
5. Lint, typecheck, the full suite and the build are green. Updated snapshots only change class or token text.

## 9. Report format
JSON per `docs/codex-report-schema.json`, plus: the final token hexes that changed from §A, and the test names mapped to §8.3 and §8.4. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB access, deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/mobile` or `apps/ios`.
