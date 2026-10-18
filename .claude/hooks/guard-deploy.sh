#!/bin/bash
# Blocks `vercel deploy` from the main checkout while app code there is uncommitted (L-022).
# Deploying from a clean worktree (path contains "deploy-wt") is always allowed.
cmd=$(jq -r '.tool_input.command // ""')
case "$cmd" in *"vercel deploy"*) ;; *) exit 0 ;; esac
repo="$CLAUDE_PROJECT_DIR"
# Sprint 237c-5: 5a (Send) must never deploy without 5b (Resend/Revoke). HEAD's revokeInvite would delete the new
# manager Auth users and leave their grants on. Deploy worktrees are cut from HEAD, so checking HEAD covers both paths.
if git -C "$repo" cat-file -e HEAD:apps/web/lib/manager-invite.ts 2>/dev/null \
   && ! git -C "$repo" cat-file -e HEAD:apps/web/lib/manager-invite-rows.ts 2>/dev/null; then
  echo "Blocked: HEAD has 237c-5a (lib/manager-invite.ts) without 237c-5b (lib/manager-invite-rows.ts). Ship 5a+5b+5c together." >&2
  exit 2
fi
case "$cmd" in *deploy-wt*) exit 0 ;; esac
dirty=$(git -C "$repo" status --porcelain -- apps/web supabase packages 2>/dev/null | grep -v ' 2\.' | head -5)
if [ -n "$dirty" ]; then
  echo "Blocked: uncommitted app changes in the main checkout. Commit first, or deploy from a clean worktree (see the /ship skill)." >&2
  echo "$dirty" >&2
  exit 2
fi
exit 0
