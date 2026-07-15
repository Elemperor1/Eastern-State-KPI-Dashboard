# Impeccable final-pass performance evidence

Recorded July 15, 2026 with the repository's `scripts/performance-profile.mjs`
against the same loopback development server and sample database before and
after the targeted report-rendering change. Desktop used 1280×900 without
throttling. Mobile used 390×844, 4× CPU slowdown, 150 ms RTT, 1.6 Mbps down,
and 0.75 Mbps up. Chrome trace totals include all matching renderer events in
each navigation trace.

## Confirmed bottleneck

The Board Report was the only route outside the normal product range: 6,865
DOM elements and about 659 KB of decoded document content, versus 297–481 DOM
elements on Overview, Data Entry, and Setup. The report must remain complete,
visible, printable, and exportable, so virtualization or omission was not an
acceptable optimization.

## Change

- Off-viewport Measure evidence now uses `content-visibility: auto` with a
  stable intrinsic block size, deferring layout and paint without removing any
  content from the document or accessibility tree.
- Print forces all Measure evidence visible.
- PNG/PDF preparation temporarily forces every deferred Measure visible before
  measuring and capturing the complete report, then restores the screen state.
- Galano Grotesque uses `font-display: swap`; regular and medium remain
  preloaded, so slow font delivery no longer creates an invisible-text window.

## Before and after

| Profile | Metric | Before | After | Change |
| --- | ---: | ---: | ---: | ---: |
| Desktop | Layout time | 23.76 ms | 9.31 ms | −60.8% |
| Desktop | Style update time | 17.74 ms | 8.16 ms | −54.0% |
| Desktop | Pre-paint time | 5.48 ms | 1.74 ms | −68.2% |
| Desktop | Paint time | 3.32 ms | 1.47 ms | −55.7% |
| Throttled mobile | Layout time | 432.50 ms | 80.62 ms | −81.4% |
| Throttled mobile | Style update time | 94.36 ms | 53.51 ms | −43.3% |
| Throttled mobile | Pre-paint time | 74.00 ms | 24.17 ms | −67.3% |
| Throttled mobile | Paint time | 29.26 ms | 15.98 ms | −45.4% |
| Throttled mobile | LCP | 1,948 ms | 1,640 ms | −15.8% |

The DOM count is intentionally unchanged because the complete 59-Measure
report remains semantic and available. Decoded document size increased by
about 0.5% from the explicit deferral/export markers. Desktop LCP moved from
1,088 ms to 1,324 ms while its renderer work fell substantially; the paired
development-server traces also had different server response times, so that
single desktop LCP movement is treated as run variance rather than a claimed
improvement. The direct layout/paint totals and throttled-mobile LCP are the
decision evidence for keeping the change.

Focused export-preparation tests protect forced visibility and restoration.
The full browser acceptance suite remains the release gate for complete PNG,
PDF, CSV, and print behavior.
