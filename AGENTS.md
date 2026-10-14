# Domus — Agent Operating Manual (Codex)

Read this before every task. Before starting, also read `docs/codex-lessons.md`, which holds your own lessons. Grooming rules are in `docs/grooming.md`. The previous long version is in `docs/claude/AGENTS-full-2026-10-14.md`.

**Precedence:** the sprint packet's §10 Constraints outrank this file. When a packet says "no commit / no deploy / don't run gate:web", follow the packet.

## 1. What Domus is
A rental-property app for a small-portfolio landlord, the owner (Ace). They use it with real tenants, real co-owners and real money. Every feature must work end to end with real data.

**Roles:**
- **Owner:** homes, leases, money, LLC partners, banks.
- **Manager:** assigned homes only.
- **Tenant:** lease, pay rent, report problems, documents.

**Stack:**
- `apps/web`: Next.js 15 (App Router), React, TypeScript, Tailwind;
- Supabase: Postgres, Auth, Storage, RLS;
- Stripe Connect, Plaid (bank sync), Resend (email; nothing is sent until launch), Sentry, Vercel;
- `apps/ios`: a Capacitor 8 shell around https://domusbase.com.

`apps/mobile` (Expo) is dormant; don't touch it.

## 2. Roles and rules of engagement
- **Claude plans, reviews, applies migrations and deploys. Codex writes app code.** Build exactly what the packet says. Flag ambiguity in the report instead of inventing.
- **No migrations against the live DB.** Write the migration SQL file only when the packet asks; Claude applies it.
- **Scaffolding isn't shipping.** UI that isn't wired to real Supabase data is `SCAFFOLDED`, not done.
- **Report compact status only**, as JSON per `docs/codex-report-schema.json`. No "Claude prompt" or "next steps for Claude" sections.

## 3. Coding standards
**Server actions** (`apps/web/app/actions/*.ts`) run in this order, and steps 1–4 are never skipped:
1. auth via the shared helper `requireAuth(...roles)` from `app/actions/auth-helpers.ts`;
2. validate with Zod (`lib/validations*.ts`);
3. role check;
4. home or account permission (`canUserAdministerProperty`, or the domain helper the packet names);
5. capability gate, if any;
6. the mutation, through the client the packet specifies;
7. `revalidatePath`, then return `{ success, error? }`.

Other rules:
- **Errors.** Check the error of **every** `.insert` / `.update` / `.delete` / `.rpc`, including secondary writes. Return plain-language errors, never raw SQL. Use the shared `isMissingSchemaError` from `lib/supabase-errors.ts`. Never return silently.
- **Data fetching** lives in `apps/web/lib/`, on the server-side client. No query inside a loop: collect ids, use `.in()`, and build a `Map`. Run independent awaits with `Promise.all`.
- **Components.** Dashboard UI lives in `components/`. Server actions reach client components as props, never as direct imports.
- **No duplication.** Import existing helpers; never copy a function into a third file.
- **Size.** Lines ≤ 140 characters. New files stay within the packet's limits (default ≤ 300 lines). Don't create god files (> 500 lines).
- **Styling.** Use CSS-variable tokens only (`var(--accent)`, `var(--ink)`, `var(--muted)`, `.domus-card`, `.domus-input`), never raw gray or white Tailwind colors. The look is the Wallet design (light iOS-grouped background, white rounded cards, Geist), checked in **light and dark**. Text contrast ≥ 4.5:1; tap targets ≥ 44px.
- **No hidden labels.** Never hide children with arbitrary variants like `[&>span]:hidden` unless a test proves the visible state.
- **Copy.** Plain language for a 6th grader, at most 12 words per sentence, using the packet's exact copy. Never invent copy, URLs or emails.
- **Secrets.** Never log tokens, keys, cookies or bank data. Never commit `.env*`.
- **Notifications.** Send nothing to real people (`DOMUS_NOTIFICATIONS_ENABLED`).

## 4. Database conventions
- **Source of truth:** the live schema. Check `supabase/migrations/` before assuming a column exists.
- **RLS is on every table.** Core helpers are `can_administer_property`, `can_view_property` and `is_owner_member_of_account`.
- **New tables:**
  - `revoke all … from anon, authenticated` first, then grant only what's needed (column-level update grants);
  - SECURITY DEFINER functions use `set search_path = ''`;
  - never trust a user-writable table inside a definer function.

## 5. Tests and validation
- **Every acceptance criterion maps to a named test that calls the real code.** No tautologies and no asserting a literal equals itself. Claude reads every test file and rejects missing ones.
- **Validation commands:** run the ones the packet lists. Typically:
  - `npm run lint:web`;
  - `npx tsc --noEmit -p apps/web/tsconfig.json`, run **after** the build, never at the same time;
  - `cd apps/web && npx vitest run`;
  - `npm run build --workspace @domus/web`;
  - for iOS, `xcodebuild test …`.
- **If the sandbox blocks a command** (Simulator, network), say so in the report; Claude will run it.

## 6. Environment variables (set in Vercel; never hardcode)
- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **App:** `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `HEALTH_CHECK_SECRET`
- **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- **Plaid and bank sync:** `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PLAID_REDIRECT_URI`, `BANK_TOKEN_KEY`, `BANK_FEED_SECRET`
- **Email and notifications:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `DOMUS_NOTIFICATIONS_ENABLED`, `DOMUS_NOTIFICATIONS_ALLOWLIST`
- **Other:** `NEXT_PUBLIC_SENTRY_DSN`, `ANTHROPIC_API_KEY`

## 7. File naming
- **Pages:** `app/{route}/page.tsx`
- **API routes:** `app/api/{name}/route.ts`
- **Server actions:** `app/actions/{domain}.ts`
- **Data:** `lib/{domain}.ts`
- **Tests:** `__tests__/{name}.test.ts(x)`, next to the code
- **Migrations:** `supabase/migrations/{yyyymmdd}_{description}.sql`
- **iOS:** `apps/ios/ios/App/App/*.swift`, with tests in `AppTests/`

## 8. Common mistakes (each one has cost a sprint)
- **Fake persistence.** Using localStorage or hardcoded lists where the data belongs in Supabase. localStorage is only for UI preferences and short-lived client state that the packet explicitly allows.
- **Unchecked writes.** A secondary write whose error is never checked.
- **Leftover old wiring.** Changing UI copy or flow but leaving the old wiring in place.
- **Gaming a target.** Meeting a size or test target by cramming code or writing hollow tests.
- **Concurrent checks.** Running tsc and build at the same time.
- **Hidden gate access.** Running a composite gate that touches the live DB when the packet forbids it. Read the gate script first.
