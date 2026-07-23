# Production readiness and observability

This runbook defines the production readiness contract, the operator-visible
signals built from it, and the external alerting actions that remain subject to
operator approval.

## Readiness contract

`GET /api/health/ready` is the only unauthenticated operational endpoint. It
returns one of two exact JSON bodies:

```json
{"status":"ready"}
```

with HTTP 200, or:

```json
{"status":"unavailable"}
```

with HTTP 503. Both responses are `no-store`.

The probe opens the configured SQLite file through an independent read-only
connection. It never calls the application `getDb()` boundary, creates a
database, migrates, seeds, initializes, or writes a readiness row. A ready
result proves:

- the configured database file exists and can be opened by this process;
- SQLite's bounded quick integrity check succeeds;
- the schema version exactly matches the application;
- every required application table is present;
- no production migration or one-time database-authority initialization is
  pending; and
- an active Organization, active Strategic Plan, active Strategic Priority,
  and active Measure are connected.

The response never varies by failure reason. It does not expose accounts,
Organization or Strategic Plan content, row counts, paths, schema details,
exceptions, stacks, secrets, `AUTH_DISABLED`, cookies, credentials, or session
state. The endpoint imports no session or auth-bypass code. All product pages
and protected APIs retain their existing authentication and authorization
gates.

`npm run db:migrate` commits
`meta.production_migration_state = in_progress` before migration work and
removes it only after schema and required content initialization complete.
Readiness fails closed while that marker exists. A failed or interrupted
migration therefore cannot be reported as ready; rerun the documented
migration after investigating and restoring from backup when necessary.
Production startup runs the same read-only preflight after its seed/migration
decision and refuses to launch Next.js when it is not ready. Startup failures
emit only a bounded `startup_failure` reason; raw SQLite/filesystem exceptions
are not written by this boundary.

## Fly health check

`fly.toml` configures a service-level HTTP check:

| Setting | Value | Reason |
| --- | --- | --- |
| Path | `/api/health/ready` | Exercises process-to-SQLite readiness, not only TCP reachability |
| Grace period | 30 seconds | Allows volume mount and bounded startup initialization before the first verdict |
| Interval | 15 seconds | Detects a sustained failure promptly without making SQLite a high-frequency probe |
| Timeout | 2 seconds | Exceeds the probe's 250 ms lock wait while remaining below the check interval |
| Protocol | internal HTTP with `X-Forwarded-Proto: https` | Avoids the external HTTPS redirect while retaining `force_https` |

A failing service check removes the Machine from Fly proxy routing and can halt
or roll back an unhealthy deployment. It does not restart the Machine. This app
currently runs one always-on Machine, so a readiness failure intentionally
fails closed rather than serving from an incompatible or partially initialized
database.

Inspect the current signal without changing infrastructure:

```bash
fly checks list --app eastern-state-kpi-dashboard
curl -fsS https://eastern-state-kpi-dashboard.fly.dev/api/health/ready
```

## Structured application events

Production events are one-line JSON on stdout/stderr and are visible in
`fly logs`, the Fly dashboard log viewer, and Fly's log search. Only bounded
fields are emitted:

| Event | Level | Actionable fields |
| --- | --- | --- |
| `startup` | info | `phase` |
| `startup_failure` | error | bounded `reason`, optional process `exit_code` |
| `migration` | info | `phase` |
| `migration_failure` | error | `reason`, optional process `exit_code` |
| `readiness_failure` | error | bounded `reason` code |
| `unexpected_server_error` | error | method, route template, route/render phase |

Exception messages, stacks, request URLs and query strings, headers, cookies,
bodies, database paths, and user/session data are never serialized by this
logging boundary.

Use:

```bash
fly logs --app eastern-state-kpi-dashboard
```

and filter for the JSON `event` field. For a readiness failure, correlate the
bounded reason with `fly checks list`, Machine status, volume status, the most
recent deployment, and the migration backup/rehearsal evidence. Do not add raw
exception logging as an investigation shortcut.

## Warning, rollback, and incident conditions

Warning:

- one readiness check failure followed by recovery;
- an isolated `unexpected_server_error` with no repeated user-facing failure;
- startup exceeds the normal range but becomes ready within the 30-second grace
  period.

Investigate the deployment, Machine resources, volume, and recent logs. Record
the time, release, Machine, bounded event, and recovery evidence.

Rollback:

- a new release remains unready for two consecutive checks after the grace
  period;
- server-error events begin with the new release and affect a primary workflow;
- local/container validation was green but the Fly Machine cannot open the
  mounted database.

Stop the rollout and restore the prior application release. Restore the SQLite
backup as well only when the migration or post-deploy writes must be discarded;
never attempt an in-place schema downgrade.

Incident:

- readiness remains unavailable for 60 seconds or more;
- `migration_failure`, `migration_in_progress`,
  `database_incompatible`, or persistent `database_unavailable` is observed;
- the login wall or any authorization boundary is bypassed;
- a readiness response or operational log exposes protected data or secrets;
- repeated unexpected server errors prevent Overview, Data Entry, Reports, or
  Setup from functioning.

Keep the app failed closed, preserve logs and the database/volume, notify the
designated operator, and follow the backup/rollback and private security
reporting procedures as applicable.

## Alerting path requiring approval

Repository configuration alone provides routing health and operator-visible
logs; Fly does not provide built-in metrics alert notifications. The minimal
external path to activate after operator approval is:

1. Configure an independent HTTPS uptime monitor to request
   `/api/health/ready` every 60 seconds, alert the designated operator after two
   consecutive non-200 responses, and send a recovery notification.
2. Connect Fly's Prometheus endpoint to an external or self-hosted Grafana (or
   Prometheus/Alertmanager) and alert on sustained unhealthy Machine/service
   signals to the same contact point.
3. If server-error notifications are required, deploy/configure a Fly Log
   Shipper to the approved logging provider and alert on
   `startup_failure`, `migration_failure`, repeated `readiness_failure`, and
   repeated `unexpected_server_error` events.

These steps create or change external infrastructure, tokens, destinations,
and notification policy. They are intentionally not performed by this change.
