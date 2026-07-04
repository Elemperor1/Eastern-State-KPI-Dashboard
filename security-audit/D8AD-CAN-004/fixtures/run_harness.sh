#!/usr/bin/env bash
# Orchestrate the D8AD-CAN-004 browser CSRF harness end-to-end:
#   1. start the baseline app (auth enabled, host-only SameSite=Lax cookie)
#   2. start the attacker HTTP server
#   3. wait for both to be healthy
#   4. run the Playwright driver, which logs in as admin and fires every
#      vector against every route from both the cross-site and the
#      same-site-sibling attacker origins
#   5. tear everything down
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_LOG=/tmp/eskpi-app.log
ATK_LOG=/tmp/eskpi-atk.log
APP_PID=""
ATK_PID=""

cleanup() {
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null || true
  [ -n "$ATK_PID" ] && kill "$ATK_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "[harness] starting app..."
bash "$HERE/start_app.sh" >"$APP_LOG" 2>&1 &
APP_PID=$!

echo "[harness] starting attacker server on 127.0.0.1:4000..."
python3 "$HERE/attacker_server.py" 4000 >"$ATK_LOG" 2>&1 &
ATK_PID=$!

echo "[harness] waiting for app health (max 90s)..."
for i in $(seq 1 90); do
  if curl -s -o /dev/null -m 2 "http://127.0.0.1:3000/login"; then
    echo "[harness] app up after ${i}s"; break
  fi
  sleep 1
done

echo "[harness] waiting for attacker health..."
for i in $(seq 1 20); do
  if curl -s -o /dev/null -m 2 "http://127.0.0.1:4000/healthz"; then
    echo "[harness] attacker up after ${i}s"; break
  fi
  sleep 1
done

echo "[harness] running Playwright CSRF driver..."
python3 "$HERE/run_csrf.py"
RC=$?
echo "[harness] driver exited rc=$RC"
if [ $RC -ne 0 ]; then
  echo "=== APP LOG (tail) ==="; tail -40 "$APP_LOG" || true
  echo "=== ATK LOG (tail) ==="; tail -20 "$ATK_LOG" || true
fi
exit $RC