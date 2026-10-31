# Codex Lessons Learned

Codex owns this log (moved verbatim from AGENTS.md §12 on 2026-10-14). Read before every task; append a dated entry after every real mistake. Categories: SCOPE, WIRING, QUALITY, PATTERN, REPORTING, PROCESS. Never delete; mark outdated entries [SUPERSEDED].

#### L-001 | 2026-03-02 | WIRING
**What happened:** Initial Phase A implementation (automations, inbox, leasing) used localStorage and hardcoded template lists instead of querying the real `automation_templates`, `inbox_threads`, and `rental_listings` tables.
**What was correct:** All persistent data MUST come from Supabase queries. localStorage is only for client-side preferences (theme, sidebar state).
**Rule:** Before reporting any feature as WORKING, verify: does this feature read from AND write to a real Supabase table? If not, report SCAFFOLDED.

#### L-002 | 2026-03-02 | QUALITY
**What happened:** In `sendInboxMessage`, the secondary `inbox_threads.update()` call (to bump `updated_at`) didn't check for errors — the result was silently discarded.
**What was correct:** Every Supabase mutation must have its error result captured and at minimum logged.
**Rule:** For every `.insert()`, `.update()`, `.delete()` call, destructure `{ error }` and either return it to the user or `console.error()` it. Never use `await supabase.from(...).update(...)` without capturing the result.

#### L-003 | 2026-03-02 | REPORTING
**What happened:** Codex included "Claude prompt" and "recommended next steps for Claude" sections in handoff notes, which the user found unhelpful.
**What was correct:** Claude owns planning. Codex should report compact status only and let Claude decide next steps.
**Rule:** Never include "Claude prompt," "recommended next steps," or "what Claude should do" sections. Report compact status using the format in Section 5, then stop.

#### L-004 | 2026-03-03 | PATTERN
**What happened:** During hardening, delete flows were briefly wired with plain `Button` components in `useFormState` forms, which removed visible pending/loading feedback from destructive submissions.
**What was correct:** Every `useFormState` form must submit through `SubmitButton` so pending state is always visible to users.
**Rule:** In any form powered by `useFormState`, use `SubmitButton` for the submit trigger (including delete/archive flows). If confirmation is required, intercept `onClick`, open confirm dialog, then call `form.requestSubmit()` on confirm.


#### L-005 | 2026-10-09 | PATTERN
**What happened:** Capacitor 8 generates a SceneDelegate that creates its own bridge controller, bypassing the storyboard controller.
**What was correct:** Wire the custom bridge controller into both the scene entry point and storyboard, and use the scene foreground callback.
**Rule:** Inspect generated native lifecycle entry points before wiring navigation or foreground behavior; storyboard changes alone are insufficient.

#### L-006 | 2026-10-10 | PROCESS
**What happened:** During Sprint 211, `npm run gate:web` was started despite a no-DB-access constraint. Its runtime verifier read the configured Supabase project before the gate was stopped.
**What was correct:** Inspect composite gate scripts before running them under a restricted task; run only their local checks when a gate includes forbidden external access.
**Rule:** Before running a required gate under a no-network or no-DB constraint, read the gate script and skip any stage that would violate the task constraint. Report the full gate as incomplete.

#### L-007 | 2026-10-11 | PROCESS
**What happened:** During Sprint 216, a standalone TypeScript check ran while `next build` regenerated `.next/types`, causing transient missing-file errors.
**What was correct:** Run the standalone TypeScript check after the build finishes when both use the same `.next` directory.
**Rule:** Do not run `npx tsc --noEmit -p apps/web/tsconfig.json` concurrently with `npm run build --workspace @domus/web`; rerun it after the build if a generated-type race occurs.


#### L-008 | 2026-10-30 | QUALITY
**What happened:** Wrapping a Supabase select projection with string concatenation widened its inferred type.
**What was correct:** A multiline template literal preserves the projection's literal type and inferred result columns.
**Rule:** Keep Supabase select projections as literals when wrapping lines; verify with TypeScript after the build.
