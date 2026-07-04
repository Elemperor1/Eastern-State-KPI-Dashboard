#!/usr/bin/env bash
# Start the baseline (revision ea7263d) app for the D8AD-CAN-004 CSRF harness.
#
# Environment choices and why they do NOT weaken the CSRF proof:
#   SESSION_SECURE=false  -> only so the Secure cookie can be set/sent over
#                            local HTTP. Secure is orthogonal to SameSite:
#                            it governs http-vs-https transport, NOT whether
#                            the cookie is sent cross-site. Production runs
#                            SESSION_SECURE=true + force_https (fly.toml).
#                            SameSite=Lax cross-site sending behavior is
#                            identical over HTTP and HTTPS.
#   AUTH_DISABLED unset    -> auth wall is UP; a real admin login + host-only
#                            session cookie is required (models production).
#   TRUST_PROXY=false      -> irrelevant to CSRF; only affects login throttle
#                            client-IP attribution.
#   No --disable-web-security, no cookie/SameSite relaxation anywhere.
set -euo pipefail

WORKTREE="${WORKTREE:-/tmp/eskpi-baseline}"
DATA_DIR="${DATA_DIR:-/tmp/eskpi-baseline-data}"
DB_PATH="$DATA_DIR/kpi.db"
SESSION_SECRET="${SESSION_SECRET:-a]${RANDOM}-very-long-session-secret-0123456789abcdef0123456789abcdef}"
mkdir -p "$DATA_DIR"

# Fresh DB each run -> deterministic seed.
rm -f "$DB_PATH" "$DB_PATH"-wal "$DB_PATH"-shm 2>/dev/null || true

cd "$WORKTREE"

export DATABASE_PATH="$DB_PATH"
export SESSION_SECRET
export SESSION_SECURE=false
export TRUST_PROXY=false
export NODE_ENV=development
unset AUTH_DISABLED

echo "[start_app] seeding baseline DB (NODE_ENV=$NODE_ENV)..."
npm run db:seed >/tmp/eskpi-seed.log 2>&1 || { cat /tmp/eskpi-seed.log; exit 1; }

echo "[start_app] setting known admin password deterministically..."
ADMIN_PASSWORD="${ADMIN_PASSWORD:-CsrfTest-AdminPass-123!}" \
  node "/Users/jacobcyber/Documents/Eastern State KPI/security-audit/D8AD-CAN-004/fixtures/set_admin_password.mjs" \
  >/tmp/eskpi-setpw.log 2>&1 || { cat /tmp/eskpi-setpw.log; exit 1; }
cat /tmp/eskpi-setpw.log

echo "[start_app] starting next dev on 0.0.0.0:3000..."
exec node_modules/.bin/next dev -H 0.0.0.0 -p 3000