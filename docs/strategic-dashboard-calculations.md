# Strategic Dashboard Calculations

## Single source of truth

Pure formulas live in `src/features/strategy/calculations.ts`. Server reporting
models call them; React components, charts, CSV, PNG, and PDF adapters only
render returned values. Export-only formulas are prohibited.

All results return `ok`, `missing`, or `invalid` plus structured issues. Missing
data never becomes JavaScript `NaN`, `Infinity`, or an implicit zero.

## Core formulas

- Percentage: `numerator / denominator x 100`.
- Fixed denominator: `numerator / fixed_denominator x 100` (or configured
  ratio scale).
- Total-score normalization: `total_score / total_possible_score x 100`.
- Derived total possible: `respondent_count x max_score_per_respondent`.
- Average-score normalization: `average_score / maximum_scale x 100`.
- Percent positive: `positive_response_count / total_response_count x 100`.
- YoY: `(current - previous) / abs(previous) x 100`.
- Distribution band: `band_count / respondent_total x 100`.
- Higher-is-better progress with no baseline: `actual / target x 100`.
- Higher-is-better progress with a baseline:
  `(actual - baseline) / (target - baseline) x 100`.
- Lower-is-better progress:
  `(baseline - actual) / (baseline - target) x 100`.

Zero denominator is invalid. A missing target returns `target_not_finalized`.
A zero target remains a valid target and uses explicit direction/baseline rules.
Only ready or active target records participate in calculations; draft,
needs-definition, and needs-target records remain visible to administrators but
cannot change completion. Structured targets resolve through the same target
path: `{ "value": number }` supplies a scalar target and binary
`{ "completed": boolean }` resolves to 1 or 0. A description-only binary target
uses the explicit binary completion threshold of 1. Unknown structured shapes
return `needs_definition` rather than being guessed.

## Legacy compatibility provenance

First-class strategic observations win for an entire KPI history series. When
only legacy values exist, the calculation layer applies explicit, typed
compatibility rules rather than guessing raw inputs:

- stored percentage, normalized-average, and denominator-free-ratio results
  remain exact `legacy_direct_value` results;
- a fixed denominator converts a compatible legacy scalar numerator through
  the normal ratio formula (`30 / 50 x 100 = 60%`);
- non-percent year-over-year values use the matching period in the previous
  reporting year;
- already-derived `%` year-over-year rows remain exact
  `legacy_direct_percentage` results; and
- a first-class raw-count year-over-year observation may use a matching legacy
  raw count as its prior base, but never an already-derived percentage.

Report and export formula copy states when raw bases are unavailable. Retained
compatibility values are not described as recalculated first-class inputs.

## Rounding

`roundFinite` centralizes finite checks and decimal precision. Configuration
allows 0-6 decimal places; calculation internals support a bounded safe range.
Percentages are represented on a 0-100 scale. Formatting occurs after the
calculation and never changes stored raw input.

## Annual pacing versus full-plan progress

The annual and plan outputs are separate:

- annual actual;
- annual target;
- pacing target to date (explicit when available, otherwise a deliberate
  elapsed-fraction projection for evenly paced measures only);
- annual pacing progress;
- annual completion progress;
- cumulative actual through the selected year;
- full-plan target and completion progress.

Annual-only KPIs use their full-year target rather than a month projection.
Milestones and seasonally uneven metrics should provide an explicit pacing
target instead of linear proration.

Example: an exhibit KPI has annual target 1 in 2027 and full-plan target 3 by
2029. One completed exhibit in 2027 produces annual `1 of 1` (100%) and
full-plan `1 of 3` (33.3%). Adding later annual targets does not change 2027.

## Progress state

The calculation returns:

- `not_started`;
- `in_progress`;
- `complete`;
- `exceeded`;
- `target_not_finalized`;
- `needs_definition`.

`actualProgressPercentage` preserves over-performance (for example 120%).
`displayProgressPercentage` caps visual fill at 100%. Text and accessible labels
still show the uncapped result.

## Multi-component safeguards

Each component calculates independently. Sum/average/weighted average require
compatible units. `all_complete` can combine unlike units only because it uses
each component's boolean target result, not their numeric amounts. `none`
returns component results without a parent number.

## Configuration exclusions

Only `needs_definition` and `needs_target` are excluded for product-definition
reasons. A ready/active KPI with no actual is eligible and not started. This
distinction prevents missing data from improving the completion denominator.
