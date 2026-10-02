#!/usr/bin/env bash
# Stop: typecheck every workspace whose TypeScript changed on this branch or in
# the working tree, plus the workspaces that depend on it. On type errors, block the
# stop and hand the errors to Claude.
# After 3 blocks in a row in one session, let Claude stop so it can report instead.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" || exit 0
session=$(jq -r '.session_id // "unknown"')
counter="${TMPDIR:-/tmp}/verisci-stop-${session}"
max_blocks=3

base=$(git merge-base HEAD origin/develop 2>/dev/null || git rev-parse HEAD)
changed=$(
  {
    git diff --name-only "$base"
    git ls-files --others --exclude-standard
  } | grep -E '\.(ts|tsx|mts|cts)$|(^|/)(package|tsconfig|tsconfig\.base|turbo)\.json$' | sort -u
)

# A root config change (tsconfig.base.json, package.json, turbo.json) can break every
# workspace: typecheck them all. Otherwise typecheck each changed workspace and every
# workspace that depends on it ("...<name>"), since packages ship source.
filters=()
if printf '%s\n' "$changed" | grep -qE '^[^/]+\.json$'; then
  filters+=("--filter=./apps/*" "--filter=./packages/*")
else
  for dir in $(printf '%s\n' "$changed" | grep -oE '^(apps|packages)/[^/]+' | sort -u); do
    name=$(jq -r '.name // empty' "$dir/package.json" 2>/dev/null)
    [ -n "$name" ] && filters+=("--filter=...$name")
  done
fi

if [ ${#filters[@]} -eq 0 ]; then
  rm -f "$counter"
  exit 0
fi

if out=$(node_modules/.bin/turbo run typecheck "${filters[@]}" --output-logs=errors-only 2>&1); then
  rm -f "$counter"
  exit 0
fi

blocks=$(( $(cat "$counter" 2>/dev/null || echo 0) + 1 ))
if [ "$blocks" -gt "$max_blocks" ]; then
  rm -f "$counter"
  jq -n '{systemMessage: "Typecheck still fails after 3 attempts; stopping so Claude can report it."}'
  exit 0
fi
echo "$blocks" > "$counter"

errors=$(printf '%s\n' "$out" | grep -E 'error TS|Failed:' | head -n 40)
[ -n "$errors" ] || errors=$(printf '%s\n' "$out" | tail -n 40)

jq -n --arg reason "Typecheck fails in workspaces changed on this branch or depending on them (attempt $blocks of $max_blocks). Fix these errors before finishing:
$errors" '{decision: "block", reason: $reason}'
exit 0
