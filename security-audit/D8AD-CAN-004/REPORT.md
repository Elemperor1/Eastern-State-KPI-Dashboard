# D8AD-CAN-004 — Browser-Level CSRF Validation

## Disposition

**CONDITIONALLY EXPLOITABLE — NOT exploitable under the documented Fly.io
deployment.**

Under the operator's documented deployment (`fly.toml`:
`app = "eastern-state-kpi-dashboard"`, served at
`https://eastern-state-kpi-dashboard.fly.dev`, `force_https=true`,
`SESSION_SECURE=true`, `AUTH_DISABLED=false`), an attacker **cannot** obtain a
same-site sibling origin, so **no cross-site CSRF vector lands any mutation**.
This was proven empirically with a real Chromium against every mutation route
across seven request vectors (run 3, `csrf_results.json`, 40 records):

- **Cross-site attacker (`evil.attacker.fly.dev`): 0 / 20 mutations land.**
  SameSite=Lax suppresses the cookie on every cross-site subresource request;
  `fetch` with `application/json` is further blocked by a CORS preflight the
  baseline app never answers with `Access-Control-Allow-Origin`.

- **Same-site-sibling attacker (`evil.eastern-state-kpi-dashboard.fly.dev`):
  10 / 20 mutations land** — `Content-Type: text/plain` carrying a JSON body,
  via both `fetch` and a 307 redirect, against **all 5 mutation routes**
  (`/api/users`, `/api/entries`, `/api/breakdowns`, `/api/kpis`,
  `/api/categories`). Server-side ground truth confirmed (a new user row with
  the attacker's unique marker was created with `id=9`).

The same-site-sibling case is the conditional: it requires the attacker to
control a subdomain of the operator's registrable domain. That is **not
obtainable on `*.fly.dev`** because `fly.dev` is on the Public Suffix List
(each `<app>.fly.dev` is its own registrable domain/site). It becomes live
only if the operator deploys the app under a custom apex (e.g.
`kpi.easternstate.org`) and the attacker can create a sibling subdomain
(`evil.easternstate.org`) — via DNS compromise, a wildcard-DNS misconfiguration,
a subdomain takeover, or a compromised adjacent app on the same apex.

The root cause is independent of domain model: the baseline routes have **no
Origin/CSRF check** and call `req.json()`, which parses a JSON body **regardless
of `Content-Type`**. `text/plain` is a CORS-safelisted "simple" content type
(no preflight), so a same-site-sibling page can send a forged `text/plain`
request whose body is valid JSON; the cookie is attached (same-site), no
preflight occurs, and the body parses. `application/x-www-form-urlencoded` and
`multipart/form-data` are also safelisted but do **not** land here because the
harness sends real urlencoded/multipart bodies (not JSON) and `req.json()`
then throws → `catch(()=>({}))` → zod `safeParse` fails → 400.

## Requirements traceability

| # | Requirement | Evidence |
|---|---|---|
| 1 | Inventory origin + cookie attributes | `fly.toml`; `session.ts` (baseline == working tree); browser-view cookie dump in `csrf_results.json` run log: `domain=app.eastern-state-kpi-dashboard.fly.dev`, `path=/`, `secure=false`(local-only; `true` in prod), `httpOnly=true`, `sameSite=Lax`, no `Domain` (host-only). |
| 2 | Same-site attacker surface | PSL lookup: `fly.dev` is a public suffix → no same-site sibling exists under the documented deployment. Conditional paths documented (custom-apex subdomain, wildcard DNS, subdomain takeover, compromised adjacent app). No stored HTML-injection surface found in baseline routes. |
| 3 | Real browser automation vs all 5 mutation routes | `run_csrf.py` (Playwright/Chromium 131) drives `/api/users`, `/api/entries`, `/api/breakdowns`, `/api/kpis`, `/api/categories` from both cross-site and same-site-sibling origins. |
| 4 | Vectors: form, fetch, text/plain, urlencoded, multipart, redirects, ±Origin | 7 vectors per `/api/users` (fetch-json, fetch-text-plain, fetch-urlencoded, fetch-multipart, form-urlencoded, form-text-plain, redirect-307) + 3 key vectors (fetch-json, fetch-text-plain, redirect-307) for the other 4 routes, ×2 scenarios + top-level GET nav. Origin header presence is browser-determined (omitted on same-site GET nav, present on cross-site; never weakening). |
| 5 | Record cookie attachment + mutation success | `csrf_results.json`: per-record `cookie_attached`, `cookie_attached_basis`, `mutation_landed`, `server_marker` (authoritative server-side check of the unique marker), `response_status`, `preflight_seen`, `req_content_type`, `payload`. |
| 6 | Do not weaken browser security | No `--disable-web-security`, no `--ignore-certificate-errors`, no SameSite/cookie relaxation. `--host-resolver-rules` only maps test hostnames to loopback (DNS concern; does not alter same-site computation). `SESSION_SECURE=false` is transport-only and orthogonal to SameSite (documented in `start_app.sh`). |
| 7 | Clear disposition | **Conditionally exploitable; not exploitable under documented deployment.** See above. |
| 8 | Reproducible fixtures + environmental assumptions | `fixtures/` (harness scripts + `csrf_results.json`); "Environmental assumptions" section below. |

## Empirical results (run 3)

```
cross-site|/api/users|fetch-json|application/json              -> cookie=None  landed=False  (CORS preflight, no ACAO)
cross-site|/api/users|fetch-text-plain|text/plain             -> cookie=False landed=False
cross-site|/api/users|fetch-urlencoded|application/x-www-...  -> cookie=False landed=False
cross-site|/api/users|fetch-multipart|multipart/form-data      -> cookie=False landed=False
cross-site|/api/users|form-submit|application/x-www-form-...   -> cookie=False landed=False (403)
cross-site|/api/users|form-submit|text/plain                   -> cookie=False landed=False (403)
cross-site|/api/users|redirect-307|text/plain                  -> cookie=False landed=False
cross-site|/api/{entries,breakdowns,kpis,categories}|*          -> cookie=False/None landed=False (all)
cross-site|top-level-GET-nav|/api/users -> cookie=True status=200 (Lax sends cookie on top-level GET; GET is read-only)

same-site-sibling|/api/users|fetch-json|application/json        -> cookie=None  landed=False  (CORS preflight)
same-site-sibling|/api/users|fetch-text-plain|text/plain        -> cookie=True  landed=True   ← EXPLOIT
same-site-sibling|/api/users|fetch-urlencoded|urlencoded        -> cookie=True  landed=False (real urlencoded body, not JSON)
same-site-sibling|/api/users|fetch-multipart|multipart          -> cookie=True  landed=False (real multipart body, not JSON)
same-site-sibling|/api/users|form-submit|urlencoded             -> cookie=True  landed=False (400)
same-site-sibling|/api/users|form-submit|text/plain              -> cookie=True  landed=False (400)
same-site-sibling|/api/users|redirect-307|text/plain            -> cookie=True  landed=True   ← EXPLOIT
same-site-sibling|/api/{entries,breakdowns,kpis,categories}|fetch-text-plain|text/plain  -> landed=True (all) ← EXPLOIT
same-site-sibling|/api/{entries,breakdowns,kpis,categories}|redirect-307|text/plain     -> landed=True (all) ← EXPLOIT
```

Summary counts: cross-site **0/20** land; same-site-sibling **10/20** land
(text/plain + redirect-307 on all 5 routes).

### Why each vector lands or not

- **fetch-json (`application/json`)** — Not a CORS-safelisted content type →
  browser sends an `OPTIONS` preflight. Baseline app returns no
  `Access-Control-Allow-Origin`, so the preflight fails and the actual
  request is never transmitted. `landed=False` in **both** scenarios (the
  same-site-sibling attacker is still a different *origin*, so CORS applies;
  same-site ≠ same-origin). This is why the exploit is **not** reachable via
  the obvious `application/json` path.
- **fetch-text-plain (`text/plain`, JSON body)** — CORS-safelisted → no
  preflight. Cookie attached on same-site (suppressed cross-site by Lax).
  Baseline `req.json()` parses the JSON body despite `Content-Type: text/plain`
  → zod accepts → **mutation lands**. This is the core exploit.
- **fetch-urlencoded / fetch-multipart (real non-JSON bodies)** — Safelisted,
  cookie attached same-site, but the body is genuinely urlencoded/multipart,
  so `req.json()` throws → `catch(()=>({}))` → safeParse fails → 400. Do not
  land. (An attacker could try to smuggle JSON inside a urlencoded field, but
  `new URLSearchParams(obj).toString()` produces `key=value&...`, which
  `JSON.parse` rejects.)
- **form-submit (real form, hidden iframe)** — Browser-generated urlencoded
  or text/plain body. Cross-site: 403 (cookie suppressed). Same-site: 400
  (cookie attached but body not JSON). Does not land.
- **redirect-307 (`text/plain`, JSON body)** — The attacker page fetches its
  own `/redirect307?to=<app>`, which returns `307` preserving method+body+
  `Content-Type`. The browser follows it to the app with the JSON body still
  intact. Same-site → cookie attached → **mutation lands**. Cross-site →
  cookie suppressed → does not land.
- **top-level GET navigation** — Lax sends the cookie on a top-level
  cross-site GET, but the app's GET handlers are read-only (list endpoints);
  no mutation. Confirms Lax semantics and that the cookie is real.

### Authoritative ground truth

The `mutation_landed` field is **not** inferred from JS-visible status (CORS
makes cross-origin responses opaque). It is the result of an independent
server-side check from the authenticated admin context (same-origin → cookie
always sent) for the attack's unique marker (e.g. the new user's email
`csrf-same-site-sibling-fetch-text-plain-<nonce>@attacker.test`). For the
landed same-site `text/plain` `/api/users` case the server returned
`server_marker = {"landed": true, "detail": 9}` — a real user row was
created with `id=9`. For the cross-site counterpart
`server_marker = {"landed": false, "detail": null}` — no row.

## Root cause (baseline revision ea7263d)

`src/app/api/{users,entries,breakdowns,kpis,categories}/route.ts`:
every mutation handler is `await requireAdmin(); const parsed =
<Schema>.safeParse(await req.json().catch(() => ({})));` with **no** Origin /
Sec-Fetch-Site / CSRF-token check. `req.json()` parses the request body as
JSON **regardless of the request's `Content-Type`**, so a `text/plain` body
carrying JSON is accepted. Combined with a host-only `SameSite=Lax` cookie
(which is sent on same-site requests, including same-site-sibling
subresources), a same-site-sibling page can forge a mutating request without
a preflight.

## Remediation

1. **Verify Origin / Sec-Fetch-Site on every state-changing request.** Reject
   when `Sec-Fetch-Site` is `cross-site` (or, where the header is absent,
   require an explicit `Origin`/`Referer` allow-list match to the app origin).
   This is the standard CSRF defense and closes the `text/plain` path.
2. **Do not rely on `Content-Type: application/json` as a CSRF barrier.** It
   raises the bar (preflight) but is bypassable under a same-site-sibling
   attacker via `text/plain`, so it must not be the only control.
3. **Optionally** add a double-submit or synchronizer CSRF token for
   defense-in-depth, especially if a custom apex domain is ever adopted
   (which would make the same-site-sibling case reachable).
4. Keep `SameSite=Lax` (or tighten to `Strict` for the session cookie if the
   UX permits) and the host-only (no `Domain`) cookie; both are correct today.
5. If deploying under a custom apex, treat subdomain hygiene (no wildcard DNS,
   no dangling CNAMEs) as a security dependency.

## Environmental assumptions

- **Behavioral baseline:** revision `ea7263d5c5d908a88398ee4ce0217337e429ad5e`
  (HEAD of `master`). A fresh git worktree at `/tmp/eskpi-baseline` was used
  to run the app; the CSRF-relevant code (cookie options in `session.ts`, the
  five mutation route handlers, absence of any Origin/CSRF gate) was verified
  byte-identical between the working tree and the baseline via `git diff`.
- **Production origin:** `https://eastern-state-kpi-dashboard.fly.dev`
  (`fly.toml`: `app = "eastern-state-kpi-dashboard"`, `force_https=true`).
- **Cookie:** `eastern_state_kpi_session`, host-only (no `Domain`),
  `Path=/`, `HttpOnly=true`, `SameSite=Lax`, `Secure` (true in prod via
  `SESSION_SECURE=true`; `false` locally only so the Secure cookie can be
  set/sent over HTTP — orthogonal to SameSite, see `start_app.sh`).
- **PSL fact:** `fly.dev` is a Public Suffix List entry, so
  `eastern-state-kpi-dashboard.fly.dev` is a registrable domain in itself and
  `evil.eastern-state-kpi-dashboard.fly.dev` is a **same-site sibling** of it
  (same registrable domain) — this models the *conditional* custom-apex
  scenario, not the real `*.fly.dev` deployment. `evil.attacker.fly.dev` has a
  different registrable domain (`attacker.fly.dev`) → cross-site.
- **Browser:** Chromium 131 (Playwright cache build 1148). Launched with
  `--host-resolver-rules` mapping the three test hostnames to `127.0.0.1`.
  No security-weakening flags. Same-site computation is derived by the
  browser from the URL + the Public Suffix List, not from resolver rules.
- **Local transport:** HTTP on loopback. `SESSION_SECURE=false` is the only
  prod/local divergence and is transport-only; SameSite=Lax cross-site
  sending behavior is identical over HTTP and HTTPS.
- **Auth:** `AUTH_DISABLED` unset (auth wall up). Admin
  `kerry@easternstate.org` password set deterministically to
  `CsrfTest-AdminPass-123!` via `set_admin_password.mjs` (bcrypt rounds 10,
  matching baseline `SALT_ROUNDS`). This reproduces a logged-in admin's
  host-only session cookie without altering any CSRF-relevant control.
- **DB:** fresh SQLite (`/tmp/eskpi-baseline-data/kpi.db`) reseeded each run
  (`npm run db:seed`) for deterministic markers.

## Reproducing

```sh
cd /path/to/Eastern-State-KPI-Dashboard
bash security-audit/D8AD-CAN-004/fixtures/run_harness.sh
# results: security-audit/D8AD-CAN-004/fixtures/csrf_results.json
```

Prerequisites: a git worktree of revision `ea7263d` at `/tmp/eskpi-baseline`
with `npm install` run and Python 3 with `playwright` installed. Playwright's
managed Chromium is used by default; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` only
when an explicit browser binary is required.

## Fixtures

- `run_harness.sh` — orchestrator (start app + attacker, health-check, drive, teardown).
- `start_app.sh` — boots the baseline app (auth up, host-only Lax cookie, fresh DB).
- `set_admin_password.mjs` — deterministically sets the seeded admin's password.
- `attacker_server.py` — attacker HTTP origin (`/attack`, `/redirect307`, `/result`, `/results`, `/healthz`).
- `run_csrf.py` — Playwright driver; logs in, fires every vector × scenario, writes `csrf_results.json`.
- `csrf_results.json` — 40-record ground-truth artifact from run 3.
