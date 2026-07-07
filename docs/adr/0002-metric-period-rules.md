# ADR 0002: Metric Period Rules

Status: accepted
Date: 2026-07-07

## Context

Eastern State KPI stores annual full-year KPI records in `monthly_entries` with `month = 0`, while monthly KPI records use calendar months `1` through `12`. Flexible reporting frequency is treated like annual reporting for the current dashboard behavior.

Before this decision, annual/monthly checks were duplicated across analytics, goal progress, data entry, exports, chart routing, history labels, and trend filtering. That made it easy for one surface to treat annual month `0` correctly while another accidentally handled it as a thirteenth month or skipped it.

## Decision

Metric period classification is owned by `src/features/metrics/period-rules.ts`.

The module exposes:

- `ANNUAL_ENTRY_MONTH` for the annual full-year row (`0`)
- `MONTH_NUMBERS` for valid monthly entry months (`1` through `12`)
- `isAnnualReportingFrequency` and `isMonthlyReportingFrequency`
- `isAnnualEntryMonth`, `isMonthlyEntryMonth`, and `isMonthlyEntryThrough`

Goals, analytics, admin data entry, dashboard export prep, metric detail chart routing, trend filtering, donor conversion rows, metric cards, goal manager display, and history labels use this shared rule surface.

## Alternatives Considered

- Keep local checks such as `month === 0` and `reporting_frequency !== "monthly"` where they appear. This kept files self-contained but left the most important data-shape rule duplicated across unrelated UI and data code.
- Put the rules in `src/lib/analytics.ts`. That would help charts but would make non-analytics code depend on a broad formatting/calculation module.
- Put the rules in a generic shared utility module. That would hide domain meaning behind a dumping-ground path instead of giving metric period behavior a clear home.

## Consequences

- Annual versus monthly behavior now has one reusable vocabulary.
- Searches for raw annual/monthly condition literals in app/component/lib/feature TypeScript are meaningful again because most call sites should use the shared predicates.
- Metric entry and breakdown data access now lives in `src/features/metrics`; future metric extraction should continue applying these rules at any remaining query and mutation boundaries.
- The module is intentionally small and does not decide presentation copy beyond period classification.
