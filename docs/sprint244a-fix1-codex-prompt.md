# Sprint 244a-fix1 — Finish 244a: stale webhook assertions, overdue consent test, legacy failed rows (L3 follow-up)

## 1. Objective
Sprint 244a (uncommitted in the working tree — keep all of it) is reviewed and correct, with three gaps:
1. `apps/web/lib/__tests__/stripe-webhook-handlers.test.ts` (562 lines) still expects the manager-fee notice to use
   `entityType: "rent_charge"`, `entityId: "charge-1"` (around lines 334 and 369). 244a deliberately moved it to
   `entityType: "manager_payment"` with the manager transfer id. Update only those expectations.
2. No test proves the **overdue follow-up** (`delinquency_escalation`, `lib/delinquency.ts`) to a tenant respects the
   tenant's own preference/pause (N3 for overdue). The code does it via the merge inside
   `createNotificationWithDelivery`; add the test.
3. Legacy email rows (created before 244a) have `email_request_body = null`. Today 3 such rows are `failed`. On a retry,
   `sendNotificationEmail` (`lib/notification-email.ts`) reclaims them and then marks them
   `"Not sent: recipient changed"` because the stored body is empty. Instead: when the reclaimed row has
   `email_request_body` null **and** its `error_message` does not start with `"Unknown result: "`, send the freshly
   built body and store it on the row in the same fenced reclaim update (`email_request_body`, and
   `first_attempt_at = now` only if it is null). Legacy rows with an `"Unknown result: "` message and null body stay
   terminal (logged, not sent).

## 2. Context
HEAD `5817b47` + uncommitted 244a. Packet `docs/sprint244a-codex-prompt.md` rev 6 (ChatGPT APPROVE) still governs.

## 3. In scope
The three items above only.

## 4. Out of scope
Every other behavior of 244a. Migrations (unchanged). Any copy.

## 5. Exact files expected to change
- `apps/web/lib/__tests__/stripe-webhook-handlers.test.ts` (the two expectations only)
- `apps/web/lib/__tests__/delinquency.test.ts`
- `apps/web/lib/notification-email.ts`
- `apps/web/lib/__tests__/notifications-on-mode.test.ts`

## 6. Implementation requirements
Fenced reclaim stays a single compare-and-set update (same `where` as today: id, status `failed`, claim token). Every
Supabase error checked. Lines ≤ 140 characters.

## 7. Validation
```
cd apps/web
npx vitest run lib/__tests__/stripe-webhook-handlers.test.ts lib/__tests__/delinquency.test.ts lib/__tests__/notifications-on-mode.test.ts
npm run gate:web
```

## 8. Acceptance criteria
- F1 The two webhook tests assert `entityType: "manager_payment"` and the transfer id (`"tr_manager_123"` or the id
  the handler actually uses — report which) and pass.
- F2 `delinquency.test.ts` "N3 overdue": tenant `delinquency_escalation: false` → no tenant Resend call, tenant in-app
  row still written; tenant paused → same, reason `"paused"`; team recipient unaffected.
- F3 Legacy reclaim: existing `failed` row with null body and message `"Resend error 422"` → reclaimed, the fetch body is
  the freshly built body, the row ends `sent` with `email_request_body` equal to that body and `first_attempt_at` set;
  a legacy row with message `"Unknown result: timeout"` and null body → no fetch, stays `failed`.
- F4 `npm run gate:web` passes (report counts verbatim).

## 9. Report format
Compact status only. Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact
status only.

## 10. Constraints
Stay inside §5. Do not commit. Do not apply migrations. The user should never need to read instructions to complete
this flow (no UI change).
