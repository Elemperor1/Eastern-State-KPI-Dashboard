# ADR 0009: Reporting Category Summary View Model

Status: accepted
Date: 2026-07-07

## Context

The dashboard overview shows one card per KPI category. Each card summarizes category-level movement by counting improving, declining, and flat metrics, computing the percent improving, and selecting a top mover.

Before this decision, `CategoryOverviewCard` calculated those values directly. The component also contained reporting-specific business rules for annual breakdown totals and the monthly donor-conversion breakdown (`Referred` / `Donors`). That meant a presentation card owned behavior that should be shared and tested as reporting logic.

## Decision

Overview category summary calculations are owned by `src/features/reporting/category-summary.ts`.

The reporting feature exposes pure builders for:

- per-metric category movement
- per-category overview summaries
- all overview category summaries for a reporting dataset and comparison period

`CategoryOverviewCard` now receives a prepared `CategoryOverviewSummary` and renders it. The overview client still owns browser state and routing, but it calls the reporting feature to derive the summary for the active comparison period.

## Alternatives Considered

- Leave the calculation in the UI card. This kept props smaller but left annual breakdown and donor-conversion rules hidden inside a presentational component.
- Move the logic into `src/lib/analytics.ts`. That module owns generic KPI analytics, while category rollups combine metric analytics, breakdown rules, and dashboard presentation semantics.
- Move every overview view model server-side in the same slice. That would be cleaner eventually, but the current comparison controls update browser state optimistically; this slice only moves the business rule to a feature-owned pure function.

## Consequences

- Category-card rollups now have direct unit coverage for monthly KPIs, lower-is-better direction, flat movement, annual breakdown totals, monthly donor conversion, and zero-denominator conversion behavior.
- The overview card becomes a presentation component and no longer imports KPI analytics or metric period rules.
- Dashboard overview still passes the broad reporting dataset to the client; further slices can prepare narrower page view models once protected by tests.
