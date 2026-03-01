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
- Added migration:
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260228_phase9_llc_and_shared_operator_access.sql`
- Added ownership + shared-operator app layer:
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/web/lib/property-access.ts`
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/web/lib/ownership.ts`
  - Ownership account dashboard UI section + owner invite flow
- Owner/manager permission model unified to property-admin checks across actions/libs.
- Manager route upgraded to full operations parity using shared dashboard shell.
- Critical owner-member notification fan-out wired for:
  - `new_ticket`
  - `ticket_resolved`
  - `late_rent`
  - `payment_recorded`
  - `lease_updated`
  - `document_sent`
  - `document_signed`
- Webhook and charge-generation flows updated for ownership-account + manager compatibility.
- Upgraded mobile shell to tenant-first V1 workflow skeleton:
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/mobile/app/index.tsx`
- Added regression and schema validation coverage for new validation contracts.
- Added feature capability probing + graceful degradation layer:
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/web/lib/feature-capabilities.ts`
  - Gates owner/manager/tenant sections when Phase 8 tables/buckets are unavailable.
- Added signed private-asset access flows with role authorization:
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/web/lib/assets.ts`
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/web/lib/asset-authorization.ts`
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/web/app/api/assets/maintenance-photo/[photoId]/route.ts`
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/web/app/api/assets/document-packet/[packetId]/route.ts`
- Added idempotency helpers and action hardening:
  - throttled duplicate packet send submissions
  - duplicate vendor assignment suppression + reassigned status
  - notification delivery de-duplication for successful channels
- Added smoke/runbook guardrails:
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/scripts/smoke-web.sh`
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/docs/release-checklist.md`
- Validation status:
  - `npm test --workspace @rental/web` passed (92 tests)
  - `npm run lint:web` passed
  - `npm run build:web` passed
  - `npx tsc -p apps/mobile/tsconfig.json --noEmit` passed

## In Progress (Codex)
- Production deployment + live migration application verification for Phase 9.

## Pending (Claude)
- Apply and verify Phase 9 migration in live Supabase if not yet applied.
- Validate storage bucket access strategy for private assets.
- Confirm storage object-level policies for:
  - `lease-documents`
  - `maintenance-photos`
- Post proof in this document (SQL run output + policy diff, if any).

## Guardrails
- Do not overwrite live-db-correct logic with stale local SQL.
- Keep changes incremental and route-safe; run build/lint/test after each batch.

## Branching
- Claude branch prefix: `claude/db-*`
- Codex branch prefix: `codex/app-*`
