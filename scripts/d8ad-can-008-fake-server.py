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

NEXT_ENTRY_ID = 999001
NEXT_BREAKDOWN_ID = 888001

CATALOG_TEXT = (
    "Manage KPIs — Add a new KPI — Existing KPIs — "
    "Showing 59 of 59 measures across 5 categories — "
    "Reimagine Visitor Experience — Advance Historic Preservation — "
    "Expand Workforce Development — Support Learning through Justice Education — "
    "Enhance Organizational Capacity — Interpretive Site Plan — "
    "Modernized Exhibits — Conservation Management Plan — "
    "Total participants in justice education — Board participation in annual giving — "
    "Revenue Diversification — Climate-Responsive Solutions"
)


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
            if "revenue-by-stream" in path:
                return self._html_resp(200, html_body("Breakdown metric data"))
            return self._html_resp(200, html_body("Metric detail"))

        if path == "/dashboard/trends":
            return self._html_resp(200, html_body(
                "No monthly KPIs in this category."
            ))

        # Admin pages
        if path.startswith("/admin/"):
            if "/history" in path:
                return self._html_resp(200, html_body("Edit history log 2099 Deleted"))
            if "/kpis" in path:
                return self._html_resp(200, html_body(CATALOG_TEXT))
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
            NEXT_ENTRY_ID += 1
            return self._json({"entry": entry}, code=201)

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
            NEXT_BREAKDOWN_ID += 1
            return self._json({"breakdown": bd}, code=201)

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

        return self._empty(200)

    # ── Response helpers ─────────────────────────────────────────────────

    def _json(self, data: dict, headers: dict[str, str] | None = None, code: int = 200):
        """Send a JSON response (with shell hook embedded in string values)."""
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
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
