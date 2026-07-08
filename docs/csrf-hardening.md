# CSRF Hardening (D8AD-CAN-004)

This document records the security assumptions and controls behind the
shared request guard that protects every cookie-authenticated
administrative mutation in the Eastern State KPI dashboard.

## Threat model and disposition

D8AD-CAN-004 established that, under the documented Fly.io deployment,
the application is **not cross-site CSRF-exploitable** but is
**conditionally exploitable** if an attacker can obtain a same-site
sibling origin (a subdomain of the operator's registrable domain) and
send a `Content-Type: text/plain` request whose body is valid JSON —
because the baseline handlers called `req.json()` (which parses JSON
regardless of `Content-Type`) and had no Origin/CSRF check.

This hardening closes that conditional **regardless of the final
exploitability classification**: it does not rely on the
`*.fly.dev` Public Suffix List property that makes a same-site sibling
unobtainable in the documented deployment. The three layered controls
below each independently suffice to stop the `text/plain` same-site forge.

## The shared request guard

`src/lib/request-guard.ts` exports `assertMutationRequest(req)`, invoked
by every in-scope handler **after authorization** has run:

```
1. requireAdmin / requireSession          → 401 / 403 (authz)
2. assertMutationRequest(req)
   2a. Origin / Referer same-origin check  → 403 (csrf-origin)
   2b. exact application/json content-type → 415 (unsupported-media-type)
   2c. double-submit CSRF token            → 403 (csrf-token)
3. req.json() → zod safeParse             → 400 / 2xx
```

Authorization runs first by design: an unauthenticated forge receives
a 401, an authenticated-but-unauthorized forge receives a 403 authz,
and only an authenticated-and-authorized forge reaches the CSRF layer.
The three CSRF failure reasons (`origin-*`, `bad-content-type`,
`csrf-token-*`) are emitted as distinct `[csrf] <reason>` lines in
**server logs** but all return a generic `{error:"Forbidden"}` (403) or
`{error:"Unsupported Media Type"}` (415) to the client, so a client
cannot probe the boundary more precisely than the HTTP status. This
keeps authorization and CSRF failures distinguishable to operators
without leaking detail to attackers (req 8).

### 1. Origin / Referer (req 1, 2, 3)

- The allowed origin set is `APP_CANONICAL_ORIGIN` (comma-separated) if
  set; otherwise the guard derives the request's own origin from
  `req.nextUrl`, honoring `x-forwarded-proto` / `x-forwarded-host` only
  when `TRUST_PROXY=true` (the same trust boundary the login throttle
  uses for `x-forwarded-for`). This zero-config default is secure: a
  forged request from any other origin — cross-site **or** same-site
  sibling — has a non-matching `Origin` and is rejected.
- `Origin` present and same-origin → allowed.
- `Origin: null` (opaque, e.g. sandboxed iframe / `data:` URL) →
  rejected (`origin-opaque`).
- Malformed `Origin` → rejected (`origin-malformed`).
- `Origin` missing → fall back to `Referer` (req 3): if `Referer` is
  present and its origin matches, allow; otherwise reject. A
  well-behaved same-origin browser mutation always sends at least one
  of `Origin`/`Referer`, so missing both → reject (`origin-missing`).
  `Referer` is **only** a fallback, never a substitute when `Origin` is
  present.
- A same-site-sibling attacker has a *different origin* (different
  host), so its `Origin` is rejected here even though it is the same
  *site*. This is the control that closes the D8AD-CAN-004 conditional
  without relying on the PSL property.

### 2. Exact `application/json` content-type (req 4, 5)

- The request body's media type (the token before any `;` parameters)
  must be exactly `application/json`. `application/json; charset=utf-8`
  is accepted (parameters are ignored).
- `text/plain`, `application/x-www-form-urlencoded`,
  `multipart/form-data`, missing, and any other media type → `415
  Unsupported Media Type`. This closes the `text/plain` JSON-body
  bypass: even if `Origin` were somehow stripped or misconfigured, the
  body is never parsed.

### 3. Double-submit CSRF token (req 6)

- On successful login (`/api/auth/login`) and on every `/api/auth/me`
  call, the server sets a host-only, non-`HttpOnly`, `SameSite=Lax`
  cookie `eastern_state_kpi_csrf` with a 256-bit random value.
  `/api/auth/me` is a safe read that bootstraps the cookie for sessions
  established before this hardening shipped and for the `AUTH_DISABLED`
  dev bypass (which has no login flow).
- The client (`src/lib/api-client.ts` `apiFetch`) reads that cookie and
  echoes its value in the `X-CSRF-Token` header on every mutation. If
  the cookie is missing, `apiFetch` first calls `/api/auth/me` once and
  then retries the cookie read before sending the guarded write. The
  guard compares header to cookie in constant time.
- A cross-site **or same-site-sibling** attacker cannot read the
  host-only cookie (different origin → no cookie access) and cannot set
  it (host-only, no `Domain` attribute, so a sibling subdomain's
  `Set-Cookie` cannot write it). It therefore cannot forge the header.
- This layer is defense-in-depth: it does not rely on `Origin` being
  present or correct (e.g. an upstream proxy that strips it), and it
  fully closes the same-site-sibling case if the operator ever deploys
  under a custom apex where a sibling subdomain becomes obtainable.

## In-scope and out-of-scope endpoints (req 7)

In scope (the guard runs on every state-changing handler):

| Endpoint | Methods |
|---|---|
| `/api/users` | POST, PATCH, DELETE |
| `/api/users/account` | PATCH |
| `/api/auth/change-password` | POST |
| `/api/entries` | POST, DELETE |
| `/api/breakdowns` | POST, DELETE |
| `/api/kpis` | POST, PATCH, DELETE |
| `/api/categories` | POST, PATCH, DELETE |
| `/api/goals` | POST, PATCH, DELETE |

Out of scope (deliberate, documented exclusions):

- `GET /api/auth/me` — minimum auth/CSRF-bootstrap read route
  list/detail reads.
  No state-changing `GET` exists; were one added, it would join the
  in-scope list.
- `POST /api/auth/login` — the credential entry point; it is not
  cookie-authenticated (no session to forge against) and is throttle-
  gated. CSRF protection of login is out of scope (login CSRF would
  force-login a victim, which is not the D8AD-CAN-004 administrative-
  mutation threat). Login does, however, *issue* the CSRF cookie on
  success.
- `POST /api/auth/logout` — a low-impact session end (forced-logout
  CSRF), not an administrative mutation. Excluded to keep the change
  focused; the session cookie's `SameSite=Lax` already bounds the
  exposure to same-site-sibling top-level forms, and logout carries no
  data-integrity consequence.

## Security assumptions (req 10)

### SameSite cookies

- The session cookie is host-only (no `Domain`), `Path=/`, `HttpOnly`,
  `SameSite=Lax`, `Secure` in production. `SameSite=Lax` suppresses
  the cookie on cross-site subresource requests (the dominant CSRF
  vector) while permitting top-level GET navigations. The CSRF cookie
  mirrors this posture but is non-`HttpOnly` so the client's own JS can
  read it to echo in the header.
- `SameSite=Lax` is treated as a defense-in-depth transport property,
  not the primary CSRF control. The guard's Origin/Referer and
  double-submit checks are the primary controls and remain effective
  even if a future deployment relaxes `SameSite`.

### Subdomains and the Public Suffix List

- Under the documented Fly.io deployment, the app is served at
  `https://eastern-state-kpi-dashboard.fly.dev`. `fly.dev` is a Public
  Suffix List entry, so each `<app>.fly.dev` is its own registrable
  domain; an attacker with their own Fly app (`evil.attacker.fly.dev`)
  is **cross-site**, and no same-site sibling of the app exists.
- The conditional exploit requires an attacker-controlled subdomain of
  the operator's registrable domain. That is **not** obtainable on
  `*.fly.dev`; it becomes reachable only if the operator deploys under
  a custom apex (e.g. `kpi.easternstate.org`) and an attacker can
  create a sibling subdomain via DNS compromise, wildcard-DNS
  misconfiguration, a dangling-CNAME subdomain takeover, or a
  compromised adjacent app on the same apex. The double-submit token
  closes this case independently of Origin.

### Proxies and canonical origins

- Fly terminates TLS and forwards to the app over HTTP, with
  `force_https=true` and `TRUST_PROXY=true` (fly.toml). The guard
  honors `x-forwarded-proto`/`x-forwarded-host` **only** when
  `TRUST_PROXY=true`, mirroring the login throttle's trust boundary.
  These headers are attacker-controllable on a bare origin, so
  `TRUST_PROXY` must be set only behind a sanitizing reverse proxy
  (Fly's proxy overwrites them).
- For production, set `APP_CANONICAL_ORIGIN` explicitly (see fly.toml)
  so the allowed-origin set is a fixed literal rather than derived from
  request headers. This removes all ambiguity and is the recommended
  configuration. When unset, the guard falls back to the request's own
  origin, which is secure but less explicit.

### Canonical origin configuration

- `APP_CANONICAL_ORIGIN`: comma-separated list of allowed origins
  (e.g. `https://eastern-state-kpi-dashboard.fly.dev`). Optional but
  recommended for production.
- CSRF cookie name: fixed as `eastern_state_kpi_csrf` in both the server
  guard and browser bundle. Keep it fixed unless the server/client
  double-submit path is redesigned together.
- `SESSION_SECURE`: governs the `Secure` flag on both the session and
  CSRF cookies (`true` in production; `false` only for local HTTP
  testing). Orthogonal to `SameSite` and to the guard.

### Authorization vs. CSRF distinguishability

- 401 (`Unauthorized`) = no valid session. 403 (`Forbidden`) = either
  insufficient role (authz) or a CSRF failure (origin/token). 415
  (`Unsupported Media Type`) = wrong content-type. To the client these
  are distinguishable only by HTTP status; the precise CSRF reason is
  server-log-only (`[csrf] origin-mismatch`, `[csrf] csrf-token-missing`,
  etc.), satisfying req 8.

## Reproducing / testing

- `src/lib/csrf-hardening.test.ts` exercises every in-scope handler
  with positive (valid Origin + JSON + token → 2xx) and
  negative (cross-site Origin, same-site-sibling Origin, `text/plain`,
  urlencoded, multipart, missing/mismatched token, missing/opaque
  Origin, Referer fallback accept/reject) cases, plus unit tests for
  the guard functions.
- The existing auth-regression / auth-workflow / session-revocation
  suites send the CSRF-passing headers by default
  (`src/lib/auth-regression-helpers.ts` `dispatch` and the per-file
  `jsonReq` helpers), so the authorization matrix is exercised
  unchanged beneath the guard.
- `scripts/smoke.sh` fetches the CSRF cookie from `/api/auth/me` and
  sends `Origin` + `X-CSRF-Token` on every curl POST/DELETE round-trip,
  including the `AUTH_DISABLED=true` bypass smoke path where there is no
  session cookie.

## Remediation summary

1. Origin/Referer same-origin check on every mutation.
2. Exact `application/json` content-type required (closes `text/plain`).
3. Double-submit CSRF token (defense-in-depth, closes same-site-sibling
   without relying on Origin or on the `*.fly.dev` PSL property).
4. Keep the host-only `SameSite=Lax` session cookie.
5. If deploying under a custom apex, treat subdomain hygiene (no
   wildcard DNS, no dangling CNAMEs) as a security dependency — and
   set `APP_CANONICAL_ORIGIN` explicitly.
