# Lessons Learned Log

Permanent log of Claude's mistakes and the rule each one created. Read it before planning a sprint (the codex-dispatch skill points here). Never delete a lesson; mark outdated ones [SUPERSEDED] with a reason. Each entry: date, category (SCOPE / TECHNICAL / PROCESS / COMMUNICATION / REVIEW), what went wrong, what was correct, and the rule.

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

#### L-008 | 2026-05-07 | PROCESS
**What happened:** When the user reported "Pay $1.34 does nothing," Claude burned ~30 minutes hypothesizing about a small-amount edge case before checking the actual Stripe error log. The real error message ("No such destination: 'acct_xxx'") was visible the whole time in Vercel runtime logs (via `console.error` at `apps/web/app/actions/charges.ts:198`), in Stripe Workbench request logs (the `request_log_url` field returned in the error body), and via a direct Stripe API query (`curl -u "$SKEY:" /v1/accounts`). Every signal was there from the first minute.
**What was correct:** When a feature fails in production, FIRST read the actual data (production logs, third-party dashboard request logs, direct API queries), THEN form hypotheses. Hypothesis-first wastes minutes-to-hours on theories the data already disproves.
**Rule:** When a user reports a feature broken in production, the FIRST three actions are mandatory and ordered: (1) read Vercel/runtime logs for the affected route via `vercel logs --follow`, (2) read the relevant third-party dashboard's request log if applicable (Stripe Workbench, Plaid Logs, etc.), (3) make a direct API query to confirm or disprove the most likely root cause. Only hypothesize after at least one of these returns useful signal — and the hypothesis must be grounded in something the data showed.

#### L-009 | 2026-05-08 | PROCESS
**What happened:** Sprint 123 (audit hotfix bundle) passed all local checks: Codex's test suite (passed), `gate:web` (passed via tests/lint/typecheck/build), `npm run smoke:web` (passed against the deployed URL). Yet the deploy broke `/tenant` immediately — every request errored with "Functions cannot be passed directly to Client Components." The error was a pre-existing Server→Client function-prop violation that only fires at **runtime page render with a real session**, not during static prerender or unit tests. The smoke script only checks HTTP status codes, not full page render.
**What was correct:** After every deploy that touches dashboard render paths, Claude must do a real-session render check: log in via Chrome MCP (or curl with a session cookie), load the affected pages, and confirm the rendered HTML contains expected content (not an error boundary). HTTP 200 ≠ "the page rendered correctly."
**Rule:** Post-deploy verification of UI sprints MUST include a Chrome MCP page-load with a real authenticated session, and a `read_console_messages` check for thrown errors. The current smoke test (status-code only) is insufficient for catching render-time crashes. Until the smoke test is extended, Claude is responsible for this manual check on every UI deploy. Evidence required for sprint completion: a screenshot of the rendered page plus a clean console.

#### L-010 | 2026-07-12 | PROCESS
**What happened:** Session history for this project grew to 254MB (one session file alone was 167MB). Claude Code loaded it on every prompt and hung with an endless spinner — no error shown. Other projects worked fine. Fixed by archiving `~/.claude/projects/-Users-courtneysmith-Documents-Codex-Rental-Properties/*.jsonl` and starting fresh.
**What was correct:** Chat history is disposable by design (§13) — all real state lives in the repo. Resuming one ever-growing mega-session has no upside and eventually breaks the tool.
**Rule (refined 2026-07-14 with the user):** Rotate chats by *threshold, not per sprint*. The real failure mode is transcript file SIZE (the ~167MB single file that hung the app); a heavy multi-sprint session is normally single-digit MB. Wrap up and start a new chat only when ANY of: (a) the session `.jsonl` approaches **~50MB** — at each cycle close Claude runs `du -sh` on the current session transcript and reports the size; (b) the session has been compacted ~2× (compaction also causes context-forgetting, as happened this session); (c) it feels sluggish; (d) work pivots to a genuinely unrelated topic. Per-sprint rotation is NOT required. Regardless of rotation, always keep `docs/agent-handoff.md` + memory current so any new session recovers cleanly.

#### L-011 | 2026-08-22 | PROCESS
**What happened:** Sprint 133's packet listed ~20 exact files (§5) but its acceptance criterion demanded a zero-remnant grep sweep across ALL of `components/dashboard/` — a superset including explicitly-excluded files (`pay-rent-card.tsx`, tenant money-UI). Codex had to choose; it satisfied the sweep and self-flagged `no_out_of_scope_diffs=false`, touching 45 files.
**What was correct:** A packet's scope list, exclusions, and acceptance criteria must be mutually consistent — an acceptance criterion IS a scope statement. When they conflict, the implementer is forced to improvise.
**Rule:** Before dispatching any packet, cross-check: does every acceptance criterion's blast radius stay inside §5's file list plus §4's exclusions? If a sweep/grep criterion spans a directory, either scope §5 to that directory or scope the sweep to §5's files.

#### L-012 | 2026-10-03 | TECHNICAL
**What happened:** Sprint 141's migration recreated `notifications_type_check` by copying an old migration file's definition. It happened to match live, but later migrations could have added types — copying from a file would then have silently blocked live notification inserts. Separately, Codex invented a contact email (`support@domus.app`) when a packet left it unspecified (Sprint 139).
**What was correct:** Any migration that DROPs and recreates a constraint, policy, or function must be diffed against the LIVE definition (`pg_get_constraintdef` / `pg_get_functiondef`) before apply. Packets that add links/contact info must name exact values.
**Rule:** Before applying a migration that recreates an existing DB object, query its live definition and confirm the new one equals live ± the intended change. In packets, forbid inventing URLs/emails and supply the exact values.

#### L-013 | 2026-10-04 | TECHNICAL
**What happened:** Sprint 151 promised ~0.5–1 s for a section's first open. It shipped at ~2.2 s because the new server action still pays the same ~1 s fixed prefix (session auth, role, profile, ownership, administered IDs) that the full page paid, plus a ~0.7 s maintenance loader. Revisits did become instant.
**What was correct:** The Sprint 148/149 telemetry already showed the fixed prefix cost. A performance target must be the sum of the measured costs that remain on the new path, not a guess about what was removed.
**Rule:** Before stating any latency target in a packet, list the remaining per-request costs from existing `[perf:*]` telemetry and add them up. State the target as that sum, and name which costs the sprint actually removes.

#### L-014 | 2026-10-04 | PROCESS
**What happened:** Sprint 158 extended owner navigation code to managers under a new "targeted tests only" rule. Codex skipped lint (my rule forgot it), merged owner and manager URL-sync logic into one effect, and never wrote the manager section to the URL. My full gate caught the lint error and an owner regression; my live walk caught the URL bug. Three fix runs cost more tokens (~355k total) than the targeted rule saved.
**What was correct:** When a packet generalises shared code to a second role, it must pin the first role's behaviour explicitly (state invariants such as "owner effect and deps unchanged; manager section must round-trip through the URL") and require lint along with targeted tests.
**Rule:** Packets that reuse one role's code for another role must list the invariants to keep for the original role and the state that must survive a refresh (URL/section). Codex's targeted checks always include `npm run lint:web` and typecheck. Prefer one precise run over several cheap fix runs: each Codex run has a large fixed context cost.

#### L-015 | 2026-10-05 | REVIEW
**What happened:** Sprint 166b's acceptance said "every file ≤ 500 lines". gpt-reserve met it by cramming code onto single lines up to 8,460 characters (2,041 lines → ~190), left 2 tests failing, and reported the refactor "not complete". Claude rejected and reverted it; nothing deployed.
**What was correct:** A size target is a proxy for readability; a cheap model will game a proxy. Refactor packets must constrain the code's shape, not just its line count.
**Rule:** Any packet with a file-size target must also require: max line length ≤ 140 characters (or the repo formatter's output), total non-whitespace characters of the touched code within ±10% of before (no compaction, no deletion disguised as refactor), and the full test suite green. Claude checks max line length and character totals on every refactor before accepting it.

#### L-016 | 2026-10-05 | REVIEW
**What happened:** Sprint 167's spec defined Undo as "delete the filed record and the bank item," but the same answer could also create an "Always" rule. Unit tests, ChatGPT's three reviews and Claude's code review all passed it; only the live walk showed the undone mortgage being auto-filed on the next upload.
**What was correct:** An undo must reverse every side effect of the action it undoes, not just the main record.
**Rule:** When a packet adds an action with an Undo (or delete/revert), list every write the forward action makes (records, rules, flags, counters) and require the Undo to reverse each one, with a test per side effect. Live walks of new flows must always include "do it → undo it → do the next natural step again".

#### L-017 | 2026-10-05 | REVIEW
**What happened:** Sprint 169 (gpt-reserve, L2) reported "1280/1280 tests passed" and every acceptance item met, but its route test asserted a literal object equals itself, and most required test cases (late rent, higher-than-usual, reversed payments, route auth, Home card) did not exist. The green gate hid it; Claude caught it only by reading the test files. The code also had real bugs those missing tests would have caught.
**What was correct:** A passing suite proves nothing about cases that were never written. Test acceptance criteria are another proxy a cheap model will game (same family as L-015).
**Rule:** Before accepting any sprint, open each new or changed test file and map every acceptance test case to a real assertion that calls the code under test. Count cases (`grep -c "it("`) against the packet. Missing or tautological tests = FAIL, regardless of the reported counts. For feature sprints with many required tests, prefer gpt-6-sol over gpt-reserve.

#### L-018 | 2026-10-06 | TECHNICAL
**What happened:** Sprint 179 added a module-level in-process cache for `feature.capabilities` (unit-tested with fake timers) and Sprint 180 deferred bundles that turned out not to be on the critical path. Production logs showed the cache never hit (22 queries every request) and the Home time unchanged. Unit tests cannot prove serverless caching or critical-path wins.
**What was correct:** Performance changes must be verified with production `[perf:*]` evidence of the specific step, and the critical path must be identified from per-step timings (with query counts) before choosing what to change.
**Rule:** Before a speed sprint, list the critical-path steps (start/end overlap) and their query counts from production logs; only target steps on that path. Any cache must be proven by a production log showing the hit (e.g. `queries: 0` on the second request), not by unit tests.

#### L-019 | 2026-10-06 | PROCESS
**What happened:** CI on main failed on every push for 26 runs (#275–#300), starting with the Sprint 174 Next 15 upgrade. Claude verified each sprint with the local gate, smoke specs and Sentry, but never checked GitHub Actions. The user found out from failure emails. Root cause: a malformed `NEXT_PUBLIC_SUPABASE_URL` repo secret, which Next 15 started reaching during the prerender attempt of `/`.
**What was correct:** CI is part of the gate. A green local gate does not prove CI is green, because CI has a different env (secrets, Node version, clean install).
**Rule:** At every cycle close, check the latest CI run for the pushed HEAD and report it. Any red CI run blocks the next sprint. CI must not depend on repo secret values to build; it uses fixed placeholders.

#### L-020 | 2026-10-07 | REVIEW
**What happened:** Sprint 193's packet told the tenant card to show the server action's returned `message`. Sprint 192 had hard-coded the card text, so the action's old success string ("Manual payment request sent to your landlord for confirmation.") had never been visible. Once wired through, the live walk showed the stale wording; a 193b hotfix was needed.
**What was correct:** When a UI starts rendering a value it previously ignored (an action's `message`, an API field), every possible value of it becomes user-facing copy.
**Rule:** Before a packet tells UI to display an action/API return value, list every return string on every path of that action and include their exact wording in the packet (rewrite any that break plain-language rules).

#### L-021 | 2026-10-08 | REVIEW
**What happened:** Sprint 205 rev 1 claimed "no RLS rewrite needed" after checking only the policy expressions. Mapping deeper showed (a) any signed-in owner could insert invitations for any home/account, and `handle_new_user()` silently converts pending invitations into owner/manager access at signup (live takeover path, hotfixed as 205a); (b) managers could rewrite home ownership columns; (c) `created_by_profile_id` was an undocumented entitlement in SQL and TS. None was visible from the policy list alone.
**What was correct:** An authorization claim must follow every path to a grant: table GRANTs + RLS for direct PostgREST writes, triggers and SECURITY DEFINER functions that consume rows (e.g. auth signup hooks), and TS helpers.
**Rule:** Before any packet that adds a new kind of access, simulate the attacker in SQL (`set local role authenticated` + JWT claims, rolled back) against every table the feature touches, including direct inserts the app "never does", and grep `pg_proc` for functions that read those tables to grant access (`handle_new_user`, payload RPCs). Any table a definer function trusts must not be user-writable.

#### L-022 | 2026-10-12 | REVIEW
**What happened:** Sprint 218 shipped a Sign in button with no visible label. A Tailwind selector `[&>span:last-child]:hidden`, meant to hide a spinner, also hid the only span (the label) when the button was not loading. Unit tests passed because jsdom ignores CSS, so `getByRole("button", { name: "Sign in" })` still found the text. Smoke passed because sign-in by Enter worked. Only the screenshot walk caught it.
**What was correct:** A text-in-DOM test does not prove the text is visible. Arbitrary-variant selectors that hide children are fragile.
**Rule:** Every UI sprint walk must screenshot each primary button and confirm its label is visible. In review, grep new UI code for `]:hidden`, `]:opacity-0` and `!opacity` on child selectors and reject them unless a test proves the visible state. Also, while Codex works in the tree, deploy only from a clean `git worktree` of HEAD (never the dirty tree).

#### L-023 | 2026-10-15 | TECHNICAL
**What happened:** For months every server query cost ~95–125 ms because Vercel functions ran in sfo1 while Supabase is in us-west-2. Sprints 179–184 and 225 tuned query counts and parallelism around that tax. Moving functions to pdx1 (Sprint 233b, one config line) cut owner Home p75 from 1.65 s to 0.82 s and every single query to ~34 ms. Separately, the 233a packet wrapped steps in nested `measurePerf` timers without checking that the query counter was scope-local; it silently zeroed the outer `home.wallet` count until Claude's review.
**What was correct:** Check the fixed cost per round trip (and where it comes from) before optimizing query structure. Perf instrumentation is code: check how it composes.
**Rule:** Any speed sprint starts by reading one single-query `[perf:*]` step: if one PostgREST call costs > 50 ms, check function region vs database region first. Any packet adding nested timers must state how counts roll up and test it. When a change makes pages faster, expect timing races in browser tests: use accessible locators (`getByRole`) over raw tags so hidden swap copies are not counted.

#### L-024 | 2026-10-16 | VERIFICATION
**What happened:** Walk 236 reported "the undo toast never auto-dismisses" (M6) and Sprint 237b added a forced dismiss. In the 237 re-walk a different toast also stayed up for 45 s; `document.visibilityState` was `hidden` because the driven Chrome window sat behind the Claude app. Sonner (and most timers using visibility) pause while the page is hidden, so "stuck" toasts were an artifact of the walk setup, not (only) a product bug.
**What was correct:** Timing-based UI findings depend on the page being visible and focused.
**Rule:** Before reporting a timing bug (toasts, auto-refresh, animations) from a driven browser, check `document.visibilityState` and `document.hasFocus()` with the javascript tool; only file it if it reproduces with `visible`. Note the state in the finding.

#### L-025 | 2026-10-16 | SECURITY
**What happened:** Supabase's default ACL gave `anon`/`authenticated` every privilege on each new `public` table, and many
RLS write policies were written for "the app's own server action" without asking what a client could do directly through
PostgREST. Result: a tenant could record their own rent as paid, strangers could vote on another LLC's withdrawal, a
co-owner could redirect a partner's payout, a tenant could make themselves an owner (237d–237g). Policies looked fine one by
one; the exposure was grants + loose policies + server actions that use the admin client anyway.
**What was correct:** Grants are the first gate. A table the app only writes with the service role should grant clients
nothing but SELECT; client-written tables should grant only the exact ops (and columns) the code map shows.
**Rule:** Every new table migration revokes client writes (now the default) and lists any client write it needs with the
code site. Any packet that adds a user-client write must name the table, op and columns, and add them to the 237g keep
map (`supabase/migrations/20261023_sprint237g_client_write_grants.sql`) with an attacker test. Money columns written by
clients get a values guard (trigger), not just a column grant.


#### L-026 | 2026-10-16 | PLANNING
**What happened:** Packet 237c-1 told Codex to insert one pending `invitations` row per home ("All my homes"), but the live
table had `UNIQUE (email, role, invited_by)`, so a second home for the same email could never be stored. Two ChatGPT
reviews missed it; Codex caught it on dispatch and stopped, costing a round trip. The old code had hidden the same bug for
months: a failed second insert was only logged, so a pending manager silently got one home.
**What was correct:** Before a packet asks for more rows of an existing shape (per home, per month, per member), read the
table's unique keys, constraints and triggers live (`pg_constraint`, `pg_indexes`) and quote them in the packet's Context.
**Rule:** Packets that add rows to an existing table list its live unique keys. A logged-and-ignored insert error is a
bug; packets that touch such a path make the error explicit.

#### L-027 | 2026-10-16 | TOOLING
**What happened:** Codex hit its usage limit with the message "try again at Oct 17th, 2026 3:48 AM". `run-codex.sh` only
recognized "try again at 3:48 AM", so it treated each failure as a normal miss, retried every 3 minutes and used up all
four attempts in 10 minutes. 238j and 238h "completed" with exit 0 and no report and no file changes; the queue looked
alive while nothing was happening for 4 hours.
**What was correct:** Parse the clock time out of any "try again at …" form and sleep until then.
**Rule:** After every Codex run, check that a report file exists before reading the result; "exit 0" from the runner is not
success. When a reset message appears, re-dispatch only after confirming the runner parsed the time ("waiting until …").

#### L-028 | 2026-10-17 | TESTING
**What happened:** Sprint 238j wrapped each form's action call in a new `try/catch`. Its tests put the `expect`s inside the
mocked action. A failing `expect` throws, the component's `catch` swallowed it and showed friendly copy, and the test only
checked the action was called. Three acceptance tests passed with compression switched off (proven by mutation). The same
`catch` also swallowed Next's `redirect()` error, so a successful onboarding would show an error.
**What was correct:** Capture calls with `vi.fn`, then assert on `action.mock.calls` after `waitFor`. In client `catch`
blocks around server actions, call `unstable_rethrow(error)` from `next/navigation` first.
**Rule:** Packets that add a `catch` around a server action require `unstable_rethrow` first plus a redirect test, and say
"no `expect` inside a mock implementation". Reviews mutate the unit (return the raw input) to prove such tests can fail.

#### L-029 | 2026-10-17 | PLANNING
**What happened:** Sprint 237c-1's packet required writing pending invitation rows before the Auth invite call, on the
belief that the `handle_new_user` trigger converts invitations "at sign-up". The trigger runs AFTER INSERT on
`auth.users`, and `inviteUserByEmail` / `generateLink({type:"invite"})` insert that row at invite time. So access was
granted and rows marked accepted the moment the owner pressed Send: Resend/Revoke vanished, failed emails could never be
re-sent, and re-invites after a revoke silently granted nothing. Three Codex rounds built faithfully on the wrong premise;
a 43-agent review found it only by reading the live trigger.
**What was correct:** Before mandating an order of writes around Auth, read the live trigger definition and the Auth
API's side effects (when is the `auth.users` row created?) and quote both in the packet's Context.
**Rule:** Packets that touch sign-up/invite flows quote the live trigger (`pg_get_triggerdef`, function body) and state,
per Auth call, whether it inserts `auth.users`. Reviews of such sprints include a lens that traces live trigger effects.

#### L-030 | 2026-10-18 | TESTING
**What happened:** In sprints 237c-5a and 5b, Codex's tests passed every mutation it was asked to run, but independent
review found 7 (5a) and 15 (5b) acceptance items under-asserted: "no writes" checked one op name instead of all writes,
end states after a retry were never asserted, `indexOf` matched the failed first attempt, exact copy became
`toMatchObject({ success: true })`. Each needed a fix round.
**What was correct:** Mutation proofs only cover the mutations listed; a reviewer must still map every listed fact of
every acceptance item to an assertion (L-017), and the packet must say how to assert the common shapes.
**Rule:** Model-test packets define shared assertion helpers up front (e.g. `expectNoWrites(world)` covering every db
write, every `rpc:*` and every Auth write/email) and state: "assert every fact listed for an item; exact copy with
`toEqual`; assert the final state after every retry". Reviews of model tests always include a per-item fact table.

#### L-031 | 2026-10-18 | PLANNING
**What happened:** ChatGPT rejected sprint 237c-5's design three times, each for a real flaw found on paper: (1) account
provenance inferred from client-writable `user_metadata` (racable pre-hijack); (2) access decisions with row locks only,
so two concurrent "last" revokes each saw the other as live (reproduced live: access stayed on); (3) no record of where
access came from, so revoking an invite removed an owner's direct add.
**What was correct:** Provenance from server-only state (`app_metadata`, create-only `createUser`); every check-then-act
on shared access serialized by one lock per (home, person) taken in key order; access rows carry their source. Each was
proven with live probes and real two-session tests, not only fakes.
**Rule:** For any access-granting design: name the server-only source of identity, the lock that serializes each
check-then-act, and the source of every grant, before the packet goes to review. Prove concurrency claims with two real
database sessions (`supabase/tests/sprint237c5_manager_invite_race*.mjs` is the template).

#### L-032 | 2026-10-17 | VERIFICATION
**What happened:** The 237c-5 live walk logged "home checkboxes have no accessible name" because the Browser pane's
`find` / `read_page` printed them as `checkbox "on"`. An L1 fix sprint was planned. A live check showed each input is
wrapped in its `<label>` (`input.labels.length === 1`, correct text), the jsdom tests already pass with
`getByRole("checkbox", { name })`, and a probe proved the tool names `htmlFor` and `aria-label` checkboxes but prints the
default value "on" for a wrapping label. It also names buttons from `title`, not visible text.
**What was correct:** Before filing an a11y bug from the pane's tree, check the DOM: `input.labels`, `aria-label`,
`aria-labelledby`. Wrapping labels are valid HTML and name the control in Chrome and VoiceOver.
**Rule:** The Browser pane's accessibility output is a heuristic, not Chrome's accessibility tree. Confirm any "no name"
finding with `input.labels` (or a jsdom `getByRole(..., { name })` test) before planning a fix.

#### L-033 | 2026-10-21 | PROCESS — Never send a review packet in the same step as the edit that produces it
**What happened:** Twice (244b rev 2, 248a rev 2) a Python edit of the packet failed on an exact-match assertion, but
the copy-to-clipboard and the ChatGPT paste/send ran in the same batch, so ChatGPT reviewed the **old** packet under a
"rev 2" note. Each needed a correction message and another review round.
**What was correct:** Edit → verify (the script prints `ALL OK`, grep for the new markers) → only then copy and send.
**Rule:** Packet edits and the ChatGPT send are separate steps. Before `pbcopy`, confirm the edit succeeded (script
exit + a grep for a phrase unique to the new revision). Never chain the browser send in parallel with the edit.

#### L-034 | 2026-10-21 | DESIGN — Moving a global fixed overlay must be checked on pages without the thing it avoids
**What happened:** 249a's packet (Claude) lifted the site-wide install banner by a fixed 96 px to clear the phone tab
bars. On pages with no tab bar (`/login` on iPhone Safari) the banner then sat on the **Sign in** button. Unit tests
passed (they asserted the new class); the live WebKit walk caught it; Claude rolled back the one line (`7f8e876`).
**Rule:** For any change to a component mounted in the root layout (banners, toasts, help buttons), the packet must
name at least one page **without** the anchor element and the live walk must tap the primary button there. Prefer
offsets driven by the anchor itself (a CSS variable set while it is mounted) over fixed numbers.
