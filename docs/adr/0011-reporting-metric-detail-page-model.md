# ADR 0011: Reporting Metric Detail Page Model

Status: accepted
Date: 2026-07-07

## Context

Metric detail pages render comparison stats, goal progress, trend charts, year-to-date bars, value tables, and breakdown-specific views. Before this decision, `MetricDetailClient` built most of those data shapes inline while also owning URL updates, goal-display toggle state, exports, and the component tree.

That mixed KPI analytics, annual/monthly chart routing, selected-year goal lookup, value table rows, trend series construction, and breakdown routing into a large interactive component. It also made the same metric-detail row shape harder to share with CSV export behavior.

## Decision

Metric detail page model construction is owned by `src/features/reporting/metric-detail.ts`.

The reporting feature builds a `MetricDetailModel` containing:

- selected KPI and category
- filtered metric entries
- KPI analytics
- annual/monthly flags
- trend years and trend points
- YTD bar data
- current-year goal and goal annual/monthly classification
- metric value table rows
- direction label
- breakdown display model for donor-conversion or annual composition charts

`MetricDetailClient` remains the route-level interactive renderer. It still owns browser routing, export buttons, chart composition, and the goal display mode state, but it no longer calculates the reporting data model directly.

`src/components/MetricComparisonStats.tsx` owns the metric detail comparison-stat grid. `src/components/MetricGoalPanel.tsx` owns the metric detail goal-card presentation. `src/components/MetricTrendCard.tsx` owns the monthly trend chart card. `src/components/MetricYtdBarCard.tsx` owns the annual/YTD comparison bar card. `src/components/MetricBreakdownPanel.tsx` owns the breakdown display switch, and `src/components/MetricValuesTable.tsx` owns the value-history table. The route client passes them prepared reporting view models and display state so comparison, goal progress, chart, breakdown, and table markup can change independently from URL-state handling.

Annual breakdown comparison rows, totals, chart rows, and percent-change calculations are owned by `src/features/reporting/breakdown-comparison.ts`, which keeps the shared `BreakdownChart` renderer out of reporting math.

## Alternatives Considered

- Leave model construction in `MetricDetailClient`. This avoided a new module but kept business rules hidden in a client component.
- Move only the table rows. CSV export already owns table-row construction, but that would leave trend series, goal lookup, and breakdown routing in the page.
- Move the complete metric page to a server component. The current controls update browser state optimistically, so a pure feature model is a smaller behavior-preserving step.

## Consequences

- Metric detail page data shaping now has direct unit coverage for monthly KPIs, annual KPIs, selected-year goals, trend/table/YTD data, monthly donor-conversion routing, annual month-0 breakdown routing, annual breakdown comparison rows/totals, and missing KPI slugs.
- `MetricDetailClient` no longer imports KPI analytics, trend builders, or metric period-rule helpers directly.
- The page still renders charts and goal-toggle state client-side; focused presentation components can evolve without changing the reporting model contract.
