# Sprint 17 — Manager Analytics & Financial Visibility

## 1. Objective

Give managers access to the **Expenses** and **Analytics** dashboard sections — the same financial visibility that owners already have. Managers run properties day-to-day but currently can't see expenses, revenue trends, occupancy data, or P&L for their assigned portfolio.

## 2. Context

- Branch: `main`
- HEAD: `d57f0d1`
- Deploy URL: `https://domusbase.com`
- Stripe: sandbox mode, Connect active
- Gate: 239/239 tests, lint clean, build clean

**Key architectural insight:** The data fetchers (`getOwnerAnalyticsData`, `getOwnerExpenseData`) already use `getAdministeredPropertyIds(userId)` which returns properties the user owns **OR manages**. No new fetcher functions are needed — just wire the existing ones into the manager page.

## 3. In Scope

- Manager page fetches analytics + expenses data
- Manager page passes expense actions to dashboard
- Manager dashboard config includes expenses + analytics sections
- Manager gets expense CRUD capability (create, update, delete)
- Manager gets management fee visibility (read-only — owners set fees, managers view them)

## 4. Out of Scope

- New analytics charts or metrics beyond what owners already see
- Manager-specific analytics (vendor performance, response time trends — future sprint)
- Management fee editing by managers (owner-only control)
- Any DB migrations (no schema changes needed)
- Mobile app changes

## 5. Exact Files Expected to Change

| # | File | Action | What Changes |
|---|---|---|---|
| 1 | `apps/web/app/manager/page.tsx` | MODIFY | Add `getOwnerExpenseData` + `getOwnerAnalyticsData` fetches; import + pass `createExpense`, `updateExpense`, `deleteExpense` actions; pass `analyticsData` + `expensesData` props |
| 2 | `apps/web/components/dashboard/dashboard-config.ts` | MODIFY | Add `"expenses"` and `"analytics"` to manager `daily_ops` sections array |
| 3 | `apps/web/components/dashboard/index.tsx` | MODIFY | Ensure `hasExpensesSection` and `hasAnalyticsSection` resolve to `true` for manager role (check if role gate exists here) |

**Estimated: 3 files modified, 0 new files.**

## 6. Implementation Requirements

### Part A: Manager Page Data Fetching (`app/manager/page.tsx`)

1. Import `getOwnerExpenseData` from `@/lib/expenses`
2. Import `getOwnerAnalyticsData` from `@/lib/analytics`
3. Import `createExpense`, `updateExpense`, `deleteExpense` from `@/app/actions`
4. Add both fetchers to the existing `Promise.all()` block (add them at the end to avoid reindexing destructured variables)
5. Pass to `<Dashboard>`:
   - `expensesData={expenses}`
   - `analyticsData={analytics}`
   - `onCreateExpense={createExpense}`
   - `onUpdateExpense={updateExpense}`
   - `onDeleteExpense={deleteExpense}`
6. Do NOT pass `onUpdateManagementFee` — managers can view fees but not change them (owner-only control)

### Part B: Dashboard Config (`dashboard-config.ts`)

1. Add `"expenses"` and `"analytics"` to the `daily_ops` manager workflow mode's `sections` array
2. Place them after `"payments"` and before the end, matching the owner's ordering:
   ```
   "automations", "expenses", "analytics", "payments"
   ```
   Or more precisely, match the owner `daily_ops` order for these two sections.

### Part C: Dashboard Index Role Gate Check (`index.tsx`)

1. Check how `hasExpensesSection` and `hasAnalyticsSection` are determined
2. If they are gated by `role === "owner"` or similar, expand the check to include `role === "manager"`
3. If they are determined purely by whether data/sections exist in the config, no change needed here — Parts A and B will be sufficient

### Pattern Matching

Follow the exact pattern used by the owner page. The owner page does:

```typescript
// In Promise.all:
getOwnerExpenseData(user.id),
getOwnerAnalyticsData(user.id),

// In Dashboard props:
expensesData={expenses}
analyticsData={analytics}
onCreateExpense={createExpense}
onUpdateExpense={updateExpense}
onDeleteExpense={deleteExpense}
onUpdateManagementFee={updateManagementFee}  // ← DO NOT add this for manager
```

## 7. Validation Commands to Run

```bash
npm run gate:web
```

This runs: tests (expect 239+), lint, typecheck, and production build.

If `APP_URL` is set:
```bash
APP_URL=https://domusbase.com npm run smoke:web
```

## 8. Acceptance Criteria

| # | Criterion | Pass/Fail |
|---|---|---|
| 1 | `app/manager/page.tsx` fetches `getOwnerExpenseData` and `getOwnerAnalyticsData` in `Promise.all` | |
| 2 | `app/manager/page.tsx` passes `expensesData`, `analyticsData`, `onCreateExpense`, `onUpdateExpense`, `onDeleteExpense` to Dashboard | |
| 3 | `app/manager/page.tsx` does NOT pass `onUpdateManagementFee` | |
| 4 | `dashboard-config.ts` manager `daily_ops` sections include `"expenses"` and `"analytics"` | |
| 5 | No role-based gate in `index.tsx` or `section-renderer.tsx` blocks manager from seeing expenses/analytics | |
| 6 | `npm run gate:web` passes (239+ tests, lint clean, build clean) | |
| 7 | No new files created (modification only) | |
| 8 | No DB migrations needed or created | |

## 9. Report Format

```
gate_passed: true/false
test_count: N
lint_clean: true/false
build_clean: true/false
files_changed: [list]
acceptance_criteria: [1: pass/fail, 2: pass/fail, ...]
```

## 10. Constraints

- Do NOT apply any DB migrations
- Do NOT deploy
- Do NOT create new files — this is a wiring-only sprint
- Do NOT pass `onUpdateManagementFee` to the manager dashboard
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections in your report
- Report compact status only
- Every Supabase `.update()`, `.insert()`, `.delete()` call must have its error result checked (L-002)
