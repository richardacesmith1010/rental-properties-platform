# Sprint 206c — Clients screens polish (L1) · Category 3 (Manager)

## 1. Objective
Fix the polish issues found in the Sprint 206 live walk. They're all small UI and copy changes for managers. Behavior for owners must not change.

## 2. Context (HEAD `4c00beb`+docs, main)
- **Clients section:** `components/dashboard/clients/clients-section.tsx`, rendered by `render-section-cases.tsx:407` inside `SectionFrame` (`section-renderer-support.tsx:172`). `SectionFrame` always renders `PropertyScopeControl` (the "SHOW: All homes" picker, :40), except on `members` and `tenants`.
- **Page header:** `components/dashboard/index.tsx:423–440`. `PageHeader` already shows the section title "Clients" and its description. For managers, its `actions` slot is always `<OwnerAddMenu role="manager" …>` (button label "Add").
- **Unified wizard:** `components/dashboard/unified-property-wizard.tsx`. At :291 the title is `{pickingClient ? "Whose home is this?" : "Set up the property, units, lease, and tenant in one flow"}`. At :294 the subtitle is "One pass. No cleanup. Domus creates the records only after you confirm the full setup." The client step (`whose-home-step.tsx`) repeats its own `Whose home is this?` heading. The success view's button "Go to Dashboard" lives in `property-wizard-drafts.tsx:~205–213` (`finishSetup`).
- **Client page:** `app/manager/clients/[accountId]/page.tsx` plus `components/dashboard/clients/client-detail.tsx`. It renders with no app shell, so on a phone there's no top bar or menu. The empty state shows an `Add a home` button both in the header row and inside the empty card.
- **`lib/client-overview.ts`:** lines 24–25 are over 140 characters.

## 3. In scope
1. **One heading on Clients.** Remove the inner `<h2>Clients</h2>` row from `ClientsSection`. On the `clients` section, the manager page header's action is a single `Add client` button that opens the same Add client sheet; it replaces `OwnerAddMenu` on this section only. In the empty state, keep the empty card's own `Add client` button. Don't show two `Add client` buttons together: when the list is empty, show only the card's.
2. **No home picker on Clients.** `PropertyScopeControl` returns null when `activeSection === "clients"`.
3. **Wizard header for managers:**
   - At the client step, the dialog title is `Add a home` and the step heading `Whose home is this?` appears once, from `WhoseHomeStep`.
   - Replace the subtitle (for everyone) with `Nothing is saved until you finish.`
   - Owners keep their title.
4. **Client page empty state.** Show one `Add a home` button inside the empty card, and none in the header row while the client has no homes.
5. **Client page shell.** Render `/manager/clients/[accountId]` with the same manager top bar and menu as `/manager/properties/[id]`. Reuse whatever layout or shell that route uses. If it has none, add a slim top bar with the Domus logo, a back link `Clients` → `/manager?section=clients`, and the existing mobile menu drawer. Tap targets ≥ 44 px.
6. **After setup from a client page,** the success button reads `Back to client` and returns to `/manager/clients/[accountId]` (refreshed). Everywhere else, `Go to Dashboard` is unchanged.
7. Wrap `lib/client-overview.ts` lines 24–25 to ≤ 140 characters, with no logic change.

## 4. Out of scope
Data, server actions, the DB, owner screens and flows (except the shared subtitle text), Sprint 207.

## 5. Exact files expected to change
- `components/dashboard/clients/clients-section.tsx`
- `components/dashboard/index.tsx`
- `components/dashboard/section-renderer-support.tsx`
- `components/dashboard/unified-property-wizard.tsx`
- `components/dashboard/clients/whose-home-step.tsx` (only if needed)
- `components/dashboard/property-wizard-drafts.tsx`
- `components/dashboard/clients/client-detail.tsx`
- `app/manager/clients/[accountId]/page.tsx`
- `lib/client-overview.ts`
- the matching tests

All under `apps/web/`. Name any other file and give the reason.

## 6. Implementation requirements
- **The user should never need to read instructions to complete this flow. Every step must be self-explanatory.**
- Exact copy. Plain-language guard passes. Theme tokens only. Lines ≤ 140; files ≤ 500 (`unified-property-wizard.tsx` is at 499, so extract rather than grow it). No new dependencies.
- **Owner invariants:** the owner header actions, the owner wizard title, the owner `Go to Dashboard` button and the owner `PropertyScopeControl` all behave as before. Test them.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- Tests for the changed files, plus every test that imports them (grep for the file names)
- `lib/__tests__/plain-language.test.ts`
- `npm run build --workspace @domus/web`

## 8. Acceptance criteria (binary)
Real tests (L-017) for:
1. The Clients section has no inner "Clients" heading, and the header action is `Add client`, which opens the sheet.
2. With an empty list, there's exactly one `Add client` button.
3. No scope picker on `clients`; the owner scope picker is unchanged.
4. The manager wizard title is `Add a home`, and `Whose home is this?` appears once.
5. The subtitle is the new text.
6. An empty client page has exactly one `Add a home`.
7. The client page renders the shell with a `Clients` back link.
8. Success from a client page shows `Back to client`; the owner sees `Go to Dashboard`.
9. Lint, typecheck, guard and build pass; only the listed files changed.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
