# Sprint 160 — Owner fixes from the first-tenant dry run (O1–O9)

**Severity: L2** (owner UI/display + shared wizard defaults; no auth, payment-movement, schema, or server-rule changes). Model: gpt-reserve, medium. One run — read every item.

## 1. Objective
Fix the nine owner-side problems found in the 2026-10-04 first-tenant dry run (`docs/dryrun-2026-10-04.md`), so an owner can add a unit, invite a tenant, and set up their lease without hunting, and the owner Home numbers are right.

## 2. Context
- Branch `main`, HEAD `247c226` or later docs-only. Paths under `apps/web/`. Owner and manager share the invite and lease wizards.
- Files (verified by grep): add-unit flow `components/dashboard/operations-section.tsx` (reachable only at `/owner?section=operations`), unit form `components/dashboard/forms/unit-form.tsx`; Add menu `components/dashboard/owner-add-menu.tsx`; invite wizard `components/dashboard/tenant-invite-wizard.tsx` + `tenant-invite-wizard-support.tsx`; lease wizard `components/dashboard/lease-wizard.tsx` (+ `lease-wizard-steps.tsx`); Homes "Manage" toggle `components/dashboard/portfolio-section.tsx:289`; owner Home `components/dashboard/owner-daily-ops-home.tsx` + summary `components/dashboard/dashboard-home-loader.ts` (`:145-171` next-due logic excludes pays-outside leases); money tiles `components/dashboard/domus-financials-card.tsx:140` ("Still outstanding"); bank card `components/dashboard/owner-bank-card.tsx` + `lib/owner-bank-status.ts`; owner bundles `app/owner/owner-page-data.ts` (`buildOwnerBundlePlan`, home bundles; `invitations` bundle exists).

## 3. In scope
1. **O1 Add a unit:** add "Add a unit" to the owner Add menu (between "Add a home" and "Add a tenant"); it opens the existing add-unit flow (the operations unit step, or the unit form in a dialog — whichever reuses existing code with less change; say which). Manager Add menu unchanged.
2. **O2 Confirmations:** after "Save Unit" succeeds, show a clear success message ("Unit D added.") and return the form to a fresh state or close it; after the lease wizard's "Create Lease" succeeds, show a success message ("Lease created for <tenant>.") before/after closing. Use the existing toast/success patterns.
3. **O3 Vacant units only:** the tenant invite wizard's unit list shows only vacant units (match the lease wizard's rule). If a property has no vacant units, say "All units are rented. Add a unit first." with a link/button to Add a unit (owner) or nothing extra (manager).
4. **O4 Pre-fill rent:** both wizards pre-fill Monthly rent from the selected unit's rent (editable). In the invite wizard, keep rent/lease optional but change the skip copy so the owner knows the tenant won't have rent yet: "Skip — you'll add rent later."
5. **O5 Tenant joined prompt:** on owner Home "Needs you today", add a row for each invite that is **accepted** whose tenant has **no active lease**: "<Name> joined. Set up their lease." with a **Set up lease** button opening the lease wizard pre-selected to that property/unit/tenant where possible. Load what's needed by adding the existing `invitations` bundle to the owner home bundle plan (no new query unless unavoidable — say why).
6. **O6 Label:** Homes card "Manage"/"Done" toggle → "Edit"/"Done".
7. **O7 Next rent due with pays-outside leases:** when the next due rent belongs only to pays-outside-Domus leases, the tile still shows the date and amount with the sub-line "Pays outside Domus" (instead of "No rent due"). Late counts keep excluding them (Sprint 146b rule unchanged).
8. **O8 Collected vs outstanding:** "Still outstanding" must not count rent that is not yet due (future pending charges). Show only past-due + due-today unpaid rent, so "100% collected" and "Still outstanding $0" agree. Keep the receivables/reports numbers unchanged (display tile only).
9. **O9 Bank card names the account:** when the bank state is `needs_info`/`not_started` because of a specific ownership account, the card says which: title "<Account name> needs one more thing" / "Connect a bank for <Account name>"; if all accounts are affected, keep the generic copy. Link stays the existing per-account connect href.

## 4. Out of scope / invariants (L-014)
- Tenant screens (separate sprint); payments; schema; auth; reports math; manager dashboard behaviour except the shared wizard improvements in O3/O4 (which apply to managers too) — manager Add menu stays 2 items.
- Owner invariants: grouped menu, section cache/URL behaviour, Rent page, existing Home layout; existing owner tests pass unmodified unless a test asserts the exact old copy changed here (then update only that assertion and say which).
- Do NOT modify or revert any file not listed in §5 — including `.claude/launch.json` or anything you did not create in this sprint.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`components/dashboard/owner-add-menu.tsx`, `components/dashboard/operations-section.tsx`, `components/dashboard/forms/unit-form.tsx`, `components/dashboard/tenant-invite-wizard.tsx`, `components/dashboard/tenant-invite-wizard-support.tsx`, `components/dashboard/lease-wizard.tsx`, `components/dashboard/lease-wizard-steps.tsx`, `components/dashboard/portfolio-section.tsx`, `components/dashboard/owner-daily-ops-home.tsx`, `components/dashboard/dashboard-home-loader.ts`, `components/dashboard/domus-financials-card.tsx`, `components/dashboard/owner-bank-card.tsx`, `lib/owner-bank-status.ts`, `app/owner/owner-page-data.ts`, `components/dashboard/index.tsx` (only if the Add menu / lease wizard pre-select wiring needs it), plus tests. ≤ 15 non-test files.

## 6. Implementation requirements
- Tests for each of O1–O9 (one focused test each at minimum), incl.: Add menu has 4 owner items / 2 manager items; success messages appear after unit save and lease create; invite wizard lists only vacant units + empty-state copy; rent pre-filled from unit in both wizards; accepted-invite-without-lease row appears and disappears once a lease exists; "Edit" label; next-due tile with only a pays-outside lease shows date + "Pays outside Domus"; outstanding excludes future pending; bank card names the single affected account and stays generic when all are affected.
- Targeted validation (Claude runs the full gate): lint, typecheck, and the vitest files you touched/added.
- Plain words, ≤12 words per sentence; tokens only; light + dark; 390 px + 1280 px; 44 px targets. The user should never need to read instructions to complete this flow; every step must be self-explanatory.
- No PII in logs. Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run lint:web
npx tsc -p apps/web/tsconfig.json --noEmit
cd apps/web && npx vitest run <the test files you touched or added>
git diff --stat
```

## 8. Acceptance criteria (binary)
- Lint, typecheck and targeted tests pass.
- O1–O9 each implemented and tested as specified; manager Add menu still 2 items.
- Only §5 files changed; nothing else modified or reverted.

## 9. Report format
Conform to `docs/codex-report-schema.json` (set `gate_passed` from the targeted checks and say so). `self_verification.findings`: one line per O-item (what changed + test name), which add-unit entry approach you chose, whether any new query was added (and why), and any owner test assertion you updated.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
