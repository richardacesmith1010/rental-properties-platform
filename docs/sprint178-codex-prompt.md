# Sprint 178 — Plain-language guard + full sweep (L2) · Category 9: Plain language & clarity

## 1. Objective
Make plain language enforceable, then make the app pass:
1. Add a Vitest test that scans **user-facing text** in the web app and emails, and fails on banned words or sentences over 12 words.
2. Fix every hit it finds, or record a justified exception.
3. Add a short rule file future packets can point to.

## 2. Context
- Branch `main`, HEAD `7e057ff` or a later docs-only commit. Next 15.5.27, React 19.2.8, TypeScript 5.6.3 (the `typescript` package is available for AST parsing).
- The Domus rule (CLAUDE.md §18): all UI and email text at a 6th-grade level, **at most 12 words per sentence**, verbs over nouns, and no jargon.
- **Banned words** (case-insensitive, whole word, plural forms included):
  - charge
  - submit
  - delinquency / delinquent
  - disbursement
  - reconciliation / reconcile
  - remittance
  - acknowledgment / acknowledgement
  - terminate
  - commence
  - pursuant
  - herein
  - utilize
  - facilitate
  - subsequent
  - "prior to"
  - inquire
  - endeavor
  - transaction
  - ledger
  - CSV
  - ACH
  - onboard / onboarding
  - "command center"
  - "premium"
- Known hits:
  - "ledger" (`payments/success/page.tsx` ~132);
  - the "ACH" badge (`tenant/page.tsx` ~368);
  - "Ask your admin" (`tenant-documents-section.tsx` ~46);
  - "Threaded conversation storage is not live yet" (`inbox-section.tsx` ~296);
  - "review the charge" (rent reminder in `lib/email-templates.ts` ~375);
  - long invite-email sentences (`email-templates.ts` ~275, 282, 324; `auth-email-templates.ts` ~35, 69);
  - the sign-up page copy "Premium landlord workspace" / "command center" and the long role paragraph (`app/login/page.tsx`, `components/auth/*`);
  - raw technical error text in the auth callback (`app/auth/callback/route.ts` ~144–146, 228–231).

## 3. In scope
1. **The guard test:** `apps/web/lib/__tests__/plain-language.test.ts`, plus a helper `apps/web/lib/plain-language/scan.ts`.
   - Use the TypeScript compiler API to walk `apps/web/app/**`, `apps/web/components/**` and the email template files under `apps/web/lib/**/*email*` and `lib/auth-email-templates.ts` (`.ts`/`.tsx`, excluding tests). Collect **user-facing strings only**:
     - `JsxText`;
     - string or template literals that are JSX children (inside `JsxExpression`);
     - JSX attributes named `title`, `placeholder`, `aria-label`, `alt` or `label`;
     - object properties named `title`, `body`, `description`, `message`, `error`, `label`, `subject`, `heading`, `text` or `cta`;
     - `toast.*(...)` first arguments;
     - all string literals inside the email template files.
   - Ignore strings with no letters, strings without a space that look like identifiers, keys or paths, `className`/`class` values, URLs, and anything in `app/terms/**`, `app/privacy/**` or `app/ops/**` (legal and internal; listed as exceptions).
   - Checks:
     - (a) banned words, using word boundaries;
     - (b) sentences: split on `.`, `!` and `?`, then count words; fail if any sentence has more than 12 words.
   - Template literals: replace `${…}` with one placeholder word.
   - Report each failure as `file:line  "text"  → reason`.
   - **Exceptions:** `apps/web/lib/plain-language/exceptions.json` maps `"file:exact text"` to a reason. Every entry needs a real reason, for example a legal name or a brand term. Keep it under 25 entries. A blanket file or directory exception is not allowed, except the terms/privacy/ops folders listed above.
2. **Fix every hit** so the test passes. Rewrite in plain words that keep the meaning, e.g.:
   - "ledger" → "payment history";
   - the "ACH" badge → "Bank transfer";
   - "review the charge" → "see what you owe";
   - auth callback errors → "This link has expired. Ask for a new one." / "We couldn't sign you in. Try again.", with a separate heading for an expired reset link: "This reset link has expired".
   - Keep identifiers, DB values, routes and section IDs unchanged (for example `section=charges`). **Only change text people see.**
   - Update the existing tests that assert the old copy.
3. **Rule file:** `docs/plain-language.md` (allowed despite the `docs/` rule; this is the one docs file you may create). Keep it to one page: the banned list with replacements, the 12-word rule, how to run the guard, and how to add an exception.

## 4. Out of scope
- Behaviour changes, routes, DB values, test-ID changes, emails' sending logic.
- `.claude/launch.json`, `CLAUDE.md`, `AGENTS.md`, and every other `docs/` file.

## 5. Exact files expected to change
- New: `apps/web/lib/plain-language/scan.ts`, `apps/web/lib/plain-language/exceptions.json`, `apps/web/lib/__tests__/plain-language.test.ts`, `docs/plain-language.md`.
- Changed: **every file the guard flags** under `apps/web/app/**`, `apps/web/components/**`, and the email template files, plus the existing tests asserting their old copy.
- The guard's own scope is the scope of this sprint (L-011), so list every changed file with the hit it fixes.

## 6. Implementation requirements
- Copy only. Each rewrite stays at or under 12 words per sentence and keeps the meaning.
- Never change values used in logic, for example status strings compared in code, enum values or query params. If a flagged string is also used as a value, split it into a display label instead.
- Keep accessibility names meaningful. The a11y smoke specs assert on some names ("Bank activity", "Left after bills", "Create your account", "Add a manager"); keep those unless they are flagged, and update the specs if you must change them.
- Each line at most 140 characters. Do not compact code (L-015).

## 7. Validation commands to run
- `npx vitest run apps/web/lib/__tests__/plain-language.test.ts` from `apps/web`
- `npm run gate:web`

## 8. Acceptance criteria (binary)
1. The guard test exists, scans as specified, and passes.
2. Prove the guard bites:
   - a test case feeds the scanner a fixture with "Please submit the charge now and wait for the reconciliation of your account soon." and expects 3 banned-word hits plus 1 long-sentence hit;
   - a `className` fixture produces 0 hits.
3. `exceptions.json` has 25 entries or fewer, each with a reason. There are no blanket exceptions beyond terms/privacy/ops.
4. Every known hit in §2 is fixed (grep shows none of the old strings).
5. The gate passes; existing tests are updated, not deleted.
6. The report lists every changed file with its hit, plus the total number of hits before.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Include the before and after hit counts, the exceptions with reasons, and the file → hit list. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies.
