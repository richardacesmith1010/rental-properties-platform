# Sprint 211b — Notification rules v1: finish the tests (follow-up to 211; uncommitted 211 work is in the tree, keep it all)

## 1. Objective
Sprint 211's code logic passed review. Its tests did not fully prove the acceptance criteria (CLAUDE.md L-017). Add and strengthen tests only. Change production code **only** if a new test exposes a real bug, and report it if so.

## 2. Context
- HEAD `fcb4647`, with the 211 changes uncommitted in the working tree.
- Packet: `docs/sprint211-codex-prompt.md` rev 3, §8.
- The full gate is green (1926 tests).

## 3. In scope
Make each test call the real code under test (fan-out, `createNotificationWithDelivery`, the action or webhook handler).
1. **Test helper** (`lib/__tests__/notification-test-helpers.ts`): the fake Supabase must apply `.eq("active", …)` (and other `.eq` filters) to the rows it returns. Then rewrite the "inactive `property_managers` row" and "inactive `ownership_account_managers` link" cases with rows that **exist but have `active: false`**. Assert no notification for that manager.
2. **Stripe receipt, outside Domus:** Stripe payment succeeded on a lease with `collects_outside_domus` true, then null. In both cases the tenant gets no `payment_recorded` and the owners do. Use `stripe-webhook-handlers.test.ts`.
3. **Autopay and bank failure, outside Domus:** the lease flag is true, and the tenant **still** gets the failure notice (Domus payment). Owners and client-home managers get theirs.
4. **Late fee with a null flag:** in `charge-generation.test.ts`, a lease with a null or unreadable flag. Assert the documented fee behavior is unchanged, and the tenant gets no late notice while owners do.
5. **Allowlisted tenant, other tenant's rent:**
   - In test mode, tenant A's email is on the allowlist.
   - A rent event (late fee or receipt) on tenant B's lease produces no notification for A.
   - B gets nothing unless listed.
6. **Ticket comment actor exclusion through real fan-out:** cover comments by the tenant, the owner and the manager. Assert the author gets no row, everyone else on that home (and the ticket's tenant) gets an in-app row, and no email is sent. Also cover a person who is both owner and manager.
7. **`createMaintenanceTicket`:** the tenant who reports a problem gets no notification. Owners and managers of that home do, and managers of other homes don't.
8. **Partial failure:**
   - owner-1's upsert fails, and owner-2 still gets its in-app row **and** its delivery row (and email in `on` mode);
   - no one else is added;
   - each row's title and body match that recipient's own event only.
9. **Message sender:** exercise the inbox send action (`app/actions/inbox.ts` or `lib/inbox/action-helpers.ts`). The sender gets no notification and the other side does.

## 4. Out of scope
Everything else. No rule changes. No copy changes.

## 5. Exact files expected to change
- `apps/web/lib/__tests__/notification-test-helpers.ts`
- `apps/web/lib/__tests__/notification-fanout.test.ts`
- `apps/web/lib/__tests__/stripe-webhook-handlers.test.ts`
- `apps/web/lib/__tests__/charge-generation.test.ts`
- `apps/web/lib/__tests__/notifications.test.ts`
- `apps/web/app/actions/__tests__/maintenance-ticket-notifications.test.ts`
- `apps/web/app/actions/__tests__/maintenance-comment-actions.test.ts`
- an inbox action test (new or existing)
- production files only if a test exposes a bug (report each one)

## 6. Implementation requirements
- Lines ≤ 140. No new dependencies.
- No tautologies: every assertion must depend on the output of the code under test.

## 7. Validation commands to run
- The changed test files: `cd apps/web && npx vitest run <files>`
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npx vitest run` for the whole web suite
- Do **not** run `npm run gate:web`: it reads the database. Claude runs it.

## 8. Acceptance criteria (binary)
1. Items 1–9 each have at least one named test that fails if the behavior breaks. To show this, temporarily flip one line of production logic per item, confirm the test fails, then revert. Report which line you flipped.
2. The whole web suite, lint and typecheck are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, plus a table of item → test file › test name → the line flipped for the check. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB access, deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/mobile` or `apps/ios`.
