# Domus — Agent Handoff Document

Last updated: 2026-03-16

## Production
- URL: https://domusbase.com
- Supabase project: `vawqdqkaguhdgfhdebqw`
- Hosting: Vercel production deployment
- Primary branch: `main`

## Validation Snapshot
- Unit tests: `562/562` passing at the latest clean gate baseline
- Playwright coverage: `55` tests across `16` spec files (`cd apps/web && APP_URL=https://domusbase.com npx playwright test --reporter=list`)
- Gate command: `npm run gate:web`
- Smoke command: `APP_URL=https://domusbase.com npm run smoke:web`
- E2E command: `cd apps/web && APP_URL=https://domusbase.com npx playwright test --reporter=list`

## Current Testing Notes
- The Sprint 49 Playwright additions are in place and were validated in targeted production runs.
- A full production Playwright run still has known drift in older legacy specs (`apps/web/tests/e2e/auth.spec.ts`, `apps/web/tests/e2e/owner-flows.spec.ts`, `apps/web/tests/e2e/tenant-flows.spec.ts`). Those assertions need selector/data refresh work, but the shipped Sprint 39-52 features are in the repo.

## Feature Status Matrix

| Area | Sprint(s) | Status | Notes |
| --- | --- | --- | --- |
| Ops monitoring | 39 | Shipped | Deep health endpoint, cron history API, owner ops dashboard, CSP hardening. |
| Error recovery and resilience | 40 | Shipped | `withRetry`, `Promise.allSettled` hardening, broader `sideEffectError` coverage, Stripe graceful degradation. |
| Ownership governance backend | 41 | Shipped | Individual rename, LLC rename/delete voting, governance tables and actions. |
| Ownership governance UX | 42 | Shipped | Inline account rename in switcher, pending vote banners, LLC delete confirmation flow. |
| Dashboard performance refactor | 43 | Shipped | Parallelized safe awaits, lazy-loaded conditional sections, large component splits, image sizing fixes. |
| Owner KPI command center | 44 | Shipped | Six KPI cards, rent collection bar, status color system, trend indicators. |
| Property drill-down | 45 | Shipped | Property selector, breadcrumbs, property summary card, portfolio click-through drill-down. |
| Visual polish | 46 | Shipped | Contextual empty states, shadowed cards, typography hierarchy, sidebar cleanup. |
| Command palette and activity feed | 47 | Shipped | `⌘K` / `Ctrl+K` palette, richer notification feed, contextual owner greeting. |
| Inline editing and batch operations | 48 | Shipped | Inline property/unit edits, charge batch actions, tenant overview polish. |
| E2E coverage expansion | 49 | Shipped with follow-up | 55 Playwright tests exist; legacy production spec drift still needs a separate stabilization pass. |
| Theme-token dark mode fixes | 50 | Shipped | Sprint 44-48 components moved to semantic tokens for Atlas Light, Noctis Neon, and Imperium Night. |
| Mobile responsiveness | 51 | Shipped | Owner dashboard polish for 375px-768px, mobile search access, touch-target cleanup. |
| Owner onboarding polish | 52 | Shipped | Animated checklist, auto-progress emphasis, skip persistence, stronger welcome CTAs. |

## Pending User Actions
- Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in Vercel before relying on live outbound email delivery.
- Set `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV` in Vercel before enabling live Plaid account linking.
- Complete `/Users/courtneysmith/Documents/Codex/Rental Properties/docs/stripe-live-mode-checklist.md` before turning on live Stripe processing.

## Migrations and Schema Notes
- No known unapplied migrations are required for features shipped through Sprint 52.
- The Sprint 41 account governance tables were already live when Sprint 42 began.
- Codex does not apply Supabase migrations. Any future schema changes must be applied by Claude or the user through the approved Supabase workflow.

## Architecture Notes
- Dashboard loading remains server-driven through `apps/web/components/dashboard/dashboard-data-loader.tsx`, with client-side filtering for property drill-down and tenant/owner section state.
- Schema drift is handled via feature capability probes and missing-schema guards (`isMissingSchemaError`, feature capability checks, null-safe default returns).
- Resilience patterns added in Sprint 40 remain the standard: `withRetry` for explicit external retries, `Promise.allSettled` for mixed-criticality fan-out, and `sideEffectError` for non-blocking async failures.
- Ownership governance follows the established voting pattern used elsewhere in the product: requester auto-votes, quorum is `Math.ceil(activeMembers.length / 2)`, and solo LLCs auto-resolve.
- Status presentation is centralized through `apps/web/lib/status-colors.ts`; new list views should use that utility instead of hardcoded badge colors.
- Theme support for recent dashboard work is based on semantic Tailwind tokens (`text-foreground`, `bg-card`, `border-border`, `bg-primary/10`) rather than `dark:` overrides.
- Owner onboarding dismissal is intentionally a client preference persisted in local storage; all business data remains in Supabase.

## Efficiency Audit (Sprint 53)

| Finding | File | Action Needed |
| --- | --- | --- |
| Oversized component: 1236 lines | `apps/web/components/dashboard/dashboard-data-loader.tsx` | Split dashboard orchestration into smaller role/domain loaders before adding more dashboard state. |
| Oversized component: 568 lines | `apps/web/components/dashboard/charges-section.tsx` | Extract row rendering and batch-action state into focused subcomponents. |
| Oversized component: 564 lines | `apps/web/components/marketing/landing-page.tsx` | Break hero, proof, and CTA blocks into separate marketing components. |
| Oversized component: 551 lines | `apps/web/components/dashboard/section-renderer.tsx` | Pull layout framing and role-specific overview rendering into smaller modules. |
| Oversized component: 512 lines | `apps/web/components/dashboard/dashboard-config.ts` | Split navigation/config constants from helper logic. |
| Candidate dead export | `apps/web/lib/analytics.ts` (`buildLastTwelveMonths`) | Verify no planned consumers remain; make internal or remove if truly unused. |
| Candidate dead export | `apps/web/lib/analytics.ts` (`average`) | Verify no planned consumers remain; make internal or remove if truly unused. |
| Candidate dead export | `apps/web/lib/analytics.ts` (`overlapMonth`) | Verify no planned consumers remain; make internal or remove if truly unused. |
| Candidate dead export | `apps/web/lib/csv-export.ts` (`downloadCSV`) | Confirm whether export helpers were superseded by inline CSV download code. |
| Candidate dead export | `apps/web/lib/distribution-approvals.ts` (`getCurrentDistributionConfigForAccount`) | Confirm whether governance UI still needs this externally exported helper. |
| Duplicate component name | `apps/web/components/dashboard/empty-state.tsx` and `apps/web/components/shared/empty-state.tsx` | Low priority, but the wrapper/shared duplication adds search noise. Consolidate if backward compatibility no longer needs both. |
| Duplicate component name | `apps/web/components/dashboard/ownership-section.tsx` and `apps/web/components/dashboard/ownership/ownership-section.tsx` | Intentional barrel + implementation pair. Keep if import compatibility still depends on the barrel. |
| Duplicate component name | `apps/web/components/dashboard/sidebar-nav.tsx` and `apps/web/components/dashboard/sidebar/sidebar-nav.tsx` | Intentional barrel + implementation pair. Keep if import compatibility still depends on the barrel. |
