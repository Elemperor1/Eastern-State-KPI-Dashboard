#!/usr/bin/env bash
# Eastern State KPI — canonical Strategic Plan smoke harness.
set -euo pipefail

PORT="${PORT:-3100}"
BASE="${BASE:-http://127.0.0.1:$PORT}"
AUTH_DISABLED="${AUTH_DISABLED:-false}"
CSRF_COOKIE_NAME="eastern_state_kpi_csrf"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE_ORIGIN="${SMOKE_ORIGIN:-${BASE%/}}"
CURL_TLS_ARGS=()

if [ -n "${SMOKE_CA_BUNDLE:-}" ]; then
  if [ ! -r "$SMOKE_CA_BUNDLE" ]; then
    echo "ERROR: SMOKE_CA_BUNDLE must name a readable CA certificate bundle." >&2
    exit 1
  fi
  CURL_TLS_ARGS=(--cacert "$SMOKE_CA_BUNDLE")
fi

if [ "$AUTH_DISABLED" != "true" ] && { [ -z "${SMOKE_EMAIL:-}" ] || [ -z "${SMOKE_PASSWORD:-}" ]; }; then
  echo "ERROR: SMOKE_EMAIL and SMOKE_PASSWORD are required when auth is enabled." >&2
  exit 1
fi

PASS=0
FAIL=0
check() {
  local name="$1"
  shift
  if "$@"; then
    printf "  \033[32mPASS\033[0m  %s\n" "$name"
    PASS=$((PASS+1))
  else
    printf "  \033[31mFAIL\033[0m  %s\n" "$name"
    FAIL=$((FAIL+1))
  fi
}

csrf_token_for() {
  local jar="$1"
  curl -sS "${CURL_TLS_ARGS[@]}" -b "$jar" -c "$jar" -o /dev/null "$BASE/api/auth/me"
  awk -v name="$CSRF_COOKIE_NAME" '$0 !~ /^#/ && $6 == name { value = $7 } END { print value }' "$jar"
}

MUTATION_STATUS=""
MUTATION_BODY=""
mutation_request() {
  local jar="$1" method="$2" path="$3" payload="$4" body_file token
  token="$(csrf_token_for "$jar")"
  body_file="$(mktemp)"
  MUTATION_STATUS="$(curl -sS "${CURL_TLS_ARGS[@]}" -b "$jar" -c "$jar" -o "$body_file" -w '%{http_code}' \
    -X "$method" "$BASE$path" \
    -H "Content-Type: application/json" \
    -H "Origin: $BASE_ORIGIN" \
    -H "X-CSRF-Token: $token" \
    --data "$payload")"
  MUTATION_BODY="$(tr -d '\000' < "$body_file")"
  rm -f "$body_file"
}

cookie_jar="$(mktemp)"
anonymous_jar="$(mktemp)"
trap 'rm -f "$cookie_jar" "$anonymous_jar"' EXIT

echo "== Eastern State KPI smoke test =="
echo "Base: $BASE"

readiness_code=$(curl -sS "${CURL_TLS_ARGS[@]}" -o /dev/null -w '%{http_code}' "$BASE/api/health/ready")
readiness_body=$(curl -sS "${CURL_TLS_ARGS[@]}" "$BASE/api/health/ready")
check "readiness reports the initialized SQLite process ready" \
  test "$readiness_code" = "200"
check "readiness response is minimal and privacy-safe" \
  test "$readiness_body" = '{"status":"ready"}'

if [ "$AUTH_DISABLED" != "true" ]; then
  code=$(curl -sS "${CURL_TLS_ARGS[@]}" -o /dev/null -w '%{http_code}' "$BASE/login")
  check "login page renders" test "$code" = "200"
  curl -sS "${CURL_TLS_ARGS[@]}" -c "$cookie_jar" -o /dev/null -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    --data "{\"email\":\"${SMOKE_EMAIL}\",\"password\":\"${SMOKE_PASSWORD}\"}"
  me=$(curl -sS "${CURL_TLS_ARGS[@]}" -b "$cookie_jar" "$BASE/api/auth/me")
  check "session identifies admin" grep -q '"role":"admin"' <<< "$me"
fi

mutation_request "$anonymous_jar" POST "/api/strategy/observations" \
  '{}'
if [ "$AUTH_DISABLED" = "true" ]; then
  check "development bypass reaches canonical mutation boundary" test "$MUTATION_STATUS" != "401"
else
  if [ "$MUTATION_STATUS" = "401" ] || [ "$MUTATION_STATUS" = "403" ]; then
    check "canonical mutation rejects anonymous requests" true
  else
    check "canonical mutation rejects anonymous requests" false
  fi
fi

mutation_request "$anonymous_jar" POST "/api/strategy/observations" \
  '{"submission_type":"multi_input","writes":[]}'
if [ "$AUTH_DISABLED" = "true" ]; then
  check "development bypass reaches atomic batch boundary" test "$MUTATION_STATUS" != "401"
else
  if [ "$MUTATION_STATUS" = "401" ] || [ "$MUTATION_STATUS" = "403" ]; then
    check "atomic batch rejects anonymous requests" true
  else
    check "atomic batch rejects anonymous requests" false
  fi
fi

echo
echo "Product routes"
overview=$(curl -sS "${CURL_TLS_ARGS[@]}" -b "$cookie_jar" "$BASE/dashboard/overview?year=2026")
check "Overview renders" grep -q '>Overview<' <<< "$overview"
check "Overview shows organization progress" grep -q "Organization progress" <<< "$overview"
check "Overview shows Strategic Priorities" grep -q "Strategic Priorities" <<< "$overview"
check "Overview shows Needs attention" grep -q "Needs attention" <<< "$overview"
if grep -qE 'strategic-board-export-root|board-report-root|Board Report' <<< "$overview"; then
  check "Overview contains no Board Report payload or markup" false
else
  check "Overview contains no Board Report payload or markup" true
fi
overview_bytes=$(printf "%s" "$overview" | wc -c | tr -d ' ')
check "Overview decoded HTML stays below 250 KB" test "$overview_bytes" -lt 250000

for priority in \
  "Reimagine Visitor Experience" \
  "Advance Historic Preservation" \
  "Expand Workforce Development" \
  "Support Learning through Justice Education" \
  "Enhance Organizational Capacity"; do
  check "Overview includes $priority" grep -q "$priority" <<< "$overview"
done

data_entry=$(curl -sS "${CURL_TLS_ARGS[@]}" -b "$cookie_jar" "$BASE/data-entry?year=2026")
check "Data Entry renders" grep -q '>Data Entry<' <<< "$data_entry"
check "Data Entry has reporting checklist" grep -q "Reporting checklist" <<< "$data_entry"
check "Data Entry exposes status language" grep -qE "Not started|Needs attention|Complete" <<< "$data_entry"
if grep -qi "month 0" <<< "$data_entry"; then
  check "Data Entry hides the annual storage sentinel" false
else
  check "Data Entry hides the annual storage sentinel" true
fi

reports=$(curl -sS "${CURL_TLS_ARGS[@]}" -b "$cookie_jar" "$BASE/reports?view=board&year=2026")
check "Reports renders Board Report on demand" grep -q "board-report-root" <<< "$reports"
check "Board Report includes all 59 KPIs" test "$(grep -o 'data-board-kpi=' <<< "$reports" | wc -l | tr -d ' ')" -eq 59
trends=$(curl -sS "${CURL_TLS_ARGS[@]}" -b "$cookie_jar" "$BASE/reports?view=trends&year=2026")
check "Reports renders strategic Trends on demand" grep -q "trend-measure" <<< "$trends"
if grep -q "board-report-root" <<< "$trends"; then
  check "Trends does not render Board Report" false
else
  check "Trends does not render Board Report" true
fi

for area in measures goals people activity; do
  code=$(curl -sS "${CURL_TLS_ARGS[@]}" -b "$cookie_jar" -o /dev/null -w '%{http_code}' "$BASE/setup?area=$area")
  check "Setup $area renders" test "$code" = "200"
done
setup=$(curl -sS "${CURL_TLS_ARGS[@]}" -b "$cookie_jar" "$BASE/setup?area=measures")
for label in Measures Goals People Activity; do
  check "Setup exposes $label" grep -q ">$label<" <<< "$setup"
done
needs_attention=$(curl -sS "${CURL_TLS_ARGS[@]}" -b "$cookie_jar" "$BASE/setup?area=measures&filter=needs-attention")
check "Measures integrates setup attention" grep -q "Needs attention (" <<< "$needs_attention"
check "Attention rows link into Setup details" grep -q "area=measures&amp;item=" <<< "$needs_attention"

echo
echo "Removed production workflows"
for path in \
  /admin /admin/data /admin/strategy-data /admin/goals /admin/kpis \
  /admin/strategic-goals /admin/configuration-gaps /admin/history /admin/users \
  /dashboard/trends; do
  code=$(curl -sS "${CURL_TLS_ARGS[@]}" -b "$cookie_jar" -o /dev/null -w '%{http_code}' "$BASE$path")
  check "$path is removed" test "$code" = "404"
done
for path in /api/entries /api/breakdowns /api/goals; do
  code=$(curl -sS "${CURL_TLS_ARGS[@]}" -b "$cookie_jar" -o /dev/null -w '%{http_code}' -X POST "$BASE$path")
  check "$path legacy mutation is removed" test "$code" = "404"
done

echo
echo "Canonical strategic mutation and report truth"
if [ -n "${SMOKE_CATALOG_JSON:-}" ]; then
  catalog_json="$SMOKE_CATALOG_JSON"
else
  catalog_json="$("$REPO_ROOT/node_modules/.bin/tsx" "$REPO_ROOT/scripts/smoke-catalog.ts")"
fi
kpi=$(printf "%s" "$catalog_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['ids']['strategyPercentageKpi'])")
year=$(printf "%s" "$catalog_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['ids']['strategyPercentageYear'])")
mutation_request "$cookie_jar" POST "/api/strategy/observations" \
  "{\"kpi_id\":$kpi,\"reporting_year\":$year,\"numerator\":2,\"denominator\":4,\"source_reference\":\"Smoke test; delete after verification\"}"
check "strategic observation saves raw inputs" test "$MUTATION_STATUS" = "201"
observation_id=$(printf "%s" "$MUTATION_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('observation') or {}).get('id',''))")
check "strategic observation returns a durable id" test -n "$observation_id"
report_json=$(curl -sS "${CURL_TLS_ARGS[@]}" -b "$cookie_jar" "$BASE/api/strategy/export?year=$year&format=json")
check "report export reads strategic calculation truth" grep -q '"report"' <<< "$report_json"
report_csv=$(curl -sS "${CURL_TLS_ARGS[@]}" -b "$cookie_jar" "$BASE/api/strategy/export?year=$year&format=csv")
check "CSV uses annual and full-plan columns" grep -q "Annual Pacing Target.*Full Plan Actual" <<< "$report_csv"
if grep -qE 'NaN|undefined|Infinity' <<< "$report_csv"; then
  check "CSV has finite output" false
else
  check "CSV has finite output" true
fi
mutation_request "$cookie_jar" DELETE "/api/strategy/observations" "{\"id\":$observation_id}"
check "strategic observation cleanup succeeds" test "$MUTATION_STATUS" = "200"

activity=$(curl -sS "${CURL_TLS_ARGS[@]}" -b "$cookie_jar" "$BASE/setup?area=activity")
check "Activity retains the deleted observation audit" grep -q "Smoke test; delete after verification" <<< "$activity"

echo
printf "== Smoke test complete: %d passed, %d failed ==\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
