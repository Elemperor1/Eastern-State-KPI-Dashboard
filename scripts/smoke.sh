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
# If AUTH_DISABLED=true (login temporarily bypassed), the auth wall + login
# round-trip checks are skipped, and requests are made without a session cookie.
#
# Usage:
#   PORT=3200 ./scripts/smoke.sh
#   BASE=http://127.0.0.1:3100 ./scripts/smoke.sh
set -euo pipefail

PORT="${PORT:-3100}"
BASE="${BASE:-http://127.0.0.1:$PORT}"
EMAIL="${SMOKE_EMAIL:-kerry@easternstate.org}"
PASSWORD="${SMOKE_PASSWORD:-KerryAdmin!2026}"
AUTH_DISABLED="${AUTH_DISABLED:-false}"

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

cookie_jar="$(mktemp)"
trap "rm -f $cookie_jar" EXIT

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
  check "dashboard redirects anonymous to /login" echo "$body" | grep -qE 'NEXT_REDIRECT.*login|http-equiv="refresh".*url=/login'

  echo
  echo "Admin login"
  curl -sk -c "$cookie_jar" -o /dev/null -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" --data "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
  code=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' "$BASE/api/auth/me")
  check "login + session round-trip (200)" test "$code" = "200"
  me=$(curl -sk -b "$cookie_jar" "$BASE/api/auth/me")
  echo "$me" | grep -q '"role":"admin"' && check "session identifies admin" true || check "session identifies admin" false
  echo
fi

echo
echo "Finalized metric set (KPIs & categories)"
kpis=$(curl -sk -b "$cookie_jar" "$BASE/api/kpis")
count=$(echo "$kpis" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['kpis']))")
check "KPIs API returns 52 finalized KPIs" test "$count" = "52"
cats=$(curl -sk -b "$cookie_jar" "$BASE/api/categories")
for cname in "Education" "Adult Programs" "Workforce Development" "Preservation" "Museum" "General Awareness" "Fundraising" "Economic Impact"; do
  echo "$cats" | grep -q "$cname" && check "category $cname present" true || check "category $cname present" false
done
for kpi in "Video views" "Webpage views" "Overall museum attendance" "Percent of site in triage" "Total annual budget" "Number of funders by breakdown" "First-time, returning, and lapsed donors"; do
  echo "$kpis" | grep -q "$kpi" && check "KPIs include $kpi" true || check "KPIs include $kpi" false
done

echo "Dashboard overview renders"
ov=$(curl -sk -b "$cookie_jar" "$BASE/dashboard/overview")
check "overview renders (200)" bash -c "echo '$ov' | grep -q 'Organizational Performance'"
echo "$ov" | grep -q "Category Overview" && check "overview shows category overview section" true || check "overview shows category overview section" false
echo "$ov" | grep -q "Sample data" && check "overview marks sample data" true || check "overview marks sample data" false

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
echo "$bdy" | grep -q "Breakdown" && check "breakdown metric detail renders breakdown" true || check "breakdown metric detail renders breakdown" false

echo
echo "Through-month URL parameter respected"
html=$(curl -sk -b "$cookie_jar" "$BASE/dashboard/overview?currentYear=2025&compareYear=2024&currentMonth=11")
text=$(echo "$html" | python3 -c "import sys, re; t=sys.stdin.read(); m=re.search(r'Organizational Performance</h1>\s*<(p|div)[^>]*>(.*?)</\1>', t, re.DOTALL); print(re.sub(r'<!--.*?-->','', m.group(2)).strip() if m else '')")
echo "$text" | grep -q "November 2025" && check "November through-month rendered" true || check "November through-month rendered" false
html=$(curl -sk -b "$cookie_jar" "$BASE/dashboard/overview?currentYear=2025&compareYear=2024&currentMonth=3")
text=$(echo "$html" | python3 -c "import sys, re; t=sys.stdin.read(); m=re.search(r'Organizational Performance</h1>\s*<(p|div)[^>]*>(.*?)</\1>', t, re.DOTALL); print(re.sub(r'<!--.*?-->','', m.group(2)).strip() if m else '')")
echo "$text" | grep -q "March 2025" && check "March through-month rendered" true || check "March through-month rendered" false

echo
echo "Admin pages render"
for path in /admin/data /admin/kpis /admin/users; do
  code=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' "$BASE$path")
  check "$path renders (200)" test "$code" = "200"
done

echo
echo "Monthly entries round-trip"
monthly_kpi=$(echo "$kpis" | python3 -c "import sys,json; d=json.load(sys.stdin); print([k['id'] for k in d['kpis'] if k['slug']=='video-views'][0])")
post=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/entries" -H "Content-Type: application/json" --data "{\"kpi_id\": $monthly_kpi, \"year\": 2099, \"month\": 1, \"value\": 12345}")
check "POST /api/entries (monthly) returns 201" test "$post" = "201"
new_id=$(curl -sk -b "$cookie_jar" "$BASE/api/entries?year=2099" | python3 -c "import sys,json; e=[x for x in json.load(sys.stdin)['entries'] if x['value']==12345]; print(e[0]['id'] if e else '')")
[ -n "$new_id" ] && check "monthly entry readable" true || check "monthly entry readable" false
del=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/entries" -H "Content-Type: application/json" --data "{\"id\": $new_id}")
check "DELETE /api/entries returns 200" test "$del" = "200"

echo
echo "Annual entries round-trip"
annual_kpi=$(echo "$kpis" | python3 -c "import sys,json; d=json.load(sys.stdin); print([k['id'] for k in d['kpis'] if k['slug']=='programs-offered'][0])")
post=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/entries" -H "Content-Type: application/json" --data "{\"kpi_id\": $annual_kpi, \"year\": 2099, \"month\": 0, \"value\": 7}")
check "POST /api/entries (annual, month=0) returns 201" test "$post" = "201"
new_id=$(curl -sk -b "$cookie_jar" "$BASE/api/entries?year=2099" | python3 -c "import sys,json; e=[x for x in json.load(sys.stdin)['entries'] if x['value']==7]; print(e[0]['id'] if e else '')")
[ -n "$new_id" ] && check "annual entry readable (month=0)" true || check "annual entry readable (month=0)" false
del=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/entries" -H "Content-Type: application/json" --data "{\"id\": $new_id}")
check "DELETE annual entry returns 200" test "$del" = "200"

echo
echo "Breakdown entries round-trip"
brk_kpi=$(echo "$kpis" | python3 -c "import sys,json; d=json.load(sys.stdin); print([k['id'] for k in d['kpis'] if k['slug']=='donor-categories'][0])")
post=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/breakdowns" -H "Content-Type: application/json" --data "{\"kpi_id\": $brk_kpi, \"year\": 2099, \"label\": \"Test row\", \"value\": 99}")
check "POST /api/breakdowns returns 201" test "$post" = "201"
new_id=$(curl -sk -b "$cookie_jar" "$BASE/api/breakdowns?year=2099" | python3 -c "import sys,json; e=[x for x in json.load(sys.stdin)['breakdowns'] if x['label']=='Test row']; print(e[0]['id'] if e else '')")
[ -n "$new_id" ] && check "breakdown entry readable" true || check "breakdown entry readable" false
del=$(curl -sk -b "$cookie_jar" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/breakdowns" -H "Content-Type: application/json" --data "{\"id\": $new_id}")
check "DELETE /api/breakdowns returns 200" test "$del" = "200"

echo
printf "== Smoke test complete: %d passed, %d failed ==\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
