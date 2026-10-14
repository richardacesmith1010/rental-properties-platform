#!/bin/bash
# Blocks `git commit` when staged files include iCloud duplicates ("* 2.*"), env files, or obvious live secrets.
cmd=$(jq -r '.tool_input.command // ""')
case "$cmd" in *"git commit"*) ;; *) exit 0 ;; esac
repo="$CLAUDE_PROJECT_DIR"
staged=$(git -C "$repo" diff --cached --name-only 2>/dev/null)
bad=$(printf '%s\n' "$staged" | grep -E '( 2\.[^/]+$|(^|/)\.env(\.|$)|\.p12$|\.mobileprovision$)')
if [ -n "$bad" ]; then
  echo "Blocked: staged files that must not be committed:" >&2; echo "$bad" >&2; exit 2
fi
if git -C "$repo" diff --cached -U0 2>/dev/null | grep -E '^\+' | grep -qE '(sk_live_[A-Za-z0-9]{10,}|rk_live_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{20,}|eyJhbGciOi[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'; then
  echo "Blocked: the staged diff appears to contain a live secret (Stripe key, webhook secret, JWT or private key)." >&2; exit 2
fi
exit 0
