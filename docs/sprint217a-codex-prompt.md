# Sprint 217a — Owner Home: every home, title on the ground, top bar into More (L2, UI) · rev 1

The owner approved this on 2026-10-11. They answered the Sprint 216 open questions:
- (1) "Yes": Home shows every home across all of the owner's accounts.
- (2) "Move it": the title comes off the white header card and onto the page ground, and the phone top bar moves somewhere sensible.

Mockup: artboard **"B · Home ✓ chosen"** on https://claude.ai/artifact/FsvezREEzyFY6WXg9PDqo4. It has no top bar, and the title sits on the gray ground.

Sprint 217b (the Money and Homes screens) follows separately. Don't start it here.

## 1. Objective
Three owner-only phone and desktop changes, plus one tiny fix:
1. The owner Home shows **every** home the owner administers, across all ownership accounts, not just the active account.
2. On every owner section, the large title row sits **on the page ground** instead of inside the white card. Home has no card at all.
3. On phones (`< lg`), the owner's top bar (logo, search, bell, account pill) is **removed**. Its items move into the **More** drawer, and the More tab gets the unread badge.
4. The 404 page's "Page not found" heading is invisible on the light ground (`text-white`). Fix it.

Managers and tenants must look and behave exactly as today.

## 2. Context (HEAD `6ecefd5`, branch `main`)
- **Owner Home (Sprint 216):** `components/dashboard/owner-home/wallet-home.tsx` gets `portfolio` (scoped to the active account) and `money` from `loadOwnerHomeMoney(ids)` in `lib/owner-recent-activity.ts`.
  - `ids` are the active account's ids (`app/owner/owner-page-data.ts:141-178`).
  - The YTD tiles use the account-scoped `loadOwnerYearRentReceived(activeAccountId)` (`lib/owner-ytd.ts`) and `financialOverviewData.ytdExpensesCents`.
- **All homes the owner administers:** `getAdministeredProperties(userId)` / `getAdministeredPropertyIds(userId)` in `lib/property-access.ts`. `/owner/money` already uses it.
  - `AdministeredProperty` has `ownerAccountId`.
  - Account names come from `getOwnershipAccountsForUser` (`lib/ownership`).
- **Rent rows and math to reuse (no new money math):**
  - `loadRentRowsForProperties` (`lib/owner-rent-rows.ts`);
  - `rentReceivedByPropertyId` (`lib/rent-received.ts`);
  - the expense-sum pattern already in `loadOwnerHomeMoney`.
- **Owner section header:** `components/dashboard/index.tsx:363-397`.
  - It's a `domus-card` wrapping both the title row (greeting + `Home` h1, or the section label + description, plus Send Announcement and `OwnerAddMenu`) and the section content.
- **Phone top bar:** `MobileTopBar` in `components/dashboard/sidebar/sidebar-nav.tsx:311-483`. It renders:
  - the logo, the search button and `NotificationBellMenu`;
  - `MobileUserFooter` (the account pill → `UserMenuPopover`, with the red not-connected dot);
  - **and** `MobileDrawer`, which the owner's More tab opens through `onMobileDrawerOpenChange`.
  - The drawer already contains the display name, the "N unread" badge, search, `accountSwitcher`, the nav list and the theme toggle.
- **Bottom bar:** `components/dashboard/owner-bottom-bar.tsx`. The tabs are Home · Money · Homes · Inbox · More; More calls `onOpenMore`.
  - `/owner/money` and `/owner/properties/*` render `OwnerBottomBar` standalone, with no top bar and their own `StandaloneDrawer`.
- Production data (owner "Ace"): "1st Home" is in the personal account; "Mom's House" is in the J&MSP LLC account (no lease). Today Home shows only the active account's homes.

## 3. In scope
### 3.1 Home shows every home
1. Add **one** server loader, `loadOwnerWalletHome(userId, today = new Date())`, in a new file `apps/web/lib/owner-wallet-home.ts` (≤ 200 lines). It returns `{ ok: true, homes, ytd, recent } | { ok: false, error: "load_failed" }`:
   - **`homes`:** one entry per administered property (all accounts), from `getAdministeredProperties(userId)`. Each entry has:
     - `id`, `name`, `city`, `state`, `accountId`, `accountName`;
     - `activeLeases: { tenantNames: string[]; rentCents: number; nextDueDate: string | null }[]`;
     - `isLate` (any unpaid charge on that home with a due date before today);
     - `leftCents` (rent received − expenses this calendar month, using the same rules as `loadOwnerHomeMoney`).
   - **`ytd`:** `{ inCents, outCents }` summed over **all** of the above homes for the current calendar year:
     - `inCents` comes from `rentReceivedByPropertyId` over the year;
     - `outCents` is the sum of `property_expenses.amount_cents` for the year.
   - **`recent`:** the 5 newest money items across all homes. Reuse `loadOwnerHomeMoney(allIds, today)`; don't copy its logic.
   - Batch every query with `.in(...)`, with no query inside a loop. Run independent loads with `Promise.all`. On any error, log it with `console.error` and return `{ ok: false }`.
   - Use only rows for the ids from `getAdministeredProperties(userId)`. Never accept property ids from the client.
2. Wire it in `app/owner/owner-page-data.ts` as one more promise, measured as `"home.wallet"` with `measureOwnerWithRequest` and run in parallel with the existing loaders.
   - Remove the now-unused account-scoped `ownerHomeMoneyPromise` wiring only if nothing else reads it (grep first, per L-006).
   - Pass the result to `WalletHome`.
3. `WalletHome` renders its pass cards, unleased rows, YTD tiles and Recent activity from `loadOwnerWalletHome` instead of the account-scoped `portfolio` / `money` / `ytd*`.
   - **When the owner has more than one account,** each pass card and each unleased row shows the account name after the city (`Denver, CO · J&MSP`). With one account, don't show it.
   - **Needs you:**
     - the late-rent row now uses `homes[].isLate` across all homes ("<Home>'s rent is late", or "<Tenant>'s rent is late" when the tenant name is known);
     - the other Needs-you rows keep their current sources.
   - **Failure state:** when the loader fails, show one muted line in place of the pass cards, "Couldn't load your homes. Pull down to try again." The tiles show `—` and "Couldn't load", and Recent activity shows its existing failure state.
4. The manager Home is unchanged (it doesn't use `WalletHome`).

### 3.2 Title on the ground (owner only, all sizes)
1. In `index.tsx`, for owners, move the title row **out of** the `domus-card`. It renders directly on `--ground`, aligned to the same max width as the content.
   - **Home:** greeting, `Home` 34px/700, and the round Add button (unchanged behavior).
   - **Other owner sections:** the section label as a 34px/700 title with the existing description under it in muted 15px, and the existing actions (Send Announcement, Add) on the right.
2. **Home:** drop the `domus-card` wrapper entirely. The pass cards, tiles and lists sit on the ground, as in the mockup.
   - **Other owner sections:** keep the `domus-card` around the section content (those screens get redesigned later).
3. No change for managers or tenants (`PageHeader` / `DashboardHeader` paths untouched).

### 3.3 Phone top bar → More (owner only, `< lg`)
1. For `role === "owner"`, `MobileTopBar` renders **no visible bar**. Keep its `MobileDrawer` mounted so the More tab still opens it, and keep the safe-area top padding on the page (`pt-[env(safe-area-inset-top)]`) so the title doesn't sit under the notch.
   - **Simplest acceptable shape:** split `MobileTopBar` so the drawer can render without the bar.
2. The owner's More drawer gets these items, in this order at its top:
   1. **Profile row:** avatar, name and "Owner", with the existing red dot when the bank isn't connected. Tapping it opens `/settings`.
   2. **Search** (the existing `CommandPaletteTrigger` / `GlobalSearch`, unchanged).
   3. **Notifications** row: a bell icon, "Notifications" and the unread count. It opens the notifications section through the existing `onSelectItem("notifications")`, or `/owner#notifications` when that handler is missing, and closes the drawer.
   4. The account switcher (already there).
   - Remove the drawer's old "N unread" badge, since the row replaces it.
3. The **More** tab in `OwnerBottomBar` shows a badge with the unread notification count (same style as the Inbox badge; `aria-label="More, N unread notifications"`). Hide it when the count is 0.
   - Thread `unreadNotificationCount` through `DashboardLayout` → `OwnerBottomBar`.
   - Standalone uses (`/owner/money`, `/owner/properties/*`) may show no badge. Don't add loaders for them.
4. Desktop `lg+`: the sidebar is unchanged. Manager and tenant `MobileTopBar` are unchanged.

### 3.4 404 heading
- In `app/not-found.tsx`, change `text-white` on the h1 to `text-[var(--ink)]`.
- Change the link's `focus-visible:ring-offset-[var(--ink)]` to `ring-offset-[var(--ground)]`.
- Check that the 404 page is readable in light and dark.

## 4. Out of scope
- The Money and Homes screen redesigns (217b), sign-in, and the tenant or manager screens.
- New metrics, DB or schema changes, and RLS.
- Changing which homes other owner sections show (they stay account-scoped).
- Removing the account switcher.

## 5. Exact files expected to change
- `apps/web/lib/owner-wallet-home.ts` (new)
- `apps/web/app/owner/owner-page-data.ts` (wiring only)
- `apps/web/app/owner/page.tsx` and/or `components/dashboard/dashboard-data-loader.tsx` (only to pass the new prop through)
- `apps/web/components/dashboard/owner-home/wallet-home.tsx`, `home-pass-card.tsx`, `ytd-tiles.tsx`, `needs-you-list.tsx`, `recent-activity.tsx` (only as needed)
- `apps/web/components/dashboard/index.tsx` (only the owner header/card block at about lines 363-397)
- `apps/web/components/dashboard/sidebar/sidebar-nav.tsx` (`MobileTopBar` owner split plus drawer rows)
- `apps/web/components/dashboard/dashboard-layout.tsx` (thread the unread count)
- `apps/web/components/dashboard/owner-bottom-bar.tsx` (the More badge)
- `apps/web/app/not-found.tsx`
- Tests: new ones for `owner-wallet-home.ts`, plus updates to the existing owner Home, bottom-bar and sidebar tests. Find them with `grep -rl "WalletHome\|OwnerBottomBar\|MobileTopBar" apps/web --include=*.test.tsx`.

Any other file is out of scope. If one is truly needed, list it in the report with the reason.

## 6. Implementation requirements
- Lines ≤ 140 characters; new files ≤ 200 lines; no file over 500 lines.
- Use tokens only, with no new hex values.
- Use real `<a href>` / `<button>`, with 44px touch targets and an `aria-label` on icon-only buttons. Text contrast must be ≥ 4.5:1 in light and dark.
- Money uses tabular numbers via the existing `.num` class.
- Every Supabase result's `error` is checked (L-002).
- Copy, exactly (CLAUDE.md §18):
  - "Couldn't load your homes. Pull down to try again."
  - "Notifications"
  - "Couldn't load"
  - "<Name>'s rent is late"
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.
- **Invariants to keep (L-014):**
  - With `isManagerView`, the manager Home is byte-for-byte the same in its components, order and text.
  - Manager and tenant `MobileTopBar` render as before.
  - Owner section switching through the URL (`?section=`) still round-trips on refresh.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run` (full suite)
- `npm run build --workspace @domus/web`
- Run `rm -rf apps/web/.next` first if tsc reports duplicate " 2" files.
- Don't run `gate:web`.

## 8. Acceptance criteria (binary; each one needs a named test that calls real code)
1. **`loadOwnerWalletHome` with mocked Supabase:**
   - (a) it returns homes from **two** accounts, with `accountName` set;
   - (b) `leftCents` per home = this month's rent received − this month's expenses;
   - (c) `ytd.inCents` / `ytd.outCents` are the sums across both accounts' homes;
   - (d) `isLate` is true only for an unpaid charge due before today;
   - (e) any query error → `{ ok: false }`;
   - (f) it never queries ids outside `getAdministeredProperties`.
   - That's 6 tests.
2. **`WalletHome`:**
   - (a) it renders a pass card for each leased home across accounts;
   - (b) the account name shows only when there are 2 or more accounts;
   - (c) the failure state shows the exact copy, and the tiles show `—`;
   - (d) the late-rent Needs-you row comes from `isLate`.
3. **Owner header:**
   - (a) on Home, the title row is not inside an element with class `domus-card`, and there's no `domus-card` around the Home content;
   - (b) on another owner section (e.g. `maintenance`), the title is outside the card and the content is inside a `domus-card`;
   - (c) the manager Home and the manager section header render as before (regression test).
4. **Phone top bar:**
   - (a) for an owner, the search button, the bell trigger and the account pill aren't rendered outside the drawer;
   - (b) the owner drawer shows Profile → Search → Notifications (with the count) → the account switcher, in that order;
   - (c) the manager's `MobileTopBar` still renders search, the bell and the pill.
5. **More badge:** it shows the unread count with that `aria-label`, and it's hidden at 0.
6. **404:** the h1 has no `text-white`.
7. Lint, typecheck, the full test suite and the build are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Include a list of the test names mapped to each §8 item (1a…7). Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB writes or migrations, no deploy, no commit, no push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/` (other than nothing), or any "* 2.*" files.
- Don't invent URLs, emails or copy beyond what's specified here.
