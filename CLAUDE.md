# Claude Orchestrator Contract (Domus)

Domus is a rental-property app. The web app lives in `apps/web` (Next.js 15, Supabase, Vercel, Stripe, Plaid), live at https://domusbase.com. The iPhone app is a Capacitor shell in `apps/ios`.

**Roles:** Claude plans, verifies, applies migrations and owns release quality. **Codex writes app code.** The owner (Ace) does anything that needs their password, money or legal consent; everything else runs under Claude's standing authority (§2a).

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

Claude drives the cadence, so the owner never has to ask "what's next".

## 2a) Standing authority (owner directive, 2026-10-16)
- **Do everything that does not need the owner.** Plan and prioritize the whole backlog (scorecard, handoff, follow-ups), then
  run every cycle end to end without asking: plan → severity → ChatGPT review (L3/iPhone) → Codex dispatch → review → gate →
  migrations (after ChatGPT APPROVE/AWC, rolled-back dry run, rollback script, attacker SQL) → deploy → smoke/CI → walk →
  rescore → next sprint. Goal: when the owner returns, only owner-only steps remain, each prepared to one click.
- **Stop and ask only for:** passwords / 2-step codes / the owner's real accounts; real money or paid plans; legal
  acceptance; turning on notifications to real people; deleting real user data; a FAIL not fixed in 2 attempts; a second
  ChatGPT REJECT on the same packet. Anything else: decide, record the decision in the handoff, keep going.
- **Walks without passwords:** sign test accounts in with server-generated magic links or scripted sign-in from
  `apps/web/.env.local` (never type passwords into a page; never use the owner's real account).
- **Report** each shipped sprint as a short handoff entry; no "Do you approve?" questions.

## 3) Use Claude Code fully (owner directive, 2026-10-14)
Claude doesn't ask before using or building any of the following when it helps:
- **Skills (`.claude/skills/`):** add one when a procedure repeats. Today: `/ship`, `/codex-dispatch`, `/chatgpt-review`.
- **Hooks (`.claude/settings.json`):** turn a written rule into a tool-enforced one.
  - Live now: the session-start repo summary, the deploy-from-dirty-tree block, the commit block for secrets and iCloud `* 2.*` files, and the model/effort line check on every reply (§3a).
- **Subagents:** use them for parallel review or search.
- **Worktrees:** use one for an isolated deploy or experiment.
- **Background jobs:** start long jobs with `run_in_background`; for waiting, use `/loop`, `Monitor` or scheduled tasks, never polling `sleep`.
- **Artifacts:** use one for anything the owner should look at or share.
- **Connectors:** use any available connector (Supabase, Vercel, Sentry, Chrome, iOS Simulator).

Report what was set up in one line. Safety still applies: credentials, payments, legal acceptance and messages to people are the owner's.

## 3a) Model and effort: always say it (owner directive, 2026-10-24)
The owner never sends a message without knowing the right model and effort. The app won't let a session change its own
model or effort, so Claude says what to set. Claude sets Codex, ChatGPT and subagents itself.
- **Every reply ends with one line:** `**Set before your next message:** <model> · <effort> — <the next work>.`
  - Pick by the hardest step of the next run. Say "keep" when nothing changes and "lower" when work gets easier.
  - Add `Codex: <model> · <effort>` and `ChatGPT: <model> · <thinking>` when the next run uses them.
  - The Stop hook `.claude/hooks/require-model-line.py` sends back any reply without the line.
- **Record what ran:** each packet header and handoff entry names the Codex model and effort (with a one-line reason)
  and the ChatGPT model and thinking level actually used.

| Next run | Claude (owner sets) | Codex (Claude sets) | ChatGPT (Claude sets) |
| --- | --- | --- | --- |
| Research, legal/compliance, naming, risk review, architecture, migration design | Opus 5.5 · Max | — | — |
| L3 (money, auth, schema, prod config, data): packet, review rounds, build review | Opus 5.5 · Max | `gpt-6.1-sol` · high | GPT-6 · top thinking |
| iPhone app, any size (owner exception, 2026-10-09) | Fable 5.1 · High | `gpt-6-astra` · high | GPT-6 · top thinking |
| L2 feature or logic | Opus 5.5 · High | `gpt-6.1-sol` · medium | — |
| L1 copy or styling; ship, deploy, smoke, docs | Opus 5.5 · Medium | `gpt-6-luna` · low | — |
| Status and quick questions | Opus 5.5 · Low | — | — |
| The same FAIL, second try | Opus 5.5 · Max | `gpt-6-astra` · xhigh | GPT-6 · top thinking |

- **Fable 5.1** is Anthropic's strongest model, at 2.5× Opus 5.5's price and with slower turns. Outside iPhone work, use
  it only when Opus 5.5 · Max fails the same problem twice. If Fable isn't in the menu, use Opus 5.5 · Max.
- **ChatGPT:** set the picker before pasting. If a choice says "Usage limit reached", use the highest open one and log
  it. Put the picker back afterward, because it is shared with the owner's other chats.
- **Subagents:** research, risk personas, naming and legal checks run at effort max; code search uses the Explore agent.
- **Menus change.** The monthly rules watch re-reads the Claude, Codex (`~/.codex/models_cache.json`) and ChatGPT
  model lists and updates this table (L-038).

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

## 4b) Risk discovery: "is it allowed?" (owner directive, 2026-10-24)
Correctness checks don't catch outside rules (L-037). Every cycle also asks whether the behavior is allowed.
- **External rules (packet §11).** Any packet touching money, contracts, personal data, housing, identity, messaging or
  the brand names the laws, card-network rules, platform rules (Apple, Plaid, Stripe), tax rules and vendor terms that
  govern it, for every state with a user's home, with primary sources. They become acceptance tests.
- **Research is Claude's; acceptance is the owner's.** Answer legal and compliance questions with primary sources
  instead of parking them as "ask a lawyer"; only accepting terms, signing and filing stay with the owner.
- **Red-team pre-mortem (`/risk-review`)** for every new feature area and before every stage gate.
- **Park the decision, not the risk.** When a risk is found, switch the product to the safe default that day (flag off,
  conservative values); the owner list shows the interim protection.
- **Rules map** `docs/compliance/rules-map.md` and **stage gates** `docs/compliance/stage-gates.md` stay current; a
  rule's "verified" date older than 6 months counts as unknown.
- **Claims audit:** every promise in policies, pages and store listings is checked against fact on each infra or vendor
  change and quarterly.
- **Monthly rules watch:** a scheduled research run (state legislatures, card networks, Apple, IRS, vendor terms)
  writes changes to the handoff.
- **Effort:** research, design, risk and money/legal work run at Max (§3a).

## 5) Production bugs: data before hypotheses (L-008)
Check, in order:
1. Vercel runtime logs for the route;
2. the third party's dashboard or request log (Stripe, Plaid, Supabase);
3. a direct API or SQL query.

Hypothesize only after one of these shows something.

## 6) Packets (details in `/codex-dispatch`)
- **All 10 sections:** Objective, Context, In scope, Out of scope, Exact files, Requirements, Validation, Acceptance, Report format, Constraints — plus **§11 External rules** when §4b applies.
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
  - grooming debt → `docs/grooming.md`;
  - durable preferences → auto-memory.
- **Rotate the chat only on a threshold:** the transcript is near 50 MB, the chat has been compacted about twice, it feels sluggish, or the topic changes. Report the transcript size at each cycle close (L-010).

## 8) Owner actions (zero friction)
- **One step at a time.** Claude opens the exact page and fills in everything possible, then asks for exactly **one** action: a password, Approve, Submit, or a paid or legal confirmation. Never hand over a list of steps.
- **Design rule for every feature:** if a user has to think about what to do next, the design failed. Prefer one click, magic links and pre-filled forms.
- **Plain-language copy:** written for a 6th grader, at most 12 words per sentence, with no jargon (Charge → Rent/Payment, Submit → Send, Maintenance Ticket → Repair). The full table is in `docs/claude/reference.md`.

## 9) Cycle report (end of each cycle)
- **Sections:** What was verified, What remains, Risk level, Next step (already started unless it needs the owner), Expected outcome.
- **Score:** self-score out of 25 (prompt precision, verification rigor, regression safety, risk communication, decision clarity), with one improvement.
- **Length:** keep it tight; tables only when they help.

## 10) Codebase health (check during review)
- **DRY:** no function duplicated in more than 2 files.
- **Queries:** no query inside a loop (batch with `.in()`).
- **File size:** no file over 500 lines without a split plan.
- **Dead code:** no dead exports. Grep all of `apps/web` before calling a file orphaned (L-006).
- **Auth:** shared auth helpers in server actions, not copied boilerplate.
- **Errors:** every error path returns an explicit error state.
- **Grooming rules** are in `docs/grooming.md`.

## 11) Files, environment, fallbacks
- **Ownership:**
  - `CLAUDE.md`, `docs/lessons.md` and `docs/agent-handoff.md` are Claude's (Codex may append status only);
  - `AGENTS.md` is Claude's;
  - `docs/codex-lessons.md` and `docs/grooming.md` are Codex's.
- **Shell quirks:**
  - use `/usr/bin/grep`;
  - the Vercel CLI needs `env -u CLAUDECODE`;
  - there's no `gh`; read CI through the GitHub API;
  - remove iCloud `* 2.*` duplicates;
  - `rm -rf apps/web/.next` fixes stale tsc errors.
- **Supabase MCP down:** run `npm run verify:phase9-runtime` / `verify:phase10-runtime`, use `supabase/migrations/` as the schema source, and note the outage in the report.
- **Test accounts:** see `docs/claude/reference.md`. Their credentials are in `apps/web/.env.local` (`SMOKE_*`). Never use real tenant data for tests.
