# Sprint 132 — Reskin Phase 1: Owner surface to v2 + owner cold-load perf

**Severity: L2** (visual + data-loading performance on the owner surface; no money/auth/schema logic changes). Source of truth: `docs/design-system.md` v2. Builds on Phase 0 (tokens/primitives/rail — live as of `052638b`).

## 1. Objective
Two paired outcomes on the owner surface (the user's daily driver):
1. **Reskin:** owner dashboard content, KPI tiles, sections, property drill-down, and reports restyled to v2 — numbers-forward, semantic status color, no violet remnants, both themes clean.
2. **Perf:** measured reduction of the owner dashboard's cold login→render time (baseline: >15s cold, measured 2026-07-17 by the smoke suite; warm ~5s). Instrument first, then fix the measured offenders.

## 2. Context
- Branch `main`, HEAD `7e1fe98`.
- Phase 0 shipped the token layer; unreskinned owner components currently render via legacy `--domus-*` aliases and hardcoded violet/zinc Tailwind classes. This sprint replaces those with v2 tokens/primitives on the owner surface only.
- Focused-mode architecture: one section visible at a time (sidebar-driven), yet the server currently loads a wide data fan-out before first paint (`components/dashboard/dashboard-home-loader.ts`, section loaders, `app/owner/page.tsx` ~380 lines of data assembly).
- Perf evidence: cold `/owner` (fresh serverless + fresh session) exceeded the smoke spec's 15s URL timeout twice; warm full-suite runs pass in ~21s for all three roles. Sprint 43 already parallelized some loads and split components — remaining suspects are serverless cold start + blocking fan-out + heavy first-paint payload.
- Known dark-mode punch-list items on this surface (from Phase 0 walk): none owner-specific found beyond violet remnants; settings-page items are Phase 4 (do NOT touch settings here).

## 3. In scope
1. **Instrumentation (do this FIRST, report the numbers):** lightweight server-side timing of the owner first-paint path — total data-assembly time plus per-loader timings (existing `lib/logger.ts` patterns; log lines greppable in Vercel logs as `[perf:owner]`). Keep it permanently (cheap), not as throwaway.
2. **Perf fixes driven by those measurements**, chosen from these approved techniques only:
   - Sequential awaits → `Promise.all` / `Promise.allSettled` (mixed-criticality per Sprint 40 conventions).
   - Defer below-the-fold / non-visible-section data: first paint loads ONLY what the default visible section needs; other sections stream via Suspense or load on section switch (the section-switch loading state must use existing skeleton patterns).
   - Collapse duplicate queries (same table+filter fetched by multiple loaders) into shared lookups passed down.
   - NO caching layers, NO ISR/PPR flags, NO runtime/edge changes, NO schema changes.
3. **Owner surface reskin to v2** (both themes):
   - `app/owner/page.tsx` + `components/dashboard/index.tsx` shell content: greeting/status row, section header, pagination "X of Y", banners already tokenized — align spacing/typography to v2 (22px/640 screen titles, micro-labels 11px/600 uppercase).
   - KPI tiles (Sprint 44 command center): v2 KPI spec — micro-label, 25px/660 tabular value, one metadata line; delta in accent, past-due in `--crit`. The number is the hero.
   - Section list/tables (charges, tenants, leases, maintenance, records, analytics, manager payments as rendered in `components/dashboard/`): cards to v2 surfaces/hairlines; status via the semantic pairs (`--pos/--warn/--crit` tints) replacing any remaining `lib/status-colors.ts` violet/emerald/amber hardcodes — update `status-colors.ts` itself to emit token-based classes (it is the sanctioned central utility).
   - Property drill-down (`app/owner/properties/[propertyId]/page.tsx` + its components) and reports (`app/owner/reports/page.tsx` + `components/reports/`): same treatment; charts per v2 (accent area fill ~0.2 opacity → transparent, 2px stroke, endpoint dot, faint baseline; Recharts config only).
   - Remove owner-surface violet remnants (hardcoded `violet-*`/`purple-*`/`bg-white` classes) in the files this sprint touches; "Ask Domus" and Feedback float buttons → v2 accent styling (shared components — allowed as the one cross-surface exception, listed in report).
   - Gamification widgets on the owner surface (mascot imagery, progress/XP strips): do NOT remove logic (Phase 5) — restyle containers to v2 neutrals so they stop shouting purple.
4. **Copy:** any label touched that violates plain-language rules gets fixed in passing (log each change).

## 4. Out of scope
- Tenant, manager, settings, marketing, auth, onboarding-wizard surfaces (later phases).
- No removal of gamification features/logic (Phase 5). No section-config/IA changes, no new sections, no route changes.
- No changes to `app/actions/`, `lib/` business logic (allowed: `lib/status-colors.ts` styling output, timing instrumentation inside owner loaders, and loader query-shape refactors per §3.2 — with identical returned data contracts).
- No DB/migrations, no deploy, no env changes, no commit/push (Claude reviews, commits, deploys).

## 5. Exact files expected to change
Anchors (known):
- `apps/web/app/owner/page.tsx`
- `apps/web/app/owner/properties/[propertyId]/page.tsx`
- `apps/web/app/owner/reports/page.tsx`
- `apps/web/components/dashboard/index.tsx`
- `apps/web/components/dashboard/section-renderer.tsx`
- `apps/web/components/dashboard/dashboard-home-loader.ts`
- `apps/web/components/dashboard/charges-section.tsx`
- `apps/web/lib/status-colors.ts` (+ its test)
Bounded allowance: other files under `apps/web/components/dashboard/`, `apps/web/components/reports/`, and owner-specific loaders they import — every touched file listed in the report. HARD exclusions: `apps/web/components/settings/`, `apps/web/components/onboarding/`, anything tenant/manager-only, `app/actions/**`.

## 6. Implementation requirements
- **Perf order of work:** instrument → capture baseline numbers locally (log output) → implement fixes → capture after numbers → report both. If a measured offender can't be fixed within §3.2's techniques, report it with data instead of improvising.
- **Data-contract freeze:** loader refactors must return byte-identical data shapes (existing unit tests + any darkened section must render identical values; KPI numbers must match pre-change output for the same DB state).
- **Skeletons:** deferred sections use the existing skeleton components; no blank flashes; no layout shift on section switch.
- **Both themes:** every restyled component verified against light and dark tokens; no hardcoded hexes — tokens only.
- **Tabular numerals** on every money/date/count figure on the owner surface.
- **Tests:** update component tests whose class assertions change (list them); add a loader test asserting the first-paint payload excludes deferred-section data; keep 970-test baseline green.

## 7. Validation commands
```bash
npm run gate:web
```
Report perf log lines (baseline vs after) from local runs. No live Stripe/Supabase writes in tests.

## 8. Acceptance criteria (binary)
- `gate:web` passes; all tests green.
- `[perf:owner]` instrumentation present and reporting total + per-loader timings.
- Measured local improvement in owner first-paint data assembly reported (numbers, before/after, same seed/local conditions).
- First paint loads only the default section's data; other sections deferred with skeletons; zero data-value changes for identical DB state.
- Owner surface (shell, KPI, sections, drill-down, reports) uses v2 tokens/primitives; zero hardcoded `violet-*`/`purple-*`/`bg-white`/hex colors in touched files; `status-colors.ts` emits token classes.
- KPI tiles match the v2 spec (micro-label / 25px tabular value / metadata line, semantic deltas).
- Charts restyled per v2 within Recharts config.
- Both themes verified in component tests where assertable; no out-of-scope diffs.

## 9. Report format (required status booleans)
`gate_passed`, `perf_instrumented`, `perf_baseline_and_after_reported`, `first_paint_scoped_to_default_section`, `data_contracts_unchanged`, `owner_surface_tokenized`, `status_colors_tokenized`, `charts_v2`, `no_out_of_scope_diffs`, `tests_updated_and_passing`.
Plus: every touched file, every copy change, every updated test assertion, perf numbers table, deviations with justification.
`MANUAL_VERIFICATION_PATH`: 1) smoke owner → dashboard renders v2 in light+dark, KPI numbers match DB reality, sections switch with skeletons and no layout shift; 2) real owner → drill into 1st Home and reports, verify charts + numbers unchanged from pre-sprint values; 3) authenticated smoke passes 3/3; 4) Claude compares cold-load timing via smoke spec runs and Vercel `[perf:owner]` logs before/after deploy.
No "Claude prompt" sections.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude. The user should never need instructions to understand the reskinned screens; if a touched label needs explaining, reword it (plain language) and log it.
