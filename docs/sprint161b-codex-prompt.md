# Sprint 161b — Tenant Home/Rent: match the approved mockup (corrections to Sprint 161)

**Severity: L2** (tenant UI only). Model: gpt-reserve, medium. One run.

## 1. Objective
Sprint 161 (`5c4b0f1`) is live but does not match the approved design (canvas https://claude.ai/artifact/GKgJPNk7dLiLYdXUCchLpV, "Tenant Home (phone)" / "Tenant Home (desktop)"). Fix exactly the items below. Verified live as the smoke tenant ($1/mo lease, landlord cannot collect online, 3 unpaid months).

## 2. Context
- Branch `main`, HEAD `5c4b0f1` or later docs-only. Paths under `apps/web/`. `lib/tenant-pay-state.ts` `getTenantPayState` is correct — keep using it.
- Home today renders the old `PayRentCard` (`components/dashboard/pay-rent-card.tsx`) as the rent card inside `components/dashboard/tenant-overview.tsx`, plus a duplicate status line below it.

## 3. In scope
1. **New calm rent card** `components/dashboard/tenant-rent-card.tsx` used on Home and at the top of Rent (replace the PayRentCard there). Layout per mockup: small label, big amount, one due line, then ONE state block:
   - `can_pay`: label "Rent due"; amount = total unpaid rent (if more than one month: "$X · 3 months"); due line "due <Mon D> · in N days" or "N days late" (warning colour, no red alarm card, no left border stripe); primary **Pay rent** button; under it "Bank transfer is free. Cards have a small fee." Tapping Pay rent reveals the existing PayRentCard payment UI (method choice, fees, autopay) — PayRentCard is only shown after that tap.
   - `not_ready`: same label/amount/due line; a muted box "Online pay isn't on yet" / "Your landlord is still setting it up. Pay them the way you usually do for now." No receipt line, no pay buttons.
   - `outside`: same; box "You pay your landlord outside Domus."
   - `paid`: label "<Month> rent"; success box "Paid <Mon D>. Thank you!"
   - `not_posted`: label "Next rent"; amount = lease rent; "due <Mon D>"; "You can pay once it's posted."
   - Never show "Please pay as soon as possible to avoid late fees" unless the lease late fee > $0 (then: "A $X late fee may apply."). Never the word "charges".
2. **Remove duplicates on Home:** the extra "Home" `h2` under the greeting; the second "<Property> · <Unit> · $X is N days late" line below the card.
3. **Desktop sidebar (and drawer):** items and order exactly Home (`overview`) · Rent (`charges`) · Problems (`maintenance`) · Messages (`notifications`) · Your lease (`documents`). Today the first item is labelled "Rent" and "Your lease" sits before Messages. Bottom bar already correct — keep.
4. **Rent page:** fix the literal `&apos;` in "Pay rent and see what you've paid." (use a real apostrophe / proper JSX escaping); remove the big "My Lease" details block from Rent (it lives on "Your lease"); order = rent card → open months list → "Past payments" → autopay / "Already paid?" controls.
5. Grep the tenant surfaces for any remaining "charge"/"charges" user-facing text and "avoid late fees", and fix them per §18 words.

## 4. Out of scope / invariants
- Payment server logic, `tenant-pay-state.ts` rules, messaging, owner/manager screens (shared components' owner/manager output unchanged; their tests pass unmodified).
- Do NOT modify or revert any file not listed in §5 — including `.claude/launch.json` or anything you did not create in this sprint.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`components/dashboard/tenant-rent-card.tsx` (new), `components/dashboard/tenant-overview.tsx`, `components/dashboard/pay-rent-card.tsx` (only if it needs a prop to render without its own header), `app/tenant/page.tsx`, `components/dashboard/sidebar/nav-items.ts`, `components/dashboard/charges-section.tsx` (tenant branch only, if the duplicate card/text lives there), plus tests. ≤ 6 non-test files.

## 6. Implementation requirements
- Tests: rent card renders the exact copy for each state and shows Pay rent only for `can_pay`; PayRentCard appears only after tapping Pay rent; multi-month total; late-fee line only when late fee > 0; no "charges" text; Home has no extra "Home" heading or duplicate status line; tenant sidebar labels/order exact; Rent page apostrophe renders correctly and has no "My Lease" block.
- Validation: lint, typecheck, the vitest files you touched/added, AND every existing test file that imports a component you changed (find with grep). Claude runs the full gate.
- Plain words, ≤12 words per sentence; tokens only; light + dark; 390 px + 1280 px; 44 px targets. The user should never need to read instructions to complete this flow; every step must be self-explanatory.

## 7. Validation commands
```bash
npm run lint:web
npx tsc -p apps/web/tsconfig.json --noEmit
cd apps/web && npx vitest run <touched/added tests> <existing tests importing changed components>
git diff --stat
```

## 8. Acceptance criteria (binary)
- Lint, typecheck, targeted tests pass.
- Every §3 item matches; owner/manager unchanged.
- Only §5 files changed; nothing else modified or reverted.

## 9. Report format
Conform to `docs/codex-report-schema.json` (set `gate_passed` from the targeted checks and say so). Findings: one line per §3 item. No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
