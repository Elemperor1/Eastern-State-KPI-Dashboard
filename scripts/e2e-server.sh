#!/usr/bin/env bash
set -euo pipefail

# Playwright owns DATABASE_PATH, credentials, and PORT. Build and serve the
# exact production Webpack path that CI and deployment use, while retaining the
# suite's loopback-only disposable environment.
: "${PORT:=3291}"

# S053-C1: confirm the exact disposable database the seed may reset.
# Playwright owns DATABASE_PATH (an absolute private temp path).
export SEED_CONFIRM="$DATABASE_PATH"

npm run db:seed
npm run setup:admin
npm run build
exec node_modules/.bin/next start -H 127.0.0.1 -p "$PORT"
