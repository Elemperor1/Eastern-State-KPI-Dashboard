# Board Export Behavior

## Source model

CSV, browser print, PNG, and raster PDF consume the same calculated board-report
view model used on screen. Export adapters may paginate or style it; they may
not recalculate values.

## Required content

Board exports include:

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
