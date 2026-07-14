# ADR 0022: Canonical Strategic Plan product and legacy archive boundary

Status: accepted
Date: 2026-07-14

## Context

The application exposed two value-entry systems, two goal systems, a separate
configuration-gap destination, and a Board Report rendered invisibly inside
Overview. The invisible report accounted for most of Overview's document and
DOM size. The parallel workflows also allowed current writes to land in either
legacy scalar tables or the strategic measurement model.

ADR 0018 previously accepted broad Overview and Trends payloads to preserve
instant client filtering. ADR 0016 assumed a complete hidden export root on
Overview. ADR 0021 retained the legacy model as an active rollback-compatible
sidecar peer. Those interaction decisions no longer describe the product.

## Decision

The product has four destinations:

- `/dashboard/overview` — a narrow server-rendered organization summary;
- `/data-entry` — the Admin reporting checklist;
- `/reports` — on-demand Board Report or strategic Trends; and
- `/setup` — the Admin Measures, Goals, People, and Activity workspace.

Overview loads only the selected-year strategic summary and a bounded attention
list. It does not build, serialize, render, or export a Board Report. Reports
loads only its selected view. Raster libraries remain dynamically imported on
export initiation.

Current result writes use only `kpi_observations`,
`kpi_component_entries`, `distribution_observations`, and
`distribution_values`. The legacy `/api/entries`, `/api/breakdowns`, and
`/api/goals` mutation adapters and their production pages are removed. Legacy
value, breakdown, goal, and `entry_history` rows remain readable historical
records until a separately approved physical schema-removal migration.
Unmappable records are never reassigned.

Setup presents configuration gaps as a Measures attention filter. Entry
History and Strategic Audit Events remain separate immutable records behind
the single Activity destination.

## Migration and rollback

This change does not drop or rewrite a legacy table, ID, value, snapshot, or
tombstone. Deployment therefore uses the existing additive schema-11 migrator.
Before deployment, back up the SQLite database and verify the backup can be
opened. Run `npm run db:migrate`, never `db:seed`, against an existing volume.

Rollback is application rollback plus database-backup restoration if any
post-deploy strategic writes must also be undone. Rolling application code back
without restoring the database is safe for schema compatibility, but the old
application will not understand newly recorded strategic observations. A later
physical removal of legacy tables requires a new ADR, an explicit archive
artifact, migration fixtures for populated production copies, and restore
testing.

## Consequences

- Overview and report work are route-scoped and server-first.
- Strategic calculated results are the reporting truth for Overview, Reports,
  Trends, and exports.
- The old production routes return 404; they are not aliases or hidden menus.
- Legacy production persistence features are removed. `scripts/legacy-seed.ts`
  is the only compatibility writer and runs only inside the explicitly
  destructive disposable sample seed; Activity reads retained history through
  `src/features/audit/server.ts`.
- Authentication, Admin authorization, CSRF protection, durable revocation,
  immutable audit transactions, and deletion guards remain unchanged on the
  live mutation surface.

## Verification

The gate comprises the full Vitest suite, `npm run design-system:test`, the
loopback smoke harness, the isolated Playwright reporting-cycle suite, and a
production Chrome trace. Acceptance explicitly proves that Overview contains
no Board Report root, removed routes return 404, failed saves retain input,
successful saves survive reload, Activity retains attribution, and report
exports operate from the visible Reports surface.

The July 14 authenticated production evidence is stored in the current and
controlled-baseline JSON files under `docs/performance/`, with sixteen raw
Chrome traces under `docs/performance/traces/` (eight per build). Desktop and
throttled-mobile profiles cover all four destinations. The exact-route Overview
comparison records 94.2% less decoded document data and 96.7% fewer DOM
elements, with no Board Report root in the current build.
