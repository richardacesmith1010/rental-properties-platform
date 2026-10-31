# Sprint 259a fix 1 — Strengthen the agreement tests; mark only agreement errors on the box (L2 fix round of an L3 sprint)

Codex: `gpt-6.1-sol` · high (tests on auth and evidence code). No ChatGPT round: no new behavior except the R1
accessibility rule; the packet it fixes (`docs/sprint259a-codex-prompt.md` rev 5) was approved. Claude: Opus 5.5 · Max.

## 1. Objective
An independent review mapped every 259a criterion to its test: 0 missing, 10 weak (L-017 treats weak tests as a
fail). Make each listed test prove its facts, and stop marking the agreement box invalid for errors that aren't about
the box. The working tree already holds 259a (uncommitted); build on it, don't revert it.

## 2. Context
- Review findings (by file): `components/__tests__/legal-agreement-forms.test.tsx` F1 never submits a checked form
  and its `signUp` assertion can't fail (the form no longer imports the browser client); `scripts/__tests__/
  agreement-e2e-guards.test.ts` AS2–AS4 use one-account manifests, a non-UUID id and bare `toThrow()`;
  `lib/__tests__/legal-acceptance.test.ts` and `app/actions/__tests__/sign-up.test.ts` never assert the role read
  uses `.eq("id", profileId)` or that the upsert targets `from("legal_acceptances")`; `lib/__tests__/
  agreement-enforcement-inventory.test.ts` I1 skips files not starting with `"use server"` and `export const`
  actions, counts `requireAuthForExit` only in those files, treats unknown `kind`s as public, and exempts
  `feedback.ts` without an R0 entry; `lib/__tests__/legal-versions.test.ts` V3 and `app/__tests__/legal-pages.test.tsx`
  V4 compare by date only and check "LAWYER" case-sensitively; `recordLlcRegistrationAgreement`
  (`app/actions/llc-invitations-support.ts`) `no_email`/`email_mismatch` branches are untested; G9 rows lack a
  differing `role_at_acceptance`; S11 doesn't assert "no upsert"; L3 doesn't assert exactly one call; alert copy in
  P6/F1/F2 is matched by substring; F2b never checks the alert; A3's payload isn't `toEqual`.
- Claude's finding: `create-account-form.tsx`, `complete-profile-form.tsx` and `agree-form.tsx` pass
  `invalid`/`describedBy` and move focus to the box for **any** error (e.g. "Passwords do not match yet."), so a
  screen reader announces the box as invalid when it isn't.
- **Decision (Claude, 2026-10-30):** `submitFeedback` (`app/actions/feedback.ts`, used by the root-layout feedback
  widget) stays reachable without agreeing — it's how someone who won't agree can still tell us why. It becomes a
  named exit in R0 and in the inventory, with that reason.

## 3. In scope
Tests listed in §8; the R1 accessibility rule in the three forms; the feedback exit entry.

## 4. Out of scope
Any other behavior; copy changes; the database; `apps/ios`; the operator script's logic (its guard tests only).

## 5. Exact files expected to change (apps/web)
`components/auth/create-account-form.tsx`, `components/auth/complete-profile-form.tsx`,
`components/legal/agree-form.tsx`; tests: `components/__tests__/legal-agreement-forms.test.tsx`,
`scripts/__tests__/agreement-e2e-guards.test.ts`, `lib/__tests__/legal-acceptance.test.ts`,
`app/actions/__tests__/sign-up.test.ts`, `app/actions/__tests__/legal-acceptance.test.ts`,
`app/actions/__tests__/auth-helpers-agreement.test.ts`, `app/actions/__tests__/llc-invite-agreement.test.ts`,
`lib/__tests__/agreement-enforcement-inventory.test.ts`, `lib/__tests__/legal-versions.test.ts`,
`app/__tests__/legal-pages.test.tsx`, `app/agree/__tests__/page.test.tsx`. Nothing else.

## 6. Implementation requirements
- **R1** In the three forms, pass `invalid` and `describedBy` to `LegalAgreementCheckbox`, and move focus to the box,
  **only** when the shown error is exactly `Check the box to agree first.` Every other error still shows in the same
  `role="alert"` region, unchanged, without marking or focusing the box.
- **R2** `PUBLIC_ACTION_FILES` lists `feedback.ts` with the reason "support channel: people who won't agree can still
  tell us why (259a decision)"; nothing else changes for feedback.

## 7. Validation
`cd apps/web && npx vitest run components/__tests__/legal-agreement-forms.test.tsx scripts/__tests__
lib/__tests__/legal-acceptance.test.ts app/actions/__tests__/sign-up.test.ts app/actions/__tests__/legal-acceptance.test.ts
app/actions/__tests__/auth-helpers-agreement.test.ts app/actions/__tests__/llc-invite-agreement.test.ts
lib/__tests__/agreement-enforcement-inventory.test.ts lib/__tests__/legal-versions.test.ts app/__tests__/legal-pages.test.tsx
app/agree` then `npm run gate:web` from the repo root.

## 8. Acceptance criteria (exact copy with `toEqual`/`toHaveTextContent(…, { normalizeWhitespace })` on the full
string, never a substring)
- **X1 (F1)** render the real `CreateAccountForm` with a spy `action`; pick a role, fill valid matching passwords,
  check the box, submit: the spy receives `FormData` whose entries include exactly `agree=yes`, `role=<picked>`,
  `termsVersion=2026-10-30`, `privacyVersion=2026-10-30`, `email`, `password`, `confirmPassword`; when the action
  resolves `{ success: true, email }` the check-email screen shows. Delete the unreachable `signUp` assertion.
- **X2 (R1)** each form: a password error (sign-up) / an action error (complete-profile, agree) shows the exact alert
  and leaves the box without `aria-invalid`/`aria-describedby` and unfocused; the box error sets both and focuses it.
- **X3 (AS2–AS4)** with a two-account manifest where the **second** account fails each guard (UUID not in the
  manifest but well-formed; email off the run pattern; `is_tester` false; project mismatch), `cleanupAccounts`
  throws the exact message (`Account not in this run; nothing removed.` / `Email mismatch; nothing removed.` /
  `Profile is not this run's tester; nothing removed.` / `Project mismatch; nothing removed.`) and calls
  `deleteAuth`/`deleteProfile` **zero** times for **both** accounts.
- **X4 (attribution)** `recordLegalAcceptance`: the role read is `from("profiles").select("role").eq("id",
  profileId)` (assert table, columns and filter), the write is `from("legal_acceptances").upsert(...)`; `signUpAction`
  records with the id and email of the user `signUp` returned.
- **X5 (I1)** the inventory reads every `.ts` file under `app/actions` (except tests), finds every exported function
  (`export async function` and `export const … = async`), and requires each to call `requireAuth(` or
  `requireAuthForExit(` or to sit in a listed public file; `requireAuthForExit` appears only in the three R6 exits;
  unknown `kind` values in I2/I3 fail the test; `feedback.ts` carries the R2 reason.
- **X6 (V3/V4)** the sheet's and both pages' text (`legalDocumentText` of the rendered component) equals the archive;
  `/lawyer/i` and `/early access version/i` are absent from both pages.
- **X7** `recordLlcRegistrationAgreement`: missing created email → `{ ok: false, code: "no_email" }` and no upsert;
  created email ≠ invitation email (case-insensitive compare) → `email_mismatch`, no upsert; equal → one real
  `recordLegalAcceptance` call path (recorder not mocked) with `source: "llc_invite"`.
- **X8** G9: a row whose `role_at_acceptance` is `tenant` while the profile is now `owner` still counts as accepted.
  S11: no `upsert` call. L3: exactly one record call. F2b: the alert text is exact. A3: payload `toEqual`.

## 9. Report format
Compact status only: files changed (lines before → after), each criterion → test name, gate result, token count.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Lines ≤ 140 characters; no file over 500 lines; no new dependencies; tests never put `expect` inside a mock
implementation (L-028); keep every existing 259a test passing.
