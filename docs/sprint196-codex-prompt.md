# Sprint 196 — Messages polish + plain words on Automations, Applications, Documents, Find a tenant; guard catches returned strings (L2) · Categories 3 (Manager) / 9 (Plain language)

## 1. Objective
Finish the manager dry-run findings 6–7 (`docs/manager-dry-run-2026-10-07.md`) and the small Messages issues seen in the Sprint 195 walk. All changes are display/copy only: no DB writes, no schema changes, no new queries unless §3.2 allows one.

## 2. Context
- Branch `main`, HEAD current `main` (docs-only commits after `0affe06` are fine). Next 15.5, React 19, Vitest.
- Plain-language guard: `apps/web/lib/plain-language/scan.ts` checks JSX text, display attributes, display properties (`title`, `body`, `description`, `message`, `error`, `label`, `subject`, `heading`, `text`, `cta`) and `toast(...)`. It **misses strings returned from functions** (e.g. `triggerLabel()` in `automation-templates-section.tsx:34–42` returns "Charge becomes late", "Vendor response exceeds SLA").
- Automation names and descriptions come from the DB table `automation_templates` (`key`, `name`, `description`). **Do not change the DB.** Map them in the UI by `key`.
- Files and lines (approximate): `components/dashboard/inbox-section.tsx` (481 lines: 170 intro, 174–175 tab labels, 300–301 create-thread inputs, ~423 "Open context", ~440 `message.senderEmail ?? "System"`), `components/dashboard/inbox-views.tsx:128` "Open context", `components/ui/animated-tabs.tsx` (indicator measured in `useEffect` on `activeTab`), `components/dashboard/automation-templates-section.tsx` (226 lines), `components/dashboard/applications-section.tsx` (382, 428, 465), `components/dashboard/documents-section.tsx` (92–94 flow buttons, "Document Workflow" heading), `components/dashboard/leasing-hub-section.tsx` (82, 139), `components/dashboard/dashboard-config.ts:101`.
- Live bug: on owner/manager Messages, when the tab starts on **Threads** (since Sprint 195), the underline indicator stays under **Timeline** (seen at 1280 px dark).

## 3. In scope (exact copy)
1. **Tab indicator.** In `animated-tabs.tsx`, the indicator must sit under the active tab on the first paint and after resize. For example, measure in `useLayoutEffect` and re-measure on `ResizeObserver`/window resize and `document.fonts.ready`. Add a test: rendering with `activeTab` set to the second tab positions the indicator at that tab's `offsetLeft`/`offsetWidth` (mock the measurements).
2. **Messages.**
   - Tab labels: `Timeline` → `Updates`, `Threads` → `Conversations` (keep the ids `"timeline"`/`"threads"`).
   - Intro line (~170): `Updates about rent, repairs, leases, and papers.`
   - Create form: placeholder `Thread subject` → `Subject`. **Remove** the `Entity ID (optional)` input; the action treats `entityId` as optional, so confirm it still works without it and say so.
   - `Open context` (both files) → `Go to related page`. Its `title` → `Open the page this conversation is about.`
   - The thread type badge (`typeLabel(...)`): sentence case, plain words, e.g. `tenant profile` → `Tenant`. List every value mapped.
   - Sender line: show the sender's name when known, `You` for the viewer's own messages, else the email as today, else `System`. Get the name from the profile data the thread loader already reads (add `full_name` to an existing select or reuse a loaded map). No new DB round trip. If impossible without one, keep the email and say so.
3. **Automations** (`automation-templates-section.tsx`): add a display map by `key` for name, trigger and description. Unknown keys fall back to the DB `name`/`description` and the trigger `Starts on its own`.

   | key | Name | Trigger | Description |
   |---|---|---|---|
   | `late_rent_sequence` | Late rent steps | Rent becomes late | Tell the tenant and keep track when rent is late. |
   | `lease_renewal_sequence` | Lease renewal steps | Lease is ending soon | Send reminders and renewal papers before the lease ends. |
   | `new_ticket_sla` | Repair follow-up | A new repair is reported | Remind you to handle new repairs on time. |
   | `move_in_sequence` | Move-in steps | Lease starts | Track move-in tasks, first rent, and papers. |
   | `move_out_sequence` | Move-out steps | Lease is ending | Track the move-out check, final papers, and last balance. |
   | `manager_vendor_followup` | Vendor follow-up | A vendor has not answered in time | Follow up when a vendor is slow to answer a repair. |

   Also: heading `Domus Flows` → `Automatic steps`; intro → `Turn on the steps you want for each home.`; `Open workflow context` → `Go to related page`. Keep the `Trigger:` and `Actions:` labels as `Starts when:` and `What it does:`.
4. **Applications:** ~382 → `Review applications and decide who rents your home.`; ~428 → `No applications yet. Create one from a listing to start.`; ~465 → `Enter screening scores yourself (0 to 1,000). Add notes to explain your choice.`; `dashboard-config.ts:101` clickHint → `open applications`.
5. **Documents:** flow buttons `Template Flow` → `Templates`, `Packet Flow` → `Send papers`, `File Flow` → `Files`; heading `Document Workflow` → `Documents`.
6. **Find a tenant:** ~82 → `` `${n} ${n === 1 ? "home" : "homes"} · ${m} ${m === 1 ? "unit" : "units"}` `` (same values); ~139 `Next best action: ${label}` → `Next step: ${label}`.
7. **Guard: returned strings.** In `scan.ts`, also check string/template literals that are the direct expression of a `return` statement, a ternary branch, or an `??`/`||` fallback inside **`.tsx` files under `components/` and `app/`**, when the text contains a space (multi-word). Same rules (banned words, ≤ 12-word sentences). Run it. Fix real user-facing hits with plain copy in the same style (list each before → after in the report). Add an exception only for strings that are provably not shown to users, each with a specific reason. The total cap of 25 stays.
8. **Tests.** Update existing tests that assert old strings (list each). Add: the animated-tabs indicator test (§3.1); an inbox test for the sender line (name / `You` / email fallback) and the removed Entity ID input; an automation test that renders a `late_rent_sequence` row with the mapped name, trigger and description plus an unknown key falling back; a plain-language unit test proving a returned multi-word string with "Charge" in a `.tsx` component is caught.

## 4. Out of scope
DB/data changes (including `automation_templates`), stored thread subjects, notifications (OFF), manager reminders, Activity log text, any logic beyond §3. Deploy, commit, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
`components/ui/animated-tabs.tsx`, `components/dashboard/inbox-section.tsx`, `components/dashboard/inbox-views.tsx`, the one inbox loader file needed for sender names (name it), `components/dashboard/automation-templates-section.tsx`, `components/dashboard/applications-section.tsx`, `components/dashboard/documents-section.tsx`, `components/dashboard/leasing-hub-section.tsx`, `components/dashboard/dashboard-config.ts`, `lib/plain-language/scan.ts`, `lib/plain-language/exceptions.json` (only if needed), files changed for §3.7 hits (list each), and tests (all under `apps/web/`). If `inbox-section.tsx` would pass 500 lines, move helpers into `inbox-views.tsx`.

## 6. Implementation requirements
Exact copy; sentences ≤ 12 words; lines ≤ 140 chars; files ≤ 500 lines; no new dependencies; no `eslint-disable`. The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npm run lint:web`; `npx tsc --noEmit -p apps/web/tsconfig.json`
- Targeted tests for every changed file and every test importing one (`grep -rlE "animated-tabs|inbox-section|inbox-views|automation-templates-section|applications-section|documents-section|leasing-hub-section|dashboard-config" apps/web --include=*.test.ts --include=*.test.tsx`), plus `lib/__tests__/plain-language.test.ts`.
- `npm run build --workspace @domus/web` (Sprint 195's first gate failed on a client/server import; build must pass).

## 8. Acceptance criteria (binary)
1. The tab indicator matches the active tab on first paint; the test proves it.
2. All §3.2–3.6 copy matches exactly; the Entity ID input is gone; sender names follow §3.2 (or the report explains why not).
3. The guard catches returned/ternary/fallback multi-word strings in `.tsx`; the full-tree test passes; each new exception is justified (total ≤ 25).
4. Lint, typecheck, targeted tests and build pass; only §5 files changed.

## 8b. Post-deploy verification (Claude only)
Smoke manager + owner: Messages opens on Conversations with the underline under it (1280/375, light/dark); intro, Go to related page, sender names; Automations rows with new names (do not toggle); Applications, Documents, Find a tenant copy. 0 console errors; smoke; Sentry; CI.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Include the §3.7 hit list (before → after) and any exceptions. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
