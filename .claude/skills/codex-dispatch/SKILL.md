---
name: codex-dispatch
description: Write and send a Domus sprint packet to Codex (the implementer), pick the model by severity, run it in the background with automatic retry, then review the result. Use whenever app code needs to change.
---

# Codex dispatch

Claude plans and verifies; Codex writes app code (CLAUDE.md §1).

## 1. Write the packet
Write `docs/sprintNNN-codex-prompt.md` with all 10 sections:
1. Objective
2. Context (HEAD, real file paths and line counts)
3. In scope
4. Out of scope
5. Exact files expected to change
6. Implementation requirements
7. Validation commands
8. Acceptance criteria (named tests that call real code)
9. Report format
10. Constraints

Before sending, check it against `docs/lessons.md`:
- Every acceptance criterion stays inside §5 (L-011).
- Copy is exact, and the packet invents no URLs or emails (L-012, L-020).
- The packet says how Undo reverses every side effect (L-016).
- If the code is generalized to another role, the packet pins the original role's behavior (L-014).

Always include these lines:
- "Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only."
- For UI: "The user should never need to read instructions to complete this flow…"

## 2. Severity → reviewer → model
| Level | What | ChatGPT review | Model / effort |
|---|---|---|---|
| L1 | copy, styling, one component | no | `gpt-6-luna` low |
| L2 | feature or logic | no | `gpt-6-sol` medium |
| L3 | money, auth, schema, prod config, data integrity | **yes** (`/chatgpt-review`) | `gpt-6-sol` high |
| iPhone app (any) | `apps/ios` | **yes** | `gpt-6-astra` high |

## 3. Run it (background, survives capacity errors)
Commit the packet first, so the diff only shows Codex's work.

```
.claude/skills/codex-dispatch/run-codex.sh docs/sprintNNN-codex-prompt.md sNNN <model> <effort> <scratchpad>
```

Run it with `run_in_background: true` and wait for the notification. Don't poll.

## 4. Review (never accept on the report alone)
- `git status` and `git diff --stat`: confirm no out-of-scope files.
- Read every new or changed test. Map each §8 criterion to a real assertion. Missing or tautological tests mean FAIL (L-017).
- For any refactor: lines ≤ 140 characters, and character totals within ±10% (L-015).
- For UI: grep for `]:hidden` and `]:opacity-0` on child selectors (L-022).
- Codex's sandbox can't run the iOS Simulator, so Claude runs `xcodebuild test` itself.
- Then use `/ship`.
