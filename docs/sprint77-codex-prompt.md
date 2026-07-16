# Sprint 77 — Codex Implementation Prompt

## 1. Objective

Build a financial overview panel on the owner dashboard that shows either Plaid bank data OR Domus internal financial data, with a toggle to switch between them. When Plaid is connected, show real bank balances alongside Domus rent collection data. When Plaid is unavailable or disconnected, show Domus-only financial summaries.

## 2. Context

- **Branch**: `main`
- **HEAD**: `4b4c695`
- **Production URL**: `https://domusbase.com`
- **Existing Plaid infrastructure**:
  - `app/actions/plaid.ts` — `initiatePlaidLink`, `completePlaidLink`, `refreshPlaidBalance`, `disconnectPlaid`
  - `lib/plaid.ts` — `createLinkToken`, `exchangePublicToken`, `getAccounts`, `getBalances`
  - `components/dashboard/bank-balance-card.tsx` — existing card shows bank name, balance, refresh button
  - `ownership_accounts` table stores: `plaid_balance_cents`, `plaid_bank_name`, `plaid_bank_mask`, `plaid_balance_updated_at`
  - Plaid SDK v41.4.0 installed
- **Existing Domus financial data** (already computed):
  - `DashboardKpis`: monthlyGrossRentCents, lateRentCents, lateAccountCount
  - `AnalyticsDashboardData.summaryKpis`: totalIncomeCentsYtd, totalExpenseCentsYtd, netIncomeCentsYtd, collectionRate
  - Charges with status (pending/paid/late/waived), amounts, dates
  - Expenses with amounts, categories, dates

## 3. In Scope

### Part A: Financial Overview Panel
A new dashboard section/card that consolidates financial information with two views:

**View 1: "Bank" (Plaid)**
- Connected bank account name + last 4 digits
- Current bank balance (from Plaid)
- Last updated timestamp + refresh button
- "Connect Bank" button if Plaid not connected
- Graceful "Bank data unavailable" state if Plaid errors

**View 2: "Domus" (Internal)**
- Total rent collected this month
- Total outstanding (pending + late)
- Total expenses this month
- Net income this month (collected - expenses)
- YTD income summary
- Collection rate percentage

**Toggle:** A segmented control or tab switcher at the top of the panel: `[Bank] [Domus]`
- Default: Show "Bank" if Plaid is connected, "Domus" if not
- User can switch freely
- Remember preference in localStorage

### Part B: Combined View Option
When Plaid IS connected, offer a third option or a combined display:
- Bank balance (from Plaid) at the top
- Domus metrics below (rent collected, outstanding, expenses)
- This gives the owner a complete financial picture in one glance

### Part C: Plaid Connection Flow in Panel
If Plaid is not connected, the Bank tab shows:
- Friendly message: "Connect your bank to see real-time balances"
- "Connect Bank Account" button that initiates Plaid Link
- After connection: panel automatically refreshes to show balance

### Part D: Auto-Refresh Balance
- When the owner opens the dashboard, if the Plaid balance is older than 4 hours, auto-refresh it in the background
- Show a subtle "Refreshing..." indicator during refresh
- If refresh fails, show last known balance with "Last updated X hours ago" warning

### Part E: Integration with Home Page
- Place the financial overview panel on the Home page (page 1 of the paginated dashboard)
- It should sit below the greeting and KPI pills, or replace one of the existing sections
- Should feel like a natural part of the dashboard, not a bolted-on widget

## 4. Out of Scope

- Transaction history from Plaid (Sprint 78)
- Transaction reconciliation (Sprint 78)
- Tenant ACH payments (Sprint 79)
- Plaid production access application
- Database migrations
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (2-3)
1. `apps/web/components/dashboard/financial-overview-panel.tsx` — main panel with Bank/Domus toggle
2. `apps/web/components/dashboard/domus-financials-card.tsx` — Domus internal financial metrics display
3. `apps/web/lib/__tests__/financial-overview.test.ts` — unit tests

### Modified Files (3-5)
1. `apps/web/components/dashboard/owner-daily-ops-home.tsx` — integrate financial overview panel into Home page
2. `apps/web/components/dashboard/bank-balance-card.tsx` — refactor to be usable inside the panel (may need props changes)
3. `apps/web/components/dashboard/dashboard-data-loader.tsx` — ensure Plaid data + Domus financials are both available
4. `apps/web/app/actions/plaid.ts` — add auto-refresh logic (check staleness before refreshing)
5. `apps/web/components/dashboard/index.tsx` — pass financial data to home page

## 6. Implementation Requirements

### Part A: Financial Overview Panel

**File: `components/dashboard/financial-overview-panel.tsx`**

```tsx
"use client";

interface FinancialOverviewPanelProps {
  // Plaid data
  plaidConnected: boolean;
  bankName?: string;
  bankMask?: string;
  balanceCents?: number;
  balanceUpdatedAt?: string;
  accountId: string;

  // Domus data
  monthlyCollectedCents: number;
  monthlyOutstandingCents: number;
  monthlyExpensesCents: number;
  netIncomeCents: number;
  ytdIncomeCents: number;
  ytdExpensesCents: number;
  collectionRate: number;
}

// Component structure:
// 1. Header row: "Finances" title + toggle: [Bank] [Domus] [Both]
//    - "Both" only available when Plaid is connected
//    - If Plaid not connected, "Bank" tab shows connect prompt
// 2. Content area based on active tab
// 3. Store active tab in localStorage("domus-finance-view")
```

### Part B: Domus Financials Card

**File: `components/dashboard/domus-financials-card.tsx`**

```tsx
interface DomusFinancialsProps {
  monthlyCollectedCents: number;
  monthlyOutstandingCents: number;
  monthlyExpensesCents: number;
  netIncomeCents: number;
  ytdIncomeCents: number;
  ytdExpensesCents: number;
  collectionRate: number;
}

// Display as a clean card with rows:
// ┌──────────────────────────────────┐
// │  This Month                      │
// │  Collected        $2,350.00  ✅  │
// │  Outstanding      $0.00      ─   │
// │  Expenses         $211.50    📤  │
// │  ─────────────────────────────── │
// │  Net Income       $2,138.50  📈  │
// │                                  │
// │  Year to Date                    │
// │  Total Income     $7,050.00      │
// │  Total Expenses   $634.50        │
// │  Collection Rate  100%      🟢   │
// └──────────────────────────────────┘
//
// Use formatCurrency for all amounts
// Use status-colors for positive (green) / negative (red) indicators
// Net income row is bold/highlighted
```

### Part C: Toggle Component

```tsx
// Segmented control style:
<div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
  <button
    className={activeTab === "bank" ? "bg-white shadow-sm rounded-md px-4 py-1.5 text-sm font-medium text-slate-900" : "px-4 py-1.5 text-sm text-slate-500 hover:text-slate-700"}
    onClick={() => setActiveTab("bank")}
  >
    Bank
  </button>
  <button
    className={activeTab === "domus" ? "..." : "..."}
    onClick={() => setActiveTab("domus")}
  >
    Domus
  </button>
  {plaidConnected && (
    <button
      className={activeTab === "both" ? "..." : "..."}
      onClick={() => setActiveTab("both")}
    >
      Both
    </button>
  )}
</div>
```

### Part D: Auto-Refresh Logic

In the panel component or data loader:

```typescript
// Check if balance is stale (>4 hours old)
const isStale = plaidConnected && balanceUpdatedAt &&
  (Date.now() - new Date(balanceUpdatedAt).getTime()) > 4 * 60 * 60 * 1000;

useEffect(() => {
  if (isStale && !refreshing) {
    setRefreshing(true);
    refreshPlaidBalance(new FormData(/* accountId */))
      .then(() => router.refresh())
      .finally(() => setRefreshing(false));
  }
}, [isStale]);
```

### Part E: Bank Not Connected State

```tsx
// When Plaid is not connected and user selects "Bank" tab:
<div className="flex flex-col items-center justify-center py-8 text-center">
  <BankIcon className="w-10 h-10 text-slate-300 mb-3" />
  <h3 className="text-lg font-semibold text-slate-900">Connect your bank</h3>
  <p className="text-sm text-slate-500 mt-1 mb-4">
    See real-time balances from your bank account right in Domus.
  </p>
  <PlaidLinkButton accountId={accountId} />
</div>
```

### Part F: Unit Tests

Test:
1. Panel renders "Bank" tab when Plaid connected
2. Panel renders "Domus" tab by default when Plaid not connected
3. Domus financials card formats currency correctly
4. Net income shows green when positive, red when negative
5. Stale balance check works (>4 hours = stale)
6. Toggle switches between views
7. "Both" tab only available when Plaid connected

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Financial overview panel renders on owner Home page
2. [ ] Toggle switches between Bank / Domus / Both views
3. [ ] Bank view shows balance, bank name, last 4 digits, refresh button when Plaid connected
4. [ ] Bank view shows "Connect your bank" prompt when Plaid not connected
5. [ ] Domus view shows: collected, outstanding, expenses, net income, YTD, collection rate
6. [ ] Both view shows bank balance at top + Domus metrics below
7. [ ] Toggle preference saved in localStorage
8. [ ] Auto-refresh triggers when balance is >4 hours stale
9. [ ] "Refreshing..." indicator shown during auto-refresh
10. [ ] Graceful error handling if Plaid refresh fails (show last known balance)
11. [ ] All amounts formatted with `formatCurrency`
12. [ ] 7+ unit tests passing
13. [ ] `npm run gate:web` passes
14. [ ] No regressions to existing dashboard or Plaid functionality

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
BANK_VIEW: working | broken
DOMUS_VIEW: working | broken
BOTH_VIEW: working | broken
TOGGLE: working | broken
AUTO_REFRESH: working | broken
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations (use existing plaid_* columns)
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT call Plaid API on every page load — only auto-refresh if >4 hours stale
- Do NOT expose plaid_access_token to the client — server actions only
- Reuse existing BankBalanceCard component where possible — extend, don't rebuild
- Financial data must come from already-computed dashboard data (no new DB queries)
