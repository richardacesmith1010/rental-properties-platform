# Sprint 240a — App Review walk fixes: More menu, receipt page, tenant Messages icon (L2, web only)

## 1. Objective
Fix four problems found on 2026-10-18 when Claude walked the App Review demo accounts in the iPhone app. App Review follows
`docs/app-store/app-review-notes.md` 1c, so each problem is a likely rejection or a confused reviewer.

## 2. Context
- HEAD: latest `main`. All paths below are under `apps/web/`.
- **More menu off the dashboard.** `components/dashboard/owner-bottom-bar.tsx` (122 lines). On `/owner` the More button
  opens the full sidebar (filtered by what the account has). On every other owner page (`/owner/money`, `/owner/reports`,
  …) `onOpenMore` is not passed, so More opens `StandaloneDrawer` (`:45-68`). It lists every id in `ownerMenuGroups`
  (`components/dashboard/dashboard-config.ts:276-281`) with no filter and has no Reports link.
  - Result 1: a reviewer on the Money tab taps More and finds no "Reports" (the notes say "More → Reports").
  - Result 2: "Members" (only for LLC accounts, `dashboard-kpi-loader.ts:269`) and "Manager pay" (only when the owner has
    managers, `:268`) open `/owner?section=…` and show "Section not found … doesn't exist for your role"
    (`section-renderer-support.tsx:220`). The demo owner is an individual account with no managers.
  - Reports link on the dashboard: `dashboard-section-loaders.ts:31-33` builds `/owner/reports` plus `?account=<id>` when
    an account is active; `nav-items.ts:230-238` injects it with label "Reports".
- **Receipt page** `app/payments/receipt/[chargeId]/page.tsx` (279 lines). Opened from the tenant Rent tab "View Receipt"
  (`app/tenant/page.tsx:399-402`).
  - It has no tab bar, no back link and no swipe-back in the app: a dead end. The reversed-payment branch already has a
    "Back to Dashboard" link to `/tenant?section=charges` (`:104-106`); the normal branch does not.
  - In the app, the header row (`:210-226`) sits under the status bar and notch: `<main>` (`:129`) has no top safe-area
    padding.
  - "Receipt Timestamp" (`:240-241`) and the payment time (`:260`) use `formatDateTime`, which formats in UTC (`lib/format.ts:25-32`).
    At 4:55 PM Mountain time the receipt said "10:55 PM". The server does not know the reader's time zone.
- **Tenant Messages tab icon.** `components/dashboard/tenant-bottom-bar.tsx:12` uses `Bell` for "Messages". The owner bar
  uses `MessageCircle` (`owner-bottom-bar.tsx:91`).
- Existing tests: `components/__tests__/owner-bottom-bar.test.tsx`, `app/payments/receipt/__tests__/receipt-page.test.tsx`.

## 3. In scope
The four fixes in §6, with tests.

## 4. Out of scope
The dashboard sidebar and its filtering, `ownerMenuGroups` contents, `SectionNotFoundState`, `lib/format.ts` (do not change
`formatDateTime`; other pages use it), the tenant page, the PDF route, the iOS app, any copy not listed in §6.

## 5. Exact files expected to change
1. `apps/web/components/dashboard/owner-bottom-bar.tsx`
2. `apps/web/components/__tests__/owner-bottom-bar.test.tsx`
3. `apps/web/app/payments/receipt/[chargeId]/page.tsx`
4. `apps/web/app/payments/receipt/__tests__/receipt-page.test.tsx`
5. `apps/web/components/dashboard/tenant-bottom-bar.tsx`
6. `apps/web/components/__tests__/tenant-bottom-bar.test.tsx` (new)

## 6. Implementation requirements
1. **StandaloneDrawer** (file 1):
   - Leave out `members` and `manager-payments` (they exist only for some accounts). Keep every other id and its order.
   - Add a "Reports" link in the "Money" group, right after "Charts". Its href is `/owner/reports`, plus `?account=<value>`
     when the current URL has an `account` param (same value). Same classes as the other links; `title="Open Reports."`.
   - Do not change what More does on `/owner` (it still calls `onOpenMore`).
2. **Receipt page** (file 3), normal (not reversed) branch only:
   - Add a back link as the first element inside the header row's left column, above "Domus": text `Back to Rent`, href
     `/tenant?section=charges`, classes `inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent)]`,
     with a `ChevronLeft` icon (`lucide-react`, `h-4 w-4`, `aria-hidden`). It sits inside `data-print-controls="receipt"`,
     so it is hidden when printing.
   - `<main>` keeps its classes and adds `pt-[calc(env(safe-area-inset-top,0px)+2rem)]` in place of `py-8`'s top part,
     i.e. the class list uses `px-6 pb-8 pt-[calc(env(safe-area-inset-top,0px)+2rem)] lg:px-8`. Apply the same change to the
     reversed branch's `<main>` (`:100`).
   - Replace the "Receipt Timestamp" block (`:240-241`) with a date: label `Receipt Date` (same classes; CSS uppercases it), value `formatDate(new Date())`.
     Change the payment time value (`:260`) to `formatDate(payment.paid_at)`. Remove `formatDateTime` from the import if unused.
3. **Tenant bar** (file 5): `Bell` → `MessageCircle` for "Messages". No other change.

## 7. Validation commands
```
(cd apps/web && npx vitest run components/__tests__/owner-bottom-bar.test.tsx app/payments/receipt components/__tests__/tenant-bottom-bar.test.tsx)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
```
Do NOT run `npm run gate:web`.

## 8. Acceptance criteria (each asserts on rendered output; no `expect` inside mocks)
1. `owner-bottom-bar.test.tsx` "standalone More menu lists Reports and hides account-only sections": render on
   `/owner/money` without `onOpenMore`, open More; a link named "Reports" exists with href `/owner/reports`; no link
   named "Members" or "Manager pay"; links "Charts" and "Documents" still exist.
2. Same file, "Reports keeps the account": with `?account=abc` in the URL, the Reports href is `/owner/reports?account=abc`.
3. Same file, "dashboard More still uses the sidebar": with `onOpenMore` passed, tapping More calls it once and no
   standalone drawer link "Reports" renders (pins the `/owner` behavior, L-014).
4. `receipt-page.test.tsx` "has a way back to Rent": the normal receipt renders a link named "Back to Rent" with href
   `/tenant?section=charges`.
5. Same file, "shows dates, not UTC times": with `paid_at` `2026-08-01T15:00:00Z` the page shows `Aug 1, 2026` and the
   text `3:00 PM` does not appear; the label `Receipt Date` appears and `Receipt Timestamp` does not.
6. Same file, "clears the notch": the `main` element's class contains `safe-area-inset-top` (normal and reversed branches).
7. `tenant-bottom-bar.test.tsx` (new) "Messages uses the chat icon": the Messages link contains the `lucide-message-circle`
   icon class and not `lucide-bell`; the four labels are Home, Rent, Repairs, Messages in that order.
8. Every existing test in files 2 and 4 still passes.

## 9. Report format
Compact status only: files changed with line counts, test names, command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies. Lines ≤ 140 characters. Exact copy only: `Back to Rent`, `Receipt Date`,
  `Reports`, `Open Reports.`. No invented URLs.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
  user needs to think about what to do, the UI needs to be clearer.
