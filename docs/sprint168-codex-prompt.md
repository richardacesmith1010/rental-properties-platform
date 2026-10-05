# Sprint 168 — Bank feed fixes: full Undo, live recent list, home names, no waived rent (L3)

Revision 2 — ChatGPT verdict APPROVE WITH CHANGES; all 4 required changes and both optional suggestions adopted (rule reversed before the record, so failures are retryable; restore-failure fallback deletes the rule; newer-owner-answer ownership rule; 23505 race tests; zod-parsed snapshot; cross-account undo test).

## 1. Objective
Fix the four defects found in Claude's live walk of Sprint 167:
1. Undo leaves the "Always do this" rule behind, so the undone item is filed automatically on the next upload.
2. "Recent bank items" does not update after an answer or an undo.
3. A bill suggestion does not name the home ("Looks like: Mortgage").
4. The rent picker can list waived rent.

## 2. Context
- Branch `main`, HEAD `cb8b522` or a later docs-only commit. Sprint 167 is live (`67e2168`). Spec history: `docs/sprint167-codex-prompt.md`.
- **Migration written and applied by Claude** (do not edit): `supabase/migrations/20261005_sprint168_bank_rule_undo.sql`. It adds two columns to `bank_transactions`:
  - `rule_created boolean not null default false`;
  - `rule_snapshot jsonb`, which is null or an object, and never set when `rule_created` is true.

  No check ties them to `rule_id`, because `rule_id` is `ON DELETE SET NULL`.
- Current code:
  - `answerBankItem` (`apps/web/app/actions/bank-feed.ts` ~268–364) files the item first, then inserts or updates a rule. It does **not** record `rule_id` on the bank item.
  - `undoBankItem` (~366) → `undoFiledItem` (`apps/web/lib/bank-feed/file-item.ts` ~109) handles only `created_record=true` items.
- Lesson L-016: Undo must reverse **every** write the forward action made.

## 3. In scope
1. **Answer records its rule side effect** (`answerBankItem`, `decision: "yes"` with `always` and a specific payee).
   - Before writing the rule, read any existing rule for the same (owner account, bank account, direction, match_text).
   - If none existed: insert, then update the bank item with `rule_id` = the new id and `rule_created = true`.
   - If one existed: snapshot its `{action, lease_id, property_id, expense_category, label}`, then update it. Then update the bank item with `rule_id` = that id and `rule_snapshot` = the snapshot.
   - Check every error. If the bank-item update fails, reverse the rule write and return `ruleError: true`. The item stays filed.
     - New rule: delete it.
     - Overwritten rule: restore the snapshot. **If that restore also fails, delete the rule**, so an untracked "Always" rule is never left active.
     - Log fixed operation names only.
   - The 23505 conflict path follows the same rules: the initial lookup saw no rule, but a concurrent insert won. Fetch the winning rule, snapshot its
     current values, update it, then save `rule_id` + `rule_snapshot` on the bank item.
   - `decision: "no"` (skip rules) is unchanged. There is no bank item, so nothing changes there.
2. **Undo reverses everything** (`undoBankItem` + `undoFiledItem`). Allowed for any bank item with `matched_by = 'owner'` (rent, expense or transfer, whether or not `created_record` is set), after the existing auth and ownership checks.
   - Do these steps in this order. The rule is reversed **first**, so a failure never destroys the data needed to retry:
     1. **Reverse the rule** (only when `rule_id` is still set):
        - `rule_created`:
          - delete the rule, unless a **newer owner answer** has since overwritten it, that is another bank item with `matched_by='owner'`,
            the same `rule_id`, a non-null `rule_snapshot` and a later `created_at`;
          - in that case keep the rule, because the newer answer now owns its state;
          - references from `rule`/`auto` items are history only and never block deletion (`rule_id` is ON DELETE SET NULL).
        - `rule_snapshot`:
          - parse it with a zod schema (`action` in rent|expense|transfer|skip, nullable uuids, nullable category from the allowed list, nullable label ≤ 80);
          - restore it onto the rule with `.eq("id", rule_id)`, expecting one row;
          - if the parse or the restore fails (for example the integrity trigger rejects it because the old lease or property is gone), delete the rule instead.
        - If the rule cannot be reversed at all (the delete also fails), **stop**. Return `{ success: false, error: "We could not undo this. Try again." }`
          and do not touch the record. The bank item and its rule data stay, so the user can retry.
     2. **Reverse the record:**
        - if `created_record`: the existing logic (delete the expense or payment; the bank item cascades; guarded charge restore);
        - otherwise: delete the bank item by id and expect one row.
        - If this fails after the rule was reversed, return the error. A retry is safe: `rule_id` is now null (SET NULL) or the snapshot is already restored, which is idempotent.
   - Items with `matched_by` `rule` or `auto` stay non-undoable, as today.
   - The UI shows "Undo" on every collapsed "Filed:" card that has a `bankTransactionId`. "Already recorded" and "Moving my money" items now show it too.
3. **Recent list updates right away.**
   - `answerBankItem` returns `recentItem` (`{ id, postedOn, description, propertyName, kind, amountCents, direction }`) for a filed item.
   - In `page-shell.tsx`, keep a local `recent` state:
     - initialise it from props;
     - re-sync it when the props change;
     - prepend `recentItem` after "Yes";
     - remove the item by id after a successful Undo.
   - Keep `router.refresh()`. The list shows at most 20 items.
4. **Home name in bill suggestions.** In `match.ts`, when the suggestion has a property, the suggestion `text` is "{label} · {property name}" (for example "Mortgage · Smoke Test Property"). Rent suggestions are unchanged.
5. **No waived rent in the picker.** In `app/owner/bank/page.tsx`, select `status` for the rent options and exclude `waived` (and soft-deleted) rents before passing them to the shell.

## 4. Out of scope
- Undo for skipped ("Not rental") items.
- Rule management UI, Phase 2, any other file, and the migration file.

## 5. Exact files expected to change
- `apps/web/app/actions/bank-feed.ts`
- `apps/web/lib/bank-feed/file-item.ts`
- `apps/web/lib/bank-feed/match.ts`
- `apps/web/lib/bank-feed/types.ts`
- `apps/web/app/owner/bank/page.tsx`
- `apps/web/components/bank-feed/page-shell.tsx`
- `apps/web/components/bank-feed/review-card.tsx`
- `apps/web/components/bank-feed/recent-list.tsx`
- bank-feed test files under `apps/web/lib/__tests__/` and `apps/web/components/__tests__/`

Each file must be at most 400 lines, and each line at most 140 characters. If `bank-feed.ts` would exceed 400 lines, move the rule write/undo helpers into a new `apps/web/lib/bank-feed/rules.ts` (with `import "server-only"`). That file is then allowed.

## 6. Implementation requirements
- Keep all Sprint 167 invariants:
  - auth order: requireAuth("owner") → rate limit → zod → membership → ownership checks → mutations;
  - claim-first rent filing and guarded compensation;
  - keyed fingerprints and verified tokens;
  - no logging of rows, descriptions, amounts, tokens or raw DB errors;
  - plain-language copy without banned words.
- Every mutation checks its error, and its row count where stated.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npx vitest run` on all `bank-feed-*` test files
- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `npm run lint:web`

## 8. Acceptance criteria (binary)
1. Action tests:
   - **Yes + Always, no existing rule:** the bank item gets `rule_id` and `rule_created=true`. Undo deletes the record, the bank item and the rule. Importing the same row again gives `ask`, not auto.
   - **Yes + Always, with an existing rule** (e.g. a skip rule for the same text): the snapshot is stored. Undo restores the previous action and fields exactly.
   - **A created rule that a later auto-filed item also references:** Undo of the first item keeps the rule.
   - **The bank-item update fails after the rule insert:** the rule is deleted and `ruleError: true` is returned.
   - **The snapshot restore is rejected during Undo:** the rule is deleted instead, and Undo succeeds.
   - **Undo of an owner-answered transfer item** and of an **"Already recorded" rent item:** the bank item is deleted (no payment is touched) and its rule is reversed.
   - **Undo of a `rule` or `auto` item** is refused.
   - **23505 race:** the lookup sees no rule, the insert gets 23505, the winning rule is fetched and snapshotted, then updated, and `rule_id` + `rule_snapshot` are saved.
     If that bank-item metadata write fails, the snapshot is restored. If the restore fails, the rule is deleted and `ruleError: true` is returned.
   - **A newer owner answer overwrote a created rule:** Undo of the older item keeps the rule. A rule only referenced by later `auto`/`rule` items is still deleted.
   - **Rule reversal fails** (delete error): Undo returns the error, the record, bank item and rule data are untouched, and a retry succeeds.
   - **A malformed `rule_snapshot`** is not applied; the rule is deleted instead.
   - Another owner account's member cannot Undo a `matched_by='owner'` item by supplying its id: refused, nothing written.
   - Non-member and other-account requests are refused and write nothing (existing tests still pass).
2. Component tests:
   - After "Yes", the recent list shows the new item without a page reload. After Undo, it disappears.
   - "Already recorded" and transfer cards show Undo.
   - A bill suggestion renders "Mortgage · {home}".
3. A page or loader test (or a unit test of the option filter) proves waived and deleted rents are excluded.
4. The targeted tests, typecheck and lint pass. Only §5 files changed. All size and line limits hold.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB apply, no migration edits, no deploy, no commit, no push.
- Never modify or revert files outside §5. Never touch `.claude/launch.json`, `docs/`, `CLAUDE.md` or `AGENTS.md`.
- No new dependencies.
