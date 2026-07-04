#!/usr/bin/env bash
# D8AD-CAN-008 CI gate — shell-injection defense regression suite.
#
# Three stages:
#   1. ShellCheck static analysis on all tracked shell scripts.
#   2. Static-pattern guard: scans for bash -c / sh -c / eval that could
#      re-evaluate network-controlled data as shell syntax.
#   3. Dynamic test: runs scripts/smoke.sh against a fake HTTP server that
#      returns shell-injection payloads in every response body, then verifies
#      no injected command executed.
#
# Usage:
#   bash ./scripts/d8ad-can-008-ci-gate.sh
#
# Exit status:
#   0 — all stages pass
#   1 — any stage fails
#
# Requires:
#   - python3 (stdlib only — no pip dependencies)
#   - bash 4+
#   - curl
#   - shellcheck (optional — skipped gracefully if absent)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
MARKER="/tmp/eskpi-d8ad-marker"
STAGE=0
PASS=0
FAIL=0

# ── Helpers ─────────────────────────────────────────────────────────────────

check() {
  local name="$1"
  shift
  if "$@"; then
    printf "  \033[32mPASS\033[0m  %s\n" "$name"
    PASS=$((PASS + 1))
  else
    printf "  \033[31mFAIL\033[0m  %s\n" "$name"
    FAIL=$((FAIL + 1))
  fi
}

stage_header() {
  STAGE=$((STAGE + 1))
  echo
  echo "─── Stage $STAGE: $* ───"
}

cleanup() {
  local rc=$?
  rm -f "$MARKER"
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [ "$rc" -ne 0 ]; then
    # Re-print the stage header that failed so CI logs are clear
    echo
    echo "❌ D8AD-CAN-008 CI gate FAILED (exit $rc)."
  fi
  exit "$rc"
}
trap cleanup EXIT

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  D8AD-CAN-008 CI gate — shell-injection defense regression  ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# ── Stage 1: ShellCheck ─────────────────────────────────────────────────────

stage_header "ShellCheck static analysis"

if command -v shellcheck &>/dev/null; then
  # Use find -exec to preserve per-file path boundaries (avoids
  # word-splitting on paths with spaces).
  if find "$REPO" -name '*.sh' \
    -not -path '*/node_modules/*' \
    -not -path '*/.hermes/*' \
    -not -path '*/security-audit/*' \
    -exec shellcheck {} +; then
    check "ShellCheck: all scripts pass" true
  else
    check "ShellCheck: all scripts pass" false
  fi
else
  echo "  ⚠  shellcheck not installed — skipping ShellCheck stage."
  echo "     Install it: brew install shellcheck  (macOS)"
  echo "                apt install shellcheck    (Debian/Ubuntu)"
  echo "                dnf install shellcheck    (Fedora)"
  echo "     CI runners (GitHub Actions, etc.) should install it."
fi

# ── Stage 2: Static-pattern guard ───────────────────────────────────────────

stage_header "Static-pattern guard (bash -c / sh -c / eval reintroduction)"

# Scan all shell scripts under scripts/ for executable code patterns that
# re-evaluate strings as shell syntax.  We exclude comment lines and the
# Python test scripts (which only mention "bash -c" in prose).
#
# The guarded patterns are:
#   bash -c "..."    — runs a string through the shell parser
#   sh -c "..."      — same with POSIX sh
#   eval "..."       — evaluates a string as shell code
#   eval $var        — evaluates an unquoted variable as shell code
#
# False-positive notes:
#   - `eval "$(ssh-agent -s)"` would match, but ssh-agent is not used here.
#   - If a legitimate eval is needed, add a comment with "shellcheck disable"
#     on the line above (the guard ignores lines with that marker).

VIOLATIONS=0
scan_pattern() {
  local label="$1"
  local pattern="$2"
  local dir="${3:-$REPO/scripts}"

  # Use awk to find non-comment lines matching the pattern.
  # grep -rn output includes the filename prefix (file:line:content),
  # which breaks a simple '^\s*#' filter.  awk inspects the actual
  # content portion directly.
  # We also exclude lines that contain `D8AD-CAN-008` or `shellcheck disable`.
  # The CI gate script itself is excluded because it describes these
  # patterns in strings and function names (false positives).
  local hits
  hits="$(
    find "$dir" -name '*.sh' ! -name 'd8ad-can-008-ci-gate.sh' \
      -exec awk -v pat="$pattern" '
      !/^\s*#/ && $0 ~ pat {
        if (index($0, "shellcheck disable") == 0 && \
            index($0, "D8AD-CAN-008") == 0) {
          print FILENAME ":" NR ":" $0
        }
      }
    ' {} + 2>/dev/null || true
  )"

  if [ -n "$hits" ]; then
    echo "  ❌ $label — found $pattern in:"
    while IFS= read -r line; do
      echo "       $line"
    done <<< "$hits"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
}

# Scan for the three dangerous patterns in shell scripts only
# (skip .py files — Python doesn't evaluate strings as shell).
# For eval, use a pattern that matches `eval ` or `eval"` or `eval$`
# (command usage) but not "evaluate" or "re-evaluates" in prose.
scan_pattern "bash -c" 'bash[[:space:]]+-c'
scan_pattern "sh -c"   'sh[[:space:]]+-c'
scan_pattern "eval"    'eval[[:space:]]|eval["$]'

if [ "$VIOLATIONS" -eq 0 ]; then
  check "static guard: no bash -c / sh -c / eval patterns found" true
else
  check "static guard: no bash -c / sh -c / eval patterns found" false
  echo "  ⚠  A shell script in scripts/ introduced a string-evaluation pattern."
  echo "     See the hits above.  If this is a false positive, add a comment:"
  echo "        # shellcheck disable=SCXXXX  (on the line before)"
  echo "     Or reference D8AD-CAN-008 in a comment."
fi

# ── Stage 3: Dynamic smoke-test against malicious fake server ───────────────-

stage_header "Dynamic test: smoke.sh against fake server with shell-injection payloads"

# Clean up any stale marker
rm -f "$MARKER"

# Find a free port
PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',0)); print(s.getsockname()[1]); s.close()")

# Start the fake server in the background
python3 "$HERE/d8ad-can-008-fake-server.py" "$PORT" &
SERVER_PID=$!

# Wait for the server to be ready
# shellcheck disable=SC2034
for i in $(seq 1 20); do
  if curl -s -o /dev/null -m 1 "http://127.0.0.1:$PORT/api/kpis" 2>/dev/null; then
    break
  fi
  sleep 0.2
done

echo "  Fake server on 127.0.0.1:$PORT (PID $SERVER_PID)"

# Run smoke.sh against the fake server
# AUTH_DISABLED=true skips the login/auth wall section (the fake server
# doesn't implement real auth, but the endpoints still return 200 if hit).
export AUTH_DISABLED=true
export BASE="http://127.0.0.1:$PORT"

echo "  Running smoke.sh ..."
echo

if bash "$REPO/scripts/smoke.sh"; then
  check "smoke.sh completes against fake server (all assertions pass)" true
else
  check "smoke.sh completes against fake server (all assertions pass)" false
fi

echo

# ── Stage 4: Side-effect verification ───────────────────────────────────────

stage_header "Side-effect verification"

# Wait a moment for any delayed process/thread to try creating the file
sleep 0.5

if [ ! -f "$MARKER" ]; then
  check "NO marker file created — shell-injection payloads NOT evaluated as code" true
else
  check "NO marker file created — shell-injection payloads NOT evaluated as code" false
  rm -f "$MARKER"
fi

# Also verify from Python that no marker exists (defense in depth)
if python3 -c "
import os
if os.path.exists('/tmp/eskpi-d8ad-marker'):
    os.remove('/tmp/eskpi-d8ad-marker')
    exit(1)
exit(0)
"; then
  check "Python-verified: no marker file exists" true
else
  check "Python-verified: no marker file exists" false
fi

# Kill the fake server
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
SERVER_PID=""

# ── Report ──────────────────────────────────────────────────────────────────

echo
echo "══════════════════════════════════════════════════════════════"
printf "D8AD-CAN-008 CI gate: %d passed, %d failed%s\n" "$PASS" "$FAIL" \
  "$([ "$FAIL" -eq 0 ] && echo "" || echo " ❌")"
echo "══════════════════════════════════════════════════════════════"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1