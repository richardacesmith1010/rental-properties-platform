# Agent Handoff (Current State)

Updated (UTC): 2026-03-09T03:15:00Z

## Repository
- Branch: `main`
- HEAD (latest pushed): `e0071b8`
- Remote: `origin/main`
- Deploy URL: `https://domusbase.com`

## Runtime / Database State
Latest runtime verifier status (`npm run verify:phase9-runtime` from gate run):
- `ok: true`
- `summary.tablesReady: true`
- `summary.columnsReady: true`
- `summary.functionsReady: true`
- `summary.bucketsReady: true`
- `summary.ownerAccountBackfillReady: true`

Gamification DB (applied via Supabase MCP, Sprint 7):
- Tables: `user_gamification`, `xp_events`, `achievements`, `user_achievements`
- Functions: `award_xp()`, `update_streak()`
- 12 seeded achievements across payment, streak, property, maintenance categories
- RLS policies active (users see own data, achievements public)

## Deployment State
- Production host: `https://domusbase.com`
- Vercel deploy requires authenticated CLI session (`vercel login` or token).

## Feature Status Matrix
| Area | Status | Notes |
|---|---|---|
| Auth + role routing (web) | LIVE | Owner/Manager/Tenant routes + invite callback |
| Owner onboarding wizard | LIVE | Individual / Create LLC / Join LLC with passcode |
| Owner dashboard workflows | LIVE | Properties, units, leases, charges, invites |
| Manager operations | LIVE | Assigned-property operations active |
| Tenant dashboard | LIVE | Charges, tickets, documents, notifications |
| Tenant invitation + password setup | LIVE | inviteUserByEmail → /complete-profile → password set |
| Stripe checkout + webhook | LIVE | Checkout + webhook recording + auto-redirect |
| Charge cron generation | LIVE | Active leases only, duplicate guard |
| Documents + packets + signer flow | LIVE | Includes tenant status view |
| Notifications (in-app + deliveries) | LIVE | DB-backed notifications and delivery logs |
| Vendors + assignment + maintenance photos | LIVE | Vendor assignment and evidence support |
| Ownership accounts (LLC/shared access) | LIVE | Account/member model + join codes |
| Marketing landing + auth-aware root | LIVE | Public root + role-based workspace redirect |
| Password management (settings) | LIVE | Change password in Settings → Security |
| Palette: Violet + Emerald + Gold | LIVE | Sprint 7 — replaces old indigo palette |
| Dom the Key mascot | LIVE | Sprint 7 — 5 expressions, login/sidebar/empty states |
| Gamification UI (XP, streaks, levels) | LIVE | Sprint 7 — hardcoded defaults, wiring in Sprint 8 |
| Gamification DB | LIVE | Sprint 7 — 4 tables, 2 functions, 12 achievements |
| Playwright E2E tests | LIVE | Sprint 6 — auth, owner-setup, tenant, navigation |
| Mobile app foundation | IN PROGRESS | Expo Router + role-aware tabs (not published) |

## Gate Status
- `npm run gate:web` — 159/159 tests, lint clean, build clean
- `npm run smoke:web` — all checks passed (landing, login, route guards, API guards, cron guard)

## Current Risks / Blockers
- Mobile app not published to app stores yet.
- User's test account is wiped — needs fresh signup to test.
- Gamification UI shows hardcoded defaults — needs wiring to real DB data in Sprint 8.

## Immediate Focus
- Owner is going live with real properties soon (1-3 properties).
- Core flow to polish: Owner invites tenant → tenant signs up + sets password → tenant pays rent.
- Sprint 8: Wire gamification to server actions, confetti/celebrations, achievement unlock flow.
