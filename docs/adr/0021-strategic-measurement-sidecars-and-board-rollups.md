# ADR 0021: Strategic measurement sidecars and board rollups

Status: accepted

## Context

The schema-9 application stores one legacy KPI definition, scalar or breakdown
values, and optional per-KPI delta targets. That model is useful for historical
comparison, but it cannot represent named strategic goals, raw survey inputs,
component measures, distributions, annual and full-plan targets, or explicit
configuration gaps without overloading legacy columns and changing existing
row meaning.

The 2025–2029 source dashboard contains five priorities, 22 named goals, 59
KPIs, unresolved TK/TBD decisions, unlike-unit components, and several measures
that are not year-over-year calculations.

## Decision

Schema 10 adds normalized sidecar tables keyed to the stable legacy KPI IDs:

- `strategic_goals` and effective-year `goal_kpis` memberships;
- effective-year `kpi_measurement_configs`;
- raw `kpi_observations` and `kpi_component_entries`;
- ordered `kpi_components`;
- annual and full-plan `kpi_targets` with numeric/structured values plus
  qualitative descriptions;
- effective distribution bands, observations, and immutable band-label
  snapshots;
- append-only `strategic_audit_events`.

The legacy category, KPI, value, per-KPI target, and entry-history tables stay
intact. The canonical source mapping backfills sidecars by stable slug during
seed or the schema-9-to-10 migration; ordinary page reads never resynchronize
or overwrite operator edits.

All business formulas live in the pure strategy calculation module. Dashboard,
detail, API, and export adapters consume its explicit missing/invalid/complete
states. Organization and priority summaries count completed named goals, not
improving KPI rows. KPIs needing a definition or target are excluded from the
completion denominator and surfaced separately.

Strategic entity lifecycle is soft archive/restore. New foreign keys use
`RESTRICT`, and audit events carry immutable display/context snapshots.

## Consequences

- Existing IDs and history survive migration and the old app can still read its
  legacy tables after a rollback to a schema-9 backup.
- New observations retain numerator, denominator, respondent, score, boolean,
  milestone, and category-count inputs so calculations can be reproduced.
- A target value of zero remains distinct from a missing target.
- `month = 0` stays an internal legacy annual convention and is never presented
  as a user reporting period.
- Operators must resolve the documented TK/TBD questions before every goal can
  enter the completion denominator.
- Schema rollback is backup restore, not destructive in-place table removal.

## Verification

Migration tests cover clean schema creation, additive copied-data migration,
row/ID preservation, idempotent reopen, and rollback. Strategy integration
tests cover exact canonical counts, effective-year reads, configuration gaps,
archive/restore, and deletion-safe audit snapshots. The shared calculation and
board-report fixtures cover every measurement family and missing/zero/over-
target edge cases.
