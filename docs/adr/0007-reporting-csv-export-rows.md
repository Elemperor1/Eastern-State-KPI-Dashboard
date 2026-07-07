# ADR 0007: Reporting CSV Export Row Ownership

Status: accepted
Date: 2026-07-07

## Context

CSV export is approved product functionality. The overview, category, metric detail, and trend pages each expose CSV downloads that must reflect the same annual/monthly/breakdown interpretation as the visible dashboard. Before this decision, each client component built its own CSV rows inline, duplicating period rules such as annual KPI month `0`, monthly through-month windows, breakdown period labels, and metric value-table columns.

That worked, but it made export correctness depend on UI components remembering the same business rules independently. It also made annual and breakdown export behavior harder to test without rendering a page.

## Decision

CSV export row construction is owned by `src/features/reporting/csv.ts`.

The reporting feature exposes pure row builders for:

- overview exports
- category exports
- metric detail value exports
- trend explorer exports

Dashboard clients still own browser interaction, routing state, and the `ExportCSVButton` click behavior. The feature returns only rows, column order, and filenames. CSV serialization and formula-injection protection remain in the shared UI CSV helper because they are generic file-format concerns.

The row builders use the existing authoritative period rules and KPI analytics helpers, including annual KPI month `0`, monthly months `1-12`, and current-vs-compare periods.

## Alternatives Considered

- Leave row construction inline in each client. This avoided movement but kept export business rules duplicated across pages.
- Move all dashboard chart/table view models at once. That would address more client-owned shaping, but the blast radius is larger and includes visual chart behavior. CSV rows are a smaller, testable export slice.
- Put CSV row builders in `src/components/ui`. That would mix domain-specific KPI reporting rules into generic UI/file helpers.

## Consequences

- Export row behavior now has direct unit coverage for monthly, annual, breakdown, metric-detail, and trend cases.
- Dashboard clients become thinner and pass feature-built rows/columns into the existing export button.
- PNG/PDF export behavior is unchanged; those paths still snapshot or print the rendered dashboard.
- Further reporting slices can move chart/table view models into the same feature when the behavior is protected.
