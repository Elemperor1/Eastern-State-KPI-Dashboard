# ADR 0018: Server-First Rendering And Client Payloads

Status: accepted
Date: 2026-07-08

Superseded in part by ADR 0022: Overview and Reports now use route-scoped
server view models and URL navigation instead of retaining broad client data.

## Context

Dashboard pages need authenticated server reads, but their year/month controls,
charts, exports, and admin forms also require browser state. Passing the entire
database-backed reporting dataset to every client page preserves instant
filtering, but unnecessarily serializes unrelated categories and KPIs.

The seeded dataset measured approximately:

- overview: 273,363 serialized bytes;
- Education category after scoping: 82,471 bytes (30% of overview);
- Video views metric after scoping: 8,684 bytes (3% of overview); and
- Trend Explorer: 213,111 bytes.

## Decision

Reads are server-first and use named reporting operations:

- `loadOverviewPageData()` returns the complete reporting dataset because all
  categories must recalculate immediately when the comparison period changes.
- `loadCategoryPageData(slug)` returns only the selected category, its KPIs,
  entries, breakdowns, and goals.
- `loadMetricDetailPageData(slug)` returns only the selected KPI, category,
  entries, breakdowns, and goal.
- `loadTrendExplorerPageData()` returns all eligible monthly, non-breakdown KPI
  series because users can toggle any of them without a fetch.

All four operations return global available-year options and the sample-data
flag. Category and metric clients retain their scoped raw rows so existing
year/month controls, charts, tables, CSV/PNG/PDF exports, and URL updates remain
instant and use the same feature calculations.

Interactive admin mutations currently remain client components calling thin
same-origin route adapters. Those adapters authenticate, authorize, validate,
apply CSRF protection, call feature mutations, and return refreshed data. They
are not an internal server architecture boundary, and server-side code must
never call them. A mutation may move to a server action when that reduces
current complexity without weakening security or error behavior.

## Alternatives Considered

- Pass the complete dashboard dataset to every page. This preserved behavior
  but serialized unrelated rows and obscured each page's actual dependency.
- Pass only precomputed current-period view models. That is smaller, but it
  removes instant client-side period changes or requires a new fetch/action for
  every control change.
- Add a client data-fetching cache. The data is already available during server
  rendering and there is no current need for a second read architecture.
- Convert every mutation to a server action in one refactor. This would combine
  architecture cleanup with broad auth, CSRF, form-state, and error-contract
  changes.

## Consequences

- Category and metric pages serialize substantially less data without changing
  user-visible interaction.
- Overview and trends intentionally retain broader payloads; their controls
  operate across the retained dataset.
- Slug validation and row scoping occur in one reporting server operation
  before data crosses the server/client boundary.
- Future payload narrowing must preserve instant filters and export accuracy,
  or explicitly adopt and test a different interaction model.
