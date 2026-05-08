# Sprint 121 — Stop Vercel Analytics 404 Console Noise

## Objective

Stop the `/_vercel/insights/script.js Failed to load resource` 404s in the browser console. Today the `<Analytics />` component from `@vercel/analytics/react` renders unconditionally, which fetches `/_vercel/insights/script.js` from Vercel — but that endpoint only exists if Web Analytics is enabled on the project. Since it's not enabled, every page load logs a 404. Gate the component behind an env var so it only renders when analytics is actually turned on.

## Context

- Branch: `main`
- HEAD: post-Sprint 120 (commit `0844ff9`)
- Component lives in `apps/web/app/layout.tsx` at line 101
- Import at line 3: `import { Analytics } from "@vercel/analytics/react";`
- Package: `@vercel/analytics ^2.0.1` (already installed)

## In Scope

1. Conditionally render `<Analytics />` based on `NEXT_PUBLIC_ENABLE_ANALYTICS === "true"`
2. Add the env var to `apps/web/lib/env.ts` capabilities map

## Out of Scope

- Removing the `@vercel/analytics` package (keep it installed so it's a one-env-var flip to enable)
- Adding Speed Insights (separate product, separate package)
- Replacing with another analytics provider
- Modifying anything else in `layout.tsx`

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/app/layout.tsx` | Wrap `<Analytics />` render in env-var check |
| `apps/web/lib/env.ts` | Add `NEXT_PUBLIC_ENABLE_ANALYTICS` to capabilities map |

## Implementation Requirements

### 1. `app/layout.tsx`

Replace the unconditional `<Analytics />` render. Two acceptable patterns:

**Pattern A (inline check):**

```typescript
{process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true" ? <Analytics /> : null}
```

**Pattern B (constant + conditional):**

```typescript
const ANALYTICS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true";
// ...later...
{ANALYTICS_ENABLED ? <Analytics /> : null}
```

Either is fine. Codex picks whichever reads cleanest in context.

**Important:**
- The env var MUST be `NEXT_PUBLIC_*` so it's exposed to the client (server-only env vars don't reach client components)
- The check is strict equality with `"true"` (string), not truthy — so unset, empty, or `"false"` all evaluate to false
- Keep the `import { Analytics } from "@vercel/analytics/react";` line — only gate the render

### 2. `lib/env.ts`

Add `NEXT_PUBLIC_ENABLE_ANALYTICS` to the existing capabilities map alongside the other public env flags. Use the same `Boolean(process.env.X)` pattern used for other entries.

### 3. No Tests Needed

This is a render-time conditional; the component itself isn't ours and the gating logic is one boolean. Manual verification by checking the deployed page's console after deploy is sufficient.

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] `apps/web/app/layout.tsx` renders `<Analytics />` ONLY when `process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true"`
2. [ ] The `import { Analytics } from "@vercel/analytics/react";` import is preserved
3. [ ] `apps/web/lib/env.ts` includes `NEXT_PUBLIC_ENABLE_ANALYTICS` in the capabilities map
4. [ ] No other files modified
5. [ ] `gate:web` passes
6. [ ] No new dependencies

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-6] PASS | FAIL each
notes: (any deviations)
```

## Constraints

- Do NOT remove the `@vercel/analytics` package
- Do NOT change anything else in `layout.tsx`
- Do NOT modify Speed Insights or add new analytics providers
- Env var name MUST be `NEXT_PUBLIC_ENABLE_ANALYTICS` exactly
- Check MUST be strict `=== "true"`, not truthy
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
