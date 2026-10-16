# Sprint 237h — Write the first repair-history row for tenant repairs (L3: auth/data integrity) — rev 3 (rev 1 REJECT → rev 2 APPROVE WITH CHANGES; all adopted)

App-code sprint for Codex. **No RLS, grant or schema change.** Claude applies a 2-row data backfill separately (§6.4).

## 1. Objective
When a tenant reports a repair, the first status-history row ("submitted") is never saved. Save it, without giving
tenants any new way to write `maintenance_status_history` directly.

## 2. Context
- HEAD `0732e3c` (after 237g). Supabase `vawqdqkaguhdgfhdebqw`.
- `apps/web/app/actions/maintenance-ticket-actions.ts` (338 lines). `createMaintenanceTicket`:
  - `requireAuth("tenant","owner","manager")`, rate limit, zod parse;
  - tenant: requires an active lease on the unit (line ~60); staff: `canUserAdministerProperty` (line ~71);
  - inserts the ticket with the **user's** client (line 79) — allowed by RLS;
  - line 112: `void logMaintenanceStatusChange(supabase, ticket.id, null, "submitted", user.id)` — same user client.
- `apps/web/lib/maintenance/enrichment.ts:263-280` `logMaintenanceStatusChange(client, …)` inserts and only
  `console.error`s on failure (it never throws).
- **Live RLS on `maintenance_status_history`** (2026-10-16): "Property admins can manage status history" (ALL,
  `can_administer_property`), "Service role full access", "Tenants can view status history on their tickets" (SELECT).
  `authenticated` holds INSERT, SELECT (kept by 237g for staff status updates). So the tenant's insert at line 112 is
  rejected (42501) and only logged. Owner/manager-created repairs are not affected.
- **Live attacker baseline as the smoke tenant (rolled back, 2026-10-16):** insert initial row, insert other-status row,
  insert on another tenant's ticket, update — all `42501`. This sprint must keep all four denied.
- **Live data:** 6 tickets. 4 are seed rows with history. The 2 real October tickets (`904e93fd…`, `82818d61…`), both
  tenant-created, lack the `null → submitted` row.
- **Screen impact today:** `components/dashboard/maintenance-tracker.tsx:44` invents a "submitted-fallback" step named
  "Tenant" when the row is missing, so the screen does not break. The audit trail is still wrong.
- **Why the admin client, not a new tenant INSERT policy (L-025):** a policy would open a new direct PostgREST write path
  for tenants (they could add rows with any `created_at`/`notes` on their own tickets, repeatedly). The server action
  already proves the tenant's lease and creates the ticket itself; every value in the history row is server-fixed. The
  service-role write adds zero client surface.

## 3. In scope
- In `createMaintenanceTicket`, write the initial history row with `createAdminClient()` after the ticket insert
  succeeds, for every role (tenant, owner, manager).
- Await the write before returning (no fire-and-forget; serverless may drop it). A failure must not fail the request.

## 4. Out of scope
- Any RLS, grant, migration or schema change.
- `updateTicketStatus` history logging (line ~263, incl. the `open → reviewed` / `from_status` oddities). Leave as is.
- `maintenance-tracker.tsx` fallback. Leave as is.
- Changing `logMaintenanceStatusChange`'s signature or swallow-and-log behavior.

## 5. Exact files expected to change
1. `apps/web/app/actions/maintenance-ticket-actions.ts`
2. `apps/web/app/actions/__tests__/maintenance-ticket-history.test.ts` (new)

No other file may change.

## 6. Implementation requirements
1. Replace the line-112 block with an awaited call that uses an admin client:
   `logMaintenanceStatusChange(admin, ticket.id, null, "submitted", user.id)`. Create the admin client with
   `createAdminClient()` (already imported). It may reuse the `admin` created in the `try` block below only if that
   keeps the call **after** the ticket insert and **before** the action returns on every success path; otherwise create
   it locally. Wrap in try/catch; a **thrown** error goes to
   `sideEffectError("createMaintenanceTicket", "log_status_history", { userId, entityType: "ticket", entityId })`.
   **Error contract (explicit):** `logMaintenanceStatusChange` is unchanged. An ordinary Supabase `{ error }` from the
   insert is consumed inside the helper (`console.error`, already checked per L-002) and never reaches the action's
   catch. Only unexpected throws (e.g. `createAdminClient()` missing env, network exception) reach `sideEffectError`.
   Both are non-fatal to the request.
2. Every inserted value is server-derived: `ticket.id` from the insert's `.select("id")`, `from_status` null,
   `to_status` the literal `"submitted"`, `changed_by` `user.id`. Nothing from `formData` reaches this call.
3. `createAdminClient()` for the history write is called only after the ticket insert succeeds, and the history write
   happens only after: auth, rate limit, parse, the tenant lease check / staff admin check, and a
   successful ticket insert. On any early return (no unit, no lease, no access, insert error) it must not be called.
4. Do not touch the user-client ticket insert, photo upload, notifications or audit code.
5. L-002: `logMaintenanceStatusChange` already checks `error`; do not add a second insert.

## 7. Validation
```
cd apps/web
npx vitest run app/actions/__tests__/maintenance-ticket-history.test.ts app/actions/__tests__/maintenance-ticket-notifications.test.ts lib/__tests__/maintenance-timeline.test.ts
npm run gate:web
```

## 8. Acceptance criteria (all in `maintenance-ticket-history.test.ts`, calling the real `createMaintenanceTicket`)
Mock `@/lib/maintenance` (`logMaintenanceStatusChange`), `@/lib/supabase/admin`, auth helpers etc., following
`maintenance-ticket-notifications.test.ts`. Give the admin client and the user client distinct identities.
1. **Tenant success:** tenant with an active lease → `logMaintenanceStatusChange` called exactly once with
   `(adminClient, <inserted ticket id>, null, "submitted", "<tenant id>")`; first arg is the admin client, **not** the
   user client (`toBe` identity check).
2. **Awaited:** a history mock that resolves only after a deferred promise: the action has not resolved before the
   deferred is released (or assert call order: history call completes before the action's result).
3. **Thrown failure is non-fatal:** history mock rejects → action still returns `success: true` (this covers the
   unexpected-throw class only), and the mocked `sideEffectError` was called with `"createMaintenanceTicket"`,
   `"log_status_history"` and `{ userId: "<tenant id>", entityType: "ticket", entityId: "<ticket id>" }`. Add a comment
   that an ordinary Supabase insert error is consumed inside `logMaintenanceStatusChange` and is covered by
   `lib/__tests__/maintenance-timeline.test.ts` ("logs errors when the status history insert fails"), not here.
   Known, accepted: a ticket can exist without its first history row if that write fails; no retry in this sprint.
4. **No lease:** tenant without an active lease → action returns the lease error; history mock not called; admin
   client not used for history.
5. **Insert failure:** ticket insert returns an error → history mock not called.
6. **Staff denied:** manager with `canUserAdministerProperty` false → action returns the access error; ticket insert not
   called; history mock not called; `createAdminClient` not called.
7. **Invalid input:** form missing `title` (zod parse fails) → parse error returned; ticket insert, history mock and
   `createAdminClient` not called.
8. **Order:** record call order; assert ticket insert resolves → the admin client passed to
   `logMaintenanceStatusChange` is created → `logMaintenanceStatusChange` completes → action resolves. Identify the
   history admin client by identity (the object passed as arg 1), not by "first `createAdminClient` call".
9. **Staff success:** manager with `canUserAdministerProperty` true → history called once with the admin client and the
   manager's id (pins existing staff behavior, L-014). Owner success: same with an owner caller.
10. **Form cannot steer it:** extra form fields `from_status="resolved"`, `to_status="closed"`, `notes="forged"`,
   `changed_by` and `ticketId` set to different real-looking UUIDs → history still receives exactly the server values
   from criterion 1 (and no `notes` argument).

Note: in criteria 4–7, "createAdminClient not called" means not called at all, since the notification block that also
uses it runs only after a successful insert.

The "tenant still cannot write other history rows" proof is a live attacker-SQL check Claude runs at ship (§2 baseline);
it is not a Codex test.

## 9. Report format
Compact status only: files changed, tests added (names), validation command results. Do NOT include 'Claude prompt' or
'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Lines ≤ 140 characters. Match surrounding style.
- No new dependencies. No user-visible copy changes.
- Do not run migrations or touch Supabase.

## Claude-side (not Codex)
- **Backfill (data only, at ship), scoped to exactly 2 ticket IDs:** `904e93fd-7a76-44a0-8f6f-902dfad20037` and
  `82818d61-ca6a-4d6b-bc5c-1e0c729270c6`. `changed_by` = the `user_id` of that ticket's `audit_logs` row with
  `action = 'create_ticket'` (authoritative creator; checked 2026-10-16: equals `tenant_profile_id`, role tenant, for
  both). `created_at` = ticket `created_at`. Guard per row:
  `not exists (… ticket_id = target and from_status is null and to_status = 'submitted')`.
  **Atomic, fail closed:** one transaction (DO block) for both inserts and all checks; any failed check raises and rolls
  back everything. Per ticket require exactly one `audit_logs` row with `entity_type = 'maintenance_ticket'`,
  `entity_id = <that ticket id>`, `action = 'create_ticket'`, and its `user_id = tenant_profile_id`; zero or many aborts.
  **Initial run:** before = 2 targets missing; inserted = 2 (ids recorded); after = 0 missing.
  **Rerun check (separate):** before = 0 missing; inserted = 0.
  Rollback: delete those 2 rows by id (recorded in the handoff).
- **Live proof at ship:** as the smoke tenant (rolled back): a real tenant ticket created via the deployed action gets
  its `submitted` row with `changed_by` = tenant; direct tenant inserts/updates on history (own ticket, other ticket)
  still `42501`.
