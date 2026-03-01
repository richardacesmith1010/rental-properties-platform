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
  - smoke script now validates redirect targets (must route unauthenticated protected paths to `/login`)
- Removed accidental duplicate file:
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/web/lib/charges 2.ts`
- V1 closeout UI polish pass applied:
  - shared dashboard shell now uses upgraded app surface/background treatment
  - sidebar snapshot can be role-specific via optional `snapshot` prop
  - tenant route now uses the same sidebar/top-bar shell as owner/manager
  - feature-unavailable states have clearer copy/styling in dashboard sections
- Mobile tenant workflow replaced mock shell with Supabase-backed flows:
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/mobile/lib/supabase.ts`
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/mobile/lib/tenant-data.ts`
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/mobile/lib/types.ts`
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/mobile/app/index.tsx`
  - mobile supports: session bootstrap, magic-link initiation, outstanding charges, ticket create/list, document status list
- Mobile deep-link/auth bootstrap readiness:
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/mobile/app.json` now includes `scheme: \"rentflow\"`
  - `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/mobile/.env.example` now includes `EXPO_PUBLIC_APP_URL`
- Routing note for parallel work:
  - local repo serves marketing at `/` via `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/web/app/page.tsx` + `components/marketing/*` (no local `app/(marketing)` route group directory)
- Validation status:
  - `npm test --workspace @rental/web` passed (93 tests)
  - `npm run lint:web` passed
  - `npm run build:web` passed
  - `npx tsc -p apps/mobile/tsconfig.json --noEmit` passed
  - `APP_URL=https://rental-properties-platform-web.vercel.app npm run smoke:web` passed

## In Progress (Codex)
- Production deployment + live migration application verification for Phase 9.
- Vercel CLI deploy attempt from Codex is currently blocked by missing local credentials (`vercel login` or `--token` required).
- Latest deploy check on `main` (post closeout merge) returned the same blocker:
  - `npx vercel deploy --prod --yes` -> `No existing credentials found`
- `main` now contains the V1 closeout batch commits and is pushed at `83812a9`.
- Live migration apply from Codex is currently blocked by missing Supabase migration tooling/credentials in this environment (`supabase` CLI not installed, no DB management token available).

## Stability Gate Snapshot (2026-02-28)
- Baseline commit: `cdf4dad` on `main`.
- Latest stability-hardening commit: `47aa256` on `main`.
- Local regression gates:
  - `npm test --workspace @rental/web` ✅
  - `npm run lint:web` ✅
  - `npm run build:web` ✅
  - `npx tsc -p apps/mobile/tsconfig.json --noEmit` ✅
  - `APP_URL=https://rental-properties-platform-web.vercel.app npm run smoke:web` ✅
- Unauthenticated production security checks:
  - `/owner`, `/manager`, `/tenant` return redirect to `/login` ✅
  - `/api/assets/maintenance-photo/:id` returns `401` when unauthenticated ✅
  - `/api/assets/document-packet/:id` returns `401` when unauthenticated ✅
- Live DB runtime verification (service-role read-only probe) now shows mixed Phase 8/9 state:
  - present tables: `document_templates`, `document_packets`, `document_signers`, `notifications`, `notification_deliveries`, `vendors`, `maintenance_assignments`, `maintenance_photos`, `ownership_accounts`, `ownership_account_members`
  - present functions: `can_administer_property(uuid)`, `can_view_property(uuid)`
  - present buckets: `lease-documents`, `maintenance-photos`
  - still missing columns: `properties.owner_account_id`, `invitations.ownership_account_id`
- Codex mitigation applied:
  - legacy compatibility fallback for pre-Phase-9 installs in property access/portfolio/invitations/vendors/documents paths
  - ownership workflows now capability-gated with clear user-facing errors if Phase 9 is absent
  - smoke script expanded with protected-route and private-asset auth checks
  - private buckets created by Codex via service-role API:
    - `lease-documents`
    - `maintenance-photos`

## Pending (Claude)
1. Apply and verify Phase 8 migration in live Supabase:
   - `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260228_phase8_documents_notifications_maintenance.sql`
2. Apply and verify Phase 9 migration in live Supabase:
   - `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260228_phase9_llc_and_shared_operator_access.sql`
3. Verify and complete Phase 9 column rollout:
   - `properties.owner_account_id`
   - `invitations.ownership_account_id`
4. Create/verify private storage buckets:
   - `lease-documents`
   - `maintenance-photos`
   - status: buckets exist; Claude should verify policies/permissions post-migration
5. Validate RLS and function behavior after migrations:
   - `can_administer_property(uuid)`
   - `can_view_property(uuid)`
6. Post SQL execution proof and policy outcomes in this document.

## Guardrails
- Do not overwrite live-db-correct logic with stale local SQL.
- Keep changes incremental and route-safe; run build/lint/test after each batch.

## Branching
- Claude branch prefix: `claude/db-*`
- Codex branch prefix: `codex/app-*`
