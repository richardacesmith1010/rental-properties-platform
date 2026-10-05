# Sprint 158 — Manager clarity 1/2: same grouped menu, Add button and single bank card as owners

**Severity: L2** (manager navigation/UI only; no auth, money, schema, or server data-rule changes). Model: gpt-reserve, medium.

## 1. Objective
Give managers the same owner-approved pattern shipped in Sprints 154–157 (design canvas https://claude.ai/artifact/NtynVroGDr3NoyrWcWWMPx): one grouped sidebar reaching every manager section directly, one "Add" button, no workflow modes / mode box / "N OF 12" counter / prev-next arrows / arrow-key or swipe paging, the simple page header (title + one plain sentence), and one bank card on Home instead of the old banner.

## 2. Context
- Branch `main`, HEAD `cc3f8c4` or later docs-only. Paths under `apps/web/`.
- Manager today (verified live as the smoke manager): sidebar "Daily Ops, New Property, New Tenant, Tenants, Vendor Ops, Reports"; Home shows `ConnectBanner` "Set up management fee payments… Set up now", a KPI header ("PROPERTIES MANAGED / OPEN TICKETS / HIGH PRIORITY / TENANTS BEHIND"), a mode box "DAILY OPERATIONS MODE · Daily manager runbook…", and "1 OF 12" with Previous/Next.
- Manager config: `components/dashboard/dashboard-config.ts` `managerWorkflowModeMeta` (`:38-90`) and `getManagerModeNavItems` (`:347+`); section→mode map `components/dashboard/dashboard-workflow-modes.ts` `MANAGER_SECTION_MODE_BY_ID`. Navigation hook `components/dashboard/dashboard-section-loaders.ts` (manager branches use `router.replace`). Shell `components/dashboard/index.tsx` (`PageHeader`, mode box, arrow keys/swipe, `ConnectBanner` mount with manager condition `stripeConnected`). Sidebar `components/dashboard/sidebar/sidebar-nav.tsx`, `sidebar/nav-items.ts`. Page `app/manager/page.tsx`.
- Owner equivalents to mirror (reuse, don't copy-paste): owner grouped items + `OwnerAddMenu` (`components/dashboard/owner-add-menu.tsx`), `OwnerBankCard` (`components/dashboard/owner-bank-card.tsx`), owner page header in `index.tsx`. Generalise them to take a role or props where needed; keep owner output identical.
- Manager sections: overview, maintenance, charges, notifications, activity, applications, tenants, inbox, automations, expenses, analytics, payments, operations, portfolio, units, leases, leasing, invitations, documents, vendors.

## 3. In scope
1. **Manager sidebar (desktop + mobile drawer)**, showing only sections available today:
   - *Every day:* Home (`overview`), Rent (`charges`, late badge "<n> late"), Repairs (`maintenance`), Messages (`inbox`)
   - *Homes you manage:* Homes (`portfolio`), Units (`units`), Leases (`leases`), Tenants (`tenants`), Find a tenant (`leasing`), Applications (`applications`), Invites (`invitations`)
   - *Money:* Payments (`payments`), Expenses (`expenses`), Charts (`analytics`), Reports (existing manager reports link if one exists today; otherwise omit)
   - *More:* Documents (`documents`), Vendors (`vendors`), Automations (`automations`), Activity (`activity`), Alerts (`notifications`)
   - Bottom: Settings, Help. `operations` reached through Add.
2. **Add button** (header, top-right): "Add a home" → existing property wizard; "Add a tenant" → existing tenant invite wizard. (No "Add a manager".)
3. **Remove for managers:** modes, mode box, KPI header strip, "N OF M", Previous/Next, arrow-key and swipe paging, shortened carousel previews. Same simple header as owners. Legacy `?mode=` manager URLs: ignore `mode` (section present → that section; else Home) and drop it via `history.replaceState`.
4. **One bank card on manager Home only** (replaces `ConnectBanner` for managers): not connected → title "Connect your bank to get your fees", body "Your management fees can’t reach you until this is done.", button "Connect bank" → the existing manager connect href; connected → no card. Reuse the bank card component.
5. **Smoke test:** `tests/e2e/smoke-auth.spec.ts` manager `navLabel` "Vendor Ops" → "Repairs" (button role as rendered). Keep the zero-console-error assertion.

## 4. Out of scope
- Manager Rent page filters/actions and manager Home content redesign (Sprint 159); manager section cache/preload speed; owner and tenant behaviour (must stay identical); server rules; schema; payments.
- Do NOT modify or revert any file not listed in §5 — including `.claude/launch.json` or anything you did not create in this sprint, even if `git status` shows it modified.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`components/dashboard/dashboard-config.ts`, `components/dashboard/dashboard-workflow-modes.ts`, `components/dashboard/dashboard-section-loaders.ts`, `components/dashboard/index.tsx`, `components/dashboard/sidebar/sidebar-nav.tsx`, `components/dashboard/sidebar/nav-items.ts`, `components/dashboard/owner-add-menu.tsx`, `components/dashboard/owner-bank-card.tsx`, `components/dashboard/dashboard-workflow-handlers.ts`, `app/manager/page.tsx`, `tests/e2e/smoke-auth.spec.ts`, plus unit tests (and e2e specs that assert removed manager UI, e.g. `tests/e2e/manager-flows.spec.ts`). ≤ 11 non-test files.

## 6. Implementation requirements
- Unit tests: manager sidebar renders exactly §3.1 (hiding unavailable); every available manager section reachable; no mode box/counter/arrows/paging for managers; Add menu has exactly two items wired to existing wizards; legacy manager `?mode=vendor_ops&section=vendors` → Vendors with mode dropped, `?mode=new_tenant` → Home; bank card shows when not connected and not when connected; **owner sidebar, Add menu (3 items) and owner bank card unchanged** (existing owner tests still pass untouched).
- Validation is targeted (Claude runs the full gate): run only the vitest files you touched/added plus `npx tsc -p apps/web/tsconfig.json --noEmit`.
- Plain words, ≤12 words per sentence; tokens only; light + dark; 390 px and 1280 px; 44 px targets. The user should never need to read instructions to complete this flow; every step must be self-explanatory.
- No PII in logs. Do not invent URLs or emails — reuse existing connect hrefs.

## 7. Validation commands
```bash
cd apps/web && npx vitest run <the test files you touched or added>
npx tsc -p apps/web/tsconfig.json --noEmit
git diff --stat
```

## 8. Acceptance criteria (binary)
- Targeted vitest + typecheck pass.
- Manager sidebar/Add/header/bank card per §3; owner behaviour unchanged (owner tests untouched and passing).
- Legacy manager mode URLs land correctly.
- Smoke manager nav label updated.
- Only §5 files changed; nothing else modified or reverted.

## 9. Report format
Conform to `docs/codex-report-schema.json` (set `gate_passed` to the targeted result and say so in `gate_stage_results`). `self_verification.findings`: manager section→menu mapping, how owner components were generalised without changing owner output, legacy URL handling, files changed.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
