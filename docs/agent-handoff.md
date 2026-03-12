# Agent Handoff (Current State)

Updated (UTC): 2026-03-12T01:30:00Z

## Repository
- Branch: `main`
- HEAD (latest pushed): `3658627`
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

Profile Onboarding DB (Sprint 11):
- `profiles` columns: `nickname` (text), `avatar_url` (text), `onboarding_completed_at` (timestamptz)
- Storage bucket: `profile-avatars` with per-user folder policies + public read

Stripe Connect DB (Sprint 12, applied):
- `profiles` columns: `stripe_account_id` (text), `stripe_onboarding_complete` (boolean, default false)
- `payments` columns: `stripe_transfer_id` (text), `manager_transfer_id` (text), `platform_fee_cents` (integer, default 0)
- `properties` columns: `management_fee_cents` (integer, default 0)

Autopay DB (Sprint 14, applied):
- `profiles` columns: `stripe_customer_id` (text)
- Table: `autopay_enrollments` (id, lease_id UNIQUE, tenant_profile_id, stripe_payment_method_id, payment_method_type, last4, brand, enabled, retry_count, last_failed_at, created_at, updated_at)
- RLS: tenant own-row + service_role full access

## Deployment State
- Production host: `https://domusbase.com`
- Vercel deploy requires authenticated CLI session

## Stripe Infrastructure
- Webhook endpoint: `https://domusbase.com/api/webhooks/stripe`
- Webhook destinations: "energetic-glow" (original) + "whimsical-inspiration" (autopay events)
- Events: `checkout.session.completed`, `account.updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`
- `STRIPE_WEBHOOK_SECRET` set in Vercel (verified via /api/health)
- Stripe Connect enabled in sandbox/test mode (Express, platform type)

## Feature Status Matrix
| Area | Status | Notes |
|---|---|---|
| Auth + role routing | LIVE | Owner/Manager/Tenant routes + invite callback |
| Owner onboarding wizard | LIVE | Individual / Create LLC / Join LLC with passcode |
| Profile onboarding | LIVE | Sprint 11 — name, nickname, photo upload, onboarding gate |
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
| Sidebar overhaul | LIVE | Sprint 11 — nickname, avatar, tagline removed, workspace button fixed |
| Settings popover menu | LIVE | Sprint 11 — Settings, Language, Upgrade Plan, Help/Support, Sign Out |
| Property form (partial saves) | LIVE | Sprint 11 — only name required, amber warnings for empty optional fields |
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
| Stripe Connect + payment routing | LIVE | Sprint 12 — Express accounts, transfer routing, management fee split |
| Connect status UI | LIVE | Sprint 12 — banners, settings bank section, disabled Pay Now when unconnected |
| Analytics dashboard | LIVE | Sprint 13 — recharts, 4 chart panels, CSV export, owner-only |
| Tenant autopay | LIVE | Sprint 14 — saved payment methods, off-session charging, retry logic, autopay card UI |
| Autopay cron processing | LIVE | Sprint 14 — processes due charges for enrolled tenants on cron |
| Autopay webhook handlers | LIVE | Sprint 14 — payment_intent.succeeded + payment_intent.payment_failed |
| Tenant payment settings | LIVE | Sprint 14 — Payment Methods section in settings for tenants |
| Playwright E2E tests | LIVE | Sprint 6 — auth, owner-setup, tenant, navigation |
| Mobile app foundation | IN PROGRESS | Expo Router + role-aware tabs (not published) |

## Gate Status
- `npm run gate:web` — 232/232 tests (8 suites), lint clean, build clean
- `npm run smoke:web` — all checks passed (+ health endpoint + gamification auth guard)

## Current Risks / Blockers
- Mobile app not published to app stores yet.
- User's test account is wiped — needs fresh signup to test.
- Resend email not configured — in-app notifications work, email activates when RESEND_API_KEY + RESEND_FROM_EMAIL set.

## Shelved (Needs User Input)
- Live end-to-end test of Connect onboarding + autopay flow
- Switch Stripe from sandbox to live mode for real payments

## Future Sprints
- Sprint 15: Go-Live Hardening (switch Stripe to live, configure Resend, end-to-end smoke test)
- Sprint 16: Pricing tiers + Stripe Billing (Free $0 / Starter $4.99 / Pro $12.99)
- Future: Dom animations, language i18n, tax prep tools, manager analytics, Stripe Connect payouts management
