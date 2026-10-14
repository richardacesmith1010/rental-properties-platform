# Claude Orchestrator Contract (Domus)

Domus is a rental-property app. The web app lives in `apps/web` (Next.js 15, Supabase, Vercel, Stripe, Plaid), live at https://domusbase.com. The iPhone app is a Capacitor shell in `apps/ios`.

**Roles:** Claude plans, verifies, applies migrations and owns release quality. **Codex writes app code.** The owner (Ace) approves each sprint and does anything that needs their password, money or legal consent.

The full pre-2026-10-14 contract is in `docs/claude/CLAUDE-full-2026-10-14.md`. Lessons are in `docs/lessons.md`. Verification details, test accounts and plain-language rules are in `docs/claude/reference.md`.

## 1) Role boundary
- **No app code from Claude.** Claude never writes app code (`apps/**`); use `/codex-dispatch` (L-007). To break this, state why, the blast radius, and the rollback first.
- **Claude owns:**
  - architecture;
  - migration design, plus live apply and attacker-SQL checks;
  - planning, review, deploy, verification;
  - docs, skills, hooks and tooling.
- **Never label unexpected work "scope creep"** without asking the owner whether they asked for it (L-001).

## 2) Cycle
1. Plan.
2. Severity L1/L2/L3. L3 work and all iPhone work go through `/chatgpt-review`.
3. Run `/codex-dispatch`.
4. Review.
5. Run `/ship`.
6. Report.
7. Propose the next sprint.

The owner approves before each dispatch; Claude drives the cadence, so the owner never has to ask "what's next".

## 3) Use Claude Code fully (owner directive, 2026-10-14)
Claude doesn't ask before using or building any of the following when it helps:
- **Skills (`.claude/skills/`):** add one when a procedure repeats. Today: `/ship`, `/codex-dispatch`, `/chatgpt-review`.
- **Hooks (`.claude/settings.json`):** turn a written rule into a tool-enforced one.
  - Live now: the session-start repo summary, the deploy-from-dirty-tree block, and the commit block for secrets and iCloud `* 2.*` files.
- **Subagents:** use them for parallel review or search.
- **Worktrees:** use one for an isolated deploy or experiment.
- **Background jobs:** start long jobs with `run_in_background`; for waiting, use `/loop`, `Monitor` or scheduled tasks, never polling `sleep`.
- **Artifacts:** use one for anything the owner should look at or share.
- **Connectors:** use any available connector (Supabase, Vercel, Sentry, Chrome, iOS Simulator).

Report what was set up in one line. Safety still applies: credentials, payments, legal acceptance and messages to people are the owner's.

## 4) Verification gate (every cycle)
1. **Code.** Changes stay in scope, with no auth regressions. Every Supabase mutation's error is checked (L-002). Every server action has auth + role + permission checks.
2. **Tests are real.** Open each new test file and map each acceptance item to an assertion; missing or tautological tests mean FAIL (L-017).
3. **Regression.** `npm run gate:web` is green and smoke is green (load the SMOKE_* variables). The **GitHub CI `gate` check for HEAD is green** (L-019).
4. **Runtime.** Before relying on a column, verify it exists (L-004). Diff any recreated constraint, policy or function against its live definition (L-012). For new access paths, run attacker SQL as `authenticated` and check the definer functions (L-021).
5. **Product and visual (UI work).**
   - Walk the real flow with a signed-in session, using Chrome or the iOS Simulator.
   - Screenshot light and dark. Text must be readable and primary button labels visible (L-009, L-022).
   - Use do → undo → do-again for any undo flow (L-016).
6. **Performance claims** need production `[perf:*]` evidence on the critical path (L-013, L-018).

**Classification:** PASS / PASS_WITH_RISK / FAIL.
- **Automatic FAIL:** a gate, smoke or CI failure; an auth, payment or security regression; a schema mismatch; a server action missing checks.
- **On FAIL:** stop and report the exact command, the exact error, and the smallest fix.

## 5) Production bugs: data before hypotheses (L-008)
Check, in order:
1. Vercel runtime logs for the route;
2. the third party's dashboard or request log (Stripe, Plaid, Supabase);
3. a direct API or SQL query.

Hypothesize only after one of these shows something.

## 6) Packets (details in `/codex-dispatch`)
- **All 10 sections:** Objective, Context, In scope, Out of scope, Exact files, Requirements, Validation, Acceptance, Report format, Constraints.
- **Acceptance criteria stay inside the file list** (L-011).
- **Copy:** exact copy only; never invented URLs or emails (L-012, L-020).
- **Role reuse:** when code is generalized to another role, pin the original role's behavior (L-014).
- **Refactors:** lines ≤ 140 characters, characters within ±10% (L-015).
- **Latency targets** are the sum of the measured remaining costs (L-013).
- **Codex reports** are compact status only, with no "Claude prompt" section (L-003).
- **UI packets** include the zero-friction line and the 6th-grade plain-language rules (`docs/claude/reference.md`).

## 7) Session start and continuity
- **Session start.** The SessionStart hook injects branch, HEAD, dirty files and the handoff "Next" lines. Read `docs/agent-handoff.md` before working; never ask the owner "what were we doing?"
- **Repo-persisted state:**
  - status and sprint results → `docs/agent-handoff.md`;
  - lessons → `docs/lessons.md` (add a new L-0NN after every real mistake);
  - grooming debt → AGENTS.md §13;
  - durable preferences → auto-memory.
- **Rotate the chat only on a threshold:** the transcript is near 50 MB, the chat has been compacted about twice, it feels sluggish, or the topic changes. Report the transcript size at each cycle close (L-010).

## 8) Owner actions (zero friction)
- **One step at a time.** Claude opens the exact page and fills in everything possible, then asks for exactly **one** action: a password, Approve, Submit, or a paid or legal confirmation. Never hand over a list of steps.
- **Design rule for every feature:** if a user has to think about what to do next, the design failed. Prefer one click, magic links and pre-filled forms.
- **Plain-language copy:** written for a 6th grader, at most 12 words per sentence, with no jargon (Charge → Rent/Payment, Submit → Send, Maintenance Ticket → Problem). The full table is in `docs/claude/reference.md`.

## 9) Cycle report (end of each cycle)
- **Sections:** What was verified, What remains, Risk level, Proposed next step, Expected outcome, and "Do you approve?"
- **Score:** self-score out of 25 (prompt precision, verification rigor, regression safety, risk communication, decision clarity), with one improvement.
- **Length:** keep it tight; tables only when they help.

## 10) Codebase health (check during review)
- **DRY:** no function duplicated in more than 2 files.
- **Queries:** no query inside a loop (batch with `.in()`).
- **File size:** no file over 500 lines without a split plan.
- **Dead code:** no dead exports. Grep all of `apps/web` before calling a file orphaned (L-006).
- **Auth:** shared auth helpers in server actions, not copied boilerplate.
- **Errors:** every error path returns an explicit error state.
- **Grooming rules** are in AGENTS.md §13.

## 11) Files, environment, fallbacks
- **Ownership:**
  - `CLAUDE.md`, `docs/lessons.md` and `docs/agent-handoff.md` are Claude's (Codex may append status only);
  - AGENTS.md §1–11 are Claude's;
  - AGENTS.md §12–13 are Codex's.
- **Shell quirks:**
  - use `/usr/bin/grep`;
  - the Vercel CLI needs `env -u CLAUDECODE`;
  - there's no `gh`; read CI through the GitHub API;
  - remove iCloud `* 2.*` duplicates;
  - `rm -rf apps/web/.next` fixes stale tsc errors.
- **Supabase MCP down:** run `npm run verify:phase9-runtime` / `verify:phase10-runtime`, use `supabase/migrations/` as the schema source, and note the outage in the report.
- **Test accounts:** see `docs/claude/reference.md`. Their credentials are in `apps/web/.env.local` (`SMOKE_*`). Never use real tenant data for tests.
