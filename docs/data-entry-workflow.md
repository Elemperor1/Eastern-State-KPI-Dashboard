# KPI Data-Entry Workflow

> Internal documentation for the Eastern State Penitentiary KPI dashboard.
> This guide covers both supported manual-entry paths, their storage and audit
> contracts, cadence rules, correction behavior, and migration safety.

## 1. Access and responsibility

Only **admin** users can create, change, or delete KPI values. Viewers can read
the dashboard but cannot open an admin data-entry workflow.

| Role | View dashboard | Enter or correct values | Manage definitions and users |
| --- | --- | --- | --- |
| `admin` | Yes | Yes | Yes |
| `viewer` | Yes | No | No |

The role is managed at `/admin/users`. In local development,
`AUTH_DISABLED=true` supplies the real `auth-disabled@local` admin row; its
writes use the same validation, storage, actor identity, and audit paths as an
authenticated admin.

Every write route requires `requireAdmin()`. Mutations also pass
`assertMutationRequest`, which enforces same-origin `Origin`/`Referer`, exact
`application/json`, and the double-submit `X-CSRF-Token` cookie/header pair.

## 2. Choose the owning entry surface

The application has two intentional data-entry paths. They are not aliases.

| Surface | Use it for | Storage | Mutation routes | Audit table |
| --- | --- | --- | --- | --- |
| `/admin/data` — **Standard data entry** | Legacy-compatible scalar values and labeled breakdown rows | `monthly_entries`, `breakdown_entries` | `POST`/`DELETE /api/entries`, `POST`/`DELETE /api/breakdowns` | `entry_history` |
| `/admin/strategy-data` — **Strategic data entry** | First-class strategic observations, component results, raw ratios/averages, and distributions | `kpi_observations`, `kpi_component_entries`, `distribution_observations`, `distribution_values` | `POST`/`DELETE /api/strategy/observations`, `/api/strategy/component-entries`, `/api/strategy/distributions` | `strategic_audit_events` |

Use `/admin/data` when maintaining the compatibility value attached directly
to a legacy KPI. Use `/admin/strategy-data` when the effective strategic
measurement configuration defines the raw inputs or components needed to
calculate the result. Do not tunnel first-class strategic writes through the
legacy entry routes.

Legacy scalar rows remain a reporting fallback. When a first-class strategic
actual exists for the same KPI/reporting context, the strategic reporting
layer prefers that actual over the compatibility row. Avoid entering the same
source result in both places unless the duplication is an intentional,
documented compatibility requirement.

## 3. Standard data entry (`/admin/data`)

The page filters by category, KPI, and year, then renders the editor required
by the KPI's legacy `unit_type` and `reporting_frequency`.

### Scalar KPIs

- A monthly KPI shows January through December. Each saved row is keyed by
  `(kpi_id, year, month)` with `month` from 1 through 12.
- An annual or flexible KPI shows one full-year row. It is stored with the
  internal annual sentinel `month = 0`.
- Each row accepts a finite numeric value and optional notes. Zero is a valid,
  saved value and is not treated as blank.
- Save uses `POST /api/entries`; Clear confirms the action and uses
  `DELETE /api/entries` with the durable `monthly_entries.id`.

### Breakdown KPIs

A breakdown KPI stores a variable set of labeled rows, such as funding
sources. Each row includes label, value, optional notes, and sort order.

- New rows are naturally keyed by `(kpi_id, year, month, label)`.
- A saved row keeps its durable `breakdown_entries.id`, so renaming the label
  updates that row instead of creating a second history lineage.
- Duplicate labels in one KPI period return HTTP 409; a stale row id returns
  HTTP 404.
- Save and delete use `POST` and `DELETE /api/breakdowns`.
- Monthly breakdown KPIs use months 1–12. Annual/flexible breakdown writes use
  `month = 0`. The editor can still surface historical monthly rows from an
  older flexible definition without making flexible a new monthly contract.

### Standard correction contract

A save is an upsert, not a separate correction mode. The metrics feature
validates the KPI type and period, reads the previous row, writes the value,
reads it back by its stable key or id, and appends history in one SQLite
transaction. A failed read-back or audit insert rolls back the value change.

The API rejects scalar writes to breakdown KPIs, breakdown writes to scalar
KPIs, month-0 writes to monthly KPIs, month 1–12 writes to annual/flexible
KPIs, blank breakdown labels, non-finite values, and unknown KPIs.

## 4. Strategic data entry (`/admin/strategy-data`)

The strategic entry page covers the 2025–2029 plan years. It selects a
strategic KPI and reporting year, loads the effective measurement
configuration, and shows the raw fields required by that definition. A KPI
must have an effective measurement type and reporting frequency before this
page can accept a value.

The form always supports optional notes and a source reference. Saved values
appear beside the form with their period, component owner, raw inputs, notes,
and source. Edit reloads the exact record into the form; save upserts the same
KPI/component period. Delete confirms and sends the durable record id.

### Measurement-specific inputs

| Measurement type | What the admin enters |
| --- | --- |
| `count`, `currency`, `cumulative`, `year_over_year` | One finite scalar value |
| `binary` | Explicit **Complete** or **Not complete** (`1` or `0`) |
| `milestone` | Progress from 0 through 100 |
| `percentage`, `ratio` | Raw numerator and denominator; when the definition has a fixed denominator, the configured value is shown and reused |
| `average` | One supported raw method: total score plus possible score, average score plus scale maximum and respondent count, or positive responses plus total responses |
| `multi_component` | A configured component first, then that component's atomic measurement fields |
| `distribution` | Respondent total, effective band counts, and whether categories are mutually exclusive |

Calculated percentages and averages are never accepted as replacement scalar
values. The calculation layer derives them from the stored raw inputs. A
percentage/ratio observation therefore retains its numerator and either its
per-record denominator or the effective configuration's fixed denominator;
average observations retain respondent/score/response inputs.

For a mutually exclusive distribution, all band counts—including unknown and
declined bands—must sum exactly to the respondent total. For a non-exclusive
distribution, each band count may not exceed the respondent total. Band
definitions must already be effective for the selected year. Admins manage
those definitions in the KPI strategic editor at `/admin/kpis/[id]`; its
configuration route supports `GET`, `POST`, and `PATCH` at
`/api/strategy/distribution-bands`. A saved distribution freezes each band's
label in `distribution_values.band_label_snapshot`, so later label edits do
not rewrite the recorded survey result.

### Strategic cadence

Cadence comes from the effective strategic measurement configuration, not
from the legacy KPI's annual flag or from the measurement type.

| Strategic frequency | Entry periods |
| --- | --- |
| `monthly` | January through December, stored as indexes 1–12 |
| `quarterly` | Q1 through Q4, stored as indexes 1–4 |
| `annual` | One **Full year** period, internal index 0 |
| `cumulative` | One **Cumulative through YEAR** period, internal index 0 |
| `one_time` | One **One-time result (YEAR)** period, internal index 0 |
| `flexible` | Compatibility mode; the admin explicitly chooses monthly or annual for that write |

Components inherit the parent configuration's cadence. The server rejects
mixed month/quarter inputs, missing periods, out-of-range periods, and a
flexible write without an explicit mode.

### Strategic route and storage contract

- Atomic KPI observations use `POST /api/strategy/observations` and are keyed
  by KPI, effective configuration, year, and period.
- Atomic component observations use
  `POST /api/strategy/component-entries` and are keyed by component, year, and
  period.
- KPI- or component-owned distributions use
  `POST /api/strategy/distributions`; band counts are stored in normalized
  `distribution_values` rows.
- Each route's `DELETE` accepts `{ id }`. Deletes remove the current result but
  retain an immutable audit tombstone.
- Route validation returns HTTP 400 with field issues, unknown records return
  HTTP 404, and authentication/authorization use the shared 401/403 contract.

All strategic upsert/delete work and its audit event share one transaction.
A materially unchanged upsert does not add a duplicate before/after event.

## 5. Audit and correction history

The read-only browser is `/admin/history`. It has separate tabs because the
two write models preserve different snapshots.

### KPI values tab (`entry_history`)

Standard scalar/breakdown saves and deletes append:

- entry type/id, KPI id, year, and month or breakdown label;
- previous/new value and notes;
- actor id, actor-email snapshot, and UTC timestamp; and
- immutable KPI and category name/slug/unit snapshots.

The tab can be filtered by category, KPI, and year. Deleted metadata remains
reachable through tombstone filter options, and renamed/deleted badges compare
the snapshot with current catalog metadata. The default query is newest-first
and capped at 200 rows (server maximum 1,000).

### Strategic configuration tab (`strategic_audit_events`)

First-class observation, component-entry, distribution, and distribution-band
mutations append entity type/id, event type, immutable display/priority/goal
context, complete previous/new JSON snapshots, actor/email snapshot, source
reference, and timestamp. The same table also contains strategic definition,
target, goal, membership, and catalog lifecycle events.

The history page currently loads the newest 500 strategic events. It is
read-only; no route can replay, update, or delete an audit event. Delete events
retain the full previous snapshot even after the current observation row is
gone.

## 6. Reporting behavior

Standard and strategic storage have deliberately different calculation
contracts:

- An annual legacy KPI reads its `month = 0` row directly.
- A monthly legacy KPI computes YTD from months 1 through the selected through
  month; additive full-year views sum all 12 monthly rows.
- First-class strategic results are calculated from the effective definition:
  raw ratios, averages, component aggregation roles, distributions, binary or
  milestone values, and the configured cadence remain distinct.
- First-class observations win over legacy scalar fallback rows when present.
- Legacy percentage, average, and denominator-free ratio fallback rows retain
  their exact stored value and disclose that the raw calculation basis is not
  available. A fixed-denominator ratio may safely use the legacy scalar as its
  numerator (for example, 30 states out of 50 becomes 60%).
- A legacy non-percent year-over-year series calculates from the same period in
  the prior year. An already-derived `%` series remains direct and is never
  reused as a raw baseline; the first first-class raw-count observation may use
  a matching prior-year legacy raw count.
- Metric detail history follows the effective measurement and cadence: it
  shows calculated raw-count YoY, retained direct-percent provenance, annual
  cumulative snapshots, and one-time binary rows. Once first-class history
  exists, compatibility rows are not mixed into that series.
- Annual targets and full-plan targets remain separate; missing one is not
  filled from the other.

The dashboard, board report, and exports consume the shared reporting and
calculation layers rather than recalculating entry semantics in React.

## 7. Data-flow summary

```text
Standard data entry
/admin/data
  -> POST/DELETE /api/entries or /api/breakdowns
  -> metrics validation + atomic value write + entry_history snapshot
  -> compatibility reporting rows

Strategic data entry
/admin/strategy-data
  -> POST/DELETE /api/strategy/{observations,component-entries,distributions}
  -> effective-config/cadence/raw-input validation
  -> atomic normalized value write + strategic_audit_events snapshot
  -> strategic calculation -> dashboard/board/export models

Both feeds
  -> /admin/history (read-only, separate tabs)
```

## 8. Migration and automation status

Schema migration testing **is implemented**. The current schema-10/11 suite
includes:

- `src/lib/schema-migration.test.ts`: clean schema-11 initialization,
  schema-9 legacy row/id/history preservation, schema-8 goal-baseline ordering,
  schema-10 component-identity rebuilding with child entry/target preservation,
  foreign-key checks, reopen/idempotence, and legacy reset boundaries;
- `scripts/migrate.test.ts`: the public production entrypoint, canonical
  initialization only when strategic sidecars are empty, exact-signature
  government-ratio repair, operator-owned customization preservation,
  historical-data skip guards, repeated-run idempotence, and foreign-key
  integrity; and
- `scripts/ensure-seeded.test.ts`: fail-closed protection against destructive
  reseeding of populated or unprovable databases.

The recorded July 13, 2026 canonical seeded-copy rehearsal preserved 3 users,
5 categories, 59 KPIs, 174 monthly entries, 24 breakdown entries, 198 legacy
history events, 25 legacy KPI goals, 22 strategic goals, 59 memberships, 59
measurement configurations, 46 components, 21 strategic targets, and 296
strategic audit events. Two public migration runs were no-ops; the logical dump
SHA-256 stayed
`8bb9beeb7e59ac1e3b913ae616dc34e755d516b705667fe50e761f95fb6191b2`, and
`PRAGMA foreign_key_check` remained empty. See `docs/migration-notes.md` for the
operator procedure and rollback contract.

For an existing schema-9 or schema-10 database, back up SQLite and run:

```bash
DATABASE_PATH=/absolute/path/to/kpi.db npm run db:migrate
```

`npm run db:seed` is a destructive reset for disposable sample data, not a
production migration.

There is still no CSV/Excel upload or paste-grid entry path, scheduled data
collection, cron polling, or third-party data import. Values are entered one
record at a time. CSV/PNG/PDF **report exports** exist, but export support does
not imply import support. The CSV/Excel entry backlog remains documented in
`docs/roadmap.md`.
