# Database authority inventory

Status: architecture-migration discovery record

Baseline: `4ffa5f3219b32e595d9345a64126b78e70b79e40` (`origin/master`
after PR #62 and its green post-merge Quality, CodeQL, Container Security, and
Scorecard runs)

## Purpose and test seams

This inventory classifies organization-specific and strategic-plan content
before the database-authority migration. It is a preservation record, not a
license to move every constant into SQLite.

The agreed test seams are:

1. schema migration and fresh-install bootstrap behavior;
2. typed installation/plan and strategic-record persistence operations; and
3. observable page, report, export, and supported Setup editing behavior.

Tests exercise those interfaces with a real temporary SQLite database. Pure
calculation tests remain independent of persistence.

Discovery included exported constants, production arrays and objects, schema
defaults and checks, migration fingerprints, seed inputs, production imports,
route and component literals, report/export labels, hard-coded identifiers and
years, test fixtures, operational scripts, and the pre-architecture behavior
inventory.

## Classification ledger

| ID | Candidate and consumers | Classification | Decision and rationale |
| --- | --- | --- | --- |
| DA-001 | `src/features/catalog/strategic-plan.ts`: five priorities, 59 KPI identities, labels, descriptions, units, directions, order, 2024-2026 sample values, breakdown bands, and 25 legacy target inputs; consumed by `scripts/seed.ts` and tests | 1. Mutable business data, with sample values also 4. Test fixture / 5. bootstrap data | Persisted rows are authoritative. Retain this snapshot only as one-time bootstrap input outside production imports. The destructive development seed may continue to load it deliberately. |
| DA-002 | `src/features/catalog/strategic-config.ts`: source reference, 22 goals, 59 memberships/configurations, 46 components, targets, result definitions, units, labels, unresolved questions, and order | 1. Mutable business data / 5. migration or bootstrap data | Retain only as deterministic initialization input. Remove it from the runtime feature facade and all ordinary production mutations. |
| DA-003 | `STRATEGIC_PLAN_START_YEAR`, `STRATEGIC_PLAN_END_YEAR`, `STRATEGIC_PLAN_REPORTING_YEARS`, and duplicate data-entry years | 1. Mutable business data | Load the active plan's start/end years from SQLite and derive the inclusive reporting-year list. Client editors receive the list as data. |
| DA-004 | `ensureStrategicPlanConfiguration` and its canonical sync helpers in `src/features/strategy/mutations.ts` | 5. Migration or bootstrap data | Move canonical synchronization out of the runtime strategic mutation surface. It may run only for a genuinely empty strategic installation during explicit seed/migration. Reopening or serving the app must never reconcile from code. |
| DA-005 | Fingerprinted canonical corrections in `src/features/strategy/migration-reconciliation.ts` | 5. Migration input | Keep the historical, narrowly fingerprinted repair only on the explicit migration path. It is not a runtime fallback or source of current truth. |
| DA-006 | Schema-11 defaults/checks containing 2025 and 2029, and the lack of an owner above `categories` | 1. Mutable business data mixed with 2. domain invariants | Schema 12 adds installation scope and plan rows, makes priorities belong to a plan, and replaces plan-specific year checks with generic 1900-2100 storage checks plus plan-aware write validation. |
| DA-007 | `"Eastern State Penitentiary Historic Site"` in the Board Report adapter and `"Eastern State"` report fallback | 1. Mutable business data | Board reports and exports receive the persisted organization name/slug. Generic malformed-input fallbacks may say `Organization`; they must not silently substitute Eastern State. |
| DA-008 | Eastern State brand text in `AppShell`, login/setup-password screens, route recovery, layout metadata, and export filename prefixes | 1. Mutable business data where it identifies the installation; 3. presentation copy otherwise | Persist the organization short/display names and plan name. Authenticated shell/report/export identity uses persisted data. Generic marketing, security, and interaction prose remains presentation copy. Static metadata may use generic `Strategic Plan` copy when no initialized database is available during build. |
| DA-009 | Priority, Goal, Measure, Board Report, status, error, empty-state, accessibility, and field labels in components/reporting language | 3. Presentation copy | Retain unless a value is a recorded entity name or source definition. These strings explain generic behavior and are part of the stabilized UX contract. |
| DA-010 | Measurement types, reporting frequencies, configuration/board/progress states, aggregation methods/roles, completion rules, membership roles, target scopes, audit actions, and JSON validation limits | 2. Immutable domain invariant | Retain in code and SQL checks. They define supported behavior, not one organization's content. |
| DA-011 | Month/quarter names, annual `month = 0`, period indexes, 1900-2100 storage bounds, precision limits, CSV safety, raster limits, auth/CSRF rules, routes, and role matrices | 2. Immutable domain invariant / 6. system configuration | Retain in code, schema, or environment. Moving these would weaken established behavior without adding business editability. |
| DA-012 | API and editor min/max checks fixed to 2025-2029, plus successor/coverage loops in configuration editing and reporting | 1. Mutable business data embedded in generic behavior | Keep the behavior but provide plan bounds/years from the persisted active plan. Boundary schemas retain only generic year shape; transaction-aware operations enforce the current plan. |
| DA-013 | Stable slugs/IDs and exact old/new strings in schema migrations | 5. Migration input | Keep only where required to recognize an historical schema signature once. Do not use these identifiers in pages, reports, or ordinary writes. |
| DA-014 | Source references such as `Created in Setup`, `Admin catalog configuration`, and audit action descriptions | 3. Presentation/audit copy | Retain. They describe the origin of a mutation rather than define organization content. Persisted user-supplied source references remain authoritative for records. |
| DA-015 | Report CSV column names and generic formula explanations | 2. immutable export contract / 3. presentation copy | Retain because the stabilized export schema and calculation meaning are fixed acceptance criteria. Entity values inside rows come from SQLite. |
| DA-016 | Logo/font assets and design tokens | 3. presentation assets / 6. system configuration | Retain. This migration does not introduce asset administration or redesign branding. Textual installation identity is nevertheless database-backed. |
| DA-017 | `scripts/performance-profile.mjs`, smoke catalog year probes, E2E routes, security scanner pins, and deployment settings | 4. Test fixture / 6. system configuration | Retain. Test years exercise the canonical bootstrap fixture; tool versions, origins, and deployment paths are operational configuration. |
| DA-018 | Production-record assumptions in catalog/strategy integration, migration, reporting, page, and E2E tests | 4. Test fixture, except migration expectations which are 5. migration input | Tests may assert the initial Eastern State snapshot, but application behavior tests should query/change persisted rows through public seams. Changing the bootstrap source must not alter an initialized database. |
| DA-019 | README, ADR 0020/0021 descriptions, migration notes, operator docs, and behavior inventory | 7. historical/documentation context | Preserve history and update current authority statements. Documentation is not a runtime source. |
| DA-020 | Missing-configuration placeholder records returned by `queries.ts` | 2. generic behavior | Retain. These are explicit missing states, not fallback business content; they never substitute an embedded plan definition. |
| DA-021 | Current category and KPI CRUD, goal/membership/config/component/target editing, distribution bands, observations, and audit records | 1. mutable business data already persisted | Preserve these database-backed operations and authorization. Add plan-aware ownership/range validation without changing their supported semantics. |
| DA-022 | Organization/plan metadata and priority ownership have no dedicated current Setup editor | 1. mutable business data | Add the smallest plan settings capability inside an existing Setup area. Reuse the current category mutation for priority metadata; do not add a fifth destination or a general CMS. |

## Target ownership model

The application remains a single-installation SQLite product. A future-safe
organization owner is stored, but no tenant selector, tenant authorization, or
cross-organization behavior is exposed.

| Relationship | Integrity and deletion choice |
| --- | --- |
| Organization -> strategic plans | `RESTRICT`; an installation with plan history cannot be silently deleted. Organization lifecycle is status/archive, not cascade. |
| Strategic plan -> priorities (`categories`) | Required foreign key with `RESTRICT`; priorities and all descendant history survive plan archival. |
| Priority -> goals and KPIs | Existing strategic relationships remain `RESTRICT`; legacy KPI catalog compatibility is preserved. |
| Goal -> memberships -> KPIs | Existing effective-dated `RESTRICT` relationships remain. |
| KPI -> observations/components/distributions/targets | Existing `RESTRICT` strategic relationships remain; legacy archive tables retain their documented behavior. |
| Audit actor -> user | Existing `SET NULL` plus immutable actor/display snapshots remains. |
| Strategic audit entities | No cascading entity foreign key is introduced because historical snapshots intentionally survive lifecycle changes. |

Ordering remains explicit at priority, goal, membership, KPI, component, and
distribution-band levels. Stable numeric IDs and slugs are preserved during
migration.

## Data-access decision

The database-backed installation/plan module exposes a small interface:

- load the active organization and strategic plan;
- derive deterministic reporting years;
- update supported organization/plan display metadata transactionally; and
- reject missing, ambiguous, or out-of-range plan state explicitly.

Pages, routes, reports, exports, and strategic writes consume that module.
Presentational components receive plain typed data and never open SQLite.
Canonical bootstrap and historical repair inputs remain on explicit script
paths and are guarded from production imports.

## Bootstrap and migration decision

- Schema 12 is additive from schemas 9, 10, and 11.
- The 11 -> 12 migration creates the installation/plan rows once and attaches
  every existing priority to the active plan without changing IDs or values.
- The explicit fresh-install seed creates the same installation/plan before
  priorities and strategic definitions.
- Existing populated databases are never reseeded or broadly reconciled.
- Re-running startup/migration is a no-op after schema 12 is recorded.
- Every schema transition is transactional and checks foreign-key integrity
  before commit.
- Recovery is backup restore plus matching application rollback; there is no
  in-place destructive downgrade.

