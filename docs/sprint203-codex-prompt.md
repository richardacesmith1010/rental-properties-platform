# Sprint 203 — "Saved." confirmation on tax numbers; no dead invite links (L1: UI)

## 1. Objective
Two small fixes found in live checks:
1. **Tax numbers Save gives no confirmation.** On `/owner/reports`, pressing Save in "Tax numbers for {year}" stores the data correctly (verified in the DB 2026-10-08), but `Saved.` never appears. `savePropertyTaxYear` calls `revalidatePath("/owner/reports")`, the server tree refreshes, and the form's `useFormState` status is lost.
2. **Copy link on expired invites.** The owner/manager invite list shows `Copy link` for every pending tenant/manager invite, but the join page treats invites older than 30 days as inactive (`isJoinInviteActive` in `apps/web/lib/join-invite.ts`). The copied link then shows "This invite is no longer active…".

## 2. Context
- `apps/web/components/reports/tax-summary-report.tsx`: `TaxNumbersForm` with `useFormState(onSave, null)`; status rendered as `{state && <p role="status">…}`.
- Toasts: the app already uses a global toaster (find the existing `toast` import used in dashboard components, e.g. `components/dashboard/actionable-notification.tsx`).
- `apps/web/components/dashboard/invitations-panel.tsx` (`CopyLinkButton`, ~l.25–40; rows show `Sent {formatDate(invitation.createdAt)}`) and `invitations-section.tsx` (manager invites). `isJoinInviteActive(invite, now)` takes `{ role, status, created_at }`.

## 3. In scope
1. **Tax Save confirmation:** find why the status disappears (remount vs. state reset) and make the confirmation reliable. Keep the inline status if it survives. In any case, also call the global toast from a client wrapper around `onSave`: on success `toast.success("Saved.")`, on error `toast.error(<returned error>)`. Do not change the server action or its strings.
2. **Expired invite links:** in both invite lists, use `isJoinInviteActive({ role, status, created_at: createdAt })`. If false for a pending tenant/manager invite, don't render `Copy link`. Render a small note `Link expired. Resend to get a new one.` next to the existing Resend control instead. Active invites keep `Copy link` unchanged.
3. **Tests:** the tax form shows the success toast (mock toast) after a successful submit and the error toast on failure; invite rows: < 30 days → `Copy link`; ≥ 30 days → no button + the note; accepted rows unchanged.

## 4. Out of scope
Server actions, the join page, other screens. Deploy, commit, `.claude/launch.json`, `docs/`.

## 5. Exact files expected to change
`apps/web/components/reports/tax-summary-report.tsx`, `apps/web/components/dashboard/invitations-panel.tsx`, `apps/web/components/dashboard/invitations-section.tsx`, and their tests.

## 6. Implementation requirements
Exact copy; sentences ≤ 12 words; plain-language guard passes. Lines ≤ 140; no new dependencies. The user should never need to read instructions to complete this flow.

## 7. Validation commands to run
`npm run lint:web`; `npx tsc --noEmit -p apps/web/tsconfig.json`; tests for the changed components; `lib/__tests__/plain-language.test.ts`.

## 8. Acceptance criteria (binary)
The success toast appears on save (test); expired invites show the note and no Copy link (test); everything else unchanged; lint, typecheck and tests pass; only §5 files changed.

## 8b. Post-deploy (Claude)
Smoke owner saves tax numbers (then resets to 0) and sees "Saved."; the smoke owner's 2026-08-24 pending invite shows "Link expired. Resend to get a new one." with no Copy link. 0 console errors.

## 9. Report format
JSON per `docs/codex-report-schema.json`; state the root cause found for #1. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`.
