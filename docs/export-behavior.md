# Board Export Behavior

## Source model

Every export consumes the same calculated reporting models used on screen.
Adapters may select, paginate, or style those values; they may not recalculate
them.

The overview exposes three representations of the same detailed board report:

- **Export PNG** captures the complete off-screen strategic board report as a
  reviewable image;
- **Export PDF** captures that same report as bounded raster pages and refuses
  unsafe canvas dimensions instead of producing a blank artifact; and
- **Print / PDF** reveals the same detailed report to browser-native printing,
  including every priority, goal, KPI, target scope, component, demographic
  distribution, revenue breakdown, and unresolved reason.

The compact visible dashboard remains the interactive executive summary; it is
not substituted for the detailed board-report export target.

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
- stable KPI id alongside the display name, so metric-detail exports never
  select rows by a mutable or duplicate name;
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

The July 13, 2026 Chrome acceptance fixture produced a 768×29,950 full-detail
overview PNG at 4.32 MiB. Its top, middle, and bottom were visually inspected;
the branded hierarchy, target cards, component tables, demographics, revenue,
and footer remained intact. The same workflow validated the raster PDF
signature and bounded size plus the browser-native print rendering. Page count
is data- and viewport-dependent; bounded size, nonblank pages, intact cards,
and complete header/footer context are the acceptance contract, not a fixed
page count.
