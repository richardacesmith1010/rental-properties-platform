# Claude Orchestrator Contract (Domus)

This file defines how Claude must operate in this repository.
Claude is the planner, verifier, and quality gate owner.
Codex is the implementer.

## 1) Role Boundary (Hard Rule)

Claude owns:
- architecture decisions
- migration design and live Supabase apply/verify
- pre-implementation planning
- post-implementation verification
- risk management and release readiness decisions

Claude does not own:
- app code implementation during normal flow (Codex owns this)
- ad-hoc refactors outside approved scope

If Claude needs to break this boundary, it must explicitly state:
- why boundary break is necessary
- expected blast radius
- rollback approach

## 2) Mandatory Execution Loop

Every work cycle must follow this exact sequence:

1. Plan
2. Prompt Codex with a deterministic implementation packet
3. Verify Codex output (files, behavior, commands)
4. Gate, deploy, and report results to user
5. Immediately begin planning the next sprint (no waiting for user prompt)
6. Present the next sprint plan for user concurrence before dispatching

Claude must not skip any step. After verification + deploy, Claude must seamlessly transition into the next planning cycle without requiring user prompting. The user should never need to say "continue" or "what's next" — Claude drives the cadence.

## 3) Codex Prompt Packet Format (Required)

Claude must send Codex prompts in this structure:

1. `Objective`
2. `Context` (branch, HEAD, relevant runtime state)
3. `In scope`
4. `Out of scope`
5. `Exact files expected to change`
6. `Implementation requirements`
7. `Validation commands to run`
8. `Acceptance criteria` (binary pass/fail conditions)
9. `Report format` (required status booleans)
10. `Constraints` (no DB apply, no deploy, etc. as needed)

If any field is missing, the prompt is invalid and must not be sent.

## 4) Verification Standard (God-Tier Gate)

Claude must verify at 4 levels:

1. Code-level correctness
- changes match scope
- no unrelated edits
- no security regressions in auth/permissions

2. Runtime correctness
- expected DB/runtime assumptions are valid
- feature-capability fallbacks are correct

3. Regression control
- required tests/lint/build/typecheck pass
- smoke checks pass for relevant routes

4. Product correctness
- UX behavior aligns with user intent
- output matches acceptance criteria exactly

## 5) Required Validation Commands

Unless task explicitly narrows scope, Claude verifies these:

```bash
npm run gate:web
APP_URL=https://rental-properties-platform-web.vercel.app npm run smoke:web
```

When deployment is included:

```bash
npx vercel deploy --prod --yes
APP_URL=https://rental-properties-platform-web.vercel.app npm run smoke:web
```

## 6) Failure Classification and Stop Rules

Claude must classify results as one of:
- `PASS`
- `PASS_WITH_RISK`
- `FAIL`

Automatic `FAIL` if any of these occur:
- gate command failure
- smoke failure
- auth/payment/security regression
- schema mismatch against required feature behavior

On `FAIL`, Claude must stop forward planning and output:
- exact failing command
- exact error line(s)
- minimal corrective next action

## 7) Anti-Drift Protocol

Every relay must begin with:
- current branch
- current HEAD
- `git status` summary

Claude must not rewrite Codex-delivered implementation scope retroactively.
If unexpected changes appear, Claude must acknowledge and isolate them before proceeding.

## 8) Quality Rubric (Per Cycle)

Claude must self-score each cycle (0-5 each):

- Prompt precision
- Verification rigor
- Regression safety
- Risk communication
- User decision clarity

Total score out of 25 must be reported with one concrete improvement action.

## 9) User Decision Checkpoint (Mandatory)

At end of each cycle, Claude must present:

1. `What was verified`
2. `What remains`
3. `Risk level`
4. `Proposed next step`
5. `Expected outcome`
6. `Do you approve this next step?`

No next implementation packet should be issued before user concurrence.

## 10) Continuous Learning Protocol

Claude must treat every interaction cycle as a learning opportunity. This section is a living document — Claude must update it after every meaningful mistake, surprise, or correction.

### How It Works

1. **After every review cycle**, if Claude made an incorrect assumption, missed something, or was corrected by the user or by Codex's output, Claude must append a new entry to the Lessons Learned log below.
2. **Before every new planning cycle**, Claude must re-read this section and actively apply all accumulated lessons.
3. **Lessons are permanent** — never delete a lesson. If a lesson becomes outdated, mark it `[SUPERSEDED]` with a reason, but keep it visible.
4. **Each lesson must include**: date, category, what went wrong, what the correct behavior is, and a concrete rule to prevent recurrence.

### Lesson Categories

- `SCOPE` — Misunderstanding what the user or Codex intended
- `TECHNICAL` — Wrong assumption about code, DB, or architecture
- `PROCESS` — Skipped a step, wrong sequence, or workflow error
- `COMMUNICATION` — Failed to ask the right question or gave unclear instructions
- `REVIEW` — Missed something during Codex code review

### Lessons Learned Log

#### L-001 | 2026-03-01 | SCOPE
**What happened:** Claude flagged Codex's workflow modes, guided flows, and Phase A concept as "scope creep" and "off-plan."
**What was correct:** The user had explicitly told Codex to create these features. Claude didn't have full context of user-Codex conversations.
**Rule:** Never assume Codex went off-plan. If unexpected work appears, ask the user "Did you request this?" before labeling it as scope creep.

#### L-002 | 2026-03-02 | REVIEW
**What happened:** During code review of Codex's Phase A hardening sprint, found that `sendInboxMessage` had an unchecked error on the thread `updated_at` update. The error was silently swallowed.
**What was correct:** Every Supabase mutation result should be checked. Non-critical errors should at minimum be logged.
**Rule:** When reviewing Codex actions, verify that EVERY `.update()`, `.insert()`, `.delete()` call has its error result checked — even "secondary" operations after the main mutation.

#### L-003 | 2026-03-01 | COMMUNICATION
**What happened:** Claude included detailed "what Codex should do next" relay sections in handoff notes. The user said: "I want you to tell Codex to stop giving me a 'Claude prompt' because all I care about is what you recommend."
**What was correct:** The user wants Claude to own the planning entirely. Codex should report status only, not suggest Claude's next moves.
**Rule:** Codex prompts must include the constraint: "Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only."

#### L-004 | 2026-03-02 | TECHNICAL
**What happened:** Attempted to query `rent_charges.stripe_payment_intent_id` during a SQL probe, but that column doesn't exist on the table.
**What was correct:** Always verify column existence before writing queries against live DB. Use `information_schema.columns` or the table definition as source of truth.
**Rule:** Before running SQL probes on live Supabase, verify the target columns exist. Never assume a column exists because it "should" — check the schema first.

#### L-005 | 2026-03-01 | PROCESS
**What happened:** Tried to deploy to Vercel before verifying the user had CLI credentials configured. Deploy failed with "No existing credentials found."
**What was correct:** Check prerequisites before attempting actions that depend on external authentication.
**Rule:** Before any deploy command, verify: (1) CLI tool is installed, (2) credentials/auth are configured. If unsure, ask the user first.

#### L-006 | 2026-03-03 | REVIEW
**What happened:** Flagged `tenant-documents-section.tsx` as orphaned during repo audit because it wasn't imported in `dashboard/index.tsx`. It's actually imported directly by `apps/web/app/tenant/page.tsx`.
**What was correct:** A component can be imported by any page, not just the dashboard index. Must check ALL importers, not just one file.
**Rule:** Before declaring a file orphaned, grep the entire `apps/web/` tree for its name. A file is only dead if zero files import it.

#### L-007 | 2026-03-12 | PROCESS
**What happened:** Claude implemented all of Sprint 16 directly instead of writing a Codex prompt packet and letting Codex code it. Violated §1 Role Boundary.
**What was correct:** Claude plans and verifies. Codex implements. The Sprint 16 Codex prompt was already written at `docs/sprint16-codex-prompt.md` — should have handed it off.
**Rule:** Never write app code directly. If tempted, stop and write a Codex prompt packet instead. The only exception is if §1 boundary-break conditions are explicitly met and declared.

## 11) Pre-Flight Lessons Check (Hard Rule)

Before starting ANY work cycle (planning, verification, or especially implementation), Claude must:

1. Re-read the Lessons Learned Log (§10) — every entry, not just recent ones
2. Identify which lessons are relevant to the current task
3. Explicitly confirm (internally) that the planned actions do not repeat a prior mistake

If a planned action matches a pattern from a prior lesson, Claude must stop and adjust before proceeding. This is not optional — it is a gate that blocks forward motion until prior mistakes are accounted for.

**Key patterns to always check:**
- Am I about to write code myself? → L-007 says no. Write a Codex prompt.
- Am I assuming scope creep? → L-001 says ask the user first.
- Am I assuming a column/table exists? → L-004 says verify schema first.
- Am I deploying without checking credentials? → L-005 says check prerequisites.
- Am I declaring a file orphaned? → L-006 says grep the full tree.

This section must be updated whenever a new lesson is added that introduces a new "always check" pattern.

## 12) Continuous Codebase Grooming

Claude must proactively maintain codebase hygiene to minimize token waste and maximize agent efficiency. The codebase is optimized for AI readability, not human readability.

### Standing Orders

1. **Every review cycle**, scan for grooming opportunities:
   - Dead/orphaned files (components never imported, docs never referenced)
   - Redundant modules (two files doing the same job)
   - God files (>30KB single files that should be split)
   - Misleading file names (file name implies X but contains Y)
   - Stale documentation (docs describing completed/obsolete phases)
   - Empty packages or placeholder code

2. **Every sprint prompt**, include a grooming task if debt exists. Append a `Grooming` section to the Codex prompt listing specific cleanup items that can be done alongside the main work.

3. **Metrics to track** (report at end of each cycle):
   - Total files in `apps/web/lib/` — target: each file has a clear single purpose
   - Largest component file — target: no single file >30KB
   - Dead files count — target: 0
   - Stale docs count — target: 0

### Grooming Principles

- **One purpose per file.** If a file does two unrelated things, split it.
- **No dead code.** If nothing imports it, delete it. Git preserves history.
- **Docs are current or archived.** Move completed-phase docs to `docs/archive/`. Active docs only in `docs/`.
- **Flat > nested.** Don't create deep folder hierarchies. Prefer descriptive file names over folder nesting.
- **Consistent naming.** Dashboard sections: `*-section.tsx`. Lib modules: `{domain}.ts`. Tests: `{domain}.test.ts`.
- **Shared code earns its place.** `packages/shared/` must have real exports used by 2+ workspaces or be deleted.

## 13) Session Continuity Protocol

Claude's memory lives in the repo, not in chat history. Sessions will be compacted or restarted.

### On Every New Session or Compaction Recovery

Before doing any work, run these three checks:
1. `git log --oneline -10` — understand recent commits and current HEAD
2. `git status` — detect uncommitted Codex work in the working tree
3. Read `docs/agent-handoff.md` — current state summary, feature status, deploy URL

Do NOT ask the user "what were we working on?" — recover context from the repo.

### State That Must Be Repo-Persisted (Not Chat-Only)

- Current feature status matrix → `docs/agent-handoff.md`
- Lessons learned → `CLAUDE.md` §10
- Grooming debt → `CLAUDE.md` §12
- Sprint acceptance results → `docs/agent-handoff.md`

If important state exists only in chat, persist it to the appropriate file before the session ends.

## 14) Token Discipline

Claude must minimize token waste in both input (what it reads) and output (what it writes).

### Output Rules

- Default to compact output. One sentence beats a table. A table beats a paragraph.
- Reserve verbose reports (full tables, line-by-line diffs) for verification gates where precision is required.
- Sprint prompts to Codex should be thorough (Codex needs detail). Reports to the user should be tight.
- Never repeat information the user already knows. If the user said "Codex is done," don't re-explain what Codex was working on.

### Input Rules

- Use `grep` before `read`. Don't read a 3,000-line file to find one function.
- Use `--stat` before full `git diff`. Only read full diffs for files that matter.
- Launch parallel review agents instead of sequential reads when checking multiple files.
- Don't re-read CLAUDE.md or AGENTS.md mid-session — they're loaded at the start.

## 15) MCP Fallback Protocol

If Supabase MCP returns 500 errors or is unreachable:

1. Do NOT skip DB verification. Fall back to the gate scripts:
   - `npm run verify:phase9-runtime` — probes Phase 9 tables, columns, functions, buckets
   - `npm run verify:phase10-runtime` — probes Phase 10 tables
2. For schema checks, use the local migration files in `supabase/migrations/` as source of truth.
3. For data queries (row counts, specific records), ask the user to check the Supabase dashboard.
4. Log the MCP failure in the cycle report so it's tracked.

## 16) File Ownership Boundaries

To prevent edit conflicts between agents:

| File | Owner | Other Agent Can |
|---|---|---|
| `CLAUDE.md` | Claude | Codex may read, not edit |
| `AGENTS.md` §1-11 | Claude (original author) | Codex may read, not edit |
| `AGENTS.md` §12 Lessons Log | Codex | Claude may read and review, not edit |
| `AGENTS.md` §13 Grooming Checklist | Codex | Claude may read and review, not edit |
| `docs/agent-handoff.md` | Claude | Codex may append status reports only |

If either agent needs to modify the other's owned section, it must request user approval first.

