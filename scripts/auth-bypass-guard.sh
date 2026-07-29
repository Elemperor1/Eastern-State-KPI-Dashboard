#!/usr/bin/env bash
# CI assertion (security finding D8AD-CAN-002):
# No SUPPORTED DEPLOYMENT configuration can enable the AUTH_DISABLED
# anonymous-admin bypass. This runs as part of the CI gate
# (`npm run design-system:test`) so a regression that bakes the bypass
# into fly.toml, the Dockerfile, or the production start script fails
# the build before it ships.
set -euo pipefail

status=0
fail() { echo "auth-bypass-guard: $1" >&2; status=1; }

# Strict truthy parser matching src/lib/auth-flag.ts envFlagIsSet:
# any non-empty value that isn't false/0/off/no (case-insensitive).
truthy() {
  local v
  v="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  v="${v// /}"
  case "$v" in
    "" | "false" | "0" | "off" | "no") return 1 ;;
    *) return 0 ;;
  esac
}

# Strip quotes (fly.toml/Dockerfile use double quotes; shell assignments
# commonly use single quotes).
strip_quotes() { printf '%s' "$1" | tr -d "\"'"; }

# Extracts the assigned value from a line mentioning AUTH_DISABLED: the
# first token after the separator, so trailing comments cannot pollute the
# truthiness check (e.g. 'AUTH_DISABLED=false # documented default').
extract_value() {
  printf '%s' "${1#*AUTH_DISABLED}" \
    | sed -e 's/^[[:space:]:=]*//' -e 's/[[:space:]#].*$//'
}

# Normalizes an extracted assignment token. Shell parameter-assignment
# expansions end in `}` (for example `${AUTH_DISABLED:=false}`); remove that
# syntax wrapper after quotes so the strict truthy parser sees the value itself.
normalize_assignment_value() {
  local value
  value="$(strip_quotes "$(extract_value "$1")")"
  printf '%s' "${value%\}}"
}

# 1. fly.toml [env] AUTH_DISABLED must be falsey or absent. Parsed with a
#    real TOML parser (finding S048-C1): awk pattern matching misses valid
#    TOML forms such as a spaced '[ env ]' header or an inline table
#    'env = { AUTH_DISABLED = "true" }'.
fly_values="$(
  python3 - <<'PY'
import tomllib

def values(node, prefix=""):
    if isinstance(node, dict):
        for key, child in node.items():
            yield from values(child, f"{prefix}{key}.")
    else:
        yield prefix[:-1], node

with open("fly.toml", "rb") as handle:
    document = tomllib.load(handle)

for key, value in values(document):
    if key.split(".")[-1] == "AUTH_DISABLED":
        print(f"{key}={value}")
PY
)"
while IFS= read -r fly_entry; do
  [ -z "$fly_entry" ] && continue
  fly_auth="$(strip_quotes "${fly_entry#*=}")"
  if truthy "$fly_auth"; then
    fail "fly.toml sets ${fly_entry%%=*}='$fly_auth' (truthy). Deploy configs must not enable the bypass."
  fi
done <<< "$fly_values"

# 2. Dockerfile must bake NODE_ENV=production and must NOT set
#    AUTH_DISABLED to a truthy value anywhere (ENV or ARG). Dockerfile
#    instructions are case-insensitive (finding S048-C2), so the scans are
#    too. Every line mentioning the variable is tokenized into individual
#    assignments rather than only matching lines where AUTH_DISABLED
#    directly follows ENV/ARG, so a continuation-line assignment such as
#    'ENV EXTRA=1 \' followed by '  AUTH_DISABLED=true' cannot hide, and
#    both the 'KEY=VALUE' and legacy 'KEY VALUE' forms are caught.
#    Comment-led lines are excluded.
if ! grep -Eiq '^[[:space:]]*ENV[[:space:]]+NODE_ENV=production' Dockerfile; then
  fail "Dockerfile must set 'ENV NODE_ENV=production'."
fi
while IFS= read -r docker_token; do
  [ -z "$docker_token" ] && continue
  docker_auth="$(normalize_assignment_value "$docker_token")"
  if truthy "$docker_auth"; then
    fail "Dockerfile sets AUTH_DISABLED='$docker_auth' (truthy). The bypass must not be baked into the production image."
  fi
done <<< "$(grep -iE 'AUTH_DISABLED' Dockerfile | grep -vE '^[[:space:]]*#' | grep -oiE 'AUTH_DISABLED[[:space:]:=]+[^;[:space:]#\\]+' || true)"

# 3. scripts/start-production.sh must not enable the bypass.
#    Every AUTH_DISABLED assignment on every non-comment-led line is
#    tokenized and checked individually (finding S048-C3): the scan
#    selects all lines mentioning the variable, drops comment-led lines,
#    then emits every assignment token per line, so a first-token or
#    indented assignment, a falsey decoy line, a same-line double
#    assignment, and shell default-assign expansions all fail the guard.
while IFS= read -r sp_token; do
  [ -z "$sp_token" ] && continue
  sp_auth="$(normalize_assignment_value "$sp_token")"
  if truthy "$sp_auth"; then
    fail "scripts/start-production.sh sets AUTH_DISABLED='$sp_auth' (truthy)."
  fi
done <<< "$(grep 'AUTH_DISABLED' scripts/start-production.sh 2>/dev/null | grep -vE '^[[:space:]]*#' | grep -oE 'AUTH_DISABLED[[:space:]:]*=[[:space:]]*[^;[:space:]#\\]+' || true)"

if [ "$status" -ne 0 ]; then
  echo "auth-bypass-guard: FAILED — a supported deployment configuration can enable the bypass." >&2
  exit 1
fi

echo "✅ auth-bypass-guard passed: no supported deployment configuration enables AUTH_DISABLED."
