# Sprint 217b — Owner Money + Homes in the Wallet layout (L2, UI) · rev 1

The owner approved this on 2026-10-11. Mockups are the artboards **"B · Money"** and **"B · Homes"** on https://claude.ai/artifact/FsvezREEzyFY6WXg9PDqo4.

This sprint runs after 217a is merged. 217a added these, and this sprint builds on them:
- `lib/owner-wallet-home.ts` (`loadOwnerWalletHome`: every administered home across accounts, with `accountName`, `activeLeases`, `isLate`, `leftCents`, `ytd`);
- the owner title row on the page ground;
- no phone top bar for owners.

## 1. Objective
Rebuild the two other owner tabs in the Wallet look, with real data:
- **Money** (`/owner/money`) defaults to **all homes**: a period switch, the big "Left after bills" number, an in/out bar, a list of categories, "Every item", and "For taxes".
- **Homes** (Homes tab = `/owner?section=portfolio`) shows one Wallet pass card per home, grouped by ownership account.

Managers and tenants are unchanged.

## 2. Context (HEAD `9229f51`, branch `main`)
- **Money page:** `app/owner/money/page.tsx` (64 lines), `app/owner/money/resolve.ts`, and `components/home-money/home-money-page.tsx` (97 lines).
  - Today it shows **one** home (it defaults to the first id) with 4 month tabs (3 months + "This year"), a "Left after bills" card, Heads up, and Every item with a running balance plus a "Download for taxes" CSV.
- **Money loaders (don't change their math):** `loadHomeMoney(userId, propertyId, range)` and `loadHomeAlerts(userId, propertyId, today)` in `lib/home-money.ts`. They gate on `canUserAdministerProperty`. `groupByCategory`, `runningBalance` and `homeMoneyCsv` are pure.
- **Links that must keep working:**
  - `/owner/money?property=<id>` (Home pass cards);
  - `/owner/money?month=year` and `?property=<id>&month=year` (YTD tiles);
  - `/owner/money?property=<id>&month=YYYY-MM`.
- **Homes:** the `portfolio` case in `components/dashboard/sections/render-section-cases.tsx:412` → `PortfolioSectionContent` (`components/dashboard/section-renderer-support.tsx:253-290`) → `PortfolioSection`.
  - This holds the owner's edit, rename, delete and management-fee controls, plus the tenant-invitation panel.
  - The property page is `/owner/properties/<id>`.
  - The Add menu (`OwnerAddMenu`) has "Add home", and the lease wizard opens through the existing `onOpenLeaseWizard` / tenant-invite handlers.
- **Wallet tokens and font** shipped in Sprint 215, and the pass-card palette in 216 (`home-pass-card.tsx`).

## 3. In scope
### 3.1 Money (`/owner/money`, owner only)
1. **All homes by default.** With no `property` param, the page shows the combined money of every administered home.
   - Build it with `Promise.all` over the existing `loadHomeMoney` / `loadHomeAlerts`, one call per administered home. That's parallel and bounded by the owner's home count; note it as known debt in the report.
   - Then combine with a new **pure** function `combineHomeMoney(results)` in `lib/home-money.ts`:
     - totals are the sums;
     - entries are concatenated and sorted by date, then id;
     - each entry gets `homeName`.
   - With `property=<id>`, show that one home exactly as today's data.
   - `resolveMoneySelection` returns `propertyId: null` when the param is missing or invalid (never default to the first home).
2. **Title row on the ground:** `Money` 34px/700. On the right is a white pill button, **For taxes** (44px high), that downloads the current view's CSV (the existing `homeMoneyCsv`).
   - The file name is `<home-or-All-homes>-<period>.csv`.
   - The CSV gets a "Home" column **only** in the all-homes view.
3. **Home filter** (only when there are 2 or more homes): a horizontal row of chips: `All homes`, then each home by name. They're links that keep the period. The selected chip is filled with accent and has white text.
4. **Period switch:** a 3-segment control (iOS style: `--surface-2` track, white selected segment) with these segments:
   - the current month's full name;
   - the previous month's full name;
   - the current year (e.g. `October` · `September` · `2026`).
   - They're links (`?month=YYYY-MM` / `?month=year`) that keep `property`.
   - Older months still work by URL, but no segment is selected for them.
   - Use `role="tablist"` / `aria-selected`.
5. **Hero:** "Left after bills · <October | September | 2026>" (13px muted), then the number at 48px/700 tabular:
   - green `--pos` above 0;
   - `--crit` below 0;
   - ink at 0.
6. **In/out bar:** a 10px rounded bar whose green fill width = in ÷ (in + out). When both are 0, it's an empty track.
   - Under it: `In $X` (green) on the left and `Out $Y` (ink) on the right.
7. **Category card:** a white 16px card with the `groupByCategory` rows. Each row has:
   - a 32px rounded tile with the label's first letter (rent tinted green, bills tinted neutral, using tokens);
   - the label;
   - the amount (`+$` green for in, `−$` ink for out).
8. **Heads up:** only when there are alerts. They're warm cards (`--warn-bg`) with the title and detail.
   - Remove the "Nothing unusual this month." line.
   - In the all-homes view, prefix each title with the home name when there are 2 or more homes.
9. **Every item:** a white row button, "Every item", with the count ("2 items") and a chevron. It toggles the item list in place (`aria-expanded`); the list is collapsed by default.
   - **Phone list rows:** title; then `Mon D · <home name, all-homes view only> · <source>` muted; then the amount on the right.
   - **Desktop `sm+`:** keep today's table, adding a Home column in the all-homes view. Keep the Balance column only in single-home view.
10. **Empty:** keep the existing "Nothing here yet. Upload a bank file to fill this in." link.
11. **Errors:** keep the existing "Numbers are not ready. Try again later."
12. **Desktop:** the same pieces in a centered column of at most 720px.

### 3.2 Homes (`section=portfolio`, owner only)
1. **Title row on the ground:** `Homes` 34px/700, and on the right a 44px round accent button, `+` (`aria-label="Add a home"`), that opens the existing Add-home flow. There's no `domus-card` wrapper on this section (same as Home in 217a).
2. **Data:** reuse `loadOwnerWalletHome` (217a) and extend each home with:
   - `addressLine1`;
   - `leaseEndDate` (the earliest active lease's end date, or null);
   - `rentDueThisYear` (count of rent charges due from Jan 1 through today);
   - `rentOnTimeThisYear` (of those, how many were fully paid with `paid_at` ≤ `due_date` + `grace_period_days`).
   - Batch the queries; no new tables.
3. **Groups:** one group per ownership account, ordered with the personal account first and then by name. The group label sits above its cards: 13px/600 uppercase muted, e.g. `ACE · PERSONAL`, `J&MSP · LLC`. Show the label even with one account.
4. **Pass card:** one per home, full width, 22px radius, with the same color palette and cycling as `home-pass-card.tsx` (reuse it; don't duplicate). Each card has:
   - **Header:** the home name (17px/700) with `addressLine1 · City, ST` (13px, white at 78%), and the chip on the right (`Rented` / `Rent late` / `No lease yet`).
   - **Leased:** a 2×2 grid of label/value pairs:
     - `Tenant` → names joined with ", ";
     - `Rent` → `$2,350 / mo`;
     - `Lease ends` → `Feb 1, 2027`, or `Month to month` when null;
     - `Paid this year` → `9 of 9 on time`, or `No rent due yet` when the due count is 0.
   - **Not leased:** a full-width white button, **Add tenant and lease**, in the card's color text, that opens the existing lease wizard / tenant-invite flow for that home.
   - The whole card (except that button) is a link to `/owner/properties/<id>`.
5. **Managing homes:** below the groups, a white row, **Manage homes** with a chevron. It toggles today's `PortfolioSectionContent` in place, so edit, rename, delete, management fee and the invitation panel stay reachable. That content stays unchanged.
6. **Failure state:** "Couldn't load your homes. Pull down to try again.", with Manage homes still shown.
7. The Homes tab's other sections (`units`, `leases`, `tenants`) are unchanged.

## 4. Out of scope
- Home (217a), sign-in, the tenant and manager screens, and the property detail page.
- New money math. `combineHomeMoney` only sums and concatenates existing results.
- DB, schema and RLS changes.
- Changing `loadHomeMoney`, `loadHomeAlerts` or `rentReceived*`.

## 5. Exact files expected to change
- `apps/web/app/owner/money/page.tsx`, `apps/web/app/owner/money/resolve.ts`
- `apps/web/lib/home-money.ts` (only `combineHomeMoney` plus the optional `homeName` on the CSV/Entry output type)
- `apps/web/components/home-money/home-money-page.tsx`
  - Split it into `components/home-money/` pieces, each ≤ 200 lines: `money-hero.tsx`, `period-switch.tsx`, `category-card.tsx`, `every-item.tsx`.
- `apps/web/lib/owner-wallet-home.ts` (the 4 new fields)
- `apps/web/components/dashboard/owner-homes/homes-wallet.tsx` (new, ≤ 200 lines)
- `apps/web/components/dashboard/owner-home/home-pass-card.tsx` (only to share the palette/shell)
- `apps/web/components/dashboard/section-renderer-support.tsx` and `apps/web/components/dashboard/sections/render-section-cases.tsx` (owner portfolio case only)
- `apps/web/components/dashboard/index.tsx` (only to drop the card on `portfolio` for owners, as 217a did for Home)
- Tests:
  - new: `combineHomeMoney`, `resolveMoneySelection`, the Money components, `HomesWallet`, and the new `owner-wallet-home` fields;
  - updated: the existing `home-money` / `portfolio-section` / owner Money page tests. Find them with `grep -rl "HomeMoneyPage\|resolveMoneySelection\|PortfolioSectionContent" apps/web --include=*.test.tsx --include=*.test.ts`.

## 6. Implementation requirements
- Lines ≤ 140 characters; new files ≤ 200 lines; no file over 500.
- Use tokens only. The only hex values allowed are the existing pass-card palette.
- Use real `<a href>` / `<button>`, with 44px targets and `aria-label` on icon-only buttons. Contrast must be ≥ 4.5:1 in light and dark, and on every pass-card color.
- Use tabular numbers (`.num`) for every amount.
- Check every Supabase `error`. Use no query inside a loop, except the documented bounded `Promise.all` per home in §3.1.1.
- Copy, exactly:
  - "Left after bills"
  - "In"
  - "Out"
  - "Every item"
  - "For taxes"
  - "All homes"
  - "Add tenant and lease"
  - "Manage homes"
  - "Month to month"
  - "No rent due yet"
  - "<n> of <m> on time"
  - "Couldn't load your homes. Pull down to try again."
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.
- **Invariants:**
  - Every Money URL in §2 still resolves to the same home and period.
  - The single-home totals equal today's `loadHomeMoney` totals.
  - The manager portfolio section is unchanged.
  - The owner's edit, delete, rename and management-fee actions are still reachable under Manage homes.
  - `?section=portfolio` round-trips on refresh.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`
- Run `rm -rf apps/web/.next` first if tsc reports " 2" duplicates.
- Don't run `gate:web`.

## 8. Acceptance criteria (binary; each one needs a named test that calls real code)
1. **`combineHomeMoney`:**
   - (a) totals = the sum of the inputs;
   - (b) entries are sorted by date and then id, each with `homeName`;
   - (c) a single input returns the same totals as that input.
2. **`resolveMoneySelection`:**
   - (a) with no param → `propertyId: null`;
   - (b) an invalid id → null;
   - (c) a valid id is kept;
   - (d) `month=year` and `YYYY-MM` work as today.
3. **Money page components:**
   - (a) the hero color follows the sign (3 cases);
   - (b) the bar width = in ÷ (in + out), and it's empty at 0/0;
   - (c) the period switch shows 3 segments that keep `property`;
   - (d) the home chips show only with 2 or more homes;
   - (e) Every item is collapsed by default and expands with `aria-expanded`;
   - (f) the CSV has a Home column only in all-homes view;
   - (g) Heads up is hidden when there are no alerts.
4. **`owner-wallet-home` new fields:**
   - (a) `rentOnTimeThisYear` counts a payment within the grace days as on time, and one after them as late;
   - (b) future-due charges aren't counted;
   - (c) `leaseEndDate` is null → "Month to month".
5. **`HomesWallet`:**
   - (a) it groups by account, personal first;
   - (b) a leased card shows its 4 fields;
   - (c) an unleased card shows "Add tenant and lease" and calls the handler;
   - (d) the card links to `/owner/properties/<id>`;
   - (e) Manage homes toggles `PortfolioSectionContent`;
   - (f) the failure copy is exact.
6. The manager portfolio renders as before (regression test).
7. Lint, typecheck, the full suite and the build are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Include the test names mapped to each §8 item (1a…7), and the known-debt note from §3.1.1. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB writes or migrations, no deploy, no commit, no push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or any "* 2.*" files.
- Don't invent URLs, emails or copy beyond what's specified here.
