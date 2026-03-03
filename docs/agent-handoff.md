# Agent Handoff (Current State)

Updated (UTC): 2026-03-03T17:35:50Z

## Repository
- Branch: `main`
- HEAD (latest pushed): `e7b1817616fe3a98fe75f729e39ac843b9aa5d44`
- Remote: `origin/main`
- Deploy URL: `https://rental-properties-platform-web.vercel.app`

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
- Last known production host: `https://rental-properties-platform-web.vercel.app`
- Vercel deploy requires authenticated CLI session (`vercel login` or token) when run from local terminal.

## Feature Status Matrix
| Area | Status | Notes |
|---|---|---|
| Auth + role routing (web) | LIVE | Owner/Manager/Tenant routes active |
| Owner dashboard workflows | LIVE | Properties, units, leases, charges, invites |
| Manager operations | LIVE | Assigned-property operations active |
| Tenant dashboard | LIVE | Charges, tickets, documents, notifications |
| Stripe checkout + webhook | LIVE | Checkout + webhook recording active |
| Charge cron generation | LIVE | Active leases only, duplicate guard |
| Documents + packets + signer flow | LIVE | Includes tenant status view |
| Notifications (in-app + deliveries) | LIVE | DB-backed notifications and delivery logs |
| Vendors + assignment + maintenance photos | LIVE | Vendor assignment and evidence support |
| Ownership accounts (LLC/shared access) | LIVE | Account/member model and permission functions |
| Marketing landing + auth-aware root | LIVE | Public root + logged-in portal path |
| Tester diagnostics workspace | LIVE | Tester-only route and health/test tools |
| Mobile app foundation | IN PROGRESS | Expo Router + role-aware tabs + real-data screens merged |

## Current Risks / Blockers
- No functional runtime blockers currently identified from latest gate run.
- Release/deploy actions from local terminal still require Vercel auth when performing new production deploys.

## Immediate Focus
- Keep this file current-state only.
- Move completed milestone documentation to `docs/archive/`.
- Keep historical detail in git history instead of appending long narrative logs here.
