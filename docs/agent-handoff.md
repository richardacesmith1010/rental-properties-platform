# Agent Handoff (Current State)

Updated (UTC): 2026-03-10T02:55:00Z

## Repository
- Branch: `main`
- HEAD (latest pushed): `d63e7cd`
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

Notification DB (expanded Sprint 10):
- 11 notification types: `new_ticket`, `late_rent`, `ticket_resolved`, `payment_recorded`, `lease_updated`, `document_sent`, `document_signed`, `application_reviewed`, `rent_due_reminder`, `invite_accepted`, `achievement_unlocked`

RLS Helper Functions (Sprint 10 hotfix):
- `is_member_of_account()`, `is_owner_member_of_account()`, `is_creator_of_account()`, `is_manager_of_account()`
- SECURITY DEFINER — break circular RLS dependency between ownership_accounts and ownership_account_members

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
| Notifications (in-app + deliveries) | LIVE | Sprint 10 — bell badge, mark all read, 11 types |
| Notification triggers | LIVE | Sprint 10 — payments, maintenance, documents, invites |
| Rent due reminders | LIVE | Sprint 10 — cron sends 3 days before due date |
| HTML email templates | LIVE | Sprint 10 — Domus violet branding + Dom mascot |
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
- Resend email not configured — in-app notifications work, email activates when RESEND_API_KEY + RESEND_FROM_EMAIL set.
- Property creation form requires all fields — user wants partial saves (Sprint 11).

## Sprint 11 Plan (Approved Scope)
Core UX overhaul based on user feedback:
- Part A: Profile onboarding wizard (name, nickname, photo upload)
- Part B: Sidebar overhaul (nickname display, profile pic, remove tagline, fix workspace button)
- Part C: Settings popover menu (Settings, Language, Upgrade Plan, Help/Support, Sign Out)
- Part D: Property form fix (only name required, partial saves, field highlighting)
- DB: add `nickname`, `avatar_url` to profiles table

## Future Sprints
- Sprint 12: Pricing tiers + Stripe Billing (Free $0 / Starter $4.99 / Pro $12.99)
- Sprint 13: Payments via Stripe Connect (rent collection, manager payments)
- Future: Dom animations, language i18n, tax prep tools, analytics
