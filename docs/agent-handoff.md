# Agent Handoff

## Done (Codex)
- Root route now serves marketing page for signed-out users and redirects authenticated users to `/portal`.
- Root route now applies `(marketing)` layout wrapper for unauthenticated visitors.
- Owner dashboard now surfaces charge-generation result messages from `?generated=...`.
- Owner charges card now includes a manual fallback trigger link: `Generate This Month Charges` (`/owner/generate`).
- Auth callback now handles both `code` and `token_hash` flows and redirects cleanly on callback errors.
- Owner dashboard now includes:
  - Notifications list + mark-read action
  - Documents + e-sign packet workflow
  - Vendor creation and ticket assignment controls
- Tenant workspace now includes:
  - Notifications list + mark-read action
  - Document signing section
- Manager workspace now supports vendor assignment and maintenance photo upload controls.
- Added Milestone 1-3 data/action foundations:
  - `document_templates`, `document_packets`, `document_signers` integration
  - `notifications`, `notification_deliveries` integration
  - `vendors`, `maintenance_assignments`, `maintenance_photos` integration
- Added migration:
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260228_phase8_documents_notifications_maintenance.sql`
- Upgraded mobile shell to tenant-first V1 workflow skeleton:
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/mobile/app/index.tsx`
- Added regression and schema validation coverage for new validation contracts.
- Validation status:
  - `npm test --workspace @rental/web` passed (74 tests)
  - `npm run lint:web` passed
  - `npm run build:web` passed
  - `npx tsc -p apps/mobile/tsconfig.json --noEmit` passed

## In Progress (Codex)
- Production deployment + live migration application verification.
- Signed URL rendering flow for maintenance photos and lease document assets.

## Pending (Claude)
- Apply and verify Phase 8 migration in live Supabase if not yet applied.
- Validate storage bucket access strategy for private assets.

## Guardrails
- Do not overwrite live-db-correct logic with stale local SQL.
- Keep changes incremental and route-safe; run build/lint/test after each batch.

## Branching
- Claude branch prefix: `claude/db-*`
- Codex branch prefix: `codex/app-*`
