# Sprint 216 — Owner Home rebuilt in the Wallet layout (L2, UI) · rev 1

Owner approved on 2026-10-11. Mockup: artboard **"B · Home ✓ chosen"** on https://claude.ai/artifact/FsvezREEzyFY6WXg9PDqo4 (`project/Wallet.dc.html`). The Wallet tokens, font and tab bar shipped in Sprint 215.

## 1. Objective
Replace today's long owner Home (about four phone screens of boxes) with the one-screen Wallet layout. Show the same real data, with far fewer words and money as the hero. **Owner only**: the manager Home (which shares `OwnerDailyOpsHome`) must look and behave exactly as today.

## 2. Context (HEAD `b59dd11`)
- **Owner Home:** `components/dashboard/owner-daily-ops-home.tsx` (266 lines, shared with the manager via `isManagerView`).
  - It renders `OwnerBankCard`, `HomeMoneyCard` (owner only), "Needs you today", a homes grid, and "More numbers" (`FinancialOverviewPanel` / `DomusFinancialsCard`).
  - It's mounted from `components/dashboard/index.tsx:205`.
  - The section header ("Good evening, Ace", Send Announcement, Add) comes from the dashboard page header in `index.tsx`.
- **Data already available on the client** (don't add server loaders, except where §3.5 allows):
  - `homeActionItems` from `dashboard-home-loader.ts`: late charges, due, the next due date/amount/tenant count, outside-Domus status, `joinedWithoutLease`, open repairs, new messages;
  - portfolio (homes, units, leases, tenants);
  - `financialOverviewData` (`monthlyCollectedCents`, `monthlyExpensesCents`, `netIncomeCents`, `ytdIncomeCents` — correct since 215, `ytdExpensesCents`, and the YTD error state);
  - the `OwnerBankCard` state (LLC "needs one more thing" → Finish setup);
  - the Money page links `/owner/money?property=<id>`.
- **Plain language rules:** CLAUDE.md §18.

## 3. In scope (owner Home only, below and above `lg`)
1. **Large title row:**
   - `Home` (34px/700) with the greeting `Good evening, Ace` as a small muted line above it (keep the existing greeting logic);
   - right side: one 44px circular **Add** button (`+` icon, `aria-label="Add"`) that opens the existing Add menu;
   - **Send Announcement** moves into the Add menu (or More), and is removed from the header **for owners on the Home section only**.
2. **Home "Wallet pass" card(s):** one per home with an active lease, ordered by name, scrolling horizontally (`scroll-snap`) when there's more than one, with no visible scrollbar.
   - **Card:** solid color from a fixed per-home palette (`#14532D`, `#1E3A8A`, `#111214`, `#7C2D12`, cycling by index), 22px radius, `--shadow-lg`, white text (check ≥ 4.5:1 on each color).
   - **Contents:**
     - home name + city/state;
     - a status chip: `Rented` / `Rent late` / `No lease yet`;
     - "Left after bills this month" with the big number (44px/700, tabular) = that home's collected − expenses this month;
     - bottom row: the tenant name(s) · `Next rent <date> · $<amount>`.
   - The whole card is a link to `/owner/money?property=<id>`.
   - Homes **without** an active lease show as a compact white row under the cards (name, owner account, `No lease yet`, chevron) linking to the home page.
3. **Two tiles** (2-column grid, white 16px cards):
   - **"2026 so far"**: YTD net (`ytdIncomeCents − ytdExpensesCents`), red if below zero, green if above; when YTD fails, show `—` and `Couldn't load`;
   - **"Rent collected"**: `ytdIncomeCents`.
   - Both link to `/owner/money?month=year` (keep the current property if one is selected).
4. **Needs you:** only if there are items. Up to 3 tappable rows (warm `--warn-bg` card, chevron), in this priority:
   1. late rent ("Angel's rent is late", links to Rent);
   2. the bank or LLC setup step ("Finish J&MSP bank setup", existing link);
   3. tenant joined without a lease (existing action);
   4. open repairs ("2 open repairs");
   5. new messages.
   - Reuse the existing actions and links; no new logic.
   - If there are no items, show nothing (no "Everything looks good" box).
5. **Recent activity:** the last 5 money items across the owner's homes (rent in, bills out), each a row: title, `Mon D · Home`, and the amount (green for in, ink for out), plus a `See all` link to `/owner/money`.
   - Source: if the client already has recent payments/expenses, use them. Otherwise add **one** batched server loader using the shared `lib/home-money` row logic for the current month and the previous month, failing closed to "Couldn't load" (no waterfall; it runs in parallel with the existing loaders).
6. **Remove from the owner Home:**
   - the "This month" `HomeMoneyCard`, "Rent this month", "Homes 1 / 1 of 1 rented", "Next rent due" boxes;
   - "More numbers" / `FinancialOverviewPanel` / `DomusFinancialsCard`;
   - "Sort your bank file" (it lives on Money, and in More).
   - Keep these components in the codebase for the manager view and other pages. Delete only owner-Home-only code that becomes dead (grep the full tree first, per L-006).
7. **Desktop (`lg+`):** the same pieces in a centered column at most 720px wide (cards may sit two across). The sidebar is unchanged.
8. **Manager invariants (must not change):** with `isManagerView`, the manager Home renders exactly the same components, order and text as before this sprint. Add a regression test that renders the manager view and asserts the old sections are still present.

## 4. Out of scope
- The Money or Homes screen redesigns (Sprint 217), the sign-in page, and the tenant or manager screens.
- New metrics.
- DB changes.

## 5. Exact files expected to change
- `apps/web/components/dashboard/owner-daily-ops-home.tsx` (split it: a new `components/dashboard/owner-home/` folder with `wallet-home.tsx`, `home-pass-card.tsx`, `ytd-tiles.tsx`, `needs-you-list.tsx`, `recent-activity.tsx`, each ≤ 200 lines)
- `apps/web/components/dashboard/index.tsx` (only the owner header change and the mount)
- `apps/web/components/dashboard/dashboard-home-loader.ts` (only if needed)
- a server loader file, only if §3.5 needs one (e.g. `apps/web/lib/owner-recent-activity.ts`), plus `app/owner/owner-page-data.ts` wiring
- tests: new ones for each new component, the manager regression test, and updates to existing owner Home tests

## 6. Implementation requirements
- Lines ≤ 140; files ≤ 500 lines (aim for ≤ 200).
- Tokens only, with no new hex values except the 4 card colors.
- Real `<a href>` and `<button>`; 44px touch targets.
- `aria-label` on icon-only buttons; text contrast ≥ 4.5:1 in light and dark.
- Money uses `.num` / tabular numbers.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`
- Don't run `gate:web` (it reads the DB).

## 8. Acceptance criteria (binary)
1. The owner Home shows exactly the §3 pieces in order: title, pass cards, tiles, Needs you (when there are items), recent activity. The removed pieces are gone for owners.
2. Pass card values: left-after-bills per home = collected − expenses this month for that home; the chip rules hold; each card links to that home's Money page. One test per rule.
3. YTD tiles use `ytdIncomeCents` / `ytdExpensesCents`, and show `—` with `Couldn't load` on failure.
4. Needs you follows the priority order, caps at 3, and hides when empty (tests).
5. Recent activity shows at most 5 items, newest first, with the right colors, and fails closed (tests).
6. The manager Home is unchanged (regression test).
7. Lint, typecheck, the full suite and the build are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, plus the test names mapped to §8. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB access, deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios` or `apps/mobile`.
