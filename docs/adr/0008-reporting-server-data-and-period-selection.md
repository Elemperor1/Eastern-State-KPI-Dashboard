# ADR 0008: Reporting Server Data And Period Selection

Status: accepted
Date: 2026-07-07

## Context

Dashboard overview, category, and metric pages all need the same broad reporting dataset, the same list of years available for reporting controls, and the same URL search-parameter behavior for current year, comparison year, and through-month selection.

Before this decision, the broad dashboard loader lived in a generic lib module while each server page carried its own period parsing helper. That kept pages locally understandable, but it duplicated reporting-period rules and made dashboard data ownership less clear now that metrics, catalog metadata, goals, CSV exports, and audit history have feature-owned modules.

## Decision

Dashboard reporting data loading and reporting-period selection are owned by `src/features/reporting`.

The reporting feature now exposes:

- `loadDashboardData` for the broad dashboard dataset used by overview, category, and metric pages.
- `listDashboardYears` for the year list behind dashboard comparison controls.
- `resolveDashboardCompareState` and `parseThroughMonth` for URL period selection.
- Shared reporting data types consumed by dashboard clients and CSV builders.

The dashboard pages still own auth redirects, route params, slug existence checks, and browser route state handoff to their client components. The reporting feature owns only the reusable reporting data and period rules.

## Alternatives Considered

- Leave the loader in a generic lib module and only extract period parsing. This would reduce duplication, but it would keep dashboard reporting data outside the feature that now owns reporting exports.
- Move all dashboard view-model shaping at once. That would make the client components thinner, but it would touch chart, table, goal, export, and routing behavior in one larger slice.
- Put period parsing in the analytics module. The fallback behavior depends on dashboard URL state and available data years, so it is reporting application logic rather than a pure KPI calculation.

## Consequences

- Overview, category, and metric pages now share one tested period resolver.
- The obsolete generic dashboard loader is removed.
- Reporting owns the server data surface used by CSV exports and dashboard pages.
- Dashboard client components still receive broad datasets and perform some page-specific chart/table shaping; those can be moved later behind focused tests.
