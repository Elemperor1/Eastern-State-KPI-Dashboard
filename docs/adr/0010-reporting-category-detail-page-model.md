# ADR 0010: Reporting Category Detail Page Model

Status: accepted
Date: 2026-07-07

## Context

Category detail pages render three related reporting sections:

- metric cards for non-breakdown KPIs
- monthly breakdown cards for donor-conversion style breakdowns
- annual breakdown composition charts

Before this decision, `CategoryPageClient` built those sections inline. It filtered category KPIs, built KPI analytics, selected the current-year goal for each metric card, classified breakdown KPIs by row month, and filtered annual breakdown chart rows. The page also owns browser routing and export controls, so these reporting rules were mixed into UI state code.

## Decision

Category detail page model construction is owned by `src/features/reporting/category-page.ts`.

The reporting feature builds a `CategoryPageModel` containing:

- the selected category
- metric card models with KPI analytics and the selected current-year goal
- monthly breakdown sections with all rows for the KPI
- annual breakdown sections filtered to month `0` rows for the current and comparison years

`CategoryPageClient` remains the route-level interactive renderer. It owns URL updates, metric navigation, export buttons, and high-level composition, while the feature module owns the reporting data shape that those components consume.

`src/components/CategoryMetricGrid.tsx` owns the metric-card section. `src/components/CategoryMonthlyBreakdowns.tsx` owns donor-conversion style monthly breakdown sections, and `src/components/CategoryAnnualBreakdowns.tsx` owns annual composition breakdown sections. The route client passes prepared category page model slices and the active comparison period into those renderers.

Annual breakdown comparison rows, totals, chart rows, and percent-change calculations are owned by `src/features/reporting/breakdown-comparison.ts`, which is shared by the breakdown renderer used on category and metric detail pages.

## Alternatives Considered

- Leave the calculations in `CategoryPageClient`. This kept the data close to the JSX but required the client to know analytics, goal, and annual/monthly breakdown rules.
- Move only the KPI analytics helper. That would reduce one import but leave goal selection and breakdown classification duplicated in page code.
- Build the page model in the server component. This may become useful later, but the current category controls update browser state optimistically; a pure feature builder keeps the behavior testable without changing routing behavior.

## Consequences

- Category page metric analytics, selected-year goals, breakdown section membership, and annual breakdown comparison behavior now have direct unit coverage.
- `CategoryPageClient` no longer imports KPI analytics or metric period-rule helpers directly.
- `CategoryPageClient` no longer imports metric-card, donor-conversion, breakdown-chart, or card primitives directly; those section renderers now live in focused components.
- The page still receives the broad dashboard dataset; future slices can narrow server-prepared props once metric and trend page models are protected.
