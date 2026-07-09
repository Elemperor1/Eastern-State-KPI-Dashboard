# Schema 10 Migration Notes

## Summary

Schema 10 is the non-destructive strategic-dashboard foundation. It retains
schema-9 categories, KPIs, scalar/breakdown values, per-KPI legacy targets,
users, IDs, and `entry_history`, then adds normalized sidecar tables.

The migration is explicit and transactional for version 9 to 10. It never
enters `resetKpiSchema`.

## Added legacy metadata

- `categories.archived_at`, `categories.updated_at`;
- `kpis.archived_at`, `kpis.updated_at`;
- indexes and update-time triggers.

## Added tables

- `strategic_goals`;
- `goal_kpis`;
- `kpi_measurement_configs`;
- `kpi_observations`;
- `kpi_components`;
- `kpi_component_entries`;
- `kpi_targets`;
- `distribution_bands`;
- `distribution_observations`;
- `distribution_values`;
- `strategic_audit_events`.

Distribution bands include an optional `derived_group` marker used to derive a
non-white respondent percentage without replacing the full historical band
distribution. Opening an early schema-10 development database repairs that
single additive column idempotently.

Strategic foreign keys use `RESTRICT` or snapshot IDs; no new entity deletion
cascades through strategic data or audit history.

## Startup safety

`src/lib/schema-version.json` declares schema 9 as an additive predecessor.
`scripts/ensure-seeded.mjs` runs `npm run db:migrate` first for that version,
rechecks the database, and refuses destructive reseeding if migration does not
produce a ready database. This prevents a production schema-version mismatch
from invoking the sample seed before the app can migrate.

## Pre-deployment

1. Stop application writes.
2. Back up SQLite consistently (database plus WAL/SHM while stopped, or the
   SQLite backup API).
3. Record schema version and row counts for users, categories, KPIs, entries,
   breakdowns, legacy targets, and history.
4. Deploy and run `npm run db:migrate`.
5. Compare schema version, row counts, stable IDs, and `PRAGMA foreign_key_check`.
6. Run authenticated smoke and representative report checks.

## Verified migration paths

Automated tests cover:

- clean schema-10 initialization;
- a real schema-9-shaped database with preserved legacy rows/IDs/history;
- the prior schema-8 goal-baseline migration followed by schema 10;
- idempotent re-open;
- rollback on migration failure;
- legacy older-schema behavior retained as documented by ADR 0020.

The startup probe is also tested against a copied schema-9 database: it reaches
schema 10 with 59 KPIs and 214 audit rows intact and does not invoke the sample
seed.

## Rollback

The safest rollback is to stop the app, restore the schema-9 backup, and deploy
the prior application. The sidecar migration does not alter legacy row meaning,
but an old binary does not know the new configuration tables or expanded
workflow. Do not attempt an in-place downgrade by dropping columns/tables in
production.

## Seed behavior

`npm run db:seed` remains an explicitly destructive sample-data reset. It is
appropriate for disposable development/test databases, not for production
migration. Canonical strategic configuration backfill is idempotent and keyed
by stable slugs; it does not delete legacy data or invent unresolved targets.
