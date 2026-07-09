# Configuration Gap Workflow

## Statuses

| Status | Meaning |
|---|---|
| `draft` | Configuration is being prepared and is not reportable. |
| `needs_definition` | Formula, denominator, methodology, component, or scope is unresolved. |
| `needs_target` | Measurement is defined but its annual/full-plan target is unresolved. |
| `ready` | Definition is complete and can begin reporting. |
| `active` | Definition is in current reporting use. |
| `archived` | Retained for history but excluded from current reporting. |

Unresolved statuses require a nonblank `unresolved_question`. Optional owner,
due date, resolution notes, source reference, and last reviewed date make the
gap actionable and auditable.

## Admin dashboard

`/admin/configuration-gaps` lists:

- KPI, priority, and strategic goal;
- status;
- missing measurement type, target, denominator, or target year indicators;
- unresolved question;
- owner and due date;
- last reviewed date;
- direct link to the KPI editor.

Filters cover priority, goal, status, owner, target year, and reporting
frequency. Summary cards show ready, active, needs-target, needs-definition,
and excluded-goal counts.

## Completion behavior

KPIs in `needs_definition` or `needs_target` remain visible in cards, detail
views, exports, and the gap dashboard. They are excluded from goal denominators
with explicit reasons. They are never counted as failed and never converted to
zero progress.

If every required KPI in a goal is unresolved, the goal itself is excluded and
appears in the dashboard's excluded-goal drilldown.

## Resolution

1. An admin reviews the source and records owner/due date.
2. Measurement definition and target are edited independently.
3. Server validation confirms all required fields for the chosen type.
4. Resolution notes and last-reviewed date are saved.
5. Status advances to `ready` or `active`.
6. An immutable audit event preserves the before/after state and unresolved
   history.

Resolving a gap never deletes its prior events. Historical reports use the
effective configuration for their reporting year.

## Initial known gaps

The canonical mapping intentionally preserves, among others:

- dwell-time target pending the timing study;
- archival TK target/year;
- high-risk flood/climate area definition;
- non-engaged workforce awareness survey methodology;
- demographic age and socioeconomic bands;
- corporate sponsorship/foundation grant targets;
- referral and cultivation definitions;
- school partnership and architecture-program TK targets;
- revenue-composition and government-support targets;
- final board-status and pacing policies.
