# Sprint 134 — Reskin Phase 2: tenant surface + first-run path to v2

**Severity: L2** (visual conversion; no money/auth/flow logic). Source: `docs/design-system.md` v2. **Design target (user-stated strategy): the NEXT tenant's first-run experience** — invite → account → first rent payment. The current tenant pays outside Domus by choice; this surface is being perfected for the tenant who comes after.

## 1. Objective
Tenant-facing surfaces and the tenant first-run path fully on v2 tokens/primitives, both themes, with the pay-rent card matching the v2 method-selector spec. Plus the 1b escapees in shared/ui roots.

## 2. Context
- Branch `main`, HEAD `be5ee0c`. Phases 0/1/1b live; `components/dashboard/**` + `app/owner/**` are sweep-clean. The tenant page reuses many converted dashboard components (charges-section, inbox-section, ticket-form, tenant-lease-details) — do NOT re-touch those.
- Verified remnant inventory (2026-08-22, `violet-|purple-|indigo-|bg-white` line counts):
  - Tenant proper: `app/tenant/page.tsx` (4), `app/tenant/error.tsx` (3)
  - First-run path: `components/auth/role-selector.tsx` (5), `components/onboarding/onboarding-form.tsx` (3), `components/onboarding/onboarding-wizard.tsx` (2), `app/complete-profile/page.tsx` (imports its form — convert what it renders), `components/onboarding/owner-setup-wizard.tsx` (7 — 1b escapee, owner first-run, include)
  - Gamification containers (restyle only): `components/gamification/xp-bar.tsx` (3), `streak-heatmap.tsx` (2), `gamification-summary` (its file)
  - Shared/ui escapees: `components/ui/animated-tabs.tsx` (2), `components/ui/sonner-provider.tsx` (1), `components/ui/mobile-drawer.tsx` (1), `components/shared/data-row.tsx` (2), `components/shared/feature-warning.tsx`, `components/shared/empty-state.tsx`, `components/shared/stripe-test-mode-banner.tsx` (check each; convert if legacy classes present)
  - `components/dashboard/pay-rent-card.tsx` — partially pre-toned in 1b; FINISH to spec here (it is the tenant hero screen)
- v2 method-selector spec (design-system.md): radio-card pattern; recommended/free option leads; fees stated plainly; the amount is the hero (30-38px tabular); status via semantic pairs.

## 3. In scope
1. Convert every file in §2's inventory to v2 tokens/primitives (both themes), reusing `components/ui/*` primitives where hand-rolled duplicates exist.
2. `pay-rent-card.tsx` to the full v2 money-screen spec: hero amount (30-38px, tabular, `--ink`), method selector as radio-cards with the free/bank option stated plainly and card fees visible, late state via `--crit` pair (keep the existing late/red logic intent), success state via `--pos` pair. NO changes to amounts, fees math, links, or handlers.
3. First-run copy check on touched screens: labels must pass the plain-language rules (log every change).
4. Gamification files: container/background/border token conversion ONLY — no removal, no logic changes (Phase 5 owns removal).
5. Sweep criterion (scoped to match this file list, per L-011): `rg "violet-|purple-|indigo-" app/tenant app/complete-profile components/auth components/onboarding components/gamification components/shared components/ui components/dashboard/pay-rent-card.tsx` must return zero lines; `bg-white` in those roots only with listed justification.

## 4. Out of scope
- Marketing/landing (Phase 6), ops-dashboard (internal), settings components (Phase 4), manager surface (Phase 3), gamification REMOVAL (Phase 5), emails/PDFs.
- No changes to `app/actions/**`, `lib/**`, routing, data loading, or any handler/flow logic. No copy-meaning changes (plain-language rewording only).
- No DB, no deploy, no env, no commit/push.

## 5. Exact files expected to change
Everything enumerated in §2's inventory lines (tenant, first-run, gamification, shared/ui escapees, pay-rent-card), plus component tests whose class assertions change (update assertions only; list each). Nothing else.

## 6. Implementation requirements
- Primitives first: replace hand-rolled buttons/badges/inputs with `components/ui/*` equivalents where props allow.
- Tokens only — no hardcoded hexes, no raw tailwind color names for status (use semantic pairs / `status-colors.ts`).
- Focus rings per Phase 0 pattern; tabular numerals on all amounts/dates.
- `role-selector.tsx` (login): the three role cards follow the radio-card convention — selected card `--accent-weak` bg + `--accent-line` border; readable in dark.
- Mobile: tenant surface is phone-first — verify classes keep the existing responsive behavior intact (no layout changes, only color/token swaps).

## 7. Validation commands
```bash
npm run gate:web
rg "violet-|purple-|indigo-" app/tenant app/complete-profile components/auth components/onboarding components/gamification components/shared components/ui components/dashboard/pay-rent-card.tsx
```
(Second command's output verbatim in the report; empty = pass. Run from apps/web.)

## 8. Acceptance criteria (binary)
- `gate:web` passes; 974-test baseline green (updated assertions listed).
- §7 sweep returns zero lines; `bg-white` exceptions listed + justified.
- `pay-rent-card` matches the v2 money-screen spec (hero amount, radio-card methods, plain fees) with zero handler/amount/logic diffs — the component's props/behavior contract unchanged.
- Gamification: styling-only diffs (no removed elements/logic).
- No diffs outside §5.

## 9. Report format (required status booleans)
`gate_passed`, `sweep_zero_remnants`, `pay_rent_card_v2_spec`, `first_run_path_converted`, `gamification_styling_only`, `primitives_reused`, `no_out_of_scope_diffs`, `tests_updated_and_passing`.
Plus: files changed, copy changes, sweep output verbatim, deviations.
`MANUAL_VERIFICATION_PATH`: 1) smoke tenant → /tenant home, Rent (pay card), Problems, Lease, Messages in light+dark — no purple, hero amount reads instantly, methods read as radio-cards, free option leads; 2) logged-out /login → role cards v2 in both themes; 3) authenticated smoke 3/3; 4) (Claude) fresh-invite first-run walk when convenient: invite a new +alias tenant, accept via email link, complete profile, land on tenant home — every screen v2 and plain-language.
No "Claude prompt" sections.

## 10. Constraints
No DB apply. No deploy. No env changes. No commit/push — leave the tree for Claude. The tenant surface is where trust is won: if any touched label needs explaining, reword it in plain language and log it.
