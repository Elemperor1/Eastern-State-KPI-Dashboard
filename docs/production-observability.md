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
- the connection can execute a cheap liveness read against the file;
- the schema version exactly matches the application;
- every required application table is present;
- no production migration or one-time database-authority initialization is
  pending; and
- an active Organization, active Strategic Plan, active Strategic Priority,
  and active Measure are connected.

Full-database integrity scanning (`PRAGMA quick_check`) is deliberately
**not** part of this probe (S008-C1): the endpoint is anonymous,
unthrottled, and polled by Fly on a fixed interval, so a synchronous
integrity scan on this path would let unauthenticated traffic force
expensive database I/O on demand. Integrity scanning lives in a separate
deep probe, `checkDatabaseIntegrity` (`src/features/health/readiness.ts`),
intended for scheduled or operator-invoked checks; it is read-only,
bounded by the same 250 ms lock budget, and returns a constant-shape
result with no raw SQLite error text.

The probe is wired to the real `db:integrity` operator command. Run it after
each production deployment and during the weekly database check; a healthy
database exits 0, while an unavailable or damaged database exits 1 with only a
bounded reason code:

```bash
# Repository checkout or an isolated restored backup:
DATABASE_PATH=/absolute/path/to/kpi.db npm run db:integrity

# Live Fly Machine (the runtime image retains Node and this operator script):
fly ssh console --app eastern-state-kpi-dashboard \
  -C "node ./scripts/check-database-integrity.mjs"

# On-premises production container:
docker exec eastern-state-kpi \
  node ./scripts/check-database-integrity.mjs
```

For the complete on-premises startup, TLS, single-process SQLite, onboarding,
backup, and rollback contract, see `docs/local-server-deployment.md`.

This command is the deep database signal. `/api/health/ready` intentionally
remains the cheap, anonymous liveness/readiness signal and must not be changed
to execute `PRAGMA quick_check`.

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

### Single-Machine SQLite deployment contract

The mounted SQLite database and the in-process login throttle require exactly
one application Machine. `fly.toml` therefore pins the reviewed
`shared-cpu-1x` / 512 MiB VM shape, keeps one Machine always running, and uses
the `immediate` deployment strategy so Fly does not attach the volume to an old
and replacement release Machine concurrently. The tradeoff is a short,
intentional deployment interruption instead of unsafe overlapping writers.

Fly does not encode a maximum Machine count in `fly.toml`; the count is
operator-owned infrastructure state. Inventory it before making any change:

```bash
fly scale show --app eastern-state-kpi-dashboard
fly status --app eastern-state-kpi-dashboard
fly machine list --app eastern-state-kpi-dashboard
fly volumes list --app eastern-state-kpi-dashboard
```

The intended inventory is one Fly Launch-managed Machine in the default `app`
process group, with the sole `kpi_data` volume attached to that Machine. If the
inventory shows more than one Machine, more than one volume, an unexpected
process group, or an unmanaged Machine created through `fly machine`/the
Machines API, **stop**. `fly scale count 1` without an explicit process group
targets only the default Fly Launch process group; it does not prove the app
has one Machine total and may not retire unmanaged Machines or Machines in
other process groups.

Before retiring any extra Machine, identify its process group and attached
volume, stop application writes, create an on-demand snapshot of **every**
attached volume, and wait until each new snapshot reports `created`:

```bash
fly volumes snapshots create <volume-id> --app eastern-state-kpi-dashboard
fly volumes snapshots list <volume-id> --app eastern-state-kpi-dashboard
```

Do not run a scale-down while it is ambiguous which Machine/volume holds the
authoritative SQLite database. Select and retire extras individually only
after the backup is complete and the authoritative Machine is documented.
Unmanaged Machines require explicit `fly machine` lifecycle commands; this
runbook does not prescribe a blanket destroy command because choosing the
wrong Machine is destructive. Once the inventory is proven safe, enforce the
default process-group count and then re-inventory:

```bash
fly scale count 1 --process-group app --app eastern-state-kpi-dashboard
fly scale show --app eastern-state-kpi-dashboard
fly status --app eastern-state-kpi-dashboard
fly machine list --app eastern-state-kpi-dashboard
fly volumes list --app eastern-state-kpi-dashboard
```

Do not clone the Machine, enable autoscaling, or add another process group
against `kpi_data`. If horizontal scale becomes necessary, move both
persistence and throttle state to shared services first.

The application process runs as fixed uid/gid `10001`. Fly mounts the volume
over the image’s build-time `/app/data` ownership, so the minimal container
entrypoint starts in the image root context, refuses a symbolic-link data path,
repairs ownership only under `/app/data`, and immediately uses `setpriv` with
`no-new-privs` to execute every application command as uid/gid `10001`. No
application, migration, seed, or Next.js code runs as root. CI proves this with
a root-owned named volume before accepting the image.

After deployment, readiness and a normal write prove the mounted volume remains
writable by the unprivileged process. Never remove the privilege-drop
entrypoint or run the application itself as root to work around a volume error.

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
