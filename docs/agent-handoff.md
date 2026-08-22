# Domus — Agent Handoff Document

Last updated: 2026-07-12

## Production
- URL: https://domusbase.com
- Supabase project: `vawqdqkaguhdgfhdebqw`
- Hosting: Vercel production deployment
- Primary branch: `main`

## Live Payments Status — Stripe Connect (VERIFIED 2026-07-12)

**Milestone: the platform is approved and live for Stripe Connect.** Domus can now create live connected accounts and move real rent money.

- **Approved:** 2026-07-10 — Stripe email "Your Connect application is approved" (from `accounts@stripe.com`), for platform account **`acct_1T2AgdA8rwK8f30F`** ("Domus").
- **Verified live via Stripe API (read-only) on 2026-07-12** using the production `sk_live_` key:
  - `charges_enabled: true`, `payouts_enabled: true`, `details_submitted: true`
  - `capabilities.transfers: active`, `capabilities.card_payments: active`
  - No outstanding requirements (`currently_due`, `past_due`, `disabled_reason` all empty)
  - Live `GET /v1/accounts` (Connect list) returns 200 — live connected-account creation is enabled
- **Production env is wired for live:** `STRIPE_SECRET_KEY` (sk_live), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (live), `STRIPE_WEBHOOK_SECRET` all present in Vercel production. (Local `.env.local` is `sk_test_` — correct: test locally, live in prod.)
- **Backstory:** the 2026-07-08 support ticket "Unable to create live connected accounts" (platform profile stuck under review after identity-doc submission) was **resolved** by the 07-10 approval. Stripe auto-closed that ticket on 07-12 for no reply — benign, not a rejection.
- **Real onboarding path VERIFIED working (2026-07-12):** created a live connected account with the exact production payload (`createExpressAccount` — `express`, US, `card_payments` + `transfers`, mcc 6513) → success (`acct_...` returned), then deleted it. Live connected-account creation genuinely works for this platform.
- ~~**Not yet done:** 0 real connected accounts exist.~~ **DONE 2026-07-16 (Sprint 128):** owner onboarded live, real $5.46 payment flowed end-to-end. See Sprint 128 section below.

### Defects found during 07-12 verification — RESOLVED by Sprint 127 (shipped + verified live 2026-07-14)

**Both fixed and verified in production 2026-07-14** (commit `35242f3`, deployed via Vercel CLI): `GET /api/health/stripe` now returns **401 without the bearer** (endpoint no longer public) and **200 with `connectEnabled.ok=true`** (probe reports Connect GREEN). `HEALTH_CHECK_SECRET` set in Vercel prod (secret-first, no uncovered window); `Cache-Control: no-store` confirmed. Codex implementation reviewed + 944/944 tests + prod build verified independently by Claude. Full-platform health endpoint now green (connect + webhook + resend all ok). Historical detail:
1. **Health-check false-negative (P1).** `apps/web/lib/health.ts:176` `checkStripeConnectEnabled()` requests **`transfers`-only**, a capability combo this platform is NOT approved for, so `/api/health/stripe` returns **503 / "Connect not enabled"** even though onboarding works. The real onboarding path (`apps/web/lib/stripe-connect.ts:37-38`) requests **`card_payments` + `transfers`** and was verified working. Fix: make the probe request the same capability set (+ mcc/url) as the real onboarding path so the "honest check" is actually faithful.
2. **Unauthenticated health endpoint (security).** `HEALTH_CHECK_SECRET` is unset in Vercel prod, and `apps/web/app/api/health/stripe/route.ts:14` **fails open** (public access when secret unset). A public endpoint that create/deletes a live Stripe account and discloses config health. Fix: set `HEALTH_CHECK_SECRET` in prod and/or fail closed in production.

## Sprint 128 — LIVE end-to-end money test (COMPLETE, 2026-07-16)

**Result: a real $5.46 card payment flowed tenant → Stripe → owner's connected account, and Domus recorded it correctly.** (Depth C used the user's real main account as owner; $5 not $1 because `MIN_ONLINE_PAYMENT_CENTS = 500`.)

- **Owner onboarded live (real ID + bank):** `acct_1TtgYTAUUcWMMedP` on `ownership_accounts` `729c4e55` (owns "1st Home") — charges/payouts enabled, bank attached, payout schedule daily/2-day delay. A second live account `acct_1TtgLnAP3AuU6GWj` sits on `ownership_account_members.payout_stripe_account_id` for LLC `5d3ba8b7` (result of the banner bug below — not wasted; correctly placed for future LLC distributions).
- **Payment:** charge `072452b7` ($5, category other, lease `5562c951`, alt tenant) paid via live Checkout. PI `pi_3TtgnhA8rwK8f30F0xGVUUFc`: $5.46 succeeded, `application_fee_amount` 46¢, `transfer_data.destination = acct_1TtgYT…`. Net **$5.00 pending payout** to the owner's bank.
- **DB:** `rent_charges.status = paid`; `payments` row with PI + checkout-session refs, method card, 500¢, `paid_at` stamped.
- **Remaining leg:** confirm the $5.00 payout lands in the bank (first payout on a new account can take up to ~7 days; check `GET /v1/payouts` on the connected account, then bank statement).

### Critical prod-config defect found & FIXED during the test
**Webhook secret drift + duplicate endpoints.** TWO live webhook endpoints existed for `https://domusbase.com/api/webhooks/stripe` and prod `STRIPE_WEBHOOK_SECRET` matched **neither** → every live event failed signature verification (`pending_webhooks: 2`), so real payments would succeed at Stripe but stay "pending"/overdue in Domus forever. **Fix (2026-07-16):** consolidated to ONE endpoint `we_1Ttgs5A8rwK8f30FBJwVaR0H` (events: checkout.session.completed, account.updated, payment_intent.succeeded, payment_intent.payment_failed), rotated the new signing secret into Vercel prod, redeployed, then replayed the two real events (correctly signed) through the production route → 200 + correct DB writes. **Rule: any Stripe webhook-endpoint change and the Vercel `STRIPE_WEBHOOK_SECRET` rotation are ONE operation, never separate.**

### Code defects found & LOGGED (L3 — review before dispatch; background task spawned)
1. **Connect banner mis-routes owners to member-payout** (`apps/web/app/connect/onboard/page.tsx` ~61-68): with no query params, any active LLC member is defaulted into MEMBER-PAYOUT onboarding instead of connecting the account that collects rent — left "1st Home" unpayable until the account-level flow was run manually via `/connect/onboard?accountId=<id>`.
2. **Profile-vs-account status reads:** the dashboard "Connect Your Bank Account" banner and the owner setup checklist still show "not connected" after a successful ACCOUNT-level connect (they read `profiles.stripe_onboarding_complete` only). Same fix family as #1.
3. ~~Minor: `payments.platform_fee_cents` recorded 0~~ **RESOLVED 2026-07-16 (investigated, no bug):** the column tracks the platform/manager's retained cut of the rent (`createTransfersForPayment`, `stripe-webhook-handlers.ts:278`), not the card-processing surcharge. Manager fee was 0 → 0 is correct. If reporting ever needs "processing fees collected," that's a separate metric (application fee minus Stripe's cut), not this column.

**Next step:** Sprint 129 — fix defects 1+2 (Connect onboarding routing + status reads). Then verify the $5 payout arrival. Dispatch to Codex via the CLI (`~/.codex-cli/...`); see memory `project-shell-and-cli-workarounds`.

## Sprint 130 — Authenticated smoke + smoke accounts (SHIPPED 2026-07-17)

The L-009 gap is closed: `npm run smoke:web` now runs **authenticated render checks** for owner/manager/tenant when `SMOKE_*` creds are in env (skips cleanly otherwise). Each check does a real UI login and asserts the dashboard shell renders with **zero console errors** and no error-boundary text.

- Smoke accounts (isolated, additive, idempotent seeding via `scripts/seed-smoke-accounts.mjs` — Claude runs it, never Codex): +smokeowner / +smokemanager / +smoketenant on "Smoke Test Property" (Unit S, $1/mo lease — below the $5 online minimum so it can never be paid). Creds in `apps/web/.env.local`; rotation per `docs/smoke-accounts.md`.
- Verified against production: seed run (9 entities created) → idempotency re-run (all `existing`) → full smoke **3/3 authenticated passes**.
- Known wart: seeder reports the 3 profiles as `updated` every run (timestamp format comparison) — harmless, cosmetic fix candidate.
- **Perf finding:** the suite measured owner dashboard **cold** login→render at >15s in production (warm ~12s total for all 3 roles). Tenant/manager are much faster. Logged as a perf-sprint candidate — the smoke spec doubles as the before/after harness.

## Reskin Arc — Phase 0 SHIPPED (Sprint 131, 2026-07-17, commit 052638b)

Design source of truth: `docs/design-system.md` **v2** (25-question session). Phase 0 live in production:
- v2 meridian-blue token layer (light+dark exact hexes), three-hook dark cascade, `color-scheme` hints; every legacy `--domus-*` name aliases to v2 tokens so unreskinned screens inherit the palette.
- Theme model: light/dark/**system** (device default); legacy stored themes migrate (verified live on the real owner: `atlas-light` → `light`); no-flash init; Settings → Appearance = Light / Dark / Match my device (verified working both directions).
- Neutral sidebar rail + 8 primitives restyled (button/card/badge/input/select/textarea/alert/modal), tabular numerals in primitives.
- Verified: independent gate green, 970/970 tests, authenticated smoke 3/3, visual walk (owner light+dark, settings, migration).

**Dark-mode punch-list (unreskinned surfaces lost the old `.bg-white` patch crutch — fix each in its surface's phase; none production-breaking):**
- Settings page: h1 renders dark-on-dark (low contrast); "Back to Workspace" pill stays light-styled. (Phase 4 surface — earliest ride-along welcome.)
- Violet remnants (expected until their phases): settings sub-nav active state, Feedback button, Ask Domus button, mascot imagery in setup/empty content (mascot dies fully in Phase 5).

## Reskin Phase 1 + owner perf — SHIPPED (Sprint 132, 2026-07-17, commits 4aa00c1 + 56b5c32)

- **Reskin:** owner shell, command-center KPIs (v2 spec, semantic status colors), charges/analytics sections, charts, reports, property drill-down on v2 tokens. `status-colors.ts` now emits token classes platform-wide. Plain-language copy pass on touched labels.
- **Perf:** permanent `[perf:owner]` telemetry (per-loader JSON timings in Vercel logs); first paint scoped to the visible section; section switches route-driven with labeled skeletons. Warm owner spec runs ~10-13s (was ~12.5s); cold passes within budget. **Top measured offender for a future pass: `ownership.accounts` at ~1,134ms + a sequential auth→profile→ownership prefix (~2.6s total assembly).**
- **Hotfix during verification (56b5c32):** first-paint scoping initially derived nav items from loaded data, making Analytics unreachable (9→8 sections). Fixed: section availability is server-computed capability flags in the first-paint bundle; test locks nav completeness with deferred data absent. Verified live: 9 of 9, Analytics loads on demand.
- **Also:** reverted Codex's unused AsyncLocalStorage cookie scaffolding in `lib/supabase/server.ts` (dead, out of scope, zero references).
- Verified: independent gates green (973/973 then 974/974), smoke 3/3 post-deploy ×2, light-mode walk on real owner, analytics end-to-end.

**Phase 1b backlog (owner files still violet, listed by Codex):** `dashboard/invitations/*`, `maintenance-tracker.tsx`, `maintenance-comment-thread.tsx`, `distribution-config-panel.tsx`, `ownership/*`, `inbox-section.tsx`, `connect-banner.tsx`, `app/owner/error.tsx`, `app/owner/setup/page.tsx`. Plus: strip user email from `[perf:owner]` log metadata (userId only); dark-mode walk of owner surface + real-owner drill-down numbers check pending (user's evening).

## Reskin Phase 1b — SHIPPED (Sprint 133, 2026-08-22, commit 34433df)

- **Owner surface is 100% off legacy purple**: 45 dashboard/owner files converted; independent sweep (`violet-|purple-|indigo-` under `components/dashboard` + `app/owner`) returns ZERO lines. Settings dark-mode bugs fixed (h1 + Back pill via Button primitive). `[perf:owner]` logs userId, never email.
- Codex self-flagged `no_out_of_scope_diffs=false`: my packet's sweep criterion spanned more than its file list (L-011 added to CLAUDE.md). Extras reviewed and accepted — incl. a cosmetic-only token retone of `pay-rent-card.tsx` (tenant money-UI; behavior untouched; helps Phase 2).
- Verified: independent gate green, 974/974, smoke 3/3, scripted Playwright visual walk (zero console errors across 12 captures; Home/Maintenance/Settings confirmed v2 in both themes). Ownership/inbox/invitations section visuals need real-account data to render — covered by the user's next real-data walk.
- **Tooling (2026-08-22):** Codex CLI upgraded to 0.149 (`--full-auto` removed → `--sandbox workspace-write`; account model now gpt-5.6-terra); Vercel creds re-authed after expiry. Both recorded in memory.

## Reskin Phase 2 — SHIPPED (Sprint 134, 2026-08-22, commits fa556e8→52219d7; first Sol-mode sprint)

- Tenant surface + first-run path on v2 (both themes): tenant shell/error, complete-profile, onboarding forms, role-selector, pay-rent-card to the v2 money-screen spec (hero amount, CSS-only radio-card methods, free option leads, fees+totals plain). Gamification containers retoned; shared/ui 1b escapees converted. 974/974; scoped sweep zero.
- Micro-fixes during verification: phantom `--ink-3` (38×→`--muted`); e2e role selector anchored (plain-language copy made "Tenant" ambiguous); **33 dark-on-dark landmines** (`text-zinc/slate/gray-800/900` on token surfaces) fixed across 15 files after the walk caught "Days Remaining" invisible in dark.
- **First-run walk EXECUTED end-to-end** (smoke owner → wizard invite → Resend email → magic link → complete-profile → first login → onboarding): every screen v2, zero console errors. New fixture: +smoketenant2 (creds in .env.local).
- Findings logged for follow-up: (1) onboarding context card shows "your landlord"/"Your rental home" fallbacks instead of real inviter/property names (Unit resolves; trust miss); (2) invite EMAIL is still old-purple brand (Phase 7 — consider promoting, it's the literal first touch); (3) login page left panel still purple marketing hero (Phase 6).

**Next:** Phase 3 manager surface, or promote Phase 6/7 first-touch surfaces (login hero + emails) per first-run strategy — user's call. Then settings components (4), de-gamification (5). Still pending user: J&MSP bank connect; real-data owner walk. Still pending user: J&MSP LLC bank connect (~3 min); real-data owner walk incl. drill-down numbers.

**Tenant strategy (user-stated 2026-08-22):** Angel (current tenant, "1st Home") pays rent OUTSIDE Domus by deliberate choice — he is NOT the adoption target, so his in-app "overdue" charges are bookkeeping artifacts, not real delinquency (user may want to record manual payments or waive them eventually). The Domus-native tenant will be the NEXT one onboarded. Phase 2 (tenant surface) should therefore optimize for a brand-new tenant's first-run experience: invite → account → first rent payment.

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
- Stripe live processing is now APPROVED and enabled at the platform level (see "Live Payments Status" above, verified 2026-07-12). Remaining: run a real end-to-end live Connect onboarding test with a test owner account before relying on live payouts. Ref: `docs/stripe-live-mode-checklist.md`.

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
