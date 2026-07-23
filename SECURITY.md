# Security Policy

## Supported version

Security fixes target the current `master` branch and the production deployment
built from it. Older revisions and local development-only configurations are not
maintained as separate supported releases.

## Report a vulnerability privately

Do not open a public issue for a suspected vulnerability. Use this repository's
[private vulnerability reporting form](https://github.com/Elemperor1/Eastern-State-KPI-Dashboard/security/advisories/new).

Include the affected route or component, the required preconditions, impact,
reproduction steps, and any suggested remediation. Avoid including real Eastern
State credentials, production data, or visitor information in a report.

## Scope

The production application, authentication and authorization boundaries,
production data handling, `Dockerfile`, deployment configuration, and GitHub
Actions supply chain are in scope. Tests, fixtures, sample data, and the
development-only `AUTH_DISABLED` path are not production vulnerabilities unless
they can escape their documented isolation or affect a production artifact.

`GET /api/health/ready` is an intentional unauthenticated exception to the
production auth wall. Its response is limited to `{"status":"ready"}` or
`{"status":"unavailable"}` and must never expose accounts, installation or
Strategic Plan content, row counts, paths, schema details, exceptions, stacks,
secrets, auth-bypass state, credentials, cookies, or sessions. Report any
deviation privately using the process above.

Reports are evaluated against the current production path. A dependency or base
image advisory is actionable when the affected operation is reachable or a
supported fixed version is available; unfixed or unreachable advisories remain
visible in security artifacts without being treated as exploitable application
vulnerabilities.
