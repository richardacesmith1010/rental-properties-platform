# Rental Properties Platform

Monorepo starter for a rental property owner platform with:
- Web owner/admin portal (Next.js)
- Mobile app shell (Expo React Native)
- Shared TypeScript package for domain models
- Supabase schema migrations for core rental workflows

## Project Structure

- `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/web`: Owner dashboard web app
- `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/mobile`: Mobile app shell (owner + tenant flows)
- `/Users/courtneysmith/Documents/Codex/Rental Properties/packages/shared`: Shared domain types and helpers
- `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations`: SQL schema and policies
- `/Users/courtneysmith/Documents/Codex/Rental Properties/docs`: Product and architecture notes

## Quick Start

1. Install dependencies:
   - `npm install`
2. Copy env template and set Supabase values:
   - `cp apps/web/.env.example apps/web/.env.local`
3. Run web app:
   - `npm run dev:web`
4. Run mobile app:
   - `npm run dev:mobile`

## Supabase Setup (Phase 2)

1. Create a Supabase project.
2. In Supabase SQL editor, run:
   - `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260217_initial_schema.sql`
   - `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260217_phase2_auth_and_policies.sql`
3. Set web env in `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/web/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL=<your-project-url>`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>`
   - `NEXT_PUBLIC_APP_URL=http://localhost:3000`
   - `STRIPE_SECRET_KEY=<your-stripe-secret-key>`
4. Enable email auth in Supabase Auth settings.
5. Add redirect URL in Supabase Auth settings:
   - `http://localhost:3000/auth/callback`
6. Promote your account to owner after first sign-in:
   - `update profiles set role = 'owner' where email = '<your-email>';`

## What Phase 2 Adds

- Passwordless email login (magic link) on web
- Auth callback route and sign out action
- Protected dashboard route
- Live dashboard KPIs from Supabase tables
- Role-aware row-level access policies and auth profile trigger

## Phase 3 Update (Current)

- Property creation form (owner workflow)
- Unit creation form (owner workflow)
- Lease creation form with tenant assignment
- Portfolio and active lease list views

Run this additional migration before creating leases:
- `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260218_phase3_profile_visibility.sql`

## Phase 4 Update (Current)

- Role-based route architecture:
  - Owner dashboard: `/owner`
  - Manager workspace: `/manager`
  - Tenant workspace: `/tenant`
  - Smart role redirect: `/portal`
- Role-oriented login entry options on `/login`
- Owner-only guards on property/unit/lease write actions
- Optional property manager data model foundation

Run this migration to enable manager foundation:
- `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260218_phase4_manager_foundation.sql`

## Phase 5 Update (Current)

- Stripe Checkout payment foundation (server-side)
- Tenant outstanding-charge payment view
- Owner payment visibility for outstanding and completed charges
- Payment success/cancel routes and DB recording of completed checkout sessions
- Automatic charge generation endpoint for scheduled cron execution

Run this migration for Stripe payment tracking:
- `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260218_phase5_payments_stripe.sql`

## Phase 6-8 Update (Current)

- Manager maintenance status updates (Phase 6)
- Invitation table + metadata-role-aware auth trigger + invitation RLS (Phase 7)
- Owner document templates and packet workflows
- Tenant e-sign workflow with signature audit fields
- In-app notifications with email delivery records
- Vendor assignment + maintenance photo upload metadata
- Capability-gated feature availability checks when Phase 8 tables/buckets are missing
- Signed asset access endpoints for private maintenance/document files:
  - `/api/assets/maintenance-photo/:photoId`
  - `/api/assets/document-packet/:packetId`
- Tenant-first mobile V1 workflow shell upgrade

Run these migrations after Phase 5:
- `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260225_phase6_manager_maintenance.sql`
- `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260228_phase7_invitations.sql`
- `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260228_phase8_documents_notifications_maintenance.sql`

## Phase 9 Update (LLC + Shared Operator Access)

- Ownership account model for individual and LLC ownership
- Co-owner membership support for equal-access LLC operators
- Property-account linkage (`properties.owner_account_id`) with permission helpers:
  - `can_administer_property(property_id)`
  - `can_view_property(property_id)`
  - compatibility alias: `can_access_property(property_id)`
- Unified owner/manager operational authorization at property scope
- Manager route upgraded to full operations parity with owner workflows:
  - properties, units, leases, charges, maintenance, documents, vendors, invitations
- Ownership dashboard section:
  - create ownership account
  - link property to ownership account
  - invite co-owner
- Critical-event notification fan-out to active owner members:
  - new ticket
  - ticket resolved/closed
  - late rent
  - payment recorded
  - lease created/updated
  - document sent/signed

Run this migration after Phase 8:
- `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260228_phase9_llc_and_shared_operator_access.sql`

## Stability Compatibility Note

- `FeatureCapabilitiesDTO` now includes `ownershipEnabled` and optional `warnings.ownership`.
- App behavior is backward-compatible with pre-Phase-9 databases:
  - legacy owner-based property access remains functional until Phase 9 is applied
  - ownership-account workflows are disabled with setup guidance when Phase 9 is missing

## Automatic Rent Charge Generation

- Scheduled endpoint: `/api/cron/generate-charges`
- Authentication: `CRON_SECRET` via `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret`
- Uses `SUPABASE_SERVICE_ROLE_KEY` server-side to bypass RLS for scheduled processing
- Optional email delivery for notifications uses:
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
- Vercel schedule: daily at 08:00 UTC (configured in `/Users/courtneysmith/Documents/Codex/Rental Properties/vercel.json`)

Local manual trigger example:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/generate-charges
```

## Smoke Test Script

Run lightweight production-safe checks:

```bash
APP_URL=http://localhost:3000 npm run smoke:web
```

Optional authenticated cron verification:

```bash
APP_URL=http://localhost:3000 CRON_SECRET=<secret> npm run smoke:web
```

## Next Build Steps

1. Apply/verify Phase 9 migration and storage policies in live Supabase
2. Configure `RESEND_API_KEY` + `RESEND_FROM_EMAIL` in Vercel for email notifications
3. Run pre-release checks and smoke tests:
   - `npm test --workspace @rental/web`
   - `npm run lint:web`
   - `npm run build:web`
   - `npx tsc -p apps/mobile/tsconfig.json --noEmit`
   - `APP_URL=<vercel-url> npm run smoke:web`
4. Validate production role paths (owner, manager, tenant) end-to-end
