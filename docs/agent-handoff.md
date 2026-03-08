# Agent Handoff (Current State)

Updated (UTC): 2026-03-08T20:00:00Z

## Repository
- Branch: `main`
- HEAD (latest pushed): `7d081cb`
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

Phase 9 runtime checks currently passing:
- Columns present: `properties.owner_account_id`, `invitations.ownership_account_id`
- Permission functions callable: `can_administer_property`, `can_view_property`, `can_access_property`
- Private buckets present: `lease-documents`, `maintenance-photos`

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
| Mobile app foundation | IN PROGRESS | Expo Router + role-aware tabs (not published) |

## Gate Status
- `npm run gate:web` — 159/159 tests, lint clean, build clean
- `npm run smoke:web` — all checks passed (landing, login, route guards, API guards, cron guard)

## Current Risks / Blockers
- Mobile app not published to app stores yet.
- User's test account is wiped — needs fresh signup to test.

## Immediate Focus
- Owner is going live with real properties soon (1-3 properties).
- Core flow to polish: Owner invites tenant → tenant signs up + sets password → tenant pays rent.
- Mobile web deferred until native app is published.
