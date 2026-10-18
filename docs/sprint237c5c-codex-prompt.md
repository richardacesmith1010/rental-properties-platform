# Sprint 237c-5c — Manager invite "UI": pick homes, Revoked badge, row toasts (L3) — rev 3.1 (ChatGPT 5c AWC adopted)

Severity L3 (part of the invite redesign; UI only). `/chatgpt-review` before `/codex-dispatch`. Part 3 of 3; the index is
`docs/sprint237c5-index.md`. **Depends on 5a and 5b.** HEAD = the local 5b commit (on top of the local 5a commit; both reviewed,
committed by Claude, not deployed). Component line numbers below are from `0e4a85c`; 5a and 5b do not touch components.
Section numbers match rev 2 (§6.10). "5a §x" / "5b §x" mean `docs/sprint237c5a-codex-prompt.md` / `…5b-codex-prompt.md`.

## 1. Objective
Owners, and managers inviting co-managers, can pick one home, several homes, or "All my homes" in one send (M1). Client homes
and inactive homes never show. The invite list tells the truth: a revoked row reads **Revoked**, a successful Revoke shows its
message, and every row-action error is shown to the user even when the row re-renders. After this sprint, 5a + 5b + 5c ship
to production together in one release.

## 2. Context
Unchanged context is in 5a §2 and 5b §2. Facts the requirements below depend on:

### 2.1 Server contract (5a, 5b)
- `inviteManager` (5a §6.2) reads `propertyIds` (a JSON array of home ids, 1-100) or the legacy `propertyId`, plus `email` and
  `fullName` (5a §6.9). It ignores any `ownershipAccountId`. It checks every id against the inviter's own homes and refuses
  client homes. Its result is `ActionState` plus `delivery`, `email`, `name`; failures are `{ success: false, error }`.
- Owner `resendInvite` returns `{ success: true, message: "Invitation resent." }` or `{ success: false, error }`. Two manager
  errors revalidate the page and turn the row Accepted: `"They already signed in. No email was sent."` (5b §6.6
  `already_joined`).
- `revokeInvite` returns `{ success: true, message }` with `"Invitation revoked."` (every role; HEAD :378) or `"Invitation
  revoked. Another invite still gives them this home."` or `"Invitation revoked. They still manage this home."` (5b §6.7
  step 10). Its error `"They already signed in. This invite
  can't be revoked."` revalidates and turns the row Accepted (5b §6.7 step 5's `accepted` outcome).
- Revoke writes status `expired` for every role.

### 2.2 Today's components
Line counts (`apps/web/components/`): `dashboard/invitations/invite-manager-form.tsx` 136, `dashboard/owner-add-menu.tsx` 98,
`dashboard/invitations-section.tsx` 209 (19 lines over 140). Test: `components/__tests__/invite-manager-form.test.tsx` 45.
- `invite-manager-form.tsx`: step pill `Home` (:14); toasts use `sonner` (:12) with the `handledRef` success pattern (:46-54).
- `invitations-section.tsx`: `properties` prop type (:32); manager form (:127). `FormSuccess` (:57-60) ignores
  `state.message` and prints a fixed message. `InvitationRow` (:168-209): the badge prints the raw status (:178, 153 chars),
  so revoked rows read "Expired" (`invitations-panel.tsx:153` says "Revoked"). Actions render only while `pending` (:185);
  inside that block sit the resend `FormError` (:190) and `FormSuccess` `"Resent!"` (:191), and the revoke `FormError` (:199)
  and fixed `"Revoked!"` (:200). When a row leaves `pending`, that block unmounts, so its inline messages are never seen.
  Copy link copies `/join/{id}` while pending and under 30 days.
- `owner-add-menu.tsx`: `properties` prop type (:16); manager form (:92).
- Both entry points get a server-scoped home list: `OwnerAddMenu` (`dashboard/index.tsx:403-404`) and `InvitationsSection`
  (`render-section-cases.tsx:293`). Items are `PropertyListItem` (`lib/portfolio.ts:10-23`; `ownerAccountIsClient` :21,
  `active` :22).
- Owners' `?account=` is stripped in the browser (`dashboard-kpi-loader.ts:273-301`). The archived patch read
  `window.location` and fell back to `accounts[0]`, which broke multi-account owners.
- Archived patch (`docs/sprint-archive/237c1-invite-flow-round3.patch`): reuse the form's checkbox step (:995-1040), without
  the `window.location` effect (:976) and the `ownershipAccountId` input (:1037). Do not reuse the client filter that lived
  only in `invitations-section.tsx` (:936). Its tests (:841-917) are reference only.

## 3. In scope
- The home-picking step in `invite-manager-form.tsx`, for both entry points.
- Prop types in `owner-add-menu.tsx` and `invitations-section.tsx`. The `Revoked` badge. The revoke success toast. Row-action
  error toasts.

## 4. Out of scope
- Server code (5a, 5b). Any SQL. Join page copy. iOS.
- Removing the legacy `propertyId` from the schema (one more release).
- New copy beyond §6.10. Other row actions (Copy link) and other forms.
- The `revalidatePath("/owner")` snap-back to `accounts[0]` (unverified; Claude's walk C3 checks it).

## 5. Exact files expected to change
Codex:
1. `apps/web/components/dashboard/invitations/invite-manager-form.tsx`
2. `apps/web/components/dashboard/owner-add-menu.tsx` (prop type only)
3. `apps/web/components/dashboard/invitations-section.tsx` (prop type, badge label, revoke success toast, row-action error
   toasts)
4. Tests (each new file ≤ 500 lines):
   - `apps/web/components/__tests__/invite-manager-form.test.tsx` (edit, C1)
   - `apps/web/components/dashboard/__tests__/manager-invite-entry-points.test.tsx` (new, C2)

Claude (not Codex): `supabase/migrations/20261028_sprint237c5_manager_invite_backfill.sql` (data only),
`supabase/rollback/20261028_sprint237c5_rollback.sql`, `supabase/tests/sprint237c5_manager_invite_backfill.sql` (dry run),
`docs/auth-state-machine.md`, `docs/agent-handoff.md`, `docs/claude/reference.md`.

## 6. Implementation requirements

### 6.10 Form and entry points
`invite-manager-form.tsx`:
- Props: `properties: Array<{ id: string; name: string; ownerAccountIsClient?: boolean; active?: boolean }>`. Eligible:
  `ownerAccountIsClient !== true && active !== false`, filtered in the form so both entry points get it.
- Step 1 keeps the pill `Home` (:14). Text `Step 1: Pick homes.` A checkbox `All my homes` (checked when every eligible home is
  picked; toggles all), then one checkbox per eligible home, labelled with its name, each row `min-h-11`.
- One eligible home and nothing picked → it is picked. Picks no longer eligible are dropped. No eligible homes → `No homes here
  can get a manager.` and Next stays disabled.
- Review: `Homes:` and the picked names, comma-separated, in list order.
- Hidden inputs `propertyIds` (`JSON.stringify(pickedIds)`), `email`, `fullName`. No `propertyId` input, no
  `ownershipAccountId`; never read `window.location`. Success handling stays (:46-54); on an error the draft stays, so Send
  works again.

`owner-add-menu.tsx`: widen the `properties` type at :16. No logic change.

`invitations-section.tsx`:
- Widen the `properties` type at :32. The tenant form keeps every home.
- Badge (:178): `Revoked` for `expired`, as `invitations-panel.tsx:153`; wrap the line. It applies to every role.
- Row-action toasts are owned by the action call, not by the row (ChatGPT 5c REQUIRED 1). A row can re-render from Pending
  to Accepted (5b §6.6 already_joined, 5b §6.7) and unmount its forms, so no toast may depend on a `useEffect` or a
  `handledRef` inside `InvitationRow`. Add one module-level helper in `invitations-section.tsx`:
  ```ts
  function withRowToast(action: RowAction, toastSuccess: boolean): RowAction {
    return async (prev, formData) => {
      const result = await action(prev, formData);
      if (!result.success && result.error) toast.error(result.error);
      else if (result.success && toastSuccess) toast.success(result.message ?? "Invitation revoked.");
      return result;
    };
  }
  const resendWithToast = withRowToast(resendInvite, false);
  const revokeWithToast = withRowToast(revokeInvite, true);
  ```
  `RowAction` is the `(prev: ActionState, formData: FormData) => Promise<ActionState>` shape the two actions already have.
  Both constants are module-level, so their identity is stable across renders. `InvitationRow` passes them to
  `useFormState` instead of the raw actions. It adds no `try/catch` (L-028: a `redirect()` from the action propagates).
  Result: exactly one toast per submit, fired when the result arrives, whatever the row renders next. The same error
  returned by two submits toasts twice, once per submit. A re-render without a submit never toasts.
- Remove the revoke `FormSuccess` (:200) and the two inline `FormError` lines (:190, :199), so nothing shows twice.
  Resend success keeps its inline `Resent!` (:191); the row stays Pending on a resend success.
- Visible strings (L-020): `Invitation revoked.` (every role; HEAD :378), `Invitation revoked. Another invite still gives
  them this home.` and `Invitation revoked. They still manage this home.` The success toast shows the server's
  `state.message` exactly. This applies to every role. Other row actions do not change.

### 6.11 Rules
- L-028: the forms keep `useFormState`; add no client `try/catch` around `inviteManager`, `resendInvite` or `revokeInvite`.
- Plain language: 6th grade, ≤ 12 words per sentence, no banned words (`lib/plain-language/scan.ts`).
- Touch targets: each checkbox row `min-h-11`. Text stays readable in light and dark (L-009, L-022).
- Size (L-015): new files ≤ 500 lines; an edited file under 500 stays under 500. Added or changed lines ≤ 140 characters
  (wrap the 153-char badge line). Do not reformat untouched lines. No compaction.
- No `window.location`, no `accounts[0]`, no `ownershipAccountId`, no new dependencies.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user
  needs to think about what to do, the UI needs to be clearer.

## 7. Validation commands
From the repo root, in order. Every file in the `ls` must exist.
```
ls apps/web/components/dashboard/__tests__/manager-invite-entry-points.test.tsx
(cd apps/web && npx vitest run components/__tests__/invite-manager-form.test.tsx \
  components/dashboard/__tests__/manager-invite-entry-points.test.tsx)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
```
Do NOT run `npm run gate:web`. Do not apply or write SQL. Claude runs the live checks, gates, deploys and walks.

## 8. Acceptance criteria
Tests are C1-C3. The Claude-only items keep their rev 2 names and are written "Claude C3", "Claude C4", "Claude C6".
Test rules: no `expect` inside a mock; assert after the awaited render or event; fixtures use `crypto.randomUUID()` ids and
`@example.com`; `sonner` is mocked so `toast.success` / `toast.error` calls can be counted.

- C1 `invite-manager-form.test.tsx`: rewrite :14-20 (the `All my homes` checkbox and pills `Home`, `Email`, `Name`, `Send`)
  and :34-44 (pick the home by checkbox; Next hidden on the final step); keep :22-32. Add: "All my homes" checks and clears
  every eligible home; hidden `propertyIds` = `JSON.stringify(picked)` for one and for all; no `propertyId` input; client and
  inactive homes never shown or posted; with `?account=x` in `window.location`, no `ownershipAccountId` input; one eligible
  home is preselected; zero eligible → `No homes here can get a manager.`, Next disabled; the review lists the names; the
  draft stays on an error and resets on success.
- C2 `manager-invite-entry-points.test.tsx`: `OwnerAddMenu` (owner → "Add a manager") and `InvitationsSection` ("Send
  Invitation" → "Manager Invite") hide client and inactive homes; the tenant form lists every home. A pending row shows
  Resend, Copy link and Revoke; an accepted row none; an `expired` row (manager or tenant) reads `Revoked`. A Revoke that
  returns `"Invitation revoked. Another invite still gives them this home."` calls `toast.success` once with that text; the
  same for `"Invitation revoked. They still manage this home."` A
  Resend that returns `{ success: false, error: "They already signed in. No email was sent." }`, with the row re-rendered
  `accepted`, calls `toast.error` once with that text. Same for Revoke's `"They already signed in. This invite can't be
  revoked."`. A tenant Revoke failure also toasts. No error text renders twice. Toast ownership: (i) a Resend failure whose
  re-render shows the row `accepted` (its forms unmount) → `toast.error` exactly once; (ii) two submits that return the same
  error → exactly two `toast.error` calls; (iii) re-rendering the section with unchanged props and no submit → no new toast
  call; (iv) the success toast text equals the server `message` for each of the three revoke strings.
- C3 Full suite (every 5a and 5b test still green), `tsc`, lint and `lib/__tests__/plain-language.test.ts` are green.

**Mutation proofs (in the report; revert each):** M16 render the revoke error inline again instead of `toast.error` → C2's
already-signed-in Revoke case. M23 move the error toast into a `useEffect` on `resendState` in `InvitationRow` → C2 (i)
fails (the row unmounts before the effect runs) or (ii)/(iii) fail. M24 pass the raw `revokeInvite` to `useFormState` →
C2 (iv) fails. M17 drop the eligibility filter → C1 and C2's hidden-home cases.

**Claude only (not Codex), after this sprint passes review, on the combined 5a+5b+5c release:**
- Claude C3 Walk (test accounts, magic-link sign-in). Setup: never-used plus-addresses X4 and X5 (SQL: no user, no profile; X0-X3
  were used by C1); add only X4 to Production `DOMUS_NOTIFICATIONS_ALLOWLIST`, redeploy, re-read; give the smoke owner
  a second account B with one home through the app; call no `generateLink` magiclink/signup for X4 or X5. Then: on account B,
  invite X4 to "All my homes" (account B has at least 2 eligible homes; add one through the app if needed) → N Pending rows
  with Resend, Copy link, Revoke, and one branded email whose link opens `/auth/confirm`, then the callback (do not open it
  yet). Revoke one home: that row reads Revoked, the toast shows, X4's access to that home is gone (SQL), and the emailed
  link still works because X4's other rows are still pending (no link reset, 5b §6.7). Re-invite that home (Pending, one
  new email; the newest link is the live one). Open the newest link → every X4 row Accepted, access active (SQL).
  Final-revoke reset: invite X5 to one home → the generic Supabase invite; revoke it → Revoked, access gone, and the link
  from X5's email no longer signs in (link reset, because no pending row remains). "All my homes" means every eligible
  home in the list being viewed (account B); the walk confirms no home from another account is posted (SQL on the rows)
  and that the page stays on account B after each action. The page stays on account B. Light and dark screenshots of the
  form and list (L-009, L-022). Record X4-X5 as used in `docs/claude/reference.md`. Do not add a signed-in smoke manager to
  All my homes. If a walk does, Claude removes the extra grants by SQL and records it.
- Claude C4 After deploy (HEAD writes HEAD-shape rows until then): re-count, then backfill manager rows with
  `invited_profile_id` null: (1) pending rows get the profile with `lower(p.email) = lower(i.email)` and `p.role = 'manager'`;
  (2) a pending manager row turns accepted only with evidence of sign-in AND access (ChatGPT 5c REQUIRED 3): for each
  manager profile whose `auth.users` row has `last_sign_in_at` not null, run `select * from manager_invite_accept(<profile>)`.
  That function takes the same locks and accepts only rows whose grant for that home is active; every other row stays
  pending (a confirmed email alone is not enough). Today: 1 row. The dry run lists any pending manager row still without
  `invited_profile_id`. After ChatGPT APPROVE, a rolled-back dry run and the rollback file. Also re-count before deploy
  and list every unconfirmed manager user without `app_metadata.domus_manager_invite` (0 on 2026-10-18; 5a D7 refuses them) for Claude to review.
  Note: the 5a §6.12 migration makes every existing grant `assigned_directly = true`, so no pre-existing access is ever
  removed by a revoke; the backfill does not change that column.
- Claude C6 Handoff: D1-D10, the D2 send occasion, and follow-ups: convert manager and owner rows on email confirmation (L3,
  diffed against the live body); the tenant `deleteUser` fallbacks; `inviteOwner` rows that never convert; the branded email
  at launch; a revoked, never-signed-in manager email cannot become a tenant or owner; remove a signed-in manager from a home
  (the undo for 5a §6.3 and All my homes; L3); one Revoke for all rows of one All my homes send (today N Revokes; the link
  works until the last). Deleted accounts need nothing new: runbook step C2 (`docs/runbooks/account-deletion.md:304-307`)
  expires pending rows by `invited_profile_id`; HEAD-shape rows are Claude C4.

## 9. Report format
Compact status only: files changed with line counts, the test for each criterion (C1-C3), `grep -c "it("` per new test
file, mutation results (M16, M17), command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies. No SQL from Codex. No server file changes.
- Tenant and owner rows see only the `Revoked` badge, the revoke toast and the error toasts.
- No `window.location`, no `accounts[0]`, no `ownershipAccountId`.
- Exact copy only. Invent no strings, URLs or emails. Fixtures use `@example.com`.
- Size, line-length and L-028 rules as §6.11.
- If anything in 5a or 5b's contract blocks you, stop and report. Do not work around it.
