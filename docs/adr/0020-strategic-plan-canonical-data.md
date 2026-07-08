# ADR 0020: Strategic Plan as Canonical KPI Data

Status: accepted
Date: 2026-07-08

## Context

The former sample catalog contained 8 categories and 52 mixed-frequency KPIs.
The approved strategic plan instead defines 5 organizational priorities, 59
annual KPIs, and 25 target-bearing goals for 2027 or 2029. The product schema
has category and KPI levels, while the plan also has a strategic-goal level.

There is no reliable one-to-one mapping from the old KPI ids, values, or audit
snapshots to the strategic-plan measures.

## Decision

- `src/features/catalog/strategic-plan.ts` is the canonical seeded definition.
- Every current strategic KPI is annual and stores its value at `month = 0`.
- KPI names use `Strategic Goal — Measure`; reporting derives category-page
  goal groups from that convention.
- Seeded goals retain their 2027/2029 target years. Overview summaries count
  active/upcoming goals and average only goals with computable progress.
  Category and metric views prefer an exact selected-year goal, then the
  nearest enabled upcoming goal, so future strategic targets remain visible
  while users review 2024–2026 actuals.
- Schema version 8 intentionally uses the destructive reset migration for KPI
  tables and `entry_history`; users are preserved.
- `scripts/seed.ts` remains a transactional adapter over feature-owned catalog,
  metrics, and goals operations.

## Rollout and rollback

Before deploying schema 8, stop writes and copy the mounted SQLite database to
durable backup storage. Startup detects the version mismatch, recreates KPI
tables, and seeds the strategic sample data.

To roll back, stop the application, restore the pre-deployment database backup,
and deploy the prior application version whose expected schema is 7. Restoring
only the old application or only the old database is unsupported.

Production KPI values and audit history from schema 7 are not migrated. If they
must remain available for reference, retain the backup as a read-only archive
or export the relevant records before rollout.

## Consequences

The dashboard, category grouping, goals, smoke harness, and QA fixtures now
describe one coherent strategic plan. Historical KPI data is not silently
misattributed to new measures. The tradeoff is an explicit one-time data reset
that requires an operator backup and coordinated rollback.
