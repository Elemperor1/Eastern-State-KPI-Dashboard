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

Schema 11 tightens that model without replacing it:

- component slug identity is scoped to an effective measurement
  configuration, allowing the same business component to continue into a
  later definition while preserving every component ID;
- components declare `value`, `numerator`, or `denominator` aggregation roles,
  so ratios such as government support over contributed revenue are explicit;
- the migration rebuilds only measurement-configuration/component parent
  tables, preserves child observations/entries/targets/distributions, and
  performs canonical initialization only when all strategic sidecars are
  empty; populated operator configuration is never broadly resynchronized;
  and
- schema-11 reconciliation is limited to narrowly fingerprinted prior
  canonical contracts: the history-free active government-support fixture and
  exact system-owned goal copy, membership, unit/precision, and unresolved
  target states. Operator attribution, customized values, archives, changed
  relationships, or incompatible history make the corresponding repair a
  no-op; there is no broad canonical resynchronization.

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

Calculation-affecting definitions are effective-dated contracts. Once either
first-class or legacy scalar/breakdown values use a measurement, goal rule, or
membership, semantic fields cannot be edited in place. The admin/API successor
workflow stays within 2025–2029, splits predecessor ranges atomically, rejects
overlap, orphaning, historical-range adoption, and incompatible targets, and
copies only compatible component definitions, future component targets, and
distribution bands. It never copies observations. Goal successors receive a
collision-safe derived slug and split/clone effective memberships; every
predecessor update, successor insert, clone, and audit event rolls back
together on failure. A populated manual goal status is itself a durable result.
Components follow the same target boundary: archive affected parent/component
targets first, then archive or replace the component set; restore the
configuration and components before restoring their targets. Distribution-band
classification fields are immutable once a recorded value references the band;
operators end the old effective range and create a successor classification so
historical demographic calculations cannot change retroactively.

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
- Historical detail and audit reads traverse predecessor/successor lineage, so
  later definitions do not hide the earlier names, formulas, or events.

## Verification

Migration tests cover clean schema creation, additive copied-data migration,
row/ID preservation, operator-data no-op reconciliation, archived/history skip
conditions, idempotent reopen, and rollback. Strategy integration tests cover
exact canonical counts, effective-year reads, configuration gaps,
archive/restore, deletion-safe audit snapshots, successor compatibility,
range/history guards, clone atomicity, and all-year audit lineage. The shared
calculation and board-report fixtures cover every measurement family and
missing/zero/over-target edge cases.
