# Sprint 162 — Tenant clarity 2/2: tenants can message their landlord

**Severity: L3** — ChatGPT review: APPROVE WITH CHANGES; all 5 required + 5 optional adopted. (New tenant-callable server action that writes inbox data; authorization surface.) Model: gpt-6-sol, medium.

## 1. Objective
Let a tenant start (or continue) one conversation with their landlord from the Messages page and the Home "Message landlord" tile, as in the approved mockup (canvas https://claude.ai/artifact/GKgJPNk7dLiLYdXUCchLpV, board "Message + report a problem (phone)"). Today a tenant cannot start a thread: `createInboxThread` requires `canUserAdministerProperty`, and `sendInboxMessage` only lets a tenant reply inside a thread the landlord created (`entity_type = "tenant_profile"`, `entity_id = tenant`).

## 2. Context
- Branch `main`, HEAD = after Sprint 161 is committed (docs-only after that is fine). Paths under `apps/web/`.
- `app/actions/inbox.ts` (749 lines): tenant lease check helper (~L130-150: active lease for the tenant on the property's units, admin client); `findOrCreateTenantThread({propertyId, recipientProfileId, subject, createdByProfileId})` (~L152-195, admin client, matches `property_id + entity_type="tenant_profile" + entity_id + subject`); `insertInboxMessage` (~L197); `touchInboxThread` (~L217); `createInboxThread` (L383, admin-only, rate limit `createInboxThread:${user.id}` 20/min); `sendMessageToTenant` (L425, `requireAuth("owner","manager")` + `canUserAdministerProperty`); `sendInboxMessage` (L507, tenant reply rules L539-544). Notifications go through `createNotificationWithDelivery` (respects the `DOMUS_NOTIFICATIONS_ENABLED` master switch — must stay respected). Auth helper `app/actions/auth-helpers.ts` `requireAuth`. RLS policies for `inbox_threads`/`inbox_messages` in `supabase/migrations/20260302_phase10_leasing_inbox_automations.sql:223-240`.
- Tenant UI: `components/dashboard/inbox-section.tsx` (Threads tab; create-thread form only when `onCreateThread` passed; reply box only after selecting a thread); `app/tenant/page.tsx` passes only `onSendMessage={sendInboxMessage}`.

## 2b. Database (applied by Claude BEFORE this sprint — do not write migrations)
Live `inbox_threads` had no uniqueness guarantee (only pkey + two plain indexes; 0 tenant threads existed). Claude applies `supabase/migrations/20261005_sprint162_tenant_thread_unique.sql`:
`create unique index if not exists inbox_threads_tenant_profile_unique on inbox_threads (property_id, entity_id, subject) where entity_type = 'tenant_profile';`
Your code must rely on it: on insert conflict (Postgres `23505`), re-select and reuse the existing thread.

## 3. In scope
1. **New action** `startTenantConversation(prev, formData)` in `app/actions/inbox.ts` (AGENTS.md §3 order):
   1. `requireAuth("tenant")` (session only; never a user id from the client).
   2. Zod: `body` trimmed 1–2000 chars; optional `propertyId` (uuid).
   3. Rate limit `startTenantConversation:${user.id}` (e.g. 10/min).
   4. Resolve the tenant's **active** leases → their property ids. If `propertyId` is given it must be one of them; if omitted and exactly one property exists, use it; if several, return "Choose which home this is about." No active lease → "You need an active lease to message your landlord."
   5. Thread: reuse `findOrCreateTenantThread` with the **fixed, server-side constant** subject `TENANT_CONVERSATION_SUBJECT = "Messages with your landlord"` (never user-controlled), `recipientProfileId: user.id`, `createdByProfileId: user.id`. Make creation **conflict-safe**: if the insert hits the unique index (`23505`), re-select and use the existing thread. One thread per tenant per property is guaranteed by the index + this handling.
   - **Service-role rule:** every admin-client read/write in this action uses only the session tenant id and the server-validated active-lease property id; no helper may take a client-supplied profile id, and no mutation may run before step 4 completes.
   6. `insertInboxMessage` (sender = tenant) and `touchInboxThread`; check every mutation's error (L-002). **Partial-failure results:** thread created/reused but message insert fails → return an explicit error ("Your message didn't send. Please try again."); the empty thread may remain and a retry reuses it. Message inserted but `touchInboxThread` fails → log it (safe ids only) and still return success (don't invite a duplicate resend).
   7. Notify only profiles **currently authorized to administer that exact property**, using the same canonical property-admin relationship the rest of Domus uses (owner account members / assigned managers — reuse the existing helper, don't invent one); never the tenant, former managers, or managers without access to that property; de-duplicate recipients. Send through `createNotificationWithDelivery` (master switch keeps it silent until launch). Notification failure must not fail the send; log only safe identifiers + a bounded error category — never the raw error object, message text, notification body, or emails.
   8. `revalidatePath("/tenant")` and the owner/manager inbox paths; return `{ success: "Sent. Your landlord will see it in Messages." }` or explicit errors (never silent).
2. **Tenant UI (incl. multi-home):** if the tenant has more than one active-lease home, the composer shows a "Which home?" select (their homes only) and sends `propertyId`. Messages page shows the tenant's thread(s) auto-selected with the reply box always visible; with no thread, show a composer "Message your landlord" (textarea + Send) that calls `startTenantConversation`. Home "Message landlord" tile goes straight to this composer/thread. Copy per mockup.
3. **Owner/manager side:** the new thread appears in their existing Messages list for that property and they can reply with the existing tools (verify; no UI change unless a thread from a tenant doesn't show — then fix minimally and say why).

- Note in the report whether `checkRateLimit` is process-local; if so it is abuse friction, not a hard distributed limit (acceptable for now).

## 4. Out of scope / invariants
- No schema/RLS changes beyond Claude's pre-applied unique index (§2b); if you believe more is required, STOP and report.
- `createInboxThread`, `sendMessageToTenant`, `sendInboxMessage` behaviour unchanged for every role. Notifications master switch respected.
- Do NOT modify or revert any file not listed in §5 — including `.claude/launch.json` or anything you did not create in this sprint.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`app/actions/inbox.ts`, `app/actions/index.ts` (export, if that is the convention), `app/tenant/page.tsx` (pass the action), `components/dashboard/inbox-section.tsx`, `components/dashboard/tenant-overview.tsx` (tile target only, if needed), plus tests (`app/actions/__tests__/inbox.test.ts`, component tests). ≤ 5 non-test files.

## 6. Implementation requirements
- Action tests: unauthenticated / non-tenant → rejected before any read; invalid body (empty, >2000) → validation error; rate limit enforced; no active lease → error, no writes; `propertyId` not among the tenant's active leases → error, no writes (cross-tenant/cross-property attempt); single-lease tenant without `propertyId` → uses that property; multi-lease without `propertyId` → asks to choose; second call reuses the same thread (no duplicate thread); message insert error → explicit error; notification failure → send still succeeds and logs; notifications off → no notification rows (master switch).
- Plus: **concurrent** double-call test (two simultaneous starts → one thread, two messages); **cross-tenant** test (tenant A supplies tenant B's property id → zero thread/message/notification writes); recipients test (only current admins of that property, de-duplicated, never the tenant); conflict (`23505`) path reuses the thread; touch-failure still returns success; logging test asserts no message text/emails in logged payloads; subject is the constant.
- Existing inbox tests pass unmodified.
- UI tests: tenant with no thread sees the composer; after send, the thread view shows the message and the reply box; owner/manager inbox lists the tenant-started thread.
- Targeted validation (Claude runs the full gate): lint, typecheck, and the vitest files you touched/added.
- Plain words, ≤12 words per sentence; tokens only; light + dark; 390 px + 1280 px; 44 px targets. The user should never need to read instructions to complete this flow; every step must be self-explanatory.
- No PII in logs (log ids, never message text or emails). Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run lint:web
npx tsc -p apps/web/tsconfig.json --noEmit
cd apps/web && npx vitest run app/actions/__tests__/inbox.test.ts <component tests you touched or added>
git diff --stat
```

## 8. Acceptance criteria (binary)
- Lint, typecheck and targeted tests pass.
- `startTenantConversation` follows the §3.1 order, derives the user from the session, and cannot write to a property the tenant has no active lease on (tests).
- One thread per tenant per property; reuse proven by test.
- Tenant can start and continue a conversation; owner/manager see and reply to it.
- No schema/RLS change; other inbox actions unchanged; notifications master switch respected.
- Only §5 files changed; nothing else modified or reverted.

## 9. Report format
Conform to `docs/codex-report-schema.json` (set `gate_passed` from the targeted checks and say so). `self_verification.findings`: the action's step order, how property scoping is enforced, the thread subject/reuse rule, notification behaviour with the switch off, tests added.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
