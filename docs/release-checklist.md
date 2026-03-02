# Release Checklist (V1)

## 1) Environment Validation

Set these values in Vercel project settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CRON_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Set these values for Expo/mobile environment:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_APP_URL`

## 2) Database + Storage Validation

Run/verify Supabase migrations in order:

1. `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260217_initial_schema.sql`
2. `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260217_phase2_auth_and_policies.sql`
3. `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260218_phase3_profile_visibility.sql`
4. `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260218_phase4_manager_foundation.sql`
5. `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260218_phase5_payments_stripe.sql`
6. `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260225_phase6_manager_maintenance.sql`
7. `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260228_phase7_invitations.sql`
8. `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260228_phase8_documents_notifications_maintenance.sql`
9. `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260228_phase9_llc_and_shared_operator_access.sql`
10. `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260301_phase9_owner_account_columns_delta.sql` (only required for partially-applied live Phase 9 states)
11. `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260302_phase10_leasing_inbox_automations.sql` (required for V2 Phase A leasing/inbox/flows persistence)

Verify private buckets:

- `lease-documents`
- `maintenance-photos`

## 3) Phase 8/9 Runtime Readiness (Before Removing Fallbacks)

Confirm these objects exist in live Supabase:

- Tables:
  - `document_templates`
  - `document_packets`
  - `document_signers`
  - `notifications`
  - `notification_deliveries`
  - `vendors`
  - `maintenance_assignments`
  - `maintenance_photos`
  - `ownership_accounts`
  - `ownership_account_members`
- Columns:
  - `properties.owner_account_id`
  - `invitations.ownership_account_id`
- Functions:
  - `can_administer_property(uuid)`
  - `can_view_property(uuid)`
  - `can_access_property(uuid)` (compatibility alias)

Then verify private storage behavior:

- owner/manager/tenant authorized paths receive signed links
- unauthenticated and unauthorized requests receive `401`/`403`

## 4) Auth + Callback Validation

Verify Supabase Auth redirect URLs include:

- `http://localhost:3000/auth/callback`
- `https://rental-properties-platform-web.vercel.app/auth/callback`

## 5) Pre-Deploy Gate

From repo root:

```bash
npm run gate:web
```

Manual equivalent:

```bash
npm run verify:phase9-runtime
npm run verify:phase10-runtime
npm test --workspace @domus/web
npm run lint:web
npm run build:web
npx tsc -p apps/mobile/tsconfig.json --noEmit
```

## 9) V2 Phase A Runtime Readiness

Confirm these objects exist in live Supabase:

- Leasing tables:
  - `rental_listings`
  - `rental_applications`
  - `screening_reports`
  - `application_events`
- Inbox tables:
  - `inbox_threads`
  - `inbox_messages`
  - `message_deliveries`
- Automation tables:
  - `automation_templates`
  - `automation_rules`
  - `automation_runs`

Verify runtime state:

```bash
npm run verify:phase10-runtime
```

## 6) Deployment + Smoke

Deploy main branch to Vercel, then run:

```bash
APP_URL=https://rental-properties-platform-web.vercel.app npm run smoke:web
```

Optional authenticated cron check:

```bash
APP_URL=https://rental-properties-platform-web.vercel.app CRON_SECRET=<secret> npm run smoke:web
```

## 7) Role Smoke Paths

1. Owner: sign in, view dashboard KPIs, create property/unit/lease, assign vendor, upload maintenance photo.
2. Tenant: sign in, view outstanding charge, open payment checkout, create maintenance ticket, sign a document packet.
3. Manager: sign in, view assigned properties, update ticket status, assign vendor, open maintenance photo.

## 8) Known External Blockers

- Live SQL/RLS/storage policy verification in Supabase must be completed if migration state is uncertain.
- Email delivery requires valid Resend API key and sender domain configuration.
