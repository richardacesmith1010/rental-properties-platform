# Sprint 163 — Tenant polish batch (Messages as a simple chat, rent total, Rent page) + small debts

**Severity: L2** (tenant UI/display + tests; no auth, payment, schema, or server-rule changes). Model: gpt-reserve, medium. One run.

## 1. Objective
Close the tenant polish backlog found verifying Sprints 161b/162 live (smoke tenant), plus three small debts. Target design: canvas https://claude.ai/artifact/GKgJPNk7dLiLYdXUCchLpV (board "Message + report a problem (phone)").

## 2. Context
- Branch `main`, HEAD `a1bde28` or later docs-only. Paths under `apps/web/`.
- Tenant Messages (`app/tenant/page.tsx` section `notifications`, renders `components/dashboard/inbox-section.tsx`): live it shows the page title "Messages" + subtitle "Everything you need for your home." (`page.tsx:284`), a second "Messages" heading, the inbox card "Messages · 8 unread · Mark all as read", Timeline/Threads tabs, a thread list AND the open thread, a raw entity tag "tenant profile", and sender labels `{message.senderEmail ?? "System"}` (`inbox-section.tsx:459`) — so the tenant's first message shows "System" and later ones show their email.
- `components/dashboard/tenant-rent-card.tsx:59-64`: the total-due amount ("$X · N months") is only computed for `can_pay`; other states show one month.
- `components/dashboard/charges-section.tsx`: tenant `AutopayCard`s (`:420-434`) and per-row tenant pay blocks (`charge-row.tsx` ~389-460, disabled when `!paymentsAvailable`) still render when online pay is off.
- `lib/tenant-pay-state.ts` `getNextRentDueDate` caps the day at 28 and ignores a future lease start date.
- Manager Rent shows "Rent is added each month from your leases." twice (`section-renderer-support.tsx:24` description + the card help in `charge-section-controls.tsx`).
- Sprint 160 shipped without focused tests for O2 (unit/lease success messages), O4 (rent pre-fill in both wizards), O5 (accepted-invite-without-lease row).

## 3. In scope
1. **Tenant Messages = simple chat** (tenant only; owner/manager inbox unchanged):
   - One header: title "Messages", subtitle "Talk with your landlord." No second "Messages" heading.
   - No Timeline/Threads tabs and no notification list or "unread / Mark all as read" on this page for tenants (alerts stay reachable from the bell).
   - With one conversation: show it directly as a chat (no thread list), oldest → newest, the tenant's messages right-aligned labelled "You", the landlord's left-aligned with their display name (fallback "Your landlord"); time under each. No entity tag ("tenant profile"). Reply box always visible at the bottom ("Write a message…", **Send**).
   - With several conversations (more than one home): a simple list of homes first, then the chat.
   - With none: the existing Sprint 162 composer.
   - Fix the sender label everywhere in the tenant view: never "System" for a person's message and never a raw email for the current user. (If the DTO lacks what's needed — e.g. sender profile id / name — add it to `lib/inbox.ts` mapping without changing queries' scope; say what you added.)
2. **Rent total:** the rent card shows the total of all unpaid rent ("$X · N months") in every unpaid state (`can_pay`, `not_ready`, `outside`), with the due line using the oldest unpaid due date.
3. **Rent page when online pay is off:** for tenants, hide `AutopayCard`s and the per-row pay buttons whenever `getTenantPayState` is not `can_pay`; keep "Already paid? Mark as paid" and Past payments.
4. **`getNextRentDueDate`:** use the real last day of the month for due days 29–31 (e.g. due day 31 in February → Feb 28/29), and never return a date before the active lease's start date. Tests for both.
5. **Manager Rent duplicate:** show the help sentence once (drop the manager section-frame description; keep the card help).
6. **Sprint 160 test debt:** add focused tests for O2 (success message after unit save and after lease create), O4 (rent pre-filled from the unit in the invite wizard and the lease wizard), O5 (accepted invite with no lease shows "Set up lease"; a tenant with any lease — active, ended, or pays-outside — does not).

## 4. Out of scope / invariants (L-014)
- Server actions, inbox queries' authorization, notifications, payments, schema.
- Owner and manager inbox UI and behaviour unchanged (shared `inbox-section.tsx`: branch on tenant view; owner/manager tests pass unmodified). Owner/manager Rent unchanged except §3.5.
- Do NOT modify or revert any file not listed in §5 — including `.claude/launch.json` or anything you did not create in this sprint.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`app/tenant/page.tsx`, `components/dashboard/inbox-section.tsx`, `lib/inbox.ts` (DTO mapping only, if needed), `components/dashboard/tenant-rent-card.tsx`, `components/dashboard/charges-section.tsx`, `components/dashboard/charge-row.tsx` (tenant branch only, if needed), `lib/tenant-pay-state.ts`, `components/dashboard/section-renderer-support.tsx`, plus tests (incl. new focused tests for owner wizards/home). ≤ 8 non-test files.

## 6. Implementation requirements
- Tests for every §3 item; existing owner/manager inbox and Rent tests pass unmodified.
- Validation: lint, typecheck, the vitest files you touched/added, AND every existing test file that imports a module/component you changed (find with grep). Claude runs the full gate.
- Plain words, ≤12 words per sentence; tokens only; light + dark; 390 px + 1280 px; 44 px targets. The user should never need to read instructions to complete this flow; every step must be self-explanatory.
- No PII in logs. Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run lint:web
npx tsc -p apps/web/tsconfig.json --noEmit
cd apps/web && npx vitest run <touched/added tests> <existing tests importing changed modules>
git diff --stat
```

## 8. Acceptance criteria (binary)
- Lint, typecheck, targeted tests pass.
- Every §3 item implemented and tested; owner/manager unchanged.
- Only §5 files changed; nothing else modified or reverted.

## 9. Report format
Conform to `docs/codex-report-schema.json` (set `gate_passed` from the targeted checks and say so). Findings: one line per §3 item with its test name; any DTO field added. No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
