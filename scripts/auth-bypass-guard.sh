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

# Strip surrounding double quotes (fly.toml/Dockerfile use double quotes).
strip_quotes() { printf '%s' "$1" | tr -d '"'; }

# 1. fly.toml [env] AUTH_DISABLED must be falsey or absent.
fly_raw="$(
  awk '
    /^\[env\]/ { f=1; next }
    /^\[/       { f=0 }
    f && /^[[:space:]]*AUTH_DISABLED[[:space:]]*=/ {
      sub(/^[^=]*=[[:space:]]*/, "")
      print
    }
  ' fly.toml
)"
fly_auth="$(strip_quotes "$fly_raw")"
if truthy "$fly_auth"; then
  fail "fly.toml sets AUTH_DISABLED='$fly_auth' (truthy). Deploy configs must not enable the bypass."
fi

# 2. Dockerfile must bake NODE_ENV=production and must NOT set
#    AUTH_DISABLED to a truthy value anywhere (ENV or ARG).
if ! grep -Eq '^[[:space:]]*ENV[[:space:]]+NODE_ENV=production' Dockerfile; then
  fail "Dockerfile must set 'ENV NODE_ENV=production'."
fi
docker_raw="$(grep -E '^[[:space:]]*(ENV|ARG)[[:space:]]+AUTH_DISABLED' Dockerfile | head -1 || true)"
docker_raw="${docker_raw#*AUTH_DISABLED}"
docker_raw="${docker_raw#=}"
docker_auth="$(strip_quotes "$(printf '%s' "$docker_raw" | tr -d '[:space:]')")"
if truthy "$docker_auth"; then
  fail "Dockerfile sets AUTH_DISABLED='$docker_auth' (truthy). The bypass must not be baked into the production image."
fi

# 3. scripts/start-production.sh must not enable the bypass.
sp_raw="$(grep -E 'AUTH_DISABLED' scripts/start-production.sh 2>/dev/null | head -1 || true)"
sp_raw="${sp_raw#*AUTH_DISABLED}"
sp_raw="${sp_raw#*[:=]}"
sp_auth="$(strip_quotes "$(printf '%s' "$sp_raw" | tr -d '[:space:]')")"
if truthy "$sp_auth"; then
  fail "scripts/start-production.sh sets AUTH_DISABLED='$sp_auth' (truthy)."
fi

if [ "$status" -ne 0 ]; then
  echo "auth-bypass-guard: FAILED — a supported deployment configuration can enable the bypass." >&2
  exit 1
fi

echo "✅ auth-bypass-guard passed: no supported deployment configuration enables AUTH_DISABLED."