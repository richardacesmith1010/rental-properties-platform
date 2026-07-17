# Sprint 130 — Authenticated smoke checks + dedicated role test accounts

**Severity: L2** (test infrastructure + a data-seeding script; no app code, no money/auth/schema changes). Dispatch AFTER Sprint 129 is verified and committed.

## 1. Objective
Close the L-009 gap: today `npm run smoke:web` only checks HTTP status codes, so a deploy can pass smoke while every logged-in page crashes at render (this happened in Sprint 123). Add an authenticated render pass for all three roles, backed by dedicated, isolated test accounts — so no future verification ever needs the user's real login.

## 2. Context
- Branch `main`, HEAD `7917e88` (sprint 129 deployed + verified live).
- `scripts/smoke-web.sh` currently: unauthenticated curl checks (landing, login brand, redirect guards, asset/cron/gamification 401s, `/api/health`). No session, no render assertion.
- Playwright already exists: `apps/web/playwright.config.ts`, 55 tests in `apps/web/tests/e2e/`. The gate optionally runs the full suite; smoke does not run Playwright at all.
- Existing test account: tenant `richard.ace.smith+alt@gmail.com` (real lease on "1st Home" — production data; do NOT repoint it). Owner/manager test accounts do not exist (§19 of CLAUDE.md requires them).
- L-009 (CLAUDE.md §10): render-time crashes ("Functions cannot be passed directly to Client Components") pass status-code smoke; only a real-session render check catches them.

## 3. In scope
1. `scripts/seed-smoke-accounts.mjs` — idempotent seeding script (Claude runs it; Codex only writes it).
2. `apps/web/tests/e2e/smoke-auth.spec.ts` — fast authenticated render spec for owner/manager/tenant.
3. Extend `scripts/smoke-web.sh` to run that spec when smoke credentials are present in env.
4. `package.json` script wiring if needed.

## 4. Out of scope
- NO changes to any `apps/web/app` or `apps/web/components` or `apps/web/lib` production code. This sprint must be a zero-risk deploy (nothing user-facing changes).
- NO running of the seed script by Codex (it targets production Supabase — Claude executes it).
- NO changes to existing e2e specs, the gate script's structure, or CI config.
- NO real Stripe onboarding for test accounts (unconnected state is expected and asserted as rendering, not as connected).

## 5. Exact files expected to change
- `scripts/seed-smoke-accounts.mjs` (new)
- `apps/web/tests/e2e/smoke-auth.spec.ts` (new)
- `scripts/smoke-web.sh` (append authenticated section)
- `package.json` (root) — only if a new npm script is genuinely needed
- `docs/smoke-accounts.md` (new, short: what the accounts are, how to rotate creds)

## 6. Implementation requirements

### 6.1 Seed script (`scripts/seed-smoke-accounts.mjs`)
- Inputs via env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMOKE_OWNER_EMAIL`, `SMOKE_OWNER_PASSWORD`, `SMOKE_MANAGER_EMAIL`, `SMOKE_MANAGER_PASSWORD`, `SMOKE_TENANT_EMAIL`, `SMOKE_TENANT_PASSWORD`. Fail fast with a plain message if any is missing. Never print passwords.
- **Idempotent**: safe to run repeatedly; looks up by email first; creates only what's missing; never deletes or modifies rows it didn't create.
- Creates via Supabase Admin API (`auth.admin.createUser`, `email_confirm: true` — NO invite/confirmation emails):
  - Owner: role `owner`, profile with `full_name "Smoke Owner"`, `onboarding_completed_at` set; its own individual ownership account.
  - Manager: role `manager`, profile complete.
  - Tenant: role `tenant`, profile complete. (Fresh smoke tenant — the +alt tenant stays on real data, untouched.)
- Seeds isolated data owned ONLY by the smoke owner: property **"Smoke Test Property"** (1 unit "Unit S"), manager assigned (`property_managers` active), active lease for the smoke tenant at **$1/mo rent** (below `MIN_ONLINE_PAYMENT_CENTS`, so it can never be paid online by accident), `due_day_of_month` 1.
- Every insert's error is checked; on any failure print which step failed and exit non-zero. Output a compact summary of what was created vs already existed.
- RLS/visibility: all data hangs off the smoke accounts; real users must never see it (standard ownership scoping — no special flags needed, but do NOT attach anything to real users' accounts).

### 6.2 Authenticated render spec (`smoke-auth.spec.ts`)
- Reads `APP_URL` + the six `SMOKE_*` cred env vars; if any missing → `test.skip()` with a clear reason (spec must be skip-clean, never red, when creds absent).
- For EACH role (owner, manager, tenant), one test that:
  1. Logs in through the real `/login` UI (role tile → email → password → submit) — this also smoke-tests the auth flow itself.
  2. Waits for the role home (`/owner`, `/manager`, `/tenant`) to render; asserts a role-specific, always-present element (e.g. the greeting/nav shell), NOT data-dependent text.
  3. Collects `page.on("console")` errors and `page.on("pageerror")` throughout; asserts ZERO after render (allowlist only for known third-party noise if genuinely unavoidable — document each allowlist entry with a comment).
  4. Asserts the page body does NOT contain error-boundary copy ("Application error", "something went wrong").
- Budget: the three tests together must run in under ~90s. No retries masking flake — `retries: 0` for this spec.
- Must run against production URLs (`APP_URL=https://domusbase.com`) and localhost identically.

### 6.3 Smoke wiring (`smoke-web.sh`)
- After the existing curl checks: if all six `SMOKE_*` vars are set → run `npx playwright test tests/e2e/smoke-auth.spec.ts --reporter=line` from `apps/web` with `APP_URL` exported; propagate its exit code. Else print `[smoke] SMOKE_* creds not set; skipping authenticated render checks` and pass.
- Do not touch the existing checks.

## 7. Validation commands
```bash
npm run gate:web
bash scripts/smoke-web.sh   # against local dev, creds unset → must pass with skip message
```
Codex cannot run the seeded/authenticated path (no prod creds) — write it verifiably and report that limitation plainly.

## 8. Acceptance criteria (binary)
- [ ] `gate:web` passes.
- [ ] Seed script: dry-run-safe structure, idempotent lookups by email, every DB call error-checked, no email sends, no writes to any existing real rows, exits non-zero on partial failure.
- [ ] Spec: skips cleanly without creds; with creds performs 3 UI logins + render + zero-console-error assertions; no data-dependent selectors; `retries: 0`.
- [ ] `smoke-web.sh` without creds behaves byte-for-byte like today plus one skip line.
- [ ] No production app code changed (zero diffs under `apps/web/app`, `apps/web/components`, `apps/web/lib`).
- [ ] `docs/smoke-accounts.md` explains accounts, env vars, rotation in ≤ 40 lines.

## 9. Report format (required booleans)
`gate_passed`, `seed_script_idempotent`, `spec_skips_without_creds`, `spec_asserts_zero_console_errors`, `smoke_backward_compatible`, `no_app_code_changed`.
Files changed + deviations.
`MANUAL_VERIFICATION_PATH`: (for Claude) run seed script against prod with generated creds → set `SMOKE_*` in local env → `APP_URL=https://domusbase.com bash scripts/smoke-web.sh` → expect existing checks + 3 authenticated render passes green; then re-run seed script → expect "already existed" everywhere (idempotency proof).
No "Claude prompt" sections.

## 10. Constraints
- No DB apply, no deploy, no env/secret changes, no running the seed script (Claude does both against prod).
- Production Supabase is live with real money data — the seed script must be surgically additive.
- Plain language in all new user-visible strings (there should be none — this is infra).
