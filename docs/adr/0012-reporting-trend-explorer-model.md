# ADR 0012: Reporting Trend Explorer Model

Status: accepted
Date: 2026-07-07

## Context

The Trend Explorer lets users compare multiple KPIs across multiple years with shared, logarithmic, or indexed y-axis modes. Before this decision, `TrendExplorerClient` owned both browser interaction state and deterministic reporting rules: default KPI/year selection, visible KPI filtering, available-year derivation, raw monthly series construction, month `0` exclusion, indexed baselines, log transforms, chart series names, CSV export data, and empty-state labels.

That made the chart rules harder to test independently and kept annual/monthly filtering inside a large client component.

## Decision

Trend Explorer model construction is owned by `src/features/reporting/trend-explorer.ts`.

The reporting feature builds a `TrendExplorerModel` containing:

- page data and initial selection defaults from one server-side loader
- visible monthly non-breakdown KPIs for the selected category
- raw monthly trend rows for selected KPIs and years
- indexed baselines and transformed trend rows
- selected KPI labels and sample unit type
- render-ready series metadata
- CSV export data and PNG filename
- print filter labels, y-axis help text, and empty states

`TrendExplorerClient` remains the interactive route client. It owns category/KPI/year/axis browser state after initialization, calls the feature model builder for each browser-side selection change, and places the export controls.

The detailed presentation is split into focused client components:

- `src/components/TrendExplorerSidebar.tsx` owns category, KPI, and year selector markup.
- `src/components/TrendExplorerChartPanel.tsx` owns Recharts rendering, y-axis mode tabs, legends, and empty-state display.

The route client no longer assembles page data, constructs reporting data models directly, or carries the detailed chart/control markup.

## Alternatives Considered

- Leave all data shaping in `TrendExplorerClient`. This preserved locality but kept chart business rules in the client component.
- Move the entire Trend Explorer to a server component. The current page needs immediate browser-side selection toggles and Recharts rendering, so a pure model builder is the smaller behavior-preserving step.
- Move only CSV export construction. CSV rows were already feature-owned; the remaining chart transforms were the larger untested risk.

## Consequences

- Trend Explorer behavior now has direct unit coverage for default selection, monthly-only KPI filtering, month `0` exclusion, duplicate monthly value summing, indexed baseline behavior, log-mode non-positive value handling, series labels, export names, and empty states.
- `TrendExplorerClient` no longer imports metric period rules, rebuilds monthly comparison points, or owns the detailed selector/chart markup.
- The client still receives the KPI and entry data needed for immediate browser-side selection changes. A later slice can further reduce serialized props once it can preserve the same interaction behavior.
