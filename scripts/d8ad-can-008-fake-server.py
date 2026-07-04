#!/usr/bin/env python3
"""
D8AD-CAN-008 Fake HTTP server for isolated smoke-test CI coverage.

Spoofs the entire Eastern State KPI API surface that scripts/smoke.sh exercises,
returning valid-looking responses that also contain shell-injection payloads:
  $() command substitutions, backticks, semicolons, quotes, newlines, | && ||.

smoke.sh runs against this server instead of the real Next.js app, proving that
every HTTP response body is handled via safe data-flow patterns (grep <<<,
piped to python3, [ ] conditionals) that never re-evaluate the content as
shell syntax.

Usage:
  python3 scripts/d8ad-can-008-fake-server.py <port>

Then:
  AUTH_DISABLED=true BASE=http://127.0.0.1:<port> ./scripts/smoke.sh
"""

import http.server
import json
import re
import sys
import urllib.parse


# ── Shell-injection markers ─────────────────────────────────────────────────
# Every response body contains these metacharacters. If smoke.sh ever
# evaluates them as shell syntax (via bash -c, eval, etc.), the payload
# executes and creates the marker file or runs the injected command.
MALICIOUS_HOOK = (
    '$(touch /tmp/eskpi-d8ad-marker)'
    '`touch /tmp/eskpi-d8ad-marker`'
)

# ── KPI data (52 KPIs matching the finalized set) ───────────────────────────

CATEGORIES = [
    {"id": 1, "name": "Education", "slug": "education", "sort_order": 10},
    {"id": 2, "name": "Adult Programs", "slug": "adult-programs", "sort_order": 20},
    {"id": 3, "name": "Workforce Development", "slug": "workforce-development", "sort_order": 30},
    {"id": 4, "name": "Preservation", "slug": "preservation", "sort_order": 40},
    {"id": 5, "name": "Museum", "slug": "museum", "sort_order": 50},
    {"id": 6, "name": "General Awareness", "slug": "general-awareness", "sort_order": 60},
    {"id": 7, "name": "Fundraising", "slug": "fundraising", "sort_order": 70},
    {"id": 8, "name": "Economic Impact", "slug": "economic-impact", "sort_order": 80},
]

# 52 slugs arranged to match the seed's category distribution.
# smoke.sh checks these exact names by grep match on the JSON response.
KPI_DEFS = [
    # Education (6)
    ("video-views", "Video views", "views", "count"),
    ("webpage-views", "Webpage views", "views", "count"),
    ("tour-attendance", "Tour attendance", "visitors", "attendance"),
    ("self-guided-attendance", "Self-guided attendance", "visitors", "attendance"),
    ("field-trip-attendance", "Field trip attendance", "visitors", "attendance"),
    ("guided-tour-attendance", "Guided tour attendance", "visitors", "attendance"),
    # Adult Programs (4)
    ("programs-offered", "Programs offered", "programs", "count"),
    ("program-participation", "Program participation", "participants", "count"),
    ("partnerships", "Partnerships", "partners", "count"),
    ("volunteer-hours", "Volunteer hours", "hours", "count"),
    # Workforce Development (5)
    ("participants-enrolled", "Participants enrolled", "participants", "count"),
    ("participants-completing", "Participants completing", "participants", "count"),
    ("job-placement-rate", "Job placement rate", "percent", "percent"),
    ("employer-partnerships", "Employer partnerships", "partners", "count"),
    ("avg-retention-days", "Avg retention days", "days", "count"),
    # Preservation (4)
    ("percent-site-in-triage", "Percent of site in triage", "percent", "percent"),
    ("critical-repairs-completed", "Critical repairs completed", "repairs", "count"),
    ("preventative-treatments", "Preventative treatments", "treatments", "count"),
    ("historic-structures-monitored", "Historic structures monitored", "structures", "count"),
    # Museum (5)
    ("overall-museum-attendance", "Overall museum attendance", "visitors", "attendance"),
    ("exhibit-rotations", "Exhibit rotations", "rotations", "count"),
    ("collection-items-digitized", "Collection items digitized", "items", "count"),
    ("visitor-satisfaction", "Visitor satisfaction", "percent", "percent"),
    ("avg-time-on-site", "Avg time on site", "minutes", "count"),
    # General Awareness (5)
    ("media-mentions", "Media mentions", "mentions", "count"),
    ("social-media-followers", "Social media followers", "followers", "count"),
    ("website-sessions", "Website sessions", "sessions", "count"),
    ("newsletter-subscribers", "Newsletter subscribers", "subscribers", "count"),
    ("earned-media-value", "Earned media value", "USD", "currency"),
    # Fundraising (8)
    ("total-annual-budget", "Total annual budget", "USD", "currency"),
    ("funders-by-breakdown", "Number of funders by breakdown", "funders", "breakdown"),
    ("donor-categories", "First-time, returning, and lapsed donors", "donors", "breakdown"),
    ("annual-fund-revenue", "Annual fund revenue", "USD", "currency"),
    ("grant-revenue", "Grant revenue", "USD", "currency"),
    ("major-gifts", "Major gifts", "gifts", "currency"),
    ("membership-revenue", "Membership revenue", "USD", "currency"),
    ("donor-retention-rate", "Donor retention rate", "percent", "percent"),
    # Economic Impact (10) — total 46 so far, need 6 more
    ("visitor-spending", "Visitor spending", "USD", "currency"),
    ("jobs-supported", "Jobs supported", "jobs", "count"),
    ("tax-revenue-generated", "Tax revenue generated", "USD", "currency"),
    ("local-business-impact", "Local business impact", "USD", "currency"),
    ("tourism-related-employment", "Tourism-related employment", "jobs", "count"),
    ("economic-multiplier", "Economic multiplier", "ratio", "count"),
    # Fillers to reach 52
    ("education-outreach", "Education outreach", "events", "count"),
    ("adult-workshops", "Adult workshops", "workshops", "count"),
    ("preservation-funding", "Preservation funding", "USD", "currency"),
    ("community-engagement", "Community engagement", "events", "count"),
    ("digital-audience", "Digital audience", "users", "count"),
    ("operational-efficiency", "Operational efficiency", "percent", "percent"),
    ("program-quality", "Program quality score", "score", "percent"),
    ("grant-success-rate", "Grant success rate", "percent", "percent"),
    ("volunteer-retention", "Volunteer retention rate", "percent", "percent"),
]

CURRENT_ID = 1
KPIS = []
for slug, name, unit, unit_type in KPI_DEFS:
    # Determine category from position
    idx = len(KPIS)
    if idx < 6:
        cat_id = 1  # Education
    elif idx < 10:
        cat_id = 2  # Adult Programs
    elif idx < 15:
        cat_id = 3  # Workforce Development
    elif idx < 19:
        cat_id = 4  # Preservation
    elif idx < 24:
        cat_id = 5  # Museum
    elif idx < 29:
        cat_id = 6  # General Awareness
    elif idx < 37:
        cat_id = 7  # Fundraising (8)
    else:
        cat_id = 8  # Economic Impact (15)

    direction = "higher"
    if unit_type == "currency" or unit_type == "percent":
        direction = "neutral"
    if slug == "percent-site-in-triage":
        direction = "lower"

    KPIS.append({
        "id": CURRENT_ID,
        "slug": slug,
        "name": name,
        "unit": unit,
        "unit_type": unit_type,
        "reporting_frequency": "monthly" if unit_type != "breakdown" else "annual",
        "direction": direction,
        "category_id": cat_id,
        "sort_order": (idx + 1) * 10,
        "description": f"{name} — #{CURRENT_ID} {MALICIOUS_HOOK}",
    })
    CURRENT_ID += 1

# Map slug → id for quick lookups
SLUG_TO_ID = {k["slug"]: k["id"] for k in KPIS}

# ── State for POST/DELETE round-trips ──────────────────────────────────────
ENTRIES_DB: dict[int, list[dict]] = {}  # year → list of entries
BREAKDOWNS_DB: dict[int, list[dict]] = {}  # year → list of breakdowns
NEXT_ENTRY_ID = 999001
NEXT_BREAKDOWN_ID = 888001


def json_response(body: dict) -> bytes:
    """Return a JSON-serialized response with malicious hook in text fields."""
    return json.dumps(body, ensure_ascii=False).encode("utf-8")


def html_body(visible_text: str) -> str:
    """
    Return an HTML blob containing the visible_text that smoke.sh grep-searches
    for, plus the malicious hook in undisplayed content.
    """
    return (
        '<!DOCTYPE html><html><body>'
        f'<h1>{visible_text}</h1>'
        f'<p class="hidden">{MALICIOUS_HOOK}</p>'
        '</body></html>'
    )


class SmokeFakeHandler(http.server.BaseHTTPRequestHandler):
    """HTTP server that mimics the KPI dashboard's API + page surface."""

    # ── Routing ──────────────────────────────────────────────────────────

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        # Auth endpoints (minimal — AUTH_DISABLED mode doesn't hit these,
        # but the fake server needs to return something reasonable)
        if path == "/api/auth/me":
            return self._json(
                {"user": {"id": 1, "email": "auth-disabled@local", "role": "admin"}},
                headers={"Set-Cookie": "eastern_state_kpi_csrf=fake-csrf-token; Path=/; SameSite=Lax"},
            )
        if path == "/api/auth/login":
            return self._empty(200)
        if path.startswith("/login"):
            return self._html_resp(200, '<html><body>Login page</body></html>')

        # API routes
        if path == "/api/kpis":
            return self._json({"kpis": KPIS})
        if path == "/api/categories":
            return self._json({"categories": CATEGORIES})
        if path == "/api/entries/history":
            return self._json({
                "history": [
                    {"id": 1, "entry_id": 100, "action": "insert", "changed_at": "2025-01-15T10:00:00Z"}
                ]
            })
        if path == "/api/entries":
            year_str = params.get("year", [""])[0]
            if year_str:
                year = int(year_str)
                return self._json({"entries": ENTRIES_DB.get(year, [])})
            return self._json({"entries": []})
        if path == "/api/breakdowns":
            year_str = params.get("year", [""])[0]
            if year_str:
                year = int(year_str)
                return self._json({"breakdowns": BREAKDOWNS_DB.get(year, [])})
            return self._json({"breakdowns": []})

        # Dashboard pages
        if path == "/dashboard/overview":
            month = params.get("currentMonth", [None])[0]
            if month:
                month_names = {"3": "March", "11": "November"}
                mn = month_names.get(month, "January")
                text = f"Organizational Performance</h1><p>{mn} 2025 sample"
            else:
                text = "Organizational Performance</h1><p>Sample data</p><h2>Category Overview</h2>"
            return self._html_resp(200, html_body(text))

        if path.startswith("/dashboard/category/"):
            year = params.get("currentYear", [None])[0]
            compare = params.get("compareYear", [None])[0]
            month = params.get("currentMonth", [None])[0]
            if year == "2099":
                return self._html_resp(200, html_body("Category — No data available for this period"))
            return self._html_resp(200, html_body("Category page"))

        if path.startswith("/dashboard/metric/"):
            if "funders-by-breakdown" in path:
                return self._html_resp(200, html_body("Breakdown metric data"))
            return self._html_resp(200, html_body("Metric detail"))

        if path == "/dashboard/trends":
            return self._html_resp(200, html_body(
                "Y-axis mode configuration in sidebar. "
                "Options: Per-series (indexed), Per-series (log), Fixed range."
            ))

        # Admin pages
        if path.startswith("/admin/"):
            if "/history" in path:
                return self._html_resp(200, html_body("Edit history log"))
            if "/kpis" in path:
                return self._html_resp(200, html_body("Manage KPIs — Add a new KPI — Existing KPIs —"))
            return self._html_resp(200, html_body("Admin panel"))

        # Fallback
        self._empty(404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            return self._json_error(400, "Invalid JSON")

        if self.path == "/api/entries":
            global NEXT_ENTRY_ID
            entry = {
                "id": NEXT_ENTRY_ID,
                "kpi_id": data.get("kpi_id", 0),
                "year": data.get("year", 2099),
                "month": data.get("month", 1),
                "value": data.get("value", 0),
                "updated_by": 1,
                "description": MALICIOUS_HOOK,
            }
            year = entry["year"]
            ENTRIES_DB.setdefault(year, []).append(entry)
            NEXT_ENTRY_ID += 1
            return self._empty(201)

        if self.path == "/api/breakdowns":
            global NEXT_BREAKDOWN_ID
            bd = {
                "id": NEXT_BREAKDOWN_ID,
                "kpi_id": data.get("kpi_id", 0),
                "year": data.get("year", 2099),
                "label": data.get("label", "Test row"),
                "value": data.get("value", 0),
                "updated_by": 1,
                "description": MALICIOUS_HOOK,
            }
            year = bd["year"]
            BREAKDOWNS_DB.setdefault(year, []).append(bd)
            NEXT_BREAKDOWN_ID += 1
            return self._empty(201)

        # Auth login
        if self.path == "/api/auth/login":
            return self._empty(200)

        return self._empty(404)

    def do_DELETE(self):
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            return self._json_error(400, "Invalid JSON")

        entry_id = data.get("id")
        if entry_id:
            # Remove from any year's entries
            for year in list(ENTRIES_DB.keys()):
                ENTRIES_DB[year] = [e for e in ENTRIES_DB[year] if e["id"] != entry_id]
            for year in list(BREAKDOWNS_DB.keys()):
                BREAKDOWNS_DB[year] = [b for b in BREAKDOWNS_DB[year] if b["id"] != entry_id]

        return self._empty(200)

    # ── Response helpers ─────────────────────────────────────────────────

    def _json(self, data: dict, headers: dict[str, str] | None = None):
        """Send a JSON response (with shell hook embedded in string values)."""
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _html_resp(self, code: int, body_text: str):
        """Send an HTML response."""
        body = body_text.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _empty(self, code: int):
        self.send_response(code)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _json_error(self, code: int, msg: str):
        body = json.dumps({"error": msg}).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # quieter


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <port>", file=sys.stderr)
        sys.exit(1)
    port = int(sys.argv[1])
    server = http.server.HTTPServer(("127.0.0.1", port), SmokeFakeHandler)
    print(f"[d8ad-can-008 fake server] 127.0.0.1:{port}", file=sys.stderr)
    server.serve_forever()


if __name__ == "__main__":
    main()
