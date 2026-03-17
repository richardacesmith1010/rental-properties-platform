# Sprint 39 — Codex Implementation Prompt

## 1. Objective

Add operational readiness infrastructure: deep health checks, cron run observability, an owner-facing ops status dashboard, and a Content-Security-Policy header. Target: self-monitoring family app with no external dependencies.

## 2. Context

- **Branch**: `main`
- **HEAD**: `9a3e751`
- **Gate baseline**: 503/503 unit tests, lint clean, typecheck clean, build clean, 39/39 E2E passing
- **Production URL**: `https://domusbase.com`
- **Supabase project**: `vawqdqkaguhdgfhdebqw`
- **Key existing patterns**:
  - Health endpoint at `apps/web/app/api/health/route.ts` — only checks env var presence
  - Cron at `apps/web/app/api/cron/generate-charges/route.ts` — no persistence of run results
  - Logger at `apps/web/lib/logger.ts` — `logFailedSideEffect()`, `sideEffectError()`
  - Env at `apps/web/lib/env.ts` — `getEnvStatus()` returns boolean map of 12 vars
  - Admin client at `apps/web/lib/supabase/admin.ts` — `createAdminClient()`
  - Security headers in `apps/web/next.config.mjs` — X-Frame-Options, HSTS, etc. (no CSP yet)
  - Settings page at `apps/web/app/settings/page.tsx` — 7 sections, owner/tenant accessible
  - Existing error boundaries at `app/error.tsx`, `app/global-error.tsx`, role-specific error files
  - Smoke tests at `scripts/smoke-web.sh` — curl-based endpoint checks

## 3. In Scope

### Part A: Deep Health Check
- Upgrade `/api/health` to ping Supabase DB and optionally Stripe
- Return per-service health status with latency

### Part B: Cron Observability
- New migration: `cron_runs` table to log each cron execution
- Modify cron route to persist run results
- New API endpoint to query cron run history

### Part C: Ops Status Dashboard
- New owner-only page at `/ops` showing health, cron history, env status

### Part D: Content-Security-Policy Header
- Add CSP to `next.config.mjs`

### Part E: Unit Tests
- Tests for deep health check logic
- Tests for cron run logging

## 4. Out of Scope

- External monitoring services (Sentry, Datadog, etc.)
- Distributed rate limiting
- APM / distributed tracing
- Mobile app changes
- E2E test modifications
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (5)
1. `supabase/migrations/20260315_sprint39_cron_runs.sql`
2. `apps/web/app/ops/page.tsx`
3. `apps/web/components/ops/ops-dashboard.tsx`
4. `apps/web/app/api/cron/history/route.ts`
5. `apps/web/lib/__tests__/health.test.ts`

### Modified Files (4)
1. `apps/web/app/api/health/route.ts`
2. `apps/web/app/api/cron/generate-charges/route.ts`
3. `apps/web/next.config.mjs`
4. `apps/web/lib/env.ts`

## 6. Implementation Requirements

### Part A: Deep Health Check

**Modified file**: `apps/web/app/api/health/route.ts`

Replace the current shallow check with a deep health probe:

```typescript
import { NextResponse } from "next/server";
import { getEnvStatus } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function checkSupabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("profiles").select("id").limit(1);
    return { ok: !error, latencyMs: Date.now() - start, error: error?.message };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : "Unknown" };
  }
}

async function checkStripe(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, latencyMs: 0, error: "STRIPE_SECRET_KEY not set" };
  try {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` }
    });
    return { ok: res.ok, latencyMs: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : "Unknown" };
  }
}

export async function GET() {
  const [supabase, stripe] = await Promise.all([checkSupabase(), checkStripe()]);
  const env = getEnvStatus();

  const ok = supabase.ok && stripe.ok &&
    env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY;

  return NextResponse.json({
    ok,
    services: { supabase, stripe },
    env,
    timestamp: new Date().toISOString()
  }, { status: ok ? 200 : 503 });
}
```

**Key points:**
- Use `Promise.all` for parallel checks
- Return 503 if any critical service is down
- Include latency for each service
- Don't expose secrets — only boolean/latency/error-message

### Part B.1: Cron Runs Migration

**New file**: `supabase/migrations/20260315_sprint39_cron_runs.sql`

```sql
-- Sprint 39: Cron run observability
CREATE TABLE IF NOT EXISTS cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL DEFAULT 'generate-charges',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'success', 'partial_failure', 'failure')),
  operations jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for recent lookups
CREATE INDEX IF NOT EXISTS idx_cron_runs_started_at ON cron_runs (started_at DESC);

-- RLS: only service role can insert/read (API routes use admin client)
ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;

-- Auto-cleanup: keep only last 90 days of cron runs
-- (Can be run manually or via a future cron job)
COMMENT ON TABLE cron_runs IS 'Stores cron job execution history for operational monitoring. Auto-prune rows older than 90 days.';
```

### Part B.2: Modify Cron Route to Log Runs

**Modified file**: `apps/web/app/api/cron/generate-charges/route.ts`

Wrap the existing logic to persist each run:

```typescript
import { NextResponse } from "next/server";
import {
  detectExpiredLeases,
  generateMonthlyChargesForAllOwnersWithClient,
  processAutopayCharges,
  sendDelinquencyEscalations,
  sendLeaseExpirationWarnings,
  sendRentDueReminders
} from "@/lib/charges";
import { createAdminClient } from "@/lib/supabase/admin";

function getBearerToken(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

interface OperationResult {
  name: string;
  status: "success" | "failed" | "skipped";
  result?: unknown;
  error?: string;
  durationMs: number;
}

async function runOperation(
  name: string,
  fn: () => Promise<unknown>
): Promise<OperationResult> {
  const start = Date.now();
  try {
    const result = await fn();
    return { name, status: "success", result, durationMs: Date.now() - start };
  } catch (error) {
    console.error(`${name} failed:`, error);
    return {
      name,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start
    };
  }
}

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  const token = getBearerToken(request.headers.get("authorization"))
    ?? request.headers.get("x-cron-secret");

  if (!configuredSecret || token !== configuredSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const startedAt = new Date().toISOString();

  // Insert a "running" record
  const { data: cronRun } = await adminClient
    .from("cron_runs")
    .insert({ job_name: "generate-charges", started_at: startedAt, status: "running", operations: [] })
    .select("id")
    .maybeSingle();

  const operations: OperationResult[] = [];

  // Run all operations
  operations.push(await runOperation("generate-charges", () =>
    generateMonthlyChargesForAllOwnersWithClient(adminClient)));
  operations.push(await runOperation("process-autopay", () =>
    processAutopayCharges(adminClient)));
  operations.push(await runOperation("detect-expired-leases", () =>
    detectExpiredLeases(adminClient)));
  operations.push(await runOperation("lease-expiration-warnings", () =>
    sendLeaseExpirationWarnings(adminClient)));
  operations.push(await runOperation("delinquency-escalations", () =>
    sendDelinquencyEscalations(adminClient)));
  operations.push(await runOperation("rent-due-reminders", () =>
    sendRentDueReminders(adminClient)));

  const failedCount = operations.filter(op => op.status === "failed").length;
  const status = failedCount === 0 ? "success" : failedCount === operations.length ? "failure" : "partial_failure";

  // Update the cron run record
  if (cronRun?.id) {
    await adminClient
      .from("cron_runs")
      .update({
        completed_at: new Date().toISOString(),
        status,
        operations,
        error: failedCount > 0 ? `${failedCount}/${operations.length} operations failed` : null
      })
      .eq("id", cronRun.id);
  }

  // Clean up old runs (older than 90 days)
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  await adminClient.from("cron_runs").delete().lt("started_at", cutoff);

  return NextResponse.json({
    ok: status === "success",
    status,
    operations,
    startedAt,
    completedAt: new Date().toISOString()
  });
}
```

**Key changes:**
- Each operation is wrapped in `runOperation()` which captures name, status, result, error, and duration
- A `cron_runs` record is inserted at start ("running") and updated at end with full results
- Old runs (>90 days) are pruned each execution
- Response includes structured operation results

### Part B.3: Cron History API

**New file**: `apps/web/app/api/cron/history/route.ts`

```typescript
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function getBearerToken(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

export async function GET(request: Request) {
  // Authenticate with CRON_SECRET (same as cron endpoint)
  const configuredSecret = process.env.CRON_SECRET;
  const token = getBearerToken(request.headers.get("authorization"))
    ?? request.headers.get("x-cron-secret");

  if (!configuredSecret || token !== configuredSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: runs, error } = await admin
    .from("cron_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, runs });
}
```

### Part C: Ops Dashboard

**New file**: `apps/web/app/ops/page.tsx`

Server component that checks auth (owner only) and renders the ops dashboard:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OpsDashboard } from "@/components/ops/ops-dashboard";

export default async function OpsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Check if user is an owner
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "owner") redirect("/login");

  return <OpsDashboard />;
}
```

**New file**: `apps/web/components/ops/ops-dashboard.tsx`

Client component that fetches and displays operational status:

```typescript
"use client";

import { useEffect, useState } from "react";

interface ServiceHealth {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

interface HealthData {
  ok: boolean;
  services: { supabase: ServiceHealth; stripe: ServiceHealth };
  env: Record<string, boolean>;
  timestamp: string;
}

interface CronRun {
  id: string;
  job_name: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  operations: Array<{ name: string; status: string; durationMs: number; error?: string }>;
  error: string | null;
}

export function OpsDashboard() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [cronRuns, setCronRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const healthRes = await fetch("/api/health");
        const healthData = await healthRes.json();
        setHealth(healthData);
      } catch (e) {
        setError("Failed to fetch health status");
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  // ... render health status cards, env status grid, cron run history table
  // Use the existing UI patterns: card components, badges for status, etc.
}
```

**IMPORTANT**: Read these files for UI patterns before implementing the dashboard:
- `apps/web/components/ui/card.tsx` — Card, CardHeader, CardContent, CardTitle
- `apps/web/components/ui/badge.tsx` (if exists) or check what status indicators exist
- `apps/web/app/settings/page.tsx` — layout pattern for settings-style pages
- `apps/web/components/shared/empty-state.tsx` — empty state component

The ops dashboard should include:

1. **System Health** card — green/red indicators for Supabase and Stripe, with latency
2. **Environment Status** card — grid of env var names with green check / red X for configured/missing
3. **Cron Run History** card — table of last 10 runs with status badges, timestamps, and expandable operation details
4. **Quick Actions** — "Run Health Check" button to re-fetch, link to Supabase dashboard, link to Vercel dashboard

**Note on Cron History**: The ops dashboard should fetch cron history from the server side (in `page.tsx`) using the admin client directly, NOT via the cron/history API (which requires CRON_SECRET). Pass the data as props to the client component. Update the approach:

```typescript
// In page.tsx, after auth check:
const admin = createAdminClient();
const { data: cronRuns } = await admin
  .from("cron_runs")
  .select("*")
  .order("started_at", { ascending: false })
  .limit(10);

return <OpsDashboard initialCronRuns={cronRuns ?? []} />;
```

### Part D: Content-Security-Policy Header

**Modified file**: `apps/web/next.config.mjs`

Add CSP to the `securityHeaders` array:

```javascript
{
  key: "Content-Security-Policy",
  value: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://vawqdqkaguhdgfhdebqw.supabase.co",
    "font-src 'self'",
    "connect-src 'self' https://vawqdqkaguhdgfhdebqw.supabase.co https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.stripe.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join("; ")
}
```

**IMPORTANT**: Next.js in dev mode injects inline scripts. The CSP must include `'unsafe-inline'` and `'unsafe-eval'` for scripts. In production, Next.js also uses inline scripts for hydration, so these are required. If the build or runtime breaks due to CSP, widen the policy or use `report-only` mode first.

**Fallback**: If CSP causes issues in dev or prod, switch to `Content-Security-Policy-Report-Only` instead of `Content-Security-Policy` — this logs violations without blocking them.

### Part E: Env Status Enhancement

**Modified file**: `apps/web/lib/env.ts`

Add a `getEnvSummary()` function that groups env vars by service for the ops dashboard:

```typescript
export function getEnvSummary() {
  return {
    supabase: {
      configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY),
      vars: {
        NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
      }
    },
    stripe: {
      configured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
      mode: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") ? "test" : "live",
      vars: {
        STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
        STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET)
      }
    },
    email: {
      configured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
      vars: {
        RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
        RESEND_FROM_EMAIL: Boolean(process.env.RESEND_FROM_EMAIL)
      }
    },
    plaid: {
      configured: Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
      vars: {
        PLAID_CLIENT_ID: Boolean(process.env.PLAID_CLIENT_ID),
        PLAID_SECRET: Boolean(process.env.PLAID_SECRET),
        PLAID_ENV: Boolean(process.env.PLAID_ENV)
      }
    },
    cron: {
      configured: Boolean(process.env.CRON_SECRET),
      vars: {
        CRON_SECRET: Boolean(process.env.CRON_SECRET)
      }
    }
  };
}
```

Keep the existing `getEnvStatus()` unchanged for backward compatibility.

### Part F: Unit Tests

**New file**: `apps/web/lib/__tests__/health.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";

// Test the health check logic
describe("Health check", () => {
  it("returns ok when all services are reachable", async () => {
    // Mock fetch for Stripe
    // Mock createAdminClient for Supabase
    // Assert response shape: { ok, services: { supabase, stripe }, env, timestamp }
  });

  it("returns 503 when Supabase is unreachable", async () => {
    // Mock createAdminClient to throw
    // Assert ok === false
  });

  it("returns 503 when Stripe key is missing", async () => {
    // Remove STRIPE_SECRET_KEY from env
    // Assert stripe.ok === false but still returns valid response
  });
});
```

Write 4-6 meaningful tests. Mock `createAdminClient` and `fetch` appropriately.

## 7. Validation Commands to Run

```bash
# Unit tests + lint + typecheck + build
npm run gate:web
```

**Must pass.** No E2E changes in this sprint so E2E is not required, but E2E should still pass if run.

## 8. Acceptance Criteria

1. [ ] `/api/health` returns service-level health for Supabase (DB ping) and Stripe (API check) with latency
2. [ ] `/api/health` returns 503 when critical services are down
3. [ ] `cron_runs` migration creates the table with correct schema
4. [ ] Cron route logs each execution to `cron_runs` table with per-operation results
5. [ ] Cron route auto-prunes runs older than 90 days
6. [ ] `/api/cron/history` returns last 30 runs (authenticated with CRON_SECRET)
7. [ ] `/ops` page is owner-only (redirects non-owners to /login)
8. [ ] Ops dashboard shows system health, env status grouped by service, and cron run history
9. [ ] CSP header is added to `next.config.mjs` allowing Supabase, Stripe, and Next.js hydration
10. [ ] `getEnvSummary()` groups env vars by service with per-service `configured` boolean
11. [ ] Unit tests pass for health check logic
12. [ ] `npm run gate:web` passes — all 503+ unit tests, lint, typecheck, build clean

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT apply the database migration (Claude applies after verification)
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections — report compact status only
- The ops dashboard must use existing UI components (Card, etc.) — no new UI libraries
- CSP must not break the development server or production build — if issues arise, use `Content-Security-Policy-Report-Only`
- The cron route must remain backward-compatible — same auth mechanism, same response shape (add new fields, don't remove existing)
- Health endpoint must not expose secret keys — only boolean flags and error messages
- Use `isMissingSchemaError()` pattern for Supabase queries where appropriate (cron_runs table may not exist yet)
