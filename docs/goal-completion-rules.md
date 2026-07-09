# Goal Completion Rules

## Eligibility comes first

Goal completion is calculated from named strategic goals, never from the count
of KPI rows. Before a rule runs, each KPI membership is classified:

- informational KPI: visible but excluded from completion;
- `needs_definition` or `needs_target`: excluded with the exact reason;
- draft or archived: excluded;
- configured KPI with no actual yet: eligible and `not started` (0%);
- configured KPI with valid progress: eligible.

A goal with no eligible required KPI is excluded from priority and organization
denominators. Undefined KPIs are not silently treated as failures.

## Rules

### `all_required_kpis` (default)

The goal is complete only when every eligible required KPI meets its target.
Informational and unresolved KPIs do not block it. The displayed progress is
the average of eligible capped KPI progress, while completion still requires
every member.

### `weighted_average`

The goal's progress is the weighted average of eligible KPI progress. Weights
must be non-negative and total more than zero. Completion occurs at the
configured threshold (100% by default). Displayed goal progress is capped at
100%, while KPI detail may show over-performance.

### `threshold_count`

Exactly one threshold must be configured:

- an absolute count of eligible KPIs that must meet target; or
- a percentage of eligible KPIs, rounded upward to a count.

The goal is complete when the number of completed eligible KPIs meets that
threshold.

### `manual_status`

An authorized admin explicitly sets `not_started`, `in_progress`, or
`complete`. The mutation is server-validated and audit logged. An unset manual
status excludes the goal rather than guessing.

## Summary contract

Every priority and organization summary returns:

- `completed_goals_count`;
- `total_eligible_goals_count`;
- `completion_percentage`;
- `excluded_goals_count`;
- `excluded_goals_reasons`.

The main dashboard renders both percentage and raw count, for example:
`58% - 7 of 12 goals completed`. Excluded/unconfigured goals are shown
separately with a drilldown.

## Historical behavior

The selected reporting year controls goal membership, KPI configuration,
annual target, and actuals. Full-plan progress always uses the plan target and
cumulative actual through the selected year. Future configurations do not
rewrite historical goal results.

## Authorization and audit

Only admins may change rules, thresholds, membership role/weight, or manual
status. Each change creates a snapshot event containing the goal name,
priority, before/after value, actor, and timestamp. Archiving a goal never
deletes its history.
