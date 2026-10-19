# Sprint 242e — Redesign: tenant, manager, shared sections, receipts and PDFs (L2, web, look only)

## 1. Objective
Finish the "Registry in graphite" look on every remaining signed-in screen: the tenant app, the manager app, the
dashboard sections shared by roles (rent/charges, payments, repairs, messages/inbox, leases, units, tenants, documents,
vendors, clients, applications, invitations, members, automations, activity, alerts), receipts and payment result pages,
join pages, and the PDF documents. Spec: `docs/design/domus-design-system.md`. 242a–242d are in.
**Look only:** no copy, layout, spacing, order, behavior or data change.

## 2. Context
- HEAD: latest `main`. Paths under `apps/web/`.
- 43 files in scope still use `rounded-full`, `rounded-3xl`, `rounded-[Npx]` or `bg-[var(--accent)]` (list with the grep in §7).
- Tenant tab bar: `components/dashboard/tenant-bottom-bar.tsx` (active tab uses `--accent-weak` fill + `--accent` text).
- PDFs: `lib/pdf/pdf-styles.ts` (183 lines) holds the palette (`:4-11`: `#191B1E`, `#6F757C`, `#E6E6E0`, `#F5F5F1`,
  `#1D4ED8`, `#15803D`, `#B91C1C`) and Helvetica / Helvetica-Bold; templates `lib/pdf/*-template.tsx`.
- Tokens and helpers available: `--action*`, `--hero*`, `--line-2`, `font-display`, `.domus-section-label`, `Badge`,
  `DomusMark` / `DomusWordmark` (`components/brand/domus-mark.tsx`).
- 242d's rules for owner screens are the model (`docs/sprint242d-codex-prompt.md` §6); apply the same rules here.

## 3. In scope
`app/tenant/**`, `app/manager/**`, `app/join/**`, `app/join-llc/**`, `app/payments/**`, `app/autopay/**`,
`app/complete-profile/**`, `app/onboarding/**`, `app/portal/**`, `components/dashboard/**` EXCEPT the files 242d owned
(`owner-home/**`, `owner-homes/**`, `owner-bottom-bar.tsx`, `sidebar/**`, `dashboard-header.tsx`, `dashboard-layout.tsx`,
`ai-assistant.tsx`, `owner-bank-card.tsx`, `owner-daily-ops-home.tsx`, `user-menu-popover.tsx`,
`notification-bell-menu.tsx`), `components/maintenance/**` if present, `lib/pdf/**`, and tests/snapshots pinning the old look.

## 4. Out of scope
Anything 242a–242d changed, `globals.css`, `components/ui/*`, emails, copy, layout, the iOS app.

## 5. Exact files expected to change
Only files inside §3. List every changed file with line counts in the report. New test file:
`apps/web/components/__tests__/tenant-manager-look.test.tsx`.

## 6. Implementation requirements
1. **Same rules as 242d §6.1–6.3 and 6.5–6.9**: primary fills → action tokens; selected segments → surface on
   surface-3; accent only for links/focus/info markers; screen titles and big money figures → `font-display
   font-semibold`; section headings → `font-display text-[18px] font-semibold`; eyebrow/all-caps labels →
   `domus-section-label`; shape rule (`rounded-full` only on avatars, dots, toggles, the floating help button; bars
   `rounded-[1px]`; cards `rounded-2xl`; controls `rounded-xl`); hand-built chips → `Badge`; no stray hex colors.
2. **Screen header rule** — under each tenant/manager screen title block: `border-b-2 border-[var(--ink)] pb-3`.
3. **Tenant tab bar** — top border `border-t border-[var(--ink)]`; active tab `text-[var(--ink)] font-semibold` with no
   fill; inactive `text-[var(--faint)]`.
4. **Rent due card** (tenant home): amount in `font-display`; "Online pay isn't on yet" note → `border-l-[3px]
   border-[var(--accent)] bg-[var(--surface-2)]` box (no rounded pill); "I paid this" → `Button variant="outline"`.
5. **Message bubbles** — the user's own bubble: `bg-[var(--action)] text-[var(--action-contrast)]`; the other side:
   `bg-[var(--surface-2)] text-[var(--ink)]`; radius `rounded-2xl`.
6. **PDFs** (`lib/pdf/pdf-styles.ts` + templates) — palette: text `#0B0C0E`, muted `#4D535C`, border `#D9DCE1`, surface
   `#F3F4F6`, accent `#2442B8`, success `#0E7A3E`, danger `#B4232A`; titles and totals use the built-in `Times-Bold`
   (serif); body stays `Helvetica`; header "Domus" in `Times-Bold`; table header row: 1 pt `#0B0C0E` bottom rule,
   uppercase 8 pt labels with letter spacing; border radius ≤ 2. No font registration, no network fonts.
7. Lines ≤ 140 characters. No new dependencies. No copy changes.

## 7. Validation commands
```
(cd apps/web && npx vitest run components/__tests__/tenant-manager-look.test.tsx)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
/usr/bin/grep -rlnE "rounded-3xl|rounded-\[(6|7|8|9|1[0-9]|2[0-9])px\]|bg-\[var\(--accent\)\]" <every §3 path>
/usr/bin/grep -rn "#1D4ED8\|#191B1E\|#F5F5F1\|#E6E6E0" apps/web/lib/pdf
```
Both greps print nothing. Do NOT run `npm run gate:web`.

## 8. Acceptance criteria
1. `tenant-manager-look.test.tsx` "tenant tab bar": the nav has `border-[var(--ink)]`; the active link has
   `text-[var(--ink)]` and no `bg-[var(--accent-weak)]`; labels Home, Rent, Repairs, Messages unchanged.
2. Same file, "rent due": the tenant rent card's amount has `font-display`; "I paid this" renders as an outline button
   (`border-[var(--ink)]`); all visible strings unchanged (assert the ones the existing tenant tests assert).
3. Same file, "messages": in a thread with one tenant and one landlord message, the own bubble has `bg-[var(--action)]`
   and the other has `bg-[var(--surface-2)]`.
4. Same file, "pdf palette": `pdf-styles.ts` exports colors equal to the §6.6 values and a title style using `Times-Bold`;
   rendering the receipt template to a buffer (as existing PDF tests do) succeeds.
5. Every existing test passes; each updated old-look assertion/snapshot is named in the report.

## 9. Report format
Compact status only: files changed with line counts, test names, command results, grep outputs, updated assertions.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only §3 files (plus tests). No copy, layout or behavior changes. No new dependencies.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
  user needs to think about what to do, the UI needs to be clearer.
