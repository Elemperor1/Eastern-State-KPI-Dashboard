# Successor Strategic Plans: operator runbook

Audience: the system operator responsible for migration, deployment, backup,
recovery, and production verification

This runbook supplements
[local server deployment](local-server-deployment.md),
[migration notes](migration-notes.md), and
[production observability](production-observability.md). Those documents remain
authoritative for the host, TLS, single-process SQLite, account, health, and
release-security contracts.

## Safety rules

- Run exactly one application process against the SQLite database.
- Stop normal access and every writer before migration or file restoration.
- Use `npm run db:migrate`, never `npm run db:seed`, for a populated database.
- Rehearse on a restored copy of the real production database before changing
  the live database.
- Keep database files, backups, hashes, and recovery records in
  operator-restricted storage. Do not put them in the repository.
- Do not clear a write-pause or integrity marker with ad hoc SQL.
- Do not edit lifecycle, activation, or recovery audit tables manually.
- Do not restore a pre-migration or pre-activation backup until the applicable
  rollback boundary has been established.
- Do not interpret a successful application rollback as a database rollback.

## Release inputs to record

Record these values in the release ticket or operator log before rehearsal:

| Field | Value |
| --- | --- |
| Release commit SHA |  |
| Previous approved commit SHA |  |
| Current schema version |  |
| Previous schema version |  |
| Production database identity |  |
| Pre-migration backup identity and restricted location |  |
| Rehearsal database identity and restricted location |  |
| Activation-backup directory |  |
| Operator |  |
| Planned maintenance window |  |

The exact release build must already have two consecutive successful full local
release-gate runs after the final change and a successful hosted security
workflow for the same commit. Record the receipts; do not infer them from an
older commit.

## Configure staged enablement and activation backups

The first production stage must set:

```dotenv
SUCCESSOR_PLANS_ENABLED=false
```

This leaves successor creation unavailable while the additive schema and
lifecycle safeguards are verified. After preservation checks pass, set:

```dotenv
SUCCESSOR_PLANS_ENABLED=true
```

The completed installation must leave successor planning enabled. This is a
short cutover safeguard, not a permanent operating mode.

Set `PLAN_ACTIVATION_BACKUP_DIR` to a durable, access-restricted directory on
the same operator-managed persistence boundary as the database. The
application must be able to create files there with mode `0600`; the directory
must not be inside an ephemeral container layer. If the variable is omitted,
the application uses `plan-activation-backups` beside the configured database.

Before enabling Plans, prove that:

- the directory exists or can be created by the unprivileged application user;
- another application process cannot write the database;
- the backup location has adequate free space;
- scheduled backup software includes the activation artifacts; and
- the retention policy in this runbook is configured.

## Production-clone migration rehearsal

The live database must not be the first migration attempt.

### 1. Create and restore the rehearsal copy

1. Stop or checkpoint production writes using the deployment's consistent
   SQLite backup method.
2. create a pre-migration backup that includes committed WAL state;
3. record its size and SHA-256;
4. restore it to a new, access-restricted rehearsal path; and
5. run the deep integrity command against the restored copy:

```bash
DATABASE_PATH=/absolute/rehearsal/path/kpi.db npm run db:integrity
```

Never point rehearsal commands at the live path. Never use `db:seed`.

### 2. Capture the before snapshot

Using read-only queries against the rehearsal copy, record:

- `meta.schema_version`;
- stable IDs and lifecycle states for users, the Organization, and every
  Strategic Plan;
- stable IDs and counts for Priorities, Goals, Measures, memberships,
  measurement configurations, Inputs, distribution bands, and Targets;
- counts and representative stable IDs for observations, component entries,
  distributions, legacy values, and notes;
- Board scope IDs, titles, focus statements, and linked Measure IDs;
- counts and representative stable IDs for strategic, entry, account, and plan
  lifecycle audit records; and
- representative Active-plan report and export checksums.

Capture values, not only counts. Equal counts do not prove preservation.
Exclude expected release-generated timestamps from byte-for-byte comparisons.

### 3. Run the additive migration twice

From the exact release checkout:

```bash
DATABASE_PATH=/absolute/rehearsal/path/kpi.db npm run db:migrate
DATABASE_PATH=/absolute/rehearsal/path/kpi.db npm run db:integrity
```

Confirm the migration finished at the release's declared schema and
`PRAGMA foreign_key_check` is empty. Compare the before and after snapshots.
The preservation-only upgrade must:

- preserve every existing identity and relationship;
- preserve users, results, reports, Board scope, exports, and audit history;
- leave the existing plan Active;
- leave its predecessor empty;
- create no Draft; and
- add lifecycle storage without rewriting historical meaning.

Run the same migration command a second time:

```bash
DATABASE_PATH=/absolute/rehearsal/path/kpi.db npm run db:migrate
DATABASE_PATH=/absolute/rehearsal/path/kpi.db npm run db:integrity
```

Repeat the comparison. The second migration must be a no-op for application
content and lifecycle state.

### 4. Exercise the complete lifecycle on the clone

Start the exact release against the rehearsal database with
`SUCCESSOR_PLANS_ENABLED=true`. Use real role boundaries and a disposable
Admin credential.

Complete the QA acceptance record in
[Successor Strategic Plans QA](successor-plans-qa-acceptance.md), including:

- blank and structural-clone Drafts;
- cancellation;
- readiness and override behavior;
- activation;
- Viewer and Board access;
- Archived reporting and exports;
- interruption and restart reconciliation;
- safe restore and forward-repair drills; and
- desktop, mobile, keyboard, and accessibility checks.

The authenticated general smoke harness performs mutations. It may run against
this restored clone, never the live database.

### 5. Prove previous-release restoration

1. Stop every rehearsal writer.
2. preserve the migrated/lifecycle rehearsal database as evidence;
3. restore the untouched pre-migration backup to a second rehearsal path;
4. verify the backup hash and run the integrity command appropriate to the
   previous release;
5. start the matching previous application release against that restored copy;
   and
6. verify sign-in, current Active-plan behavior, representative reports,
   Board scope, exports, audit history, and readiness.

This proves backup restoration and application compatibility. It does not
authorize live migration.

## Live cutover

Run cutover during the recorded maintenance window.

### 1. Close access and stop all writers

- Stop normal application access.
- Stop the application process and any job that can write SQLite.
- Verify no second Machine, container, process group, or attached writable
  volume can act as a writer.
- Record the final pre-cutover time and release/database identities.

### 2. Create and verify the pre-migration backup

Create a consistent backup using the approved deployment method. Record its
restricted location, size, SHA-256, source database identity, schema, operator,
and timestamp.

Restore it to an isolated verification path and run:

```bash
DATABASE_PATH=/absolute/verification/path/kpi.db npm run db:integrity
```

Do not continue until the restored copy opens and passes integrity.

### 3. Run the additive migration

From the exact tested checkout:

```bash
DATABASE_PATH=/absolute/production/path/kpi.db npm run db:migrate
DATABASE_PATH=/absolute/production/path/kpi.db npm run db:integrity
```

Confirm the declared schema, empty foreign-key check, one Active plan, no
Draft, no invented predecessor, and no migration-in-progress marker.

### 4. Run preservation checks

Compare the live before snapshot with the post-migration read-only snapshot.
Confirm stable identities, relationships, users, results, Board scope, exports,
and all audit histories are unchanged.

Any unexplained difference stops cutover. Keep the app unavailable and choose
safe pre-lifecycle rollback or investigation; do not enable Plans.

### 5. Deploy with successor creation unavailable

Deploy the exact tested build with `SUCCESSOR_PLANS_ENABLED=false`. Start only
one application process and confirm:

- `GET /api/health/ready` returns exactly `{"status":"ready"}`;
- the sign-in wall and role boundaries work;
- the existing plan remains the Active plan;
- Overview, Data Entry, Reports, and existing Setup areas behave as before;
- representative Board reports and exports match the preserved scope;
- Activity remains readable; and
- logs expose no secrets, paths, plan content, or raw database errors.

### 6. Enable Plans

Set `SUCCESSOR_PLANS_ENABLED=true` through the deployment's approved
configuration path and restart or redeploy the same release commit. Recheck
readiness and the single-process inventory.

### 7. Run the non-destructive production smoke

Using real Admin, Viewer, and Board accounts:

- confirm **Setup → Plans** loads for an Admin;
- confirm Viewer and Board accounts cannot open Draft administration;
- confirm the same Active plan remains authoritative;
- confirm existing Active reports and Board-scoped exports work;
- confirm Archived plan access, if any Archived plan already exists; and
- confirm successor planning is enabled.

Do **not** create a Draft, cancel a Draft, save a readiness decision, or
activate a plan in production. Full lifecycle proof belongs to the restored
production clone.

### 8. Reopen access

Reopen normal access only after every cutover check passes. Record the final
release, database schema, health result, preservation result, smoke result, and
time.

## Activation operational contract

Ordinary activation begins in the Admin dashboard. The operator does not run
activation commands.

### Activation Write Pause

The application lets in-flight mutations finish, then sets a durable write
pause. New mutations receive a retry-later response while read-only viewing
remains available. The pause covers plan definitions, results, users, and
audit-owned writes so nothing can commit between backup and verified
activation.

Do not clear the pause manually. It releases only after successful
post-activation verification or an approved recovery procedure.

### Verified Pre-Activation Backup

Before the lifecycle transaction, the server creates one SQLite backup with an
activation-specific identity. It verifies:

- the file exists and is non-empty;
- mode and location meet the restricted-storage contract;
- `PRAGMA quick_check` is `ok`;
- `PRAGMA foreign_key_check` is empty;
- the schema matches the running release;
- the predecessor is Active and the successor is Draft; and
- the recorded size and SHA-256 match the artifact.

If backup creation or verification fails, activation does not begin. The
predecessor stays Active, the successor stays Draft, and the write pause is
released.

### Atomic activation and post-commit verification

The application rechecks Admin authority, the whole-plan revision, readiness,
warnings, predecessor identity, and exactly-one-Active invariant. It then
archives the predecessor, activates the successor, and writes both immutable
lifecycle events in one transaction.

After commit, fresh read-only checks must confirm:

- exactly one Active plan, and it is the successor;
- the predecessor is Archived and read-only;
- the successor's Board scope resolves;
- the activation and archive lifecycle events exist;
- foreign keys are valid; and
- readiness health is available.

Only then may saves resume. A failure after commit keeps saves paused, marks an
integrity block, and requires operator recovery.

## Restart reconciliation

After any restart during activation, keep the application service and every
writer stopped. A clearly pre-commit operation may be closed without lifecycle
changes, and a `committed_unverified` operation may complete its fresh
read-only verification. Startup never replays the activation transaction.
`verification_failed` and `integrity_incident` operations always remain paused
and integrity-blocked for operator recovery.

Run the read-only inspection with the exact activation identity and database
path:

```bash
DATABASE_PATH=/absolute/resolved/path/kpi.db \
PLAN_RECOVERY_CONFIRM=/absolute/resolved/path/kpi.db \
PLAN_RECOVERY_ACTIVATION_ID=<activation-id> \
PLAN_RECOVERY_ACTION=inspect \
npm run plans:recover
```

`DATABASE_PATH` must be absolute. `PLAN_RECOVERY_CONFIRM` must exactly match
the filesystem-resolved `DATABASE_PATH`; a symlink spelling or different path
is refused. The command verifies database integrity and schema, reads only the
selected activation operation, and prints its bounded phase, plan IDs, backup
identity, recorded backup hash, committed authoritative-write counter, current
counter, and safety markers. Preserve that output in the external Activation
Recovery Record. The inspect action does not clear markers, resume activation,
or change the database.

Use the activation identity to compare the activation-operation record,
predecessor and successor lifecycle states, and lifecycle events:

| Observed authoritative state | Meaning | Required action |
| --- | --- | --- |
| Predecessor Active; successor Draft; no committed activation pair | Activation did not commit | Verify the retained backup/operation record, release the pause only through the supported reconciliation operation, then return the Draft to Admin review |
| Predecessor Archived; successor Active; matching archive and activate events | Activation committed | Keep saves paused, run post-activation verification, then release saves only if it passes |
| Any other combination, including zero or multiple Active plans | Active Plan Integrity Incident | Keep the application unavailable, preserve the database and logs, and begin operator recovery |

Use only `npm run plans:recover` for this operator boundary. Do not substitute
hand-written SQL, manually clear a safety marker, or edit an activation record.

## Recovery decision

First preserve the current database, WAL/SHM state, activation backup, logs,
operation record, and external recovery record. Then determine which boundary
applies.

### Safe Pre-Write Activation Restore

This restore is allowed only when all are true:

- activation committed;
- post-activation verification failed;
- the Activation Write Pause never released;
- no value, configuration, account, or other mutation committed after
  activation;
- the pre-activation backup's identity, size, SHA-256, integrity, schema,
  predecessor Active state, and successor Draft state are verified; and
- the application remains unavailable.

Procedure:

1. Keep the application and every writer stopped.
2. Create the external Activation Recovery Record described below.
3. Preserve the stopped service's logs, activation identity, and inspection
   receipt. Confirm the operation's committed authoritative-write counter
   exactly matches the current counter and that the write-pause, integrity
   block, and internal-write markers remain fail-closed.
4. Run `PLAN_RECOVERY_ACTION=inspect` as documented under Restart
   reconciliation and confirm its phase is exactly `verification_failed`.
5. Run the supported restore with the same exact resolved database path and
   activation identity:

   ```bash
   DATABASE_PATH=/absolute/resolved/path/kpi.db \
   PLAN_RECOVERY_CONFIRM=/absolute/resolved/path/kpi.db \
   PLAN_RECOVERY_ACTIVATION_ID=<activation-id> \
   PLAN_RECOVERY_ACTION=restore-backup \
   PLAN_RECOVERY_OPERATOR=<operator-identity> \
   npm run plans:recover
   ```

6. Preserve the command receipt and the restricted retained-failure path it
   reports. The command refuses every phase except `verification_failed`,
   refuses a missing or changed authoritative-write counter, and refuses
   released or internally-open safety markers. It verifies the current
   database; verifies the recorded backup's SHA-256, SQLite integrity, schema,
   predecessor Active state, and successor Draft state; retains the failed
   database; stages the restore; writes the counter equality and fail-closed
   marker proof into immutable recovery audit evidence; resets safety markers
   in the restored image; and replaces the database only after the staged
   transaction succeeds.
7. Run `npm run db:integrity` against the restored production path and confirm
   the predecessor is Active, the successor is Draft, and exactly one plan is
   Active.
8. Start the matching application release with normal access still closed.
9. Run readiness, role, Active-plan, Draft, Board-scope, report, and export
   checks.
10. Record the final hashes, checks, retained failed-database identity, recovery
    audit evidence, and result in the external record.
11. Reopen only after the operator confirms the authoritative state.

Do not copy the backup over the production database manually, insert recovery
events with ad hoc SQL, or clear safety markers outside `npm run plans:recover`.

### Post-activation write safeguard and forward-repair boundary

If the write pause released or any post-activation mutation may have committed,
do not restore the pre-activation backup. Restoration would silently erase
authoritative work.

1. Keep or place the application in maintenance mode.
2. Create a fresh verified backup of the current database.
3. Preserve logs, activation artifacts, operation records, and current
   database evidence.
4. Record the incident externally.
5. Diagnose the current state with read-only queries and supported integrity
   tools.
6. Prepare, review, test, and rehearse a forward repair on a restored copy.
7. Apply only the approved forward repair.
8. verify integrity, lifecycle invariants, reporting, Board scope, exports,
   audit history, and health before reopening.

An explicitly approved disaster-recovery decision may accept data loss, but
the decision, known loss window, approver, artifacts, and restoration outcome
must be recorded. It is not an automatic rollback.

## Activation Recovery Record

Create the record outside the database that may be restored. Use an
access-restricted incident system or append-only operator store.

Record:

- recovery ID and activation ID;
- predecessor and successor plan IDs;
- backup ID, restricted location, size, and SHA-256;
- failed database identity and preserved-artifact hashes;
- release commit and schema;
- operator and timestamps;
- activation phase and evidence that the write pause did or did not release;
- evidence of whether any post-activation write committed;
- integrity, foreign-key, lifecycle, readiness, report, Board, and export
  checks;
- every action taken and command receipt;
- the recovery boundary chosen;
- the final authoritative database identity and state; and
- the decision and known loss window if disaster recovery accepted loss.

After a Safe Pre-Write Activation Restore, confirm the restored database
contains the immutable recovery evidence written by `npm run plans:recover`.

## Artifact retention

Do not delete the Pre-Activation Backup or preserved failed database until all
of these are true:

- post-activation verification passes;
- the operator confirms cutover;
- at least one scheduled backup of the new Active state succeeds and is
  verified; and
- no open activation or recovery investigation needs the artifacts.

After that point, retain them under the normal approved backup policy. Recovery
records and immutable audit evidence follow the organization's audit-retention
policy and are not deleted with ordinary backup rotation.

## Recovery drills

Run both drills on a restored production clone before initial release and at
the normal disaster-recovery exercise interval.

### Drill A: interruption and safe restore

- interrupt once before activation commit and prove restart reconciliation
  returns Active + Draft without replay;
- interrupt once after commit but before verification completes;
- prove saves remain paused;
- preserve the failed database and create the external record;
- verify and restore the Pre-Activation Backup;
- write the supported recovery evidence; and
- verify the restored predecessor Active state and complete reporting.

### Drill B: forward-repair boundary

- complete activation and allow one controlled successor write on the clone;
- prove the runbook forbids restoring the Pre-Activation Backup;
- preserve and back up the current database;
- rehearse a harmless, reviewed forward repair;
- verify integrity and reporting; and
- retain the recovery record and artifacts.

Record dates, release/database identities, participants, injected failure
points, results, issues, and remediation. A drill that uses the live database
or requires improvised SQL fails acceptance.

## Pre-lifecycle release rollback

Before the first successor lifecycle record is saved, rollback may:

1. stop all writers;
2. preserve the failed/current database and logs;
3. verify the pre-migration backup;
4. restore that backup;
5. deploy the matching previous application release; and
6. verify integrity, health, sign-in, Active-plan behavior, reporting, Board
   scope, exports, and audit history.

After a Draft, cancellation, activation, or related lifecycle record exists,
this rollback is forbidden unless an explicit disaster-recovery decision
accepts the loss. Preserve the current database and repair forward.
