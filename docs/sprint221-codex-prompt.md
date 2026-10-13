# Sprint 221 — Partners: "Even it out" settle-up suggestions (L2) + dark Connect-a-bank contrast · rev 1

The owner approved this on 2026-10-12. Their rule: **"even" means equal shares**, so every partner should have put in the same amount. There's no automatic manager fee; "Manager fee" stays a manual payment kind.

## 1. Objective
On the Money → Partners card (Sprint 219), in the **All time** view, show who should pay whom so every active partner ends up with the same total put in. Each suggestion can be saved as a **planned** settle-up payment in one tap, or all of them at once.

Ride-along: the dark-mode "Connect a bank" button contrast fix.

## 2. Context (HEAD `b4a2d45`, branch `main`)
- **`lib/partners.ts`:**
  - `calculatePartnerReport` returns `rows: PartnerLine[]`. Each row has `id` (null = The LLC), `name`, `active`, `putInCents`, `plannedDelta` and `projectedPutIn`, plus `partners` and `payments`.
  - Done payments move put-in (`from += amount`, `to -= amount`); planned payments only change `projectedPutIn`.
- **`components/home-money/partners-card.tsx` (89 lines):**
  - shows rows;
  - shows the "If planned payments go through:" block;
  - lists payments with Done / Remove;
  - has the Add a payment and Manage partners sheets.
  - `period` is a string; "All time" is the all-time view.
- **`app/actions/partners.ts`:** `addPartnerPayment({ accountId, fromPartnerId, toPartnerId, amountCents, paidOn, kind, status, note })`. It's owner-member-only, LLC-only and validated. Reuse it; no new server action is needed.
- **`components/bank-feed/bank-connections-card.tsx:103-104`:** the "Connect a bank" button uses `text-white` on `bg-[var(--accent)]`. In dark mode the accent is light blue, so the contrast is low. Other primary buttons use `text-[var(--accent-contrast)]`.

## 3. In scope
1. **Pure helper `suggestEvenSettleUp(rows)`** in `lib/partner-settle.ts` (new, ≤ 120 lines).
   - **Input:** the report rows. **Use only active partner rows** (`id !== null && active`); The LLC isn't a partner for evening out.
   - **Base for each partner:** `projectedPutIn` (`putIn + plannedDelta`), so already-planned settle-ups aren't suggested twice.
   - **Target:** split `total = sum(base)` evenly. Each partner's target is `floor(total / n)`, and the first `total % n` partners **sorted by name** get one extra cent, so the targets sum exactly to the total.
   - **Who pays whom:**
     - partners below their target ("owes") pay partners above it ("is owed");
     - greedy: largest debtor pays largest creditor, then repeat;
     - output `Array<{ fromPartnerId, fromName, toPartnerId, toName, amountCents }>`;
     - no zero amounts;
     - at most `n − 1` payments.
   - **Hide it** (return `[]`) when there are fewer than 2 active partners, or when every partner is already within **$1.00** (100 cents) of their target.
   - **Integer cents only**, and the result is deterministic (ties broken by name, then id).
   - **Direction check:** a payment from A to B raises A's put-in and lowers B's (219 rule). So the partner who put in less pays the one who put in more, and after applying all suggestions, every partner's projected put-in equals their target.
2. **UI** (`components/home-money/settle-up-section.tsx`, new, ≤ 120 lines; rendered by `partners-card.tsx`):
   - Only in the **All time** view. In other periods, show one muted line, "See how to even things out in All time." It links to the all-time href.
   - **Title:** "Even it out". **Subtitle:** "So everyone has put in the same amount."
   - **One row per suggestion:** "<From> pays <To>" plus the amount (`.num`), with a button **Add as planned**. It calls `onAddPayment({ accountId, fromPartnerId, toPartnerId, amountCents, paidOn: today, kind: 'settle_up', status: 'planned', note: 'Even it out' })`.
   - **Add all as planned:** shown when there are 2 or more suggestions. It adds them in order and stops at the first error, which it shows.
   - **After a successful add,** the existing refresh path re-renders; the projected block and the suggestions then update. The base includes planned payments, so suggestions disappear once they're planned.
   - **When there are no suggestions** but 2 or more active partners: "Everyone has put in about the same." (muted).
   - The section isn't shown at all with fewer than 2 active partners.
3. **Contrast fix:** in `bank-connections-card.tsx`, change "Connect a bank" `text-white` to `text-[var(--accent-contrast)]`. Fix any other `bg-[var(--accent)] … text-white` in `components/bank-feed/*.tsx` the same way.

## 4. Out of scope
- Automatic manager fees.
- Weighted or percentage shares.
- Changes to The LLC row.
- Server or schema changes.
- Partners logic beyond the new helper.

## 5. Exact files expected to change
- `apps/web/lib/partner-settle.ts` (new)
- `apps/web/components/home-money/settle-up-section.tsx` (new)
- `apps/web/components/home-money/partners-card.tsx` (mount only)
- `apps/web/components/bank-feed/bank-connections-card.tsx` (plus other `components/bank-feed/*.tsx` only for the same contrast change)
- Tests: `apps/web/lib/__tests__/partner-settle.test.ts` (new), `apps/web/components/__tests__/settle-up-section.test.tsx` (new), and an update to the bank UI test if it asserts classes.

## 6. Implementation requirements
- Lines ≤ 140 characters; new files ≤ 120 lines.
- Use tokens only; 44px targets; `.num` for amounts; contrast ≥ 4.5:1 in light and dark.
- Copy, exactly:
  - "Even it out"
  - "So everyone has put in the same amount."
  - "<From> pays <To>"
  - "Add as planned"
  - "Add all as planned"
  - "Everyone has put in about the same."
  - "See how to even things out in All time."
  - the note "Even it out"
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`

## 8. Acceptance criteria (binary; named tests that call real code)
1. **`suggestEvenSettleUp`:**
   - (a) 2 partners, $300 vs $100 → the second pays the first $100;
   - (b) 3 partners (e.g. 5,000 / 2,000 / 2,000 cents) → after applying the suggestions, everyone equals their target, and there are at most 2 payments;
   - (c) an uneven total in cents: the targets sum exactly to the total, and the extra cents go to the first partners by name;
   - (d) The LLC row and inactive partners are excluded;
   - (e) `projectedPutIn` is used: a planned payment that already evens things out → `[]`;
   - (f) all within $1 → `[]`;
   - (g) fewer than 2 active partners → `[]`;
   - (h) the output is deterministic for ties;
   - (i) every amount is a positive integer.
2. **UI:**
   - (a) the All time view shows the rows with the exact copy;
   - (b) another period shows only the link line;
   - (c) "Add as planned" calls `onAddPayment` with `kind 'settle_up'`, `status 'planned'`, note "Even it out" and the right `from`/`to`/amount;
   - (d) "Add all" adds in order and stops on the first error, showing it;
   - (e) with no suggestions, the "about the same" line shows;
   - (f) with fewer than 2 active partners, nothing renders.
3. The "Connect a bank" button uses `text-[var(--accent-contrast)]` (test or class assertion).
4. Lint, typecheck, the full suite and the build are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with the test names mapped to §8. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB access, deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or "* 2.*" files.
- Don't invent copy beyond what's specified here.
