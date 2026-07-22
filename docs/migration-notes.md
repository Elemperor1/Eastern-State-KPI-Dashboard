# Schema 14 Migration Notes

## Schema 14 editable Board visibility

Schema 14 additively creates `board_reporting_scopes`,
`board_reporting_priorities`, `board_reporting_statements`,
`board_reporting_statement_kpis`, and `board_reporting_audit_events`. It does
not rebuild or rewrite users, installation ownership, priorities, measures,
strategic configuration, observations, or legacy archive rows.

On the first Board-scope read only, an initialization marker imports the
supplied five-priority focus list when the active plan has no saved Board
priorities. The marker is then permanently consumed. Admin edits in Setup →
Goals are full atomic replacements with revision conflict detection and
immutable before/after audit snapshots. A deliberately empty or reduced Board
view is never repopulated on restart or a later migration.

Board reporting authorization now reads only this persisted scope for Overview,
Reports, Trends, priority and measure details, and JSON/CSV exports. Statements
may intentionally have no linked measure and remain visible as reporting gaps.

Back up SQLite and run `DATABASE_PATH=/absolute/path/to/kpi.db npm run
db:migrate`; do not run `db:seed` for this upgrade.

# Schema 13 Migration Notes

## Schema 13 Board role

Schema 13 adds the durable `board` user role. The migration rebuilds only the
`users` table to widen its role check from `admin | viewer` to
`admin | viewer | board`; it copies every user id, credential hash, creation
timestamp, password-rotation flag, disabled flag, and session-revocation
watermark unchanged. KPI/strategy content is not seeded, reset, or reconciled.

Board accounts can open Overview, Reports, and linked priority/measure detail
pages. Schema 14 supersedes the original source-defined allowlist with an
Admin-editable, database-authoritative scope. Statements without a dedicated
measure remain visible as reporting gaps. Board accounts cannot use Data Entry,
Setup, mutations, or the staff-only distribution-band configuration read.

Back up SQLite and run `DATABASE_PATH=/absolute/path/to/kpi.db npm run
db:migrate`; do not run `db:seed` for this upgrade.

# Schema 12 Migration Notes

## Summary

Schema 12 makes the initialized database authoritative for installation and
strategic-plan content. It adds `organizations`, `strategic_plans`, and
`installation_audit_events`; assigns every existing priority (`categories`)
to the active plan through a required `RESTRICT` foreign key; replaces
plan-specific 2025/2029 defaults and target checks with generic storage bounds;
and preserves every existing priority, KPI, goal, membership, configuration,
component, target, observation, distribution, user, and audit ID/value.

The active plan's persisted start/end years now drive pages, reporting,
exports, Setup editors, and transaction-aware strategic writes. The embedded
Eastern State snapshot is explicit seed/migration input only. See ADR 0023.

Schema 10 remains the non-destructive strategic-dashboard foundation: it keeps
schema-9 categories, KPIs, scalar/breakdown values, legacy targets, users, IDs,
and `entry_history`, then adds the normalized strategic sidecars. Schema 11 is
an additive integrity migration over that foundation. It:

- scopes `kpi_components.slug` uniqueness to its effective measurement
  configuration instead of the KPI for all time;
- adds an explicit `aggregation_role` (`value`, `numerator`, or `denominator`)
  for component calculations; and
- enables the canonical government-support KPI to calculate
  `(city support + state support) / contributed revenue × 100` without
  inventing a target.

The `9 -> 10`, `10 -> 11`, and `11 -> 12` transitions run transactionally and never enter
`resetKpiSchema`.

## Issue 42 application boundary

ADR 0022 changes the active product boundary without changing schema 11.
Legacy `monthly_entries`, `breakdown_entries`, legacy KPI goals, and
`entry_history` are retained as a read-only archive. Current browser writes use
strategic observations, component entries, distributions, configurations,
targets, memberships, and strategic goals only. No legacy row is remapped or
deleted by deployment.

Back up SQLite and run the existing `npm run db:migrate` for an existing
volume. Do not run `db:seed`. Rollback is an application rollback; restore the
pre-deploy backup as well only when post-deploy strategic writes must be
discarded. Physical legacy-table removal requires a future schema version and
separate approval.

## Schema 10 foundation

Schema 10 added archive/update metadata to `categories` and `kpis`, plus:

- `strategic_goals` and `goal_kpis`;
- `kpi_measurement_configs`, `kpi_observations`, `kpi_components`,
  `kpi_component_entries`, and `kpi_targets`;
- `distribution_bands`, `distribution_observations`, and
  `distribution_values`; and
- `strategic_audit_events`.

Distribution bands include the optional `derived_group` marker used to derive
a non-white respondent percentage without replacing the complete historical
distribution. Strategic foreign keys use `RESTRICT` or snapshot IDs; no entity
deletion cascades through strategic values or audit history.

## Schema 11 component migration

SQLite cannot replace a table-level uniqueness rule in place. The migration
therefore rebuilds `kpi_measurement_configs` and `kpi_components` inside one
transaction, copies every stable configuration and component ID, restores the
foreign keys/indexes, and drops the temporary tables only after the copy
succeeds. Child observation, component-entry, target, distribution, and audit
tables are not rebuilt; their foreign keys continue to reference the preserved
IDs, so existing values retain their original identity.

`scripts/migrate.ts` performs initial strategic configuration only when the
11→12 migration's one-time content marker is present and a populated legacy
KPI catalog has no strategic sidecar rows at all. Once that explicit upgrade
pass succeeds, the marker is removed and later migration runs never initialize
or reconcile content. During the marked pass it may repair a small set of
superseded canonical contracts only when every affected row still
matches its exact prior system-owned fingerprint (`updated_by IS NULL` plus the
expected values and lineage). The current reconciliation covers seven goal
metadata rows, four KPI memberships, three measurement metadata rows, and one
uncalculable recognition-target contract. Customized or operator-attributed
rows are left unchanged, as are all observations and legacy business data.

The government-support definition has its own stricter fingerprint. It is
converted to the ratio model only when the configuration and its two
components still match the exact old canonical signature, are attached to the
expected active/unarchived KPI, priority, goal, and membership lineage, and
have no first-class observations, component entries, targets, distribution
observations, or distribution bands. Any operator-modified,
inactive/archived, differently linked, or historically used definition is left
unchanged for human review. An initialized schema-12 database is never
repopulated from the fixture merely because strategic rows are absent.

## Startup safety

`src/lib/schema-version.json` declares schemas 9, 10, and 11 as additive
predecessors. `scripts/ensure-seeded.mjs` runs `npm run db:migrate` first for
either version, rechecks the database, and refuses destructive reseeding if the
migration does not produce a ready database. A production schema mismatch
therefore cannot fall through to the sample seed.

## Pre-deployment

1. Stop application writes.
2. Back up SQLite consistently (database plus WAL/SHM while stopped, or the
   SQLite backup API).
3. Record schema version and row counts for users, organizations, strategic plans, categories, KPIs, entries,
   breakdowns, legacy targets, history, strategic configurations, components,
   and component entries.
4. Deploy and run `DATABASE_PATH=/absolute/path/to/kpi.db npm run db:migrate`.
5. Compare stable IDs and business-row counts. On an untouched prior canonical
   signature, allow only the documented, audited government-support and exact
   system-owned goal/membership/unit/precision/target-state corrections.
   Operator-attributed or customized rows must remain unchanged. Run
   `PRAGMA foreign_key_check`.
6. Re-run the migration to prove idempotence.
7. Run credentialed smoke and representative report checks.

## Verified migration paths

Automated tests cover:

- clean schema-12 initialization with empty installation rows until explicit bootstrap;
- populated schema-11 ownership migration with stable descendant IDs;
- a real schema-9-shaped database with preserved legacy rows, IDs, and history;
- the prior schema-8 goal-baseline migration followed by schemas 10 and 11;
- schema-10 component/entry preservation through the table rebuild;
- later effective configurations reusing a component slug safely;
- one-time public `scripts/migrate.ts` initialization when an upgraded legacy catalog has empty strategic sidecars;
- proof that later schema-12 migration runs do not recreate deleted strategic content;
- preservation of customized goals, memberships, configurations, components,
  and targets on an already-populated database;
- government-support ratio repair only for the exact old canonical signature,
  including skip coverage for operator-modified or archived lineage and for
  observations, component entries, targets, distribution observations, and
  distribution-band history;
- exact prior-canonical 2–5-goal membership, goal-copy, ratio-unit,
  currency-precision, and unresolved-target-state reconciliation, including
  operator-owned no-op coverage and audit/idempotence proof;
- idempotent re-open and second migration;
- rollback on migration failure; and
- legacy older-schema behavior retained as documented by ADR 0020.

The July 13, 2026 canonical seeded-copy rehearsal preserved 3 users, 5
categories, 59 KPIs, 174 monthly entries, 24 breakdown entries, 198 legacy
history events, 25 legacy KPI goals, 22 strategic goals, 59 memberships, 59
measurement configurations, 46 components, 21 strategic targets, and 296
strategic audit events. Two public migration runs were no-ops; the logical dump
SHA-256 remained exactly
`8bb9beeb7e59ac1e3b913ae616dc34e755d516b705667fe50e761f95fb6191b2`, and
`PRAGMA foreign_key_check` remained empty. A clean migration also finished at
schema 11 with zero application rows and zero foreign-key violations. Focused
migration fixtures separately prove exact prior-canonical repair and
operator-owned customization preservation.

## Rollback

The safest rollback is to stop the app, restore the pre-migration schema-11
backup (or the schema-9/10 backup when crossing several versions), and deploy the
matching prior application. Do not attempt an in-place downgrade by dropping
columns or reconstructing strategic tables in production.

## Seed behavior

`npm run db:seed` remains an explicitly destructive sample-data reset. It is
appropriate for disposable development/test databases, never for production
migration. The seed owns an initial fixture, not live authority. The one-time
production upgrade may consume the same explicit input only for a genuinely
empty strategic sidecar; after initialization, operator-managed database rows
remain authoritative.
