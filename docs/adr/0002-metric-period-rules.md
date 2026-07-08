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
- `MONTH_LABELS` and `MONTH_FULL` for the shared short and full calendar labels
- `isAnnualReportingFrequency` and `isMonthlyReportingFrequency`
- `isAnnualEntryMonth`, `isMonthlyEntryMonth`, and `isMonthlyEntryThrough`

Goals, analytics, admin data entry, dashboard export prep, metric detail chart routing, trend filtering, donor conversion rows, metric cards, goal manager display, and history labels use this shared rule surface.

Admin data-entry selection, period labels, draft construction, saved-row identity, and breakdown edit-month selection live in `src/features/metrics/admin-data-entry.ts`. That helper uses the same period vocabulary to build annual month `0` drafts, monthly month `1-12` drafts, and monthly breakdown editor state without falling back to the annual slot. Saved entry drafts retain their database id so Clear uses the entry mutation adapter's identity-based delete contract.

## Alternatives Considered

- Keep local checks such as `month === 0` and `reporting_frequency !== "monthly"` where they appear. This kept files self-contained but left the most important data-shape rule duplicated across unrelated UI and data code.
- Put the rules in `src/lib/analytics.ts`. That would help charts but would make non-analytics code depend on a broad formatting/calculation module.
- Put the rules in a generic shared utility module. That would hide domain meaning behind a dumping-ground path instead of giving metric period behavior a clear home.

## Consequences

- Annual versus monthly behavior now has one reusable vocabulary.
- Searches for raw annual/monthly condition literals in app/component/lib/feature TypeScript are meaningful again because most call sites should use the shared predicates.
- Metric entry and breakdown data access plus admin draft construction now live in `src/features/metrics`; future metric extraction should continue applying these rules at any remaining query, mutation, and edit-state boundaries.
- The module is intentionally small; its only presentation vocabulary is the authoritative short/full calendar month labels used across dashboard, export, audit, and data-entry surfaces.
