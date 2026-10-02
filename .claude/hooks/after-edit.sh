#!/usr/bin/env bash
# PostToolUse (Edit|Write): format, lint and test the file Claude just edited.
# Exit 2 sends stderr back to Claude in the same turn; exit 0 means nothing to report.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
file=$(jq -r '.tool_input.file_path // empty')

[ -n "$file" ] && [ -f "$file" ] || exit 0
case "$file" in
  "$root"/*) rel="${file#"$root"/}" ;;
  *) exit 0 ;; # outside the repo
esac

cd "$root" || exit 0

fail() {
  printf '%s\n' "$1" >&2
  exit 2
}

case "$rel" in
  *.ts | *.tsx | *.js | *.mjs | *.cjs | *.json | *.jsonc | *.css)
    # Biome ignores gitignored and unknown files on its own.
    if ! out=$(node_modules/.bin/biome check --write --no-errors-on-unmatched "$rel" 2>&1); then
      fail "Biome found problems it cannot fix in $rel:
$out"
    fi
    case "$rel" in
      *.ts | *.tsx)
        if ! out=$(node_modules/.bin/vitest related "$rel" --run --passWithNoTests 2>&1); then
          fail "Tests related to $rel fail:
$(printf '%s\n' "$out" | tail -n 150)"
        fi
        ;;
    esac
    ;;
  packages/contracts/*.sol)
    sol="${rel#packages/contracts/}"
    cd packages/contracts || exit 0
    forge fmt "$sol" >/dev/null 2>&1
    case "$sol" in
      src/*)
        if ! out=$(node_modules/.bin/solhint --disc --noPoster "$sol" 2>&1); then
          fail "NatSpec is incomplete in $rel (CONTRIBUTING.md → Docs):
$out"
        fi
        ;;
    esac
    if ! out=$(forge test 2>&1); then
      fail "forge test fails after editing $rel:
$(printf '%s\n' "$out" | tail -n 60)"
    fi
    ;;
esac

exit 0
