#!/usr/bin/env bash
set -euo pipefail

: "${PORT:=3000}"

node ./scripts/ensure-seeded.mjs
if ! node ./scripts/operational-log.mjs startup server_starting; then
  printf '%s\n' 'WARNING: startup status logging failed; continuing.' >&2
fi
exec node_modules/.bin/next start -H 0.0.0.0 -p "$PORT"
