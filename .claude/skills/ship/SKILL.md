---
name: ship
description: Gate, commit, deploy and verify a Domus change in production — full gate, clean deploy, smoke, CI check, live walk, handoff update. Use after reviewing Codex's work or any change that must go live.
---

# Ship

Run each step; stop on the first failure and report the exact failing command and error (CLAUDE.md §6).

1. **Gate (run in the background):**
   - `npm run gate:web` (lint, typecheck, tests, build);
   - for iOS changes, also `cd apps/ios/ios/App && xcodebuild test -project App.xcodeproj -scheme App -destination 'id=C79BDA37-1967-45CB-A369-85B260EA111D'`.
2. **Migrations (if any):** apply them with Supabase MCP `apply_migration`. Then run the rolled-back attacker SQL listed in the packet, with `set local role authenticated` plus JWT claims (L-021). If a migration recreates a constraint, policy or function, diff it against the live definition first (L-012).
3. **Commit only the sprint's files**, with the attribution trailer, then `git push origin main`. The commit hook blocks secrets and `* 2.*` files.
4. **Deploy** in a **separate** Bash call after the commit; the deploy hook checks the tree before the command runs, so commit + deploy in one command is blocked: `env -u CLAUDECODE npx vercel deploy --prod --yes`.
   - The deploy hook blocks it if app files are uncommitted in the main checkout.
   - If Codex is still working in the tree, deploy from a clean worktree instead: `git worktree add --detach <scratchpad>/deploy-wt HEAD`, copy `.vercel` into it, and deploy from there.
5. **Smoke:** run `set -a; . apps/web/.env.local; set +a; APP_URL=https://domusbase.com npm run smoke:web`. Without the SMOKE_* variables loaded, it fails on missing credentials.
6. **CI:** `curl -s https://api.github.com/repos/<owner>/<repo>/commits/$(git rev-parse HEAD)/check-runs`. The `gate` check must be `success` (L-019). There is no `gh` CLI on this machine.
7. **Live walk:**
   - **UI changes:** use the Chrome tools or the iOS Simulator tools. Take light and dark screenshots of every changed screen and confirm primary button labels are visible.
   - **Backend changes:** run a direct API or SQL check.
   - **Sign-ins are the owner's job:** ask for exactly one action.
8. **Report and close:**
   - Append a "Sprint NNN SHIPPED" block to `docs/agent-handoff.md`.
   - Note the transcript size: `du -sh ~/.claude/projects/-Users-courtneysmith-Documents-Codex-Rental-Properties/<session>.jsonl`.
   - Give the owner a PASS / PASS_WITH_RISK / FAIL verdict, what was verified, what remains, and the next sprint proposal (CLAUDE.md §9).
