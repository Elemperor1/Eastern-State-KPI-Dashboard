# KPI Measurement Model

## Purpose

The strategic dashboard separates three concepts that the legacy model joined
together:

1. `unit_type` - legacy storage/format compatibility;
2. `measurement_type` - the formula used to calculate a result;
3. `reporting_frequency` - when observations are recorded.

Schema 10 keeps every legacy KPI and value row, then adds effective-dated
configuration in `kpi_measurement_configs`. The selected reporting year chooses
the configuration whose start/end range contains that year. A later edit never
silently changes an earlier report.

## Hierarchy

```text
Strategic priority (categories)
  Strategic goal (strategic_goals)
    KPI membership (goal_kpis)
      KPI (kpis, stable legacy identity)
        Measurement configuration
        Targets
        Observations or legacy values
        Optional components
        Optional distribution bands and observations
```

Membership is explicit by ID. The app no longer infers a strategic goal from
the text before an em dash in the KPI name.

## Measurement types

| Type | Required raw inputs | Calculated result |
|---|---|---|
| `binary` | explicit true/false state | 0% or 100% completion |
| `milestone` | boolean or completed/total milestones | completion percentage |
| `count` | direct finite count | count and progress to target |
| `percentage` | numerator and denominator, or approved direct legacy fallback | numerator / denominator x 100 |
| `average` | raw score/scale/respondents or positive/total responses | normalized score or percent positive |
| `cumulative` | direct period contributions or cumulative snapshot | cumulative actual and plan progress |
| `year_over_year` | current and previous comparable values | percentage change from previous |
| `distribution` | respondent total and named category counts | percentage per category |
| `currency` | finite currency amount, including cents | amount and progress to target |
| `ratio` | numerator plus entered/fixed denominator | numerator / denominator, optionally scaled |
| `multi_component` | independently typed component observations | optional explicit aggregate |

Names and labels never determine the formula. `measurement_type` is mandatory
for ready/active configurations.

## Common configuration fields

- display unit;
- numerator and denominator labels;
- optional positive fixed denominator;
- reporting frequency;
- component aggregation method;
- board status;
- calculation precision (0-6);
- configuration status;
- unresolved question, owner, due date, resolution notes, source reference,
  and last reviewed date;
- effective start/end year.

`current_value` and `previous_period_value` are calculated read-model fields,
not mutable KPI metadata. Raw observations remain queryable so results can be
recalculated when a definition is corrected.

## Reporting frequencies and internal periods

| Frequency | Stored period | User-facing label |
|---|---:|---|
| monthly | 1-12 | January-December |
| quarterly | 1-4 in strategy observations | Q1-Q4 |
| annual | 0 | Full year |
| cumulative | 0 | Cumulative through YEAR |
| one-time | 0 | One-time result |
| flexible | legacy compatibility only | explicit mode required before new writes |

Legacy scalar rows still use `monthly_entries.month`: 1-12 monthly and 0 annual.
The UI must never display `month 0`.

## Targets

`kpi_targets` stores independent annual and full-plan targets. A target has:

- KPI or component owner;
- annual/full-plan scope;
- applicable reporting year for annual targets;
- target year;
- nullable numeric target;
- optional structured target JSON;
- prominent human-readable target description;
- baseline metadata, configuration status, and provenance.

`null` means missing/unresolved. Numeric zero is a real target and remains zero.
Binary targets may use a description without a numeric amount. Years outside
2025-2029 require the explicit external-target flag. The admin editor accepts
structured targets as JSON objects; the shared reporting resolver currently
recognizes `{ "value": number }` and binary `{ "completed": boolean }` forms.
Other object shapes remain preserved but are reported as `needs_definition`
until a calculation contract is approved.

## Components

Components have their own measurement type, unit, raw inputs, target, status,
weight, and order. Their annual/full-plan targets and any component-owned
distribution bands are editable independently from the parent KPI. They
calculate independently. Parent aggregation is one of:

- `none` - show components without a parent number;
- `average` - only compatible normalized units;
- `weighted_average` - only compatible normalized units with positive weights;
- `sum` - only compatible additive units;
- `all_complete` - every required component must meet its own target.

Unrelated units are never averaged or summed. For example, participant counts,
workshop counts, and video views display together but have no aggregate total.

## Demographic distributions

Bands are configurable, ordered, effective-dated, and archivable. Historical
values preserve the label used when recorded. Exclusive distributions require
category counts to equal the respondent total. Non-exclusive categories may
exceed the total only when that mode is explicitly enabled. Unknown, declined,
or missing categories are ordinary configured bands, not silently discarded.

An optional `derived_group` marker (`white` or `non_white`) supports a derived
non-white respondent percentage without discarding the full category
distribution. The derived percentage is emitted only for mutually exclusive
bands; overlapping responses cannot be summed into a defensible person-level
share.

The UI must show the respondent denominator and must not imply a sample
represents all visitors unless the source methodology supports that claim.
