# ADR 0008: Reporting Server Data And Period Selection

Status: accepted
Date: 2026-07-07

## Context

Dashboard overview, category, and metric pages share reporting-period behavior,
but they do not need the same row scope. Overview compares all categories;
category and metric pages only need rows for their selected scope.

Before this decision, the broad dashboard loader lived in a generic lib module while each server page carried its own period parsing helper. That kept pages locally understandable, but it duplicated reporting-period rules and made dashboard data ownership less clear now that metrics, catalog metadata, goals, CSV exports, and audit history have feature-owned modules.

## Decision

Dashboard reporting data loading and reporting-period selection are owned by `src/features/reporting`.

The reporting feature now exposes:

- `loadOverviewPageData` for the complete overview dataset.
- `loadCategoryPageData` for one category's KPI/entry/breakdown/goal rows.
- `loadMetricDetailPageData` for one KPI's rows and category.
- `loadTrendExplorerPageData` for monthly non-breakdown trend series.
- `listDashboardYears` for the year list behind dashboard comparison controls.
- `resolveDashboardCompareState` and `parseThroughMonth` for URL period selection.
- Shared reporting data types consumed by dashboard clients and CSV builders.

The dashboard pages still own auth redirects, route params, and browser route
state handoff. Reporting server operations own slug validation, row scoping,
reporting data, and period rules.

## Alternatives Considered

- Leave the loader in a generic lib module and only extract period parsing. This would reduce duplication, but it would keep dashboard reporting data outside the feature that now owns reporting exports.
- Move all dashboard view-model shaping at once. That would make the client components thinner, but it would touch chart, table, goal, export, and routing behavior in one larger slice.
- Put period parsing in the analytics module. The fallback behavior depends on dashboard URL state and available data years, so it is reporting application logic rather than a pure KPI calculation.

## Consequences

- Overview, category, and metric pages share one tested period resolver while
  receiving page-scoped server data.
- The obsolete generic dashboard loader is removed.
- Reporting owns the server data surface used by CSV exports and dashboard pages.
- Overview/trends intentionally retain broad interactive datasets; category and
  metric payloads are narrowed without changing instant browser controls.
