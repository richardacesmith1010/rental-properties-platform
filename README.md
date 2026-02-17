# Rental Properties Platform

Monorepo starter for a rental property owner platform with:
- Web owner/admin portal (Next.js)
- Mobile app shell (Expo React Native)
- Shared TypeScript package for domain models
- Supabase schema migrations for core rental workflows

## Project Structure

- `apps/web`: Owner dashboard web app
- `apps/mobile`: Mobile app shell (owner + tenant flows)
- `packages/shared`: Shared domain types and helpers
- `supabase/migrations`: SQL schema and policies
- `docs`: Product and architecture notes

## Quick Start

1. Install dependencies:
   - `npm install`
2. Run web app:
   - `npm run dev:web`
3. Run mobile app:
   - `npm run dev:mobile`

## MVP Modules Included

- Property dashboard summary
- Rent tracking model and UI placeholders
- Maintenance ticket model and UI placeholders
- Document vault model
- Tenant directory model

## Next Build Steps

1. Create Supabase project and apply migration in `supabase/migrations/20260217_initial_schema.sql`
2. Wire auth (owner/tenant roles)
3. Replace mock dashboard data with live queries
4. Add rent reminder notifications (email/SMS)
