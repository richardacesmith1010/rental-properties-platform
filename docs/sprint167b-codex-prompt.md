# Sprint 167b — Bank feed review fixes (L3 follow-up, same approved scope)

## 1. Objective
Fix the defects found in Claude's review of the uncommitted Sprint 167 work. The work is still in the working tree, not committed. Keep everything else unchanged.

## 2. Context
- Branch `main`, HEAD `ca6c99a`. The Sprint 167 changes are uncommitted in the working tree. They are yours to edit.
- Spec: `docs/sprint167-codex-prompt.md` (rev 4). The migration is live; do not edit it.

## 3. In scope (each item has a required test)
1. **`lib/bank-feed/csv.ts` (Debit/Credit sign):**
   - With separate Debit and Credit columns, use the absolute values: `in = |credit|`, `out = |debit|`.
   - If both cells hold a non-zero value, drop the row (count it in `ignoredLineCount`).
   - Also accept `$-59.99` and `-$59.99`.
   - Tests:
     - debit "-59.99" → out 5999;
     - debit "59.99" → out 5999;
     - credit "2350.00" → in 235000;
     - both cells filled → ignored;
     - "$-59.99" and "-$59.99" → 5999 with the correct sign.
2. **`lib/bank-feed/match.ts` (transfer evidence is used once):**
   - Each rent item can justify at most **one** automatic incoming transfer and at most **one** automatic outgoing transfer.
   - Each incoming transfer leg can justify at most one outgoing transfer.
   - Mark evidence as used inside `classifyRows`.
   - Count stored transfer items already linked in time as using their evidence: an existing stored incoming `transfer` with the same amount 0–10 days after the rent item, on another account, uses that rent item.
   - Further matching rows become `ask`.
   - Test: one 2350 rent item plus two incoming 2350 "DEPOSIT" rows on another account → exactly one `transfer`, and the other row is `ask` (rent suggestion).
3. **`app/actions/bank-feed.ts` (a stale rule must not block imports):**
   - When an auto rule's target fails the access or active check (property inactive or not allowed, lease not active, or no qualifying rent), classify that row as `ask` instead of `failPartial`.
   - Test: an expense rule pointing at an inactive property → the import succeeds, and that row is `ask`.
4. **Rent rule with a second deposit:**
   - When a rent rule's target charge is already `paid` and was filed from a **different** bank item in this request or earlier, return `ask` with the rent suggestion. Do not stop the import, and do not link silently.
   - Test: two equal deposits in one file, both matching one charge by a rule → the first is filed, the second is `ask`, and the import finishes.
5. **`components/bank-feed/page-shell.tsx` + `upload-card.tsx` (account for answers and removal):**
   - Keep `importBankAccountId` (the account used for the last import) separate from the dropdown selection. Answers and undo always use `importBankAccountId`.
   - The "Add an account" option never becomes a bank account id.
   - "Remove this account" acts on a clearly named account. The confirm text is "Remove {nickname}? Filed rent and bills stay."
   - Test: import with account A, switch the dropdown to B, answer an item → the call uses A.
6. **Small fixes:**
   - `bank-feed.ts`: load transfer legs up to the latest row date + 5 days.
   - A wrong-direction `choice` returns "This doesn't fit money going {in|out}." instead of the access message.
   - A `decision:"no"` request never builds a rule that has a lease, property or category; reject it with a validation error.
   - `file-item.ts`: add `import "server-only"`. When rent was waived after filing, undo deletes the payment, leaves the waived status, and returns success.
   - `review-card.tsx`: exclude waived rents from the "Rent due" list.
   - When a rent rule finds no matching rent, still run the rent-suggestion step before `ask`.

## 4. Out of scope
Anything not listed above, the migration, other features, `.claude/launch.json`, `docs/`, `CLAUDE.md` and `AGENTS.md`.

## 5. Exact files expected to change
`apps/web/lib/bank-feed/csv.ts`, `apps/web/lib/bank-feed/match.ts`, `apps/web/lib/bank-feed/file-item.ts`, `apps/web/app/actions/bank-feed.ts`, `apps/web/components/bank-feed/page-shell.tsx`, `apps/web/components/bank-feed/upload-card.tsx`, `apps/web/components/bank-feed/review-card.tsx`, and the bank-feed test files under `apps/web/lib/__tests__/` and `apps/web/components/__tests__/`. Each file must be at most 400 lines, and each line at most 140 characters.

## 6. Implementation requirements
- Keep all Sprint 167 invariants:
  - the auth order;
  - claim-first rent filing and guarded compensation;
  - keyed fingerprints and tokens;
  - no logging of rows, descriptions, amounts or tokens;
  - plain-language copy without banned words.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npx vitest run` on all `bank-feed-*` test files plus `owner-daily-ops-home.test.tsx`
- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `npm run lint:web`

## 8. Acceptance criteria (binary)
1. Every test listed in §3 exists and passes, and all existing bank-feed tests still pass.
2. Typecheck and lint pass.
3. Only §5 files changed. All size and line limits hold.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB apply, no deploy, no commit, no push.
- Never modify or revert files outside §5. Never touch `.claude/launch.json`.
- No new dependencies.
