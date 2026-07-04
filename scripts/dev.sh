#!/usr/bin/env bash
# Local development server entrypoint.
#
# `npm run dev` runs this. It binds `next dev` to a single declared
# host (BIND_HOST) so that src/lib/auth-flag.ts can verify the bypass
# is only ever exposed on a loopback interface (D8AD-CAN-002).
#
# - When AUTH_DISABLED is set (in the shell or in a .env file), BIND_HOST
#   defaults to 127.0.0.1 so the server is reachable only from
#   localhost. auth-flag refuses startup if BIND_HOST is overridden to a
#   non-loopback value while the bypass is on.
# - When AUTH_DISABLED is off, BIND_HOST defaults to 0.0.0.0 so the
#   server stays reachable on the LAN for device testing (no bypass =
#   no risk).
#
# We read .env files ourselves because Next.js loads them inside the
# Node process (after bash has chosen BIND_HOST); reading them here
# keeps the bash bind decision consistent with what auth-flag will see.
set -euo pipefail

# Strict truthy parser matching src/lib/auth-flag.ts envFlagIsSet:
# any non-empty value that isn't false/0/off/no (case-insensitive).
auth_flag_is_set() {
  local v="${1:-}"
  # Trim leading/trailing whitespace (match auth-flag.ts envFlagIsSet).
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  v="$(printf '%s' "$v" | tr '[:upper:]' '[:lower:]')"
  case "$v" in
    "" | "false" | "0" | "off" | "no") return 1 ;;
    *) return 0 ;;
  esac
}

# True if AUTH_DISABLED is truthy in the shell env OR in a .env file
# (Next loads .env files in the Node process; we mirror that here so
# the bind decision matches the runtime). Next does not override
# existing process.env, so an explicit shell value wins.
auth_disabled_in_env_files() {
  local f line val
  for f in .env.local .env.development.local .env.development .env; do
    [ -f "$f" ] || continue
    line="$(grep -E '^[[:space:]]*AUTH_DISABLED[[:space:]]*=' "$f" 2>/dev/null | head -1 || true)"
    [ -n "$line" ] || continue
    val="${line#*=}"
    # trim leading/trailing whitespace (bash-only, no sed quoting traps)
    val="${val#"${val%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"
    # strip one surrounding pair of double quotes
    val="${val#\"}"
    val="${val%\"}"
    if auth_flag_is_set "$val"; then return 0; fi
  done
  return 1
}

if auth_flag_is_set "${AUTH_DISABLED:-}" || auth_disabled_in_env_files; then
  : "${BIND_HOST:=127.0.0.1}"
else
  : "${BIND_HOST:=0.0.0.0}"
fi
export BIND_HOST

: "${PORT:=3000}"
exec node_modules/.bin/next dev -H "$BIND_HOST" -p "$PORT"