#!/usr/bin/env bash
set -euo pipefail

: "${PORT:=3000}"

node ./scripts/ensure-seeded.mjs
node ./scripts/operational-log.mjs startup server_starting
exec node_modules/.bin/next start -H 0.0.0.0 -p "$PORT"
