#!/bin/zsh
# usage: run-codex.sh <packet.md> <tag> <model> <effort> [outdir]
# Runs Codex on a sprint packet. Retries with a resume note after "at capacity" or usage-limit stops; the last try falls back to gpt-6-sol.
packet=$1; tag=$2; model=${3:-gpt-6-sol}; effort=${4:-medium}; out=${5:-${TMPDIR:-/tmp}/codex-runs}
mkdir -p "$out"; cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)" || exit 1
note=""; n=0
for m in $model $model $model gpt-6-sol; do
  n=$((n+1)); rm -rf apps/web/.next
  ~/.codex-cli/node_modules/.bin/codex exec -m $m -c model_reasoning_effort=$effort --sandbox workspace-write \
    -c sandbox_workspace_write.network_access=true --output-schema docs/codex-report-schema.json \
    -o "$out/$tag-report.json" "$note$(cat $packet)" < /dev/null > "$out/$tag-$n.log" 2>&1
  [ -s "$out/$tag-report.json" ] && { echo "DONE $m attempt $n -> $out/$tag-report.json"; exit 0; }
  t=$(/usr/bin/grep -o "try again at [0-9:]* [AP]M" "$out/$tag-$n.log" | tail -1 | sed 's/try again at //')
  if [ -n "$t" ]; then
    target=$(date -j -f "%I:%M %p" "$t" +%s 2>/dev/null); now=$(date +%s)
    [ -n "$target" ] && [ $target -lt $now ] && target=$((target+86400))
    echo "usage limit; waiting until $t"; sleep $(( target - now + 90 ))
  else
    echo "attempt $n ($m) ended without report"; sleep 180
  fi
  note="RESUME NOTE (read first): a previous run of this exact sprint stopped early (service capacity or usage limit). The working tree may have partial work. Do NOT start over or revert. Inspect git status/diff, finish every missing item, fix failing tests, run all validations, and produce the JSON report. Preserve unrelated pre-existing changes (.claude/, docs/, apps/mobile).

"
done
exit 1
