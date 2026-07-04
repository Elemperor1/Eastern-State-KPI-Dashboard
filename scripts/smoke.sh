#!/usr/bin/env bash
# Eastern State KPI Dashboard — repeatable smoke harness.
#
# Verifies, against a live server, the finalized 8-category metric set:
#   1.  KPIs and categories APIs return the seeded finalized metric set.
#   2.  Dashboard overview renders all 8 categories.
#   3.  Category pages render for each category.
#   4.  Metric detail pages render (monthly, annual, breakdown).
#   5.  Through-month URL parameter is respected.
#   6.  Admin pages render successfully.
#   7.  Monthly, annual, and breakdown entries round-trip via POST then DELETE.
#
# D8AD-CAN-008: HTTP response bodies (body, me, kpis, cats, ov, bdy, trends_html,
# etc.) are NEVER interpolated into bash -c or eval strings. They are:
#   - piped through stdin to parsers (echo "$var" | python3 -c ...)
#   - passed via here-string to grep (grep -q ... <<< "$var")
#   - tested with [ ] or [[ ]] conditionals directly
# Every variable expansion is double-quoted. The check() helper runs its
# arguments as an unquoted command (safe — the command name + args are
# literal tokens, never an HTTP response).
#
# If AUTH_DISABLED=true (login temporarily bypassed), the auth wall + login
# round-trip checks are skipped, and requests are made without a session cookie.
# Mutation checks still fetch the non-auth CSRF cookie from /api/auth/me and
# echo it with a same-origin header, matching the browser-side apiFetch flow.
#
# Usage:
#   PORT=3200 ./scripts/smoke.sh
#   BASE=http://127.0.0.1:3100 ./scripts/smoke.sh
set -euo pipefail

PORT="${PORT:-3100}"
BASE="${BASE:-http://127.0.0.1:$PORT}"
AUTH_DISABLED="${AUTH_DISABLED:-false}"
CSRF_COOKIE_NAME="eastern_state_kpi_csrf"

if [ -n "${SMOKE_ORIGIN:-}" ]; then
  BASE_ORIGIN="${SMOKE_ORIGIN%/}"
elif [ -n "${APP_CANONICAL_ORIGIN:-}" ]; then
  BASE_ORIGIN="${APP_CANONICAL_ORIGIN%%,*}"
  BASE_ORIGIN="${BASE_ORIGIN%/}"
elif [[ "$BASE" =~ ^(https?://)127\.0\.0\.1(:[0-9]+)?/?$ ]]; then
  BASE_ORIGIN="${BASH_REMATCH[1]}localhost${BASH_REMATCH[2]}"
else
  BASE_ORIGIN="${BASE%/}"
fi

# Auth-enabled runs require the caller to supply a credential pair via
# the environment. Bootstrap accounts are provisioned with either an
# operator-provided secret (BOOTSTRAP_ADMIN_PASSWORD / BOOTSTRAP_VIEWER_PASSWORD)
# or a random unlogged password (see src/lib/auth.ts::ensureSeedAdmin);
# ensureSeedAdmin() writes NO plaintext to stdout (D8AD-CAN-001), so the
# harness cannot scrape a password from the seed output. CI seeds with a
# known BOOTSTRAP_ADMIN_PASSWORD and passes SMOKE_PASSWORD explicitly (the
# account still has must_change_password=1, so a smoke run that needs the
# dashboard must rotate it first via `npm run setup:admin`). Local dev runs
# typically use AUTH_DISABLED=true to skip this section.
if [ -z "${SMOKE_EMAIL:-}" ] || [ -z "${SMOKE_PASSWORD:-}" ]; then
  if [ "$AUTH_DISABLED" != "true" ]; then
    echo "ERROR: SMOKE_EMAIL and SMOKE_PASSWORD are required for an auth-enabled smoke run." >&2
    echo "       The seed never publishes a plaintext password (D8AD-CAN-001)." >&2
    echo "       Seed with BOOTSTRAP_ADMIN_PASSWORD=... npm run db:seed (or use" >&2
    echo "       SETUP_ADMIN_PASSWORD=... npm run setup:admin), then pass that" >&2
    echo "       credential here, or run with AUTH_DISABLED=true." >&2
    exit 1
  fi
fi
EMAIL="${SMOKE_EMAIL:-}"
PASSWORD="${SMOKE_PASSWORD:-}"

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
  curl -sk -b "$jar" -c "$jar" -o /dev/null "$BASE/api/auth/me"
  awk -v name="$CSRF_COOKIE_NAME" '
    BEGIN { value = "" }
    $0 !~ /^#/ && $6 == name { value = $7 }
    END { print value }
  ' "$jar"
}

mutation_status() {
  local jar="$1"
  local method="$2"
  local path="$3"
  local payload="$4"
  local token
  token="$(csrf_token_for "$jar")"
  if [ -z "$token" ]; then
    printf "ERROR: could not obtain CSRF token for %s %s\n" "$method" "$path" >&2
    printf "000"
    return 0
  fi
  curl -sk -b "$jar" -c "$jar" -o /dev/null -w '%{http_code}' \
    -X "$method" "$BASE$path" \
    -H "Content-Type: application/json" \
    -H "Origin: $BASE_ORIGIN" \
    -H "X-CSRF-Token: $token" \
    --data "$payload"
}

cookie_jar="$(mktemp)"
noauth_jar="$(mktemp)"
# Single-quoted trap: ensures $cookie_jar / $noauth_jar expand at
# cleanup time, not definition time (ShellCheck SC2064).
# shellcheck disable=SC2064
trap 'rm -f "$cookie_jar" "$noauth_jar"' EXIT

echo "== Eastern State KPI smoke test =="
echo "Base: $BASE"
echo "Auth: $([ "$AUTH_DISABLED" = "true" ] && echo "DISABLED" || echo "enabled")"
echo

if [ "$AUTH_DISABLED" != "true" ]; then
  echo "Public surface"
  code=$(curl -sk -o /dev/null -w '%{http_code}' "$BASE/login")
  check "login page renders (200)" test "$code" = "200"

  echo
  echo "Auth wall"
  code=$(curl -sk -o /dev/null -w '%{http_code}' "$BASE/api/entries")
  check "API rejects anonymous request (401)" test "$code" = "401"

  body=$(curl -sk "$BASE/dashboard/overview")
  check "dashboard redirects anonymous to /login" grep -qE 'NEXT_REDIRECT.*login|http-equiv="refresh".*url=/login' <<< "$body"

  echo
  echo "Admin login"
  curl -sk -c "$cookie_jar" -o /dev/null -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" --data "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
  code=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' "$BASE/api/auth/me")
  check "login + session round-trip (200)" test "$code" = "200"
  me=$(curl -sk -b "$cookie_jar" "$BASE/api/auth/me")
  if grep -q '"role":"admin"' <<< "$me"; then
    check "session identifies admin" true
  else
    check "session identifies admin" false
  fi
  echo
fi

echo
echo "Finalized metric set (KPIs & categories)"
kpis=$(curl -sk -b "$cookie_jar" "$BASE/api/kpis")
count=$(echo "$kpis" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['kpis']))")
check "KPIs API returns 52 finalized KPIs" test "$count" = "52"
cats=$(curl -sk -b "$cookie_jar" "$BASE/api/categories")
for cname in "Education" "Adult Programs" "Workforce Development" "Preservation" "Museum" "General Awareness" "Fundraising" "Economic Impact"; do
  if grep -q "$cname" <<< "$cats"; then
    check "category $cname present" true
  else
    check "category $cname present" false
  fi
done
for kpi in "Video views" "Webpage views" "Overall museum attendance" "Percent of site in triage" "Total annual budget" "Number of funders by breakdown" "First-time, returning, and lapsed donors"; do
  if grep -q "$kpi" <<< "$kpis"; then
    check "KPIs include $kpi" true
  else
    check "KPIs include $kpi" false
  fi
done

echo
echo "Dashboard overview renders"
ov=$(curl -sk -b "$cookie_jar" "$BASE/dashboard/overview")
check "overview renders (200)" grep -q "Organizational Performance" <<< "$ov"
if grep -q "Category Overview" <<< "$ov"; then
  check "overview shows category overview section" true
else
  check "overview shows category overview section" false
fi
if grep -q "Sample data" <<< "$ov"; then
  check "overview marks sample data" true
else
  check "overview marks sample data" false
fi

echo
echo "Category pages render"
for slug in education adult-programs workforce-development preservation museum general-awareness fundraising economic-impact; do
  code=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' "$BASE/dashboard/category/$slug")
  check "category $slug renders (200)" test "$code" = "200"
done

echo
echo "Metric detail pages render"
code=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' "$BASE/dashboard/metric/video-views")
check "monthly metric detail renders (200)" test "$code" = "200"
code=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' "$BASE/dashboard/metric/total-annual-budget")
check "annual metric detail renders (200)" test "$code" = "200"
bdy=$(curl -sk -b "$cookie_jar" "$BASE/dashboard/metric/funders-by-breakdown")
if grep -q "Breakdown" <<< "$bdy"; then
  check "breakdown metric detail renders breakdown" true
else
  check "breakdown metric detail renders breakdown" false
fi

echo
echo "Through-month URL parameter respected"
html=$(curl -sk -b "$cookie_jar" "$BASE/dashboard/overview?currentYear=2025&compareYear=2024&currentMonth=11")
text=$(echo "$html" | python3 -c "import sys, re; t=sys.stdin.read(); m=re.search(r'Organizational Performance</h1>\s*<(p|div)[^>]*>(.*?)</\1>', t, re.DOTALL); print(re.sub(r'<!--.*?-->','', m.group(2)).strip() if m else '')")
if grep -q "November 2025" <<< "$text"; then
  check "November through-month rendered" true
else
  check "November through-month rendered" false
fi
html=$(curl -sk -b "$cookie_jar" "$BASE/dashboard/overview?currentYear=2025&compareYear=2024&currentMonth=3")
text=$(echo "$html" | python3 -c "import sys, re; t=sys.stdin.read(); m=re.search(r'Organizational Performance</h1>\s*<(p|div)[^>]*>(.*?)</\1>', t, re.DOTALL); print(re.sub(r'<!--.*?-->','', m.group(2)).strip() if m else '')")
if grep -q "March 2025" <<< "$text"; then
  check "March through-month rendered" true
else
  check "March through-month rendered" false
fi

echo
echo "No-data badge when both years lack entries"
# Pick a year that has no entries (2099) and a compare year with no entries either.
empty_html=$(curl -sk -b "$cookie_jar" "$BASE/dashboard/category/education?currentYear=2099&compareYear=2098&currentMonth=12")
if grep -q "No data" <<< "$empty_html"; then
  check "category page surfaces 'No data' badge when both years empty" true
else
  check "category page surfaces 'No data' badge when both years empty" false
fi

echo
echo "Trend Explorer renders axis-mode control"
trends_html=$(curl -sk -b "$cookie_jar" "$BASE/dashboard/trends")
code=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' "$BASE/dashboard/trends")
check "/dashboard/trends renders (200)" test "$code" = "200"
if grep -q "Y-axis mode" <<< "$trends_html"; then
  check "/dashboard/trends surfaces 'Y-axis mode' literal" true
else
  check "/dashboard/trends surfaces 'Y-axis mode' literal" false
fi
if grep -q "Per-series (indexed)" <<< "$trends_html"; then
  check "/dashboard/trends exposes indexed tab label" true
else
  check "/dashboard/trends exposes indexed tab label" false
fi
if grep -q "Per-series (log)" <<< "$trends_html"; then
  check "/dashboard/trends exposes log tab label" true
else
  check "/dashboard/trends exposes log tab label" false
fi

echo
echo "Admin pages render"
for path in /admin/data /admin/kpis /admin/users; do
  code=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' "$BASE$path")
  check "$path renders (200)" test "$code" = "200"
done
code=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' "$BASE/admin/history")
check "/admin/history renders (200)" test "$code" = "200"
history_body=$(curl -sk -b "$cookie_jar" "$BASE/admin/history")
if grep -q "Edit history" <<< "$history_body"; then
  check "/admin/history shows 'Edit history' heading" true
else
  check "/admin/history shows 'Edit history' heading" false
fi
api_history=$(curl -sk -b "$cookie_jar" "$BASE/api/entries/history?limit=5")
if echo "$api_history" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if isinstance(d.get('history'), list) else 1)"; then
  check "/api/entries/history returns array" true
else
  check "/api/entries/history returns array" false
fi
kpis_html=$(curl -sk -b "$cookie_jar" "$BASE/admin/kpis")
if grep -q "Add a new KPI" <<< "$kpis_html" && grep -q "Existing KPIs" <<< "$kpis_html"; then
  check "/admin/kpis renders 'Add a new KPI' + 'Existing KPIs'" true
else
  check "/admin/kpis renders 'Add a new KPI' + 'Existing KPIs'" false
fi

echo
echo "Monthly entries round-trip"
monthly_kpi=$(echo "$kpis" | python3 -c "import sys,json; d=json.load(sys.stdin); print([k['id'] for k in d['kpis'] if k['slug']=='video-views'][0])")
post=$(mutation_status "$cookie_jar" POST "/api/entries" "{\"kpi_id\": $monthly_kpi, \"year\": 2099, \"month\": 1, \"value\": 12345}")
check "POST /api/entries (monthly) returns 201" test "$post" = "201"
new_id=$(curl -sk -b "$cookie_jar" "$BASE/api/entries?year=2099" | python3 -c "import sys,json; d=json.load(sys.stdin); e=[x for x in d.get('entries', []) if x['value']==12345]; print(e[0]['id'] if e else '')")
if [ -n "$new_id" ]; then
  check "monthly entry readable" true
else
  check "monthly entry readable" false
fi
del=$(mutation_status "$cookie_jar" DELETE "/api/entries" "{\"id\": $new_id}")
check "DELETE /api/entries returns 200" test "$del" = "200"

echo
echo "Annual entries round-trip"
annual_kpi=$(echo "$kpis" | python3 -c "import sys,json; d=json.load(sys.stdin); print([k['id'] for k in d['kpis'] if k['slug']=='programs-offered'][0])")
post=$(mutation_status "$cookie_jar" POST "/api/entries" "{\"kpi_id\": $annual_kpi, \"year\": 2099, \"month\": 0, \"value\": 7}")
check "POST /api/entries (annual, month=0) returns 201" test "$post" = "201"
new_id=$(curl -sk -b "$cookie_jar" "$BASE/api/entries?year=2099" | python3 -c "import sys,json; d=json.load(sys.stdin); e=[x for x in d.get('entries', []) if x['value']==7]; print(e[0]['id'] if e else '')")
if [ -n "$new_id" ]; then
  check "annual entry readable (month=0)" true
else
  check "annual entry readable (month=0)" false
fi
del=$(mutation_status "$cookie_jar" DELETE "/api/entries" "{\"id\": $new_id}")
check "DELETE annual entry returns 200" test "$del" = "200"

echo
echo "Breakdown entries round-trip"
brk_kpi=$(echo "$kpis" | python3 -c "import sys,json; d=json.load(sys.stdin); print([k['id'] for k in d['kpis'] if k['slug']=='donor-categories'][0])")
post=$(mutation_status "$cookie_jar" POST "/api/breakdowns" "{\"kpi_id\": $brk_kpi, \"year\": 2099, \"label\": \"Test row\", \"value\": 99}")
check "POST /api/breakdowns returns 201" test "$post" = "201"
new_id=$(curl -sk -b "$cookie_jar" "$BASE/api/breakdowns?year=2099" | python3 -c "import sys,json; d=json.load(sys.stdin); e=[x for x in d.get('breakdowns', []) if x['label']=='Test row']; print(e[0]['id'] if e else '')")
if [ -n "$new_id" ]; then
  check "breakdown entry readable" true
else
  check "breakdown entry readable" false
fi
del=$(mutation_status "$cookie_jar" DELETE "/api/breakdowns" "{\"id\": $new_id}")
check "DELETE /api/breakdowns returns 200" test "$del" = "200"

echo
echo "Auth-bypass flow on POST /api/entries (no cookie)"
# $noauth_jar was created above and starts without a session cookie. The
# mutation helper may add only the CSRF cookie, which is not an auth credential.
bypass_kpi=$(echo "$kpis" | python3 -c "import sys,json; d=json.load(sys.stdin); print([k['id'] for k in d['kpis'] if k['slug']=='video-views'][0])")
bypass_status=$(mutation_status "$noauth_jar" POST "/api/entries" "{\"kpi_id\": $bypass_kpi, \"year\": 2099, \"month\": 2, \"value\": 54321}")
bypass_id=$(curl -sk -b "$noauth_jar" "$BASE/api/entries?year=2099" | python3 -c "import sys,json; d=json.load(sys.stdin); e=[x for x in d.get('entries', []) if x['value']==54321]; print(e[0]['id'] if e else '')")
if [ "$AUTH_DISABLED" = "true" ]; then
  check "no-cookie POST succeeds when AUTH_DISABLED=true (201)" test "$bypass_status" = "201"
  if [ -n "$bypass_id" ]; then
    bypass_row=$(curl -sk -b "$noauth_jar" "$BASE/api/entries?year=2099" | python3 -c "import sys,json; d=json.load(sys.stdin); e=[x for x in d.get('entries', []) if x['value']==54321]; print(e[0].get('updated_by', 'missing') if e else 'missing')")
    if [ "$bypass_row" != "missing" ] && [ "$bypass_row" != "None" ] && [ -n "$bypass_row" ]; then
      check "bypass entry has real updated_by FK (no FK error)" true
    else
      check "bypass entry has real updated_by FK (no FK error)" false
    fi
    del=$(mutation_status "$noauth_jar" DELETE "/api/entries" "{\"id\": $bypass_id}")
    check "cleanup DELETE bypass entry returns 200" test "$del" = "200"
  else
    check "bypass entry readable after POST" false
  fi
else
  # Without the bypass, no session cookie means requireAdmin() fails.
  # The handler returns 403 (forbidden — admin required), which proves the
  # auth wall is up; 401 is acceptable too.
  # D8AD-CAN-008: avoid bash -c here — use inline if/else so that
  # $bypass_status is never reparsed as shell syntax.
  if [ "$bypass_status" = "401" ] || [ "$bypass_status" = "403" ]; then
    check "no-cookie POST rejected when AUTH_DISABLED=false (401/403)" true
  else
    check "no-cookie POST rejected when AUTH_DISABLED=false (401/403)" false
  fi
  if [ -z "$bypass_id" ]; then
    check "no-cookie POST did NOT create a row" true
  else
    check "no-cookie POST did NOT create a row" false
  fi
fi

echo
printf "== Smoke test complete: %d passed, %d failed ==\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
