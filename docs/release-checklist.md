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

Verify private buckets:

- `lease-documents`
- `maintenance-photos`

## 3) Auth + Callback Validation

Verify Supabase Auth redirect URLs include:

- `http://localhost:3000/auth/callback`
- `https://rental-properties-platform-web.vercel.app/auth/callback`

## 4) Pre-Deploy Gate

From repo root:

```bash
npm test --workspace @rental/web
npm run lint:web
npm run build:web
npx tsc -p apps/mobile/tsconfig.json --noEmit
```

## 5) Deployment + Smoke

Deploy main branch to Vercel, then run:

```bash
APP_URL=https://rental-properties-platform-web.vercel.app npm run smoke:web
```

Optional authenticated cron check:

```bash
APP_URL=https://rental-properties-platform-web.vercel.app CRON_SECRET=<secret> npm run smoke:web
```

## 6) Role Smoke Paths

1. Owner: sign in, view dashboard KPIs, create property/unit/lease, assign vendor, upload maintenance photo.
2. Tenant: sign in, view outstanding charge, open payment checkout, create maintenance ticket, sign a document packet.
3. Manager: sign in, view assigned properties, update ticket status, assign vendor, open maintenance photo.

## 7) Known External Blockers

- Live SQL/RLS/storage policy verification in Supabase must be completed if migration state is uncertain.
- Email delivery requires valid Resend API key and sender domain configuration.
