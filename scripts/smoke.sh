#!/usr/bin/env bash
# Eastern State KPI Dashboard — repeatable smoke harness.
#
# Verifies, against a live server:
#   1.  Public login page renders.
#   2.  Unauthenticated requests are rejected (401/302/307).
#   3.  Admin login succeeds and returns a session cookie.
#   4.  /api/auth/me identifies the admin.
#   5.  KPIs and categories APIs return the seeded data.
#   6.  Dashboard overview renders every seeded KPI.
#   7.  Three comparison modes (monthly, ytd, trend) all render successfully.
#   8.  Admin pages render successfully.
#   9.  Through-month URL parameter is respected (no longer silently rewritten).
#  10.  Monthly entries round-trip via POST then DELETE.
#
# Usage:
#   PORT=3200 ./scripts/smoke.sh
#   BASE=http://127.0.0.1:3100 ./scripts/smoke.sh
set -euo pipefail

PORT="${PORT:-3100}"
BASE="${BASE:-http://127.0.0.1:$PORT}"
EMAIL="${SMOKE_EMAIL:-kerry@easternstate.org}"
PASSWORD="${SMOKE_PASSWORD:-KerryAdmin!2026}"

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

curl_json() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  if [ -n "$data" ]; then
    curl -sk -X "$method" "$url" -H "Content-Type: application/json" --data "$data" -w "\n%{http_code}"
  else
    curl -sk -X "$method" "$url" -w "\n%{http_code}"
  fi
}

cookie_jar="$(mktemp)"
trap "rm -f $cookie_jar" EXIT

echo "== Eastern State KPI smoke test =="
echo "Base: $BASE"
echo

echo "Public surface"
code=$(curl -sk -o /dev/null -w '%{http_code}' "$BASE/login")
check "login page renders (200)" test "$code" = "200"

echo
echo "Auth wall"
code=$(curl -sk -o /dev/null -w '%{http_code}' "$BASE/api/entries")
check "API rejects anonymous request (401)" test "$code" = "401"

code=$(curl -sk -o /dev/null -w '%{http_code}' "$BASE/dashboard/overview")
check "dashboard redirects anonymous (307)" test "$code" = "307"

echo
echo "Admin login"
body_code=$(curl_json POST "$BASE/api/auth/login" "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
body=$(echo "$body_code" | head -n1)
code=$(echo "$body_code" | tail -n1)
check "login API returns 200" test "$code" = "200"
echo "$body" | grep -q '"role":"admin"' && check "login response includes admin role" true || check "login response includes admin role" false

curl -sk -c "$cookie_jar" -o /dev/null -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" --data "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
me=$(curl -sk -b "$cookie_jar" "$BASE/api/auth/me")
echo "$me" | grep -q '"email":"'"$EMAIL"'"' && check "session identifies admin" true || check "session identifies admin" false

echo
echo "KPIs & categories API"
kpis=$(curl -sk -b "$cookie_jar" "$BASE/api/kpis")
count=$(echo "$kpis" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['kpis']))")
check "KPIs API returns >= 5 seeded KPIs" test "$count" -ge "5"
echo "$kpis" | grep -q "Website Traffic" && check "KPIs include Website Traffic" true || check "KPIs include Website Traffic" false
echo "$kpis" | grep -q "Tour Attendance" && check "KPIs include Tour Attendance" true || check "KPIs include Tour Attendance" false
echo "$kpis" | grep -q "Donations Received" && check "KPIs include Donations Received" true || check "KPIs include Donations Received" false
echo "$kpis" | grep -q "Active Memberships" && check "KPIs include Active Memberships" true || check "KPIs include Active Memberships" false

echo
echo "Dashboard renders"
ov=$(curl -sk -b "$cookie_jar" "$BASE/dashboard/overview")
for kpi in "Website Traffic" "Program Attendance" "Justice 101 Participation" "Tour Attendance" "Active Memberships" "Donations Received" "Social Media Engagement"; do
  echo "$ov" | grep -q "$kpi" && check "overview shows $kpi" true || check "overview shows $kpi" false
done
echo "$ov" | grep -q "Year-to-Date Performance" && check "overview shows YTD rollup" true || check "overview shows YTD rollup" false
echo "$ov" | grep -q "Category Performance" && check "overview shows category strip" true || check "overview shows category strip" false

echo
echo "Three comparison modes"
for mode in monthly ytd trend; do
  code=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' "$BASE/dashboard/overview?currentYear=2026&compareYear=2025&currentMonth=6&mode=$mode")
  check "mode=$mode renders" test "$code" = "200"
done

echo
echo "Through-month URL parameter respected"
html=$(curl -sk -b "$cookie_jar" "$BASE/dashboard/overview?currentYear=2025&compareYear=2024&currentMonth=11&mode=monthly")
text=$(echo "$html" | python3 -c "import sys, re; t=sys.stdin.read(); m=re.search(r'Organizational Performance</h1>\s*<p[^>]*>(.*?)</p>', t, re.DOTALL); print(re.sub(r'<!--.*?-->','', m.group(1)).strip() if m else '')")
echo "$text" | grep -q "November 2025 compared with November 2024" && check "November through-month rendered" true || check "November through-month rendered" false
html=$(curl -sk -b "$cookie_jar" "$BASE/dashboard/overview?currentYear=2025&compareYear=2024&currentMonth=3&mode=monthly")
text=$(echo "$html" | python3 -c "import sys, re; t=sys.stdin.read(); m=re.search(r'Organizational Performance</h1>\s*<p[^>]*>(.*?)</p>', t, re.DOTALL); print(re.sub(r'<!--.*?-->','', m.group(1)).strip() if m else '')")
echo "$text" | grep -q "March 2025 compared with March 2024" && check "March through-month rendered" true || check "March through-month rendered" false

echo
echo "Admin pages render"
for path in /admin/data /admin/kpis /admin/users; do
  code=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' "$BASE$path")
  check "$path renders" test "$code" = "200"
done

echo
echo "Monthly entries round-trip"
kpi_id=$(echo "$kpis" | python3 -c "import sys,json; print(json.load(sys.stdin)['kpis'][0]['id'])")
post=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/entries" -H "Content-Type: application/json" --data "{\"kpi_id\": $kpi_id, \"year\": 2099, \"month\": 1, \"value\": 12345}")
check "POST /api/entries returns 201" test "$post" = "201"
verify=$(curl -sk -b "$cookie_jar" "$BASE/api/entries?year=2099")
echo "$verify" | grep -q "12345" && check "POST entry is readable" true || check "POST entry is readable" false
new_id=$(echo "$verify" | python3 -c "import sys,json; e=[x for x in json.load(sys.stdin)['entries'] if x['value']==12345]; print(e[0]['id'] if e else '')")
[ -n "$new_id" ] && check "extracted new entry id" true || check "extracted new entry id" false
del=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/entries" -H "Content-Type: application/json" --data "{\"id\": $new_id}")
check "DELETE /api/entries returns 200" test "$del" = "200"

echo
printf "== Smoke test complete: %d passed, %d failed ==\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
