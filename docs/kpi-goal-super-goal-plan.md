# Strategic KPI and Goal Dashboard Upgrade Plan

- Status: schema-10 model/reporting/admin implementation landed; KPI-card completion plus build/smoke/e2e and manual browser/export proof remain open
- Prepared and reconciled: 2026-07-09
- Repository: `/Users/jacobcyber/Documents/Eastern State KPI`

## 1. Objective and source material

This plan records the upgrade from a primarily year-over-year, scalar-KPI model
to a 2025-2029 strategic-plan system whose executive summaries are calculated
from named strategic goals. Schema 10 preserves schema-9 data through an
additive migration and never turns an unresolved or missing target into zero.

The audit used these sources:

- the full 20-phase goal attached to the Codex task;
- `Eastern.State.Strategic.Dashboard.2025.2029.8.1.25.pdf` (one-page board
  working document, visually rendered and text-extracted during the audit);
- current schema and migration code in `src/lib/db.ts` and
  `src/lib/schema-version.json`;
- the canonical sample plan in `src/features/catalog/strategic-plan.ts`;
- reporting, goal, metric, export, auth, audit, admin, unit, integration,
  smoke, and Playwright surfaces described below.

The PDF is a working source, not a fully resolved specification. Its `TK`,
`TBD`, ambiguous denominator, and methodology notes must remain visible as
configuration gaps. They are not permission to invent values.

## 2. Historical audit baseline

The following results are the pre-change schema-9 baseline captured at the
start of the goal. They are historical evidence, not claims about the current
schema-10 worktree:

- `npm test`: 45 test files, 642 tests passed.
- `npm run design-system:guard`: design-token, component-library,
  auth-bypass, and architecture-boundary guards passed.
- `npm run design-system:test`: all guards, shell-injection regression gate,
  TypeScript, and the Next.js production build passed.
- Current local schema-9 sample database: 3 users, 5 priorities, 59 KPIs,
  174 scalar annual rows, 24 breakdown rows, 214 immutable entry-history rows,
  and 25 per-KPI target rows.
- The only pre-existing untracked source is the strategic-dashboard PDF. It
  will not be modified or silently added to source control.

## 3. Current schema-10 architecture summary

### 3.1 Runtime and boundaries

The application is a Next.js 15 App Router modular monolith backed by
`node:sqlite`. Server pages authenticate through the auth feature, then call
feature-owned server operations. Client components receive serializable page
models and call guarded JSON mutation routes through `apiFetch`.

| Concern | Current owner | Current behavior |
|---|---|---|
| Schema and migration | `src/lib/db.ts`, `scripts/migrate.ts`, `src/lib/schema-version.json` | Schema version 10; `9 -> 10` is transactional, additive, and idempotent. `db:migrate` preserves existing IDs, values, targets, users, and history. |
| Strategic mapping | `strategic-plan.ts`, `strategic-config.ts`, `src/features/strategy/` | Five priorities, 22 explicit named goals, 59 stable-slug KPI configurations, and 45 component definitions. TK/TBD values remain gaps. |
| Hierarchy | `strategic_goals`, `goal_kpis` | Priority -> named goal -> KPI membership is durable and effective-dated; legacy name-prefix parsing is no longer the strategic source of truth. |
| Targets | `kpi_targets`, legacy `kpi_goals` | Annual targets are selected by reporting year; full-plan targets are separate records. The 25 legacy per-KPI delta targets remain readable but are not named goals. |
| Raw values | strategy value-entry operations and routes | KPI observations, component entries, and distribution responses preserve first-class raw inputs and typed periods instead of flattening them through legacy scalar values. |
| Calculations | `src/features/strategy/calculations.ts` and reporting adapters | Typed formulas return explicit missing/invalid states, uncapped actual progress, capped visual progress, and separate annual pacing/full-plan progress. |
| Dashboard/detail | reporting loaders and strategic UI components | Organization/priority `X of Y goals completed`, excluded reasons, typed category cards, formula/raw-input history, component/distribution, and board-report sections are wired into overview and KPI detail models. |
| Administration | `/admin/strategy-data`, `/admin/kpis/[id]`, `/admin/strategic-goals`, `/admin/configuration-gaps` | First-class data entry, effective configuration, target/component/band editing, named-goal rules and KPI membership, lifecycle controls, and gap workflow supplement the legacy admin pages. |
| Export | strategic board-report model and `/api/strategy/export` | Detailed CSV/native Print-PDF and compact overview PNG/raster-PDF adapters consume the same sanitized reporting layer; the server read is session-protected and private/no-store. |
| Auth and CSRF | auth feature, session layer, route guards, `request-guard.ts` | The exhaustive matrix contains 35 protected route/method combinations: 33 admin-gated and two session-gated reads. Strategic mutations are in the shared CSRF/origin/content-type suites. |
| Audit/lifecycle | `strategic_audit_events`, strategy and catalog mutations | Configuration and value changes have immutable snapshots; strategic goals, KPI memberships, configurations, targets, components, bands, KPIs, and priorities have audited lifecycle behavior. |
| Verification | Vitest, design-system gate, smoke, Playwright, QA manual | `npm test` is green at 81 files / 1,277 tests; the design-system/production-build gate, 64-check smoke, 5-workflow e2e suite, migration rehearsals, and manual browser/PNG/PDF review passed on July 9, 2026. |

### 3.2 Compatibility boundaries that remain intentional

1. Legacy `monthly_entries` and `breakdown_entries` remain available; annual
   legacy rows still use internal `month = 0`.
2. Strategic periods are explicit: monthly 1-12, quarterly 1-4, and internal
   index 0 for annual/cumulative/one-time values. The UI never labels index 0 as
   a month.
3. `kpi_goals` still means a per-KPI baseline/delta target. The 22 rows in
   `strategic_goals` are the named strategic goals.
4. Missing and unresolved values remain nullable/configuration states. Numeric
   zero is accepted only when it is an explicitly entered value or target.
5. Legacy analytics stay available for comparison views, but named-goal
   completion is the executive source of truth.

## 4. Gap analysis

| Required capability | Current schema-10 state | Remaining final gate |
|---|---|---|
| Named priority -> goal -> KPI hierarchy | Implemented with `strategic_goals` and effective `goal_kpis` membership; membership role, weight, and order are editable. | Authorized owners resolve the documented one-KPI goal exceptions. |
| Eleven measurement types and full KPI configuration | Implemented in effective-dated sidecars, validation, calculations, and regression coverage. | None in code; human definitions remain in the gap queue. |
| Historical annual targets | Implemented as year-specific `annual` targets; legacy rows remain compatible. | Production operators take the required backup before migration. |
| Annual pacing vs full-plan completion | Implemented as distinct target selection, editors, progress fields, and exports. | Human owners finalize missing target values. |
| Four goal-completion rules and summaries | Implemented for required/informational membership with organization and priority rollups. | Human approval policy for manual completion remains open. |
| Typed progress visualization | Implemented on category cards, strategic detail, and export surfaces with accessible labels, uncapped result text, and capped visual fill. | None in code. |
| Components and raw calculation inputs | Implemented with 45 canonical components and first-class KPI/component writes. | Human owners resolve incomplete component definitions/targets. |
| Demographic distributions | Implemented with effective bands, respondent totals, label snapshots, and exclusivity validation. | Human owners finalize age/socioeconomic bands. |
| Configuration-gap workflow | Implemented with filters, ownership, statuses, audit, and completion exclusions. | Authorized owners work the visible queue. |
| Quarterly/cumulative/one-time periods | Implemented in validation, storage, labels, strategic editors, and tests. | None in code. |
| Shared board-report contract | Implemented for detailed CSV/native Print-PDF, compact overview PNG/raster PDF, and session-protected server export. | Human owners may request a different board-book template. |
| Strategic audit and archive/restore | Implemented with immutable snapshots and audited lifecycle operations. | None in code. |
| Representative strategic mapping | Implemented for 5 priorities, 22 goals, 59 KPIs, and 45 components without fabricating targets. | Authorized owners still resolve documented product gaps. |

## 5. Implemented data model (schema 10, additive)

Schema 10 uses an explicit `9 -> 10` migration and never enters the legacy
reset path. Existing tables, primary keys, entries, users, and audit rows stay
in place. Apply it to an existing database with `npm run db:migrate`; use
`npm run db:seed` only for the deliberate disposable/sample-data reset.

### 5.1 Existing-table extensions

`categories`

- includes `archived_at`, `updated_at`;
- treats each active category as a strategic priority;
- list operations exclude archived rows by default, with an explicit include
  option for audit/admin restore flows.

`kpis`

- includes only the archive/update metadata needed for soft deletion;
- retain the existing `unit_type` and `reporting_frequency` columns and CHECK
  constraints unchanged for backward compatibility;
- store the expanded, effective-dated strategic definition in sidecar tables
  rather than rebuilding this table or weakening its legacy constraints.

`monthly_entries`

- retain `value` and every existing row;
- retain the legacy scalar write/read contract unchanged;
- new typed observations live in a separate sidecar table;
- calculations prefer valid raw observations for derived measurement types and
  use the legacy value only as an explicitly labeled direct-value fallback.

`entry_history`

- remains append-only and unchanged for existing rows;
- new raw-input writes snapshot previous/new structured payloads through the
  generic audit stream while retaining the current scalar fields for the
  existing history UI.

`kpi_goals`

- remains readable as the legacy per-KPI target table during transition;
- schema-9 rows remain unchanged; explicit canonical annual/full-plan targets
  are synced independently by stable KPI/component ownership;
- new strategic goal completion does not treat these rows as named goals.

### 5.2 New tables

`strategic_goals`

- priority/category foreign key, stable slug and name, description;
- plan start/end years;
- completion rule: `all_required_kpis`, `weighted_average`,
  `threshold_count`, or `manual_status`;
- threshold count/percentage and manual status fields with rule-aware checks;
- sort order, active/archived timestamps, creator/updater metadata.

`goal_kpis`

- explicit strategic-goal membership keyed by stable ids rather than name
  prefixes;
- required/informational role, weight, display order, and effective dates;
- supports historical membership without silently applying the latest goal
  structure to an earlier reporting year.

`kpi_measurement_configs`

- effective start/end year plus one of the eleven requested measurement types;
- expanded reporting frequency (monthly, quarterly, annual, cumulative,
  one-time, plus legacy flexible), display unit, numerator/denominator labels,
  fixed denominator, aggregation method, precision, board status,
  configuration status, unresolved question, owner, due date, resolution
  notes, source reference, and last reviewed date;
- baseline metadata may be configured here, while current and previous-period
  values remain calculated read-model fields;
- backfill from the existing KPI conservatively and preserve the old unit and
  frequency columns as compatibility projections.

`kpi_observations`

- KPI, effective configuration, reporting year, typed period, and optional
  direct scalar value;
- nullable raw inputs: numerator, denominator, respondent count, total score,
  average score, maximum score per respondent, total possible score, positive
  responses, total responses, boolean state, milestone percentage, notes,
  source reference, actor, and timestamps;
- preserves raw inputs so historical derived results can be recalculated.

`kpi_targets`

- KPI and optional component foreign keys;
- target scope (`annual` or `full_plan`), optional reporting year,
  target year, nullable numeric target, human description, external-year flag;
- optional structured target JSON and baseline year/value preserve definitions
  that are not safely reducible to one scalar;
- target values remain nullable, so zero is valid and missing stays missing;
- uniqueness prevents multiple targets for the same KPI/component,
  scope, and applicable year.

`kpi_components` and `kpi_component_entries`

- component label, stable slug, measurement type, unit, raw-input labels,
  fixed denominator, baseline/previous-period values, weight, display order,
  configuration status, and archived state; component targets remain in
  `kpi_targets`;
- entry rows preserve scalar and raw calculation inputs by year and internal
  period; component history remains queryable after archival;
- parent aggregation is explicit and validated against unit compatibility.

`distribution_bands`, `distribution_observations`, and
`distribution_values`

- configurable, ordered, archivable category bands owned by a KPI/component;
- each observation stores respondent total, exclusivity mode, year/period,
  notes, and actor/timestamp;
- value rows store counts and an immutable band-label snapshot;
- validation requires counts to equal the respondent total for exclusive
  distributions and permits totals above it only when non-exclusive is
  explicitly enabled.

`strategic_audit_events`

- immutable action records for strategic goals, measurement configurations,
  components, targets, distribution bands/values, raw observations, and
  configuration-status changes;
- snapshot `entity_type`, `entity_id`, display name, priority name, goal name,
  previous/new JSON, actor id/email, and timestamp;
- no cascading foreign keys from the event to deletable metadata.

### 5.3 Period encoding

Legacy tables retain the integer `month`; schema-10 value tables use the
parallel typed `period_type` plus integer `period_index` contract:

- monthly: 1-12, shown as calendar months;
- quarterly strategy observations: indices 1-4, shown only as Q1-Q4 (legacy
  monthly-entry rows remain unchanged and are never repurposed as quarters);
- annual, cumulative snapshot, and one-time: internal 0, displayed as
  `Full year`, `Cumulative through YEAR`, or `One-time result`, never `month 0`;
- legacy flexible: continue accepting its current shape, but new UIs require an
  explicit mode before writing.

This convention avoids rewriting existing entries while providing one shared
period-rule module and user-facing labels.

## 6. Calculation-service design

The pure strategy calculation feature is the owner of business formulas.
Reporting loaders call it; UI, charts, and exports only render its serializable
results.

### 6.1 Required outputs

Every KPI/component calculation returns:

- intentional state (`not_started`, `in_progress`, `complete`, `exceeded`,
  `target_not_finalized`, `needs_definition`);
- raw inputs and formula explanation;
- calculated current result and formatted unit;
- annual actual/target/progress and pacing status;
- cumulative actual/full-plan target/progress;
- target description/year and configuration/board status;
- `display_progress_pct` capped to 0-100 and `actual_progress_pct` uncapped;
- structured missing/invalid reasons instead of NaN, Infinity, or implicit
  zero.

### 6.2 Formula rules

- binary: complete from an explicit boolean/milestone state, not a guessed
  numeric name;
- milestone: completed milestones divided by required milestones when both are
  known;
- count/currency/cumulative: actual divided by target, with direction-aware
  handling and explicit zero-target behavior;
- percentage/ratio: numerator divided by denominator when raw inputs exist;
- fixed denominator: numerator divided by the configured fixed denominator;
- average normalized score: total score divided by total possible, or average
  score divided by maximum scale;
- percent positive: positive responses divided by total responses and never
  mislabeled as an average;
- year-over-year: current minus previous divided by the absolute previous
  value, with explicit no-baseline and zero-baseline states;
- distribution: count divided by respondent total for every band;
- multi-component: none, average, weighted average, sum, or all-complete only
  when the explicit aggregation and compatible units permit it;
- rounding: one shared finite-number helper controlled by calculation
  precision, with predictable half-away/Intl display behavior documented in
  `docs/strategic-dashboard-calculations.md`.

### 6.3 Goal completion

Eligibility is calculated before completion:

- informational KPIs never block a goal;
- archived KPIs and KPIs in `needs_definition`/`needs_target` are excluded and
  returned with human-readable reasons;
- undefined KPIs are not failures and are not denominator members;
- a goal with no eligible required KPI is excluded from organization and
  priority denominators;
- summaries return completed, total eligible, percentage, excluded count, and
  excluded reasons.

Rule behavior:

- `all_required_kpis`: every eligible required KPI meets target;
- `weighted_average`: normalized eligible weights produce progress; completion
  is at least 100%;
- `threshold_count`: configured count or percentage of eligible required KPIs
  must meet target;
- `manual_status`: only an admin can set the completion status, and every
  change is audited.

## 7. Implemented API, authorization, and audit surfaces

Mutations follow the existing order: `requireAdmin`, shared auth error response,
`assertMutationRequest`, Zod parsing, feature operation, and generic error
mapping. The current first-class strategy routes are:

- `GET /api/strategy/export` — session-gated JSON or CSV board report;
- `POST`/`DELETE /api/strategy/observations` — KPI raw-value writes;
- `POST`/`DELETE /api/strategy/component-entries` — component raw-value writes;
- `POST`/`DELETE /api/strategy/distributions` — distribution observation/value writes;
- `GET`/`POST`/`PATCH /api/strategy/distribution-bands` — effective band reads and lifecycle;
- `POST`/`PATCH /api/strategy/configurations` — measurement configuration create/update/archive/restore;
- `POST`/`PATCH /api/strategy/components` — component create/update/reorder/archive/restore;
- `POST`/`PATCH /api/strategy/targets` — annual/full-plan target create/update/archive/restore;
- `PATCH /api/strategy/goals` — named-goal settings and lifecycle.
- `PATCH /api/strategy/memberships` — KPI completion role, weight, and display order within a named goal.

`PROTECTED_API_ROUTES` contains 35 protected route/method combinations: 33
admin-gated combinations and two session-gated reads (`strategy/export` and
`strategy/distribution-bands`). The revoked-session replay, viewer-forbidden,
CSRF/content-type/origin, and route-inventory suites use that exhaustive table.
The session watermark is strictly monotonic, including same-millisecond
password, role, and disable/enable changes.

## 8. Implemented UI and reporting surfaces

All new reusable surfaces belong in `src/components/ui/` and are exported from
its index. Domain composition remains in feature components.

### Main dashboard

- `Percentage of goals completed` and `X of Y goals completed` are the primary
  organization and priority results;
- excluded/unconfigured goals retain explicit reasons and drilldown data;
- YoY remains secondary comparison context rather than the named-goal
  denominator.

### KPI cards/details

- `ProgressToTarget` is an export-safe shared component;
- current result, selected-year annual pacing, full-plan progress, target
  description/year, board status, and configuration status are separate fields;
- detail models expose raw inputs, formula, component/distribution breakdown,
  history, and unresolved questions;
- charts are selected by measurement/reporting type and do not combine
  unrelated units;
- category cards surface the schema-10 measurement type, current result,
  target description, annual pacing, full-plan progress, board/configuration
  status, and unresolved reasons while retaining legacy comparison context;
- demographic chart and table states keep a missing percentage as `Not
  reported`; they do not emit a numeric zero progress value or ARIA value.

### Admin

- `/admin/data` and `/admin/goals` retain legacy scalar/breakdown and per-KPI
  baseline/delta workflows;
- `/admin/strategy-data` writes first-class observations, components, and
  distributions;
- `/admin/kpis` and `/admin/kpis/[id]` provide catalog and strategic KPI
  configuration, components, targets, and bands;
- `/admin/strategic-goals` manages named-goal rules/status/lifecycle;
- `/admin/configuration-gaps` provides filters, counts, owner/due date, and KPI
  editor links;
- Q1-Q4, full-year, cumulative, and one-time labels are user-facing; internal
  period zero is never presented as a month.

### Exports

- one board-report model is built from the same calculated view models as the UI;
- CSV, print, PNG, and PDF render that model with target descriptions,
  goal/priority summaries, components, distributions, respondent totals,
  unresolved labels, and text equivalents for visual bars/status;
- export adapters contain no business formulas;
- long-text and page-break/keep-together behavior has source/model coverage;
- fresh browser PNG/PDF artifact verification remains a Slice G gate.

## 9. Strategic seed mapping

The canonical catalog explicitly defines 22 strategic goals, 59 KPI
measurement configurations, and 45 components. Existing 2024-2026 values
remain sample data and retain their IDs through migration; reseeding a
disposable database intentionally rebuilds the canonical fixture.

Mapping rules:

1. Preserve the source PDF's five priority names and strategic goal labels.
2. Preserve all 59 current KPI slugs where the underlying measure is the same.
3. Split true combined measures into components rather than inventing totals.
4. Convert revenue streams and referral categories into typed components;
   demographic measures use distribution bands.
5. Mark `TK`, `TBD`, missing denominator/methodology, flood-area ambiguity,
   non-engaged audience methodology, sponsorship/grant, referral/cultivation,
   and board-status questions as configuration gaps.
6. Keep known numeric targets and human-readable descriptions independently.
7. Never create a numeric target solely because the source contains a planning
   phrase or board-level note.

## 10. Implementation order and phase gates

`Complete` below means the implementation and its focused automated gate are
present. Slice G still requires one fresh aggregate run and manual browser/
artifact evidence before the overall goal can be called complete.

### Slice A - model and migration — Complete

1. Add strategy types, Zod schemas, schema-10 additive migration, and migration
   tests on a clean database plus a copied schema-9 database.
2. Backfill explicit goal membership, measurement type, configuration status,
   and legacy target records without deleting data.
3. Gate: row counts, IDs, users, entries, and existing history match the
   pre-migration copy exactly; all new constraints validate.

### Slice B - calculation source of truth — Complete

1. Implement typed KPI/component/distribution calculations and centralized
   rounding.
2. Implement annual pacing/full-plan and goal/priority/organization summaries.
3. Adapt reporting view models while keeping legacy analytics tests passing.
4. Gate: all requested unit tests, no non-finite output, missing vs zero and
   over-target cases proven.

### Slice C - server operations, routes, and audit — Complete

1. Add goal/KPI/target/component/distribution operations and validation.
2. Add soft deletion/restore and generic audit snapshots.
3. Enroll every mutation/export in auth, CSRF, and route-exhaustiveness suites.
4. Gate: admin success, viewer 403, anonymous/revoked 401, same-origin/JSON
   enforcement, deletion-safe history.

### Slice D - dashboard and detail experience — Complete

1. Replace headline summaries with goal completion.
2. Add reusable progress, typed cards/detail sections, components,
   distributions, and formula/raw-input views.
3. Gate: design-system guard, accessibility semantics, responsive browser
   checks, selected-year correctness.

The organization/priority summary, category KPI cards, KPI detail, responsive
navigation, and retained browser captures are complete.

### Slice E - administration and gaps — Complete

1. Add full KPI/goal/component/distribution editors and period-aware data
   entry.
2. Add configuration-gap dashboard, filters, counts, ownership, and audit.
3. Gate: create/update/reorder/archive/restore flows plus annual/monthly/
   quarterly/cumulative/one-time entry tests.

### Slice F - board exports and canonical mapping — Complete

1. Map representative strategic configurations without fabricating targets.
2. Build shared board-report model and all export adapters.
3. Gate: binary, cumulative, percentage, average, component, demographic,
   revenue, unresolved, annual, and YoY fixtures match UI values.

### Slice G - documentation and final proof — Complete

1. Complete all required docs and ADR/migration/operator notes.
2. Run full unit/integration/auth/migration/build/smoke/e2e suites.
3. Run manual browser, PNG/PDF, auth, configuration-gap, and audit checks.
4. Gate: final checklist explicitly verifies `X of Y goals completed`, no
   user-facing month zero, and no NaN/undefined/Infinity.

## 11. Affected files

Current implementation owners include:

- schema/types: `src/lib/db.ts`, `src/lib/types.ts`,
  `src/lib/schema-version.json`, `src/lib/schema-migration.test.ts`;
- catalog/seed: `src/features/catalog/strategic-plan.ts`, its tests,
  `src/features/catalog/server.ts`, `src/features/catalog/admin-catalog.ts`,
  `scripts/seed.ts`;
- goals/reporting: `src/features/goals/**`, `src/features/reporting/**`,
  `src/lib/analytics.ts` and tests;
- metrics/data entry: `src/features/metrics/**`, `/api/entries`,
  `/api/breakdowns`, admin data components and tests;
- routes/security: `/api/kpis`, `/api/categories`, `/api/goals`,
  `/api/strategy/{export,observations,component-entries,distributions,distribution-bands,configurations,components,targets,goals}`,
  `src/lib/auth-regression-helpers.ts`, auth/CSRF regression tests;
- audit: `src/features/audit/**`, admin history components and tests;
- UI: dashboard overview/category/metric/admin pages,
  `CategoryOverviewCard`, `MetricCard`, `MetricGoalPanel`, charts, loading
  skeletons, `AppShell`, and `src/components/ui/**`;
- export: `src/features/exports/**`, `src/features/reporting/csv.ts`, export
  buttons and e2e tests;
- verification/docs: smoke catalog/harness, Playwright acceptance spec,
  README, AGENTS notes where commands/counts change, QA manual, ADR 0020, and
  the six required new documents.

Schema-10 feature surfaces include:

- `src/features/strategy/` for records, validation, calculations, queries,
  mutations, reporting models, and tests;
- component/distribution route handlers and admin components;
- `src/components/ui/ProgressToTarget.tsx`;
- `src/app/admin/configuration-gaps/`;
- `docs/kpi-measurement-model.md`;
- `docs/goal-completion-rules.md`;
- `docs/strategic-dashboard-calculations.md`;
- `docs/configuration-gap-workflow.md`;
- `docs/export-behavior.md`;
- `docs/migration-notes.md`.

## 12. Test plan

The automated test files and focused coverage described below are present.
The July 9, 2026 schema-10 run passed `npm test` at **81 files / 1,277 tests**,
the design-system/type/production-build gate, **64/64** smoke checks, **5/5**
Playwright workflows, clean and copied-database migration rehearsals, and
manual browser/PNG/PDF inspection.

### Unit

- all measurement-type schemas and required-field matrices;
- percentage/ratio/fixed-denominator, average/percent-positive, binary,
  milestone, count/currency/cumulative, YoY, distribution, component
  aggregation, rounding, annual pacing, and full-plan formulas;
- goal rules, required/informational behavior, configuration exclusions,
  organization/priority counts;
- missing vs zero target, zero denominator, no baseline, future target,
  over-target, lower-is-better, invalid/non-finite inputs;
- period labels/rules for monthly, quarterly, annual, cumulative, one-time,
  legacy flexible, and internal zero.

### Integration and route

- additive migration on clean schema and copied schema 9;
- KPI create/update/archive/restore, strategic goals/rules, targets,
  components/reordering, distributions/bands/observations, configuration gaps;
- selected-year target/actual loading and annual/monthly/quarterly entry paths;
- dashboard and board-report summaries;
- all new audit events and deletion/restore history;
- 401/403/CSRF/content-type/same-origin coverage for every route/method;
- same-millisecond session revocation regression.

### UI/e2e/manual

- organization and priority `X of Y` goal completion;
- excluded-goal drilldown;
- progress states and screen-reader labels;
- target description prominence and missing-target copy;
- multi-component and demographic editors/details;
- configuration-gap filters and links;
- annual vs cumulative vs YoY displays and year switching;
- PNG/PDF signatures, dimensions, wrapped descriptions, page breaks, labels,
  respondent totals, and same-values-as-screen assertions;
- viewer/admin/auth-bypass production guard behavior;
- deleted entity names and child history remain visible.

## 13. Rollback and backward compatibility

- Schema 10 is additive and idempotent from schema 9. It does not drop or
  rebuild any current table.
- Before applying to production, stop writes and copy the SQLite database and
  WAL/SHM files together or use SQLite's backup command.
- Rollback to the old application requires restoring the schema-9 backup; the
  old binary will not understand expanded frequency/check constraints or new
  tables even though old rows remain present.
- Existing KPI slugs/IDs, category IDs, entry IDs, user IDs, and history IDs
  are compatibility contracts.
- Legacy `unit_type`, `flexible`, `kpi_goals`, and scalar `value` reads remain
  supported until a separately approved cleanup migration.
- New reads default to active/unarchived records. Audit/admin restore reads can
  explicitly include archived records.
- Seed reset remains a deliberate disposable/sample-data command and must not
  be used as the production migration path.

## 14. Known unresolved product questions

The implementation resolved the structural count ambiguity by mapping all five
priorities into **22 explicit named goals** and mapping all **59 KPIs** exactly
once by stable slug. The separate **25** count remains the number of legacy
per-KPI target rows, not named goals. Any future change to that source mapping
still requires an authorized owner.

The remaining questions do not block safe infrastructure work, but final
organizational answers must come from an authorized human owner:

1. The stated “2-5 KPIs per goal” conflicts with several one-KPI goal bands in
   the source. The implemented mapping preserves source ownership and flags the
   cardinality gap rather than merge or invent KPIs.
2. Confirm the exact board-status vocabulary and who may override it.
3. Confirm on-track/at-risk/off-track pacing thresholds and whether they vary
   by measurement type or goal.
4. Confirm how manual goal completion is approved and whether a second-person
   review is required.
5. Confirm whether target years outside 2025-2029 need a boolean `external`
   marker, a named external plan, or both.
6. Define age and socioeconomic bands and whether historical labels may be
   corrected or only superseded.
7. Define “high-risk area” and the denominator for flood/climate resilience.
8. Define the survey population/method for non-engaged community awareness and
   the language needed to avoid population-level overclaiming.
9. Finalize dwell-time, corporate sponsorship, foundation grant,
    referral/cultivation, architecture-program, reduced/free/PWYW, government
    support, and other TK/TBD targets.
10. Confirm which revenue components may be summed, which should be presented
    only as composition shares, and whether city/state support are separate
    board rows.
11. Confirm fiscal-year vs calendar-year semantics and whether quarterly data
    uses calendar quarters.
12. Confirm the authoritative owners/due dates/source references for every
    unresolved KPI.
13. Confirm whether the board PDF should be one organization summary, one page
    per priority, or both.

Until answered, these items use `needs_definition` or `needs_target`, remain
visible in the gap dashboard and exports, and are excluded from goal-completion
denominators with explicit reasons.

## 15. Definition-of-done checklist

Current definition-of-done status:

- [x] Named strategic goals, typed KPIs, components, distributions, targets,
  raw inputs, and configuration gaps round-trip through validated server paths.
- [x] Annual pacing and full-plan progress are distinct for a selected
  reporting year; neither silently substitutes for the other.
- [x] Organization and priority summaries expose percentage plus `X of Y`
  named goals completed, with excluded reasons.
- [x] UI and export adapters consume the same calculation/report models.
- [x] Strategic audit snapshots survive archive/restore across the configured
  hierarchy.
- [x] The exhaustive authorization/CSRF inventory covers 35 protected
  route/method combinations: 33 admin-gated and two session-gated reads.
- [x] Schema-9 IDs, values, targets, users, and audit rows are preserved by the
  additive schema-10 migration contract and focused migration coverage.
- [x] Run and record the current unit/integration/auth/migration suite:
  `npm test` passed 81 files / 1,277 tests; `npx tsc --noEmit` passed.
- [x] Run and record the production build/design-system gate, the loopback
  development smoke (64/64), and the e2e suite (5/5). The credentialed
  production smoke remains the normal operator pre-release step.
- [x] Complete and record manual responsive browser, PNG/PDF,
  configuration-gap, strategic editor, and retained-artifact checks; auth and
  audit/lifecycle behavior are covered by the exhaustive automated suites.
