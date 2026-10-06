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
