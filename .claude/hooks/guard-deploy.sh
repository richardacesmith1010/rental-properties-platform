#!/bin/bash
# Blocks `vercel deploy` from the main checkout while app code there is uncommitted (L-022).
# Deploying from a clean worktree (path contains "deploy-wt") is always allowed.
cmd=$(jq -r '.tool_input.command // ""')
case "$cmd" in *"vercel deploy"*) ;; *) exit 0 ;; esac
case "$cmd" in *deploy-wt*) exit 0 ;; esac
repo="$CLAUDE_PROJECT_DIR"
dirty=$(git -C "$repo" status --porcelain -- apps/web supabase packages 2>/dev/null | grep -v ' 2\.' | head -5)
if [ -n "$dirty" ]; then
  echo "Blocked: uncommitted app changes in the main checkout. Commit first, or deploy from a clean worktree (see the /ship skill)." >&2
  echo "$dirty" >&2
  exit 2
fi
exit 0
