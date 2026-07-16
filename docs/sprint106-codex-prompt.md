# Sprint 106 — Supabase Keep-Alive Cron

## Objective

Add a daily keep-alive cron that hits Supabase to prevent free-tier auto-pause. Ensures domusbase.com doesn't go down due to project inactivity.

## Context

- Branch: `main`
- HEAD: `eef09fb` (Sprint 105)
- On 2026-04-13, the Supabase project auto-paused due to inactivity, causing `MIDDLEWARE_INVOCATION_TIMEOUT` 504 errors site-wide
- Project is on the free tier — pauses after ~7 days without database activity
- Existing cron (`/api/cron/generate-charges`) runs daily at 8 AM UTC and DOES query Supabase, but this incident proves it's not enough on its own (possibly cron failed silently, possibly Supabase requires more frequent activity)
- Vercel Hobby plan allows up to 2 cron jobs — adding a second one is within limits

## In Scope

1. New endpoint `/api/cron/keep-alive` — performs a minimal Supabase query, logs success/failure
2. Add it to `vercel.json` crons — runs daily at a different time than existing charge generation
3. Auth via existing `CRON_SECRET` env var (same pattern as `generate-charges`)

## Out of Scope

- Upgrading Supabase plan (tracked in `docs/operational-thresholds.md`)
- External cron services (cron-job.org, GitHub Actions)
- Modifying the existing `generate-charges` cron
- New env vars
- Notifications or alerting on failure (just log)

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/app/api/cron/keep-alive/route.ts` | **NEW** — GET handler that queries Supabase and logs result |
| `vercel.json` | Add second cron entry for keep-alive |

## Implementation Requirements

### 1. New Cron Endpoint

Create `apps/web/app/api/cron/keep-alive/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  // Auth: require CRON_SECRET (same pattern as /api/cron/generate-charges)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const start = Date.now();

  // Minimal query that proves Supabase is reachable
  const { error, count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });

  const durationMs = Date.now() - start;

  if (error) {
    console.error(`[keep-alive] Failed after ${durationMs}ms:`, error);
    return NextResponse.json({ ok: false, error: error.message, durationMs }, { status: 500 });
  }

  console.log(`[keep-alive] OK in ${durationMs}ms (profiles count: ${count})`);
  return NextResponse.json({ ok: true, durationMs, profileCount: count });
}
```

### 2. Add Cron to vercel.json

Modify `vercel.json` to add the second cron entry:

```json
{
  "crons": [
    {
      "path": "/api/cron/generate-charges",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/keep-alive",
      "schedule": "0 20 * * *"
    }
  ]
}
```

The keep-alive runs at 8 PM UTC — 12 hours offset from the charge generation cron. This ensures Supabase is touched at least every 12 hours.

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

After deployment, verify the cron is registered:
- Check Vercel dashboard → Settings → Cron Jobs → confirm 2 entries

## Acceptance Criteria

1. [ ] `apps/web/app/api/cron/keep-alive/route.ts` exists with a GET handler
2. [ ] Endpoint requires `Authorization: Bearer <CRON_SECRET>` header
3. [ ] Endpoint performs a `SELECT` query against Supabase (any minimal query)
4. [ ] Endpoint logs success with duration: `[keep-alive] OK in Xms`
5. [ ] Endpoint logs failure with error and duration
6. [ ] `vercel.json` has 2 cron entries: existing `generate-charges` at 8 AM UTC AND new `keep-alive` at 8 PM UTC
7. [ ] `gate:web` passes (lint + typecheck + build)

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-7] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT modify the existing `generate-charges` cron logic or schedule
- Do NOT add new env vars (use existing `CRON_SECRET`)
- Do NOT add notification/alerting logic (just log)
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
- The keep-alive query MUST hit a real Supabase table to count as DB activity.
