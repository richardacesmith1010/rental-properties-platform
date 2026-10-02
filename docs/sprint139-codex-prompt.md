# Sprint 139 — Reskin Phase 6: honest v2 landing page + unit label fix + Sentry env tag

**Severity: L2** (public marketing UI + display-only label fix + one observability setting; no money/auth/schema logic). Attached images: (1) v2 app reference screenshot, (2) current landing (light), (3) current landing (dark — note it ignores dark mode).

## 1. Objective
Rebuild the public landing page (`/`) in the v2 design language — calm, trustworthy, money-tool look — with **only true claims**, no game pitch, working light/dark themes, and content that is visible even before scroll animations run. Also fix the duplicated "Unit Unit S" label everywhere, and make browser Sentry events report the right environment.

## 2. Context
- Branch `main`, HEAD `66af876`. All app surfaces are v2 (tokens in `apps/web/app/globals.css`); the landing is the last legacy surface (101 hard-coded `violet-/slate-/zinc-/emerald-` classes, light-only).
- Landing files: `apps/web/app/page.tsx` (redirects signed-in users), `components/marketing/{landing-shell,landing-page,landing-content,animate-on-scroll}.tsx`.
- **Content that is not true today (must go):** "Trusted by 500+ landlords managing 2,000+ units"; the three testimonials (invented people); "99.9% uptime"; the whole Gamification feature tab ("XP, levels, streaks…", 2,450 XP mock); the pricing tiers ($29 / $79 / Custom — Domus has no paid plans or unit limits; hero already says "for free"); FAQ answer about "up to 3 units" free.
- Defect: full-page captures show a huge blank area — `AnimateOnScroll` hides content until an IntersectionObserver fires. Content must be visible by default.
- "Unit Unit S": unit numbers can already contain the word "Unit". `formatUnitLabel()` in `lib/format.ts` handles this but 7 render sites bypass it with a literal `Unit {…}`.
- Sentry: `instrumentation-client.ts` reads `process.env.VERCEL_ENV`, which is not exposed to the browser → browser events tagged `development`. `sentry.server.config.ts` and `sentry.edge.config.ts` are byte-identical.

## 3. In scope
**A. Landing (v2):**
1. Restyle all marketing components with v2 tokens only (`--ground`, `--surface`, `--surface-2`, `--ink`, `--ink-2`, `--muted`, `--faint`, `--accent`, `--pos`/`--warn`/`--crit` pairs — whatever `globals.css` defines) and `components/ui/*` primitives. Zero legacy palette classes. Must look right in light AND dark (follow the same theme mechanism the app uses; system preference by default).
2. Sections to keep (rewritten in plain language, 6th-grade, ≤12-word sentences): header with Sign in; hero (headline + one-line value + "Start free" + "See how it works"); problems (3 cards); features (tabs or grid — Rent, Problems/repairs, Documents & leases, Reports, Managers; NO gamification); how it works (4 steps); FAQ; footer.
3. Hero visual: keep a product-style preview but restyle to v2 (neutral surfaces, single accent, no neon gradients). Data in it must be clearly sample (generic, no fake people's real-sounding full names — use "Unit 2A", "Unit 3", etc.).
4. Remove: social-proof stat line, testimonials section, uptime claim, Gamification tab, pricing tiers section and any nav/anchor link to it. Replace pricing with one short honest block: "Free while Domus is in early access. No credit card." Fix the FAQ "Is Domus really free…" answer to match (no unit limit claim). Remove/adjust any other FAQ claim not backed by the product (keep the security answer factual: role-based access, encrypted connections, audit log).
5. `AnimateOnScroll`: content visible by default (no `opacity-0` before JS); animation only as enhancement, and disabled under `prefers-reduced-motion`.
6. Update `app/page.tsx` metadata description to plain language if needed (no claims).

**B. Unit label:** replace the 7 literal `Unit {…}` renders with `formatUnitLabel(…)`:
`components/reports/drilldown-panel.tsx:138`, `app/payments/receipt/[chargeId]/page.tsx:137`, `components/dashboard/pay-rent-card.tsx:201`, `components/dashboard/tenant-lease-details.tsx:59`, `components/dashboard/ticket-form.tsx:177` and `:262`, `components/dashboard/property-detail-tenants-panel.tsx:89`. No other changes to those files.

**C. Sentry:**
1. Create `lib/sentry-options.ts` exporting the shared init options (dsn, enabled guard, `sendDefaultPii:false`, `tracesSampleRate:0`, `beforeSend: scrubSentryEvent`) with an `environment` argument; server, edge, and client configs all use it (no duplicated option blocks).
2. Client environment: `process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development"`. Server/edge keep `VERCEL_ENV`.

## 4. Out of scope
- Any signed-in app surface beyond the 7 label lines. Emails, PDFs (Phase 7). Backend gamification (later L3). Auth pages. Login page copy.
- No new pages, no pricing/billing logic, no analytics changes, no new dependencies.
- No DB, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`apps/web/app/page.tsx`; `apps/web/components/marketing/{landing-shell,landing-page,landing-content,animate-on-scroll}.tsx`; the 6 label files listed in §3B; `apps/web/instrumentation-client.ts`, `apps/web/sentry.server.config.ts`, `apps/web/sentry.edge.config.ts`, `apps/web/lib/sentry-options.ts` (new); `apps/web/tests/e2e/public-pages.spec.ts` and any unit test whose assertions reference removed landing copy or the old label format (update, list each). Nothing else.

## 6. Implementation requirements
- Tokens only — every `var(--…)` you use must exist in `app/globals.css`. Primitives from `components/ui/*`.
- Plain-language rules (CLAUDE.md §18): no jargon ("charge", "submit", "maintenance ticket" → "rent", "send", "problem"). Log every copy change.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.
- Landing must remain a server component page with no data queries; keep the signed-in redirect untouched.
- Responsive at 375px and 1280px with no horizontal scroll.
- You may split work with sub-agents (landing vs label vs Sentry) — keep one coherent diff.

## 7. Validation commands
```bash
npm run gate:web
rg -n "violet-|slate-|zinc-|emerald-|fuchsia-|indigo-|purple-" apps/web/components/marketing apps/web/app/page.tsx
rg -n -i "xp|streak|achievement|gamif|testimonial|trusted by|500\+|2,000|99\.9|\\\$29|\\\$79|opacity-0" apps/web/components/marketing apps/web/app/page.tsx
rg -n "Unit \{" apps/web/app apps/web/components --glob '!**/__tests__/**'
rg -o "var\(--[a-z0-9-]+\)" apps/web/components/marketing apps/web/app/page.tsx | sort -u   # each must exist in apps/web/app/globals.css
```
Commands 2, 3, and 4 must return zero lines (command 3: a match inside an unrelated word is acceptable only if you list it in `deviations`).

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled — real result).
- Legacy-palette sweep (cmd 2) = 0; false-claim/game sweep (cmd 3) = 0; raw unit-label sweep (cmd 4) = 0.
- All CSS vars used in marketing are defined in `globals.css`.
- Landing content visible without scrolling JS (no `opacity-0` default); reduced-motion respected.
- Sentry: one shared options module; client uses `NEXT_PUBLIC_VERCEL_ENV`.
- No files outside §5 changed.

## 9. Report format
Final message must conform to the attached JSON schema (`docs/codex-report-schema.json`). `copy_changes` must list every removed claim and every rewritten line. `self_verification.attempted=false` is fine (no browser in sandbox — Claude verifies visually).
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
