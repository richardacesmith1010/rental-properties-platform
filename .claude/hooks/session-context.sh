#!/bin/bash
# Session start: inject branch, HEAD, dirty files and the handoff "Next" line (CLAUDE.md anti-drift check).
repo="$CLAUDE_PROJECT_DIR"
branch=$(git -C "$repo" branch --show-current 2>/dev/null)
head=$(git -C "$repo" log --oneline -5 2>/dev/null)
status=$(git -C "$repo" status --short 2>/dev/null | head -15)
next=$(grep -n -i '^\- \*\*next' "$repo/docs/agent-handoff.md" 2>/dev/null | tail -2)
ctx="Repo state at session start. Branch: $branch
Recent commits:
$head
Uncommitted:
${status:-clean}
Latest handoff 'Next' lines:
$next"
jq -n --arg c "$ctx" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
