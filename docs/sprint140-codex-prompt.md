# Sprint 140 — Reskin Phase 7: PDFs + money pages to v2

**Severity: L2** (styling only on money-adjacent pages; zero logic, data, Stripe, or auth changes). Attached image: v2 app reference screenshot.

## 1. Objective
Bring the last legacy-styled, user-facing money surfaces to v2: the four PDF documents (rent receipt, receipts bundle/invoice, lease summary, manager invoice) and four web pages that have NO dark-mode styling today (receipt page, payment success, payment canceled, Stripe bank-setup page).

## 2. Context
- Branch `main`, HEAD `55ac289`. v2 tokens live in `apps/web/app/globals.css`. Emails are already v2 (`lib/email-templates.ts`) — use them as the color reference for paper/print.
- PDFs use `@react-pdf/renderer`; all colors are centralized in `apps/web/lib/pdf/pdf-styles.ts` (`colors.primary = "#7c3aed"` violet etc.). PDFs are paper: they stay LIGHT always.
- Pages with legacy classes and zero `dark:` handling: `app/payments/receipt/[chargeId]/page.tsx` (19), `app/payments/success/page.tsx` (5), `app/payments/cancel/page.tsx` (3), `app/connect/onboard/page.tsx` (26).

## 3. In scope
**A. PDFs** — in `lib/pdf/pdf-styles.ts`, replace the palette with the v2 light palette (these exact hexes, matching the emails):
`text #191B1E`, `textMuted #6F757C`, `border #E6E6E0`, `white #FFFFFF`, `surface2 #F5F5F1` (replaces `primaryLight`), `accent #1D4ED8` (replaces `primary` — use sparingly: brand name/mark only; headings and the header rule use `text`/`border`), `success #15803D`, `danger #B91C1C`. Rename keys so no "primary"/violet naming remains. Brand header: "Domus" wordmark in `text` color with a thin `border`-colored rule (no filled violet circle). Update the 4 templates ONLY where they reference renamed keys or hard-code colors. No layout or content changes beyond that.
**B. Pages** — restyle the 4 pages with v2 tokens (`var(--…)` from `globals.css`) and `components/ui/*` primitives so they read correctly in light AND dark. Status colors via `--pos`/`--warn`/`--crit` (+ `-bg`) pairs. The receipt page must still print as a clean light document (keep/ensure print styles force light colors).
**C. Copy** — only if a string on these 4 pages violates the plain-language rules (CLAUDE.md §18: e.g. "charge" → "rent"/"payment"). Log every change. Do not change amounts, dates, IDs, or legal text.

## 4. Out of scope
- Any logic: data loading, Stripe calls/redirects, auth/role checks, PDF data assembly (`lib/pdf/pdf-data.ts`), API routes under `app/api/pdf/**`. Byte-identical.
- Emails (already v2). Other dashboard components with legacy classes (separate cleanup later).
- No DB, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`apps/web/lib/pdf/pdf-styles.ts`; `apps/web/lib/pdf/{receipt-template,invoice-template,lease-summary-template,manager-invoice-template}.tsx` (only key renames/hard-coded colors); `apps/web/app/payments/receipt/[chargeId]/{page,loading,print-button}.tsx`; `apps/web/app/payments/success/page.tsx`; `apps/web/app/payments/cancel/page.tsx`; `apps/web/app/connect/onboard/page.tsx`; tests that assert on renamed style keys or changed copy (list each). Nothing else.

## 6. Implementation requirements
- Tokens only on pages; every `var(--…)` must exist in `app/globals.css`. Primitives from `components/ui/*`.
- PDFs: only the hexes listed in §3A; no new fonts.
- Do not add or change any link, email address, URL, or route. If one looks wrong, report it in `deviations` instead of changing it.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.
- Render each of the 4 PDF templates once with fixture data in a test or script and confirm it renders without throwing (report how).

## 7. Validation commands
```bash
npm run gate:web
rg -n -i "7c3aed|ede9fe|10b981|1f2937|6b7280|e5e7eb|dc2626|violet|purple|primaryLight" apps/web/lib/pdf
rg -n "\b(bg|text|border|from|to|ring)-(zinc|violet|slate|emerald|gray|purple|indigo)-[0-9]" "apps/web/app/payments" apps/web/app/connect/onboard/page.tsx
rg -o "var\(--[a-z0-9-]+\)" "apps/web/app/payments" apps/web/app/connect/onboard/page.tsx | sort -u   # each must exist in apps/web/app/globals.css
git diff --stat -- apps/web/lib/pdf/pdf-data.ts apps/web/app/api   # must be empty
```
Commands 2 and 3 must return zero lines; the last must be empty.

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled — real result).
- PDF legacy-color sweep = 0; page legacy-class sweep = 0; all CSS vars defined.
- All 4 PDF templates render without error with fixture data.
- `pdf-data.ts` and `app/api/**` unchanged; no logic diffs on the 4 pages (only className/markup for styling + logged copy).
- No files outside §5 changed.

## 9. Report format
Final message must conform to the attached JSON schema (`docs/codex-report-schema.json`). `copy_changes` lists every text change; `deviations` lists anything suspicious you did NOT change. `self_verification.attempted=false` is fine for browser checks (Claude verifies visually).
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
