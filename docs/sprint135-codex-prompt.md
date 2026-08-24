# Sprint 135 — First-touch: v2 email shell, v2 login hero, real invite names

**Severity: L2** (email/visual rebrand + one metadata-read bugfix; no money/auth/flow logic). Source: `docs/design-system.md` v2. Strategy context: the next tenant's first three touches are (1) the invite email, (2) the login page, (3) onboarding — all three go v2 in this sprint.

## 1. Objective
1. Every outbound email wears the v2 brand (shared shell rebrand).
2. The login page hero panel matches v2 (both themes).
3. The onboarding context card shows the real inviter and property names instead of "your landlord / Your rental home".

## 2. Context
- Branch `main`, HEAD `4be0c0a`. Phases 0/1/1b/2 live.
- **Emails:** ALL templates share `buildBrandedEmailShell` in `apps/web/lib/email-templates.ts` (line ~86), plus 8 builders in the same file (notification, property/owner message, tenant invite, LLC invite, rent reminder, invoice, manager payment). Current shell: purple gradient header (#7C3AED→#5B21B6), mascot `<img>` (domusbase.com/images/mascot/poses/happy.png), green CTA (#10B981), violet borders (#ddd6fe), violet footer links (#7C3AED), lavender body bg (#f5f3ff).
- **Login hero:** lives directly in `apps/web/app/login/page.tsx` (left panel: "Manage your rentals like a pro.", stat chips, mascot, purple gradient). The right panel's role cards are already v2 (Sprint 134).
- **Invite names bug (verified in the 134 first-run walk):** `inviteTenant` (`apps/web/app/actions/tenant-invitations.ts` ~lines 75-85) stores `propertyName`, `propertyAddress`, `ownerName`, `unitLabel` in the invited user's metadata. `apps/web/app/onboarding/page.tsx` line ~53 renders `inviteContext.ownerName ?? "Your landlord"` — in the live walk, `unitLabel` resolved ("Unit S") but ownerName/propertyName fell back to generics. Diagnose the actual read path (`inviteContext` construction) and fix the mismatch. Do not change what gets stored unless storage is provably the bug; prefer fixing the read.

## 3. In scope
1. **`buildBrandedEmailShell` → v2** (email-safe): body bg `#FBFBF9`; card surface `#FFFFFF` with `#E6E6E0` hairline border, 16px radius; header = clean wordmark row — "Domus" in `#191B1E` 20px/700 with "Rental Property Management" in `#6F757C` 12px — **no gradient, no mascot image**; CTA buttons solid `#1D4ED8`, white label, 999px radius; footer text `#6F757C`, links `#1D4ED8`. Table-based layout and inline styles stay (email-client constraints); light-only (no dark variant — email clients own that). Add one comment: hex values mirror docs/design-system.md v2 light tokens.
2. **Sweep all 8 builders in the same file** for inline legacy hexes (#7C3AED, #5B21B6, #A78BFA, #10B981, #ddd6fe, #f5f3ff, emerald/violet named colors) → v2 equivalents (accent #1D4ED8, pos #15803D only for genuinely positive semantics, warn #B45309, crit #B91C1C). Copy, links, and structure unchanged.
3. **`app/login/page.tsx` hero panel → v2** (both themes, token classes): neutral `--ground`/`--surface` panel (or `--accent-weak` tint) with `--ink` headline; stat chips as v2 tiles (`--surface`, `--line`, tabular numerals); **mascot removed from this hero** — deliberate first-touch exception ahead of Phase 5, login page only, flag it in the report. Keep all copy except plain-language fixes (log each).
4. **Invite-names fix**: real `ownerName`/`propertyName` render on the onboarding context card when metadata has them; graceful fallbacks remain for legacy invites. Add/extend a unit test covering the context extraction (names present → rendered; absent → fallbacks).

## 4. Out of scope
- Marketing/landing components (`components/marketing/*` — Phase 6). Mascot removal anywhere except the login hero (Phase 5). Settings components (Phase 4). Manager surface (Phase 3).
- No changes to invite sending logic, auth flows, routing, or any other action beyond the metadata READ path (and storage only if read-fix is provably impossible).
- No DB, no deploy, no env, no commit/push.

## 5. Exact files expected to change
- `apps/web/lib/email-templates.ts`
- `apps/web/app/login/page.tsx`
- `apps/web/app/onboarding/page.tsx` (and the module that builds `inviteContext` if it lives elsewhere — name it in the report)
- `apps/web/app/actions/tenant-invitations.ts` ONLY if storage is provably the bug (justify)
- Email/template tests: `apps/web/lib/__tests__/message-email.test.ts`, `apps/web/lib/__tests__/invite-email.test.ts`, and any other test asserting old colors (update assertions; list each)
- Onboarding context test (new or extended)

## 6. Implementation requirements
- Email HTML must remain client-safe: tables, inline styles, no CSS vars, no external CSS; images only if already present (the mascot img is removed, not replaced).
- Sweep criterion (scoped to §5, per L-011): `rg "7C3AED|5B21B6|A78BFA|10B981|ddd6fe|f5f3ff" apps/web/lib/email-templates.ts` returns zero lines (report verbatim).
- Login hero: no layout restructure — color/token/typography swaps + mascot block removal only; responsive behavior unchanged.
- Plain language on any touched string (log changes).

## 7. Validation commands
```bash
npm run gate:web
rg "7C3AED|5B21B6|A78BFA|10B981|ddd6fe|f5f3ff" apps/web/lib/email-templates.ts
```

## 8. Acceptance criteria (binary)
- `gate:web` passes; 974-test baseline green (updated assertions listed).
- Email sweep returns zero lines; shell + all 8 builders on v2 hexes; no mascot img in any email.
- Login hero tokenized both themes, mascot gone, role cards untouched.
- Onboarding card renders real names when metadata provides them (unit test proves both branches).
- No diffs outside §5.

## 9. Report format (required status booleans)
`gate_passed`, `email_shell_v2`, `email_builders_swept`, `login_hero_v2_no_mascot`, `invite_names_fixed_with_test`, `no_out_of_scope_diffs`, `tests_updated_and_passing`.
Plus: files changed, the diagnosed root cause of the names bug (exact key/path), copy changes, sweep output verbatim, deviations.
`MANUAL_VERIFICATION_PATH`: (Claude executes) fresh full first-run with a new +smoketenant3 alias: wizard invite → **new-brand email verified in Gmail** → link → complete-profile → onboarding shows "Smoke Owner" + "Smoke Test Property" → /login hero v2 in light+dark → authenticated smoke 3/3.
No "Claude prompt" sections.

## 10. Constraints
No DB apply. No deploy. No env changes. No commit/push — leave the tree for Claude's review, deploy, and walk.
