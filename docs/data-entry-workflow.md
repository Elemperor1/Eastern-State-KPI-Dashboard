# Data Entry workflow

Data Entry is the Admin-only `/data-entry` destination. There is no standard
versus strategic choice.

## Reporting cycle

1. Select a Reporting Year.
2. Use the checklist to open any measure.
3. Enter the reporting period and the raw inputs shown for its effective
   Measurement Configuration.
4. Choose **Save and continue**.
5. The item becomes Complete only after the server commits the value and its
   immutable audit event.

Checklist states are **Not started**, **Needs attention**, and **Complete**.
Needs attention means Setup must resolve a missing definition or target.
Completion is derived from durable strategic records, so it survives reload
and a new session.

## Supported input shapes

- count, currency, cumulative, and year-over-year: one value;
- binary: Complete or Not complete;
- milestone: progress from 0 through 100;
- percentage and ratio: numerator and denominator, unless the denominator is
  fixed by configuration;
- average: score/possible score, average/scale maximum, or positive/total;
- multi-component: all components stay together in the focused measure form;
- distribution: respondent total plus the effective labeled bands.

The annual `month = 0` storage sentinel is legacy-only and never appears in the
interface.

## Save contract

The visible states are Unsaved, Saving, Saved, and Couldn't save. Saved is
shown only after a successful response. Validation or transport failure keeps
the draft intact. Leaving a dirty form prompts for confirmation. The strategic
mutation routes retain Admin authorization, same-origin/CSRF enforcement, Zod
validation, and atomic audit writes.

Current writes use only:

- `POST`/`DELETE /api/strategy/observations`;
- `POST`/`DELETE /api/strategy/component-entries`; and
- `POST`/`DELETE /api/strategy/distributions`.

Multi-input forms send one batch to `POST /api/strategy/observations`, which
uses `submission_type: "multi_input"` to distinguish the strict batch schema,
then commits every component and distribution input together or rolls the
entire save back.

The old `/api/entries` and `/api/breakdowns` routes are removed. Their tables
and `entry_history` remain a read-only archive visible in Setup → Activity.

## Setup dependencies

Use `/setup?area=measures` for Measurement Configurations, frequencies,
components, bands, and attention filters. Use `/setup?area=goals` for goal
membership, completion rules, and annual/full-plan targets. People owns access;
Activity owns the two immutable audit feeds.

ADR 0022 is the backup, migration, and rollback authority.
