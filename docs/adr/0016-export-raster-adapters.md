# ADR 0016: Export Raster Adapter Ownership

Status: accepted
Date: 2026-07-08

## Context

PNG and PDF output are approved product functionality. CSV row construction is already owned by `src/features/reporting/csv.ts`, but PNG and legacy PDF export behavior still depended on generic `src/lib` helpers for dashboard-specific DOM rules: temporarily revealing `.export-only` report chrome, hiding `.no-print` and page-header action controls, and resolving the themed page background before html2canvas capture.

That made export ownership less clear because the helper was not generic infrastructure; it encoded dashboard report presentation rules. It also kept the heavy legacy PDF adapter outside the feature area even though it exists only for export behavior.

## Decision

Raster export DOM preparation and the legacy html2canvas/jsPDF adapter are owned by `src/features/exports`.

The feature exposes:

- `dom-capture.ts` for the DOM preparation rules shared by PNG and legacy PDF capture
- `legacy-pdf-export.ts` for the dynamically imported PDF adapter
- `raster-layout.ts` for deterministic letter-page slicing that preserves
  source-pixel coverage and moves page cuts to keep-together boundaries

The UI buttons remain thin client components. `ExportPNGButton` imports the feature DOM-prep helper before capturing the rendered dashboard. `ExportPDFButton` dynamically imports the feature-owned legacy PDF adapter on click so html2canvas and jsPDF stay out of the initial page bundle.

Category and metric server pages parse the explicit `?legacy=1` fallback flag
and pass a boolean to `LegacyExportPDFButton`. The button never reads
`window.location` during render, so server HTML and the initial hydrated client
tree remain identical.

CSV row construction remains in the reporting feature because those rows depend on KPI reporting rules. CSV serialization and browser download mechanics remain generic UI/file helpers.

Raster preparation also owns two capture-only corrections for the licensed
Galano font. Elements marked `data-raster-export-text` temporarily receive
relaxed line metrics and wrapping, then their exact prior inline styles are
restored. This prevents html2canvas from clipping tight headings, long mover
labels, and the report footer without changing the live dashboard.

The legacy PDF adapter captures the complete export root once. Its
`html2canvas` `onclone` hook measures `.surface` and
`[data-pdf-keep-together]` bounds in the exact cloned DOM being painted.
`raster-layout.ts` then shifts nominal letter-page cuts to those boundaries,
so card rows are not split and every source pixel is emitted exactly once.
The normal interactive page header and filter toolbar use `no-print`; the
export-only report header already carries the same title and filter context,
so raster and native print output do not duplicate report headers.

## Alternatives Considered

- Leave the DOM preparation helper in `src/lib`. This preserved the current import path but kept dashboard export rules in a catch-all location.
- Move PNG/PDF capture into the reporting feature. That would mix DOM/browser adapter behavior into reporting data-model code.
- Put the legacy PDF adapter in the design-system library. That would make a dashboard-specific report export path look like a generic UI primitive.

## Consequences

- PNG and legacy PDF exports share one tested DOM-preparation rule for report chrome, action hiding, cleanup, and background fallback.
- Multi-page raster PDFs use one cloned layout and deterministic,
  keep-together page planning instead of starting every semantic block on a
  new page.
- Export-only text adjustments are explicit opt-ins and are fully restored
  after successful or failed capture.
- The old `src/lib/export-helpers.ts` and `src/lib/legacy-pdf-export.ts` paths are removed, leaving one export-adapter ownership path.
- PNG and legacy PDF still snapshot rendered dashboard values, while
  redundant headers, clipped custom-font lines, blank PDF pages, and split
  overview cards are removed. Print/CSV remain separate paths.
- The opt-in category/metric legacy control has no server/client hydration
  mismatch.
