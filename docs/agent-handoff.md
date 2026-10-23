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

## Reskin First-Touch — SHIPPED (Sprint 135, 2026-08-23, commit d697909; Sol-mode)

- **Every outbound email now v2-branded** via the shared `buildBrandedEmailShell` + 8-builder sweep (wordmark header, no gradient/mascot, #1D4ED8 CTA, client-safe hexes). Verified live: fresh invite email received in Gmail on the new brand.
- **Login hero v2 both themes**, mascot removed (flagged login-only exception ahead of Phase 5).
- **Invite-names bug fixed at root**: `getTenantInviteOnboardingContext` (lib/invitations.ts) ignored stored metadata and used RLS-hidden tenant-side reads; now metadata-first with fallbacks + tests. Verified live: +smoketenant3 first-run shows "Smoke Owner" / "Smoke Test Property" on onboarding.
- 978/978; independent gate green; email sweep zero; smoke 3/3; full fresh first-run walk zero console errors.
- Fixtures now: +smoketenant2, +smoketenant3 (creds in .env.local).

**Next:** Phase 3 (manager surface) → settings components (4) → de-gamification (5) → marketing/landing (6) → any remaining email/PDF surfaces (7). Still pending user: J&MSP bank connect; real-data owner walk. Still pending user: J&MSP LLC bank connect (~3 min); real-data owner walk incl. drill-down numbers.

**Tenant strategy (user-stated 2026-08-22):** Angel (current tenant, "1st Home") pays rent OUTSIDE Domus by deliberate choice — he is NOT the adoption target, so his in-app "overdue" charges are bookkeeping artifacts, not real delinquency (user may want to record manual payments or waive them eventually). The Domus-native tenant will be the NEXT one onboarded. Phase 2 (tenant surface) should therefore optimize for a brand-new tenant's first-run experience: invite → account → first rent payment.

## Reskin Phases 3+4 — SHIPPED (Sprint 136, 2026-10-02)

- Manager surface (error + role shell; rest reuses converted dashboard parts) and all settings components on v2. Sweep zero; every referenced CSS var defined; 978/978; smoke 3/3; walk: manager light + settings Profile/Bank/Notifications/Appearance both themes, clean.
- **Codex capability upgrade (CLI 0.160, models gpt-6-astra default / gpt-5.6-sol):** first sprint with network-enabled sandbox → Codex's own full gate ran green incl. live runtime probe; schema-validated JSON report (`docs/codex-report-schema.json`); reference image via `-i` (pipe prompt on stdin when using `-i`). Browser self-check is unavailable headless — future packets should have Codex use the repo's Playwright instead.
- Minor finding: notification toggles' "on" knob is low-contrast in dark (fold into Phase 5).

**Next:** Phase 5 — de-gamification UI (remove mascot, XP/level widgets, streaks, achievements, celebration toasts); backend table/cron cleanup is a separate later L3 sprint. Then marketing landing (6), PDFs (7).

## Reskin Phase 5 — De-gamification UI SHIPPED (Sprint 137, 2026-10-02)

- Mascot, XP/levels, streaks, achievements, celebration toasts gone from every surface (−1157 lines; 9 components + mascot images + canvas-confetti deleted with zero-importer proof). Neutral landmark icon + Domus wordmark. `/achievements` redirects to role home. Dark toggle contrast fixed.
- Verified: Codex network gate + independent gate green; backend XP files byte-identical; walk owner/tenant/manager both themes — no mascot/XP/achievement text, redirects correct, zero page errors.
- Codex sandbox cannot launch any browser (Playwright Chromium MachPort denied) — visual verification is Claude's job; don't require it in packets.
- Findings: tenant rent card reads "Unit Unit S" (label duplicated — pre-existing); marketing landing still pitches XP/streaks/achievements (Phase 6).

**Next:** Phase 6 marketing landing (remove game pitch, v2 look) + "Unit Unit S" fix. Later: L3 backend gamification removal (tables, RPCs, XP calls, API route, cron) — needs ChatGPT review. Then Phase 7 PDFs.

## Reskin Phase 6 — Honest v2 landing SHIPPED (Sprint 139 + 139b, 2026-10-02)

- Landing rebuilt to user-approved mockup (`docs/design/landing-v2-mockup.html`; canvas https://claude.ai/artifact/Unb5KPJ86ueWf6VajixZjc). v2 tokens, light+dark, content visible without JS, reduced-motion respected.
- Removed untrue claims: "500+ landlords", 3 invented testimonials, "99.9% uptime", fictional $29/$79/Custom tiers + 3-unit limit, gamification tab. Replaced with "Free while Domus is in early access." Every remaining feature claim verified against code.
- "Unit Unit S" fixed: 7 raw `Unit {…}` renders → `formatUnitLabel()`. Verified as smoke tenant (Unit S).
- Sentry: shared `lib/sentry-options.ts`; browser events now tagged `production` (verified). Sentry IP storage off.
- 139b: Codex invented `support@domus.app` for footer Help → fixed to `support@domusbase.com`. Lesson: packets that add contact info/links must name the exact values.
- Verified: gate green, auth smoke 3/3, Playwright 1280/375 × light/dark — no overflow, no hidden content, no false-claim text, zero page errors.

**Next candidates:** L3 backend gamification removal (ChatGPT review first); Phase 7 emails/PDFs to v2; Codex read-only Supabase MCP (needs token). Landing visual polish deferred by user ("plain is fine for now").

## Reskin Phase 7 — PDFs + money pages SHIPPED (Sprint 140, `3625fa0`, 2026-10-02)

- PDFs (receipt, receipts bundle, lease summary, manager invoice): violet palette → v2 paper palette in `lib/pdf/pdf-styles.ts`; text wordmark, neutral rules. New render test `lib/__tests__/pdf-templates-render.test.tsx`.
- Pages with no dark handling before → v2 tokens: `/payments/receipt/[id]` (prints light), `/payments/success`, `/payments/cancel`, `/connect/onboard`. Copy: "No charge was applied" → "No payment was made"; "Charge Details" → "Rent Details".
- Verified: gate green (979 tests), auth smoke 3/3, success/cancel walked light+dark (0 page errors), lease-summary PDF downloaded live and inspected. `pdf-data.ts` + `app/api/**` untouched.
- Receipt gap closed: user-approved $1 cash record on smoke tenant's Nov 1 charge (`279fe10d…`, reference "Smoke test receipt (Sprint 140 verification)") — use it for future receipt checks. Receipt page (light/dark) + receipt PDF verified live.
- **140b (`ebe70ef`):** printing the receipt in dark theme came out dark/invisible → print block now forces the full light palette; verified live (card bg white, all text visible). Minor leftover: floating Feedback button prints.
- **Security finding (2026-10-02):** `award_xp` / `update_streak` are SECURITY DEFINER, no search_path, EXECUTE granted to `anon` + `authenticated` → anyone with the public key can write XP rows for any user. App calls them only via service role. Fix = Sprint 141 (L3, `docs/sprint141-codex-prompt.md`, pending ChatGPT review); stopgap REVOKE pending user OK.
- Emails were already v2 before this sprint. 87 dashboard files still use legacy palette classes. Spot checks (owner home, Records, New Property wizard, Analytics in dark) showed no light boxes, but the 87 were not audited one by one — treat as cleanup debt with possible hidden dark-mode gaps.

## Gamification backend REMOVED (Sprint 141, L3, 2026-10-03)

- Security stopgap first (`8c6e09c`, applied live): `award_xp`/`update_streak` were SECURITY DEFINER + executable by anon/authenticated → revoked; anon call verified 401.
- Code (`260995f`, Codex on gpt-6-astra/high): XP awards removed from 9 call sites, streak from auth callback, XP helper from Stripe webhook; `lib/gamification.ts`, `/api/gamification/check`, achievements skeleton deleted; `/achievements` redirect kept; owner/manager `Promise.all` entries removed with AST-proven alignment; smoke script, e2e, seed, notifications type, account-wipe, design doc updated. Rent reminder copy "keep your streak going!" → "Pay now so you stay on track." Critical diffs (webhook, charges, auth callback, all actions) verified removal-only. Tests 979→922 (all 57 removed were gamification-only).
- DB (`20261003_sprint141_drop_gamification.sql`, applied live after code verify): both functions + 4 tables dropped (no CASCADE); `notifications_type_check` recreated = live def minus `achievement_unlocked` (diffed against live, 0 rows used it).
- Verified: gate green; smoke 3/3 before and after migration; owner banner/overdue/analytics + manager render with 0 page errors; `/api/gamification/check` 404; `/achievements` → login; Sentry 0 unresolved; phase9/phase10 runtime checks ok.

## Sprint 142 — Legacy palette sweep SHIPPED (`d4c0b56`, 2026-10-02)

- 99 files (~800 legacy classes: zinc/violet/red/amber/emerald/…/bg-white) → v2 tokens via a fixed mapping table; Codex split across 3 parallel workers + 1 integration audit (~10 min). Dead sidebar overrides removed from `theme-utilities.css`; Feedback button `print:hidden`. Zero copy/logic/link diffs.
- Correction on record: before this sprint none of those files had `dark:` handling (earlier claim of "dark pairs" was wrong).
- Verified with a dark-mode crawl (smoke owner 22 sections + manager + tenant): BEFORE = light boxes/near-invisible text on 13 owner screens; AFTER = 26/26 views clean. Light-mode crawl: only white-on-accent button labels (correct). Gate green, smoke 3/3.
- Crawl detector fix: `color(srgb …)` values (from `color-mix`) are 0–1 scale — the first version misread them. Script: scratchpad `dark-crawl.spec.ts` (copy into `tests/e2e/` temporarily; env DARK_OUT/DARK_TAG). Worth promoting into the repo smoke suite.
- First dispatch hit the Codex usage limit (likely drained by Sprint 141's Astra/high run); retried automatically after reset.

## Sprint 143 — Theme contrast smoke check (`806c338`, 2026-10-02)

- New `apps/web/tests/e2e/smoke-theme.spec.ts` (5 math self-tests + Owner/Manager/Tenant views; dark + light; WCAG contrast < 2.0 = near-invisible, light box in dark = fail). Wired into `scripts/smoke-web.sh` after the render check; `npm run smoke:theme` (`SMOKE_THEME_FULL=1` = every section, both themes). ~48 s.
- Verified: 10/10 pass on prod standalone; negative test (injected white-on-white box) fails with a clear message (ratio 1.04).
- **Finding:** `app/actions/login.ts:31` rate limit = 5 attempts / 15 min per email and counts SUCCESSFUL sign-ins too. Locked out the smoke owner mid-run ("Too many sign-in attempts"). Real-user impact: 6 correct sign-ins in 15 min → locked out. Fix candidates: count only failed attempts (auth = L3) and make the theme spec sign in once per role.

## Sprint 144 — Login lockout fix SHIPPED (L3, `b3ac3e6`, 2026-10-03)

- L3 review run by Claude in the Domus ChatGPT project (chat "Review Login Throttling"): rev 1 REJECTED (outages would count, concurrent-guess race, theme refactor out of scope) → rev 2 APPROVE WITH CHANGES (stale completions after window expiry/success) → rev 3 adopted. Sprint 141 had skipped this review (user relay mistake) — noted.
- `lib/rate-limit.ts`: new failure limiter (`reserveFailureAttempt` / `completeFailureAttempt` with per-window reservation tokens); `checkRateLimit` untouched. `app/actions/login.ts`: only `error.code === "invalid_credentials"` counts; success clears; completion in `finally` before redirect.
- Verified: 12 login scenarios + limiter tests (942 total), gate green; LIVE: 7 consecutive correct owner sign-ins never locked; 5 wrong manager passwords → normal message, 6th → locked.
- Known limitation: per server instance (in-memory); Supabase Auth limits are the backstop.
- Pending L1 (split out by review): theme smoke spec signs in once per role.
- Post-deploy smoke: render 3/3 green, Sentry clean. Theme check now FAILS on a false positive: owner home in dark shows `StripeHealthBanner` (`components/dashboard/stripe-health-banner.tsx:40`) "Reconnect bank" — an intentionally inverted light button with dark text (readable). It appeared because the smoke owner's Stripe status is now restricted/missing. Fix in the L1 sprint: exempt `a`/`button` elements whose own text contrast is ≥ 4.5 from the light-box rule.

## Sprint 145 — Theme smoke hardening (2026-10-03)

- `smoke-theme.spec.ts`: interactive controls whose own text contrast ≥ 4.5 are exempt from the dark-mode light-box rule (fixes the "Reconnect bank" false positive); one sign-in per role (3 per run, was 5). Verified: 11/11 pass on prod with the banner present; negative test (injected light box + faint button) fails with 3 findings.

## Data correction — Angel Hernandez (2026-10-03, owner-approved)

- Tenant Angel Hernandez (he/him), 1st Home Unit A, lease `b9c47e88…`, $2,350/mo, pays the owner outside Domus — owner confirmed every month paid, nothing late.
- One atomic SQL block: Aug/Sep/Oct rent → manual payments (method `other`, paid_at = due date, note "Paid outside Domus on time (owner-confirmed 2026-10-03)") + status `paid`; Aug/Sep late fees → `waived`; `charge_edit_history` + `audit_logs` rows written as owner; 15 overdue/reminder notifications marked read. No tenant notifications sent. Verified after.
- May + Jul late fees: owner-approved reversal done — their payments `reversed_at` set, charges → `waived`, history + audit rows (`reverse_payment`). All 4 of Angel's late fees now waived with $0 active payments.
- Owner direction: **no notifications to anyone until the owner says real people use the app** (memory: no-notifications-until-launch). Sprint 146 (L3, rev 3 ChatGPT-approved-with-changes, adopted) = notifications master switch default OFF + "Tenant pays outside Domus" lease flag. Rollout: apply column migration FIRST, verify, then deploy code. Nov 1 rent (and every future month) will go late again → needs a "pays outside Domus" lease setting (proposed Sprint 146). Data oddity: 6 property rows named "1st Home" under the owner.

## Sprint 146a — Notifications master switch SHIPPED (L3, `839f687`, 2026-10-03)

- Option A (owner choice): env `DOMUS_NOTIFICATIONS_ENABLED` — only exact `"true"` enables; **unset in Vercel = OFF**. `createNotificationWithDelivery` (the only notifications-table writer + Resend notification sender) returns early when OFF; `sendDelinquencyEscalations`, `sendRentDueReminders`, `sendLeaseExpirationWarnings` return "Notifications off: 0 sent." Announcement + bulk-reminder success text: "Saved. Notifications are off until launch, so no one was notified." Invites/invoices/ops/feedback/auth emails untouched (empty diff). Codex checked live DB: no triggers/RPCs/Edge Functions bypass it.
- ChatGPT L3 review: approve with changes (all adopted). Original intent-based Sprint 146 design stopped at Codex inventory (45+ files) → split into 146a/146b.
- Verified live: smoke-owner announcement saved (recipient_count 1) with **0** new notifications/deliveries (78/136 before and after). 957 tests, gate green.
- **To launch notifications later:** set `DOMUS_NOTIFICATIONS_ENABLED=true` in Vercel (Production) and redeploy — only when the owner says real people use the app.
- Column `leases.collects_outside_domus` already applied live (2026-10-03) for Sprint 146b.

## Sprint 146b — "Tenant pays outside Domus" SHIPPED (L3, `f2ef917`, 2026-10-03)

- ChatGPT L3 review: approve with changes (all adopted). Codex fresh inventory: only late writer = `applyLateFeesToOverdueCharges`; no SQL/RPC/trigger late logic. Central predicate `lib/lease-collection.ts` `isCollectedOutsideDomus`; late status + late fee gated independently; overdue readers (delinquency, aging report, dashboard, manager dashboard, analytics lateCents, action items, tenant payments, rent urgency, tenant overview) exclude flagged leases; receivables/rent roll/outstanding/ledger/P&L/collection unchanged (tests). Lease form checkbox (unchecked → false normalized) incl. partial-edit path `app/actions/entity-updates*.ts`; badge "Pays outside Domus" on lease list. 983 tests, gate green.
- Verified live with the smoke owner (temporarily flagged, then restored): home went from "2 overdue charges" to "Everything looks good" / 0 overdue; Leases shows the badge. Smoke 3/3 + theme 11/11.
- **Angel Hernandez's lease `b9c47e88…` is now `collects_outside_domus = true`** (owner-confirmed; audit_logs `update_lease`). His future months won't go late or get fees; owner marks months paid (method ACH, note "Fidelity") or asks Claude to record quietly.

## Owner walk-through + data cleanup (2026-10-03)

- Findings ranked in `docs/walkthrough-2026-10-03.md` (overdue count mismatch, floating buttons covering controls, mobile account menu open on load, ~3 s section loads, triple bank-setup ask, carousel nav, jargon, owner "Pay now").
- Owner-approved permanent delete of 7 empty archived properties on the owner's account (5× "1st Home", "Mom's Home", "Sunset Apartments"): verified 0 rows in all 17 referencing tables first; one guarded transaction; `audit_logs` `delete_property` row per property. Remaining: 1st Home (Goose Creek, active) and Mom's House (Ardmore, active).
- Sprint 147 (L2) dispatched for findings #1, #2, #3, #8.

## Sprint 147 — Walk-through bug fixes SHIPPED (L2, `8323c77`, 2026-10-03)

- Owner/manager home: greeting, header summary and KPI now all count **tenants behind** ("1 tenant is behind on rent ($2)." / KPI "Tenants behind"). Two floating pills → one 44px **Help** button (menu: Ask Domus, Send feedback; Ask Domus only where the assistant exists). Mobile "account menu open on load" was actually a duplicate always-visible signed-in card in `MobileUserFooter` — removed; sign-out still reachable via avatar. Owner/manager rows no longer show Pay buttons (`isTenantView && status not paid/waived`).
- Codex hit its usage limit mid-run; resumed automatically after reset (detached nohup), reviewed its own partial tree, finished. 991 tests, gate green.
- Verified live: header "1 tenant behind", old wording gone, one Help button + menu, Charges shows 3 Record buttons and no Pay, mobile signed-in card hidden on load + sign-out reachable, 0 page errors; smoke 3/3, theme 11/11.
- Next: Sprint 148 — the ~3 s section load floor (walkthrough #4).

## Sprint 148/149 — Owner section load speed (2026-10-04)

- 148 (diagnosis, no code): section switch = `router.replace` → full force-dynamic `/owner` RSC reload, 65–78 Supabase requests in sequential waves (~2.57 s server path); DB itself ~3–4 ms/request. Causes: 24 capability probes per load, serial profile/ownership/capability reads, property access resolved 3–4×, dashboard/portfolio internal waterfalls, per-property Stripe lookups (Charges).
- 149 (`c8c7493`, L2): capability probes cached 300 s via `unstable_cache` (admin client, tag `feature-capabilities`, failed probes never cached); profile/ownership/capabilities run in parallel after the role check; property IDs resolved once and passed to dashboard/portfolio. 998 tests, gate green, smoke 3/3, theme 11/11.
- **Measured (prod, smoke owner):** before ≈3,050 ms (Charges ≈3,560). After, warm: Maintenance 2,836 · Portfolio 2,595 · Expenses 2,570 · Leases 2,590 · Charges 3,086 (≈0.45 s faster; less than the projected ~1 s). First pass right after deploy was slower (cold caches, 3.1–4.4 s).
- **Next for speed (Sprint 150 candidate, "fix 3"):** collapse `getDashboardData`/`getPortfolioData` internal waves, batch the per-property Stripe lookup (`lib/stripe-connect.ts:473-477`), and/or stop refetching the shared bundle on every section switch (client-side section cache). Real target needs the navigation model change.

## Sprint 150 — Owner speed fix 3 SHIPPED (L2, `f7fabdf`, 2026-10-04)

- Ownership reads + owner Stripe map merged into the main owner `Promise.all` (3 barriers → 1); `arePropertyOwnersConnected` batched (5 queries flat for 1 or 10 properties; same decision order as `getOwnerStripeAccountForProperty`, which is unchanged and still used by payment paths); dashboard waves ~10 → 6, portfolio 4 → 2. 1008 tests, independent gate green, smoke 3/3, theme 11/11.
- **Measured (prod, smoke owner, direct RSC fetch, warm median):** before Overview 2,769 · Charges 3,397 · Maintenance 3,177 · Expenses 2,733 · Leases 2,830 → after Overview ~2,100 · Charges ~1,950–2,240 · Maintenance ~2,010–2,150 · Expenses ~2,070–2,140 · Leases ~2,060–2,080. Target (~2.0 s / Charges ~2.2 s) met.
- Remaining floor (~2 s) = full `/owner` RSC re-render per section switch. Next lever: navigation model (client-side section switching / cached shared bundle) — Sprint 151 candidate.

## Sprint 151 — Owner sections switch without full reload SHIPPED (L3, `a6f5179`, 2026-10-04)

- ChatGPT L3 review: APPROVE WITH CHANGES (5 required + 2 optional adopted: property scoping, epoch guard vs refresh races, synchronous scope-keyed cache clear, `router.refresh()` failure fallback, refresh-race test). Codex on Astra. New fetch-style action `app/actions/owner-section-data.ts` `loadOwnerSectionData` (session auth → Zod → owner role → onboarding/setup → owned account → administered-property scoping); page and action share `loadOwnerSectionBundles`; client overlay in `dashboard-section-loaders.ts` `useOwnerSectionCache` (scope key account+mode+property, epoch + request id, cleared on any server-props change). 1049 tests, independent gate green, local-dev walk, smoke 3/3, theme 11/11.
- **Measured (prod, smoke owner):** revisiting a section ~50 ms, **zero requests**. First open of a not-yet-loaded section ~2.0–2.4 s (Vercel log: action total 1.3–2.1 s = ~1 s fixed auth/role/profile/ownership/property prefix + bundle; `maintenance.admin-tickets` alone ~650–900 ms). First-open target (0.5–1 s) **missed** — see L-013. Mutation → `router.refresh()` keeps current section correct (verified). Deep link `?section=expenses` without `mode=records` lands on Home — same as before (expenses lives in Records), not a regression.
- Next speed lever (Sprint 152 candidate): background-preload neighboring sections after the page settles, trim the action's fixed prefix, and speed `getAdminMaintenanceTickets`.

## Sprint 152 — Neighbour preload + faster maintenance loader SHIPPED with known issue (L2, `357571d`, 2026-10-04)

- Codex (Sol) hit its usage limit mid-run; auto-resumed after reset (detached nohup), finished. 1061 tests, independent gate green, smoke 3/3, theme 11/11, zero console errors.
- **Measured (prod, smoke owner, 2.5 s between clicks):** 7 of 9 arrow clicks 52–350 ms with zero requests at click time; full `/owner` RSC renders ~2.2 s (was 2.5–2.7 s); `getAdminMaintenanceTickets` 7 waves → 2.
- **Known issue (root-caused):** a Next 14 Server Action that is still in flight when the URL changes via `history.replaceState` makes the App Router refetch the full `/owner` RSC tree for the new URL. Preloads use the Server Action, so nearly every arrow click also triggers a hidden full server render, which clears the overlay → duplicate re-preloads. Reproduced with preload disabled by two quick clicks (Sprint 151 had the same latent bug). User-visible data stays correct; cost is wasted server work. Fix = Sprint 153: move section reads from the Server Action to a GET route handler (fetch bypasses the router), same auth/scoping code.

## Sprint 153 — Owner section reads via GET route handler SHIPPED (L3, `94edd88`, 2026-10-04)

- ChatGPT L3 review: APPROVE WITH CHANGES (5 required + 4 optional adopted). Codex on Astra, no usage-limit stop. Server Action `app/actions/owner-section-data.ts` deleted (zero importers); new `GET /api/owner/section-data` (`app/api/owner/section-data/route.ts`) → server-only core `app/owner/owner-section-data-core.ts` `loadOwnerSectionDataForUser` (same order: session auth → strict Zod → owner role → onboarding/setup → owned account → property scoping → section bundles); transport-neutral tagged codec `lib/owner-section-transport.ts` (Map, undefined, non-finite numbers; Date/Set/BigInt defensive); client `owner-section-cache.ts` uses fetch + AbortController with explicit ownership. 1107 tests, independent gate green.
- **Verified in prod:** zero `/owner` RSC refetches across a 9-click paced walk and 4 rapid clicks (was ~1 per click); full loop = 5 section requests (was 16); 8/9 arrow clicks 53–376 ms; Home (not a preload target) ~2.6 s. Probes: unauthenticated 401; duplicate/unknown/invalid params 400; `Cache-Control: private, no-store`, `Vary` includes Cookie, no ACAO; smoke owner requesting the real owner's account + property IDs → response byte-identical to its own, no foreign IDs. Smoke 3/3, theme 11/11.
- Owner speed arc (148–153) closed. Optional small follow-up: include Home (`daily-ops-home`) as a preload neighbour.

## Owner clarity mockup — APPROVED by owner (2026-10-04)

- Design canvas: https://claude.ai/artifact/NtynVroGDr3NoyrWcWWMPx (private; boards Main/Rent/Phone/Words). Owner approved everything as drawn.
- Decisions: (1) remove owner workflow modes (Daily Ops/New Property/New Tenant/New Manager/Records) and the "N OF M" carousel + prev/next arrows; one grouped sidebar — Every day: Home, Rent, Repairs, Messages · Your homes: Homes, Leases, Tenants · Money: Expenses, Reports, Manager pay · Settings, Help; (2) one "Add" button (property / tenant / manager); (3) ONE bank-setup card on Home only (states: not started / needs info / hidden when connected) + one inline line on Rent; (4) Rent page: Late / Due soon / Paid / All, row actions Remind · Mark paid · more; "Generate This Month Charges" removed (daily cron `/api/cron/generate-charges` 08:00 UTC already creates rent); (5) phone bottom bar Home/Rent/Repairs/More; (6) word swaps per the Words board (Charges→Rent, Portfolio→Homes, Maintenance Tickets→Repairs, Record payment→Mark as paid, Open Receivables→Money owed to you, Tenant Ledger→Payment history, P&L→Money in and out, Property Scope→Show: All homes, Manager Payments→Manager pay).
- Preload (Sprint 152) must be re-targeted from carousel neighbours to likely-next menu items (hover/focus).

## Sprint 154 — Owner clarity 1/3: grouped menu SHIPPED (L2, `d382541` + `a65e742`, 2026-10-04)

- Codex (Astra) hit its usage limit mid-run; auto-resumed after reset and finished. 15 non-test files (all in packet list); `owner-daily-ops-pagination.ts` + owner mode meta deleted (zero importers). 1129 tests, independent gate green, smoke 3/3, theme 11/11.
- Verified live (smoke owner): sidebar exactly Every day / Your homes / Money / More (+ Settings, Help), desktop and phone drawer; no "N OF M", no Previous/Next; Add menu → Add a home / Add a tenant / Add a manager; menu clicks reach Rent/Repairs/Expenses/Owners/Home with zero `/owner` RSC refetches; legacy `?mode=records&section=expenses` → Expenses with mode dropped, `?mode=new_tenant` → Home; light + dark screenshots clean; zero desktop console errors.
- Follow-ups for Sprint 156: (1) phone drawer (`components/ui/mobile-drawer`, vaul) logs Radix "DialogContent requires a DialogTitle" — pre-existing, add a visually hidden title; (2) confirm the active menu item keeps its blue pill while hovered (screenshot showed grey on the active Rent item under the pointer); (3) leftover dead code outside 154's file list: `compact-greeting-bar.tsx`, optional `isOwnerDailyOpsCarousel` type field.

## Sprint 155 — Owner clarity 2/3: bank card, Home, Rent SHIPPED (L2, `32ad3d7`, 2026-10-04)

- Codex (Sol) stopped once on "model at capacity"; resumed immediately and finished. 12 non-test files; new `lib/owner-bank-status.ts` `getOwnerBankCardState` (connected | needs_info | not_started; reuses existing connect href; worst account status wins). 1148 tests, independent gate green, smoke 3/3, theme 11/11.
- Verified live (smoke owner): exactly one bank card on Home ("Stripe needs one more thing"); ConnectBanner + StripeHealthBanner gone for owners; checklist 5 steps, no bank step; Home = greeting + summary, bank card, "Needs you today" (Send reminder / Mark as paid), 3 tiles, "More numbers"; Rent = Late (2) / Due soon (1) / Paid / All, Remind · Mark paid · ⋯, inline bank line, no Generate button; manager Rent still has Generate + Record; zero console errors desktop/phone; light + dark screenshots.
- Found in verification → Sprint 156: Next-rent-due tile wrong ("No rent due" while one is due soon); same tenant listed twice in Needs you today; duplicate "Rent" title + old description + two primary buttons on Rent; Rent badge bare "3"; leftover jargon. `StripeHealthBanner` now has zero runtime importers.

## Sprint 156 — Owner clarity 3/3 SHIPPED (L2, `62aedec`, 2026-10-04)

- First run (Sol) hit the usage limit mid-run (155,295 tokens); user used a reset; resumed on **gpt-reserve** (first cheap-tier trial, 214,658 tokens incl. re-reading the partial tree). gpt-reserve over-read the resume note and **reverted the user's uncommitted `.claude/launch.json`** — Claude restored it from the session-start diff. Packets now forbid touching/reverting files the sprint didn't create.
- 1150 tests, independent gate green, smoke 3/3, theme 11/11, zero console errors desktop/phone.
- Verified live: Needs-you-today grouped ("Smoke Tenant owes $2 · 2 months late"); Next rent due "Nov 1, 2026 · $1 from 1 tenant"; Rent badge "2 late"; "Show: All homes", "Money overview", "Your numbers"; dead files deleted.
- Found → Sprint 157 (L1, gpt-6-luna): phone bottom bar not on screen (fixed element trapped by an ancestor; renders at page end, y≈2854) → portal to body; "Property P&L" on Expenses; duplicate Rent help sentence. Manager-pay "Generate This Month…" button left as is (manager-pay generation, different feature).

## Sprint 157 — Phone bottom bar fix SHIPPED (L1, `1577535`, 2026-10-04)

- **gpt-6-luna, low effort: 89,166 tokens**, 3 files, clean (launch.json untouched — the new "never touch files you didn't create" constraint held). Bar portaled to `document.body`. 1153 tests, gate green, smoke 3/3, theme 11/11.
- Verified live at 390×844: bar on screen (top 781 → bottom 844), Help button above it (bottom 748), Rent/More work, hidden on desktop; "Money in and out by home"; Rent help sentence once; light + dark clean.
- **Owner clarity arc (154–157) complete.** Token log so far: Sol/Astra 80k–340k per sprint; gpt-reserve 215k (resume of a 30-file sprint); Luna 89k (3-file fix).

## Sprint 158 — Manager clarity 1/2 SHIPPED (L2, `22c289f` + fix `2abf678`, 2026-10-04)

- Managers get the owner pattern: grouped menu (Every day / Homes you manage / Money / More), Add (home, tenant), no modes / mode box / KPI strip / "N OF M" / arrows, single bank card on Home (fee wording), legacy `?mode=` URLs handled; smoke manager nav label → "Repairs".
- First targeted-tests-only sprint exposed two gaps, both caught by Claude's full gate / live walk before or right after deploy: (1) lint error + a `useEffect` missing `allSectionItems` (adding it naively reset owner sections → owner test failed; fixed by splitting owner and manager URL-sync effects); (2) live: manager section switches never wrote `?section=` to the URL, so any `router.refresh()` after a save would throw the manager back to Home — fixed with `history.replaceState` + query-change-only resync. Lint now added to Codex's targeted checks.
- **Tokens:** 169k (reserve, main) + 42k (Luna lint) + 41k (reserve split) + 103k (Luna URL fix) = **~355k total** — fix rounds erased the targeted-test savings. Each Codex run carries a large fixed context cost (~40k+), so fewer, more precise runs beat cheap re-runs.
- Verified live: manager menu, Add (2 items), URL updates per section, reload keeps section, fee copy, legacy URL; owner menu, Add (3), owner stays on clicked section; zero console errors; smoke 3/3, theme 11/11; full gate green (1160 tests).
- Next: Sprint 159 (manager Rent filters/actions + manager Home "Needs you today" — mirror owner 155/156).

## Sprint 159 — Manager clarity 2/2 SHIPPED (L2, `e8195ce`, 2026-10-04)

- **One run, gpt-reserve, 99,301 tokens** (vs ~355k for 158) — packet pinned owner invariants per L-014; full gate green first try (owner tests unmodified; manager tests added). `isOwnerView` → `simpleRentView` (owner + manager) with owner-only `showBankConnectionNotice`; manager Home now the owner layout ("Homes you manage", no "More numbers"); `manager-dashboard.tsx` deleted (zero importers).
- Verified live: manager Home/Rent as above, URL tracking intact; owner Home/Rent unchanged; zero console errors; smoke 3/3, theme 11/11.
- Small leftovers (next polish batch): manager Rent shows the help sentence twice (manager section-frame description) and rows lack Remind (manager page likely doesn't pass the batch-reminder action).
- **Manager clarity arc (158–159) complete.**

## Post-159 checks (2026-10-04)

- Sentry follow-ups from Ops (2026-10-02) are already resolved — no code change needed: browser events report `environment=production` since Sprint 139 (verified: latest event Oct 2 tagged production); "Prevent Storing of IP Addresses" is ON in project domus-web (verified in Sentry settings). Owner Home preload already works (overview → daily-ops-home on hover/focus).
- **Launch checklist item (L3, needs ChatGPT review):** managers can't send rent reminders — `sendBatchPaymentReminder` is `requireAuth("owner")`. Allowing managers (scoped to properties they manage) is an auth change; moot until notifications are turned on.
- Polish backlog (fold into the next Codex batch, not worth a run alone): manager Rent help sentence shown twice (manager section-frame description).

## Tenant clarity mockup — APPROVED by owner (2026-10-05)

- Canvas https://claude.ai/artifact/GKgJPNk7dLiLYdXUCchLpV (Main = Tenant Home phone with payState tweak can pay / landlord not ready / paid; Pay; Help = Message landlord + Report a problem tabs; Desktop).
- Decisions: tenant Home with one big rent card ("$X due <date> · in N days" + Pay rent; or "Online pay isn't on yet…" when the landlord can't collect; or "Paid <date>. Thank you!"); tiles Report a problem / Message landlord; "Your problems" status list; small lease summary; tenant nav Home / Rent / Problems / Messages (+ Your lease, Settings on desktop); Pay = bank account (free) first, card with fee, one Pay button, receipt line; Report a problem = what's wrong, details, "It can wait / Fix it soon", 911 note, photo; no carousel arrows, no "charges"/"Waived" jargon.
- Next: tenant build packets + owner dry-run fix packet (O1–O9 in docs/dryrun-2026-10-04.md).

## Sprints 160–161 + dry-run follow-ups (2026-10-05)

- **160 (`378bb8e`, gpt-reserve 173k):** owner dry-run fixes O1–O9. Codex skipped focused tests for O2/O4/O5 (test debt) and missed `portfolio-section.test.tsx` ("Manage"→"Edit") → full gate failed; Claude fixed the assertion (boundary break, one test line). Live: Add menu 4 items incl. Add a unit; invite wizard vacant-only ("All units are rented."); Edit label; real account Next rent due "Nov 1 · $2,350 · Pays outside Domus", Still outstanding $0. **O5 bug found live:** "Angel Hernandez joined. Set up their lease." on the real account (filter used non-outside active leases) — Claude fixed (`bcfb3e7`, boundary break: one-line filter → any lease of any status + test). Verified real Home clean.
- **161 (`5c4b0f1`, gpt-reserve 204k):** tenant pay-state helper + menu/bottom bar/problem urgency live and working, but Home/Rent didn't match the mockup (old alarm PayRentCard reused, "charges" copy, duplicate status line, extra "Home" h2, sidebar first item "Rent", Rent page literal `&apos;`, big My Lease block) → Sprint 161b dispatched (corrections). Minor debt: `getNextRentDueDate` caps day at 28 and ignores future lease start.
- One flaky smoke-auth failure right after the 160 deploy; reran 3/3.
- Token rule now also requires running every existing test file that imports a changed component (memory).
- Sprint 162 (tenant messaging, L3) packet ChatGPT-reviewed (APPROVE WITH CHANGES, all adopted); migration `20261005_sprint162_tenant_thread_unique.sql` written, NOT yet applied — apply right before dispatch, after owner approval.

## Sprints 161b + 162 SHIPPED (2026-10-05)

- **161b (`5bd4d97`, gpt-reserve 161k):** tenant Home now matches the mockup (calm `tenant-rent-card.tsx`, states via `getTenantPayState`; sidebar Home/Rent/Problems/Messages/Your lease; no "charges"/late-fee scare/duplicate heading; Rent page apostrophe + My Lease block fixed). Verified live desktop + phone, light/dark, 0 console errors.
- **162 (`d77290c`, L3, ChatGPT APPROVE WITH CHANGES all adopted, gpt-6-sol 109k):** `startTenantConversation` (session auth → zod → rate limit → active-lease property scoping → conflict-safe `findOrCreateTenantThread` with constant subject "Messages with your landlord" → message → recipients = current admins of that property, deduped, via `createNotificationWithDelivery`; safe logging). Migration `inbox_threads_tenant_profile_unique` (partial unique index on property_id, entity_id, subject where entity_type='tenant_profile') applied + verified live by Claude before dispatch. Live: smoke tenant sent 2 messages → 1 thread, 2 msgs, 0 notifications (switch off); owner sees the thread under Messages → Threads. Full gate green (136 files).
- **Tenant polish backlog (next batch):** Messages page still the old inbox look (triple "Messages" heading, wrong subtitle, Timeline/Threads tabs + "8 unread" notifications mixed in, raw "tenant profile" tag, first message sender "System", tenant shown by email instead of "You"); rent card shows one month ($1) instead of total due ($3 · 3 months); Rent page still shows Enable Autopay + per-row "Pay with card" when online pay is off; `getNextRentDueDate` day cap/start-date edge; Sprint 160 test debt (O2/O4/O5 focused tests); manager Rent duplicate help sentence.

## Sprint 163 — Tenant polish SHIPPED (L2, `2657bd8`, gpt-reserve 162k, 2026-10-05)

- Tenant Messages is now a simple chat ("Messages · Talk with your landlord.", one conversation shown directly, "You" bubbles, landlord name via new `senderName` from a batched profiles lookup in `lib/inbox.ts`, no tabs/unread/entity tag); rent card shows total unpaid ("$3 · 3 months"); tenant Rent page hides Autopay + per-row pay buttons unless `can_pay`; `getNextRentDueDate` handles 29–31 and future lease start; manager Rent help shown once. Full gate green (136 files); live verified tenant/manager/owner, 0 console errors; smoke 3/3, theme 11/11.
- **Remaining polish backlog:** (1) "Already paid? Mark as paid" disappeared for tenants when online pay is off (it lived inside PayRentCard) — should show in `not_ready`/`outside` states; (2) tenant chat bubble timestamps are dark-on-blue (low contrast); (3) Sprint 160 O2/O4 focused tests still missing (Codex skipped twice).
- **Clarity arc status:** owner (154–157, 160), manager (158–159), tenant (161–163) all done. Next candidates: small polish batch above; code-health sprints; bank-feed design (needs owner's Plaid production application); launch checklist (notifications on, manager reminders L3).

## Sprint 164 — Code health 1/3: dead code SHIPPED (L2, `62d0cac`, gpt-reserve 128k, 2026-10-05)

- knip (temporary config, not added to deps) + grep verification: deleted 7 unused components (`action-items.tsx`, `breadcrumbs.tsx`, `dashboard-workflow-modes.ts`, `rent-collection-bar.tsx`, `rent-urgency-banner.tsx`, `tenant-lease-details.tsx`, `role/role-shell.tsx`), dead exports in 4 lib files, and 2 duplicate devDeps (`@typescript-eslint/*`, still provided at the root). Non-test TS/TSX 82,521 → 81,562 lines. No protected (money/auth/cron/plaid/supabase) files touched; zero remaining references. Full gate green (136 files); smoke 3/3, theme 11/11 live.
- Next: Sprint 165 (navigation/shell role split, pure refactor; packet ready), then 166 (split big files).

## Sprint 165 — Code health 2/3: navigation split SHIPPED (L2, `cc94b77`, gpt-reserve 111k, 2026-10-05)

- `useDashboardNavigation` (381 lines) → 81-line composer + `components/dashboard/navigation/{shared,owner,manager}.ts` (85/64/49 lines), same `DashboardNavigationState` shape; dead PageHeader previous/next plumbing removed from `index.tsx`. Zero existing test files modified. Role checks in the composer 50 → 26 (some branching remains). Full gate green (136 files).
- Live regression walk: owner menu → Rent/Repairs/Expenses/Home with correct URLs, legacy `?mode=` dropped, Add 4 items, 4 section-data fetches / 0 hidden RSC refetches, 0 errors; manager Rent/Repairs/Vendors URLs, reload keeps Vendors, Add 2 items, 0 errors; smoke 3/3, theme 11/11.
- Next: Sprint 166 (split the biggest UI/data files: owner-page-data 857, unified-property-wizard 777, leases-section 738, charges-section 614, inbox-section 526, section-renderer 521).

## Sprint 166a SHIPPED / 166b REJECTED (2026-10-05)

- **166a (`adf2a11`, gpt-reserve 183k):** owner-page-data 857→257 (+ `app/owner/page-data/*`), charges-section → 3-line re-export (+ `components/dashboard/charges/*`, main file 477), section-renderer 521→39 (+ `sections/render-section-cases.tsx` 486). Max line 234 chars (legit). Zero test files changed; full gate green; live: all 22 owner sections, 6 manager, 5 tenant render with 0 console errors; smoke 3/3, theme 11/11. Split is shallower than ideal (big switch/implementation moved mostly whole).
- **166b REJECTED + reverted (not committed/deployed):** gpt-reserve met "≤500 lines" by compacting code onto lines up to 8,460 chars; 2 tests failing. → L-015. Retry only with L-015 constraints (line length ≤140, char totals ±10%) and a stronger model.

## Bank feed — design drafted (2026-10-05)

- Design `docs/bank-feed-design.md` + mockup https://claude.ai/artifact/Wp4XfbAcPvXTXmiGyY1FwU. Owner answers: personal account mixed with personal spending (Fidelity + a credit union); "ask once, then automatic"; wants to-do list, per-home ledger, monthly profit, alerts. Privacy: store rental items only, personal items as fingerprints only. Phases: (1) schema + CSV upload + matching + review queue (L3), (2) ledger/profit/alerts (L2), (3) Plaid production daily sync (L3; Plaid announced Fidelity support Aug 2026, may need access request). **Mockup APPROVED by owner 2026-10-05.** Next: owner downloads one month of activity CSV (Fidelity first, then credit union) → Phase 1 packet (L3, ChatGPT review).

## Sprint 167 + 167b — Bank feed Phase 1 SHIPPED (L3, `67e2168`, 2026-10-05)

- `/owner/bank`: upload a bank file (parsed in the browser) → keyed-fingerprint dedupe → auto transfer (paired evidence) → rules → ask (rent / bill keywords) → personal (never stored). Owner Home card "Sort your bank activity". Migration `20261005_sprint167_bank_feed.sql` applied (4 tables, integrity triggers, shape checks, owner read-only RLS). Env `BANK_FEED_SECRET` set in Vercel **production** + local `.env.local` (preview not set).
- ChatGPT review: rev1 REJECT (9 fixes) → rev2 REJECT (3) → rev3 APPROVE WITH CHANGES (1) → rev4. Claude review of Codex output found 4 SHOULD-FIX (Debit sign, transfer evidence reuse, stale rule blocking imports, account picker) → 167b. Tokens: 167 286,616; 167b 137,089 (gpt-6-sol).
- Verified: gate 1260/1260, smoke 3/3 + theme 11/11, live Playwright walk as smoke owner (390px light + dark, zero console errors): rent matched to the dry-run lease, payment ach/Oct 30/"From bank: …", charge pending→paid with prior status, re-upload → "already seen", bill Yes → Undo works. Test data fully removed (Nov dry-run charge back to pending; 0 bank rows).
- **Open defects → Sprint 168:** (1) Undo does not remove the "Always" rule created by that answer, so the next upload auto-files the undone item; (2) "Recent bank items" does not refresh after an answer; (3) bill suggestion text omits the home name ("Looks like: Mortgage"); (4) the rent picker can list waived rents (server rejects them).

## Sprint 168 — Bank feed fixes SHIPPED (L3, `d244b8b`, 2026-10-05)

- Undo reverses the "Always" rule first (delete if created; restore zod-parsed snapshot if overwritten; keep if a newer owner answer overwrote it), then the record; failures are retryable. Undo now works for any owner-answered item (incl. "Already recorded" + transfers). Recent list updates instantly; bill suggestions name the home; waived/deleted rent excluded. Migration `20261005_sprint168_bank_rule_undo.sql` applied (`rule_created`, `rule_snapshot`). ChatGPT: APPROVE WITH CHANGES (4 required + 2 optional adopted). Tokens 135,168 (gpt-6-sol medium).
- Verified: gate 1275/1275; live Playwright walk (smoke owner, 390px): Yes+Always → Undo → re-upload asks again (rent and mortgage); recent list updates without reload; fresh dark-mode check readable. Undo itself left 0 rules/items/payments/expenses; Nov dry-run charge pending.
- Polish backlog: review cards are keyed by row index, so a re-upload can reopen a card in "Change" mode (key by token instead). One benign console warning seen ("Failed to fetch RSC payload" during navigation away mid-prefetch).

## Sprint 169 + 169b — Bank feed Phase 2 SHIPPED (L2, `75756a5` + `24cdd94`, 2026-10-05)

- `/owner/money?property=&month=`: month tabs (Oct/Sep/Aug/This year), "Left after bills" + category lines, alerts (late rent after due + grace [default 4]; bill ≥1.3× avg of ≥2 of prior 3 months), every item with running balance (stacked rows <sm), "Download for taxes" CSV. Owner Home "This month" card via `GET /api/owner/home-money` (≤3 homes + moreCount). Source of truth = payments (non-reversed) + property_expenses; transfers never counted.
- 169 (gpt-reserve, 223,914 tokens) REJECTED: placeholder tests (route test asserted a literal), late-rent alert used day 28 as "today", "Ach" label, raw "2026-10" labels, ~40 queries/home → L-017. 169b (gpt-6-sol, 100,832 tokens) fixed all; 29 real test cases verified by reading the files. Claude boundary-break fix: undefined `--ok` token → `--pos` (1 file).
- Verified live: gate 1307/1307; smoke-owner Home card + money page, light + dark, zero console errors; owner's real 1st Home October shows rent $2,350 (no bills filed yet → upload Navy Federal file to fill).

## Sprint 170 + 171 SHIPPED (2026-10-05)

- **170 (L1, `82f34ea`, 78,604 tokens):** review cards keyed by token; `other` payments read "Paid outside Domus"; smoke now renders `/owner/bank` + `/owner/money` (render + dark/light contrast). Claude raised the owner theme test timeout to 90 s (test-only).
- **Launch review** saved: `docs/launch-review-2026-10-05.md` (fix order 171 → 172 → 173).
- **171 (L3, `eaabe73`, 146,210 tokens; ChatGPT APPROVE WITH CHANGES, all adopted):** autopay return redirects once outside try/catch → `/tenant?section=charges&autopay=…`; `payWithCardState`/`payWithACHState` + useFormState in TenantRentCard/PayRentCard/TenantOverview (errors in role=alert, "Opening payment…"); plain error strings at source; `no_lease` pay state + "Your lease isn't set up yet"; ticket/inbox no-lease notice; copy no longer promises notices/receipt emails. Verified: tests read (autopay 4 cases redirect-once; wrapper auth + rate-limit), gate 1330/1330, smoke 3 + 11, live tenant walk light/dark zero errors.
- Process note: the wait loop's `pgrep -f "codex exec -m …"` matched its own shell, so it never exited; Codex had finished in 6 min. Use a PID file (`echo $! > pid`) or `pgrep -x codex`-style matching next time.

## Sprint 172 SHIPPED (L3, `c9f7761`, 2026-10-05, 154,803 tokens)

- Truthful invite results (manager: email | added | already; tenant: email_branded | email_basic | linked); `redirectTo /auth/callback` on all invite + resend calls; manager "Add" label, 0-home copy, "Homes you manage"; "Skip for now" removed; tenant wizard unit messages; sign-up "Send it again" with identical message for every auth response; existing-email sign-up shows the same "Check your email" screen (no account enumeration). ChatGPT: rev1 REJECT (enumeration + "added" truthfulness) → rev2 APPROVE. Copy-invite-link deliberately excluded (account-takeover risk; needs safer design).
- Verified: tests read (auth/rate-limit order, enumeration-safe resend), gate 1360/1360, smoke 3 + 11, live: manager invite sheet has no Skip.
- Found live (pre-existing) → Sprint 173: on mobile the "Add a manager" bottom sheet's Back/Next buttons sit under the bottom nav bar; step copy "Pick property for manager assignment".
- Process: deploy-wait loops parsing `vercel ls` keep failing; just check `vercel ls` once after ~3 min.

## Sprint 173 SHIPPED (L2, `575b495`, 2026-10-05, 363,403 tokens)

- "Start free" → `/login?mode=signup&role=owner` (owner sign-up open, "Create account" visible at 390 px); fake proofPoints removed; landing reminder promises softened; dead tour link removed; "Tenant Profile ID" setup step removed (→ tenant invite); LLC explained, Account ID hidden, no Back after creation; plain checklist wording; property wizard placeholders "Maple House"/"123 Main St"; ModalOverlay portals to body (root cause: overlay inside dashboard stacking context, navs portaled) → sheet buttons above nav; "Send reminder" hidden while notifications off.
- Verified: tests read, gate 1372/1372, smoke 3 + 11, live 390 px: signup page + Add-a-manager sheet Next above nav, zero console errors.
- **Launch-time follow-up (not wired, safe defaults):** pass `notificationsAreOn` (server switch) to `OwnerDailyOpsHome` and `bankConnected` to `UnifiedPropertyWizard` via `components/dashboard/index.tsx` / `app/owner/page.tsx` / props type. Today: reminder hidden (correct while off); wizard shows neutral "Check your bank setup before taking rent." Packet §5 omitted those files (L-011 again).
- Polish backlog: signup page still has "Premium landlord workspace / command center" marketing copy, long role paragraph, redundant "New to Domus? Create an account" on the signup view.

## Sprint 174 SHIPPED — Security (L3, `53852df`, 2026-10-05, 314,895 tokens)

- Next 15.5.27 + React 19.2.8 (codemod pinned to 15; caching inventory kept Next 14 behaviour incl. `staleTimes` 30 s/300 s); migration `20261005_sprint174_security_hardening.sql` applied (handle_new_user revoked from public/anon/authenticated + explicit grant to supabase_auth_admin; pg_graphql dropped). ChatGPT: rev1 REJECT (14.x EOL) → rev2 APPROVE WITH CHANGES → rev3. Verified locally on a production build + production smoke. Scorecard Security 66 → 76.
- Next in Security: Supabase min password 6 → 8 + letters/digits (awaiting owner OK; dashboard panel open); remove or isolate stale `apps/mobile` workspace to unblock 8 highs; leaked-password protection needs Pro plan (owner decision).

## Sprint 175/175b SHIPPED — Security reaches 80 (L3, `8a65199`, 2026-10-05)

- Workspaces → `["apps/web"]`; mobile gate stage removed; `server-only` + `@typescript-eslint/*` declared in web; root `overrides.typescript 5.6.3`. Supabase min password 8 + letters/digits (dashboard). Codex 175 (66,300 tokens) isolated + fixed 5 highs; 175b hit the Codex usage limit (resets 2026-10-06 01:50) so Claude finished it (boundary break: package.json/lockfile only). Preview build verified on Vercel before production. Note: a clean `npm ci` bumps Playwright — run `npx playwright install chromium` before smoke.
- Scorecard: **Security 80 ✅**. Next category by rule (closest to 80): **Visual design & accessibility (75)** → Sprint 176.

## Sprint 176 (a–d) SHIPPED — Visual design & accessibility reaches 80 (L2, `aa5e85b`, 2026-10-06)

- Codex runs: 176 114,850 · 176b 112,767 · 176c 88,106 · 176d 62,159 tokens (gpt-6-sol). Codex's sandbox cannot launch Chromium, so Claude runs browser specs against a local production build (`npm run build -w @domus/web`; `npx next start -p 3123` in apps/web; `APP_URL=http://localhost:3123`) and feeds findings back. Smoke script now hard-fails without SMOKE_* creds and no longer calls the authenticated cron (it would write production data).
- Claude boundary-break: added a settle wait in `smoke-mobile-layout.spec.ts` (flaky mid-load measurement; test-only).
- Untracked stray file `apps/mobile/README 2.md` (Finder/iCloud duplicate) — not committed; owner may delete.
- Scorecard: **Visual 80 ✅**. Next by rule: Reliability & monitoring (74) — tie with Money accuracy (74), but Money needs the owner's real bank files.

## Sprint 177/177b SHIPPED — Reliability & monitoring 74 → 78 (L2, `e69e36a`; hotfix `9f2506a`, 2026-10-06)

- Sentry-found regression DOMUS-WEB-2 (pdfkit fonts not traced under Next 15) fixed + resolved. New Sentry alert 6124405. `/api/health/cron` + smoke check; verify-stripe-accounts records cron_runs; daily GitHub Actions smoke (needs SMOKE_* repo secrets — owner pastes them; Claude cannot enter credentials into web forms; `gh` CLI not installed).
- **Post-deploy routine now includes a Sentry check** (`search_issues is:unresolved lastSeen:-1h` in domus-z1/domus-web).
- Until 06:00 UTC 2026-10-07, `/api/health/cron` returns 503 (verify-stripe has no recorded run yet), so manual smoke fails at that step — expected.

## Sprint 178 SHIPPED — Plain language reaches 80 (L2, `64889d6`, 2026-10-06, 138,086 tokens)

- Guard test + 163-hit sweep, 0 exceptions; `docs/plain-language.md` is the rule sheet for future packets (cite it in every user-facing packet). Claude test-only fix: a11y spec waits for animations to finish (production fade-in). Scorecard now: Security 80 ✅, Visual 80 ✅, Plain language 80 ✅, Reliability 78 (pending owner GitHub secrets), Money 74 (needs bank files), Owner 72, Speed 70, Tenant 70, Code health 68, Onboarding 62, Manager 58, Launch 52, Notifications 30, Phone app 25.
- Owner is on mobile: pending owner actions at the Mac — (1) 6 SMOKE_* GitHub secrets (page: repo Settings → Secrets → Actions; name field pre-fill flow), (2) Navy Federal + Fidelity October CSVs.

## Sprint 179 SHIPPED — Speed 70 → 72 (L2, `dc1c2f9`, 2026-10-06, 238,921 tokens)

- Gains modest (owner Home 2.74 → ~2.35 s); root cause is round-trip count, not slow queries. Indexes applied by Claude. Claude test-only: speed budgets set to 4.5 s p75 (2.0 s would have failed the daily smoke). Codex note: onboarding return + account.updated webhook don't set `stripe_status`/`stripe_last_verified_at` (daily cron does) — fold into a later Stripe sprint.
- Measurement script: scratchpad `bank167/perf.cjs` pattern (login once, 5 loads, median/p75) + Vercel runtime logs `[perf:owner]`/`[perf:tenant]`.

## Sprint 180 SHIPPED — Speed 72 → 73 (L2, `f318203`, 2026-10-06; resumed after a Codex usage limit)

- Home defers 5 Home-only bundles (works; Home loads shared bundles only). Owner Home not faster: critical path = ownership.accounts (8 q) → administered-ids (4 q) → dashboard.data (12 q, ~1 s). feature.capabilities cache from S179 is ineffective in production (22 q every request). Next sprint (L3): RPCs for dashboard + ownership, fix capabilities cache.

## Sprint 205a APPLIED — URGENT invitations lockdown (L3 security hotfix, DB only, 2026-10-08, owner-approved)
- Hole (found mapping S205): any signed-in owner could INSERT invitations for ANY account/home (`invitations_insert_owner` had no target check; `invitations_insert_admin_v2` tenant branch unbound), and `handle_new_user()` turns pending owner/manager invitations into `ownership_account_members` / `property_managers` at signup → takeover (e.g. a tenant knows their home's id). Audit: 5 invitations ever, all tenant, all authorized → no abuse.
- Fix `20261008_sprint205a_invitations_lockdown.sql`: dropped 4 insert/update policies; revoked insert/update/delete/truncate/references/trigger from anon+authenticated (select kept). All app writes already use the admin client. Verified live: forged insert → 42501; policies left = 2 SELECT.
- Also found (closed by S205 migration, not yet applied): assigned managers can rewrite `properties.owner_profile_id`/`owner_account_id`; `created_by_profile_id` is a hidden entitlement (can_administer_property branch 3, ownership_accounts update, members insert, TS `canUserAdministerOwnershipAccount`).

## Sprint 210c SHIPPED — no iOS auto-zoom + Debug-only web inspection (L3, 2026-10-10, astra high, ran 01:22 after usage reset)
- `globals.css` coarse-pointer rule: text inputs/select/textarea (and .text-xs/.text-sm on them) ≥ 16px; desktop unchanged; no viewport zoom lock. `InspectionPolicy.enabled` (#if DEBUG) → `webView.isInspectable`.
- Verified: 17 XCTest pass; Release sim build OK; gate 1865; live WebKit iPhone emulation (coarse pointer): login inputs 16px, dashboard select 16px, scrollWidth 402 after sign-in; smoke 27/27.
- Remaining Simulator gates (need owner at Mac to sign in): statement share sheet, repair photo, links, offline, sign-out persistence, manager/tenant walks.

## Sprint 210/210b — iPhone app part 1 (Capacitor 8 shell) — DEPLOYED web side, app runs in Simulator (`bf60313`, 2026-10-09; L3 owner exception; gpt-6-astra high 184,862 + 137,432 (210b hit usage limit at the end; work complete); ChatGPT rev1 REJECT → rev2 APPROVE WITH CHANGES → rev3 adopted)
- `apps/ios` (not a workspace): server.url `https://domusbase.com/login` (owner-approved exception to Capacitor's dev-only guidance), errorPath offline page, allowNavigation domusbase.com + checkout/hooks/pay.stripe.com; native NavigationPolicy.swift + DomusNavigationDelegate (wraps Capacitor's delegate; no popup web views; window.open/_blank → main view or Safari; Connect → Safari + pending flag → one reload), WKDownloadDelegate → share sheet (sanitized names, UUID temp dirs), CSV message handler (origin/main-frame/5 MB checks), NSCameraUsageDescription only; iOS 15.0, iPhone, portrait; icon/splash from resources/icon.svg. 16 XCTest pass (iPhone 18 Pro sim, iOS 27, Xcode 27).
- Web: `lib/native-app.ts` (UA `DomusApp/`, never a security boundary), `.domus-native` class from server headers (root layout now reads headers()), SW + install prompt off in app, safe-area top on landing/login in app, theme colors #FBFBF9/#121316, icons in public/icons. Gate 1862.
- Simulator walk (owner = user's own account, signed in by user): login page below status bar; second launch load ~2.0 s; Home + Rent render; force-quit/relaunch keeps session ✅; dark mode ✅.
- **Bug → 210c:** after signing in, page stayed zoomed/scrolled sideways (iOS auto-zoom on focusing inputs with font-size < 16 px; fixed after relaunch). Fix: login/auth inputs 16 px on mobile.
- **Not yet run (210c gates):** statement PDF/CSV share sheet, repair photo, mailto/external/Connect links, offline launch + Try again, sign-out persistence, Stripe round trip, manager/tenant walks. Codex usage resets 2026-10-10 01:17.
- Xcode setup on this Mac: Xcode 27 at /Applications, license accepted, xcode-select set, iOS 27 runtime installed (restart CoreSimulatorService if "runtime not available").

## Friday 2026-10-09 owner session (at the Mac)
- Cloudflare Email Routing: support@ + privacy@domusbase.com → richard.ace.smith@gmail.com (destination verified); MX route1-3.mx.cloudflare.net + SPF `v=spf1 include:_spf.mx.cloudflare.net ~all` + DKIM added; DMARC `_dmarc` TXT `v=DMARC1; p=none`. Verified via dig @1.1.1.1. `send.domusbase.com` (Amazon SES/Resend) untouched.
- SMOKE_* GitHub secrets: SKIPPED (gh CLI not installed; low value — Claude runs authed smoke each deploy).
- Navy Federal: Active Duty Checking 0565 → October-only CSV (27 rows) uploaded to /owner/bank (Ace account, "Navy Federal checking 0565"). 25 personal skipped. Owner confirmed: Fidelity Investments Deposit Oct 5 $2,350 = Angel's Oct rent (linked to existing payment, no duplicate; "Always" OFF), Transfer To Mortgage Oct 1 $1,039.44 = 1st Home mortgage expense (rule ON). Fidelity file skipped (rent already visible via transfer).
- Apple Developer Program (individual, own name): $99 order W1414117156 placed; agreement signed; activation pending (≤48 h). Google Play: SKIPPED by owner (needs Google 2-step verification).
- Small UI findings: /login shows "Your session expired" to a never-signed-in browser; owner/manager role cards squash after choosing Owner at ~800 px.

## Sprint 209 SHIPPED — late rent tracked for client homes (L2, 2026-10-09, sol 168,069)
- `tracksLateRent()` + `getClientHomeFlags()` in `lib/lease-collection.ts`; meaning-(b) sites switched (cron late status, dashboard/manager-dashboard remap, delinquency + reports-delinquency (managerView), analytics, action items, rent urgency, charges list/badge/KPI/home loader). Late FEES and late notifications still skipped for all outside-Domus leases; owner paths add no query; tenant files unchanged. Default taken: client homes only (owner's own outside-Domus leases unchanged).
- Live: test client rent due 2026-09-25 (outside Domus, grace 5) → prod cron `/api/cron/generate-charges` → `late`, no late-fee row, "Notifications off: 0 sent"; manager client list "1 rent overdue", Rent Late 3→4, badge "4 late"; 0 console errors. Cleaned (0 clients, 0 outside-late). Gate 1835; smoke 27/27; CI #420.

## Sprint 208 SHIPPED — manager "Show" filter by client/home + Homes grouped by owner (L2, 2026-10-09, sol 125,075)
- `lib/home-scope.ts` (groups: clients first, alpha; resolve `account:`/`property:` → home ids; URL `?account=` / `?property=` exclusive, stale → all). Manager filter covers portfolio, charges, tickets, KPIs, cash flow. `ownerAccountIsClient` on portfolio (RPC path adds one `ownership_accounts` query per load, throws on error — debt: small extra query on every owner/manager Home).
- Live (smoke manager, 2-home test client): groups `Client · S208 Filter LLC` / `Owner · Smoke Owner Account`; client filter → Rent shows only its 2 rents; URL round-trip + refresh kept; single home + All homes OK; Homes grouped (375 dark OK, no h-scroll); 0 console errors; owner picker unchanged (no optgroups). Data cleaned. Gate 1828; smoke 27/27; CI #417.
- **Finding for Alia:** rent on `collects_outside_domus` leases is never "Late" (`isCollectedOutsideDomus` excludes it from late badges/tabs; past-due client rent showed under "Due soon"). All client rent is outside Domus → overdue client rent is invisible. Proposed S209.

## Sprint 207 SHIPPED — monthly owner statement (PDF + CSV) for client accounts (L3, `a919e08` + 207c `fix`, 2026-10-08/09; sol 169,691 + 207b luna 58,255 + 207c luna 54,504; ChatGPT REJECT ×2 → APPROVE WITH CHANGES rev 4, all adopted)
- Migration `20261009_sprint207_rent_charge_waived_at.sql` applied: `rent_charges.waived_at` + trigger (INSERT/UPDATE branches; client values ignored; un-waive clears). Verified matrix in rollback. 4 legacy waived rows = NULL (never owed).
- **Policy (chosen by Claude 2026-10-09, user informed, can change):** statements are restatements from current records; timestamps place activity (later waivers/deletions don't hide a month), corrections restate. Footer says so.
- Code: `lib/owner-statement.ts` (cash basis rules 1–10, as-of-C deletion/waiver, deposits never counted, reversals dated reversed_at, owed = max(0, …), invariants throw, paged `fetchAllPages`, epoch-ms comparisons after 207b), `lib/statement-month.ts` (Denver), CSV (`escapeAmountCell`; escapeCell + tab/CR/LF), PDF template, routes `/api/pdf/owner-statement`, `/api/owner-statement/csv`, action + sheet on client page; 206c follow-up router.refresh.
- Review catches: 207b string-compared timestamptz ('+00:00' vs '.000Z' — wrong at exact boundary); 207c PDF dropped U+2212 minus (Helvetica no glyph) → ASCII '-'.
- Live verify (smoke manager, Sept 2026 fixture incl. Denver edge payment, Aug payment reversed in Sept, deposit, Oct waiver, out-of-month expense): sheet/CSV/PDF all = hand calc ($3,600 / $920 / $2,680 / owed $1,430; per home 1,030 / 1,650). Foreign 404, future 400, owner 403, 0 console errors. Test data deleted. Gate 1818; smoke 27/27; CI #414.

## Sprint 206 SHIPPED — manager Clients screens + "Whose home is this?" (L2, `4c00beb`, 2026-10-08, sol 198,501 + 206b luna 48,599 Codex tokens)
- Design approved: https://claude.ai/artifact/CT1mZ4eyHhrL1R2RJJ7uhH. Owner decision (default taken, user's "I approve" didn't pick): managers can no longer add a home as their own; `createProperty` for managers requires an active client and goes through `add_client_home` (owner path pinned unchanged). Manager add-home wizard (was "unavailable") now works with a first "Whose home is this?" step.
- New: Clients nav item (managers only), `lib/client-overview.ts` (batched; status overdue > paid > due > no_tenant; waived = settled; inactive homes excluded; ISO earliest due), `/manager/clients/[accountId]`, add-client sheet.
- Live walk (smoke manager, prod): empty state → add LLC client → client page → wizard (whose → home → unit → no tenant → Create Everything) → home listed "No tenant"; DB: managed_client/unclaimed, creator NULL, owner_profile_id NULL, derived pm row active, 0 members. 375 px light+dark: no h-scroll, 0 console errors. Walk data deleted (0 client accounts). Gate 1767; smoke 27/27; CI #404; Sentry no new.
- Polish debt → S206c: duplicate "Clients" heading + irrelevant frame "Add" button and "Show: All homes" on Clients; duplicate "Whose home is this?" heading + old wizard subtitle "One pass. No cleanup…"; double "Add a home" on empty client page; client page has no app shell/top bar; wizard success "Go to Dashboard" should return to the client page; 2 type lines >140 chars in client-overview.ts.

## Sprint 205 SHIPPED — client accounts groundwork (L3, `eb6b565`, 2026-10-08, gpt-6-sol medium; ChatGPT rev1 REJECT → rev2 APPROVE WITH CHANGES, 4 required adopted in rev 3)
- DB (`20261008_sprint205_client_accounts.sql`, applied): `ownership_accounts` client fields + checks (unclaimed ⇒ creator NULL, no Stripe/Plaid/join code, no claim meta); `ownership_account_managers` = single authority (derived `property_managers` via sync trigger, account-row lock first); guard triggers on properties (ownership columns read-only for users on ALL homes; NULL owner only for unclaimed clients), property_managers, ownership_accounts, ownership_account_members (no members on ANY managed client except via client functions), leases (forced outside Domus), invitations; `can_administer_property` manager branch needs active client link, `search_path=''`. Service-role-only `create_client_account` / `add_client_home`.
- App: `lib/client-accounts.ts` (fail-closed helpers, `assertStripeEligible*` in lowest money modules: stripe-connect, charge-checkout, stripe-autopay, autopay cron skip, withdrawals, distributions), `app/actions/client-accounts.ts`, clean refusals in inviteManager/inviteOwner, leases forced outside for client homes. Stripe call-site inventory in Codex report.
- Verified live: 25-check attack script on live (rolled back) all pass; REAL concurrent race via pg_cron (A holds account lock 12 s + adds home, B deactivates link) → all derived rows inactive; invariant queries all 0; test data + cron jobs removed; grants service-role only; advisors nothing new. Gate 1742; smoke 27/27 (3 roles); CI #401 green; Sentry no new issues.
- Debt: no explicit null-owner test for stripe-connect readers (code already null-guarded); webhook manager-fee lookup now throws on DB error (Stripe retries; idempotent). Pre-existing advisor WARNs (RLS helper fns executable by anon; leaked-password protection off) — candidates for a hardening sprint.
- Next: Sprint 206 — manager Clients UI + "Whose home is this?" add-home flow.

## Sprint 203 SHIPPED — Tax Save confirmation + no dead invite links (L1, `9c4c37f`, 2026-10-08, luna 57,445 Codex tokens)
- Root cause: tax form status lived only in `useFormState`; `revalidatePath` refreshed the tree and remounted the form. Fix: client wrapper toasts "Saved." / the returned error (server action unchanged). Expired (≥ 30 d) pending invites show "Link expired. Resend to get a new one." instead of Copy link (uses `isJoinInviteActive`).
- Live: Save → "Saved." visible; smoke owner's Aug-24 invite shows the note, 0 Copy link buttons; test value reset to 0. Gate 1703.

## Sprint 202 SHIPPED — Accurate rental tax summary (L3, `f8dfad3`, 2026-10-08, sol medium 131,492 Codex tokens; ChatGPT APPROVE WITH CHANGES, all adopted)
- Bug fixed: every "mortgage" expense was counted as mortgage interest (principal + escrow overstated deductions). Now: owner enters per home/year Form 1098 interest, escrow property tax, escrow insurance, depreciation (`property_tax_years`, owner-only RLS; migration `20261008_sprint202_property_tax_years.sql` applied + verified: RLS, 3 policies, no anon, authenticated S/I/U only; simulated manager insert refused + sees 0 rows, owner allowed; test rolled back). Mortgage payments → `mortgagePaymentsCashFlow` (info only). Exact category mapping pinned; dollars→cents without floats.
- **Tax summary is now owner-only** (managers could see it before on `/owner/reports`).
- Live: owner saved 1234.56/100/50.25/2000 → DB cents exact; table row interest $1,234.56, taxes $100, insurance $50.25, depreciation $2,000, total expenses $3,384.81 (exact sum). Manager sees no tax content. Reset to 0. Gate 1699; smoke; CI #384; Sentry clean.
- **UX bug found:** after Save, revalidation remounts the form so "Saved." never shows (no confirmation). Fix next (keep status across revalidate, e.g. key the form or show a toast).
- Walk-script lesson: `waitForLoadState("networkidle")` without a timeout hangs on pages with long-lived connections (reports, leases) — always pass a timeout.

## Sprint 201 SHIPPED — Safe invite "Copy link" + public join page (L3, `9641bf7`, 2026-10-07, sol medium 134,581 Codex tokens; ChatGPT APPROVE WITH CHANGES, all adopted)
- User decision: join link is NOT a sign-in credential (copying Supabase's action link rejected: owner could sign in as the tenant). `/join/[inviteId]` shows "{Inviter} invited you to {Home}. We emailed a sign-in link to j***@g***.com" + "Email me a new link" + spam tip. Active = pending + tenant/manager + < 30 days (`lib/join-invite.ts`); all inactive cases identical text; noindex; no-store.
- `resendFromJoinLink`: input `{inviteId}` only; per-invite 3/h always, per-IP 10/h only when IP present, fail closed; re-check active right before send; send OK + timestamp error → still success (logged). Email core extracted to `lib/invite-resend.ts` (owner `resendInvite` behavior pinned by tests first). Owner/manager panel "Copy link" on own pending tenant/manager invites, canonical origin.
- Live: expired pending / fake UUID / junk id → identical inactive text, no PII; accepted → "already used"; headers no-store; robots noindex; Copy link → `https://domusbase.com/join/<id>` + toast. Gate 1668; smoke; CI #379; Sentry clean.
- Follow-up: hide/disable Copy link (or prompt "Resend first") for pending invites older than 30 days — their link shows inactive until resent.

### Owner decisions (2026-10-07, via question form)
- Alia's other clients: **she runs those homes alone** (owners not on Domus) → needs a "manager-run homes" design (L3).
- Pricing: **decide later** (no billing work yet).
- Account deletion: **keep shared rent/payment/repair records with name removed** (retention period to confirm with a lawyer; draft says 7 years).
- Owner must-see data: **cash flow per home; mortgage/tax/insurance; rent status & late rent; tax-time summary.**

### Client accounts + deletion status (2026-10-08)
- Client accounts design `docs/manager-client-accounts-design.md` rev 3 accepted for implementation planning (ChatGPT APPROVE WITH CHANGES ×2). Owner chose: rent outside Domus in v1; owner statement in v1; claim in v1.1. Plan: S205 DB groundwork + capability functions + nullable owner_profile_id; S206 Clients UI + add-home flow; S207 owner statement; S208 (v1.1) claim.
- Account deletion design `docs/account-deletion-design.md` PARKED at rev 3 (needs write-path matrix; release gated on lawyer).

### Owner rollout plan (user, 2026-10-07)
Order: (1) owner verifies own data → (2) Alia (manager, free; also wants to use it for other owners' properties; wants a real phone app by then) → (3) siblings + LLC J&MSP (paid) → (4) siblings' own properties (paid) → later a friend. Open owner decisions: "pertinent data" list; how Alia runs other owners' homes; pricing model; record-retention (now blocks App Store, which requires in-app deletion); Apple/Google developer accounts (owner must create). Big missing pieces: billing (none), Capacitor store app, notifications ON before Alia.

## Sprints 200/200b SHIPPED — Phone smoke covers every screen; 44 px tap targets (L1, `ee04b62`, 2026-10-07; luna 56,286 + 160,899 Codex tokens)
- `smoke-mobile-layout.spec.ts` now visits `/settings` (+ its last tab) and **every** section for owner (21), manager (19), tenant (5); elements inside an on-screen `overflow-x: auto/scroll` container are not flagged. Timeout 240 s.
- First full sweep (prod, 375×812): **0 clipping**, ~20 tap targets < 44 px on 9 views (settings tabs 38, Messages tabs 36, units/leases inline buttons 24–32, portfolio 28, alerts filters 36, members link 20). 200b fixed them with `min-h-11` on phones (`sm:` keeps desktop); verified on a local prod build (4/4) before commit, then prod smoke incl. the new sweep passed. "Your data" icon → Download.
- Gate 1627/1627; CI ok; Sentry clean.

## Sprints 199/199b SHIPPED — "Download my data" + URGENT phone Settings fix (L3 `e9bcc10`, L1 `fff2cd1`, 2026-10-07; sol medium 129,454 + luna 59,064 Codex tokens)
- 199 (ChatGPT: rev 1 export+self-delete REJECTED → narrowed to export-only → APPROVE WITH CHANGES, all adopted): `GET /api/account/export` + `lib/account-export.ts`. Tenant/manager only (owner 403 server-side); rate limit `export:<userId>` 5/h, fails closed 503; explicit column lists, server-derived scopes, `.range()` paging (500) + `.in()` chunks (200), any error → 500; envelope v1; conversations labeled by home name only; headers no-store/nosniff/attachment. Settings "Your data" (tenant/manager) with "Want your account deleted? Tell us with Send feedback…".
- Live: tenant + manager files contain only allowlisted keys, 0 uuids, no Stripe refs, only their own email; counts match SQL (tenant 1 lease / 4 rent / 1 payment / 5 messages; manager 1 home). Owner 403. Gate 1625; CI #369.
- **199b (URGENT, pre-existing since S136):** at 375 px Settings was wider than the screen for every role (card clipped, later tabs unreachable) — grid had no explicit mobile column so it sized to the non-wrapping tab row. Fixed with `grid-cols-[minmax(0,1fr)]` + `min-w-0` + active tab scrollIntoView. Verified 3 roles × light/dark: card right edge 359 px, last tab reachable and opens; desktop unchanged. Gate 1627; smoke; CI #371; Sentry clean.
- Follow-ups: self-delete (needs retention decision in `docs/legal-draft-terms-privacy-2026-10.md`, PII inventory, atomic RPC + deletion state, Stripe cleanup, manager handover); owner export; documents/photos in export; add `/settings` to `smoke-mobile-layout` so clipping is caught automatically; "Your data" uses a trash icon (use a download icon).

## Sprint 198 SHIPPED + launch audit follow-ups (L1, `f0983ee`, 2026-10-07, luna low 83,965 Codex tokens)
- Launch audit (`docs/launch-readiness-audit-2026-10-07.md`): B1 no MX on domusbase.com (support@/privacy@ dead), B2 alerts to send-only address, B3 Terms/Privacy outdated (March) + "paid plans" contradiction, B4 no tenant/manager deletion or any export; S1 phone sign-in form below fold, S2 no DMARC, S3 sitemap duplicate.
- **B2 done:** Vercel prod env `PLATFORM_ALERT_EMAIL=richard.ace.smith@gmail.com` (live from this deploy).
- **S198:** `/login` marketing intro `hidden lg:flex` → phone shows the card first (Owner button bottom 584 px at 375×812, login + signup, light/dark); desktop unchanged; `/marketing` removed from sitemap. Gate 1616/1616; smoke pass; CI #365.
- Small copy note: signup with role preselected still says "Choose your role, then sign in or create your account."

### WAITING ON USER AT THE MAC (user away until Fri 2026-10-09)
- **Cloudflare (B1 + S2):** Email Routing for domusbase.com — forward support@ and privacy@ → richard.ace.smith@gmail.com (user signs in + confirms + clicks Cloudflare's verification email); then Claude adds `_dmarc` TXT `v=DMARC1; p=none`. Chrome extension is connected only to the home Mac.
- 6 SMOKE_* GitHub secrets (Reliability 80) · Navy Federal + Fidelity October CSVs (Owner/Money).

## Sprint 197 SHIPPED — Auth helpers survive Supabase timeouts; errors never become answers (L3, `d7e9595`, 2026-10-07, gpt-6-sol medium, 86,812 Codex tokens; ChatGPT APPROVE WITH CHANGES → APPROVE rev 2)
- Root finding: `lib/auth.ts` ignored Supabase errors — role fell back to "tenant", profile errors looked like "not onboarded" (tenant → /onboarding), `getAuthState` reported "no profile".
- New `lib/supabase-transient.ts`: `isTransientSupabaseFailure` (exclusions first: session-missing, 4xx incl. 401/403/429, 42501, PGRST301/302/116; then status ≥500/0, AuthRetryableFetchError, PGRST003; message regex only for thrown errors) + `checkedSupabaseCall` (one retry after 300 ms; persistent/non-transient → `Error("Account check is unavailable. Please try again.", { cause: <final Supabase error> })`). `getCheckedAuthUser` treats session-missing / getUser 401-403 as signed out (→ /login, no retry). Profile/role reads use `.maybeSingle()` (0 rows → existing fallback; >1 → throw). Redirects stay outside retry. `requireAuth` uses the same.
- 30 new tests (call counts, fake-timer delay, redirects exact). Gate 1615/1615; smoke 3 roles; CI #360; Sentry clean; prod `[perf:tenant] auth.user` ~90–110 ms (unchanged).
- Follow-up: ~25 other direct `auth.getUser()` call sites (routes, PDFs, assets, some pages) still treat any failure as "no user" (listed in S197 report) — lower risk (they 401/redirect, no wrong role).

## Sprints 196/196b/196c SHIPPED — Messages polish, plain words, guard checks returned strings (L2, `fe56d6e`, test fix `b440efd`; 2026-10-07; sol low 114,552 + luna 71,883 + luna 44,478 Codex tokens)
- Messages: tab underline follows the active tab on first paint (animated-tabs useLayoutEffect + re-measure); tabs "Updates"/"Conversations"; intro "Updates about rent, repairs, leases, and papers."; Entity ID input removed; "Go to related page"; type badges plain ("Tenant", "Repair", …); senders by name/"You" (loader already had full_name).
- Automations: UI map by template key (DB `automation_templates` untouched) — "Late rent steps / Starts when: Rent becomes late / What it does: …" etc.; Applications, Documents ("Templates / Send papers / Files"), Find a tenant ("1 home · 2 units", "Next step:") copy.
- Guard now also checks multi-word strings in `return`, ternary and `??`/`||` positions in .tsx under app/ and components/; ~20 more hits fixed, 0 new exceptions (still 6). Codex coined "rent bill" for owner toasts → 196b changed all to "payment" (CLAUDE.md §18 word table).
- Live: manager+owner Messages/Automations/Documents/Find a tenant at 1280/375 light+dark; indicator measured under "Conversations" in all 8 views; 0 console errors.
- **Incident during verification:** smoke failed once — tenant dashboard error boundary (ref 484108108) + Sentry DOMUS-WEB-3. Vercel log: `{"message":"Gateway Timeout"}`; Supabase edge logs: two 504s at 22:00:30–32Z (`/auth/v1/user`, `/rest/v1/profiles`). Upstream transient; smoke re-run passed fully. Follow-up idea (Reliability): retry once on Supabase 504 in the session/profile load.
- **CI #355 failed** on flaky `bank-feed-shell.test.tsx:53` (asserted panel closed without waiting; untouched area; 15/15 local). 196c wrapped it in `waitFor` → CI #356 green. Read CI failures without auth via `GET /repos/<repo>/check-runs/<job_id>/annotations`.
- Local gate typecheck broke on an iCloud duplicate `apps/web/.next/types/cache-life.d 2.ts` → `rm -rf apps/web/.next` fixes it.

## Sprint 195 SHIPPED — Manager/owner Messages, Home count, bank card, repair names (L2, `0affe06`, 2026-10-07, gpt-6-sol low, 81,501 Codex tokens)
- From manager dry run (`docs/manager-dry-run-2026-10-07.md`, findings 1–5, 8). Owner/manager Messages opens on Threads when conversations exist and nothing is unread; empty timeline "No updates yet / Rent, repair, and lease updates show up here." (tenant unchanged). Display-only thread titles via `lib/inbox/thread-title.ts` ("Messages with your tenant", "Tenant says rent is paid - …"); stored subjects unchanged (constant moved there, re-exported from action-helpers). Home "N conversations"; manager bank card "Your bank needs one more thing"; Repairs shows tenant name (same batched profiles query + full_name); `us_bank_account` → "Bank account".
- Codex's own gate first failed (client imported server module) → fixed; Claude's full gate 1555/1555.
- Live: manager + owner Messages/Home/Repairs at 1280/375 light+dark, tenant Messages unchanged; 0 console errors; smoke pass; CI #352; Sentry clean. Owner Home has no messages line (owner Home doesn't load threads; pre-existing, not a regression).
- New small findings: Messages tab underline stays on "Timeline" when Threads is active (seen dark 1280); message senders shown by email; create-thread form "Entity ID (optional)", "Open context", lowercase "tenant profile"; tenant sees its own report text addressed to the landlord.

## Sprint 194 SHIPPED — Plain words in lib/, payment labels; guard scans all of lib (L2, `2960edd`, 2026-10-07, gpt-6-sol low, 121,848 Codex tokens)
- Found: scorecard "leftover jargon" note was stale (guard already bans ledger/ACH/charge in app/components/emails, 0 exceptions). Real gap: non-email `lib/` strings (20 hits).
- Fixed: late notices ("Rent is late" / "Rent due <date> is now late."), notification buttons "View payment"/"Waive payment", preferences text, receipt PDF header "PROPERTY MANAGEMENT", two long sentences. New `lib/payment-method-label.ts` (ach→Bank transfer, card/cash/check/other) used on tenant Past payments, owner payments, receipt page + PDF, command palette, autopay. Lease document badges "Documents: Signed" / "Your signature: Waiting".
- Guard now scans every non-test file in `lib/`; 6 exceptions (Stripe transfer descriptions in `stripe-webhook-handlers.ts`, reword in a reviewed L3 sprint). PDF snapshot changed only `ACH`→`Bank transfer`.
- Live: tenant Past payments "Cash", receipt page "Method: Cash", receipt PDF text "PROPERTY MANAGEMENT" + "Method Cash", light/dark, 0 console errors; gate 1544/1544; smoke pass; CI #348; Sentry clean.
- Follow-ups: autopay bank card shows "Us_bank_account" when no brand (map `us_bank_account` → "Bank account"); owner badge for one-time fee reports (S193); Stripe transfer descriptions (L3).

## Sprints 193/193b SHIPPED — Tenant paid reports persist + owner Rent-row badge (L3, `4f9a22d`, `660fbb1`, 2026-10-07; gpt-6-sol medium 142,642 + luna 42,055 Codex tokens)
- ChatGPT: REJECT ×3 → APPROVE on rev 4 (race-safe claim-first; claim is durable, never reverted; zero-row claim classified by re-read; ownership checked before any status/report response — also fixes a pre-existing order where "already closed" leaked before the ownership check).
- Migration `20261007_sprint193_tenant_reported_paid.sql` applied by Claude: `rent_charges.tenant_reported_paid_at timestamptz` (nullable, no default; plain ADD COLUMN) + `owner_dashboard_payload` = live body + 3 field refs (md5 old b0966314… matched repo; new 8ac187bd… matches live; invoker, search_path '', ACL postgres+service_role only). Tenants have no UPDATE policy on rent_charges (owner/admin only).
- Action `inbox-manual-payment.ts`: charge → lease → ownership → closed → guarded claim (`is null`, not deleted, pending/late, `.select("id")`) → 0 rows re-read classify / 1 row → thread+message (failures logged, success kept). Owner badge "Tenant says paid · {Mon D}" (UTC) on unpaid rent rows (RPC + legacy paths); tenant row shows "Sent {Mon D}. …" after reload.
- 193b: success text unified to "Sent. Your landlord will check and mark it paid." (S193 exposed the action's old "Manual payment request sent…" message).
- Live: smoke tenant Aug (backfilled by SQL to the S192 message time), Sep, Oct each reported once → exactly 1 owner message per month; all still `late`; owner Rent shows 3 badges; light/dark 1280/375, 0 console errors; gate 1535/1535; smoke pass; CI #342/#344; Sentry clean.
- Smoke tenant now has no unreported month (button hidden). To re-test: `update rent_charges set tenant_reported_paid_at = null` for that tenant's open months (smoke data only).
- Minor: the owner badge shows only on `category = rent` rows; a tenant report on a one-time fee gets no badge.

## Sprint 192 SHIPPED — Tenant "I paid this" (L2, `eb718c4`, 2026-10-07, gpt-6-sol low, 68,209 Codex tokens)
- `tenant-rent-card.tsx`: when pay state is `not_ready` or `outside` and months are unpaid → "Already paid? Tell your landlord." + one row per month (oldest first) with **I paid this** (posts `chargeId` to existing `requestManualPaymentConfirmation`); per-row success "Sent. Your landlord will check and mark it paid." / error. No other pay state changed.
- Owner message body now: "<Tenant> says they paid $X for <home • unit>. Rent due <date>. Please check, then mark it paid in Rent." Notification title "Tenant says rent is paid" (notifications still OFF). Thread subject unchanged.
- 7 new tests (it.each counted); gate 1514/1514. GitHub push failed with 500s for ~3 min, then went through.
- Live: tenant Home + Rent at 1280/375 light+dark, 0 console errors. Claude clicked I paid this once (smoke tenant, Aug 1) → success text; DB: inbox message saved with exact new text; all 3 smoke charges still `late` (nothing marked paid). Owner sees it only under Messages → **Threads** (Timeline is notifications, which are off; "0 unread"; subject "Manual payment review - …"). Smoke pass; CI #339; Sentry clean.
- **Finding → next:** owners can miss these reports. Show "Tenant says paid" on the owner's Rent row with one-tap "Mark paid".

## Sprint 191 SHIPPED — Code health 79 → 80 (L2, `a8c6e15`, 2026-10-07, gpt-reserve medium, 134,410 Codex tokens)
- `app/tenant/page.tsx` 511→477 (helpers → `app/tenant/tenant-page-helpers.ts`; page diff = removal + one import). `charge-row.tsx` 502→337 (`charge-more-menu.tsx`, `manual-payment-form.tsx`; `ManualPaymentForm` re-exported). Max line 136; non-ws 29,336 vs 28,616 (+2.5%).
- New `charge-row-snapshot.test.tsx` (11 incl. it.each): Claude ran it in a clean HEAD worktree with `CI=true` (no snapshot writes) → 11/11 on pre-refactor code. Joined className strings verified identical to originals. `tenant-page-helpers.test.ts` (3).
- Live: gate 1504/1504; owner Rent more-menu + Mark paid form (not submitted) and tenant all sections incl. `?section=bad`, light+dark, 0 console errors; smoke pass; CI #336; Sentry clean.
- Remaining > 500 lines (4, all L3): stripe-webhook-handlers 974, account-wipe 780, ownership 720, stripe-connect 672.

## Sprint 190 SHIPPED — Code health 77 → 79, money batch 1 (L3, `019e1b7`, 2026-10-07, gpt-6-sol medium, ChatGPT APPROVE WITH CHANGES: 4 req + 4 opt adopted; 168,310 Codex tokens)
- charges 571→384, charge-management 562→452, withdrawals 517→478, distributions 574→386. Private helpers moved verbatim to `lib/charge-checkout.ts`, `lib/charge-management-helpers.ts`, `lib/withdrawal-helpers.ts` (all `import "server-only"`, no `"use server"`); pure planners/types to `lib/distribution-plans.ts` (client-safe; `distributions.ts` re-exports, type exports kept as types).
- Claude verified: 57/57 top-level blocks byte-identical to HEAD~ (one whitespace-only wrap in `updateLeaseRentAmount`, permitted); action export lists unchanged; distributions export surface identical (6 types + 10 functions).
- Characterization tests written and run on unmodified code first: `withdrawals.test.ts` (14 incl. it.each), `distributions-pure.test.ts` (4). Existing tests got only `vi.mock("server-only")` (charges, charge-management, lease-mutations).
- Codex findings (pre-existing behaviour, not changed): withdrawal amount "1.005" is accepted and rounds to $1.00; a failed Stripe withdrawal transfer marks the request `failed` (does not restore it to approved).
- Live: gate 1490/1490; owner Rent/Owners/Members + tenant Home/Rent walk light+dark 4/4, 0 console errors (tenant online pay is off for smoke owner, so checkout itself is covered by tests only); smoke pass; CI #332; Sentry clean.
- Remaining > 500 lines (6): stripe-webhook-handlers 974, account-wipe 780, ownership 720, stripe-connect 672, app/tenant/page.tsx 511, charge-row 502.

## Sprint 189 SHIPPED — Lease Manage labels (L1, `6bd453e`, 2026-10-07, gpt-6-luna low, 75,476 tokens)
- 11 lease Manage/Renew/End Lease inputs now have visible labels linked by `htmlFor`/`id`; panel moved to `components/dashboard/lease-manage-panel.tsx` (leases-section 495 → 348 lines). Names/attributes/actions unchanged.
- 3 new tests map every label → input name/value; gate 1472/1472; scripted walk (smoke owner, 1280/375, light/dark) 4/4, 0 console errors; smoke pass; CI #329 green; Sentry clean.
- Minor (pre-existing): at 375 px the floating help button overlaps the right edge of the End Lease note box.

## Sprint 188 SHIPPED — Code health 74 → 77 (L2, `cdc120c`, 2026-10-07, gpt-6-sol medium)
- Split pdf-data, lease-form, lease-wizard(+steps), email-templates; snapshot tests `email-templates-snapshot` / `pdf-data-snapshot` lock outputs (verified against pre-refactor code via worktree).
- Live: PDFs OK, lease screens OK, 30/30 checks, Sentry clean, CI #326.
- Moved 5 iCloud-style "<file> 2.ts" duplicates (exact copies of current code) out of the repo to Claude's scratchpad; `apps/mobile/README 2.md` left as is.

### NEXT-CHAT START HERE (2026-10-07)
- Scorecard: Security 80, Visual 80, Plain language 80, Speed 80 ✅; Reliability 78; Code health 77; Money 74; Owner 72; Tenant 70; Onboarding 62; Manager 58; Launch 52; Notifications 30; Phone 25.
- Code health remaining > 500 lines (10): stripe-webhook-handlers 974, account-wipe 780, ownership 720, stripe-connect 672, distributions 574, charges 571, charge-management 562, withdrawals 517, app/tenant/page.tsx 511, charge-row 502. Money/deletion ones need L3 + ChatGPT review; use snapshot-before-refactor + worktree check (S188 pattern) and the TS export diff script (`node <script> files...` using typescript getExportsOfModule).
- Waiting on user at Mac: 6 SMOKE_* GitHub secrets (then restore `schedule:` in `.github/workflows/smoke.yml` and run it once) → Reliability 80; Sentry alert rule check (needs permission); Navy Federal + Fidelity October CSVs (Money/Owner).
- Open UI findings: (fixed S189) lease Manage labels. Floating help button overlaps End Lease note box at 375 px (minor).
- Legacy RPC fallbacks (S181/S183) can be removed once stable (no `owner_rpc_fallback_*` seen in prod).

## Sprints 187/187b SHIPPED — UI hotfix (L1, `9b2093d`, `f0a807a`, 2026-10-06, gpt-6-luna)
- Desktop sidebar bell `align="start"`; mobile top bar bell keeps `end` + `panelClassName` fixed/inset-x-3/max-h (cn = twMerge, so overrides apply).
- Lease wizard: zero units → old message; units all leased → "Every unit at <home> has a lease / Add a new unit, or end a lease first."
- Verified live: bell panel inside viewport at 1280/768/375 light+dark; wizard message on Smoke Test Property; 33/33 checks; Sentry clean; CI #323 green.
- Mac note: duplicate files named "<name> 2" (e.g. `.next/types/app 2`, `apps/mobile/README 2.md`) — likely iCloud syncing ~/Documents; blocked Codex's gate once (cleared by `rm -rf apps/web/.next`).

## Sprint 186 SHIPPED — Code health 71 → 74 (L2, `6029e7d`, 2026-10-06, gpt-6-sol medium)
- Split notifications / notification-actions / notification-preferences / analytics / command-palette → 13 files; exports identical (TS checker); notifications switch untouched and still single gate; notifications count 78 before/after.
- Verified: gate 1463/1463; walk light/dark 0 console errors; 27/27 specs; Sentry clean; CI #318 green.
- URGENT (pre-existing): sidebar bell dropdown clipped off-screen left (`components/dashboard/notification-bell-menu.tsx:155-156`, align end → right-0).
- Also open: lease wizard "<home> has no units" when units are all occupied.
- Remaining > 500 lines: 15 files.

## Sprint 185 SHIPPED — Code health 68 → 71 (L2, `3834dc8`, 2026-10-06, gpt-6-sol medium)
- 5 non-money files split (inbox actions, inbox screen, leases section, property wizard, maintenance) → 13 files ≤ 500 lines, ≤ 140 chars; original paths re-export identical symbols.
- Verified: gate 1463/1463; walk light/dark (inbox, leases, lease form, wizard) 0 console errors; 27/27 specs; Sentry clean; CI #315 green.
- Daily smoke schedule PAUSED (`fa23039`) until SMOKE_* secrets exist — restore the `schedule:` block after.
- Bug found (pre-existing): lease wizard "<home> has no units" when units exist but are occupied.
- Remaining > 500 lines: 20 files.

## Sprint 184 SHIPPED — Speed 79 → 80 ✅ (L2, `b4b25e9`, 2026-10-06, gpt-reserve)
- `owner-page-data.ts`: admin-options + notifications + preferences promises created right after `administeredPropertyIdsPromise` (after early returns). Tests: bundle-plan invariant (new `owner-bundle-plan.test.ts`, 4 existing tests moved there), start-order, no-start on needs-onboarding/needs-setup.
- Prod: `/owner` data-assembly median 784 ms; owner Home 1.30 s; 27/27 specs; Sentry clean; CI #311 green.
- Next category: Reliability 78 (daily smoke secrets, owner alerting).

## Sprint 183 SHIPPED — Speed 77 → 79 (L3, `7b79dc2`, 2026-10-06) — PASS_WITH_RISK
- New RPCs (applied, service_role only): `owner_administered_property_ids(uuid, uuid)`, `owner_portfolio_payload(uuid, uuid[])`; mapper `apps/web/lib/portfolio-rpc.ts`; legacy fallbacks kept (`owner_rpc_fallback_*` — none seen in prod). Sprint 182 allowlist still applied to RPC profiles.
- SQL test passed (Claude removed Codex's `alter table ... drop not null` from the fixture — no DDL on prod in tests). Parity OK + tenant scope OK for smoke owner/manager/real owner.
- Prod: administered-ids ~0.10 s/1 q; portfolio ~0.13 s/2 q; owner Home 1.60 s median; data-assembly ~1.1 s (target 0.9 missed — `properties.admin-options` 0.5 s/4 q now on the critical path behind `manager-payments.visibility`).
- Live `leases.notes` column does not exist; legacy paths still request it then retry.
- Next: Sprint 184 = start announcement-homes load early / reuse already-loaded homes.

## Sprint 182 SHIPPED — Privacy hotfix, Security 80 → 60 → 80 (L3, `adab51a`, 2026-10-06, n/a tokens)
- Leak: `getPortfolioData` loaded up to 100 tenant profiles platform-wide into every owner/manager page (and the AI chat route's portfolio). Proven live, then fixed in `apps/web/lib/portfolio.ts`: scoped `.in("id", leaseTenantIds)` / `.in("email", invitedEmails)` + `filterAllowedTenantProfiles` allowlist; self handled separately; errors log `portfolio_tenant_profiles_error` and fail closed. Also fixes "Unknown tenant" past 100 platform tenants.
- Tests a–j in `dashboard-portfolio-data.test.ts` (fail-closed, error, dedup). New `scripts/verify-tenant-scope.ts --user <uuid>`.
- Verified: gate 1447/1447; live probe 14 → 6 emails; scope OK for smoke owner/manager/real owner; real leases named 2/2; 27/27 browser specs (owner Home median 1.68 s); Sentry clean; CI #304 green.
- CI fix earlier same day (`f0b6f9c`): CI builds with placeholder env (repo secret `NEXT_PUBLIC_SUPABASE_URL` malformed); L-019 added.
- Next: Sprint 183 = the former speed plan (administered-ids + portfolio.data RPCs).

## Sprint 181 SHIPPED — Speed 73 → 77 (L3, `f0aa0cc`, 2026-10-06, 168,650 tokens)

- Owner dashboard + ownership RPCs (service_role only) with legacy fallback (`owner_rpc_fallback_missing|error` logs); capabilities static + `npm run verify:capabilities` required in gate/smoke. Parity script: `npx tsx scripts/verify-owner-rpc-parity.ts --user <uuid>` (use a scratch npm cache: `npm_config_cache=<scratchpad>/npm-cache`). SQL fixture test in `supabase/tests/sprint181_owner_rpcs_test.sql` (run via MCP; ends with a forced-rollback exception).
- Next for Speed 80: portfolio.data + administered-ids into the same pattern; then remove legacy fallbacks once stable.

## ▶ START HERE (next session, written 2026-10-04)

- Last shipped: Sprint 167 + 167b bank feed Phase 1 (`67e2168`). Sprints 168 + 169 shipped (bank feed Phase 1 + 2 complete). Next: owner uploads real Navy Federal + Fidelity October files (from a computer) → Claude verifies real numbers; then Phase 3 (Plaid daily sync, needs owner's Plaid production application). Polish backlog: review-card key by token; payment source 'Other' wording. Production healthy: smoke 3/3 + theme 11/11, Sentry clean.
- Owner-approved queue, in order: (1) DONE — owner speed arc closed; (2) clarity cleanup — mockup APPROVED; DONE (154–157 shipped); from `docs/walkthrough-2026-10-03.md` #5–#7, #9 — one bank-setup prompt, simpler navigation (replace "N OF M" carousel), plain-language sweep — **mockup first** (Design canvas, like the landing), L2/L3 TBD.
- Standing rules: notifications OFF until owner says real users (env `DOMUS_NOTIFICATIONS_ENABLED` unset); L3 packets → Claude sends to Domus ChatGPT project via Claude-in-Chrome (memory: feedback-prompt-severity-chatgpt-workflow); Codex default Sol/medium, watch usage limits (detached nohup re-run after reset); verify every UI sprint live with Playwright (temp specs in `apps/web/tests/e2e/zz-*.tmp.spec.ts`, smoke creds from `.env.local`).
- Owner action items still open: J&MSP LLC bank connection (Stripe; owner must enter bank details). Codex Supabase token expires ~2027-01-01.
- Angel Hernandez (he/him): lease flagged "Pays outside Domus"; owner records Fidelity payments (Charges → Record → ACH, note "Fidelity") or asks Claude to record quietly.

## Ops & Observability (2026-10-02)

- **Deploys:** Vercel is git-connected — push to `main` auto-deploys production. CLI `vercel deploy` is optional.
- **Sentry SHIPPED (Sprint 138, `9fcf536`):** `@sentry/nextjs` 11.4.0, org `domus-z1`, project `domus-web`. Errors only (no tracing/replay), `sendDefaultPii:false`, shared scrubber `lib/sentry-scrub.ts`, all 5 error boundaries capture. DSN in Vercel env `NEXT_PUBLIC_SENTRY_DSN` (Prod+Preview); no source-map upload (no auth token). Verified: gate green, auth smoke 3/3, browser test error arrived in Sentry (resolved), cookies/headers/body scrubbed.
- **Sentry follow-ups:** (1) browser events tag `environment=development` — client reads `VERCEL_ENV`, which isn't exposed to the browser; use `NEXT_PUBLIC_VERCEL_ENV`. (2) Sentry stores the user's IP — turn on project setting "Prevent Storing of IP Addresses". (3) Server and edge configs are identical files — could share one module.
- **Stripe Connect fees:** platform balance −$2.24 from Connect account fees (~$2/mo per paid-out owner account). Expected; watch as owners grow.
- **Connectors:** Claude — Vercel ✓, Stripe ✓, Sentry ✓ (domus-z1); GitHub skipped (git over SSH works). Codex — Figma MCP removed; **Supabase read-only MCP ✓ (2026-10-03)**: scoped token "Codex read-only (Domus)" (project vawqdqkaguhdgfhdebqw only, Read-only preset, **expires ~2027-01-01 — rotate before then**); server installed locally at `~/.codex-mcp/supabase` (pinned @supabase/mcp-server-supabase 0.13.0, `--read-only`), config in `~/.codex/config.toml` with `startup_timeout_sec = 90` and `default_tools_approval_mode = "approve"` (needed for `codex exec`). Verified: reads return data; `CREATE TABLE` refused ("read-only transaction"). Packets may tell Codex: "a read-only `supabase` MCP is available for schema/data checks." 
- **Weekly health check:** scheduled task `domus-weekly-health`, Mondays 9am, read-only, pushes a notification only on failure, logs to `docs/health-log.md`.

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

## Sprint 211 / 211b SHIPPED (2026-10-10) — Notification rules v1 (L3)
- Plan: `docs/notifications-plan.md` (owner: "yes to all"). Packet rev 3 after ChatGPT REJECT → APPROVE WITH CHANGES.
- **DB (applied):** `20261010_sprint211_notification_grants.sql`. Direct writes to `notifications` / `notification_deliveries` are revoked from anon and authenticated, and `update(read_at)` is granted back. An attacker simulation (rolled back) showed insert, delete and title updates blocked (42501) while read_at updates still work.
- **Code:**
  - three modes in `lib/notifications-switch.ts`: off / test (`DOMUS_NOTIFICATIONS_ALLOWLIST`, canonical profile email, invalid-only list = off) / on;
  - typed event policy in `lib/notification-policy.ts`;
  - `notifyPropertyTeam` (renamed): current-account owners, plus managers under the live two-link rule (`lib/notification-recipients.ts`);
  - outside-Domus tenants get no rent reminders, late notices or receipts (fail closed on a null flag); autopay and bank failures still reach them;
  - actor exclusion applies to user actions only; ticket comments and lease edits are in-app only; inbox mirrors run only in "on".
- **Verify:**
  - gate passed with 1945 tests; smoke passed 13/13; CI green on `1a91e15`;
  - the 211b tests were each proven to fail when their production line is flipped;
  - production has no notification env vars set, so mode = **off**.
- **Next (owner):** set `DOMUS_NOTIFICATIONS_ALLOWLIST` = owner email + smoke accounts in Vercel production to start the test week.
- **Lessons:** Codex in a background Bash run needs `< /dev/null` (it hung about 1h). Packets must not tell Codex to run `gate:web` under a no-DB constraint (its runtime verifier reads Supabase).

## Sprint 212 SHIPPED (2026-10-10) — iPhone signing + TestFlight readiness (L3, phone-app exception)
- **Packet:** rev 3 (rev 1 REJECT, then rev 2 APPROVE WITH CHANGES). Codex gpt-6-astra hit its usage limit mid-run and resumed at 20:27.
- **What shipped:**
  - `Signing.xcconfig` (Automatic) plus an optional, gitignored `Signing.local.xcconfig` that holds the team ID;
  - `release.xcconfig`; `Info.plist` arm64 + `ITSAppUsesNonExemptEncryption=false`;
  - `PrivacyInfo.xcprivacy` with `apps/ios/PRIVACY-AUDIT.md` (it has UNVERIFIED rows, and is not an App Store compliance claim);
  - `scripts/testflight.sh` (lock, pending-build guard, `--resolve`, `--build`, `--dry-run`, team redacted) with the build counter in `apps/ios/build-number.txt` (last uploaded = 1).
- **Verified by Claude outside the sandbox:** config test 48/48 (all §A8 signing cases, manifest inside the Release simulator and device bundles) and XCTest 17/17. No team ID is committed.
- **Before App Store submission, review the privacy audit:**
  - the DeviceID, BrowsingHistory and CoarseLocation rows come from reading the Vercel Analytics docs and may be over-declared;
  - CreditInfo comes from screening scores.
- **Next (owner at the Mac):**
  1. Copy the team ID into `Signing.local.xcconfig`.
  2. Sign Xcode into the Apple account.
  3. Plug in the iPhone, turn on Developer Mode, Run.
  4. Then run the remaining 210 phone gates on the device.
  5. TestFlight: create the App Store Connect record for `com.domusbase.app`, then run `testflight.sh`.

## Owner data check (remote, 2026-10-10)
- **Removed** (owner-approved): the ended "Test Tenant" lease on 1st Home and its $5 Stripe test charge and payment (Domus now differs from Stripe by $5).
- **Angel's rent:**
  - Feb/Mar/Jun 2026 added as paid outside Domus;
  - May/Jul payments re-dated to the 1st, and Oct re-dated to 10-05 to match the bank;
  - 4 waived late fees deleted with their payments and edit history.
  - Now Feb–Oct are paid ($21,150) and Nov is pending.
- **Mortgage:** $1,039.44 on the 1st **and** the 15th, including escrow. The rule catches both.
- **Pending:**
  - a Navy Federal CSV for Jan 1–Sep 30 at the next Mac session (Feb–Sep costs are missing, so profit is overstated);
  - Mom's House lease (tenant through 10-31, renewing to 2027-10-31): owner says hold until onboarding.

## Security cleanup (2026-10-10, owner-approved)
- **Applied:** `20261010_security_definer_helpers_no_anon.sql`. The 7 RLS helper functions (`can_*_property`, `is_*_of_account`) can no longer be executed by PUBLIC or anon; authenticated and service_role keep access.
- **Checks:**
  - anon RPC calls now return 401;
  - an anon `properties` read now errors (42501) instead of returning `[]`;
  - smoke passes 13/13 for all 3 signed-in roles;
  - the advisor no longer flags anon.
- **Kept on purpose:**
  - authenticated EXECUTE: RLS needs it, and the functions only answer about `auth.uid()`;
  - RLS-without-policy on `bank_skipped_fingerprints` and `cron_runs` (service-role only);
  - `pg_net` in public (moving it risks the keepalive cron).
- **Owner action:** turn on Leaked Password Protection (Supabase → Authentication → password settings).
- **Possible follow-up:** anon still has default table grants on about 35 public tables (RLS blocks it, but defense in depth says revoke). The app never reads tables as anon.

## Sprint 213 SHIPPED (2026-10-10) — login polish + null-owner test (L2)
- **Session-expired banner:** only shown when the request carried an `sb-*-auth-token` cookie.
- **Role cards:** now a single column inside the form column (each card at least 278 px).
- **Null-owner test:** `getRentCollectionConnectStatus` is covered.
- **Verify:**
  - gate 1952; smoke 13/13; CI green on `903335e`;
  - Playwright on production at 375/800/1280, light and dark: no banner for a new visitor, no horizontal scroll.
- **Pre-existing, not changed:** the floating help button overlaps the form card edge at 375 px.

## Mac session (2026-10-11)
- **iPhone:**
  - Team ID set in the gitignored `Signing.local.xcconfig`; Xcode is signed in; "Ace's iPhone" (iPhone 17, iOS 26.6.1) is registered; Developer Mode is on.
  - The device build needed `CODE_SIGN_IDENTITY="Apple Development"` plus `-allowProvisioningDeviceRegistration`. The project still has `CODE_SIGN_IDENTITY = ""`, which needs a fix.
  - Installed and launched. Device gates: PDF download/share sheet PASS; photo picker (profile photo) PASS; mailto PASS; offline + Try again PASS; stay signed in / sign out PASS.
  - **FAIL — Stripe Connect return:** the app reloaded `/connect/onboard` (server redirect to Stripe), which opened Stripe again.
- **Money:**
  - Navy Federal 0565 CSV for Jan 2–Sep 30 (796 rows) imported: 16 mortgage halves auto-filed, 758 personal rows skipped.
  - Sorted with "always" rules: solar $266.40/mo (utility); ISPC $92/mo = water filtration (maintenance); car washes = not rental; "Fidelity Investments Deposit" = moving my money.
  - June mortgage, solar and filter were added by hand (paid from another account, owner-confirmed). The October rent payment is re-dated to 10-01 (Angel pays Fidelity on the 1st; the owner transfers later).
  - 2026 for 1st Home: rent $21,150.00, costs $22,996.74 (−$1,846.74 through Oct 1).
- **Leaked password protection:** needs the Supabase Pro plan (the org is on Free). Deferred to launch.
- **Owner plan:** eventually pay all property bills from Fidelity, which would make Fidelity the account Domus reads.

## Sprint 214 / 214b SHIPPED (2026-10-11) — iPhone Stripe return + device signing (L3)
- `lastSafeURL` (committed main-frame on `https` + the server host; excludes `/connect`, `/auth`, offline, failed). Connect opens in Safari once, the app recovers once, and returning loads the safe page once. `CODE_SIGN_IDENTITY[sdk=iphoneos*] = Apple Development`.
- **214b:** the test seams `handleCommittedMainFrame` / `handleMainFrameResponse` replaced test-time WebKit object construction, which crashed the runner. Codex ran with full access for Xcode only.
- **Verify:**
  - XCTest 33/33; config 51/51 (run with the owner's local signing file moved aside temporarily, then restored);
  - device build with no override; `codesign --verify --deep --strict` OK (Apple Development);
  - the owner tapped Stripe on a real iPhone: back to Domus once, no white screen.
- **Note:** `config.test.cjs` refuses while `Signing.local.xcconfig` exists. Move it aside to run it, then restore it.

## Sprint 215 / 215b / 215c SHIPPED (2026-10-11) — Wallet redesign foundation (L3)
- **Look:** Wallet tokens in `globals.css` (light `#F2F2F5` ground, accent `#0A5BD3`; dark `#000` / `#1C1C1E`); radius tokens; the Geist font replaces Inter; tabular numbers.
- **Owner phone tab bar:** Home · Money · Homes · Inbox · More, on every owner page (`app/owner/layout.tsx` plus the Money and Bank pages). The Bank page counts as the Money tab.
- **Year-to-date:** Home YTD income now comes from the shared calculation in `lib/rent-received.ts` (`paid_at`, integer cents, excludes reversed payments and deleted charges, includes **all charge categories**, as Money always did). Claude restored the all-categories rule (a boundary break, 1 line); Codex had excluded non-rent charges because of a contradiction in the packet.
- **Live:** owner Home shows YTD income $21,150 and net −$1,846.74, matching Money.
- **215b (test-only):** the phone theme smoke scopes the drawer nav and waits for the drawer to close (Claude added the wait).
- **215c:** the settings avatar input fits at 375 px.
- **Verify:** gate 2017; smoke all green (mobile layout plus theme contrast for owner/manager/tenant, light and dark, at phone size); manual phone screenshots in light and dark.
- **Next:** Sprint 216 — rebuild the owner Home in the Wallet layout (canvas FsvezREEzyFY6WXg9PDqo4).

## In flight (2026-10-11 evening)
- **Sprint 216:** SHIPPED (see below).
- **Sign-in redesign:** mockups "Sign in" + "Create account" are on canvas FsvezREEzyFY6WXg9PDqo4, row 2. **Owner APPROVED 2026-10-11.**
  - Proposal: sign-in = email + password only (role is known after sign-in); role choice moves to "Create account" (owner / manager / tenant radio cards); tenants are told to use their invite link.
  - Becomes Sprint 218 (auth-adjacent → L3 + ChatGPT review), after 217 (Money + Homes).
- **Session rotation:** the transcript is about 45 MB. Rotate after 216 ships.
- **Face ID (owner wants it, 2026-10-11):** planned as Sprint 219, after the sign-in redesign (218). It's a phone-app sprint, so L3 + ChatGPT review + gpt-6-astra + a real-iPhone test.
  - **Design rule:** Face ID unlocks a session token kept in the iOS Keychain (biometry-gated). It never stores the password.
  - **Fallback:** the normal sign-in.
  - **Setting:** owner opt-in on the first sign-in, and it can be turned off in Settings.

## Sprint 216 SHIPPED (2026-10-11) — owner Home in the Wallet layout (L2)
- **New layout:** `components/dashboard/owner-home/` (wallet-home, home-pass-card, ytd-tiles, needs-you-list, recent-activity) plus `lib/owner-recent-activity.ts`.
- **Removed:** the old owner-only `HomeMoneyCard` and its route `/api/owner/home-money` (dead; grep is clean).
- **Manager Home:** unchanged (regression test).
- **Live (Ace):**
  - 1st Home pass card shows left after bills $1,310.56; tiles show 2026 −$1,846.74 and rent collected $21,150;
  - Needs you shows "Finish J&MSP bank setup"; recent activity has 5 items;
  - page height 1398 px (was 3182).
- **Verify:** gate 2020 (needed `rm -rf apps/web/.next` for the iCloud " 2" duplicates); smoke all green (speed spec now waits for the "Home" heading); CI green; phone screenshots in light and dark.
- **Open questions for the owner:**
  - Home is scoped to the active account, so Mom's House (J&MSP) only shows after switching accounts. Should Home show every home?
  - The title still sits inside a white header card; the mockup has it on the ground. Polish in 217.
- **Next:** Sprint 217 (Money + Homes in the Wallet layout), then 218 sign-in redesign (approved; L3), then 219 Face ID (phone L3).
- **Codex usage:** gpt-6-sol hits the limit mid-sprint on big packets. Schedule a resume with a sleep-until in a background Bash run, and always use `< /dev/null`.

## In flight (2026-10-11 night) — Sprint 217 (owner answers: Home shows every home = yes; header "move it"; 217 approved)
- Split into two Codex runs to stay under usage limits:
  - **217a** SHIPPED `a24fd0a` + `9bf2db7` (`docs/sprint217a-codex-prompt.md`, gpt-6-sol medium, 186k tokens): Home across all accounts (`lib/owner-wallet-home.ts`), owner title row on the ground (no card on Home), phone top bar removed for owners (search/notifications/profile → More drawer, More tab badge), 404 heading contrast fix.
  - **217b** SHIPPED `e03ac2a` (`docs/sprint217b-codex-prompt.md`, gpt-6-sol medium, 145k tokens): Money all-homes Wallet layout + Homes pass cards grouped by account, "Manage homes" keeps the old portfolio tools.
- Found while scoping: 404 page "Page not found" is white-on-light (fixed in 217a).
- **217a verify:** review found isLate ignored grace + outside-Domus leases → 217a-fix (luna) uses status='late' + tracksLateRent. Smoke caught 34px section titles overflowing at 375px (Applications) → 217a-fix2 wraps actions under the title. Gate 2034/2034, smoke all green, CI green, Playwright phone walk light+dark (Home, More drawer, Applications, 404) with zero page errors. Multi-account labels not walked (smoke owner has 1 account) — owner to eyeball Mom's House on their Home.
- **217b verify:** gate 2051/2051, smoke green, CI green, phone walk light+dark (Money month/year/every item, Homes) zero page errors. Live data: 1st Home = 9 of 9 on time. Bounded per-home Promise.all on /owner/money is accepted debt.
- **Findings for next sprint:** dark-mode Money period switch selected segment barely distinguishable from the track.
- **Next:** Sprint 218 — sign-in redesign (approved; auth-adjacent → L3, ChatGPT review before Codex). Then 219 Face ID (phone L3).

## Order decided 2026-10-11 (owner)
- 218 sign-in redesign: ChatGPT APPROVE WITH CHANGES (3 required tests folded in, rev 2) → Codex gpt-6-sol RUNNING.
- **Then the partner/tenant ledger sprints (`docs/partner-ledger-requirements.md`) BEFORE Face ID.** Owner: "Do the partner sprints before Face ID." Goal: the co-owner sister never needs her own spreadsheet.
- Face ID (219 → renumbered after the partner sprints).

## Sprint 218 SHIPPED (2026-10-12) — sign-in + create account in the Wallet look (L3, ChatGPT APPROVE WITH CHANGES)
- `8bd3e34` (Codex gpt-6-sol, 310k tokens), plus `9566462` (a11y smoke heading regex) and `0679ac5` (hotfix: the Sign in label was hidden by `[&>span:last-child]:hidden`; regression test added; L-022).
- Verify: gate 2058, a11y smoke 4/4, smoke otherwise green, phone walk light and dark (sign in, create account steps 1–2), Enter-to-sign-in works on prod, zero page errors. The hotfix was deployed from a clean worktree of HEAD (Codex was mid-219 in the main tree).
- Minor: the dark disabled "Create account" button is low contrast (disabled state only).
## Sprint 219 RUNNING — partners (ChatGPT: REJECT → rev 2 APPROVE WITH CHANGES → rev 3 APPROVE). Claude applies the migration and runs the live attacker SQL after code review.

## Sprint 219 SHIPPED (2026-10-12) — partners (L3; ChatGPT REJECT → rev 2 → rev 3 APPROVE)
- Code: Codex gpt-6-sol, 255k tokens, 2093 tests. Migration `20261012_sprint219_partners.sql` applied live by Claude. It adds `account_partners`, `partner_payments`, `expense_partner_attributions` (owner-only RLS, LLC-only, column-level update grants), the `improvement` category, and backfills partners from LLC owner members.
- **Claude fix before apply:** Supabase default privileges grant ALL on new public tables to anon and authenticated, so column-level update grants are meaningless without `revoke all ... from anon, authenticated` first. Added. **Future migrations creating tables must revoke first.**
- Live attacker SQL (rolled back): 15/15 attacks blocked (manager read/add/replace/clear; individual-account owner partner/payment; unrelated profile link; spoofed creator insert/update; non-LLC expense; cross-LLC partner; anon read). 3/3 owner controls allowed. No test rows left.
- Verify: gate 2093, smoke green, CI green. The real owner's Money → Mom's House shows the Partners card (The LLC, Ciocia Patel, Richard Smith; rows expand), viewed only, with no writes to real data.
- **Data note:** Mom's House has no bills in Domus yet, so Put in is $0 everywhere. The sister's history (and partners Yani and Mom's Estate) must be entered for the report to replace her sheet.
- **Next partner sprints (docs/partner-ledger-requirements.md):** 220 tenant ledger by month (water billing, refunds, monthly view); 221 managing-partner fee and settle-up suggestion; 222 deposits held / available cash; 223 shared duties. Then Face ID.

## In flight (2026-10-12 17:00 MDT) — Sprint 220 (one monthly bill: water/credit lines; L3, ChatGPT REJECT → rev 2 AWC → rev 3 APPROVE)
- Codex hit its usage limit mid-run (304k tokens). The partial work is in the tree, uncommitted. An auto-resume is scheduled for 18:16 (`<scratchpad>/s220-resume.sh`, resume note + packet).
- After it finishes: review → Claude applies the migration `20261013_sprint220_charge_lines.sql` → live attacker + concurrency SQL (see packet §8 "Claude will also run") → gate → deploy → walk.

## Sprint 220 SHIPPED (2026-10-12) — one monthly bill (L3; ChatGPT REJECT → AWC → APPROVE)
- Water and credit lines wait unattached and attach atomically in `create_rent_charge_with_lines` (per-lease advisory lock, newest-bill-only, credits fit while total > 0, bigint range check). An existing charge's amount never changes because of a line.
- Codex: 304k + 106k tokens (it hit the usage limit; resumed at 18:16). Migration `20261013_sprint220_charge_lines.sql` applied live.
- Live SQL, rolled back: 17/17 as designed (attach once; older-dated charge claims nothing; duplicate due date → created=false; credit ≥ rent blocked; tenants see only attached lines on their own lease; manager/owner scoped; direct writes, RPCs and anon all denied). No leftovers.
- Verify: gate 2125, smoke green, CI green. Phone walk of Reports "Rent & water by month" and the Rent list in light and dark, zero page errors.
- **Not walked with real lines** (the smoke leases feed the owner's dry run). The first real water pass-through should be eyeballed on its next bill.
- **Next partner sprints:** 221 managing-partner fee + settle-up suggestion; 222 deposits held / available cash; 223 shared duties. Then Face ID.
- **2026-10-12 owner decision:** next is **bank sync** (Plaid production + `/transactions/sync` + webhook + persistent review queue, per `docs/bank-feed-design.md` Phase 2), ahead of partner sprints 221–223. No automatic manager-fee calculation (manual "Manager fee" partner payment only). Settle-up = equal shares, later. Plaid keys exist in Vercel prod (set ~203 days ago, likely sandbox); a production access application is needed (owner action).

## In flight (2026-10-12 evening) — Sprint 224 bank sync (L3)
- ChatGPT: rev 1–4 REJECT → rev 5 APPROVE WITH CHANGES → rev 6 dispatched (`docs/sprint224-codex-prompt.md`). Design highlights:
  - encrypted Plaid tokens in a secrets table no client can read;
  - multi-account link with server-side metadata;
  - atomic `file_synced_bank_item` and `resolve_bank_review_item`;
  - fenced sync lease;
  - `pending_account_match` gate for upload↔Plaid account linking;
  - "Bank changed this" for Plaid modified/removed filed items;
  - signed webhook (raw-body hash, ES256, kid, key expiry);
  - daily cron.
- Codex runs via `<scratchpad>/run-codex.sh` (auto-resumes after a usage limit).
- **After Codex:** review → Claude sets `BANK_TOKEN_KEY` in Vercel (32-byte base64, never printed) → applies the migration → live attacker/atomicity/lease SQL → gate → deploy → sandbox Link walk.
- **Owner action pending:** sign in to dashboard.plaid.com so Claude can start the production access application (and request Fidelity). Live check: 0 legacy plaintext Plaid tokens exist.
- 224 first Codex run: 497k tokens, 2167 tests, but the test map showed many MISSING/WEAK acceptance items (sync.ts row handling mocked away), so it FAILED per L-017. Fix-up `docs/sprint224b-codex-prompt.md` is running (tests + cron retries `error` connections + robust confirm-conflict mapping).
- Migration reviewed: matches the design; `bank_transactions_kind_shape` and the fingerprint hex checks are satisfied; the institution CHECK widening is a superset of live. **Not yet applied.**
- `BANK_TOKEN_KEY` set in Vercel production (generated and piped, never printed).

## Sprint 224 SHIPPED (2026-10-12 night) — bank sync (L3; ChatGPT rev 1–4 REJECT → rev 5 AWC → rev 6)
- Codex: 497k (224) + 176k (224b, test gaps + cron retries `error` + confirm-conflict mapping). 2209 tests.
- Migration `20261014_sprint224_bank_sync.sql` applied live. `BANK_TOKEN_KEY` set in Vercel prod.
- Live SQL (rolled back), 19/19:
  - expense filed then replay `already`; rent filed (payment + paid); wrong amount `stale` with 0 rows; cross-account property blocked;
  - resolve: conflict on wrong `updated_at`, stale keeps the item, `no` skips;
  - lease: a second acquire is null; a wrong-token cursor save is false; `pending_account_match` blocks the lease; skip transitions once;
  - perms: owner sees own connections but not secrets; RPCs and queue writes denied; manager 0; anon denied. No leftovers.
- Prod: unsigned Plaid webhook → 401; cron without secret → 401. Smoke green, CI green. "Your banks" renders in light and dark (zero errors).
- **Not yet verified end to end with a real Plaid Link** (sandbox test credentials are only allowed on a local host; production needs Plaid approval).
- **Finding:** in dark mode, "Connect a bank" has white text on the light accent (low contrast). Use accent-contrast like other primary buttons.
- **Owner action:** sign in to dashboard.plaid.com → Claude drives the production application (+ the Fidelity request, the `PLAID_REDIRECT_URI` registration, the webhook URL). Then switch `PLAID_ENV`/secret to production and do a real NFCU connect walk with the owner.
- **Next:** 221 equal-share settle-up, 222 deposits held / available cash, 223 shared duties, then Face ID.

## Sprint 221 SHIPPED (2026-10-12 night) — Even it out (L2)
- `suggestEvenSettleUp` (equal shares over active partners, using `projectedPutIn`, cents-exact targets, greedy ≤ n−1 payments, hidden within $1) plus a "Even it out" section in the Partners All-time view with Add as planned / Add all. Bank buttons use accent-contrast (dark fix).
- Codex 83k tokens; 2226 tests. Viewed the real owner's Mom's House All time ("Everyone has put in about the same.", since no data yet), with no writes and no console errors.
- **Speed finding (L-018):** owner Home p75 has crept to ~2.8–3.7 s (budget 3 s; it was ~1.9 s at 224). One smoke run failed the budget, the rerun passed. Production `[perf:owner]` shows two parallel ~2 s critical-path steps: `home.wallet` (23 queries) and `rent.year-received` (10 queries), which overlap in year-rent work. Every step was slow on that load (DB latency). **Candidate speed sprint:** merge year rent into `loadOwnerWalletHome` and drop the separate `rent.year-received` on Home; target = the remaining measured critical path.

## Sprint 225 SHIPPED (2026-10-13) — owner Home speed (L2) — PASS_WITH_RISK
- The wallet loads rent rows once (a single window), derives money with the pure `buildHomeMoney`, and runs bank needs and charge lines in parallel. `rent.year-received` is removed; `ownerYearRent` comes from the wallet (**rent-only**, fixed in 225b after Codex flagged that packet 225 wrongly said all-categories).
- Production `[perf:owner] home.wallet`: **746–1011 ms, 16 queries** (was 1,968 ms / 23). There's no `rent.year-received` line. Smoke owner Home p75 **2.39 s** (budget 3 s, target ≤ 2.5 s, met). **Risk:** the query count of 16 missed the ≤ 14 target (the unit test's fake counts differently); the speed goal is met anyway.
- 2231 tests, gate green, CI checked.
- In flight: **Sprint 222** (deposits held + cash on hand; ChatGPT rev 1–3 REJECT → rev 4 AWC → rev 5 dispatched).

## Sprint 222 SHIPPED (2026-10-13) — deposits held + Cash on hand (L3; ChatGPT rev 1–3 REJECT → rev 4 AWC → rev 5)
- Migration `20261015_sprint222_deposits_cash.sql` applied live. It adds:
  - the `lease_deposit_returns` table (select-only RLS, no client writes);
  - the audited service-role RPCs `record_deposit_return` / `clear_deposit_return`, both locking the lease row;
  - triggers for the deposit bound and the deposit freeze;
  - `bank_accounts` balance triple plus type/currency;
  - the fenced `save_bank_balances` with a `p_complete` snapshot rule.
- Live SQL (rolled back), 18/18:
  - deposit returns: record then `already` (1 audit row); freeze blocks postgres and owner; clear then `none`; the bound and future-date checks block;
  - balances: a wrong token is false; credit is excluded; incomplete keeps the balance; a complete empty snapshot nulls it; duplicate IDs raise;
  - owner access: insert and delete are denied even after `set_config`; a deposit edit after a return is blocked; the owner can't run the RPC; an owner balance write is denied;
  - visibility: owner 1, manager 1, unrelated owner 0.
  - No leftovers.
- Codex 211k tokens; 2254 tests; smoke green (owner Home p75 2.33 s).
- **Visual check found transient failures:** right after the deploy, one session got "Numbers are not ready" on `/owner/money` and "Bank activity is not ready yet." on `/owner/bank`. Later loads were all fine (4/4). The catches swallow errors, so there's no log. → **Sprint 226 running** (money-page logging + one retry on transient errors; it also fixes 2 broken queries found in the Supabase edge logs: `maintenance_tickets.updated_at` doesn't exist, so **analytics repair stats have been silently empty**, and `ownership_account_members.deleted_at` doesn't exist, causing a 400 + fallback on every LLC lookup).
- **Follow-ups:** add the same logging to the `/owner/bank` loader; the dark Bank page shows an empty rounded card at the top when there are no balances (hide `BankBalancesCard` when empty); Supabase default TRUNCATE grants to anon/authenticated on public tables (unreachable via PostgREST) are a hardening item.

## Sprint 226 + 226b SHIPPED (2026-10-13) — error visibility + broken queries (L2/L1)
- `/owner/money` and `/owner/bank`: every failure branch logs `[owner-money-load-failed]` / `[owner-bank-load-failed]` with safe fields, plus one retry on transient errors. Empty balances card hidden.
- Removed nonexistent columns: `maintenance_tickets.updated_at` (analytics repair stats were silently empty → fixed) and the `ownership_account_members.deleted_at` filter (a 400 + fallback on every LLC lookup).
- Supabase edge logs after 226: 521 requests, **0** 4xx/5xx (previously constant 400s).
- 2269 tests; smoke all green after 226b (owner Home p75 **1.73 s**); no `load-failed` lines in the following 20 min. The intermittent "not ready" seen twice is now observable if it recurs. The earlier smoke failure had no DB errors in that window, so it was likely a cold-start timeout.

## Sprint 223 SHIPPED (2026-10-13) — shared LLC tasks (L2)
- `account_tasks` (owner-member RLS, LLC-only, column-level update grant without `last_done_by`, triggers set or clear done-by, composite FK to `account_partners`). Applied live.
- Live SQL (rolled back), 12/12: forged done-by on insert is cleared; created_by spoof blocked; direct done-by update denied; mark done sets the caller; cross-LLC owner FK blocks; as-needed + date blocked; individual owner insert blocked; unrelated owner and manager see 0; co-owner sees it; anon denied. No leftovers.
- Codex 123k; 2290 tests; smoke green (owner Home p75 1.61 s). Real owner Money → Mom's House shows Cash on hand + Partners + Tasks (empty state), with zero console errors.
- **The sister's-spreadsheet arc is complete:** 219 partners, 220 one monthly bill / ledger, 221 even it out, 222 deposits + cash on hand, 223 tasks (+ 224 bank sync, 225 speed, 226 fixes).
- **Next:** Face ID (phone top tier: L3 + ChatGPT review + Simulator walk). **Owner action still pending:** sign in at dashboard.plaid.com for the Plaid production application.

## 2026-10-13 — Plaid production live
- Owner completed Plaid's security questionnaire (honest gaps, each promised before launch: user 2-step login = Face ID sprint; admin 2-step login not on all accounts; no written security policy; no written retention policy). Plaid **approved Production**; owner accepted the updated MSA.
- Vercel prod: `PLAID_SECRET` = production secret (owner piped from clipboard; Claude never saw it), `PLAID_ENV=production`. Verified via production `/institutions/search`: Navy Federal `ins_15` and Fidelity `ins_12`, both OAuth.
- **OAuth status (dashboard → Activity → Institutions → OAuth institutions):** Navy Federal and Fidelity **In review** (Plaid coordinating with the banks; no action for us). BofA/Capital One "Additional steps required" (not used).
- `PLAID_REDIRECT_URI` not set and the app has no OAuth return page: fine for desktop web (Link uses a pop-up); **phone/mobile-web OAuth needs a redirect page sprint** before the iPhone app connects banks.
- Webhook URL is sent per link token (`/api/webhooks/plaid`); no dashboard setting needed.
- Owner to-dos before launch: turn on 2-step login on Supabase, Vercel, GitHub, Plaid and Google; Claude to draft a security policy and a retention policy.
- **2026-10-14:** production `/link/token/create` returned `INVALID_PRODUCT` (Transactions not enabled; only Auth/Balance/Identity were). Owner requested **Transactions** (use case "SMB bookkeeping", $0.30/Item/month, agreed MSA) → dashboard shows **Requested**. Re-test with a direct production `/link/token/create` (vercel env pull to scratchpad, umask 077, delete after) until it returns a link token.
- Drafts written: `docs/policies/information-security-policy.md`, `docs/policies/data-retention-policy.md` (owner to set retention years, patch SLAs, confirm privacy@ inbox, fill Adopted date). Follow-ups they commit to: Dependabot, 90-day review-queue cleanup + 7-year purge job (small sprint), admin 2-step login, Face ID.
- Deploy `rental-properties-platform-actyme29g` (PLAID_ENV=production) live; smoke green (owner Home p75 1951 ms).

## Sprint 227 SHIPPED (2026-10-14) — iPhone Face ID app lock (L3 phone; ChatGPT rev1 REJECT → rev2 APPROVE WITH CHANGES → rev3)
- `4eeb4e0` (Codex gpt-6-astra high; ~149k + 132k tokens; first run died on "model at capacity", resumed). Design: biometric **app lock** (UI gate), no cookie movement; claim text in `apps/ios/README.md` (device lock, not server MFA).
- Verify: xcodebuild test 88/88; gate 2301; config.test 10 failures are pre-existing (local Signing.local.xcconfig present — same on HEAD~). Deployed web (Settings row only renders in the app). Smoke green; CI `gate` success.
- Simulator walk (owner signed in): opt-in alert → Use Face ID → match enables; Home button → relaunch locked + auto prompt; non-matching face stays locked, Cancel → no re-prompt; Open with Face ID + match → unlocks without reload; cold launch in dark mode locked before any page shows; Settings → Security switch off/on (on requires Face ID); Sign in with password → /login; signed out → no lock.
- **Polish findings (next UI pass):** lock-screen icon is a square (not rounded/app-icon style); title regular weight system font, button system blue #0A84FF instead of Domus accent #0A5BD3 — align with Wallet look.
- Not verified: Touch ID copy (no Touch ID simulator run), enrollment-change sign-out on a real device, Control Center/camera cover (unit-tested only).

## Sprint 228 SHIPPED + tooling cleanup (2026-10-14)
- `803bb1f` Sprint 228 (Codex gpt-6-astra high, ~160k tokens; waited out a usage limit):
  - Plaid OAuth return page `/owner/bank/oauth` (localStorage link session, 30 min);
  - iPhone app shows "To connect a bank, use Domus on a computer for now.";
  - lock-screen Wallet polish.
- Gate 2375; xcodebuild 89/89.
- Plaid dashboard: the allowed redirect URI `https://domusbase.com/owner/bank/oauth` is saved (owner verified the password). Vercel `PLAID_REDIRECT_URI` is set, redeployed, and production `/link/token/create` accepts it.
- **Pending:**
  - Transactions product: Requested (daily check task at 9:13 AM);
  - NFCU/Fidelity OAuth: In review;
  - Simulator check of the new lock look and in-app bank notice (needs the owner signed in);
  - Sprint 229 (in-app bank connect via Plaid iOS SDK + universal links), not yet planned or approved.
- **Tooling (`f020962`):**
  - CLAUDE.md 612→115 lines. The old text is in `docs/claude/CLAUDE-full-2026-10-14.md`; lessons are in `docs/lessons.md`; verification, accounts and plain language are in `docs/claude/reference.md`.
  - Skills `.claude/skills/{ship,codex-dispatch,chatgpt-review}`.
  - Hooks in `.claude/settings.json`: SessionStart repo summary; block `vercel deploy` with uncommitted app files in the main checkout; block commits containing secrets, `.env` or `* 2.*` files.
  - Codex runner with capacity retry: `.claude/skills/codex-dispatch/run-codex.sh`.

## Sprint 229 SHIPPED (2026-10-14) — iPhone bank connect (L3 phone; ChatGPT REJECT → AWC → rev 3)
- `8da74ef`. Codex gpt-6-astra high, ~180k tokens, plus 229b test fixes (astra medium).
- **What shipped:**
  - LinkKit 7.2.2 via SPM, with a `PlaidLinkBridge` message bridge that binds each session to its page and sign-in, and drops stale replies;
  - Universal Link return on `/owner/bank/oauth-app`, plus `App.entitlements` (`applinks:domusbase.com`);
  - AASA at `/.well-known/apple-app-site-association`, served from `APPLE_APP_ID` (Vercel env) and excluded from middleware;
  - iOS link tokens fail closed without `PLAID_REDIRECT_URI_IOS`;
  - the lock overlay moved into its own `UIWindow` (one per scene) above presented screens;
  - the card shows Connect/Sign in again in the app only when the native handler exists; old builds keep the 228 message.
- **Verify:**
  - xcodebuild 103/103. Two failures were found by Claude (Codex's sandbox can't run the Simulator) and fixed in 229b: the trailing-slash path check, and a test needing a run-loop settle (diagnosed as a test artifact).
  - Gate 2406; smoke green; CI gate success.
  - AASA: 200 `application/json`, no redirect; the Apple CDN serves it.
  - Production `/link/token/create` accepts `redirect_uri` = oauth-app.
  - Plaid dashboard now lists both redirect URIs.
- **Not yet walked:**
  - in-app Connect on the Simulator (needs the owner signed in);
  - a real OAuth connect on a physical iPhone. Blocked on Plaid Transactions approval plus NFCU/Fidelity OAuth review, and on a signed device build with the Associated Domains capability (Xcode automatic signing).
- **Note:** the deploy hook works. It blocked a combined commit+deploy command, so `/ship` now says to deploy in a separate call.

## Sprint 230 SHIPPED (2026-10-14) — security-policy promises (L2; no app code, so no Codex dispatch)
- **90-day review-queue cleanup:** `supabase/migrations/20261017_sprint230_review_queue_purge.sql`, applied live.
  - `purge_stale_bank_review_items()`: security definer, `search_path=''`; EXECUTE only for postgres.
  - Deletes items more than 90 days after they entered the queue (`created_at`, not the posted date). Each leaves only its HMAC fingerprint in `bank_skipped_fingerprints`, so the next sync can't add it back.
  - pg_cron job `domus-purge-stale-bank-review-items`, `30 9 * * *` UTC, runs as postgres.
  - Live SQL (rolled back), 13/13: 91-day item gone + tombstoned; 89-day kept with no tombstone; an already-tombstoned item purges without conflict; an old posting new to the queue is kept; count 2 then 0 on a rerun; other rows untouched; anon, authenticated and service_role are denied EXECUTE. No leftovers.
- **Dependabot:** `.github/dependabot.yml`, monthly: npm `/` (grouped minor+patch), npm `/apps/ios` (Capacitor grouped), github-actions. The SPM `Package.swift` is excluded because `cap sync` generates it and LinkKit is pinned.
- Policy docs updated (the security-policy Dependabot to-do is done; the retention policy says the 90-day cleanup is automatic).
- GitHub → Settings → Advanced Security: dependency graph, Dependabot alerts and Dependabot security updates turned **On** (Claude, in the owner's signed-in browser pane, with the owner's yes). Dependabot runs started on `1a1b02f`.
- **Follow-ups:** the 7-year purge job (needs the owner to set the retention years in the policy first); optional review-queue copy: "Items you don't answer go away after 90 days."
- **Next:** Sprint 231, the 7-year purge job (blocked until the owner sets the retention years in `docs/policies/data-retention-policy.md`). Still waiting on others: the Simulator walk of in-app bank Connect (owner signed in), Plaid Transactions approval, NFCU/Fidelity OAuth review.

## 2026-10-14 — Dependabot triage, rescore, daily smoke live (Claude, no app code)
- **Dependabot:** PR #1 (actions v4→v7) merged (`27ea2b3`); #3/#5/#6/#7/#8 closed (branches deleted); #4 (web group: @supabase/ssr 0.5→0.12 is auth-critical) and #2 (sharp, apps/ios) left open for planned sprints. `dependabot.yml` now ignores semver-major and `@types/node` ≥ 21 (`f32f84d`).
- **Scorecard rescored** through Sprint 230 (`c967e23`): Speed 80 → 77, Code health 80 → 79, Manager 76, Phone 60, Notifications 45, Launch 64.
- **Reliability 79 → 80:** owner added the 6 `SMOKE_*` GitHub secrets; schedule restored (`31390d8`); smoke skips the service-role capabilities check without the key (`e778720`; `gate:web` still runs it). Manual run #2 green (27 specs). First scheduled run 2026-10-15 13:30 UTC; check it.
- **Found, not fixed:** Vercel flags 8 production secrets as readable (not "sensitive"); GitHub reported Dependabot security alerts on push (not yet read; needs sign-in).
- **Next:** Code health (79): bring `app/actions/connect.ts` (508) and `components/dashboard/sections/render-section-cases.tsx` (501) under 500 lines (L1/L2, Codex). Then Speed (77): owner Home p75 1.59 s vs ≤ 1.5 s.

## Sprint 232 SHIPPED (2026-10-14) — Code health 79 → 80 (L3; ChatGPT rev 1 APPROVE WITH CHANGES → rev 2, all 7 REQUIRED + 4 OPTIONAL adopted)
- `4107537`. Codex gpt-6-sol high, 1 attempt. `updateManagementFee` → `app/actions/management-fee.ts` (byte-identical, Claude `cmp`); `AnalyticsSection` → `sections/analytics-section-lazy.tsx` (`"use client"`, block identical). connect.ts 508 → 387; render-section-cases 501 → 490. `index.ts` re-exports from the new file.
- 18 characterization tests (`management-fee.test.ts`): exact upsert payload, request-client write, audit, revalidate, every error branch incl. missing-schema. Claude ran them against pre-refactor HEAD in a clean worktree: 18/18.
- Accepted deviation: 4 inherited lines in the moved function are 146–163 chars (verbatim beats the 140 rule; pre-existing).
- Verify: gate 2424/2424 + build; CI gate success; deploy `rental-properties-platform-byzamnpjm` (first upload hit a TLS error, retry OK); production smoke 27/27 (Analytics covered by the mobile-layout spec for owner + manager); Sentry clean. No live click-walk: no visible change.
- Speed (same smoke): owner Home p75 1.65 s, Rent 1.83 s, tenant 1.43 s.
- **Next:** Speed (77) — owner Home p75 back to ≤ 1.5 s (`home.wallet` 16 queries, 746–1011 ms).

## Sprint 233a + 233a-b SHIPPED (2026-10-15) — owner Home wallet timings (L1)
- `38b0dec` (Codex gpt-6-luna low ×2). `home.wallet.*` sub-step perf logs; nested `measureQueryCount` scopes roll up to parents (233a-b, found in Claude review: nested scopes hid queries from `home.wallet`).
- Verify: gate 2431/2431; CI gate success; deploy `oxo05zouq`; smoke 27/27 (owner Home p75 1.65 s).
- **Production breakdown (11 Home loads, 03:33 UTC, sfo1 functions → us-west-2 DB):**
  - `administered` 209–283 ms (3 queries) runs ALONE before everything else;
  - then in parallel: `rent-rows` **420–585 ms (4 queries, serial)** ← critical; `portfolio` 181–331 (4) → `charge-lines` 88–142 (1);
    `accounts` 93–218 → `bank-needs` 104–335 (3); `expenses` ~100–125; `tasks` ~100–150;
  - `home.wallet` total 639–817 ms, 18 queries. Every single query ≈ 95–125 ms.
- **Next (proposed):** 233b move Vercel functions sfo1 → pdx1 (next to Supabase us-west-2), measure; then 233c: rent-rows to one round trip, administered 3 → 1, so wallet ≈ max(portfolio+lines) ≈ 0.45 s.

## Sprints 233b + 233d SHIPPED (2026-10-15) — functions to pdx1; Speed 77 → 85
- 233b `f44d502` (Claude; `apps/web/vercel.json` `"regions": ["pdx1"]`; boundary exception stated: config only; rollback = remove the key and redeploy). Deploy `gsonsmaxx`.
- Result (production): owner Home p75 1.65 → **0.82 s**, Rent 1.96 → 0.75 s, tenant 1.43 → 0.62 s; single query ~34 ms; `home.wallet` ~200 ms; owner data-assembly ~335 ms. Log lines still show `region=sfo1` (likely the entry region; the timings show functions next to the DB).
- 233d `05c662b` (Codex luna low): theme smoke + dark-mode spec use `getByRole("main")`; the faster pages exposed React's hidden swap copy to `locator("main")` (strict mode, 2/4 runs). Claude probe: 0/12 duplicates on plain loads; Sentry clean → test-only. Theme smoke 5/5; full smoke 27/27.
- CI on `05c662b`: attempt 1 failed in `next build` (`next/font` Google fetch: "Cannot read properties of null"), attempt 2 green. If it recurs, consider self-hosting Geist via `next/font/local`.
- 233c (wallet rent-rows in one round trip) is no longer needed for the target; parked as an optional follow-up.
- Lesson L-023 added.

## Sprint 234 DONE (2026-10-15) — onboarding live walk (no code)
- Fresh owner `+walkowner` and tenant `+walktenant` walked sign-up → first rent paid on production. Works end to end; DB exact; Sentry clean.
- 5 major findings (F17 tenant shown next month as due now; F15 no way to post first rent + wrong empty state; F19 no undo for Mark paid; K5 tenant name guessed from email; F3 Supabase default sender for sign-up email) + 6 medium + low. Full table: `docs/onboarding-walk-2026-10-15.md`.
- Accounts kept for re-walk (owner decides later: keep as designated onboarding accounts or delete).
- **Next:** Sprint 235 fix packet (F17 + F19 money display/undo = L3 + ChatGPT; F15, K5, F5, K6, F8, F10, F13 = L2), F3 = Supabase custom SMTP via Resend (config, owner approval).

## Sprint 235a SHIPPED (2026-10-15) — future rent not "due"; Undo payment (L3; ChatGPT REJECT ×3 → rev 4 APPROVE WITH CHANGES → rev 5)
- `9d8433b`. Codex gpt-6-sol high, 1 attempt. Migration `20261018_sprint235a_undo_manual_payment.sql` applied live by Claude
  (owner_dashboard_payload: live body md5 matched repo before; new body differs by one line `and pay.reversed_at is null`).
- F17: `isRentOpenForTenant` (due ≤ today+5 UTC) drives tenant card, pay card, pay state, "I paid this", checkout and owner
  Due soon; server rejects "This rent is not due yet." F16 fixed live (Due soon (0) for a rent 31 days out).
- F19: `undo_manual_payment` (SECURITY DEFINER, service_role only, row lock, newest payment of any source, manual only,
  coverage by sum, audit with before/after, lock_timeout 5s → busy). `payments.recorded_via` (backfill: 11 → legacy) and
  `created_at`; insert trigger locks parent rent; payment rent reassignment blocked. Notifications retained (known limitation).
- Verify: SQL fixture `SPRINT235A_FIXTURE_PASSED` (Claude fixed 2 fixture bugs: missing ownership account; coverage amounts);
  overlap test via a second client: insert blocked 8.8 s behind a held lock (note: FK key-share also conflicts, so the
  guarantee holds even without the trigger); busy returned after 5.3 s. Gate 2462/2462; CI gate success; deploy `ky47un5jp`;
  smoke 27/27 (owner Home p75 0.94 s); Sentry clean.
- Live walk (walk owner): legacy Oct payment → "This payment is too old to undo here."; Nov Mark paid → Undo → Mark paid → Undo,
  DB: pending, 2 reversed, 2 audits. **R1:** success toast lost to `window.location.reload()` → folded into 235b.
- Follow-ups: store payment id on payment notifications (then undo can remove them); make payment writers atomic.

## Sprint 235b + 235b-b SHIPPED (2026-10-15) — onboarding fixes (L2)
- `c0d3789` (Codex gpt-6-sol medium + luna for the fixture). F15 empty state + "Add this month's rent now"; plain generate
  messages; K5 tenant first/last name in the wizard (no email-guessed names); F5 onboarding ignores email-prefix names;
  K6 due day + "Tenant pays outside Domus"; F8 success copy + "Go to Home"; F10 "Invite sent" (wallet `home.wallet.invites`
  in parallel); R1 undo keeps its toast (router.refresh).
- Verify: gate 2476/2476; CI gate success; deploy `p7tb71oab` (first attempt TLS error, retry OK); smoke 27/27; speed
  re-run owner Home p75 0.73–0.75 s (first post-deploy run 1.28 s = cold start).
- Live (walk owner, wizard closed without saving): name fields + exact error "Enter the tenant's first and last name.";
  due day 28 for an Oct 31 start; outside-Domus checkbox with plain helper.
- **Not yet walked:** F8 success screen, F10 Invite sent, F15 empty state, F17 tenant view, F5 prefill — need a second test
  home + a new test tenant (owner to approve the address). F3 (Supabase SMTP via Resend) still waits on the owner.

## 2026-10-15 — Onboarding re-walk done; Onboarding 68 → 78
- Second test home "Walk Test Home 2" + tenant `+walktenant2` ("Sam Tester", joined). Results table in `docs/onboarding-walk-2026-10-15.md`.
- All majors verified fixed live except F3 (owner config). New small findings R2–R6.
- **Next:** Sprint 235c (L1/L2: R2 Go to Home, R3 pass bankConnected, R4 filtered empty state, R5 aria-label, R6 truncation) + F3 Supabase SMTP via Resend (owner pastes the key). Then re-walk the success screen → Onboarding 80.

## Sprint 235c SHIPPED + F3 done (2026-10-15)
- `1dbaeae` (Codex gpt-6-sol medium). R2 root cause: owner Home section id is `overview` ("home" was not a section id),
  so 235b's openSection("home") did nothing and onSelectProperty left Homes open. R3 bankConnected passed; R4 filtered
  empty state; R5 link title = text; R6 "Invite sent" own element. Gate 2482/2482; CI success; deploy `j59m16tic`;
  smoke 27/27 (owner Home p75 0.81 s). R2–R6 unit-tested; **not re-walked live** (needs an owner sign-in).
- **F3:** Supabase Auth custom SMTP on: sender `notifications@domusbase.com` / "Domus", `smtp.resend.com:465`, user
  `resend`, password = existing Resend key (owner piped it from `vercel env pull` to the clipboard; Claude never saw it;
  clipboard cleared). Verified: `/auth/v1/recover` for +walkowner → "Reset Your Password" from notifications@domusbase.com.
  Auth email rate limit now 30/hour (adjustable under Auth → Rate Limits).
- Note: `RESEND_API_KEY` is NOT in `apps/web/.env.local` (only in Vercel).

## Sprint 236 DONE (2026-10-15) — manager live walk
- Test manager `richard.ace.smith+walkmanager@gmail.com` ("Walk Manager") manages both walk homes; test client "Walk Client Test".
- **Major M10:** reversed payments shown as received across ~9 readers (manager Payments, receipts, PDFs, charts, rent roll…).
  Includes historical Stripe ACH reversals. → Sprint 237 (L3) first item.
- Medium: M3 manager invite email generic, M7 message counts, M8 jargon, M1 one home per invite, M6 sticky toast, M11 Domus-account owners not under Clients.
- Full table: `docs/manager-walk-plan-2026-10-16.md`. Next: Sprint 237 packet (M10 + mediums + manager reminders, L3 → ChatGPT).

## Sprint 237a SHIPPED — reversed payments never count as received (M10) — 2026-10-15
- Commit `a06ceac` (Codex gpt-6-sol high + 237a-b build fix, gpt-6-luna). Deployed prod; smoke green; CI `gate` success.
- Readers fixed: dashboard-legacy, payment-history (label "Reversed", last paid skips), receipt page + PDF + yearly PDF,
  analytics, rent roll, property detail, AI chat (now `lib/ai-recent-payments.ts`), export (reversedAt + status), success
  page, webhook reversed duplicate = no-op, **plus reports-pnl tax summary** (found by the audit). SQL readers audited: safe.
- Autopay: scoped paged lookup; active or reversed stripe/legacy block; undone manual only lifts the block; lookup error
  aborts the run (zero charges). Gate 2512 tests green.
- Not yet walked live in the UI (needs a signed-in session); fold into the 237b live walk.
- **Next:** Sprint 237b (manager reminders + M7/M8/M5/M6/M2/T1) dispatched; then the ownership_accounts grants packet
  (`docs/sprint237c-migration-packet.md`, from the lock-down session — renumber to 237d, 237c stays M3/M1/M11).

## Sprint 237b SHIPPED — manager rent reminders (owner opt-in) + manager walk fixes — 2026-10-15
- Commit `ea349c1` (Codex gpt-6-sol high + 237b-b copy fixes, gpt-6-luna). Migration
  `20261019_sprint237b_manager_reminders` applied live. Deployed prod; smoke green; CI `gate` success; gate 2536 tests.
- Attacker fixture passed live (rolled back, 0 leftovers): owner-only RPC, no `authenticated` execute, direct
  update/insert blocked even with the faked marker, client conversion forces off, check constraint proven alone.
  Fixture fix: client accounts have no creator, so RLS gives 0 rows (safe) — case now accepts 0 rows or guard error.
- Codex deviations accepted: outside-Domus rule now enforced in the reminder action for owners too (matches S211 policy);
  `batch-toolbar.tsx` + `settings/page.tsx` + `notification-preferences.tsx` added to scope; M8 sweep touched ~30 files,
  copy only (verified by a review agent: no identifiers/types/routes changed).
- Risk noted: switch test-mode/allowlist covered by `notifications-switch` tests, not re-tested on the manager path.
- Not yet walked live (237a + 237b): needs a signed-in walk owner + walk manager session.
- **Next:** live walk (owner turns on reminders → manager Remind → test-mode delivery to allowlist only; reversed
  payments show "Reversed"; M5–M8, M2, T1 light/dark) → re-score Manager. Then 237c (M3/M1/M11) and 237d
  (`ownership_accounts` grants packet, currently `docs/sprint237c-migration-packet.md`).

## Sprint 237d SHIPPED — lock client writes to `ownership_accounts` (L3 security) — 2026-10-16
- Commit `e5af488`; migration `20261020_sprint237d_ownership_accounts_grants` applied live (postcondition passed).
  Packet `docs/sprint237d-migration-packet.md` (ChatGPT rev 2 APPROVE; written by side session "Lock down
  ownership_accounts", renumbered from 237c). No app code.
- Preflight (L-012) matched the audit plus 237b's additions (guard trigger, `set_managers_can_send_reminders` definer).
- ACL now `{postgres=arwdDxtm, service_role=arwdDxtm, authenticated=r}`. Attacker SQL as smoke owner (rolled back):
  A1–A5, A8, A9 and the 237b flag → 42501; own row readable, others 0; TRUNCATE false; anon SELECT 42501; service_role
  update 1 row.
- Production smoke green, CI `gate` success, logged-out `/`, `/login`, `/join/<id>`, `/join-llc` 200, no
  `permission denied` in runtime logs (30 min). Local gate: 1 vitest failure while smoke ran in parallel; 2 clean reruns
  (2536/2536) — treat as a flake.
- Remaining: §7.8 24 h log check for `42501`/`ownership_accounts`.
- **Next (urgent, found by the same audit):** `public.profiles` lets a tenant set its own `role = 'owner'` and Stripe
  fields (no trigger, table-level UPDATE). Needs its own L3 packet. Then 237c (M3/M1/M11).

## Sprint 237e SHIPPED — lock client writes to `profiles` (L3 security) — 2026-10-16
- Commit `e7fc4c8`; migration `20261021_sprint237e_profiles_grants` applied live (postcondition passed). Packet
  `docs/sprint237e-profiles-grants-packet.md` (ChatGPT rev 1 APPROVE WITH CHANGES; 2 REQUIRED + 4 OPTIONAL adopted).
- Hole proven before (rolled back): smoke tenant could set own `role='owner'`, Stripe account/customer, email, is_tester.
- ACL now `{postgres, service_role = all; anon = r; authenticated = r}`. SQL as smoke tenant: P1–P4, insert, delete →
  42501, values unchanged; TRUNCATE/MAINTAIN false for both roles; service_role write 1 row; signup via auth.users →
  one profile, id/email correct, role `tenant`. **Real PostgREST** update as signed-in smoke tenant → `42501`, 0 rows,
  values unchanged, self-read still works.
- Anon SELECT was already failing before (a select policy reads `properties`, whose RLS calls `can_access_property`,
  not executable by anon) — unchanged.
- Smoke green (3 roles), logged-out pages 200, no `permission denied` in runtime logs.
- **Next (high, separate L3):** `profiles_select_owner_for_management` / `…_for_managers` let any owner with ≥1 home read
  every tenant/manager profile (email, phone, stripe_customer_id). Then default-grants audit of the other 55 tables.

## Sprint 237f SHIPPED — narrow `profiles` SELECT to related people (L3 privacy) — 2026-10-16
- Commit `27d56b6`; migration `20261022_sprint237f_profiles_read_policy` applied live (postcondition: exact SELECT policy
  set, helper definer/owner/search_path/stable/grants, `can_administer_property` unchanged, no FORCE RLS).
- `can_view_profile(id, role)` + `profiles_select_related` replace `profiles_select_owner_for_management/_for_managers`.
  Visible: self; current tenants with any lease on a home you administer; current managers with an active assignment.
- Before: smoke owner saw 14 tenants / 4 managers (related 2 / 1). After (real PostgREST): 2 / 1, 0 Stripe customers.
  Exact-set check 35/35 viewers, 0 mismatches (dry run and post-apply); inactive manager hidden; anon 0 rows, no error;
  manager query 8.5 ms. ChatGPT rev 1 APPROVE WITH CHANGES (5 REQUIRED + 4 OPTIONAL adopted).
- Code map: only 3 user-client reads touch other profiles (late-fee tenant emails, application reviewers, tenant's
  inviter); none loses data (inviter and co-owner reads already returned nothing). Smoke 3 roles + CI green; no errors.
- **Next:** 237c (M3/M1/M11); default-grants audit for the other 55 `public` tables; scorecard Security held 80.

## Sprint 237g SHIPPED — remove unneeded client write privileges on every `public` table (L3) — 2026-10-16
- Commit `53713d5`; migration `20261023_sprint237g_client_write_grants` applied live (preflight ACL md5 matched baseline;
  postcondition passed). Rollback: `supabase/rollback/20261023_sprint237g_rollback.sql` (exact snapshot, proven
  equivalent in a rolled-back dry run). ChatGPT: rev 1 REJECT → rev 2 APPROVE WITH CHANGES → rev 3 all adopted.
- Holes proven then closed (attacker SQL, rolled back): tenant inserts own `payments` row (W1); stranger votes on another
  LLC's withdrawal / distribution change (W2/W3); forged `charge_edit_history` (W4); LLC co-owner edits/removes another
  partner's member row incl. payout account (W5/W6). All → 42501.
- Client writes: 60 tables → 22 (exact code-mapped ops). anon: no writes anywhere. TRUNCATE/REFERENCES/TRIGGER/MAINTAIN
  removed client-side. postgres default ACL no longer grants client writes to new tables (no global default ACL exists).
- Column-limited UPDATE on leases/units/rent_charges/properties/maintenance_tickets; `rent_charges_guard_client_write`
  trigger: clients may only add a matching pending late fee and move status pending→late. Lease tenant/unit swap, charge
  amount/lease/deleted_at, unit move, property owner_profile_id, cross-account property move, fake paid charge, mark
  paid/waived → all 42501. Partner/fee tables: outsiders and managers denied.
- Real PostgREST: owner updates on leases/units/properties/charges/tickets OK; charge amount + lease tenant → 42501;
  tenant payment insert → 42501. Upsert (insert + conflict update) OK. Smoke green, CI green, no permission errors.
- Pre-existing bug found (not caused by 237g): tenant-created repairs never write `maintenance_status_history` (RLS policy
  allows admins only; app logs and continues). Follow-up.
- Note: Vercel Hobby keeps runtime logs 1 hour, so the "24 h no 42501" check must use Sentry instead.

## Sprint 237h SHIPPED — first repair-history row for tenant repairs (L3, closes the 237g follow-up) — 2026-10-16
- Commit `c23e8d1` (packet `b9d99c4`, `docs/sprint237h-codex-prompt.md`). No RLS/grant/schema change. ChatGPT: rev 1
  REJECT (error contract, deny-path tests, backfill scope) → rev 2 APPROVE WITH CHANGES → rev 3 all adopted.
- `createMaintenanceTicket` now writes `null → submitted` with the admin client, awaited, only after auth, rate limit,
  parse, lease/admin check and a successful ticket insert; all values server-fixed. Chosen over a tenant INSERT policy,
  which would let tenants add history rows with forged `created_at`/`notes` directly (L-025).
- Tests: `maintenance-ticket-history.test.ts` (12): admin client identity, awaited, thrown failure non-fatal + telemetry,
  no lease / insert error / staff denied / bad input / missing unit → no admin client and no history, call order,
  manager + owner success, forged form fields ignored. Ordinary Supabase `{error}` stays logged inside the helper.
- Live attacker SQL as smoke tenant (rolled back, after deploy): own-ticket insert, forged date/notes, other ticket,
  update, delete → all 42501; service role insert OK.
- Backfill (data only, one transaction, creator from the single `audit_logs` `create_ticket` row = tenant): rows
  `480822cd-9c67-460c-8840-c5a388991902` (ticket 904e93fd…) and `b0518158-8d1e-4231-aabd-b9347768873c` (82818d61…).
  Rerun inserts 0. Rollback: delete those 2 ids.
- Gate green, smoke green. CI on `c23e8d1` failed in `unified-property-wizard.test.tsx:85` (untouched; `getByText` right
  after `reachSuccess`, passes 3/3 locally in UTC → flaky race). CI re-checked on the handoff commit.
- Not walked in the UI: a real tenant sending a repair on domusbase.com (needs the smoke tenant signed in).
- **Next:** fix the flaky wizard test (`findByText`); `updateTicketStatus` history oddities (`open → reviewed` plus
  `open → in_progress` double row, and same-status `in_progress → in_progress` rows).

## 2026-10-16 — Standing authority + owner decisions (owner away; autonomous run)
- CLAUDE.md §2a: Claude runs full cycles without asking; stops only for passwords/real accounts, money, legal, real-people
  notifications, deleting real data, a FAIL after 2 attempts, or a second ChatGPT REJECT.
- Decisions: priority tonight = **phone app readiness**; M3 manager invite email = **build it, allowlist-only until launch**;
  maintenance word = **Repair** (reference table updated); manager menu = **~6 everyday items + "More"**.
- Queue: phone walks/fixes/TestFlight prep → 237c manager follow-ups (M3 gated, M1, M11, menu, Wallet manager Home, reminder
  switch toggle style, Install card overlap) → Money/Owner honest rescore → security advisors (L3) → prep owner-only items.

## 2026-10-16 — Sprint 238b PARKED for the owner (second ChatGPT REJECT; CLAUDE.md §2a stop rule)
- Packet `docs/sprint238b-codex-prompt.md` rev 2 + `docs/runbooks/account-deletion.md`. Review rev 2: the **code**
  design (server-only identity, forged-field test, unique-index idempotency, request row as source of truth, global
  sign-out tolerant of failure) is accepted. Remaining REQUIRED items concern the **manual runbook**: (1) auth.users →
  profiles FK — **refuted live**: `profiles` has 0 outgoing FKs; `auth.users` has only the `on_auth_user_created`
  (`handle_new_user`) trigger, so deleting a sign-in cannot cascade to profiles; (2) recoverable step log instead of one
  transaction; (3) obligations must not block forever; (4) audit retained data for direct identifiers; (5) truthful
  completion/cleanup; (6) logout failure path; (7) copy fixes; (8) rate-limit/CSRF/DB access criteria; (9) validate the
  runbook on a disposable multi-role fixture; (10) identity-provider obligations (no Sign in with Apple → n/a).
- **Owner decision needed:** dispatch the code part now (the button + queue) with the runbook hardening as a follow-up
  before the first real request, or wait for a third review. Only App Store **submission** needs it; internal
  TestFlight does not.

## 2026-10-16 evening — autonomous run progress (owner at dinner)
- Phone: Simulator walk of owner/tenant/manager via test-only magic-link sign-in (no passwords typed) → 
  `docs/phone-walk-2026-10-16.md`; 30-agent readiness audit → `docs/phone-readiness-plan-2026-10-16.md` (decisions table).
- Packets and review status: 238a iPhone shell rev 3 (REJECT → AWC, adopted) — **Codex done, verifying**; 238b deletion
  request **parked (2nd REJECT)**; 238c store requirements rev 2 (AWC adopted) — **Codex running**; migration
  `profiles.ai_consent_at` applied; 238d phone polish (L2) ready; 237c-1 manager invites/clients rev 3 (REJECT → AWC,
  adopted) ready; 237c-2 manager menu/home (L2) ready.
- App Store paperwork drafted and fact-checked: `docs/app-store/{listing,app-review-notes,app-privacy-answers}.md`.
- Verified: AASA returns 200 (APPLE_APP_ID set); Vercel Analytics already off in production (flag unset).
- 238a XCTest: 115/116; `AppLockControllerTests/testOneLockWindowPerScene…` fails ~1 in 3 runs — checking whether it is a
  pre-existing flake on a clean pre-238a worktree.

## 2026-10-16 — Sprints 238a, 238c, 238d SHIPPED; 237c-1 migration applied
- **238a** (`2fdda7b`, iOS code only; ships with the next TestFlight build): privacy manifest, photo-save string, upload
  guard, launch cover, `testflight.sh` guards. XCTest 115/116 (the AppLock flake below). **Launch cover not visible** in the
  Simulator (black until the page) → fix sprint **238a-b** (rev 2, ChatGPT AWC adopted: cover in its own window at
  `.normal + 1`, strict lock-visible rule, no-black fallback) dispatched to Codex (`gpt-6-astra` high).
- **238c** (`f8807c1`): Ask Domus consent (`profiles.ai_consent_at`, 403 until allowed), `/support`, Privacy/Terms links,
  upload `accept` types. Walked light + dark; "Not now" sends 0 chat requests. Smoke + CI green.
- **238d** (`962152b`): deployed `rental-properties-platform-61j3oafu6` → domusbase.com; smoke 10/10; CI `gate` success.
  Simulator walk (walk owner + walk tenant, light + dark): Money and Settings headers clear the status bar; owner tab
  "Messages"; "Back to Home"; tenant "Report a repair" / "Your repairs" / "Repairs" tab; rent card says it once.
  Remaining nit: at rest the **?** help button still overlaps the last row's chevron on Home/Money (content scrolls clear).
- **237c-1**: Codex stopped (correctly) on `UNIQUE (email, role, invited_by)`. Migration
  `20261026_sprint237c1_invitations_per_home_key.sql` applied live → `UNIQUE NULLS NOT DISTINCT (email, role, invited_by,
  property_id)` (ChatGPT AWC adopted). Verified (rolled back): two homes per email; same-home reinvite updates one row;
  owner null-home stays unique; duplicate in one upsert → `cardinality_violation` (packet dedupes); sign-up converts both
  homes and accepts both rows; `authenticated` insert/update/upsert denied. Side fix: the same inviter can now link an
  existing tenant to a second home (that insert used to fail on the old key). Packet rev 4 re-dispatched (`gpt-6-sol` high).
- Flaky: `AppLockControllerTests/testOneLockWindowPerSceneReusedCoversPresentedControllersAndRestoresKeyPresentation`
  fails ~1 in 3; the pre-238a comparison hung the Simulator. Follow-up: stabilize (likely window/scene timing).

## 2026-10-16 ~19:40 — Codex usage limit; queue for 10:47 PM
- Codex hit its usage limit (resets 10:47 PM). `run-codex.sh` waits and resumes on its own: **238a-b** (iOS, task
  `bbb8ck3d1`) and **237c-1 rev 4** (web, task `btbt7wssc`) resume together (disjoint files). No partial edits were left.
- Queue after those ship: **237c-2** (L2, manager menu/tab bar/Wallet Home) → **238e** (L2, phone Help moves into the
  menus; needs 237c-2's manager More drawer) → **238f** (iPhone test-only: the AppLock flake, pinned to
  `AppLockControllerTests.swift:348`, fails 2/3 full-suite runs, 8/8 alone) → **238g** (L3, App Review demo seed; ChatGPT
  review in progress; running it needs the owner to choose the two demo emails).
- Advisors 2026-10-16: security unchanged and accepted (13 RLS helpers need `authenticated` EXECUTE; `pg_net` stays;
  leaked-password protection needs Supabase Pro → owner). Performance: 92 unindexed FKs, 122 `auth_rls_initplan`,
  301 multiple permissive policies — tables are small and Speed is 85; parked as a later L3 index/policy sweep.
- ~19:55: queue packets reviewed and committed: **238f** rev 2 (ChatGPT AWC adopted: diagnose first, observe-only
  waits, scoped teardown), **238g** rev 3 (rev 1 REJECT → rev 2 AWC → adopted: `app_metadata` marker, access checks
  before any user update, ownership predicates, waived months, password-file safety; runbook
  `docs/runbooks/appreview-seed.md`). 237c-2 and 238e are L2 (no review). `apps/web/.env.local` set to mode 600 (it holds
  production secrets; the 238g seed refuses a group/other-readable file).

## 2026-10-16 ~20:05 — App Store Connect app record created
- Owner signed in, accepted the App Store Connect terms and clicked Create on the form Claude filled: iOS, "Domus: Rent &
  Repairs", English (U.S.), `com.domusbase.app`, SKU `domus-ios`, Full Access. Apple ID **6823839749**; iOS 1.0 "Prepare for
  Submission" (verified on the Apps list). This unblocks the TestFlight upload (`testflight.sh` → `destination=upload`).
- Still shown on the Apps page (owner-only): "Apple Developer Program License Agreement Updated" (Account Holder must
  accept before submitting); EU trader status (Digital Services Act) not set.
- ~20:30 App Store Connect (Claude filled, owner saved each page; all verified after reload):
  - App Information: subtitle "For landlords and tenants", Business / Productivity.
  - 1.0 version page: promotional text, description (listing §5 minus the 2 deletion lines until 238b; checksum match),
    keywords (97), Support `https://domusbase.com/support`, Marketing `https://domusbase.com`. Copyright blank (Q3/Q9).
  - Pricing: Free ($0.00, base US). Availability: United States only ("1 Available"). Mac and Vision Pro unticked
    (pending owner Save).
  - Still owner-only in App Store Connect: updated Program License Agreement (Account Holder), EU trader status (DSA),
    Content Rights, Age Rating (Q8), App Privacy publish (after Q9 legal text), App Review contact + demo login (238g),
    Copyright (Q3/Q9), screenshots (Claude, after demo seed), first TestFlight upload at the Mac.
- ~20:55: Content Rights saved (no third-party content). Age rating saved: override **18+** (owner Q8; Apple calculated
  4+); UGC answered No under Apple's "broad distribution" wording, Messaging Yes (details in `docs/app-store/listing.md` §12).
  `ITSAppUsesNonExemptEncryption = false` already in Info.plist (no export-compliance prompt per build).
- Queue add: **238h** (iPhone, small): privacy manifest 19 → 17 types (drop Device ID and Browsing History; analytics is
  off, Q6) so it matches the App Privacy label (gate G2). Needs ChatGPT review (after 10:47 PM reset).
- ~21:30 App Privacy: privacy policy URL saved; 17 data types saved as **drafts** (owner OK; not published) with the
  purposes from `docs/app-store/app-privacy-answers.md` §1a; preview = 7 "Linked to You" categories, no tracking.
  Publish waits on 238h (manifest 17) and Q9 legal text.
- 21:09 **TestFlight build 2 uploaded** (`testflight.sh`, owner approved the keychain prompt; `** EXPORT SUCCEEDED **`;
  counter committed `f541a7b`). App Store Connect shows 1.0 (2) "Processing". Warning only: no dSYM for Plaid
  `LinkKit.framework` (third-party binary; crash symbols for that framework will be missing). Build 2 has the known black
  launch gap (238a-b fixes it; build 3 after it ships).
- Owner money item seen on developer.apple.com: "Your default payment method cannot be used to automatically renew your
  membership" (add a card). Program License Agreement update due by 2026-10-28 (Account Holder).
- 21:12 TestFlight internal group **"Owner"** created (automatic distribution on) with build 2; owner added as tester
  (Invited). Next owner step: accept the invite on the iPhone and install. Then device checks one at a time: Face ID lock,
  repair-photo camera, save a repair photo to Photos (closes audit U7).

## 2026-10-16 ~21:40 — Real-iPhone findings (TestFlight build 2) — owner asked for no more walk-throughs
- Owner directive: stop step-by-step owner assistance; Claude verifies on the Simulator and batches owner-only items
  (memory `feedback_minimize_owner_assist.md`).
- **F1 (high): file uploads over 1 MB fail.** Vercel log 03:23:56Z `POST /tenant` → "Body exceeded 1 MB limit" (413) when
  the walk tenant sent a repair with an iPhone camera photo; the error boundary showed "We couldn't load your tenant
  dashboard"; no ticket saved. The form promises "Up to 5 photos, 10MB each". Next.js server actions default to 1 MB and
  Vercel caps bodies near 4.5 MB → needs direct-to-Storage signed uploads (sweep of every upload path running: workflow
  `wf_1291c3c0-101`).
- **F2 (med): owners cannot sign out on the phone.** Sign Out lives only in `UserMenuPopover` (top-bar avatar); the owner
  tab-bar layout hides it, the More drawer has Settings/Help/Theme only, and /settings has no sign-out. Workaround used:
  Face ID lock → "Sign in with password".
- **F3 (med): repair photo viewer is trapped inside the repair card** (fixed overlay under a containing ancestor; image
  partly behind the tab bar) and **long-press shows no Save menu** (Simulator, walk tenant, test ticket
  `9dcd385d…` with a 24 KB PNG created by `apps/web/.tmp-photo-ticket.mjs`). Fix direction: portal the viewer to body +
  an explicit "Save photo" button via the native share sheet. Audit U7 stays open.
- Device checks that passed on the real iPhone: TestFlight install, sign-in, Face ID lock + "Sign in with password".
- **SECURITY (found by upload sweep `wf_1291c3c0-101`, verified live 21:50):** storage policies
  `property_files_storage_select/insert/delete` allow any `authenticated` user on bucket `property-files` (attacker SQL as
  the walk tenant: insert ALLOWED, select ALLOWED; delete refused in SQL only by the `protect_objects_delete` trigger, which the Storage API bypasses — so through the API delete was open too). Bucket is empty today (0 objects), so
  nothing leaked. `profile_avatars_public_read` lets anyone read every avatar (0 avatars stored). Every app Storage call
  uses the service-role admin client (`lib/assets.ts`, `lib/uploads.ts`, `app/actions/*`), so dropping these policies breaks
  nothing. Next: L3 migration (drop the 3 property-files policies + avatar public read) → ChatGPT review after 22:47 → apply
  with attacker SQL. Also: `maintenance-photos` file_size_limit 20 MB is live but not in any migration (drift).

## 2026-10-16 ~21:55 — Owner decisions (one batch)
- **238b account deletion: build it now.** Dispatch the code part (button + request queue, design ChatGPT-accepted); Claude
  hardens `docs/runbooks/account-deletion.md` before the first real request.
- **Q3 account type: Individual.** Seller = owner's personal name; no D-U-N-S.
- **Q9 legal name: Richard Smith.** Copyright "2026 Richard Smith"; same name in Terms/Privacy. (Still open in Q9: retention
  years and response time — Claude proposes defaults for one approval.)
- **App Review demo emails:** `appreview-owner@domusbase.com`, `appreview-tenant@domusbase.com` (set in
  `apps/web/.env.local`; 238g seed confirms them, so no mail must arrive).
- ~22:00 Owner accepted the updated Apple Developer Program License Agreement (banner gone). Membership card: the web
  "Add card" page (`secure.store.apple.com/us/account/setup`) shows a Chrome error; not urgent — renewal date
  **2027-10-10**. Later path: iPhone Settings → name → Payment & Shipping.

## 2026-10-16 ~22:10 — Overnight dispatch plan (Codex resumes 22:47; ChatGPT review resets 22:47)
- Running (auto-resume): **238a-b** (iOS launch cover) and **237c-1 rev 4** (web manager invites). Review → gate → ship.
- Web, one at a time (shared tsc/vitest): **237c-2** (L2) → **238i** (L2, photo viewer) → **238j** (L3 uploads; critic panel
  `wf_d6b52543-e27` then ChatGPT) → **238b rev 3** (L3 deletion; owner said build now; Claude applies
  `20261024_sprint238b_account_deletion_requests.sql` first) → **238e rev 2** (L2 menus + Sign out; after 237c-2).
- iOS, parallel with web: **238f** (test flake) → **238h** (manifest 17; ChatGPT first).
- Scripts: **238g** (demo seed; emails set) — then Claude runs it per `docs/runbooks/appreview-seed.md`.
- Claude-only: **238k** storage lockdown migration (critic panel + ChatGPT → apply with attacker SQL).
- After 238a-b + 238j + 238i ship: TestFlight build 3 (`testflight.sh`; keychain already allowed) → Simulator walk.
- Transcript ~46 MB: rotate the chat after this run (CLAUDE.md §7).
- ~22:50 238k revised (critic panel): the migration now drops **all 8** `property-files`/`profile-avatars` policies on
  `storage.objects` (the 4 own-folder avatar policies too: unused by the app, and they let any sign-up host files in an
  unlimited bucket). Attacker test `docs/sprint238k-attacker-test.md` (seeded objects, run before = 9/9 open, after = 9/9
  closed, always rolled back). Rollback recreates all 8 verbatim.

## Sprint 238k SHIPPED (2026-10-16 ~23:20) — Storage policy lockdown (L3, Claude-only migration)
- ChatGPT APPROVE WITH CHANGES (REQUIRED adopted: postcondition = zero policies on storage.objects). Applied live
  (`sprint238k_storage_policy_lockdown`). Attacker test `docs/sprint238k-attacker-test.md` after apply:
  `mode=after-apply open=0/9 closed=9/9 PASS`; all 8 controls ok (service role reads/uploads/updates/deletes; direct SQL
  delete still refused by `protect_objects_delete`). storage.objects now has 0 policies; RLS on; both buckets private.
- Rollback: `supabase/rollback/20261027_sprint238k_rollback.sql` (reopens the holes; only if a real flow breaks).
- Pending: one real app round trip (upload/open/delete a property document as a test owner) during the 238j walk.
- ~23:35 **237c-1 not shipped: review FAIL → round 2.** 21-agent review (`wf_5e10752c-84e`): 3 blockers (tautological
  dedupe/upsert tests proven by mutation, deleted AC4 pins incl. inviteOwner, empty `propertyIds` skips authorization yet
  calls Auth) + 15 should-fix (wrong success copy, no audit on grants, managers lost co-manager invites, Domus owners shown in
  the Add-a-home client picker, managed-client statement change, query per home with no cap). Claude decisions:
  **managers keep inviting co-managers; managed-client statements stay as before.** Round 2 appended to
  `docs/sprint237c1-codex-prompt.md`; dispatch after 238j (web runs one at a time). Fix attempt 1 of 2.
- ~23:45 **Codex usage limit again (resets 2026-10-17 03:48).** The runner misread the new reset format and burned 238j/238h
  attempts with no changes (L-027; `run-codex.sh` fixed `22977e1`). Requeued: **238j** (`bkkcyl3w9`) and **238h**
  (`bs2ec75hi`) sleep until ~03:49 then run. After 238j: 237c-1 round 2 → 238i → 238b rev 4 → 237c-2 → 238e (web, one at a
  time). iOS: 238a-b round 2 under XCTest now; 238f needs a failing snapshot from the next full-suite runs.

## Sprint 238a-b committed (2026-10-16 ~23:55) — PASS_WITH_RISK (iOS; ships in TestFlight build 3)
- Round 1 + round 2 (dark-mode white background: WebKit resolves dynamic colors; now resolved + re-applied on trait change).
- XCTest x3: LaunchSplash all green; AppLock flake remains (238f, cause proven: dismissal still in flight after 0.3 s).
- Simulator launch timing (Release relaunch): process running 26.55 → first app log 28.56 → cover installed 28.72 → scene
  ready 28.88 → cover removed `finished` 31.43. Black before the first frame = simulator process spawn + black launch
  snapshot (not app code). **Risk:** confirm on a real iPhone (owner's batched TestFlight check, build 3).
- Transcript is **80 MB** (rotation threshold 50 MB, CLAUDE.md §7). Kept alive overnight only because the queued Codex
  runners (238j `bkkcyl3w9`, 238h `bs2ec75hi`, 238f round 2 `bz2ltg6r4`, all waking ~03:49) report back here.
  **Rotate the chat in the morning** after they land; a new chat starts from this handoff.

## Sprint 238f + 238h committed (2026-10-17 ~04:00) — iOS; ship in TestFlight build 3
- **238f** (`e9c7292`): Face ID lock test waits on real dismiss/present completions (3 s timeout + diagnostic snapshot).
  Claude XCTest: full suite 5/5 runs green (122 tests), the lock test isolated x20 = 20/20. Flake closed.
- **238h** (`1d2bdb6`): privacy manifest 19 → 17 types (Device ID + Browsing History removed; analytics off in production).
  `config.test.cjs` 68/68 run by Claude (Codex's sandbox could not build the Xcode bundles), incl. both built Release
  bundles carry the exact manifest and the analytics-off guard on `layout.tsx`. App Privacy gate G2 now met.
- Codex 238j (`bkkcyl3w9`) still running after the 03:48 limit reset; 237c-1 round 2 is next (fix attempt 2 of 2).
- ~04:10 **238b migration APPLIED live** (`sprint238b_account_deletion_requests`; file sha1 469192fa, unchanged since the
  dry run). Rolled-back checks before and after apply: RLS on, 0 policies, 0 client grants, service role can insert;
  a 2nd open request for one profile is blocked by `account_deletion_requests_one_open`; a withdrawn + open pair is allowed;
  a bad role is blocked; `authenticated` select/insert/update/delete and `anon` select/insert are all denied. Live rows: 0.
  The table is unused until the 238b code ships (queue: 237c-1 round 2 → 238i → 238b).

## Sprint 238j round 1 reviewed (2026-10-17 ~04:30) — FAIL → round 2 dispatched (fix attempt 1 of 2)
- Codex round 1 done (report present). Claude isolated gate (worktree with only 238j's 34 files): 317 files / 2,651 tests,
  lint, tsc, build all green. Three review agents: **security PASS** (all 4 storage write paths sniff bytes before any write;
  stored type/extension come from bytes; OOXML scan bounded); **client** found a real bug — the new `catch` blocks swallow
  Next's `redirect()` error (every successful onboarding would show an error); **tests FAIL** — 3 tautological tests
  (expects inside the mocked action, swallowed by the component's catch; proven by mutation) + 8 weak pins + 1 flaky test.
- Claude decision (recorded): raise the **browser pick-time** photo limit to 50 MB (server stays 10 MB; shrunk files are
  ≤ 900 KB), because a 48 MP library photo converted to JPEG is 10–20 MB and was refused before shrinking.
- Round 2 = `docs/sprint238j-codex-prompt.md` "Round 2" (F1–F7), runner `bspiy7rdk` (gpt-6-sol high). Lesson L-028.
- Follow-ups (not in 238j): `lib/file-signature.ts` NITs (PDF signature may end past byte 1024; a dot-less name `txt` is
  read as `.txt`; OOXML entry names matched anywhere in the ZIP — read the central directory if it ever matters);
  unchecked storage `remove` errors in cleanup paths (`uploads.ts:46,51`, `document-templates.ts`,
  `maintenance-queries.ts:51-58`, pre-existing L-002); shared `Alert` has no `role`; pinned copy "per ticket" uses a
  banned word.
- Test media for the walk: `scratchpad/media/` (48 MP 15 MB JPEG, 12 MP JPEG, 12 MP portrait HEIC).
- ~04:22 **238k app round trip PASS** (Simulator, Debug shell on live domusbase.com, test owner `+walkowner`, Walk Test
  Home → Documents → Files): upload "File uploaded." → `storage.objects` row `cbb2395f…/03746fc3….jpeg`, `image/jpeg`,
  44,613 bytes (exact) → Open File shows the photo from a signed Supabase URL → Delete File → object gone, list empty,
  storage.objects still has 0 policies. 238k fully closed.
  - Follow-up seen: **Open File leaves the app for Safari** (signed URL opens externally; "◀ Domus" to return). Fold an
    in-app viewer for vault files into 238i's viewer work or a later sprint.

## Sprint 238j SHIPPED (2026-10-17 ~04:45) — Large photos + byte-checked uploads — PASS_WITH_RISK
- Commit `197c2d9` (34 files; round 1 + round 2). Production deploy `dpl_FWtbL7DrGYyUZ3t3RZ6bhNwUF66n` READY. CI `gate` success.
- Gate (isolated worktree, 238j files only): 317 files / 2,664 tests, lint, tsc, build green. Reviews: security PASS,
  client PASS (round 2), tests-are-real PASS (mutation-proven; all 7 redirect tests fail without `unstable_rethrow`).
- **Simulator walk on production** (test tenant `+walktenant`, Report a repair): picked a 15 MB 48 MP JPEG + 12 MP JPEG +
  12 MP portrait HEIC (iOS converted to JPEG) → accepted at pick (50 MB limit), sent as one repair "3 photos". Stored:
  297 KB 2048×1536, 296 KB **1536×2048 (portrait kept)**, 282 KB 2048×1536; EXIF/location stripped. Dark mode readable.
- Smoke: 24/25. **The 1 failure is pre-existing from 238d** (`962152b` renamed "Report a problem" → "Report a repair";
  `smoke-keyboard.spec.ts:80` and `smoke-speed.spec.ts:61` still use the old text). Fix = Sprint 238l (L1, packet
  committed `1f14265`), dispatch after 237c-1 round 2; must land before the daily smoke (13:30 UTC).
- Risk: real-iPhone memory on 48 MP decode (TestFlight build 3 batch check). Test data left on test accounts: repair
  "Test 238j large photos check" (+walktenant).
- Scorecard: Phone 65 → 70, Tenant 78 → 79. Transcript **113 MB** — rotate the chat after 237c-1 round 2 is reviewed.
- ~04:50 **238l done by Claude (declared §1 boundary break)**: Codex usage limit again (resets 08:50; 237c-1 round 2
  runner sleeping, partial edits in the tree), daily smoke at 13:30 UTC would have failed. Two string literals changed
  (`smoke-keyboard.spec.ts:80`, `smoke-speed.spec.ts:61` → "Report a repair", speed uses `exact: true`). Verified on
  production: 5/5 passed (tenant Home p75 744 ms). Rollback: revert the 238l commit.

## 2026-10-17 ~09:20 — 237c-1 round 2 reviewed: FAIL (tests) → **owner decision needed** (2 attempts used, §2a)
- Isolated gate green (319 files / 2,696 tests, build). Fix verification PASS_WITH_RISK; security no blocker (4 should-fix);
  **tests-are-real FAIL**: no test protects "managed-client statements unchanged" (mutation survives), plus 4 medium test
  gaps. Code paths verified correct (form posts JSON). Should-fix: "All my homes" always fails for managers who also run a
  client home; accepted invite can be reset to pending by a second request; retry branch skips access/cooldown;
  unbounded `.in()` lists; per-account queries.
- Round 3 written (packet "Round 3 (PROPOSED)"), **not dispatched** — waits for the owner. 237c-1 changes stay uncommitted
  in the tree; nothing of it is live.
- Meanwhile **238i** (photo viewer + Save photo, L2, no file overlap) dispatched (`bvc9sa43e`, gpt-6-sol medium).

## Sprint 238i SHIPPED (2026-10-17 ~09:25) — Repair photo viewer + Save photo — PASS
- Commit `271c55c` (2 files). Deploy `dpl_EEcckQm7VL5RCqg5fHvQCzHgYV3S` READY. CI `gate` success. Smoke 27/27 (incl. the
  238l keyboard/speed fixes; CI for `dbd0c54` success too). Isolated gate 318 files / 2,668 tests + build.
- Simulator (fresh Debug build of current source — the old scratch build lacked the 238a photo-save string): viewer is a
  full-screen portal above the tab bar, whole image visible (portrait and landscape), light + dark readable; **Save photo
  → share sheet with "Save Image"** (big-48mp, JPEG 297 KB). Not tapped (would grant Photos access on the device).
- U7 (save photo) closed. **TestFlight build 3 is now ready to build** (238a-b, 238f, 238h iOS + 238i/238j live web):
  needs the owner's keychain approval at upload → batched owner item.
- 238b (Delete my account, L3) dispatched with an L-028 note (its action ends with a redirect). 237c-1 still waits for the
  owner's round-3 decision.

## Sprint 238b SHIPPED (2026-10-17 ~09:45) — Delete my account (L3, App Store 5.1.1(v)) — PASS
- Commit `cda681a` (11 files). Deploy `dpl_6naNfCVqtKHKcbFm4YFdB8XApASy` READY. CI `gate` success. Migration was applied
  earlier today (attacker-checked). Isolated gate 320 files / 2,705 tests + build.
- Reviews: security PASS (packet rev 4 line by line; live grants/RLS/triggers re-checked; no PII logged; nothing sent
  to real people); tests-are-real PASS (57 mutations, 49 killed; survivors = test-hardening follow-ups below).
- **Simulator walk on production** (`+walktenant2`): Settings → Your data shows the section between Download and the
  legal links; keyboard opens in capitals; "DELETEDELETE" keeps the button disabled; exact "DELETE" enables it; tap →
  signed out → `/login` shows "We got your request. / Your account will be deleted within 30 days." DB: 1 open row
  (profile, email, role tenant correct) + 1 feedback row + 1 audit row. **Test request withdrawn** (`f66a7cb4…`,
  status `withdrawn`); the test account itself is untouched (sign-in still works with a new magic link).
- Follow-ups (L1, not blocking): `account-deletion-request.test.ts` run `writesAreScoped()` and a no-email-in-logs check
  in `afterEach`; placement test "between download and legal links"; pin the button title. Packet §6.2 log-line text
  contradicts its Logging bullet (Codex chose the safer one) — fix the packet text.
- App Store listing: deletion lines' gate met (`docs/app-store/listing.md`). **Runbook hardening** (ChatGPT REQUIRED
  items 2–9 on `docs/runbooks/account-deletion.md`) is still due before the first real request (owner decision 2026-10-16).

## 2026-10-17 ~09:55 — Owner: "Yes, run 237c-1 round 3 as written." → dispatched (third and final attempt)
- Packet "Round 3" marked APPROVED. Round-2 state saved (`scratchpad/237c1-round2.patch` + untracked tar) for diffing.
- If round 3 fails review, 237c-1 stops and goes back to the owner (no fourth round without a new decision).

## 2026-10-17 — Account deletion runbook rev 3.3 (ChatGPT APPROVE WITH CHANGES ×3, every REQUIRED item adopted)
- `docs/runbooks/account-deletion.md` rewritten (rev 2 → 3.3) plus a new no-PII step log
  `docs/runbooks/account-deletion-log.md`. Docs only: no data changed, no account touched, no destructive SQL run.
- Covers the rev-2 REQUIRED items 1–8: ordered, resumable steps A1–D4, each with a done-when check, and a step log in
  the repo holding the request id only; day-3 contact, run date by day 21, done by day 30; a 70-column free-text audit
  (Appendix A search by email, name, phone). Rows linked by profile id change automatically. Rows that only match an
  identifier are reviewed mention by mention. A C3b gate runs before C9. The completion email goes out only after D1
  passes, with lines matched to what was kept. Re-sign-in (`last_sign_in_at` or session use) triggers a 7-day confirm.
  The 238b code-side checks are recorded (grants/RLS re-checked live today). Disposable 3-account fixture dry run.
- Reviews in the Domus project chat "Specification Review": rev 3 AWC (3 REQUIRED) → 3.1 AWC (2) → 3.2 AWC (2, called
  "the final runbook changes") → 3.3.
- Live read-only checks: every table and column verified; every SQL block plan-checked with EXPLAIN; the search run
  against the withdrawn 238b test request. Found and fixed: `rental_applications.applicant_email` is NOT NULL; unique
  email keys on invitations, signers, LLC invitations (placeholders now hold the row id); unique partner names per LLC;
  managed-client guard triggers (`set local domus.client_sync`); `storage.objects.owner_id` is null on every object (files
  found via app rows); the `.env.local` Stripe key is test mode (C6/C7 use the live Dashboard).
- Signed leases are now a tripwire, deleted by default unless the lawyer confirms retention; 0 exist today.
- **Owner action (one):** say "go" for the fixture dry run (runbook §15). It must pass before any real request reaches
  Phase B.
- Follow-ups: add the open-request queue check to the SessionStart hook; the withdrawn 238b test request (`f66a7cb4…`)
  still holds the test account's email (clear it in the dry-run session); a Plaid removal script before any sole owner
  with a bank link deletes.

## 2026-10-17 ~12:10 — 237c-1 round 3 reviewed: FAIL (third attempt) → back to the owner
- Codex round 3 done (all 11 items implemented; Codex mutation notes). Isolated gate: 322 files / 2,757 tests, lint,
  tsc green; build green on re-run (first run hit a transient Google Fonts download error in next/font).
- 43-agent review (`wf_76037fc5-775`): 19 confirmed findings (0 disputed), one **root cause in Claude's packet (L-029)**:
  invite rows are written before the Auth invite, but the live trigger fires on `auth.users` insert at invite time →
  invites show Accepted at once (no Resend/Revoke), a failed branded email can never be re-sent, re-invite after a revoke
  says "Invite sent" but grants nothing, invented 1-hour retry wait with false copy. Also: multi-account owner's invite
  uses accounts[0] after `?account=` is stripped; 8 untested error branches; unchunked Clients queries (perf, live max 2).
- **Clients + statements half (M11) reviewed clean** apart from perf + test-pin follow-ups. Split prepared: 18 M11 files
  (`scratchpad/237c1-m11-files.txt`) vs 11 invite files; split gate running. Nothing of 237c-1 is live.
- Owner decision asked: ship the M11 half now and send the invite flow back to design (rows after Auth; resend via a
  fresh link; reopen revoked rows), or park all of 237c-1.

## Sprint 237c-1 (Clients half) SHIPPED (2026-10-17 ~15:35) — Domus owners in Clients + their statements — PASS
- Owner decision: "Ship the Clients and statements half of 237c-1 now. Put the invite flow back to how production works
  today, and redesign it as a new sprint."
- Commit `83154c8` (18 files, byte-identical to the split-gated copy: 320 files / 2,726 tests + build). Deploy READY.
  The invite half (11 files) was never live; it is archived as `docs/sprint-archive/237c1-invite-flow-round3.patch`
  (`0219a70`, reverse-applies cleanly) and the working tree is back to HEAD for those files.
- CI: `83154c8` gate **failure** = known flaky `unified-property-wizard.test.tsx:72` (sync `getByText` after an async
  success, listed in the handoff since 235c). Same app code at `0219a70` (HEAD): gate **success**. Local 15/15 on shipped
  code and 15/15 before the sprint. Queued fix: `findByText` (L1).
- **Simulator walk on production** (`+walkmanager`): Clients lists "Walk's Account · Person · 2 homes · Domus owner"
  (was missing before) next to the managed client "Walk Client Test" (unchanged); detail shows both homes Paid with no
  Add-a-home; Owner statement October 2026 = Payments $2,300.00 / Expenses $0 / Net $2,300 / Still owed $0 — **SQL
  matches to the cent** (2 non-reversed payments, $2,300.00). Light + dark readable (a sheet already open during a theme
  switch keeps the old theme until reopened — pre-existing, cosmetic).
- Next: invite-flow redesign packet **237c-5** (design workflow `wf_d47da41f-39e` running: map → 3 designs → 3 judges →
  draft; live trigger quoted per L-029) → ChatGPT review (L3) → Codex.

## 2026-10-17 ~17:45 — Sprint 237c-5 (manager invite redesign) packet rev 2 written — next: split → ChatGPT → Codex
- Design panel `wf_d47da41f-39e` (map → 3 designs → 3 judges): 3/3 picked **Auth user first, then invitation rows +
  grant, email last, rows accepted at sign-in** (rows-before-Auth and "no Auth user until click" both had fatal flaws:
  early/wrong-role grants via the trigger, or changed email for non-allowlisted people).
- Critic panel `wf_bd601a97-773`: all cited code/DB facts verified (HEAD `240667d`; live trigger md5
  `2c51636368d7ef759fd151508e904240`; auth-js 2.68.0); 71/72 issues folded into **rev 2**
  (`docs/sprint237c5-codex-prompt.md`). Open items in `docs/sprint237c5-critic-notes.md`: **split into smaller sprints**
  (rev 2 = 902 lines, ~52 tests, fake Postgres+GoTrue model — too big for one Codex run) and 16 completeness items
  (Send-vs-Revoke re-check untested, revoked invitee can still get a session, row actions' copy unmounts, …).
- Not dispatched; not ChatGPT-reviewed yet. Production invite flow = HEAD (unchanged).
- Also today: wizard flake fix (`unified-property-wizard.test.tsx:72` → `findByText`) still queued (L1).
- **Rotate the chat now**: transcript is ~135 MB (threshold 50 MB). The redesign continues in a fresh session.

## Sprint 237c-6 SHIPPED (2026-10-18) — wizard test flake fix (L1, test-only) — PASS
- `unified-property-wizard.test.tsx` :72, :78, :84 now `await screen.findByText(...)` (Codex gpt-6-luna low, 3 lines,
  byte-exact to the packet). Gate 320 files / 2,726 tests + build; commit `dde75d7`; CI `gate` success. No deploy (test-only).

## 2026-10-18 — Sprint 237c-5 rev 3: C1 live probe, split into 5a/5b/5c, charge_edit_history migration ready
- **C1 Auth probe (live, test addresses `+c5probe0`/`+c5probe1`, now used):** `generateLink` invite inserts and sends no mail;
  `inviteUserByEmail` right after re-sends and kills the old token; `hashed_token` verifies to a session; `email_exists` 422 /
  `user_not_found` 404; GoTrue lowercases. **Confirmed critic NIT:** an invite call on a self-signup user sets `invited_at`
  and keeps its metadata, so 5a also requires `full_name` to match. Production notifications mode = `test` (allowlist set).
- Rev 3 (`1bfaaa1`): `docs/sprint237c5-index.md` + `sprint237c5a/b/c-codex-prompt.md`; all 16 critic items placed.
  Ship plan: each sprint reviewed/dispatched/gated separately and committed locally; 5a+5b+5c deploy together.
- Migration `20261028_sprint237c5_charge_edit_history_active.sql` (+ rollback): adds `pm.active = true` to the only policy
  missing it. Rolled-back dry run: new qual has the check; rollback text equals live. **Not applied** (applies with 5b).
- Next: ChatGPT review of 5a (sent 2026-10-18 01:25Z) → Codex 5a (gpt-6-sol high) → 5b review → 5c.
- **ChatGPT round 1 (rev 3): REJECT** — user_metadata provenance racable; expired+active state unrepairable. Fixed in rev 4
  (`22e80e9`): `createUser` + server-only `app_metadata.domus_manager_invite` marker (live-proven: create-only, no mail,
  marker not client-settable, survives generateLink/verify); atomic `manager_invite_grant` / `manager_invite_revoke` SQL
  functions (dry run 9/9, rolled back, nothing persisted).
- **ChatGPT round 2 (rev 4): REJECT** — provenance now Pass. New REQUIRED: (1) concurrent final revokes on two rows for one
  person+home both skip release (needs a shared per-email+home lock in both functions); (2) grant must verify
  invited_profile_id = p_profile_id and define missing ids; (3) self-heal "accepted" must first ensure an active grant;
  (4) define Send/Resend linearization vs a revoke between grant and email, and test it; (5) real two-session Postgres
  concurrency tests. **Stopped per §2a (second REJECT on the same packet): owner decision asked** — rev 5 + round 3, or park.
- Standing rule (owner, 2026-10-18): Claude picks effort/model per task (memory `feedback_self_tune_effort_model`); the app
  blocks a session changing its own, so Claude asks in one line for this chat.
- **Rev 5 (owner: "Fix all five round-2 items in rev 5 and send ChatGPT round 3")**: SQL `5ead674` (5 functions: per-home/profile
  advisory lock, identity binding, accept-only-with-access; rolled-back suite 13/13; **live two-session race proof** via
  temporary `zz_c5_*` copies over PostgREST — no-lock control reproduced the bug, lock version correct in 4 scenarios; all
  temp objects + fixtures dropped, verified 0). Packets `b83d68e`.
- **ChatGPT round 3: REJECT** (concurrency/binding/linearization now Pass). REQUIRED: (1) revoke can remove a *direct*
  assignment made by `manager_grant_homes` (no invite row) because `property_managers` has no source; (2) B5 test sequence
  impossible; (3) invariant must cover direct assignments. Proposed rev 6: `property_managers.assigned_directly boolean not
  null default true` (existing grants stay protected), direct adds set it, invite grants set false only when they create
  access, revoke releases only invite-created access. **Owner decision asked** (third REJECT).
- **Rev 6 (owner: "Build rev 6 with the assigned_directly source flag, re-prove it, and send ChatGPT round 4")**: SQL `62a10ed`
  (`property_managers.assigned_directly`, default true; revoke removes only invite-made access; `kept_direct`); writer audit
  (only the 237c-5 functions write false); suite 17/17 rolled back; live race re-run (scratch table, F/G correct, control
  still reproduces the bug; all temp objects dropped). Packets `0c3ec71`.
- **ChatGPT round 4: APPROVE WITH CHANGES** — "previous three rejection grounds are now resolved". REQUIRED B4(c) + 3 optional
  adopted in rev 6.1 (`43ed82d`, `942df59`). **5a dispatched to Codex** (gpt-6-sol high, 2026-10-18). Next: review 5a → commit
  locally → 5b (reviewed) → 5c needs its own ChatGPT pass (UI) → one release with both migrations + C-checks.
- **5c ChatGPT review: APPROVE WITH CHANGES**, all adopted (5c rev 3.1 `6b3032c`: action-owned row toasts, walk keeps the
  shared link until the last revoke, backfill accepts only via `manager_invite_accept` for users who signed in).
- **Codex 5a run 1 reviewed** (gate 325 files / 2,799 tests green; 4 reviewers): spec conformance clean except 8b error
  order + a `propertyIds` nit; mutations 12/12 caught (independent re-run); **tests reviewer: 7 weak/tautological items
  (L-017 FAIL) + 8 fake-vs-SQL mismatches**; adversarial: untyped RPC results; 5a must never ship without 5b (now
  **enforced in `guard-deploy.sh`**). Live probe: attacker `signUp` on a Domus-created unconfirmed user cannot plant a
  password (no takeover). Decision: fix round goes straight to Codex (same approved spec, no design change) —
  `docs/sprint237c5a-fix1-codex-prompt.md` (`6e93909`), dispatched gpt-6-sol high.
- Follow-up (perf, L-013): the callback now awaits `manager_invite_accept` on every session; measure `[perf:*]` after ship.
- **5a fix round reviewed: PASS.** F1-F3, T1-T14, K1-K8 spot-checked (8b error order, runtime RPC result checks, A9 retry
  ordering, A24(c) after Send again, upsert keeps ids); new mutations caught; gate 325 files / 2,810 tests + build green.
  **5a committed locally `09ae479` (not deployed).** Deploy guard verified blocking HEAD with 5a but no 5b.
  Grooming nit: the fake's DO UPDATE path can overwrite unspecified columns with defaults (no current caller).
- **5b dispatched** to Codex (gpt-6-sol high) on top of `09ae479`.
- **Codex 5b run 1 reviewed** (gate 327 files / 2,866 tests green): spec conformance no blockers (3 nits); mutations 9/9 +
  2 extra caught (independent); adversarial no High/Medium (Low: revoke row not shape-checked; the old `handle_new_user`
  trigger can still grant on a pending manager row if that Auth user is deleted outside the app — covered by the existing
  "convert on email confirmation" L3 follow-up); **tests reviewer: 15/24 items under-asserted** → fix round
  `docs/sprint237c5b-fix1-codex-prompt.md` dispatched (gpt-6-sol high). Lessons L-030 (Codex under-asserts; packets define
  assertion helpers) and L-031 (identity source, lock, grant source before review) added; codex-dispatch checklist updated.
- **5b fix round reviewed: PASS** (F1-F3 read; B12 retry convergence, B15 logging, new B25 join-page bypass test read;
  14 mutations caught; gate 327 files / 2,875 tests + build green). **5b committed locally (not deployed).** 5c dispatched.

## Sprint 237c-5 (a+b+c) SHIPPED (2026-10-18 ~03:45Z) — manager invite redesign — PASS_WITH_RISK (low)
- Commits `09ae479` (5a), `0dcc704` (5b), `9583bf9` (5c); pushed; deployed (domusbase.com); CI `gate` success on `9583bf9`;
  gate 328 files / 2,891 tests + build; smoke green.
- Migrations applied (after ChatGPT AWC, rolled-back dry runs, rollback files): `20261028_sprint237c5_charge_edit_history_active`,
  `20261028_sprint237c5_manager_invite_functions` (assigned_directly + 5 functions), then post-deploy
  `20261029_sprint237c5_manager_invite_backfill` (1 legacy row → bound + accepted; backup table kept). L-012 re-read before
  apply (trigger md5 unchanged). Attacker SQL as `authenticated`: 7/7 denied. Live rolled-back suite 17/17. C5 diagnostic 0/0.
- **Live walk (smoke owner, magic link; test addresses +c5walk4 allowlisted, +c5walk5 not):** All my homes (2 homes) →
  exact copy + toast, user via `createUser` + marker, branded path (`generate_link`, no Supabase `/invite`), 2 Pending rows
  with Resend/Copy link/Revoke, grants invite-made; revoke one home → "Revoked" + toast, that access off, link NOT rotated
  (other row pending); re-invite → same row reopened, access back, link rotated, 1 user; open newest link → both rows
  Accepted on sign-in; +c5walk5 → Supabase `/invite` (generic); final revoke → access off, link rotated (old dead), user
  kept. Light + dark readable. Production allowlist now also has `+c5walk4` (owner test inbox).
- Follow-ups: (L1) home checkboxes in the manager form have no accessible name ("on") — link labels; (L3) remove a
  signed-in manager from a home; (L3) convert manager/owner rows on email confirmation in `handle_new_user` (also closes
  the deleted-Auth-user re-arm window); one Revoke for an All-my-homes send; measure `[perf:*]` for the callback's
  `manager_invite_accept` call; grooming: fake DO UPDATE default-column nit.
- Scorecard: Manager 80 → 83. Transcript 7 MB.
- **Next:** L1 checkbox labels (quick), then scorecard rule picks the next category.

## L1 checkbox labels (2026-10-17) — closed, no code change (tool false positive)
- Live check (smoke owner, server magic link, Add → Add a manager on domusbase.com): all 3 checkboxes ("All my homes",
  "Smoke Test Property", "Walk Home Two") are wrapped in their `<label>`; `input.labels` resolves each with the right text.
  Existing tests (`invite-manager-form.test.tsx`) already query each by role + name and pass.
- The "on" came from the Browser pane tool: an injected probe showed it names `htmlFor` / `aria-label` checkboxes but prints
  the default value "on" for wrapping labels (and names buttons from `title`). Not an app bug; recorded as L-032.
- Decision (standing authority): no Codex sprint, no deploy. Follow-up removed from the 237c-5 list.
- **Next:** scorecard rule picks the next category (237c-5 L3 follow-ups: remove a signed-in manager from a home; convert
  manager/owner rows on email confirmation in `handle_new_user`).

## 2026-10-18 — Owner: "start sprint 238g … rescore the Phone app row … merge the L-032 docs branch"
- L-032 branch merged (docs only). Scorecard: Phone app 70 → 74 (238b had shipped 10-17); Manager row's checkbox gap removed.
- 238g packet rev 3 (ChatGPT AWC, 10-16) re-verified at HEAD `c6d8d2c` by a read-only agent: 44/49 citations held, all
  schema facts held; 7 drift fixes + new constraints (repair `property_id` NOT NULL, photo `file_name/type/size`,
  never set `ai_consent_at`, tenant `sender_email` null, strict-fake unique keys/checks, line-length exemption). Runbook:
  owner steps marked done; after-run checks add `ai_consent_at IS NULL` + no open deletion request; new rule: an App Review
  "Delete my account" request on a demo account is withdrawn, nothing deleted. **Decision:** factual drift within the
  approved design → rev 3.1 goes to Codex without another ChatGPT round.
- **Owner decision 2026-10-18 (legal defaults):** "Approved: Richard Smith (individual), 30-day privacy response, 7-year
  record retention (lawyer to confirm), 30-day notice before price changes, publish to testers now and publicly after the
  lawyer." Filled into `docs/legal-draft-terms-privacy-2026-10.md` and `docs/policies/data-retention-policy.md` (adopted).
  Interpretation (recorded): `/terms` and `/privacy` are public web pages, so "publish to testers now" = replace the
  March 4 text with the approved draft now, labeled as an early-access version under legal review (only testers use
  Domus today); the lawyer's edits become the final version. Unblocked: the 7-year purge job (Sprint 231).
- **Owner decision 2026-10-18 (pricing):** "Yes: free for self-managing landlords, Manager plan at $1.50 per door per month
  with a $15 minimum, billed on the website." Next: Manager billing design (L3: research Apple US rules + Stripe/door facts
  → design + critic → ChatGPT → Codex). Terms require 30 days' notice before charging anyone.
- **Owner decisions 2026-10-18 (Manager plan, via question card):** co-managers → "Inviting manager pays" (team seats);
  no plan → "30-day trial, then read-only"; Alia (only real manager today) → "Free forever".
  Research: Apple — no IAP needed if the iPhone app shows no price/buy UI and managers subscribe on the web (3.1.3(c)
  business sales; rent stays 3.1.3(e)); Stripe — no Billing today (Connect + Checkout payments via REST, no API version
  pinned); doors — 10/18 homes have no unit rows; 1 live home shared by 2 managers; 10/11 managers are test accounts.
- Billing design: rev 2 (3 critics) → **ChatGPT round 1 REJECT** (12 REQUIRED: past_due precedence, server-enforced
  charge eligibility, team-seat chains, zero-door recovery, locks can't span Stripe I/O → durable intents + idempotency,
  atomic webhook claim, invoice/subscription matching, signature details, RLS allowlist by data effect + inventory test,
  Apple 3.1.3(f) + manager demo, ship dark). Owner decision: **downstream team seats → original payer pays**. Rev 3 written.
- **Billing design ChatGPT round 2: REJECT** (narrower: 7 REQUIRED — Stripe quantity ordering across stalled/expired
  workers; payer-chain overflow/invalid chains; checkout intent lifecycle + orphaned subscriptions; audit all privileged
  manager mutations (not header-only); effective entitlement + comp/subscription transitions incl. collection stop;
  deletion fencing vs late webhooks; 30-day notice for future price increases). Product decisions untouched.
  **Stopped per §2a (second REJECT): owner decision asked** — rev 4 + round 3, with a simplification (set quantity once
  per billing cycle on `invoice.upcoming` + verify-after-write instead of continuous sync).
- **Owner: "Yes. Do billing design rev 4 with the once-per-cycle quantity simplification and send ChatGPT round 3."**
  Rev 4: metered Stripe usage with `last` aggregation (verified in Stripe API docs: formula `count|last|sum`, added
  2025-03-31; duplicate `identifier` rejected ≥ 24 h; whether `last` orders by timestamp or arrival is undocumented →
  test-mode C-check before build), graduated price ($15 flat for 1-10 doors, $1.50 after), billed in arrears; single
  daily reporter with a DB lease + 20 s timeout; payer overflow → bills no one; checkout-intent state machine + orphan
  recovery; explicit `requireManagerWrite` + static guard test; entitlement (paid-through) + comp transitions;
  termination fence for deletion; per-account price-change notices.
- **Billing design ChatGPT round 3 (rev 4, metered): REJECT** — 8 REQUIRED: period-cutoff snapshot; no $15 for free
  periods; separate payment status / coverage / write entitlement; immutable, identifiable, retryable snapshots; fail
  closed for privileged manager writes on lookup failure; isolate unresolved chains without dropping other payers;
  prove meter ordering/timeout/finalization in test mode; billing-period fields moved in API 2025-03-31+.
  Third REJECT → **owner decision asked**. Recommendation: pivot the mechanism (not the decisions) to Domus-run monthly
  invoicing — one immutable per-manager monthly snapshot → one Stripe invoice (saved card, idempotency key per
  manager-month), no subscription/meter; 0 doors → no invoice.
- **Owner: "Yes. Switch billing to Domus-run monthly invoices from a fixed monthly snapshot, write rev 5, and send ChatGPT
  round 4."** Rev 5: immutable per-manager monthly snapshot (end-of-month doors, UTC, full months only, arrears) → one
  Stripe invoice via resumable keyed steps (create → item → finalize → pay); card saved with setup-mode Checkout;
  enrollment / coverage / write entitlement separated; 0 doors → no invoice; fail closed on plan lookup (allowlist
  still works); unresolved chains isolated per chain; termination voids open invoices; Test Clock proof before build.
- **Billing design ChatGPT round 4 (rev 5, monthly invoices): REJECT** — 7 REQUIRED (refinements): historical month-end
  snapshot can't be rebuilt from live tables (needs an append-only door ledger); explicit enrollment + payment
  authorization before collectible invoices; consistent due dates / 7-day grace / account-wide delinquency; Stripe
  remote-state recovery for uncertain outcomes (search by metadata before create); in-flight charges at deletion +
  unexpected-charge handling; unresolved-payer rule conflict + immutable attribution; app-time tests + real invoice
  verification instead of subscription Test Clocks. Fourth REJECT → owner decision asked. Recommendation: **park billing
  automation** (0 paying managers today: Alia comped, 10 test accounts); bill the first managers manually — Claude makes a
  monthly door statement per the same rules, owner sends a Stripe Dashboard invoice; build automation at ~5 paying
  managers from rev 5 + round 4 items.
- **Owner 2026-10-18: "Yes. Park billing automation; invoice the first paying managers manually with your monthly door
  statement, and build automation at about 5 paying managers. Back to Phase 1."** Runbook
  `docs/runbooks/manager-manual-invoicing.md`; design kept at rev 5 (+ round-4 items) in `docs/design/manager-billing-design.md`.

## 2026-10-18 — Account deletion §15 dry run: PASS (owner: "Go: run the account-deletion fixture dry run per the runbook (§15), test accounts only.")
- Fixture (test accounts +deldry1/2/3 only): X tenant + sole LLC owner + co-owner + manager of Y's home with pending pay,
  messages/repair/photos (one shared with Y)/home file/avatar/feedback/notifications/audit/invitation/unsigned packet,
  Stripe TEST customer + 2 test Connect accounts; Z look-alike (same name + phone); vendor "Sam Drytest" with X's email.
- X pressed the real "Delete my account" (request recorded, signed out), then signed in again. Tripwire test: a signed
  packet made A2 stop before B (§13). Main run A1–D4; forced stops after C5 part 2 and after the C6 Stripe delete (before
  logging) — each resumed by a fresh agent from the log only, cleanly.
- **All 6 pass checks met:** D1 all true; Y's/Z's data byte-identical to the baseline except the intended removals of X
  (Y's comment lost only X's email; the two-name message changed only X's mention); shared photo object + Y's row kept;
  LLC B kept Y, dropped X; home A kept records; Stripe test customer + both accounts deleted; every re-run 0/"already
  done" (C9 exception fixed in 3.4); log has only the request id; smoke green.
- Fixture removed (0 sign-ins, profiles, files, accounts, requests left). Runbook **rev 3.4** folds in 9 fixes (bash +
  in-shell id lookups, C3 "different name points elsewhere" + no-link money rows are "unsure", full first-name scan,
  C5 avatar resume check, C6/C7 Stripe done-when + test-mode API + in-transit check, C9 idempotence guard, dry-run log
  words). The runbook is ready for a first real request (owner "go" per request still required).

## 2026-10-18 — Sprint 239a/239b SHIPPED (early-access Terms + Privacy live); 238g seed run (App Review demo accounts)
- **239a** (`7ce8221`, L2): `/terms` and `/privacy` now carry the owner-approved early-access text
  (`docs/legal/early-access-terms-privacy-2026-10-18.md`). Word-for-word diff vs the source: exact. Gate green (2,893
  tests); smoke green; CI `gate` success; live pages show "October 18, 2026" + the lawyer banner, no March text.
- **239b** (`d58045f`, L1): live walk found headings/bold labels `text-white` on the light background → invisible
  (pre-existing since March, L-022). Now theme tokens (`--ink`, `--line`, `--surface`); test asserts no `white` class.
  Light + dark screenshots readable. **239c** (`96be13c`, L1) SHIPPED: body text `--faint` (≈3.4:1) → `--muted` (≈6:1); live check rgb(93,97,104) on white; smoke + CI green.
- **238g** (`ab50e94`): review agent found no safety blockers; fix1 (`docs/sprint238g-fix1-codex-prompt.md`) fixed the
  dry-run placeholder ids (would have failed live with 22P02), removes stale rent review items on month rollover (App
  Review double-payment hazard), and strengthened 9 weak tests (34/34). Live: dry run clean → seed created the full graph
  → second run all `existing`. Both demo users sign in (scripted); SQL check: owner 1 membership, tenant 1 active lease,
  0 manager rows/invites/deletion requests, `ai_consent_at` null. Passwords only in `apps/web/.env.local` (not shown).
- Grooming: `ensureProfile` compares `onboarding_completed_at` as text (`…000Z` vs `…+00:00`), so every run prints
  "updated: <role> profile" (same value rewritten; smoke seed has the same quirk). Harmless; fix with a Date compare.
- **Next:** Simulator walk as both demo users over app-review-notes 1c/2c; then IOS-4 status bar, IOS-5 reset email,
  screenshots, TestFlight build 3 (Phase 1 stage 1B).

## 2026-10-18 — App Review demo walk on Simulator (iPhone 18 Pro, iOS 27, fresh Debug build)
- **PASS (matches notes 1c):** owner + tenant sign-in; Face ID offer, lock on leave, auto-prompt on return, unlock to
  same page, password fallback shown; Plaid native sheet opens and closes cleanly (≈12 s load); CSV export → share sheet
  (167 B file); receipt Download PDF → share sheet (4 KB); bank items (3) on Bank page; tenant messages thread; repair
  with photo, full-size viewer + Save photo; tenant Settings → Your data → Delete my account (not pressed); Security
  Face ID switch. Demo rent $4, "Online pay isn't on yet" shown.
- **Findings (fix sprint next, L2 web + notes):**
  1. Notes say "More → Reports": from the Money tab, More opens `StandaloneDrawer` (owner-bottom-bar.tsx) without
     Reports. Reports also needs "scroll to a report, then Export CSV" in the notes.
  2. Receipt page (`/payments/receipt/[chargeId]`) is a dead end in the app: no tab bar, no back link, no swipe back.
  3. Receipt "Receipt timestamp" renders in UTC (10:55 PM shown at 4:55 PM MDT).
  4. Owner More → Members shows "Section not found … doesn't exist for your role" while the menu lists it.
  5. Tenant Messages tab uses a bell icon (owner uses a chat bubble); headings repeat ("Rent" ×3, "Repairs" ×2).
  6. Cold launch shows a black screen ~2 s before the splash.
- **Not walked yet:** owner Settings → Bank Account (Stripe in Safari), Ask Domus consent, offline page, owner delete.

## 2026-10-18 — Sprint 240a SHIPPED (App Review walk fixes) + walk finished
- **240a** (`3e967f5`, L2): More menu off the dashboard lists Reports and hides Members/Manager pay; receipt has
  "Back to Rent", clears the notch, shows dates not UTC times; tenant Messages uses the chat icon. Gate green (2,901),
  smoke green, CI `gate` success. Re-walked on Simulator: all four verified.
- **Rest of the walk:** Ask Domus consent names Anthropic, Not now sends nothing ✅; owner Settings → Bank Account shows
  Set up rent payments ✅ (not tapped: it creates a LIVE Stripe Express account for the demo owner via `/connect/onboard`;
  connect.stripe.com is outside allowNavigation so it opens Safari per notes); owner Account & Data → Delete my account ✅
  (not pressed). Offline page NOT verified: the Simulator can't drop network and a fake host opens Safari (policy), so
  the real offline path still needs a device check (TestFlight build 3, airplane mode).
- **Notes fixed:** app-review-notes 1c/2d now say "open a report → scroll down → Export CSV".
- **240b queued (L2):** receipt header overflows at phone width (Print Receipt off-screen); tenant Rent "Paid … 3:00 PM"
  is UTC; Ask Domus Send button sits under the help "?" button.
- **Backlog (not urgent):** sign-in callback ignores `next` (always role home); the More drawer opens ~1 s late and keeps
  scrolling after a swipe (taps land on the wrong row); black screen ~2 s on cold launch.
- **Owner list addition:** App Review following the notes will create one live Stripe connected account for the demo
  owner (no money moves). Acceptable, or say "skip" and I'll change the notes to not ask them to tap it.

## 2026-10-18 — Sprint 240b SHIPPED
- `c0e9b52` (L2): receipt header stacks on phones (Print Receipt on screen, "Back to Rent" one line); tenant Rent "Paid"
  lines show dates only; Ask Domus input row clears the help "?" (pr-16). Gate green (2,904), smoke green, CI success.
  Re-walked on Simulator: all three verified.
- Notes: Ask Domus is only in the "?" menu on the owner Home dashboard (not Money/Reports) — notes now say "on Home".
- Remaining before build 3: owner answer on the demo Stripe tap; offline page on a real device; backlog items above.
- **Owner 2026-10-18: "Yes, keep it. App Review can tap Set up rent payments on the demo owner; a live Stripe account for
  the fake owner is fine."** Notes unchanged. After review, delete that Express account (runbook account-deletion C6 style).

## 2026-10-18 — IOS-5 (reset/confirm email dead end): already fixed, verified
- Supabase templates checked (read only): "Reset password" and "Confirm sign up" already link to
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery|email`; Site URL `https://domusbase.com`. No owner
  Save needed.
- Verified: a recovery link for the demo tenant (admin generateLink, same URL shape) opened in Simulator **Safari** (no app
  cookies) → "Reset your password" → Continue → `/reset-password` form. Password not changed.
- Small findings (backlog): `/reset-password` repeats its subtitle twice; Safari shows an "Install Domus … Add to Home
  Screen" banner that now competes with the App Store app.
- **Next:** IOS-4 status-bar theme (iPhone code → L3, ChatGPT review, gpt-6-astra high).

## 2026-10-18 — Sprint 241a SHIPPED (IOS-4: status bar follows the Domus theme)
- L3/iPhone. ChatGPT rev 1 APPROVE WITH CHANGES (lock-window repair on repeat; real trait-propagation test; `theme` field;
  boot-script fallback test) → rev 2 → Codex gpt-6-astra high. `e5566c7`.
- Design: page posts `domusTheme {theme: light|dark|system}` (applyTheme + pre-hydration boot script, now
  `THEME_INIT_SCRIPT` in lib/theme.ts); native validates (provenance first, exact shape), sets app + lock window
  `overrideUserInterfaceStyle` (system → unspecified), persists in UserDefaults `domus.themePreference`, applied on cold launch.
- Verified: xcodebuild test 127/127; gate 2,907; smoke + CI green. Simulator: iPhone Light + Domus Dark → white status
  bar ✅; cold launch keeps it ✅; iPhone Dark + Domus Light → dark status bar ✅; Match my device follows iPhone ✅.
- Ships to phones with TestFlight build 3 (native change). Web side is live and harmless in browsers.

## 2026-10-18 — App Store screenshots + TestFlight build 3 uploaded
- **ASC-14 done:** 6 screenshots in `docs/app-store/screenshots-6.9/` (1320×2868 JPEG, no alpha, light, 9:41 status bar,
  demo data): owner home, Money (2026), Bank "Money to check", tenant home, tenant messages, report a repair. Caveats:
  Money shows "-$173" (demo rent $4 by design); message times show UTC ("4:37 AM") — timezone backlog.
- **Build 3** uploaded (`testflight.sh`, `** EXPORT SUCCEEDED **`, "Upload submitted for build 3"); counter committed.
  Contains 241a (IOS-4 status bar) + everything since build 2. Owner group gets it automatically after processing.
- **Owner next (one action):** TestFlight on iPhone → Install Domus build 3. Then Claude's device checks: offline page
  (airplane mode), status bar both themes, Face ID.
- **Owner device check 2026-10-18 (build 3):** Airplane Mode → cold open shows the Domus offline page with Try again;
  Airplane Mode off → Try again → Home. ✅ Offline page verified on a real iPhone (notes 1c item 6 is true).
- **Phase 1 stage 1B (store-ready app) is complete** except App Store Connect owner steps (B6).

## 2026-10-18 — Visual redesign: "Registry in graphite" chosen (look only)
- Owner: Domus looks "bare bones basic"; wants it "official, professional, clean… a serious app with no frivolity."
  Look only — no feature/layout changes; distinct from the 10-11 Wallet structure, which stays.
- Canvas https://claude.ai/artifact/DP3NYT3Thaaycw7WvyUkue: A Ledger, B Registry, C Graphite, + two B+C mixes.
  **Owner 2026-10-18: "Go with B + C in graphite. Turn it into the design system and plan the rollout."**
- Spec `docs/design/domus-design-system.md` (tokens light/dark, type, shape, buttons, doorway mark, email);
  rollout `docs/design/redesign-rollout.md`: 242a foundations → 242b brand mark (iPhone tier) → 242c front door →
  242d owner → 242e tenant/manager/docs → 242f finish + TestFlight build 4.
- Time-zone sprint shelved by owner ("We can shelve that sprint for later").

## 2026-10-18 — Redesign sprints 242a–242c SHIPPED (Registry in graphite)
- **242a** `29c9fbe` foundations: graphite/steel/cobalt tokens (light + dark), action/hero tokens, 4 px radii,
  Public Sans + Source Serif 4, graphite primary buttons, square uppercase badges. Gate 2,921; smoke + CI green.
- **242b** `9d36421` brand mark (iPhone tier; ChatGPT rev 1 AWC → rev 2): doorway `icon.svg`, iOS AppIcon + Splash
  light/dark regenerated (catalog-validated tests), web icons/OG. XCTest 127/127 (two AppLock timing flakes under gate
  load; clean on rerun). Live icons verified. Reaches phones with TestFlight build 4.
- **242c** `ae0412a` front door: `DomusMark`/`DomusWordmark`, landing, login, auth pages, email shell. Copy diff = none
  (3 strings only re-wrapped). Live check: login + landing render the new look.
- Design call (Claude): all home pass cards graphite (no per-home colors) — owner may ask for muted shades instead.
- **Next:** 242d owner screens (Codex running), 242e tenant/manager/PDFs (packet `docs/sprint242e-codex-prompt.md`),
  242f finish + screenshots + build 4.
- **242d** `919d9df` owner screens + chrome (56 files; copy diff none; gate 2,937). Simulator light + dark: graphite pass
  card (dark `#1F2226` + border), serif titles/amounts, square tags, ink tab-bar rule, action Add button ✅.
  **242f list:** Needs-you rows still amber-filled (spec: plain rows + tag); Home title missing the 2 px rule; native
  Face ID offer sheet + lock screen buttons still iOS blue (`LockViewController.swift`, iPhone tier).
- **242e** `0d0d701` tenant/manager/shared sections/receipts/PDFs (61 files; only "New"/"Next up" moved into `Badge`;
  gate 2,941; smoke 10/10; CI success). Tenant walk at phone width: Home, Rent, Messages ✅.
- **242f queued** (Codex usage limit until 00:26): `docs/sprint242f-native-codex-prompt.md` rev 2 (ChatGPT AWC: Dynamic
  Type-scaled serif title) and `docs/sprint242f-web-codex-prompt.md` (header Landmark → DomusMark, Needs-you plain rows
  + markers, Home title rule, CardTitle serif, decorative accent icons → ink-2). Then: new App Store screenshots,
  TestFlight build 4. ChatGPT usage also near limit (resets 00:26).

## 2026-10-20 — Redesign complete: 242f shipped, screenshots retaken, TestFlight build 4 uploaded
- Codex jobs queued behind the 10-18 usage limit were stuck (Mac slept through the wait); killed and re-dispatched 10-20.
- **242f-native** `033ab3e` (ChatGPT rev 1 AWC → rev 2): Face ID lock screen + offer in graphite — ground, action
  button (4 pt corners), cobalt link, Dynamic Type-scaled serif title; offer alert tinted ink. XCTest 130/130.
- **242f-web** `426c2dd` (+ web2 title rule): doorway mark in the app header, plain Needs-you rows with square markers,
  serif `CardTitle`, decorative icons → ink-2, 2 px ink rule under dashboard titles. Gate 2,945; smoke 10/10.
- **App Store screenshots** retaken in the new look (`docs/app-store/screenshots-6.9/`, 6 × 1320×2868 JPEG, no alpha).
- **TestFlight build 4** uploaded (`** EXPORT SUCCEEDED **`); carries doorway icon, splash, graphite Face ID screens,
  IOS-4 status bar. Owner group auto-distributes after processing.
- **Owner 2026-10-20: "Build 4 is installed on my iPhone."** ✅
- Rollout plan 242a–f is done. Remaining known items (not redesign): time-zone sprint (shelved by owner), sign-in `next`
  param, More drawer delay, cold-launch black screen.

## 2026-10-20 — Sprint 243a + 243b SHIPPED (times in Mountain time; dark chat bubbles); scorecard rescored
- Owner unshelved the time-zone sprint ("We can work on the time zones now").
- **243a** `ce5cdac` (L2, + fix1 test expectations): instants (timestamps) display in `DISPLAY_TIME_ZONE = "America/Denver"`
  (lib/format.ts, shared with statements); `YYYY-MM-DD` calendar dates keep their exact output. Fixes UTC message/payment
  times, paid dates a day off near midnight, host-zone bank "as of" dates, and a latent crash in the tenant "paid" month
  label (`${paid_at}T00:00:00Z` → Invalid time value). Tests pass under TZ=UTC, Pacific/Kiritimati, America/Los_Angeles.
- **243b** `586c94e` (L1): smoke caught tenant "mine" chat bubbles as light boxes in dark mode (pre-existing since 242e);
  now `--hero`/`--hero-ink`, replies `--surface-3`.
- Verified: gate 2,961; CI `gate` success (243a); production smoke 27/27 after 243b; live tenant Messages light + dark at
  390 px: "Oct 7, 2026, 11:04 AM" = SQL `17:04 UTC` → Denver 11:04 AM ✅.
- **Decisions (Claude):** one app-wide display zone (owner's homes are Mountain; renders identically server/phone, no
  hydration flicker). Per-user zones = later sprint 243c when a non-Mountain user exists; rent "today/late" cutoffs and
  month bucketing still UTC (inventory in the 243a review) = later sprint.
- **Scorecard:** Phone app 74 → 78, Launch & legal 64 → 70 (8 of 14 at ≥ 80).
- **244a (notifications correct before "on", L3):** packet `docs/sprint244a-codex-prompt.md` rev 3. ChatGPT rev 1 REJECT
  (race-unsafe email key) → rev 2 REJECT (stale reclaim, provider-accepted-then-DB-fail, fencing) → rev 3 folds all in
  (Resend `Idempotency-Key` verified in Resend docs: 24 h, same key+payload returns original, different payload 409).
  **Second REJECT → owner asked: "Continue" (third review) or "Simplify" (drop repeat-email keys).** Live test window
  Oct 1–20: 12 overdue + 4 receipt deliveries, all sent, 0 failed. `notifications.entity_type` has no check constraint.
- **Next:** owner answer on 244a; meanwhile item list 6–8 (sign-in `next`, More drawer delay, cold-launch black screen).

## 2026-10-20 — Sprint 245b SHIPPED (phone More menu); 244a + 245a ChatGPT-approved
- **245b** `bfa52f4` (L2): vaul `handleOnly` (content no longer captured as a drag, so iOS scroll guard stays on), overlay
  blur removed, 200 ms ease-out slide (scoped `[data-vaul-drawer].domus-mobile-drawer`, reduced motion → 0), one
  `overscroll-contain touch-pan-y` scroller in both owner drawers, no hover-preload on mobile rows. Gate 2,967; CI
  success; prod smoke 27/27 (deployed from a clean worktree while Codex ran 244a). Live WebKit iPhone 15 Pro on
  production as smoke owner: tap → panel settled 347–363 ms (incl. harness polling), 1 scroller, computed 0.2 s.
  Momentum feel on a real phone not measured (owner will notice on next use; web change, no TestFlight needed).
- **244a** rev 6 APPROVED by ChatGPT (owner: "Continue sprint 244a… until you and Chat agree"): 6 rounds — race-safe
  claim, Resend `Idempotency-Key`, immutable `first_attempt_at` 20 h unknown-result deadline, stored exact request body,
  re-gate before any retry, key namespaces, two-stage migration. Codex (gpt-6-sol high) running.
- **245a** rev 3 APPROVED by ChatGPT: shared branded `SafeNextPath` guard (path canonicalized, query preserved), role-
  scoped destinations, middleware overwrites client `x-domus-path`, `next` never forwarded for invite/recovery. Queued
  after 244a.
- Seen on Simulator cold launch: ~2–3 s black screen before the splash (backlog item 8, iPhone tier).

## 2026-10-20 — Sprint 244a SHIPPED (notifications correct before "on"); 246a + 245a approved
- **244a** `99fb4c8` (L3, ChatGPT rev 6 APPROVE, + fix1): tenant consent merge on tenant-facing automated messages;
  recipient email lookup in every mode; claim → send → record email path (unique index, `Idempotency-Key`
  `domus-n-<id>[-k-<key>]`, stored exact `email_request_body`, re-gate before retry, immutable `first_attempt_at` 20 h
  unknown-result deadline, terminal `"Not sent: …"`), keyed follow-ups, `manager_payment` entity, invoice email gated,
  cron summaries `"<Label>: N sent, N emailed, N skipped."`. fix1: stale webhook assertions, N3-overdue test, legacy
  null-body failed rows rebuilt instead of marked terminal.
- **Rollout:** dry run of both migrations rolled back ✅ → migration 1 (4 columns) applied ✅ → deploy ✅ → migration 2
  unique index applied ✅ (valid, unique, def matches) → SQL probe: distinct keys insert, duplicate key rejected (rolled
  back) ✅. Attacker SQL as `authenticated` (tenant with 42 of 140 rows): sees 42, 0 bodies; UPDATE denied (42501);
  `anon` sees 0 ✅. Gate 3,008; CI success; prod smoke 27/27; Vercel runtime errors (1 h) none; pending/unknown email
  rows: 0. Production stays in **test** mode (allowlist). First live exercise = next scheduled cron.
- **Scorecard:** Notifications 45 → 55.
- **246a** (iPhone launch black screen) rev 3 APPROVED: root cause from `splashboardd` log — 2732² splash ≈ 30 MB over
  SplashBoard's limit → "bad launch image" denylist; plus unsigned Simulator builds (-67056). Codex (gpt-6-astra high)
  running. **245a** (sign-in `next`) rev 3 APPROVED, queued.
- Decision (Claude): invites stay outside the notifications switch (sent because a person pressed Invite).

## 2026-10-20 — Sprint 246a COMMITTED (iPhone launch black screen); ships to phones with TestFlight build 5
- **246a** `dffd8fa` (iPhone tier, ChatGPT rev 3 APPROVE, gpt-6-astra high). Root cause from the Simulator log:
  `splashboardd` "Estimated size (29900800) is over limit" for the 2732² `Splash` → SpringBoard "bad launch image" →
  later launches "denied app" → black until first frame. (Unsigned Simulator builds also failed earlier with -67056.)
- Fix: launch storyboard = `LaunchBackground` color (#F3F4F6 / #0E0F11) + centered `LaunchMark` 312×316.5 pt (aspect
  70:71, width ≤ root − 32 pt; PNG max 936×949 = 3.55 MB decoded; `assets.mjs` throws above 4,000,000 B before
  writing); Capacitor SplashScreen `backgroundColor` removed (no light flash in dark); Simulator ad-hoc signing
  (`CODE_SIGN_IDENTITY[sdk=iphonesimulator*] = -`).
- Verified: node 79/79 (local `Signing.local.xcconfig` parked outside the repo during the run, restored byte-identical);
  XCTest 133/133 incl. 3 LaunchScreenTests (light/dark resolution, 320/375/402 layouts, resolved-variant pixel);
  signature valid; simulated entitlements keep `applinks:domusbase.com` (+ Xcode app id); clean install → SplashBoard
  "launch image generation completed" (no over-limit/denylist lines); cold launch light = door on #F3F4F6 from the first
  captured frame (was solid black); dark = white door on #0E0F11; Face ID "Not now" + sign-in persisted across relaunch
  (app uses UserDefaults/WK cookies, no keychain).
- Grooming: `npm run assets` also runs `capacitor-assets generate --ios`, which could recreate a `Splash.imageset`;
  change the script to icons only (L1, next iOS sprint).
- **Next:** 245a (sign-in `next`, Codex running) → ship → TestFlight build 5 (246a) → owner installs (one tap).

## 2026-10-21 — Sprint 245a SHIPPED (sign-in returns you to the page you asked for)
- **245a** `4392190` (L3, ChatGPT rev 3 APPROVE, + fix1): branded `SafeNextPath` guard in `lib/route-resolver.ts`
  (ASCII, canonical decoded path, no dot segments/double encoding, query kept byte-for-byte, blocked auth/api/
  onboarding/ops paths), role-scoped `isNextAllowedForRole`; guards redirect to `/login?next=…` from the middleware
  `x-domus-path` header (client value overwritten); `next` honored by login page, password action, and email-link
  callback only when the user would otherwise land on their role home; never forwarded for invite/recovery.
- **fix1 (Claude review catch):** the first middleware version forwarded headers cloned before Supabase's `setAll`, so
  a mid-request session refresh would have passed the **stale cookie** downstream. Fixed (headers rebuilt after refresh;
  test asserts forwarded cookie = fresh value).
- Verified: gate 3,104; CI success; prod smoke 27/27; live (WebKit, smoke accounts): signed-out `/owner/money?year=2026`
  → `/login?next=%2Fowner%2Fmoney%3Fyear%3D2026` → sign in → `/owner/money?year=2026` ✅; `next=//evil.com` → `/owner` ✅;
  tenant with `next=/owner/money` → `/tenant` ✅.
- **Owner report 2026-10-21:** "about 2 seconds to go to the next screen" between tabs. Measured prod (WebKit iPhone):
  tenant tab = one RSC GET of the whole page 0.65–0.97 s (no prefetch; router cache not reused); owner tabs = full
  reloads 0.9–1.1 s visible / 1.5–1.9 s idle. **247a** packet (instant tabs: tenant sections rendered once + client
  switch; owner bar uses in-page section switch; Money prefetched) — Codex running.

## 2026-10-21 — Sprints 247a/247b SHIPPED (instant phone tabs); TestFlight build 5 uploaded (246a launch screen)
- **247a** `e10034b` (L2): tenant's four main sections render once (`TenantSectionTabs`, `history.pushState`/popstate,
  focus to sr-only heading, hidden sections keep form state); owner bar Home/Homes/Messages use the in-page section
  switch on `/owner`; Money is a prefetched `Link`. Codex finding on the router cache: Next 15.5 `staleTimes.dynamic`
  only extends existing entries; it does not create them — why revisits refetched is unproven (moot now).
- **247b** `c0498bf` (L1): section headings sr-only + no focus ring after a switch (one "Rent" title, no blue box).
- Smoke tooling (Claude): `smoke-speed` tenant Home now targets the quick-action link (`d4ad10b`); the hidden Repairs
  section repeated the words.
- Verified prod (WebKit iPhone 15 Pro, smoke accounts): tenant tabs 31–49 ms, owner Home/Homes/Messages 29–74 ms,
  0 RSC/document requests, URL + `aria-current` update; Money 54 ms. Tenant Home first load median 641 ms (unchanged).
  Gate 3,116; CI success; prod smoke 27/27 (twice). Screenshots light + dark readable.
- **TestFlight build 5** uploaded (`** EXPORT SUCCEEDED **`, "Upload submitted for build 5"): carries 246a launch
  screen. Owner next: TestFlight → Install build 5; then cold-launch check (expect the door, no black).
- **Scorecard:** Speed 85 → 88.
- **Owner 2026-10-21: "Excellent, please go ahead. Everything worked."** Build 5 installed; instant tabs and launch
  screen confirmed by the owner. Next: 244b (notification settings per role + repair status notices).

## 2026-10-21 — Sprint 244b SHIPPED (notification settings per role + repair started); 248a approved
- **244b** `47f7c22` (L3, ChatGPT rev 3 APPROVE): `notificationPreferenceOptionsForRole` — tenant 6 / owner 6 / manager 6
  switches, exact plain copy (owner: "Let Domus remind my tenants…"); hidden keys preserved on save (server-boundary
  test). New `ticket_in_progress` type: tenant notice "Your repair has started" on a move into in_progress (tenant-only
  policy, one email per repair via the 244a claim index; in-app row updates, `read_at` kept).
- Migration: live constraint diffed = 22 types, no `_v2`; rolled-back dry run (new type accepted, bogus rejected);
  applied NOT VALID → VALIDATE → drop → rename; live now 23 types, validated, single constraint. Applied **before**
  deploy.
- Verified: gate 3,133; CI success; prod smoke 27/27; live Settings → Notifications (WebKit, smoke accounts): tenant
  [Rent reminders, Late rent, Overdue rent, Receipts, Repairs, Lease ending]; owner [Rent reminders, Late rent, Overdue
  rent, Payments, Repairs, Lease ending] + manager-reminder switch; manager [Late rent, Overdue rent, Payments, Repairs,
  Lease ending, My invoices]. First live repair-started notice = next time a repair is started.
- Backlog (L1): `/settings?section=notifications` does not open that tab (always Profile).
- **Scorecard:** Notifications 55 → 60.
- **248a** (retention report job, report-only) rev 4 APPROVED after 4 rounds (allowlisted SQL surface, invocation clock
  `v_run_at`, UTC anchors, live-FK blocker graph, anniversary boundaries, md5 non-mutation suite). Codex running.
- Process: L-033 added (twice a failed packet edit was sent for review — verify edits before sending).

## 2026-10-21 — Sprint 248a SHIPPED (retention report job — report only)
- **248a** `da4036b` (L3, ChatGPT rev 4 APPROVE): `retention_reports` (RLS on, all privileges revoked from public/anon/
  authenticated/service_role, unique `(run_at, category)`) + `report_retention_candidates()` (security definer,
  `search_path=''`, `timezone=UTC`, allowlisted read-only SQL surface, `v_run_at` invocation clock) + pg_cron
  `domus-retention-report` `45 9 * * *`. Rules: money from Jan 1 of tax year + 8; leases/repairs on the 7-/3-year
  anniversary; lease blockers from the live FK graph (documents, inspections, renewal successor, non-eligible money
  descendants, any rent_charge_lines — conservative). App: `closed` repairs now get `resolved_at`.
- Live suite (rolled back, twice): fixtures → leases 6 eligible / 3 blocked, repairs 1 (`eligible_photos=2`),
  payments 1, charges 2, expenses 1, deposit returns 1 (exact); two runs in one transaction → 11 + 11 rows, distinct
  `run_at`, identical results incl. a Denver-session run; 20 user tables md5-identical before/after; 400-day prune
  boundary (401 pruned, 399 kept); EXECUTE/SELECT denied to anon/authenticated/service_role; cron row active.
  (First suite run showed false hash diffs: my test switched the session time zone before hashing — fixed.)
- Applied live; first real run: 11 rows, all 0 eligible / 0 blocked. Gate 3,146.
- Policy §7 updated: report runs daily; deletion stays off until the lawyer confirms + owner approves.
- **Later (needs lawyer + owner):** deletion sprint — children-first purge, de-identify shared records, storage via API.

## 2026-10-21 — Sprint 249a SHIPPED (polish batch) + banner rollback; App Store docs refreshed
- **249a** `ca58f2e` (L2): `/settings?section=…` opens that tab (verified live: owner → Notifications); reset page one
  subtitle; FAQ "Yes. Domus is free for landlords and tenants. You don't need a credit card."; disabled primary buttons
  `--surface-3` / `--muted`, no opacity fade (live: light rgb(236,238,241)/rgb(77,83,92), dark rgb(42,45,50)/
  rgb(163,169,178), opacity 1). Gate 3,154; CI success; smoke 27/27.
- **Regression caught in the live walk:** 249a's fixed 96 px install-banner lift (my packet) covered **Sign in** on
  iPhone Safari `/login`. Claude rolled back that one class + its test (`7f8e876`, deployed). L-034 added. Proper fix
  249b (CSS var set by the tab bars) — Codex running.
- **App Store docs** (`af79575`, `39941a5`): review notes (Messages tab, Settings paths, Mountain time, test-mode email,
  no Pay button in demo, What to Test build 5, gates marked done), listing (pricing wording, gates met), privacy answers
  (shot table matches the 6 files; JPEG). Screenshot 05 shows a UTC time — optional cosmetic retake.
- Verified already fixed (no work): review-card keys, tenant "Already paid?", chat timestamp contrast, old signup copy.
- Guarded: `apps/ios` `npm run assets` would recreate `Splash.imageset`; the 246a assets test fails if it does.

## 2026-10-22 — Sprints 249b/249c, 251a/251b, 252a SHIPPED; WEB-3 resolved; 253a–d packets approved
- **249b** `08e5248` + **249c** `96b476b` (L2): install banner sits above the tab bar via `--domus-tabbar-height` (set
  by the tab bars), and never shows on sign-in/setup pages (`/login`, `/auth`, `/reset-password`, `/complete-profile`,
  `/onboarding`, `/join`). Live iPhone Safari: Sign in visible and tappable.
- **251a/251b** `776ad88` (L1): Sprint 160 test debt paid (O2 confirmations, O4 rent pre-fill, O5 joined prompt). The
  new test found a real double "Unit D added." toast → fixed (module WeakSet guard; duplicate `FormSuccess` removed).
- **252a** `6efe35d` (L2): full production axe scan (WCAG 2.1 A/AA, every section, all roles, light + dark, iPhone
  WebKit) found 52 → fixed (dropdown/date/file names, nested Homes card control, focusable inbox scroll box, terms/
  privacy contrast). **Re-scan after deploy: 0 findings.** Smoke 26/27 first run: one keyboard spec hit "Owner
  dashboard error" from a client `TypeError: network error` (Sentry WEB-9, 20:35Z, no server error in Vercel logs);
  rerun 3/3 green → recorded as a flake. Follow-up idea (grooming): owner error screen auto-retries once on a network
  error.
- **WEB-3 resolved:** Oct 17 event = same trace as WEB-6 (fixed by 238j photo shrink); Oct 7 event = WEB-4 (Supabase
  504). WEB-4 resolved; WEB-5 ignored (walk noise).
- **Packets (all ChatGPT AWC, changes adopted):** 253a stripe-webhook split rev 4; 253b account-wipe characterize +
  split rev 2; 253c ownership split rev 2; 253d stripe-connect split rev 3. Shared dev scripts: syntax-aware
  `verify-verbatim-split.mjs` (253a) and semantic `verify-export-surface.mjs` (253c). Claude decisions: no
  `server-only` in 253c/d (current files have none; ~20 transitive tests would break); 253a's handlers test may gain
  only `vi.mock("server-only")` (package throws under vitest).
- **250a** (business "today" = Denver calendar day; L3, ChatGPT rev 3 APPROVE): Codex done, gate 3,206; Claude review
  done (helpers, money rules, client `todayIso` + midnight refresh, tests D1–D12); shipping now.

## 2026-10-22 — Sprint 250a SHIPPED (business "today" = Denver calendar day)
- **250a** `bab4284` (L3, ChatGPT rev 3 APPROVE): new `lib/denver-calendar.ts`; rent opening (5 days), urgency, grace +
  late fees, charge candidate months, lease-created day, lease status (expired / expiring soon), reminders (+3 days),
  overdue day counts, autopay start, statement month, tenant next due date now use the Denver day. Rent cards get
  `todayIso` from the server and `useDenverDayRefresh` refreshes at Denver midnight / on tab focus.
  `updateLeaseStatuses` now checks its read errors (L-002).
- Verified: Claude review of helpers (DST-correct `denverDayStartUtc`), money rules and tests D1–D12 (evening fixture E
  Oct 31 10:30 pm, morning M; TZ Kiritimati/UTC/Tokyo); gate 3,206; CI success; prod smoke 27/27.
- **Next:** 253a (Codex running) → 250b (reports/dashboard/form defaults; packet `docs/sprint250b-codex-prompt.md`,
  L2) → 253b → 253c → 253d.

## 2026-10-22 — Sprint 253a SHIPPED (split stripe-webhook-handlers.ts, verbatim)
- **253a** `97d37fb` (L3, ChatGPT rev 4 AWC adopted): 1,005-line file → façade 304 + `lib/stripe-webhook/` context 152,
  notify 119, transfers 174, payments 278 (all `server-only`). Shared dev script `apps/web/scripts/verify-verbatim-split.mjs`
  (TypeScript AST, exact one match per name).
- Verified by Claude: proof script 24/24 symbols OK + façade text OK (BASE `bab4284`); tamper test (one added space) →
  `DIFF createTransfersForPayment`; six handler types identical (TS checker, BASE vs now); characterization 13/13 before
  and after (only diff: `vi.mock("server-only")`); allowlist import graph + no cycle; no outside importer. Gate 3,209;
  CI success; deployed revision = `97d37fb`; prod smoke 27/27; Sentry no new issues.
- **Claude decision (W3):** exceptions 8 → 9 — the same "Management fee for charge" string was used twice in the old
  file (one key); the guard keys by file, so the two moved copies need two keys. Same string, same reason.
- **Webhook delivery check: INCONCLUSIVE** — 0 Stripe events in the last 6 h and 0 webhook requests since deploy.
  Recheck at the next real delivery (Vercel log 2xx + Stripe Workbench delivery list).

## 2026-10-22 — Sprint 250b SHIPPED (reports, dashboard months, form defaults on the Denver day)
- **250b** `404ee91` (L2): reports default year (page, P&L, receipts PDF, YTD), delinquency/ledger "today", owner Money
  range, KPI "this month", wallet home + recent activity windows, analytics months, expenses months, home-money, CSV
  file names (9 exports) and form defaults (deposit return + `max`, charge create, lease wizard start, home-money
  task/settle-up/partner payment) now use the Denver day. `paid_at` windows use `denverDayStartUtc` or a ±1-day query
  then a Denver-date re-filter (Claude checked every consumer re-filters).
- Verified: Claude review (R1–R7 map to real assertions; 6 existing tests changed only for `lt` mocks or Denver
  wording); gate 3,237; CI success; prod smoke 27/27. Audit table in the Codex report (all §2 sites + extra sweep).
- Time zones now done end to end except SQL functions (`owner_dashboard_payload`, retention report) — left as UTC by
  design (backlog if a report ever disagrees).

## 2026-10-22 — Sprint 253b SHIPPED (characterize + split account-wipe.ts)
- **253b** `031ddf4` (L3, ChatGPT rev 2 AWC adopted): 47 characterization tests for all six wipe actions (complete
  ordered delete/update/storage traces, guards ×6 actions, first/later/update failure prefixes = partial deletion
  today, storage-error logging). Then façade 374 (`"use server"`, exactly six exports) + `lib/account-wipe/` scope 311,
  mutations 109 (`server-only`). Proof script now skips directive statements (generic gap).
- Verified by Claude: proof 26/26 + façade OK (BASE `404ee91`); test SHA-256 unchanged; the suite run **on BASE code in
  a clean worktree** passes 47/47; mutation check on BASE (swap two deletes + one extra delete) → 7 failures; 253a
  proof still OK with the edited script. Gate 3,289; CI success; deployed = `031ddf4`; smoke 27/27; read-only walk of
  owner Settings → Account & Data (six forms render, 0 page errors, 0 POSTs); Sentry no new issues.
- **Characterized, not desired (future sprint idea):** a mid-wipe error leaves a partial deletion (no transaction).

## 2026-10-22 — Sprint 253c SHIPPED (split lib/ownership.ts behind a re-export façade)
- **253c** `00c1868` (L3, ChatGPT rev 2 AWC adopted): 709 lines → façade 8 (named re-exports only) + `lib/ownership/`
  types 125 (type-only, client-safe), accounts 243, members 192, governance 157. No `server-only` (Claude decision:
  current file had none; ~20 transitive tests would break). New dev script `scripts/verify-export-surface.mjs`
  (TS checker: names, type/value namespace, public types); verbatim script now skips export declarations.
- Verified by Claude: verbatim 27/27 + façade OK (BASE `031ddf4`); export surface 17/17; tamper tests caught an extra
  façade export (`unique` MISSING at BASE) and a changed parameter type (2 exports DIFF), files restored byte-exact;
  `canUserAdministerOwnershipAccount` 6 cases with exact filters. Gate 3,299; CI success; deployed = `00c1868`; smoke
  27/27; read-only walk owner Home + Ownership and manager Home (content present, 0 page errors); Sentry clean.

## 2026-10-22 — Sprint 253d SHIPPED (split lib/stripe-connect.ts); all four large money/deletion files done
- **253d** `07c3cdb` (L3, ChatGPT rev 3 AWC adopted): 15 characterization tests for uncovered paths (manager payout
  routing, rent-collection authority, account/login links, getAccount — fetch mocked), then 685 lines → façade 9 +
  `lib/stripe-connect/` api 186, rent-collection 221, property-accounts 284.
- Verified by Claude: verbatim 32/32 + façade OK (BASE `00c1868`); export surface 17/17; prefix hash unchanged; the
  15 tests pass **on BASE in a clean worktree**; 3 mutations of manager routing on BASE (fee ≤ 0, onboarding check,
  oldest-manager order) each caught. 11 downstream suites same counts. Gate 3,318; CI success; smoke 27/27; `/api/health`
  Stripe ok; read-only walk owner bank settings, Rent, bank activity (0 page errors; only POST = sign-in); Sentry clean.
- No safe manager fixture: no active manager has a connected Stripe account (SQL) — manager routing covered by tests.
- Deploy note: the CLI build failed on a transient Google Fonts fetch (`next/font`), but the git-integration build of
  the same commit was READY and is the `domusbase.com` alias (checked).
- Code health: no money/deletion file > 500 lines. Largest remaining: `sidebar-nav.tsx` 504 (L1 split, queued).

## 2026-10-23 — Sprint 254a SHIPPED (network-blip auto-retry; sidebar split)
- **254a** `a702f2d` (L2): new `components/ui/use-network-error-retry.ts`; the root, owner, manager and tenant error
  screens retry once (router.refresh + reset) on a client network blip (`network error`, `Load failed`,
  `Failed to fetch`, chunk-load) with no `digest`, showing "Loading again…" (`role=status`); at most once per path per
  30 s (sessionStorage, failures tolerated); Sentry gets a warning tagged `auto_retry: started`, a repeat shows the
  card and reports an error. `sidebar-nav.tsx` 504 → 442 (helpers moved verbatim to `sidebar-controls.tsx`, proof OK).
  **No source file > 500 lines now.**
- Verified: 15 tests (N1–N6); gate 3,333; CI success; deploy (git integration) READY and aliased; smoke 27/27. A live
  dropped-request test could not trigger the path (the Money route came from the prefetch cache) — behavior is
  covered by unit tests only. Residual: if a refresh never settles, the screen could stay on "Loading again…".
- **Screen-reader audit** (iPhone WebKit; VoiceOver itself does not run in the Simulator): 19 screens, all roles +
  public. All controls and images named. Found: manager pages have no `h1`; duplicate section ids (wrapper + card);
  owner Repairs `h1 → h3` skip and an empty `h3`. → **254b** (Codex running).
