# Board Export Behavior

## Source model

Every export consumes the same calculated reporting models used on screen.
Adapters may select, paginate, or style those values; they may not recalculate
them.

The overview deliberately has two PDF paths:

- **Export PNG / Export PDF** capture the compact visible dashboard summary.
  This keeps a raster export bounded and reviewable.
- **Print / PDF** reveals the detailed board book, including every priority,
  goal, KPI, target scope, component, demographic distribution, revenue
  breakdown, and unresolved reason. Browser-native printing avoids a single
  canvas that would exceed browser raster limits.

The board CSV uses the complete `StrategicBoardReportViewModel`. Metric and
category PNG/CSV exports use their matching screen models and retain the same
calculated values.

## Required content

Across the detailed board CSV/Print-PDF and representative metric/category
exports, the export set includes:

- organization-wide and priority-level `X of Y goals completed` summaries;
- priority, strategic goal, KPI, selected reporting year;
- current result and raw count/value;
- annual target/pacing and full-plan target/progress when applicable;
- target year and prominent target description;
- board and configuration status;
- component results and explicit aggregation method;
- demographic labels, percentages, respondent total, and the explicit derived
  non-white respondent share when configured;
- revenue-stream details;
- unresolved/missing-target labels and excluded-goal reasons.

## Safety and fidelity

- no NaN, Infinity, undefined, or blank calculated field;
- missing target renders `Target not finalized`;
- over-target text preserves the actual percentage while fill caps at 100%;
- progress bars include text and accessible labels;
- meaning never relies on color;
- target descriptions wrap and cards avoid page breaks where possible;
- respondent denominators and demographic caveats remain visible;
- no user-facing `month 0`.

The DOM-capture preparation layer reveals report-only header/footer context,
hides controls, relaxes clipped text, and restores the live DOM in `finally`.
Raster PDF generation uses compressed JPEG page slices and rejects a target
before capture when its dimensions or pixel count exceed the safe canvas
budget. The user-facing fallback is **Print / PDF**; an oversized report must
never silently download as blank pages.

## Authorization

Client downloads inherit the authenticated page boundary. Any server export
endpoint must use the same viewer/admin session gate as the report page and be
listed in the route authorization regression manifest. Export generation never
bypasses authorization or CSRF rules for state-changing operations.

## Representative fixtures

Acceptance coverage includes binary, cumulative count, percentage, average,
multi-component, demographic distribution, revenue composition, unresolved,
annual, and year-over-year KPIs. Tests compare exported report-model values to
the matching screen model, then validate PNG/PDF signatures, dimensions, text
wrapping, and page layout. Final PDF pages are rendered to images and visually
inspected for clipping, overlap, unreadable labels, and broken page transitions.

The July 9, 2026 manual fixture produced a 1664×14,886 overview PNG and a
15-page Letter-landscape overview PDF at 1.5 MB. Page count is data- and
viewport-dependent; bounded size, nonblank pages, intact cards, and complete
header/footer context are the acceptance contract, not a fixed page count.
