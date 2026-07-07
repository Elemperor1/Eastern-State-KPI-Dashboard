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

`MetricDetailClient` remains the interactive renderer. It still owns browser routing, the goal display toggle, export buttons, and JSX composition, but it no longer calculates the reporting data model directly.

## Alternatives Considered

- Leave model construction in `MetricDetailClient`. This avoided a new module but kept business rules hidden in a client component.
- Move only the table rows. CSV export already owns table-row construction, but that would leave trend series, goal lookup, and breakdown routing in the page.
- Move the complete metric page to a server component. The current controls update browser state optimistically, so a pure feature model is a smaller behavior-preserving step.

## Consequences

- Metric detail page data shaping now has direct unit coverage for monthly KPIs, annual KPIs, selected-year goals, trend/table/YTD data, monthly donor-conversion routing, annual month-0 breakdown routing, and missing KPI slugs.
- `MetricDetailClient` no longer imports KPI analytics, trend builders, or metric period-rule helpers directly.
- The page still renders charts and goal-toggle state client-side; future work can extract smaller presentation components or trend explorer models without changing the reporting model contract.
