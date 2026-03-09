# Agent Handoff (Current State)

Updated (UTC): 2026-03-09T12:40:00Z

## Repository
- Branch: `main`
- HEAD (latest pushed): `68888c2`
- Remote: `origin/main`
- Deploy URL: `https://domusbase.com`

## Runtime / Database State
Latest runtime verifier status (`npm run verify:phase9-runtime` from gate run):
- `ok: true`
- All tables, columns, functions, buckets ready

Gamification DB (applied via Supabase MCP, Sprint 7):
- Tables: `user_gamification`, `xp_events`, `achievements`, `user_achievements`
- Functions: `award_xp()`, `update_streak()`
- 12 seeded achievements across payment, streak, property, maintenance categories
- RLS policies active

## Deployment State
- Production host: `https://domusbase.com`
- Vercel deploy requires authenticated CLI session

## Feature Status Matrix
| Area | Status | Notes |
|---|---|---|
| Auth + role routing | LIVE | Owner/Manager/Tenant routes + invite callback |
| Owner onboarding wizard | LIVE | Individual / Create LLC / Join LLC with passcode |
| Owner dashboard workflows | LIVE | Properties, units, leases, charges, invites |
| Manager operations | LIVE | Assigned-property operations active |
| Tenant dashboard | LIVE | Charges, tickets, documents, notifications |
| Tenant invitation + password setup | LIVE | inviteUserByEmail → /complete-profile → password set |
| Stripe checkout + webhook | LIVE | Checkout + webhook recording + auto-redirect |
| Charge cron generation | LIVE | Per-owner fault isolation (Sprint 9) |
| Documents + packets + signer flow | LIVE | Includes tenant status view |
| Notifications (in-app + deliveries) | LIVE | DB-backed notifications and delivery logs |
| Vendors + assignment + maintenance photos | LIVE | Vendor assignment and evidence support |
| Ownership accounts (LLC/shared access) | LIVE | Account/member model + join codes |
| Marketing landing + auth-aware root | LIVE | Public root + role-based workspace redirect |
| Password management (settings) | LIVE | Change password in Settings |
| Palette: Violet + Emerald + Gold | LIVE | Sprint 7 |
| Dom the Key mascot (PNG) | LIVE | Sprint 8 — user-provided PNG via next/image |
| Gamification UI (XP, streaks, levels) | LIVE | Sprint 8 — wired to real DB data |
| Gamification DB | LIVE | 4 tables, 2 functions, 12 achievements |
| XP awards on server actions | LIVE | Sprint 8 — 8 actions award XP (fire-and-forget) |
| Streak tracking on login | LIVE | Sprint 8 — updateUserStreak on auth callback |
| Achievement checker + confetti | LIVE | Sprint 8 — client-side checker, canvas-confetti |
| Error boundaries | LIVE | Sprint 9 — global-error + app + 3 role error pages |
| Env validation | LIVE | Sprint 9 — lib/env.ts, middleware hardened |
| Expired invite token handling | LIVE | Sprint 9 — amber banner on login page |
| Health endpoint | LIVE | Sprint 9 — /api/health with env status |
| Gamification unit tests | LIVE | Sprint 9 — 57 tests covering all 12 achievements |
| Playwright E2E tests | LIVE | Sprint 6 — auth, owner-setup, tenant, navigation |
| Mobile app foundation | IN PROGRESS | Expo Router + role-aware tabs (not published) |

## Gate Status
- `npm run gate:web` — 216/216 tests (8 suites), lint clean, build clean
- `npm run smoke:web` — all checks passed (+ health endpoint + gamification auth guard)

## Current Risks / Blockers
- Mobile app not published to app stores yet.
- User's test account is wiped — needs fresh signup to test.
- Role-specific loading.tsx removed (Next.js Suspense conflicts with server-side auth redirects).

## Immediate Focus
- Owner is going live with real properties soon (1-3 properties).
- Core flow: Owner invites tenant → tenant signs up + sets password → tenant pays rent → XP awarded.
