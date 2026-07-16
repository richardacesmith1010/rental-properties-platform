# Sprint 88 — Codebase Cleanup: Split Large Files + Remove Debug Logs

## 1. Objective

Split 4 oversized files into focused modules with barrel re-exports, remove debug console.log/console.warn statements from 3 files, and ensure zero import breakage across the entire codebase. Pure refactoring — no behavior changes.

## 2. Context

- **Branch:** main
- **HEAD:** 00446c0
- **Production URL:** https://domusbase.com
- **Supabase project ID:** vawqdqkaguhdgfhdebqw

## 3. In Scope

- Split `lib/validations.ts` (1337 lines) into domain-specific modules
- Split `components/dashboard/dashboard-data-loader.tsx` (1515 lines) into focused loaders
- Split `app/actions/maintenance.ts` (917 lines) into mutations vs queries
- Split `app/actions/account-governance.ts` (893 lines) into setup vs LLC modules
- Remove debug console.log/console.warn from 3 specific files
- Update ALL import paths via barrel re-exports so no external imports break

## 4. Out of Scope

- New features
- Bug fixes
- UI changes
- Database migrations
- Behavior changes of any kind
- Changing function signatures or return types

## 5. Exact Files Expected to Change

### Split targets (original files become barrel re-exports)

- `apps/web/lib/validations.ts` → barrel, new files:
  - `apps/web/lib/validations-auth.ts`
  - `apps/web/lib/validations-lease.ts`
  - `apps/web/lib/validations-property.ts`
  - `apps/web/lib/validations-payment.ts`
  - `apps/web/lib/validations-entity.ts`

- `apps/web/components/dashboard/dashboard-data-loader.tsx` → orchestrator, new files:
  - `apps/web/components/dashboard/dashboard-kpi-loader.ts`
  - `apps/web/components/dashboard/dashboard-section-loaders.ts`

- `apps/web/app/actions/maintenance.ts` → barrel, new files:
  - `apps/web/app/actions/maintenance-mutations.ts`
  - `apps/web/app/actions/maintenance-queries.ts`

- `apps/web/app/actions/account-governance.ts` → barrel, new files:
  - `apps/web/app/actions/account-governance-setup.ts`
  - `apps/web/app/actions/account-governance-llc.ts`

### Debug log removal

- `apps/web/app/actions/manager-payments.ts`
- `apps/web/lib/notifications.ts`
- `apps/web/lib/stripe-connect.ts`

## 6. Implementation Requirements

### Pre-Split Audit (CRITICAL)

Before splitting any file, grep the ENTIRE `apps/web/` tree for every import of that file:

```bash
grep -rn "from.*validations" apps/web/ --include="*.ts" --include="*.tsx"
grep -rn "from.*dashboard-data-loader" apps/web/ --include="*.ts" --include="*.tsx"
grep -rn "from.*maintenance" apps/web/app/ apps/web/components/ --include="*.ts" --include="*.tsx"
grep -rn "from.*account-governance" apps/web/ --include="*.ts" --include="*.tsx"
```

Record every importing file. After splitting, verify every one still resolves.

### Split Pattern

For each file being split:

1. Identify logical groupings of exports (functions, types, schemas)
2. Move each group into its new file with all necessary imports
3. Convert the original file into a barrel that re-exports everything:

```typescript
// validations.ts (barrel)
export * from './validations-auth';
export * from './validations-lease';
export * from './validations-property';
export * from './validations-payment';
export * from './validations-entity';
```

4. This ensures ALL existing `import { X } from '@/lib/validations'` statements continue to work with zero changes.

### Specific Split Guidance

**validations.ts split:**
- `validations-auth.ts`: login, signup, password reset, email validation schemas
- `validations-lease.ts`: lease creation, lease update, lease term schemas
- `validations-property.ts`: property creation, unit, address schemas
- `validations-payment.ts`: charge, payment, payout, Stripe-related schemas
- `validations-entity.ts`: LLC, entity, member, invite schemas

**dashboard-data-loader.tsx split:**
- `dashboard-kpi-loader.ts`: KPI calculation functions (revenue, occupancy, collection rate, etc.)
- `dashboard-section-loaders.ts`: Section-specific data fetching (charges, maintenance, leases, portfolio)
- Keep `dashboard-data-loader.tsx` as the orchestrator that imports from both and composes the full dashboard data object

**maintenance.ts split:**
- `maintenance-mutations.ts`: createTicket, updateTicket, assignTicket, closeTicket, etc.
- `maintenance-queries.ts`: getTickets, getTicketById, getTicketStats, etc.

**account-governance.ts split:**
- `account-governance-setup.ts`: initial setup, onboarding, Stripe Connect setup actions
- `account-governance-llc.ts`: LLC creation, member management, payout strategy, join code actions

### Debug Log Removal

Remove console.log and console.warn statements from these 3 files. Do NOT remove console.error statements (those are intentional error logging).

```bash
grep -n "console.log\|console.warn" apps/web/app/actions/manager-payments.ts apps/web/lib/notifications.ts apps/web/lib/stripe-connect.ts
```

### Post-Split Verification

After all splits, run:

```bash
grep -rn "from.*validations" apps/web/ --include="*.ts" --include="*.tsx" | head -20
# Verify all still point to valid paths
```

Then run the full gate to confirm nothing broke.

## 7. Validation Commands to Run

```bash
npm run gate:web
```

Verify test count is identical before and after:

```bash
# Before splitting, note test count from gate output
# After splitting, confirm same count passes
```

## 8. Acceptance Criteria

- [ ] `validations.ts` is a barrel re-exporting from 5 new files, each under 400 lines
- [ ] `dashboard-data-loader.tsx` orchestrates 2 new loader files, main file under 500 lines
- [ ] `maintenance.ts` is a barrel re-exporting from mutations and queries files
- [ ] `account-governance.ts` is a barrel re-exporting from setup and LLC files
- [ ] All existing imports resolve without changes (barrel re-exports cover them)
- [ ] 3 console.log/console.warn statements removed from specified files
- [ ] `npm run gate:web` passes with identical test count (lint, typecheck, build, tests)
- [ ] No behavior changes — pure structural refactoring
- [ ] No unrelated file changes

## 9. Report Format

```
validations_split: true/false
validations_barrel_works: true/false
dashboard_loader_split: true/false
maintenance_split: true/false
account_governance_split: true/false
debug_logs_removed: true/false
import_paths_verified: true/false
test_count_before: N
test_count_after: N
gate_passed: true/false
files_changed: [list]
files_created: [list]
```

## 10. Constraints

- Do NOT deploy to production
- Do NOT edit CLAUDE.md or AGENTS.md
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change database schema or run migrations
- Do NOT change any function signatures, return types, or behavior
- Do NOT remove console.error statements (only console.log and console.warn)
- Report compact status only
