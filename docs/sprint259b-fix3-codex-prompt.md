# Sprint 259b fix 3 — /join-llc must not revalidate during render (L2, live bug found by D3)

Codex: `gpt-6.1-sol` · medium (L2: one page path in an auth flow, plus tests). No ChatGPT round: no new behavior; the
page stops calling a revalidating server action during render. Claude: Opus 5.5 · Max.

## 1. Objective
On production (`da8f4eb`), a signed-in invitee who opens their link joins the LLC (the database writes succeed), but
the page then throws and shows an error instead of landing on the LLC. Vercel logs, three times on 2026-10-31:
`Error: Route /join-llc used "revalidatePath /owner" during render which is unsupported.` Make the page's signed-in
join finish with the redirect to `/owner?account=<id>`.

## 2. Context
- `app/join-llc/page.tsx` (signed-in path, after the invited-email and agreement checks) calls the server action
  `acceptLLCInvitation(token)` during render. On success that action calls `revalidateLlcSurfaces()`
  (`app/actions/llc-invitations-support.ts:103`, `revalidatePath("/owner")` and `("/manager")`). Next 15 forbids
  revalidation during render. This code predates 259a; the 259a hold hid it, and unit tests mock `next/cache`.
- The page needs no revalidation: its redirect target `/owner?account=<id>` renders fresh for the joining user.
- `signInToJoinLLC` and `createAccountToJoinLLC` are server actions (revalidation allowed); they are not affected.

## 3. In scope
The page's signed-in join call; tests.

## 4. Out of scope
Everything else, including `acceptLLCInvitation`'s own behavior (it keeps revalidating when called as an action),
copy, the database, `apps/ios`.

## 5. Exact files expected to change (apps/web)
`app/join-llc/page.tsx`, `app/actions/__tests__/llc-join-journey.test.ts` (and `llc-invite-flow.test.ts` only if an
existing page test lives there).

## 6. Implementation requirements
- **R1** In the page's signed-in path, keep today's order and checks (invalid, expired, used states; wrong account;
  `checkAgreement` → `redirect(buildAgreementRedirect(token))`), then join through `finalizeInvitationAcceptance`
  (`app/actions/llc-invitations-support.ts`) directly, with the same arguments `acceptLLCInvitation` passes (token,
  `user.id`, `user.email`, and `full_name` / `nickname` from `user.user_metadata` when they are strings). On success,
  `redirect("/owner?account=" + encodeURIComponent(accountId))`; on `code: "agreement_required"`,
  `redirect(buildAgreementRedirect(token))`; otherwise today's "Invitation could not be accepted" state with the
  returned error. The page must not call `acceptLLCInvitation`, `revalidateLlcSurfaces` or `revalidatePath`.
- **R2** `acceptLLCInvitation` is unchanged and still revalidates `/owner` and `/manager` on success.

## 7. Validation
`cd apps/web && npx vitest run app/actions/__tests__/llc-join-journey.test.ts app/actions/__tests__/llc-invite-flow.test.ts`
then `npm run gate:web` from the repo root.

## 8. Acceptance criteria
- **W1** Page, signed in with the invited email, agreement accepted: the real redirect thrown is exactly
  `/owner?account=<id>`; the `next/cache` `revalidatePath` mock was called **zero** times during the render; the rpc was
  called once with the exact arguments.
- **W2** Page, `agreement_required` returned by the join (record missing): real redirect to exactly the agreeUrl; zero
  `revalidatePath` calls.
- **W3** Page, the join fails (`not_active`): the "Invitation could not be accepted" state shows "This invitation is no
  longer active."; zero `revalidatePath` calls.
- **W4** `acceptLLCInvitation` called as an action on success: `revalidatePath` called with exactly `"/owner"` and
  `"/manager"`.
- **W5** Every existing 259a/259b test still passes; the gate is green.

## 9. Report format
Compact status only: files changed (lines before → after), each criterion → test name, gate result, token count.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Lines ≤ 140 characters; files ≤ 500 lines; no new dependencies; tests never put `expect` inside a mock
implementation (L-028); every Supabase call's error stays checked (L-002); no other behavior change.
