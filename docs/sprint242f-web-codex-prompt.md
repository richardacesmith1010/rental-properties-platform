# Sprint 242f-web — Redesign leftovers from the full walk (L2, web, look only)

## 1. Objective
Fix the visual leftovers Claude found walking every screen after 242a–242e. Spec: `docs/design/domus-design-system.md`.
**Look only:** no copy, layout, order or behavior change; no new words on screen.

## 2. Context (HEAD: latest `main`; paths under `apps/web/`)
1. **Header logo** — the mobile top bar and sidebar show a lucide `Landmark` in a blue tile as the brand icon:
   `components/dashboard/sidebar/sidebar-nav.tsx:263` and `:456` (`<Landmark className="h-4 w-4 text-[var(--accent)]" />`).
   The brand mark is `DomusMark` in `components/brand/domus-mark.tsx`.
2. **Needs you rows** — `components/dashboard/owner-home/needs-you-list.tsx:50-60`: the list sits on an amber
   `bg-[var(--warn-bg)]` panel. Spec §1/§4: records on a plain surface with hairline rules; color only as a small marker.
3. **Owner Home title rule** — the "Home" title block in `components/dashboard/dashboard-header.tsx` has no 2 px ink rule;
   the other screens got `border-b-2 border-[var(--ink)] pb-3` in 242d/242e.
4. **Card titles** — `components/ui/card.tsx:58-60` `CardTitle` renders `text-[15px] font-bold tracking-tight` sans
   (e.g. tenant "Your lease"). Spec §3: card/section titles use the serif.
5. **Decorative accent icons** — lucide icons used as decoration still use `text-[var(--accent)]` (e.g. the wrench on
   the tenant Home "Report a repair" row). Spec: accent only for links, focus and info markers.

## 3. In scope
`components/dashboard/sidebar/sidebar-nav.tsx`, `components/dashboard/owner-home/needs-you-list.tsx`,
`components/dashboard/dashboard-header.tsx`, `components/ui/card.tsx`, and every file under `components/dashboard/**`,
`components/home-money/**`, `app/tenant/**`, `app/manager/**` where a decorative icon (an `aria-hidden` lucide icon that
is not inside a link styled as a link) uses `text-[var(--accent)]`; tests.

## 4. Out of scope
Links (keep `--accent`), focus rings, unread/info dots, charts, copy, layout, iOS.

## 5. Exact files expected to change
The four files named in §3 plus each file changed under rule 6.5 (list them). New test:
`apps/web/components/__tests__/redesign-leftovers.test.tsx`.

## 6. Implementation requirements
1. **Logo** — both `Landmark` brand tiles → `<DomusMark size={32} />` (tile), keeping the surrounding element, its
   accessible name and click behavior. Remove the `Landmark` import if unused.
2. **Needs you** — panel: `rounded-2xl border border-[var(--line)] bg-[var(--surface)]` (no `--warn-bg`). Each row
   starts with a 8×8 px square marker (`rounded-[1px]`, `aria-hidden`): `bg-[var(--warn)]` for the `late` row,
   `bg-[var(--accent)]` for every other row. Row text, order, links and buttons unchanged.
3. **Home title rule** — the owner Home title block gets `border-b-2 border-[var(--ink)] pb-3`, matching other screens
   (the Add button stays where it is).
4. **CardTitle** — `font-display text-[17px] font-semibold` (drop `font-bold tracking-tight`); keep `domus-heading`.
5. **Decorative icons** — `text-[var(--accent)]` on decorative icons in §3's paths → `text-[var(--ink-2)]`.
6. Lines ≤ 140 characters. No new dependencies. No copy changes.

## 7. Validation commands
```
(cd apps/web && npx vitest run components/__tests__/redesign-leftovers.test.tsx)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
/usr/bin/grep -rn "Landmark" apps/web/components/dashboard/sidebar/sidebar-nav.tsx
/usr/bin/grep -n "warn-bg" apps/web/components/dashboard/owner-home/needs-you-list.tsx
```
The two greps print nothing. Do NOT run `npm run gate:web`.

## 8. Acceptance criteria
1. `redesign-leftovers.test.tsx` "needs you": rendering `NeedsYouList` with a late charge and 3 bank items gives a panel
   with `bg-[var(--surface)]` and no `bg-[var(--warn-bg)]`; the late row's marker has `bg-[var(--warn)]`, the bank row's
   `bg-[var(--accent)]`; row labels are exactly as before ("<name>'s rent is late", "3 bank items to check").
2. Same file, "card title": `<CardTitle>Your lease</CardTitle>` has `font-display` and not `font-bold`.
3. Same file, "mobile top bar logo": the mobile top bar renders a `DomusMark` (its `svg` with two paths) and no
   `lucide-landmark` icon.
4. All existing tests pass; updated old-look assertions are named in the report.

## 9. Report format
Compact status only: files changed with line counts, test names, command results, grep outputs, updated assertions.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only §3/§5 files. No copy changes. No new dependencies.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
  user needs to think about what to do, the UI needs to be clearer.
