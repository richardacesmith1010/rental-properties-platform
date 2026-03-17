# Sprint 23 — "Codebase Excellence" Efficiency, DRY, & Industry Standards

## Objective

Eliminate every measurable inefficiency in the Domus codebase. Extract duplicated functions, batch N+1 queries, split god files, add strict linting, and enforce industry-standard patterns. When done, no function should be duplicated across files, no database query should run inside a loop, and every server action should use a shared auth helper.

## Context

- **Branch:** `main`
- **HEAD:** `c415bdc`
- **Gate:** 390 tests (18 suites), lint clean, build clean
- **Key problems identified:**
  - `isMissingSchemaError` copy-pasted in 16 files
  - N+1 queries in `processAutopayCharges` (~250 DB roundtrips)
  - N+1 notification delivery in `charges.ts` (sequential awaits in loops)
  - Auth boilerplate (6 lines) repeated in 20+ server actions
  - `charges.ts` is 1,280 lines doing 8 different jobs
  - `documents.ts` actions: 816 lines, `leases.ts` actions: 763 lines
  - Two duplicate `EmptyState` components
  - `@domus/shared` package has zero consumers
  - 320+ lines of `!important` dark mode CSS overrides
  - No `.eslintrc.json` with strict rules
  - No `.prettierrc`
  - Silent `return` on validation failure in several actions
  - Rate limiting in only 3/20 action files
  - `ensureCapabilityEnabled` uses 8 repetitive if/else blocks
  - Duplicate `getPropertyIdsForUserWithClient` function
  - Duplicate `uploadExpenseReceiptFile` in two action files

## In Scope

1. Extract shared utilities (DRY pass)
2. Split god files (charges.ts, documents.ts actions, leases.ts actions)
3. Fix N+1 query patterns (batch queries)
4. Add code quality tooling (ESLint strict, Prettier)
5. Security hardening (rate limiting, error returns)
6. CSS cleanup (dark mode overrides)
7. Dead code and package cleanup
8. Settings page redesign — sidebar navigation layout

## Out of Scope

- No new features, pages, or UI components
- No database migrations
- No Stripe changes
- No Dashboard architecture refactor (Server Component split — future sprint)
- No caching layer (`unstable_cache` / `revalidateTag` — future sprint)
- No changes to visual design or animations

## Exact Files Expected to Change

### New files (create):
1. `apps/web/lib/supabase-errors.ts` — shared `isMissingSchemaError`
2. `apps/web/app/actions/auth-helpers.ts` — shared `requireAuth`, `requireRole`
3. `apps/web/lib/charge-generation.ts` — extracted from charges.ts
4. `apps/web/lib/lease-lifecycle.ts` — extracted from charges.ts
5. `apps/web/lib/delinquency.ts` — extracted from charges.ts
6. `apps/web/lib/autopay.ts` — extracted from charges.ts
7. `apps/web/app/actions/document-templates.ts` — extracted from documents.ts
8. `apps/web/app/actions/document-packets.ts` — extracted from documents.ts
9. `apps/web/app/actions/lease-mutations.ts` — extracted from leases.ts
10. `apps/web/app/actions/lease-lifecycle-actions.ts` — extracted from leases.ts
11. `.eslintrc.json` (project root or apps/web/)
12. `.prettierrc` (project root)
13. `apps/web/components/settings/settings-layout.tsx` — sidebar navigation wrapper

### Modified files:
13-28. All 16 files with local `isMissingSchemaError` → replace with import from `supabase-errors.ts`
29-48. All 20 server action files → use `requireAuth`/`requireRole` helper, add `checkRateLimit`, fix silent returns
49. `apps/web/lib/charges.ts` → slim orchestrator importing from split files
50. `apps/web/app/actions/documents.ts` → slim re-exports from split files
51. `apps/web/app/actions/leases.ts` → slim re-exports from split files
52. `apps/web/app/actions/shared.ts` → refactor `ensureCapabilityEnabled` to lookup table, remove async from `isMissingSchemaError`
53. `apps/web/app/actions/expenses.ts` → delete duplicate `uploadExpenseReceiptFile`, import from shared location
54. `apps/web/app/actions/vendors.ts` → delete duplicate `uploadExpenseReceiptFile`, import from shared location
55. `apps/web/components/shared/empty-state.tsx` → upgrade to superset API (icon, title, description, actionLabel, onAction)
56. `apps/web/components/dashboard/empty-state.tsx` → DELETE (merge into shared)
57. `apps/web/app/globals.css` → remove `!important` dark mode overrides, use CSS variables
58. `apps/web/next.config.mjs` → remove `transpilePackages: ["@domus/shared"]` if package deleted
59. `packages/shared/` → DELETE or wire up (see Part G)
60. `scripts/gate-web.sh` → add `tsc --noEmit` for web app
61. `apps/web/app/actions/index.ts` → update barrel exports for new split files
62. `scripts/smoke-web.sh` → fix protected route check to handle 200+client-redirect

## Implementation Requirements

### Part A: Extract Shared Utilities (~2hr)

#### A1. `isMissingSchemaError` — extract to shared utility

Create `apps/web/lib/supabase-errors.ts`:

```typescript
/**
 * Detect Supabase errors for missing tables/columns/schema cache.
 * Used throughout the app for graceful degradation when migrations
 * haven't been applied yet.
 */
export function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  return (
    err.code === "42P01" ||   // undefined_table
    err.code === "42703" ||   // undefined_column
    err.code === "PGRST205" || // schema cache miss
    (typeof err.message === "string" &&
      (err.message.includes("relation") && err.message.includes("does not exist")) ||
      (err.message?.includes("column") && err.message?.includes("does not exist")))
  );
}
```

Then in ALL 16 files that define their own copy, REPLACE the local function with:
```typescript
import { isMissingSchemaError } from "@/lib/supabase-errors";
```

Delete the local `isMissingSchemaError` function from each file. The 16 files are:
- `lib/analytics.ts`, `lib/applications.ts`, `lib/automations.ts`, `lib/documents.ts`
- `lib/expenses.ts`, `lib/gamification.ts`, `lib/inbox.ts`, `lib/invitations.ts`
- `lib/leasing.ts`, `lib/maintenance.ts`, `lib/notification-preferences.ts`
- `lib/ownership.ts`, `lib/portfolio.ts`, `lib/property-access.ts`
- `lib/rent-increases.ts`, `lib/reports.ts`, `lib/vendors.ts`

Also fix `app/actions/shared.ts` — its `isMissingSchemaError` is unnecessarily `async`. Replace with import from the shared utility.

#### A2. Auth helper — extract shared `requireAuth`

Create `apps/web/app/actions/auth-helpers.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth";
import type { SupabaseClient } from "@supabase/supabase-js";

type UserRole = "owner" | "manager" | "tenant";

interface AuthResult {
  user: { id: string; email?: string };
  role: UserRole;
  supabase: SupabaseClient;
}

/**
 * Authenticate the current user and verify their role.
 * Redirects to /login if not authenticated, / if wrong role.
 */
export async function requireAuth(...allowedRoles: UserRole[]): Promise<AuthResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = await getCurrentUserRole(user.id);
  if (allowedRoles.length > 0 && !allowedRoles.includes(role as UserRole)) {
    redirect("/");
  }

  return { user, role: role as UserRole, supabase };
}
```

Then in EVERY server action file, replace the repeated 6-line auth boilerplate:
```typescript
// BEFORE (in every action):
const supabase = createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");
const role = await getCurrentUserRole(user.id);
if (role !== "owner" && role !== "manager") redirect("/");

// AFTER:
const { user, role, supabase } = await requireAuth("owner", "manager");
```

Apply to ALL action files: `charges.ts`, `connect.ts`, `documents.ts` (and splits), `expenses.ts`, `inbox.ts`, `invitations.ts`, `leases.ts` (and splits), `maintenance.ts`, `properties.ts`, `units.ts`, `vendors.ts`.

For tenant-only actions, use `requireAuth("tenant")`. For any-role actions, use `requireAuth("owner", "manager", "tenant")`.

#### A3. Merge `EmptyState` components

Upgrade `apps/web/components/shared/empty-state.tsx` to accept the superset of both component APIs:

```typescript
interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}
```

DELETE `apps/web/components/dashboard/empty-state.tsx`. Update all imports that used the dashboard version to import from `shared/empty-state`.

#### A4. Delete duplicate functions

1. **`getPropertyIdsForUserWithClient`** in `lib/charges.ts` — delete it. Refactor callers to use `getAdministeredPropertyIds` from `lib/property-access.ts` (add an optional `supabase` client parameter to that function if needed).

2. **`uploadExpenseReceiptFile`** — exists identically in both `app/actions/expenses.ts` and `app/actions/vendors.ts`. Extract to `lib/storage.ts` or `lib/uploads.ts` as a shared function. Import from both action files.

#### A5. Refactor `ensureCapabilityEnabled`

In `app/actions/shared.ts`, replace the 8 if/else blocks with a lookup table:

```typescript
const capabilityWarningMap: Record<string, keyof FeatureWarnings> = {
  documentsEnabled: "documents",
  notificationsEnabled: "notifications",
  expensesEnabled: "expenses",
  vendorsEnabled: "vendors",
  analyticsEnabled: "analytics",
  automationsEnabled: "automations",
  inboxEnabled: "inbox",
  leasingPipelineEnabled: "leasingPipeline",
};

export async function ensureCapabilityEnabled(capability: string): Promise<ActionState | null> {
  const capabilities = await getFeatureCapabilities();
  if (capabilities[capability as keyof typeof capabilities]) return null;

  const warningKey = capabilityWarningMap[capability];
  const message = warningKey
    ? capabilities.warnings[warningKey] ?? `${warningKey} is not available yet.`
    : "This feature is not available yet.";

  return { success: false, error: message };
}
```

---

### Part B: Split God Files (~2hr)

#### B1. Split `lib/charges.ts` (1,280 lines → 4 files)

| Lines (approx) | New File | Contents |
|---|---|---|
| 1-507 | `lib/charge-generation.ts` | `generateMonthlyChargesForPropertyIds`, `applyLateFeesToOverdueCharges`, helper functions |
| 509-554 | DELETE (use `property-access.ts`) | `getPropertyIdsForUserWithClient` (duplicate) |
| 568-832 | `lib/lease-lifecycle.ts` | `detectExpiredLeases`, `sendLeaseExpirationWarnings` |
| 834-1106 | `lib/delinquency.ts` | `sendDelinquencyEscalations`, `sendRentDueReminders` |
| 1118-1280 | `lib/autopay.ts` | `processAutopayCharges`, `generateMonthlyChargesForAllOwnersWithClient` |

Keep `lib/charges.ts` as a slim orchestrator that re-exports from the split files:
```typescript
export { generateMonthlyChargesForPropertyIds, applyLateFeesToOverdueCharges } from "./charge-generation";
export { detectExpiredLeases, sendLeaseExpirationWarnings } from "./lease-lifecycle";
export { sendDelinquencyEscalations, sendRentDueReminders } from "./delinquency";
export { processAutopayCharges, generateMonthlyChargesForAllOwnersWithClient } from "./autopay";
```

This way, existing imports from `lib/charges` continue to work without changes.

#### B2. Split `app/actions/documents.ts` (816 lines → 2 files)

Split into:
- `app/actions/document-templates.ts` — template CRUD actions
- `app/actions/document-packets.ts` — packet creation, signing, delivery actions

Keep `app/actions/documents.ts` as a slim re-export file. Update `app/actions/index.ts` barrel if needed.

#### B3. Split `app/actions/leases.ts` (763 lines → 2 files)

Split into:
- `app/actions/lease-mutations.ts` — create/update/delete lease actions
- `app/actions/lease-lifecycle-actions.ts` — renew, terminate, rent increase actions

Keep `app/actions/leases.ts` as a slim re-export file. Update barrel.

**For all splits:** Every split file must be ≤ 400 lines. Verify all imports resolve after splitting.

---

### Part C: N+1 Query Fixes (~1.5hr)

#### C1. Batch queries in `processAutopayCharges`

In the new `lib/autopay.ts` file, refactor `processAutopayCharges`:

BEFORE (N+1 — queries inside loop):
```typescript
for (const enrollment of enrollmentRows) {
  const { data: charges } = await supabase.from("rent_charges")...
  const { data: profile } = await supabase.from("profiles")...
  const { data: lease } = await supabase.from("leases")...
  const { data: unit } = await supabase.from("units")...
}
```

AFTER (batch — query once, lookup by map):
```typescript
// 1. Collect all IDs upfront
const leaseIds = enrollmentRows.map(e => e.lease_id);
const userIds = enrollmentRows.map(e => e.user_id);

// 2. Batch fetch all related data
const [chargesResult, profilesResult, leasesResult] = await Promise.all([
  supabase.from("rent_charges").select("*").in("lease_id", leaseIds).eq("status", "unpaid"),
  supabase.from("profiles").select("id, full_name, email").in("id", userIds),
  supabase.from("leases").select("*, units(*, properties(*))").in("id", leaseIds),
]);

// 3. Build lookup maps
const chargesByLease = new Map<string, typeof chargesResult.data>();
// ... group charges by lease_id

const profileMap = new Map(profilesResult.data?.map(p => [p.id, p]) ?? []);
const leaseMap = new Map(leasesResult.data?.map(l => [l.id, l]) ?? []);

// 4. Iterate WITHOUT queries
for (const enrollment of enrollmentRows) {
  const charges = chargesByLease.get(enrollment.lease_id) ?? [];
  const profile = profileMap.get(enrollment.user_id);
  const lease = leaseMap.get(enrollment.lease_id);
  // ... process without any DB calls
}
```

This reduces ~250 queries to ~3 queries.

#### C2. Batch notification delivery

In charge-generation, lease-lifecycle, and delinquency files, replace sequential notification sends:

BEFORE:
```typescript
for (const charge of lateCharges) {
  await createNotificationWithDelivery({...});
}
```

AFTER:
```typescript
const notifications = lateCharges.map(charge => ({
  // notification payload
}));
await Promise.all(notifications.map(n => createNotificationWithDelivery(n)));
```

For large batches (>20 items), use a concurrency limiter:
```typescript
async function batchProcess<T>(items: T[], fn: (item: T) => Promise<void>, concurrency = 10) {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.all(items.slice(i, i + concurrency).map(fn));
  }
}
```

#### C3. Parallelize `generateMonthlyChargesForAllOwnersWithClient`

In `lib/autopay.ts`, replace the sequential user processing:

BEFORE:
```typescript
for (const userId of userIds) {
  await getPropertyIdsForUserWithClient(supabase, userId);
  await generateMonthlyChargesForPropertyIdsWithClient(supabase, ...);
}
```

AFTER:
```typescript
// Deduplicate: get all unique property IDs across all users first
const allPropertyIds = new Set<string>();
const propertyIdResults = await Promise.all(
  userIds.map(id => getAdministeredPropertyIds(id))
);
propertyIdResults.flat().forEach(id => allPropertyIds.add(id));

// Process all unique properties in parallel batches
await batchProcess(
  Array.from(allPropertyIds),
  (propId) => generateMonthlyChargesForPropertyIdsWithClient(supabase, [propId], ...),
  5  // 5 concurrent property generations
);
```

---

### Part D: Code Quality Tooling (~1hr)

#### D1. Create `.eslintrc.json`

Create at project root:
```json
{
  "extends": [
    "next/core-web-vitals",
    "next/typescript"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", {
      "argsIgnorePattern": "^_",
      "varsIgnorePattern": "^_"
    }]
  }
}
```

#### D2. Create `.prettierrc`

Create at project root:
```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100
}
```

#### D3. Fix all lint errors

After adding the stricter ESLint rules, run `npm run lint:web` and fix every error. Common fixes:
- Replace `any` with proper types
- Remove unused variables (prefix with `_` if intentionally unused)
- Fix any `core-web-vitals` violations

#### D4. Add web typecheck to gate script

In `scripts/gate-web.sh`, add BEFORE the build step:
```bash
echo "[gate] Running web typecheck"
npx tsc -p apps/web/tsconfig.json --noEmit
```

---

### Part E: Security Hardening (~1.5hr)

#### E1. Expand rate limiting to all action files

Import `checkRateLimit` from `lib/rate-limit.ts` in every server action file. Add rate limit check after auth but before any mutation:

```typescript
export async function myAction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");

  const rateLimited = checkRateLimit(user.id, "myAction", { maxRequests: 20, windowMs: 60_000 });
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  // ... rest of action
}
```

Apply to ALL 20 action files. Currently only `charges.ts`, `invitations.ts`, and one other file have rate limiting.

#### E2. Fix silent returns on validation failure

Search all action files for patterns where validation failure causes a bare `return` or `return undefined`:

```typescript
// WRONG:
if (!parsed.success) return;
if (!charge) return;

// RIGHT:
if (!parsed.success) return { success: false, error: "Invalid input." };
if (!charge) return { success: false, error: "Charge not found." };
```

Specifically fix `createCheckoutForCharge` in `charges.ts` which has 5 silent failure scenarios (lines ~31, 48, 58, 68, 77, 89). Every early return must include an error message.

---

### Part F: CSS Cleanup (~1hr)

#### F1. Replace `!important` dark mode overrides

In `apps/web/app/globals.css`, there are ~320 lines of rules like:
```css
html[data-domus-theme="noctis-neon"] .bg-white {
    background-color: var(--domus-card-bg) !important;
}
```

These exist because components use raw Tailwind classes (`bg-white`, `text-gray-900`) instead of CSS variables.

**Strategy:** For each overridden class, find the components that use it and replace with the CSS variable equivalent:
- `bg-white` → use `.domus-card` class or `bg-[var(--domus-card-bg)]`
- `text-gray-900` → `text-[var(--domus-heading-text)]` or `.domus-heading`
- `border-gray-200` → `border-[var(--domus-card-border)]`
- `bg-gray-50` → `bg-[var(--domus-table-row-hover)]` or similar

After replacing in components, DELETE the corresponding `!important` override lines from globals.css.

**Target:** Reduce `!important` count from ~40+ to ≤10. Some may remain for third-party component overrides — that's acceptable.

---

### Part G: Dead Code & Package Cleanup (~1hr)

#### G1. Resolve `@domus/shared`

**Option A (preferred): Delete the package.**
- Delete `packages/shared/` directory
- Remove `"@domus/shared"` from root `package.json` workspaces
- Remove `transpilePackages: ["@domus/shared"]` from `apps/web/next.config.mjs`
- Run `npm install` to update lockfile

The types in `@domus/shared` (`UserRole`, `Property`, `Unit`, etc.) are never imported. The app defines its own types inline or infers them from Supabase queries. The package adds build overhead with zero value.

#### G2. Delete dead exports

- `validateEnv()` in `lib/env.ts` — exported but never called. Either wire it into app startup (call it in `instrumentation.ts` or layout) OR delete it.
- `updateLateFeeSchema` in `lib/validations.ts` — exported but only used in tests, superseded by `updateLeaseSchema`. Delete and update the test.
- `resetRateLimitState` in `lib/rate-limit.ts` — only used in tests. Mark with a comment `/** @internal test-only */` or move to test utils.

#### G3. Verify Recharts code splitting

Confirm that chart components (`rent-collection-chart.tsx`, `expense-breakdown-chart.tsx`, `occupancy-chart.tsx`, `maintenance-chart.tsx`) are ONLY reachable via the dynamically loaded `AnalyticsSection` in `section-renderer.tsx`. If any chart is imported by a non-dynamic component, wrap it with `next/dynamic`.

---

### Part H-pre: Smoke Test Fix (~10min)

The production smoke test (`scripts/smoke-web.sh`) expects HTTP 307 redirects for unauthenticated `/owner`, `/manager`, etc. But the middleware only refreshes auth tokens — route protection uses `redirect()` in server components, which returns HTTP 200 with client-side redirect data (Next.js App Router behavior).

**Fix:** Update `scripts/smoke-web.sh` to accept 200 responses that contain a redirect meta tag, not just 307/302:

```bash
# In the "Checking protected route guards" loop, replace the status-only check:
for path in /owner /manager /tenant /owner/generate /settings /complete-profile; do
  BODY="$(mktemp)"
  HEADERS="$(mktemp)"
  STATUS="$(curl -s -D "$HEADERS" -o "$BODY" -w "%{http_code}" "$APP_URL$path")"
  if [[ "$STATUS" == "307" || "$STATUS" == "302" ]]; then
    # Traditional server-side redirect — check Location header
    LOCATION="$(grep -i '^location:' "$HEADERS" | head -n1 | tr -d '\r' | awk '{print $2}')"
    if [[ "$LOCATION" != *"/login"* ]]; then
      echo "[smoke] Expected redirect location to include /login for $path, got: ${LOCATION:-<none>}"
      rm -f "$HEADERS" "$BODY"
      exit 1
    fi
  elif [[ "$STATUS" == "200" ]]; then
    # Next.js App Router client-side redirect — check for redirect meta tag
    if ! grep -q 'url=/login' "$BODY" && ! grep -q 'NEXT_REDIRECT' "$BODY"; then
      echo "[smoke] $path returned 200 but no redirect to /login found in response"
      rm -f "$HEADERS" "$BODY"
      exit 1
    fi
  else
    echo "[smoke] Expected redirect for unauthenticated $path, got $STATUS"
    rm -f "$HEADERS" "$BODY"
    exit 1
  fi
  rm -f "$HEADERS" "$BODY"
done
```

### Part H: Settings Page Redesign — Sidebar Navigation (~1.5hr)

Redesign the settings page from a vertical stack of cards to a **sidebar navigation layout** inspired by Claude's settings interface.

#### Current state:
- `apps/web/app/settings/page.tsx` renders all 6 sections vertically in a single column
- No sub-navigation within settings
- All sections visible simultaneously

#### Target layout:

```
┌──────────────────────────────────────────────────────┐
│  Settings                                  [← Back]  │
├────────────┬─────────────────────────────────────────┤
│            │                                         │
│  ● Profile │   [Selected section content renders     │
│  ○ Payment │    here — only one section visible      │
│  ○ Bank    │    at a time]                           │
│  ○ Notifs  │                                         │
│  ○ Theme   │                                         │
│  ○ Security│                                         │
│            │                                         │
├────────────┴─────────────────────────────────────────┤
```

#### Implementation:

1. **Create `apps/web/components/settings/settings-layout.tsx`** — a client component with:
   - Left sidebar (w-56, fixed height, subtle background)
   - Nav items with icons, labels, and active state highlighting
   - Active item has a subtle background highlight (like `bg-violet-50` or `bg-white/10` in dark mode) with a left border accent (`border-l-2 border-violet-500`)
   - Content area fills remaining width

2. **Settings nav items** (with Lucide icons):
   ```typescript
   const settingsNav = [
     { id: "profile", label: "Profile", icon: User },
     { id: "payment", label: "Payment Methods", icon: CreditCard, roles: ["tenant"] },
     { id: "bank", label: "Bank Account", icon: Building2, roles: ["owner", "manager"] },
     { id: "notifications", label: "Notifications", icon: Bell },
     { id: "appearance", label: "Appearance", icon: Palette },
     { id: "security", label: "Security", icon: Shield },
   ];
   ```
   - Only show items matching the user's role
   - Default selection: "profile"

3. **Section switching:**
   - Use React state to track active section (`useState<string>("profile")`)
   - Render only the active section's component in the content area
   - Use the `AnimatedTabs` underline pattern or a simple left-border indicator for active state
   - Content transitions with fade-in when switching sections

4. **Mobile layout:**
   - On screens < `md` breakpoint, collapse the sidebar into a horizontal scrollable tab bar at the top
   - Or use a select dropdown to pick the section
   - Content renders below the tab bar/dropdown

5. **Update `apps/web/app/settings/page.tsx`:**
   - Wrap everything in `<SettingsLayout>`
   - Pass the section components as a map/object
   - Remove the old vertical card stack

6. **Styling:**
   - Sidebar background: `bg-zinc-50` (light) / `bg-zinc-900/50` (dark) — use CSS variables
   - Active item: `bg-violet-50 text-violet-700 border-l-2 border-violet-500` (light) / `bg-violet-500/10 text-violet-300` (dark)
   - Inactive item: `text-zinc-600 hover:bg-zinc-100` (light) / `text-zinc-400 hover:bg-white/5` (dark)
   - Content area: existing white card style
   - Smooth transitions on section switch (use the page template fade or a simpler opacity transition)

---

## Validation Commands

After all changes, run:

```bash
# 1. Verify no duplicate isMissingSchemaError
grep -rn "function isMissingSchemaError" apps/web/lib/ apps/web/app/ | wc -l
# Expected: 1 (only in supabase-errors.ts)

# 2. Verify auth helper exists and is used
grep -rl "requireAuth" apps/web/app/actions/ | wc -l
# Expected: ≥15

# 3. Verify no N+1 queries (no await supabase inside for loops)
grep -B2 "await supabase" apps/web/lib/autopay.ts | grep -c "for\|forEach"
# Expected: 0

# 4. Verify charges.ts is slim
wc -l apps/web/lib/charges.ts
# Expected: ≤100 (re-export orchestrator)

# 5. Verify split file sizes
wc -l apps/web/lib/charge-generation.ts apps/web/lib/lease-lifecycle.ts apps/web/lib/delinquency.ts apps/web/lib/autopay.ts
# Expected: each ≤400

# 6. Verify action file sizes
wc -l apps/web/app/actions/documents.ts apps/web/app/actions/leases.ts
# Expected: each ≤100 (re-export files)

# 7. Verify EmptyState consolidation
ls apps/web/components/dashboard/empty-state.tsx 2>/dev/null
# Expected: file not found (deleted)

# 8. Verify !important count in CSS
grep -c "!important" apps/web/app/globals.css
# Expected: ≤10

# 9. Verify ESLint config exists
ls .eslintrc.json
# Expected: file exists

# 10. Verify rate limiting coverage
grep -rl "checkRateLimit" apps/web/app/actions/ | wc -l
# Expected: ≥15

# 11. Verify no silent returns on validation failure
grep -n "return;" apps/web/app/actions/charges.ts
# Expected: 0 bare returns

# 12. Verify smoke test handles client-side redirects
APP_URL=https://domusbase.com bash scripts/smoke-web.sh
# Expected: "Smoke checks passed"

# 13. Full gate
npm run gate:web
```

---

## Acceptance Criteria (Binary Pass/Fail)

1. `isMissingSchemaError` exists in exactly 1 file (`supabase-errors.ts`) — PASS/FAIL
2. All 16 lib files import from `supabase-errors.ts` instead of local copy — PASS/FAIL
3. `requireAuth` helper exists in `auth-helpers.ts` — PASS/FAIL
4. ≥15 action files use `requireAuth` instead of copy-pasted boilerplate — PASS/FAIL
5. `charges.ts` is ≤100 lines (re-export orchestrator) — PASS/FAIL
6. 4 split files exist: `charge-generation.ts`, `lease-lifecycle.ts`, `delinquency.ts`, `autopay.ts` — PASS/FAIL
7. Each split file is ≤400 lines — PASS/FAIL
8. `documents.ts` actions split into 2 files, each ≤400 lines — PASS/FAIL
9. `leases.ts` actions split into 2 files, each ≤400 lines — PASS/FAIL
10. No `await supabase` calls inside `for`/`forEach` loops in autopay/charges files — PASS/FAIL
11. Notification delivery uses `Promise.all` or batch processing — PASS/FAIL
12. Only one `EmptyState` component exists (in `shared/`) — PASS/FAIL
13. `@domus/shared` package deleted OR actively used by ≥2 workspaces — PASS/FAIL
14. `.eslintrc.json` exists with `no-explicit-any: error` — PASS/FAIL
15. `.prettierrc` exists — PASS/FAIL
16. Lint passes with new strict rules — PASS/FAIL
17. ≥15 action files have `checkRateLimit` calls — PASS/FAIL
18. Zero bare `return;` in action files on validation/auth failure — PASS/FAIL
19. `createCheckoutForCharge` returns error messages for all 5 failure paths — PASS/FAIL
20. `!important` count in globals.css ≤ 10 — PASS/FAIL
21. `ensureCapabilityEnabled` uses lookup table (no if/else chain) — PASS/FAIL
22. Duplicate `uploadExpenseReceiptFile` consolidated to one location — PASS/FAIL
23. `tsc --noEmit` for web app added to gate script — PASS/FAIL
24. All existing tests pass (`npm run gate:web`) — PASS/FAIL
25. Build clean — PASS/FAIL
26. Settings page has sidebar navigation layout (not vertical card stack) — PASS/FAIL
27. Settings sidebar shows role-appropriate nav items with icons — PASS/FAIL
28. Only one settings section visible at a time (not all stacked) — PASS/FAIL
29. Settings has mobile-responsive layout (tabs/dropdown on small screens) — PASS/FAIL
30. Active settings nav item has visual indicator (highlight + border accent) — PASS/FAIL
31. Smoke test (`scripts/smoke-web.sh`) handles both 307 redirects and 200+client-redirect for protected routes — PASS/FAIL

---

## Report Format

When complete, report:

```
Sprint 23 Status:
- commit_hash: <hash>
- files_changed: <number>
- lines_added: <number>
- lines_removed: <number>
- tests_passed: <number>/<total>
- test_suites: <number>
- lint: PASS | FAIL
- build: PASS | FAIL
- typecheck: PASS | FAIL
- isMissingSchemaError_copies: <count> (target: 1)
- requireAuth_usage_count: <count> (target: ≥15)
- charges_ts_lines: <count> (target: ≤100)
- max_split_file_lines: <count> (target: ≤400)
- n_plus_one_patterns: <count> (target: 0)
- important_count_css: <count> (target: ≤10)
- rate_limit_coverage: <count>/20 action files
- silent_returns: <count> (target: 0)
- empty_state_components: <count> (target: 1)
- settings_sidebar_layout: YES | NO
- smoke_test_fixed: YES | NO
- acceptance_criteria: <passed>/<total>
```

---

## Constraints

- Do NOT add new features, pages, or UI components
- Do NOT change database schema or Supabase configuration
- Do NOT modify visual design or animations
- Do NOT refactor Dashboard to Server Components (future sprint)
- Do NOT add caching layer (future sprint)
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Report compact status only per the format above
- ALL changes must be on the `main` branch
- Commit with message: `refactor: sprint 23 codebase excellence`
- Read `AGENTS.md` before starting — new efficiency standards have been added to §3
