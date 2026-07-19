# ADR 0023: Database-authoritative installation and strategic plan

Status: accepted
Date: 2026-07-18

## Context

Schemas 10 and 11 normalized strategic goals, memberships, measurement
definitions, raw observations, components, distributions, targets, and audit
history. Ordinary reporting already reads those rows. However, source modules
still define the installation's canonical priorities, measures, goals,
calculation metadata, targets, source copy, and 2025-2029 plan boundary.
Runtime mutation and reporting modules also import plan-specific constants.

That leaves two potential authorities: persisted operator data and an embedded
Eastern State snapshot. It also leaves priorities without a durable plan owner.

## Decision

Schema 12 adds a single-installation ownership model:

- `organizations` stores stable installation identity and display metadata;
- `strategic_plans` belongs to an organization and stores the plan name,
  description, start/end years, status, source reference, and audit metadata;
- each existing `categories` row, which is the compatible Strategic Priority
  record, belongs to a strategic plan through a required `RESTRICT` foreign
  key; and
- strategic descendants continue to use their existing stable IDs and
  restrictive/effective-dated relationships.

The product does not expose multi-tenancy. The ownership row prevents global
content from remaining implicit and leaves a future-safe installation seam
without adding tenant routing or permissions.

The active plan is loaded through a typed database module. Its inclusive year
range drives pages, reporting, validation, calculations, exports, and Setup
editors. Generic domain enums, formulas, period rules, and authorization remain
in code.

Canonical Eastern State definitions become explicit bootstrap/migration input
only. A fresh empty installation receives them once. Schema-11 installations
receive organization/plan ownership once and preserve all existing rows. After
initialization, no application startup or ordinary request reconciles from the
embedded snapshot, and production modules cannot import it.

The existing four-destination product boundary is unchanged. A small plan
settings editor lives inside Setup rather than creating a content-management
destination. Current strategic and catalog editors remain the supported paths
for goals, measures, targets, definitions, and priority metadata.

## Integrity and lifecycle

- organization -> plan and plan -> priority deletion is `RESTRICT`;
- active/draft/archived state is explicit for plans;
- only one active plan is allowed for the single installation;
- plan and organization display updates are transactional and audited;
- priorities, KPIs, observations, targets, and immutable audits keep their
  existing IDs and deletion behavior; and
- plan-aware writes reject effective ranges outside the persisted plan unless
  an existing explicit external-target contract applies.

## Migration and recovery

The 11 -> 12 migration runs in one immediate transaction, creates the
installation and plan, rebuilds priorities with their required plan foreign
key, copies every stable ID and metadata field, verifies foreign keys, records
schema 12, and commits. Failure rolls back to schema 11.

Transitions from schemas 9 or 10 still complete their existing additive steps
before schema 12. A second run performs no content synchronization.

Operators stop writes, back up SQLite, run `npm run db:migrate`, compare stable
IDs/counts, run `PRAGMA foreign_key_check`, and rerun the migration for
idempotency. Rollback is application rollback plus restoration of the matching
pre-migration backup when post-migration writes must be discarded.

## Consequences

- administrators can change supported plan content without editing TypeScript
  or rebuilding solely for content changes;
- reports and exports use persisted organization/plan identity;
- source changes to bootstrap fixtures cannot alter an initialized database;
- the migration adds no ORM, second live source, broad repository abstraction,
  route, calculation change, or visual redesign; and
- initial-data tests remain fixture-specific while behavior tests cross the
  database-backed seams.

