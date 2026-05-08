# Sprint 119 — Stale Stripe Account Detection (Daily Cron + Owner Banner)

## Objective

Catch broken Stripe Connect accounts BEFORE a tenant tries to pay. Today, a deleted/restricted owner Stripe account only surfaces when a tenant clicks "Pay" and gets the new categorized error from Sprint 118. This sprint adds a daily cron that pings every connected account, flags ones Stripe says are dead, and shows the affected owner a banner with a one-click "Reconnect" link.

## Context

- Branch: `main`
- HEAD: post-Sprint 118 (commit `f080a42`)
- Existing infrastructure to reuse:
  - Cron pattern: `apps/web/app/api/cron/keep-alive/route.ts` (Bearer auth via `CRON_SECRET`)
  - Vercel cron config: `vercel.json` (`crons` array)
  - Stripe API helpers: `apps/web/lib/stripe.ts`
  - Existing banner pattern: `apps/web/components/dashboard/connect-banner.tsx` (referenced from `dashboard/index.tsx`)
  - Admin DB client: `createAdminClient` from `@/lib/supabase/admin`
- Tables holding Stripe account IDs:
  - `ownership_accounts.stripe_account_id` + `stripe_onboarding_complete` (added in `20260315_sprint30b_multi_account_foundation.sql`)
  - `profiles.stripe_account_id` + `stripe_onboarding_complete` (added in `20260310_sprint12_stripe_connect.sql`)

### Stripe Account Retrieve API

`GET https://api.stripe.com/v1/accounts/{ACCOUNT_ID}`

Returns 200 with account object, or 404 if account doesn't exist on the platform. Key fields on success:
- `charges_enabled` (boolean)
- `payouts_enabled` (boolean)
- `requirements.disabled_reason` (string | null)

We classify into three states:
- **active**: 200, `charges_enabled === true`, `payouts_enabled === true`
- **restricted**: 200, but either flag is false OR `disabled_reason` is set
- **missing**: 404 (account deleted or doesn't belong to platform)

## In Scope

1. Migration adding `stripe_last_verified_at` and `stripe_status` columns to `ownership_accounts` and `profiles`
2. New helper `getStripeAccountHealth(accountId)` in `apps/web/lib/stripe.ts`
3. New cron route `/api/cron/verify-stripe-accounts` that:
   - Reads all rows with `stripe_account_id IS NOT NULL` from both tables
   - Calls Stripe per account
   - Updates `stripe_status` and `stripe_last_verified_at`
   - Returns summary `{ checked, active, restricted, missing, errored }`
4. `vercel.json` adds the new cron schedule (daily at 6:00 UTC)
5. New banner component `stripe-health-banner.tsx` shown to owners when their `ownership_accounts.stripe_status ∈ {restricted, missing}`
6. Wire banner into `dashboard/index.tsx` near the existing `ConnectBanner`
7. Tests for: helper, cron handler, banner rendering

## Out of Scope

- Manager Stripe account checks (managers also have Stripe accounts; Codex MUST verify whether profiles.stripe_account_id covers managers — if so, this sprint covers them too automatically; if not, manager checks come in a later sprint)
- Auto-reconnect or auto-retry — banner just tells the user to click
- Real-time per-page checks (we only update via the cron)
- Email notifications when a check transitions an account to unhealthy (could be a follow-up)
- Modifying the existing `ConnectBanner`
- Modifying Stripe onboarding flow

## Database Migration

**Migration file:** `supabase/migrations/20260507_sprint119_stripe_account_health.sql`

```sql
-- Sprint 119: track Stripe Connect account health from a daily cron
ALTER TABLE ownership_accounts
  ADD COLUMN IF NOT EXISTS stripe_last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_status text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_status text;

-- Partial indexes — only the unhealthy rows need to be findable cheaply
CREATE INDEX IF NOT EXISTS idx_ownership_accounts_stripe_unhealthy
  ON ownership_accounts (id)
  WHERE stripe_status IN ('restricted', 'missing');

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_unhealthy
  ON profiles (id)
  WHERE stripe_status IN ('restricted', 'missing');
```

No backfill — the first cron run populates the fields. Until then, `stripe_status IS NULL` is treated as "unverified" and does NOT trigger the banner.

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `supabase/migrations/20260507_sprint119_stripe_account_health.sql` | **NEW** — adds columns + partial indexes |
| `apps/web/lib/stripe.ts` | Add `getStripeAccountHealth(accountId)` helper |
| `apps/web/app/api/cron/verify-stripe-accounts/route.ts` | **NEW** — cron handler |
| `vercel.json` | Add new cron entry: `/api/cron/verify-stripe-accounts` at `0 6 * * *` |
| `apps/web/components/dashboard/stripe-health-banner.tsx` | **NEW** — owner-facing banner |
| `apps/web/components/dashboard/index.tsx` | Render `StripeHealthBanner` for owners with unhealthy accounts |
| `apps/web/lib/__tests__/stripe-account-health.test.ts` | **NEW** — unit tests for helper |
| `apps/web/app/api/cron/__tests__/verify-stripe-accounts.test.ts` | **NEW** — cron handler tests |
| `apps/web/components/__tests__/stripe-health-banner.test.tsx` | **NEW** — banner rendering tests |

## Implementation Requirements

### 1. Stripe Helper (`lib/stripe.ts`)

Add after the existing transfer/reversal helpers:

```typescript
export type StripeAccountHealth = {
  status: "active" | "restricted" | "missing";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  disabledReason: string | null;
};

export async function getStripeAccountHealth(accountId: string): Promise<StripeAccountHealth> {
  const secretKey = getStripeSecretKey();
  const response = await fetch(
    `https://api.stripe.com/v1/accounts/${encodeURIComponent(accountId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      cache: "no-store"
    }
  );

  if (response.status === 404) {
    return {
      status: "missing",
      chargesEnabled: false,
      payoutsEnabled: false,
      disabledReason: "account_not_found"
    };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stripe account retrieve failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as {
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    requirements?: { disabled_reason?: string | null };
  };

  const chargesEnabled = Boolean(json.charges_enabled);
  const payoutsEnabled = Boolean(json.payouts_enabled);
  const disabledReason = json.requirements?.disabled_reason ?? null;

  const isHealthy = chargesEnabled && payoutsEnabled && !disabledReason;
  return {
    status: isHealthy ? "active" : "restricted",
    chargesEnabled,
    payoutsEnabled,
    disabledReason
  };
}
```

**Important:**
- Distinguish 404 (missing) from non-404 errors (throw, so cron can mark as errored and retry tomorrow)
- Don't conflate `restricted` with `missing` — they require different banner copy
- Use existing `getStripeSecretKey()` helper if present; otherwise read `process.env.STRIPE_SECRET_KEY`

### 2. Cron Route (`api/cron/verify-stripe-accounts/route.ts`)

Mirror the auth + structure of `keep-alive/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeAccountHealth } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — enough for ~150 accounts at 2s each

type Summary = {
  checked: number;
  active: number;
  restricted: number;
  missing: number;
  errored: number;
};

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const summary: Summary = { checked: 0, active: 0, restricted: 0, missing: 0, errored: 0 };

  for (const table of ["ownership_accounts", "profiles"] as const) {
    const { data: rows, error } = await admin
      .from(table)
      .select("id, stripe_account_id")
      .not("stripe_account_id", "is", null);
    if (error) {
      console.error(`[verify-stripe-accounts] failed to read ${table}:`, error);
      continue;
    }

    for (const row of rows ?? []) {
      const accountId = row.stripe_account_id as string | null;
      if (!accountId) continue;
      summary.checked += 1;

      try {
        const health = await getStripeAccountHealth(accountId);
        const { error: updateError } = await admin
          .from(table)
          .update({
            stripe_status: health.status,
            stripe_last_verified_at: new Date().toISOString()
          })
          .eq("id", row.id);
        if (updateError) {
          console.error(`[verify-stripe-accounts] update ${table}.${row.id} failed:`, updateError);
          summary.errored += 1;
          continue;
        }
        summary[health.status] += 1;
      } catch (err) {
        console.error(`[verify-stripe-accounts] check ${table}.${row.id} (${accountId}) failed:`, err);
        summary.errored += 1;
      }
    }
  }

  console.log("[verify-stripe-accounts] summary:", summary);
  return NextResponse.json({ ok: true, summary });
}
```

**Important:**
- Sequential iteration (not Promise.all) to avoid Stripe rate limits
- Each account error is caught — one bad account doesn't kill the run
- Log summary at end so the Vercel cron log is useful
- `maxDuration = 300` — adjust if account count grows; for now 150+ accounts at 2s each fits

### 3. Vercel Cron Config (`vercel.json`)

Append to the existing `crons` array:

```json
{
  "path": "/api/cron/verify-stripe-accounts",
  "schedule": "0 6 * * *"
}
```

6:00 UTC = 1 AM Central, 2 AM Eastern. Off-peak.

### 4. Banner Component (`stripe-health-banner.tsx`)

```typescript
"use client";

import Link from "next/link";

export type StripeHealthStatus = "active" | "restricted" | "missing" | null;

interface StripeHealthBannerProps {
  status: StripeHealthStatus;
}

export function StripeHealthBanner({ status }: StripeHealthBannerProps) {
  if (status !== "restricted" && status !== "missing") {
    return null;
  }

  const headline =
    status === "missing"
      ? "Your bank connection is missing"
      : "Your bank connection needs attention";

  const body =
    status === "missing"
      ? "We can't find your bank in Stripe. Reconnect now so tenants can pay rent."
      : "Stripe needs more info before they can send rent to your bank. Finish setup now.";

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
      <h3 className="font-semibold">{headline}</h3>
      <p className="mt-1 text-sm">{body}</p>
      <Link
        href="/connect/onboard"
        className="mt-3 inline-flex items-center rounded-md bg-amber-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800"
      >
        Reconnect bank
      </Link>
    </div>
  );
}
```

**Plain language check:**
- "Your bank connection is missing" ✓
- "Reconnect now so tenants can pay rent." ✓
- "Stripe needs more info before they can send rent to your bank." ✓ (no jargon)
- Button: "Reconnect bank" ✓ (verb first, action clear)

### 5. Wire Banner Into Dashboard (`dashboard/index.tsx`)

Codex MUST grep `dashboard/index.tsx` to find:
- How the existing `ConnectBanner` is wired
- Where owner-role checks happen
- How to access `ownership_accounts.stripe_status` from the dashboard data fetcher

Pattern: pass `stripeHealthStatus` as a prop into the dashboard component (like `llcBannerConnected` is today), then render `<StripeHealthBanner status={stripeHealthStatus} />` near the existing `ConnectBanner`. Show ONLY if user is owner role and status is `restricted` or `missing`.

If `ownership_accounts` is multi-account (LLC), the dashboard should show the banner if ANY of the user's ownership accounts have an unhealthy status. Aggregate: pick the worst status (missing > restricted > active > null).

### 6. Tests

#### `lib/__tests__/stripe-account-health.test.ts`

Mock `fetch`:
- 200 with `charges_enabled: true, payouts_enabled: true, requirements: { disabled_reason: null }` → `status: "active"`
- 200 with `charges_enabled: false` → `status: "restricted"`
- 200 with `requirements: { disabled_reason: "requirements.past_due" }` → `status: "restricted"`
- 404 → `status: "missing"`
- 500 → throws

#### `api/cron/__tests__/verify-stripe-accounts.test.ts`

- Returns 401 without auth header
- Returns 401 with wrong bearer token
- With valid auth and 2 accounts (one active, one missing): summary is `{ checked: 2, active: 1, missing: 1, restricted: 0, errored: 0 }`
- Updates `stripe_status` and `stripe_last_verified_at` on each row
- One throwing account doesn't break the others (errored: 1, others still processed)

#### `components/__tests__/stripe-health-banner.test.tsx`

- Renders nothing when `status === "active"` or `status === null`
- Renders "missing" headline + body when `status === "missing"`
- Renders "restricted" headline + body when `status === "restricted"`
- Reconnect button links to `/connect/onboard`

### 7. Plain Language Verification

Read every user-facing string out loud:
- "Your bank connection is missing" ✓
- "We can't find your bank in Stripe. Reconnect now so tenants can pay rent." ✓
- "Your bank connection needs attention" ✓
- "Stripe needs more info before they can send rent to your bank. Finish setup now." ✓
- "Reconnect bank" ✓

No jargon. Every message tells the owner what to do.

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] Migration `20260507_sprint119_stripe_account_health.sql` adds `stripe_last_verified_at timestamptz` and `stripe_status text` to BOTH `ownership_accounts` and `profiles`
2. [ ] Migration creates partial indexes on `stripe_status IN ('restricted', 'missing')` for both tables
3. [ ] `lib/stripe.ts` exports `getStripeAccountHealth` with `StripeAccountHealth` return type
4. [ ] Helper returns `status: "missing"` for 404 responses
5. [ ] Helper returns `status: "active"` only when `charges_enabled && payouts_enabled && !disabled_reason`
6. [ ] Helper returns `status: "restricted"` for any other 2xx response
7. [ ] Helper throws on non-404 errors (5xx, malformed)
8. [ ] Cron route `/api/cron/verify-stripe-accounts` exists with Bearer auth via `CRON_SECRET`
9. [ ] Cron iterates `ownership_accounts` AND `profiles`, updating `stripe_status` and `stripe_last_verified_at` per row
10. [ ] Cron returns summary `{ checked, active, restricted, missing, errored }`
11. [ ] Cron handles per-account errors without aborting the run
12. [ ] `vercel.json` includes the new cron at `0 6 * * *`
13. [ ] `StripeHealthBanner` component exists with `status` prop
14. [ ] Banner returns null when status is `null` or `"active"`
15. [ ] Banner renders distinct copy for `"restricted"` vs `"missing"`
16. [ ] Banner button links to `/connect/onboard`
17. [ ] `dashboard/index.tsx` renders `StripeHealthBanner` for owner role when any owned account has unhealthy status (worst-status aggregation)
18. [ ] Tests pass for helper (5 cases), cron (auth + summary + error tolerance), banner (3 render branches)
19. [ ] `gate:web` passes
20. [ ] No new npm dependencies added

## Report Format

```
gate:web: PASS | FAIL
migration_file: [name]
files_changed: [list]
acceptance_criteria: [1-20] PASS | FAIL each
notes: (any deviations, especially around dashboard wiring)
```

## Constraints

- Do NOT modify the existing `ConnectBanner` — it's for a different state (LLC bank not connected at all)
- Do NOT modify Stripe onboarding flow
- Do NOT add real-time per-page checks — cron only
- Do NOT auto-retry or auto-reconnect
- Cron MUST iterate sequentially (no Promise.all) to respect Stripe rate limits
- Cron MUST tolerate per-account errors (one bad account cannot break the run)
- Banner MUST aggregate worst-status across an owner's multiple ownership accounts (missing > restricted > active > null)
- Plain-language strings only — no jargon
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
