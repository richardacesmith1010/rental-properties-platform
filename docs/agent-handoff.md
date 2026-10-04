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

## ▶ START HERE (next session, written 2026-10-04)

- Last shipped: Sprint 152 (`357571d`, known issue above). Production healthy: smoke 3/3 + theme 11/11, Sentry clean.
- Owner-approved queue, in order: (1) Sprint 153 section reads via GET route handler (L3, proposed); (2) clarity cleanup from `docs/walkthrough-2026-10-03.md` #5–#7, #9 — one bank-setup prompt, simpler navigation (replace "N OF M" carousel), plain-language sweep — **mockup first** (Design canvas, like the landing), L2/L3 TBD.
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
