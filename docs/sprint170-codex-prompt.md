# Sprint 170 — Bank feed polish + automatic checks for the bank pages (L1)

## 1. Objective
1. **Polish:**
   - a re-upload must never reopen a review card in "Change" mode;
   - a payment the owner recorded as method `other` reads "Paid outside Domus" instead of "Other".
2. **Coverage:** the existing post-deploy smoke checks also render `/owner/bank` and `/owner/money` as the smoke owner, with zero console errors and no severe contrast findings, in dark and light.

## 2. Context
- Branch `main`, HEAD `fdb8697` or a later docs-only commit.
- `apps/web/components/bank-feed/page-shell.tsx` renders `ReviewCard` with `key={item.i}` (the row index). After a second upload, a card with the same index keeps its old local state, for example the open "Change" panel. The row `token` is unique per import.
- `apps/web/lib/home-money.ts` `plainMethod` maps `other` → "Other". Real data: the owner's rent payments recorded by hand have `method='other'`.
- Smoke tests: `apps/web/tests/e2e/smoke-auth.spec.ts` (render scenarios, `collectRenderErrors`) and `apps/web/tests/e2e/smoke-theme.spec.ts` (`assertView`, `configureTheme`, `switchThemeInSession`, `waitForView`). Both run against production with `SMOKE_*` env vars via `npm run smoke:web` (`scripts/smoke-web.sh`).
- The smoke owner has one home ("Smoke Test Property") and may have no bank accounts. The pages must render either way.

## 3. In scope
1. `page-shell.tsx`: key review cards and personal ("Missed a bill?") rows by `token`. On each new import, reset any per-card UI state.
2. `home-money.ts` `plainMethod`: `other` → "Paid outside Domus". Keep the other mappings (`ach` → "Bank transfer", `card` → "Card", `cash` → "Cash", `check` → "Check"). Anything unknown → "Other".
3. `smoke-auth.spec.ts`: extend the owner scenario. After the dashboard renders, visit `/owner/bank` and then `/owner/money`. Assert:
   - `/owner/bank` shows the heading "Bank activity";
   - `/owner/money` shows a heading ending in "money" and the text "Left after bills";
   - the body never contains "application error" or "something went wrong";
   - zero console errors and zero page errors across all three pages.

   **Read-only:** no clicks that write data, no uploads, no answers.
4. `smoke-theme.spec.ts`: in the owner test, add `assertView` for `/owner/bank` and `/owner/money` in dark and in light. Reuse the existing helpers. Navigate with `page.goto`.

## 4. Out of scope
Any behaviour change beyond §3. Other smoke scenarios. `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/components/bank-feed/page-shell.tsx`
- `apps/web/lib/home-money.ts`
- `apps/web/tests/e2e/smoke-auth.spec.ts`
- `apps/web/tests/e2e/smoke-theme.spec.ts`
- `apps/web/components/__tests__/bank-feed-shell.test.tsx`
- `apps/web/lib/__tests__/home-money.test.ts`

Each line at most 140 characters. Do not compact code (L-015).

## 6. Implementation requirements
- Keep existing tests green. Keep the `retries: 0` and serial settings as they are.
- The smoke additions must not lengthen the owner theme test by more than about 20 seconds.

## 7. Validation commands to run
- `npx vitest run apps/web/components/__tests__/bank-feed-shell.test.tsx apps/web/lib/__tests__/home-money.test.ts`
- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `npm run lint:web`
- If `SMOKE_*` env vars are available, run `APP_URL=https://domusbase.com npm run smoke:web`. Otherwise say so; Claude runs it.

## 8. Acceptance criteria (binary)
1. A new shell test: import file A, open "Change" on a card, then import again → the card renders closed (no "Type" select visible).
2. A `home-money.test.ts` case: `plainMethod("other")` returns "Paid outside Domus"; the existing method cases still pass.
3. The smoke specs contain the new `/owner/bank` and `/owner/money` checks exactly as in §3.3–3.4, with no write actions. Claude confirms by running smoke against production: 3 render tests plus the theme suite pass.
4. Typecheck and lint pass. Only §5 files changed.

## 9. Report format
JSON per `docs/codex-report-schema.json`. In `self_verification.findings`, list the new test cases. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, deploy, commit or push. Never modify or revert files outside §5. No new dependencies.
