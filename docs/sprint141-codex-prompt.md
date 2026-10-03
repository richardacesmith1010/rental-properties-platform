# Sprint 141 — Remove the gamification backend (L3)

**Severity: L3** — touches the Stripe webhook handler, manual-payment action, auth callback, dashboard data loaders, and the database schema. Requires Domus Prompt Engineer (ChatGPT) review before dispatch.

## 1. Objective
Delete every remaining piece of the XP / levels / streaks / achievements system (the UI was removed in Sprint 137), with **zero change to payment, notification, auth, invitation, or audit behavior**. Produce a migration that drops the gamification database objects; Claude applies it AFTER the code ships.

## 2. Context
- Branch `main`, HEAD `ebe70ef`. Inventory verified 2026-10-02 (file:line below are from that scan — re-confirm before editing).
- **Security:** `public.award_xp(uuid,text,integer,text,jsonb)` and `public.update_streak(uuid,text)` are `SECURITY DEFINER`, no `search_path`, and EXECUTE is granted to `anon` and `authenticated` — anyone with the public anon key can write XP/streak rows for any user ID. The app calls both only via the service-role admin client. (Claude may revoke EXECUTE live as a stopgap before this sprint; the migration must be safe whether or not that happened.)
- Live data (2026-10-02): `user_gamification` 23 rows, `xp_events` 70, `user_achievements` 28, `achievements` 12 (seed). `notifications` rows with type `achievement_unlocked`: **0**.
- Every XP award is fire-and-forget: `void awardXp(...).catch(sideEffectError(...))`. None is awaited or gates logic.
- No gamification cron exists (`vercel.json` has only `generate-charges` and `verify-stripe-accounts`).

## 3. In scope
**A. Server call sites — remove ONLY the XP/streak statement (and its now-unused locals/imports):**
| File | What to remove | What MUST stay |
|---|---|---|
| `app/actions/units.ts` ~64-76 | `awardXp` "unit_added" | the enclosing `if (createdUnit?.id)` and `logAudit` |
| `app/actions/properties.ts` ~118-130 | `awardXp` "property_added" | the `if (property?.id)` and `logAudit` |
| `app/actions/lease-mutations.ts` ~108-112 | `awardXp` "lease_created" | everything else |
| `app/actions/maintenance-ticket-actions.ts` ~244-260, ~387-404 | "ticket_submitted" award; the resolved-only `if` block that contains only the award | notification try/catch and all status logic |
| `app/actions/tenant-invitations.ts` ~127-139, ~273-285 | both "tenant_invited" awards | `notifyOwnerMembers…`, `logAudit`, `revalidatePath` |
| `app/actions/document-packets.ts` ~250-253 | "document_signed" award | everything else |
| `app/actions/charges.ts` ~538-555 | `const isOnTime` + the `awardXp` call | the `if (tenantProfile?.id)` block and its payment-recorded notification (~522), `logAudit` |
| `lib/stripe-webhook-handlers.ts` | `queuePaymentXp()` helper, the `queueXp` field in `PaymentParams`, its default, the `if (queueXp)` call, and `queueXp: true` in `handlePaymentIntentSucceeded` | `queuePaymentNotifications`, the `received(...)` return value, all other params and logic |
| `app/auth/callback/route.ts` ~95-101 | `updateUserStreak(...)` + import | invitation acceptance, owner notification, every redirect |

**B. Read paths:**
- `app/manager/page.tsx`: remove `getUserGamification` from the positional `Promise.all` (~224) **and** its destructured name (~178) together, plus the prop (~254). Re-verify every later destructured variable still lines up.
- `app/owner/owner-page-data.ts`: remove `"gamification"` from `OwnerBundleId` (~71), the field (~151), the default bundle set (~264), the `Promise.all` entry (~669-671) **and** its destructured name (~607) together, the return (~795); `app/owner/page.tsx` ~160 prop.
- Dashboard plumbing: `components/dashboard/types.ts` (~27, ~112), `dashboard-kpi-loader.ts` (~109-114, ~191), `dashboard-data-loader.tsx` (~24, ~246).

**C. Delete:** `lib/gamification.ts`; `app/api/gamification/**`; `app/achievements/loading.tsx`. **Keep** `app/achievements/page.tsx` (redirect stub for old links) and update its test if it references the skeleton.

**D. Other references:**
- `scripts/smoke-web.sh` ~82-87: remove the "gamification API auth guard" check (it would fail with 404 once the route is gone).
- `apps/web/tests/e2e/tenant-flows.spec.ts` ~71-77: replace the broken "opens achievements page" test with one asserting `/achievements` redirects to the role home.
- `middleware.ts` ~12: remove `/achievements` from protected prefixes ONLY if the redirect page itself handles signed-out users safely; otherwise keep it and say why in `deviations`.
- `lib/notifications.ts` ~40 and `lib/validations-auth.ts` ~230: remove `achievement_unlocked`. `lib/__tests__/notification-actions.test.ts` ~77, ~92: switch to a different invalid-type placeholder string.
- `lib/delinquency.ts` ~313: rent-reminder copy "Pay now to keep your streak going!" → "Pay now to avoid a late fee." ONLY if the reminder context already involves a late fee; otherwise "Pay now so you stay on track." (Plain language, ≤12 words.) Log it.
- `app/actions/account-wipe.ts` ~774-776: remove the three gamification deletes.
- `scripts/seed-demo.ts`: remove achievement/XP/streak seeding, fields, the "keep your streak" text (~948), and the log line.
- Tests: drop `@/lib/gamification` mocks in `lib/__tests__/stripe-webhook-handlers.test.ts`, `app/actions/__tests__/properties.test.ts`, `app/actions/__tests__/charges.test.ts`; delete `lib/__tests__/gamification.test.ts`; update `lib/__tests__/owner-page-data.test.ts` bundle list. `lib/__tests__/logger.test.ts` "award_xp" sample strings: replace with a neutral sample.
- `docs/design-system.md` ~122-137: replace the gamification section with one line: "Removed in Sprints 137 and 141."

**E. Migration (write, do NOT apply):** `supabase/migrations/20261002_sprint141_drop_gamification.sql`, idempotent, one transaction:
1. `REVOKE ALL ON FUNCTION public.award_xp(uuid,text,integer,text,jsonb) FROM PUBLIC, anon, authenticated;` and same for `update_streak(uuid,text)` (guarded with `IF EXISTS` via a DO block so it is safe if already revoked/dropped).
2. `DROP FUNCTION IF EXISTS` both functions.
3. `DROP TABLE IF EXISTS public.user_achievements, public.xp_events, public.user_gamification, public.achievements;` (dependency order; no CASCADE unless you have proven nothing else depends — state which).
4. Recreate `notifications_type_check` without `'achievement_unlocked'`: copy the CURRENT definition from `20260413_sprint108_announcements.sql` ~48-74 exactly, minus that one value. Precede with a guard that RAISEs if any `notifications.type = 'achievement_unlocked'` rows exist.
5. A header comment: purpose, that code must be deployed first, and a rollback note (recreate from `20260308_sprint7_gamification_foundation.sql`; XP data is not restored — acceptable, it was never user-visible after Sprint 137).

## 4. Out of scope
- Any change to payment amounts, Stripe calls, webhook event handling beyond deleting the XP helper/flag, notification sending, invitations, audit logging, auth/role checks, redirects.
- Applying the migration, DB writes, deploy, env/secret changes, commit, push.
- Legacy-palette cleanup in UI files.

## 5. Exact files expected to change
Every file named in §3 A–E (plus deletions in §3C, the new migration, and the test files named). Nothing else. If a re-scan finds another gamification reference not listed, list it in `deviations` and do NOT edit it.

## 6. Implementation requirements
- Re-scan first (`rg -n -i "gamification|awardXp|XP_VALUES|updateUserStreak|award_xp|update_streak|achievement|streak" apps/web scripts supabase/migrations --glob '!node_modules'`) and confirm each hit is covered by §3.
- For every edited server action / handler, the diff must show ONLY removed lines (plus import line edits). If removing a statement would require changing any other line, stop and report it in `deviations`.
- Positional `Promise.all`: after editing, add a short unit/snapshot assertion OR explicitly show in your report the before/after variable-to-promise mapping for both files.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands
```bash
npm run gate:web
rg -n -i "gamification|awardXp|XP_VALUES|updateUserStreak|award_xp|update_streak|achievement_unlocked|user_achievements|xp_events|keep your streak" apps/web scripts --glob '!node_modules'
git diff -U0 apps/web/lib/stripe-webhook-handlers.ts apps/web/app/actions/charges.ts apps/web/app/auth/callback/route.ts | grep '^+' | grep -v '^+++'
```
Command 2: zero lines except `app/achievements/page.tsx` (redirect stub), the e2e redirect test, and the new migration file — list any others. Command 3: must print nothing except changed import lines.

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled — real result).
- Sweep clean per §7.
- Webhook handler, `charges.ts`, and auth callback diffs are removal-only (plus import lines).
- Both `Promise.all` mappings proven aligned.
- Migration file present, idempotent, guarded, not applied.
- No files outside §5 changed.

## 9. Report format
Final message must conform to `docs/codex-report-schema.json`. Put the `Promise.all` before/after mappings and the migration's CASCADE decision in `self_verification.findings`; the rent-reminder copy change in `copy_changes`.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude. Claude will: run the gate, deploy code, verify payments/webhook/login via smoke + Sentry, THEN apply the migration via Supabase and re-verify.
