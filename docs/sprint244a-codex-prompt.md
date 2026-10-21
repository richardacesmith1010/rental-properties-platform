# Sprint 244a — Notifications correct before "on" (L3) — rev 6 APPROVED (rev 1 REJECT → rev 2 REJECT → rev 3 AWC → rev 4 AWC → rev 5 AWC → rev 6 APPROVE)

## 1. Objective
Make every automated notification correct in **on** mode before the owner turns notifications on for real people
(launch item A5). Today: tenants' own settings are ignored for their rent messages; new-message emails fail in on mode;
a second email about the same rent charge can never be sent (60/90-day follow-ups, autopay failure after a late notice,
a second manual reminder); cron results count skipped sends as "sent"; manager invoice emails skip the notifications
switch. Nothing in this sprint sends anything to a real person: production stays in **test** mode (allowlist).

## 2. Context
- HEAD: see `git log -1` (243a time-zone work may be committed just before this). Next.js 15 `apps/web`, Supabase.
- Gate: `lib/notifications-switch.ts` (`notificationMode()` off/test/on; allowlist wins). Delivery:
  `lib/notifications.ts` (333 lines) `createNotificationWithDelivery` (line ~170): upserts `notifications` on unique
  `(recipient_profile_id, type, entity_type, entity_id)`, then emails only if no `sent` email row exists for that
  notification (`lib/idempotency.ts:33` `shouldRecordSuccessfulDelivery`). Team fan-out: `lib/notification-fanout.ts`.
- Preferences: `profiles.notification_preferences` jsonb (7 keys, default true) + `notifications_paused_until`;
  `lib/notification-preferences.ts` (`resolveNotificationDeliveryPreference` ~216), `lib/notification-preference-store.ts`
  (`getPropertyNotificationDeliveryPreferences` ~83 — owner-side, most restrictive across owners).
- Tenant rent messages pass `deliveryPreference: deliveryByPropertyId.get(...)` (owner prefs) and so skip the tenant's:
  `lib/delinquency.ts` (rent due ~250, overdue follow-ups ~35–230), `lib/charge-generation.ts` late notice ~366,
  `lib/lease-lifecycle.ts` lease expiring ~95/~230.
- `app/actions/inbox.ts:134` passes no `recipientEmail`; in on mode the email records failed "Recipient email missing".
- `notification_deliveries`: `id, notification_id, channel, status, provider_ref, error_message, attempted_at`.
- Live test window (Oct 1–20): 12 overdue + 4 receipt deliveries, all `sent`, 0 failed.

## 3. In scope
1. **Tenant consent on tenant-facing automated rent/lease messages.** For rent due reminder, late notice, overdue
   follow-up and lease expiring sent **to a tenant**: deliver a channel only if the owner-side property preference
   allows it **and** the tenant's own preference + pause allow it (most restrictive wins, per channel). Team recipients
   keep using their own preferences (unchanged).
2. **Recipient email lookup in every mode.** In `createNotificationWithDelivery`, when email will be sent and
   `recipientEmail` is missing, read `profiles.email` for the recipient (one query; reuse the test-mode lookup so there
   is still exactly one profile read per call). No email → record `failed` with the existing message (unchanged).
3. **Email key + race-safe claim + provider idempotency.** Add nullable `notification_deliveries.email_key text`,
   `claim_token uuid`, `first_attempt_at timestamptz` and `email_request_body text` (both set once by the claim insert,
   **never updated**), and (after deploy, see Order) a **unique** index on `(notification_id, channel,
   coalesce(email_key, ''))` where `channel = 'email'` (live 2026-10-20: 0 notifications have more than one email row;
   67 sent / 3 failed). New optional param `emailKey?: string` on `createNotificationWithDelivery`.
   - **Key rules:** `emailKey` must match `/^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/` (Stripe ids such as
     `pi_3Nx…` / `in_1Ab…` are valid as-is, case preserved); anything else (empty, whitespace, spaces, dots, slashes) throws `TypeError("Invalid email key")` before any write (callers are internal). Omitted/undefined = null.
   - **Claim:** insert `{ notification_id, channel: 'email', status: 'pending', email_key, claim_token: <new uuid>,
     attempted_at: now, first_attempt_at: now, email_request_body: <the exact JSON string that will be the fetch body> }`. Success = this call owns the send.
   - On unique violation (`23505`), read the existing row. `sent` or `pending` (any age) → skip, reason `"duplicate"`.
     **Pending rows are never reclaimed automatically** (their outcome is unknown; they are logged for a person to
     check). `failed` → reclaim by compare-and-set: `update … set status = 'pending', claim_token = <new uuid>,
     attempted_at = now where id = … and status = 'failed' and claim_token is not distinct from <token read>`; own the
     send only if exactly 1 row was updated, else skip `"duplicate"`.
   - **Send** only when owning the claim, with header `Idempotency-Key` = `domus-n-<notification_id>` when the key is
     null, or `domus-n-<notification_id>-k-<email_key>` when set (distinct namespaces: no null/explicit collision).
     Resend keeps keys 24 h; same key + same payload returns the original result without sending.
   - **Identical bytes on retry:** build the request object once (`{ from, to: [recipient], subject, html, text }` —
     notification emails have **no cc/bcc**), serialize once with `JSON.stringify`, store that exact string in
     `email_request_body` (a `text` column, so no key reordering), and pass that same string as the `fetch` body.
     Every reclaim sends the **stored string** unchanged (never rebuilt), even if the notification title/body has since
     changed (the in-app row shows the newer text; the email retry stays the original).
   - **Gate before every send, including retries:** a retry only happens inside a normal `createNotificationWithDelivery`
     call, after the mode check, the recipient allowlist (test mode), self-send rule, preferences and pause have all
     passed for the **current** state. In addition, before sending a stored body, parse it and require that its `to`
     is exactly one address equal to the recipient's current email (and, in test mode, allowlisted) and that it has no
     `cc`/`bcc`; otherwise do not send, mark the row `failed` `"Not sent: recipient changed"` (terminal).
   - **Exposure:** recipients can already read their own delivery rows (RLS `notification_deliveries_select_self`;
     `anon`/`authenticated` have SELECT, no writes). The stored body contains only the sender address, the recipient's
     own address and the email they received — no other person's address, no tokens, no internal ids beyond what the
     email itself shows. No grant changes. Logs never include the body (ids, keys and status only).
   - **Record** with a fenced update: `… where id = … and claim_token = <my token>`. 0 rows updated → log, return the
     provider outcome, never insert another row.
   - **Provider outcome rules** (branch on the Resend JSON error `name`, not the status alone; the code uses raw
     `fetch`, so read `json.name`): 2xx → `sent` (+ `provider_ref`). 409 `concurrent_idempotent_requests` (another
     request with this key is still processing) → `failed`, `error_message` `"Unknown result: concurrent request"`
     (uncertain; retryable under the deadline rule). 409 `invalid_idempotent_request` (key already used with a
     different payload) → `failed`, `error_message` `"Not sent: key reused with different content"`, **terminal**
     (never retried automatically; logged for a person). Other 4xx except 429 → `failed`, definitive, retryable.
     429, 5xx, any other 409, network error or timeout → `failed`, `error_message` prefixed `"Unknown result: "`.
   - **Retry deadline:** a `failed` row whose `error_message` starts with `"Unknown result: "` may be reclaimed only
     while `now - first_attempt_at < 20 h` (immutable; reclaim updates `attempted_at` and `claim_token` but never
     `first_attempt_at`). After that it stays `failed` and is logged. Definitive `failed` rows (plain 4xx) are
     retryable any time (Resend did not accept them). Terminal rows (`"Not sent: "`) are never reclaimed.
   - **Guarantee (state it in a code comment, do not claim more):** at most one email per (notification, key) from
     Domus's side; across an unknown provider outcome, duplicates are prevented by Resend's 24 h idempotency because
     retries use the same key and payload and stop 20 h after the first attempt.
   - Keys: overdue follow-ups `overdue-30|60|90`; manual reminder `manual-reminder-<yyyy-mm-dd America/Denver>` (one per
     day); autopay / bank payment failure `payment-failed-<stripe object id as-is>`. Late notice and rent due pass
     no key. In-app behavior is unchanged (one row per notification, text updated).
   - **Order / compatibility (Claude runs it):** step 1 migration adds the four columns only (no index) — harmless for the
     currently deployed code, whose only writer is `insertDeliveryRecord` in `lib/notification-email.ts:86` (account
     wipe only deletes; no database function writes this table). Step 2 deploy this code. Step 3 second migration
     creates the unique index (table is tiny; plain `create unique index`). Between steps 2 and 3, the claim still works
     (it is just not race-proof); production is in test mode throughout. The admin (service-role) client does all
     three writes; no grant changes. `insertDeliveryRecord` is changed so **every** email row goes through the claim
     (no other code path inserts email rows).
   - **Missing column at runtime** (`42703`): on the claim insert → no Resend call, email `skipped` reason `"error"`;
     on the record update after a successful send → email `sent`, logged error, row stays `pending` (never resent).
4. **Manager fee notice vs. client-home receipt collision** (`lib/stripe-webhook-handlers.ts` ~433 and ~471): the
   manager-fee notice must use its own `entity_type` (`"manager_payment"`, entity id = the manager payment id) so the
   two never share a row. Claude checked live 2026-10-20: `notifications.entity_type` has **no** check constraint (only
   `type` is constrained), so `"manager_payment"` is valid.
5. **Honest results.** `createNotificationWithDelivery` returns
   `{ inApp: { status: "sent" | "skipped"; reason?: Reason }, email: { status: "sent" | "failed" | "skipped"; reason?: Reason } }`
   with `Reason = "off" | "test_not_allowed" | "preferences" | "paused" | "self" | "duplicate" | "error"` (existing
   callers that ignore the result keep compiling). Counting rule for a recipient: **sent** if any channel is `sent`;
   **emailed** if email is `sent`; **skipped** if no channel is `sent` (a `failed` email with no in-app counts as
   skipped and is logged). Cron summaries in `delinquency.ts`, `charge-generation.ts` and `lease-lifecycle.ts` use
   exactly `"<Label>: <sent> sent, <emailed> emailed, <skipped> skipped."` — labels `Reminders`,
   `Overdue rent follow-ups`, `Late notices`, `Lease notices`.
6. **Manager invoice email through the switch.** `app/actions/manager-payments.ts` → `lib/invoice-email.ts`: off → do not
   send; test → send **only if the primary `to` recipient is allowlisted** (a non-allowlisted primary means no send at
   all — an allowlisted CC never gets promoted or sent alone); keep only allowlisted CCs; on → send to all. Preference check uses the
   **recipient's** `manager_invoice` preference (not the sender's).
7. Migration file for item 3 (Claude applies it live after review).

## 4. Out of scope
- Turning notifications on, changing env vars, or sending to anyone. Invites (tenant, LLC, manager) stay as they are:
  they are sent because a person pressed Invite (decision recorded by Claude 2026-10-20).
- Settings UI changes, role-filtered toggles, repair "in progress" notices (Sprint 244b).
- Push/SMS. Rent "today" time-zone logic. Any copy change except the cron summary strings in item 5.

## 5. Exact files expected to change
- `supabase/migrations/20261030_sprint244a_delivery_email_key.sql` (new: four columns)
- `supabase/migrations/20261031_sprint244a_delivery_email_once_index.sql` (new: unique index)
- `apps/web/lib/notification-email.ts` (claim/record/Idempotency-Key)
- `apps/web/lib/notifications.ts`
- `apps/web/lib/idempotency.ts`
- `apps/web/lib/notification-preferences.ts` and/or `apps/web/lib/notification-preference-store.ts` (merge helper)
- `apps/web/lib/delinquency.ts`
- `apps/web/lib/charge-generation.ts`
- `apps/web/lib/lease-lifecycle.ts`
- `apps/web/lib/stripe-webhook-handlers.ts` (keys + manager-fee entity only; no other edits — file is 999 lines)
- `apps/web/app/actions/notifications.ts` (manual reminder key)
- `apps/web/app/actions/manager-payments.ts`, `apps/web/lib/invoice-email.ts`
- Tests: `apps/web/lib/__tests__/notifications.test.ts`, `notification-preferences.test.ts`, `delinquency.test.ts`,
  `charge-generation.test.ts`, `lease-lifecycle-notifications.test.ts`, `apps/web/app/actions/__tests__/notifications.test.ts`,
  new `apps/web/lib/__tests__/notifications-on-mode.test.ts`, new `apps/web/lib/__tests__/invoice-email-gate.test.ts`

## 6. Implementation requirements
1. Migration 1: `alter table public.notification_deliveries add column if not exists email_key text, add column if not
   exists claim_token uuid, add column if not exists first_attempt_at timestamptz, add column if not exists
   email_request_body text;`. Migration 2: `create unique index if not exists notification_deliveries_email_once on
   public.notification_deliveries (notification_id, channel, coalesce(email_key, '')) where channel = 'email';`.
   No RLS or grant changes. Each file ends with a rollback comment block (migration 2: `drop index if exists
   notification_deliveries_email_once;` — migration 1: drop `email_request_body`, `first_attempt_at`, `claim_token`,
   `email_key`).
2. Tenant merge helper: one exported pure function `mergeDeliveryPreferences(a, b)` → per channel AND; email block
   reason = first non-null. Each side is resolved by the **existing** resolver (`resolveNotificationDeliveryPreference`
   + existing defaults for missing rows — no second default policy). Pinned pause/preference rule (today's resolver):
   a tenant preference `false` or an active tenant pause blocks **email only**; tenant in-app stays on. Tenant ids are
   de-duplicated and loaded in one batched query per cron run (`.in("id", uniqueTenantIds)`), never inside the loop.
3. Self-send rule, actor rule and off/test gate behave exactly as today.
4. Every Supabase call's `error` is checked (L-002). No query inside a loop (batch with `.in()`).
5. Lines ≤ 140 characters. No new dependencies.

## 7. Validation
```
cd apps/web
npx vitest run lib/__tests__/notifications.test.ts lib/__tests__/notifications-on-mode.test.ts \
  lib/__tests__/notification-preferences.test.ts lib/__tests__/delinquency.test.ts lib/__tests__/charge-generation.test.ts \
  lib/__tests__/lease-lifecycle-notifications.test.ts lib/__tests__/invoice-email-gate.test.ts \
  app/actions/__tests__/notifications.test.ts
npm run gate:web
```

## 8. Acceptance criteria (named tests calling real code; mock only Supabase/Resend/env)
- N1 Tenant rent due reminder: owner prefs on + tenant `rent_due_reminder: false` → no email, reason `"preferences"`;
  in-app still created. Tenant paused → no email, reason `"paused"`; in-app still created.
- N2 Owner prefs `rent_due_reminder: false` + tenant on → no tenant email (owner can still stop reminders).
- N3 Same as N1 for late notice (`late_rent`), overdue follow-up (`delinquency_escalation`), lease expiring
  (`lease_expiration`).
- N4 Tenant preferences loaded with one `.in("id", …)` query per run for 3 charges (assert call count = 1).
- N5 On mode, no `recipientEmail` passed → profile email looked up once, Resend called with it, delivery `sent`.
  Profile has no email → delivery `failed` with "Recipient email missing" (exact string as today).
- N6 Overdue follow-up at 30 then 60 days on the same charge → 2 Resend calls, 2 email delivery rows with keys
  `overdue-30`, `overdue-60`; repeating the 60-day run → still 2 (no third).
- N6c **Concurrency:** two `createNotificationWithDelivery` calls started together (`Promise.all`) with the same
  notification + key, against a fake store that enforces the unique index → exactly 1 Resend call, 1 email row `sent`,
  the other result email `skipped` reason `"duplicate"`. Same for null key.
- N6r Reclaim: `failed` row → retried once with the same `Idempotency-Key` and becomes `sent`; `pending` of any age →
  skipped `"duplicate"`, no Resend call; two simultaneous reclaims of one `failed` row → exactly 1 Resend call.
- N6f Fencing: a worker whose `claim_token` no longer matches (row reclaimed by another) updates 0 rows, inserts nothing,
  and does not overwrite the other worker's `sent` row.
- N6k Keys: null → one email per notification; `""`, `"  "`, `"a b"`, `"x.y"`, `"-lead"` → `TypeError`, no writes,
  no Resend call; `"overdue-60"`, `"payment-failed-pi_3NxAbC12"`, `"payment-failed-in_1AbCd"` accepted. Header is
  `domus-n-<id>-k-overdue-60` for a key, `domus-n-<id>` for null, and key `"none"` gives `domus-n-<id>-k-none` (≠ null).
- N6p Provider outcomes: 409 `concurrent_idempotent_requests` → `failed` `"Unknown result: concurrent request"`,
  retried next run with the same key + identical payload; 409 `invalid_idempotent_request` → `failed`
  `"Not sent: key reused with different content"`, never retried; 500 / timeout → `failed` `"Unknown result: …"`.
- N6d Deadline: unknown-result row with `first_attempt_at` 19 h ago → retried (and `first_attempt_at` unchanged after
  the retry); 21 h ago → not retried, no Resend call; a row retried at 10 h and failing again → still not retried at
  21 h after the **first** attempt. Definitive 4xx row at 30 h → retried.
- N6s A `failed` row is retried after the notification title/body changed: the `fetch` body string `===` the stored
  `email_request_body` (not the new text); the in-app row shows the new text; `email_request_body` and
  `first_attempt_at` are unchanged after the retry.
- N6g Retry re-gating: stored row exists, then (a) mode switched to off, (b) test mode and recipient no longer
  allowlisted, (c) recipient turned the preference off, (d) recipient paused, (e) recipient's email changed → no
  `fetch` call in every case; (e) marks the row `"Not sent: recipient changed"`.
- N6x Stored body has exactly one `to` (the recipient), no `cc`/`bcc`; log calls never contain the body or html.
- N7 Late notice twice on the same charge (no key) → 1 email (today's behavior pinned).
- N8 Manual reminder twice the same Denver day → 1 email; next Denver day → 2.
- N9 Autopay failure after a late notice on the same charge → its own email (`payment-failed-<id>`).
- N10 Manager-fee notice and client-home receipt for the same charge → two separate `notifications` rows.
- N11 Return value: test mode non-allowlisted → both channels `skipped` reason `"test_not_allowed"`; off → both
  `"off"`; tenant pref off → in-app `sent`, email `skipped` `"preferences"` (mixed outcome).
- N12 Cron summaries exactly, e.g. `"Reminders: 3 sent, 1 emailed, 2 skipped."`, for all 4 labels, including a
  mixed in-app-sent/email-skipped recipient counted as sent and not emailed (assert `toEqual`).
- N13 Invoice email: off → fetch not called; test + allowlisted primary + non-allowlisted CC → sent to primary only,
  CC dropped; test + non-allowlisted primary + allowlisted CC → fetch not called; on → sent with CC; recipient
  (manager) `manager_invoice: false` → not sent even if sender on.
- N14 Missing column (`42703`) on the claim insert → no Resend call, email `skipped` reason `"error"`, in-app `sent`,
  no throw. Missing column on the record update after a 2xx → email `sent`, error logged, no second Resend call.
Assert every listed fact; exact strings with `toEqual`; final state after retries; no `expect` inside mock
implementations; shared helper for "no Resend call" (L-030).

## 9. Report format
Compact status only: files changed (line deltas), N1–N14 → test names, validation counts verbatim, the migration SQL
verbatim, anything listed for Claude (e.g. entity_type constraint). Do NOT include 'Claude prompt' or 'recommended next
steps for Claude' sections. Report compact status only.

## 10. Constraints
- Stay inside §5; list anything else instead of editing it.
- Undo: no user-facing undo in this sprint. The migration is additive; rollback = drop the column (code tolerates it).
- Do not apply the migration; Claude applies it after review.
- The user should never need to read instructions to complete this flow (no UI change here).

## Claude rollout checks (not Codex)
Apply migration 1 → deploy → migration 2; then assert the unique index exists, is valid and matches the spec; re-check
grants/RLS on `notification_deliveries` as `authenticated` (a user reads only their own rows); add a read-only check
that lists pending and expired unknown-result rows (ids/keys/status only, no bodies) before notifications go "on".
