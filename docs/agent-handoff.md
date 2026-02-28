# Agent Handoff

## Done (Codex)
- Root route now serves marketing page for signed-out users and redirects authenticated users to `/portal`.
- Root route now applies `(marketing)` layout wrapper for unauthenticated visitors.
- Owner dashboard now surfaces charge-generation result messages from `?generated=...`.
- Owner charges card now includes a manual fallback trigger link: `Generate This Month Charges` (`/owner/generate`).
- Added regression tests for charges section generation-link behavior.
- Added regression tests for owner generated-message parsing logic.
- Validation status:
  - `npm test --workspace @rental/web` passed (62 tests)
  - `npm run lint:web` passed
  - `npm run build:web` passed

## In Progress (Codex)
- Continue app hardening and regression tests around owner/tenant payment and maintenance workflows.

## Pending (Claude)
- Write local migration files for live Supabase changes already applied via MCP (schema reproducibility).
- Reconcile migration parity for invitation-related tables/policies.

## Guardrails
- Do not overwrite live-db-correct logic with stale local SQL.
- Keep changes incremental and route-safe; run build/lint/test after each batch.

## Branching
- Claude branch prefix: `claude/db-*`
- Codex branch prefix: `codex/app-*`
