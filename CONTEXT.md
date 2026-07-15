# Eastern State Performance Measurement

This context describes how Eastern State Penitentiary Historic Site defines, records, evaluates, and reports organizational performance. It distinguishes the historical KPI dashboard language from the first-class strategic-plan language so targets, progress, and history remain unambiguous.

`docs/product-foundation.md` is the authority for canonical product and surface
vocabulary. This glossary deliberately retains qualified source,
implementation, and legacy terms where the bounded-context distinction matters;
those terms are not interchangeable interface labels.

## Strategic plan structure

**Strategic Plan**:
The time-bounded organizational plan whose Strategic Priorities, Strategic Goals, KPIs, Targets, and Reporting Years define strategic performance.
_Avoid_: Dashboard, scorecard

**Strategic Priority**:
A top-level area of the Strategic Plan that groups related Strategic Goals.
_Avoid_: Category, pillar

**Legacy Category**:
The historical dashboard grouping that represents a Strategic Priority in catalog and comparison reporting. Use this term only when the legacy distinction matters.
_Avoid_: Category, Strategic Priority when referring to historical dashboard metadata

**Strategic Goal**:
A named outcome within a Strategic Priority whose completion is evaluated from its eligible Goal–KPI Memberships and Goal Completion Rule.
_Avoid_: Goal, Legacy KPI Goal, target

**Goal–KPI Membership**:
The effective-dated relationship that assigns a KPI to a Strategic Goal with a required or informational role, order, and optional weight.
_Avoid_: Link, mapping, assignment

**KPI**:
A stable performance indicator whose identity persists across measurement definitions, observations, targets, and reports.
_Production label_: Measure, when the screen does not need the formal domain term.
_Avoid in domain code and audit contracts_: Metric, field

**Legacy KPI Goal**:
A historical per-KPI target anchored to a fixed baseline and target year. It is not a named outcome in the Strategic Plan.
_Avoid_: Goal, Strategic Goal, KPI Goal, Plan Goal

**Effective Year Range**:
The span of Reporting Years during which a strategic definition or relationship applies.
_Avoid_: Reporting Period, creation date

## Measurement definition

**Measurement Configuration**:
The effective-dated definition of how a KPI is measured, including its formula family, unit, reporting cadence, aggregation, precision, readiness, and provenance.
_Avoid_: KPI config, formula config

**Measurement Type**:
The formula family that determines which raw inputs are valid and how a Calculated Result is derived.
_Avoid_: Unit Type, Reporting Frequency

**Unit Type**:
The historical dashboard classification that controls storage, formatting, and comparison behavior for a Metric Fact.
_Avoid_: Measurement Type, display unit

**Reporting Frequency**:
The cadence at which a KPI accepts observations, such as monthly, quarterly, annual, cumulative, or one-time.
_Avoid_: Reporting Period, Measurement Type

**Reporting Period**:
A concrete position within a Reporting Year for which an Observation is recorded or a Calculated Result is evaluated.
_Avoid_: Reporting Frequency, date range

**KPI Component**:
An independently defined and measured part of a multi-component KPI, with its own raw inputs, unit, target, status, weight, and order.
_Production label_: Input, when the screen does not need the formal domain term.
_Avoid in domain code and audit contracts_: Child KPI, field, submetric

**Aggregation Method**:
The approved rule for combining compatible KPI Component results, or for deliberately leaving them uncombined.
_Avoid_: Rollup when referring to component arithmetic

**Goal Completion Rule**:
The declared rule that evaluates a Strategic Goal from its Goal–KPI Memberships, such as all required KPIs, weighted average, threshold count, or manual status.
_Avoid_: Aggregation Method, KPI direction

**Configuration Status**:
The readiness state of a strategic definition or target: being prepared, missing a definition, missing a target, ready, active, or archived.
_Avoid_: Board Status, Progress State, Calculation State

**Configuration Gap**:
An unresolved measurement definition or target that keeps a KPI visible but excludes it from completion until the missing decision is resolved.
_Avoid_: Missing data, failed KPI

**Board Status**:
The explicit management assessment of a KPI or Strategic Goal, independent of its calculated progress and configuration readiness.
_Avoid_: Configuration Status, Progress State, Calculation State

## Recorded values and calculations

**Metric Fact**:
Recorded measurement evidence associated with a KPI and time context. Prefer the precise subtype when the distinction matters.
_Avoid_: Entry as a universal term, Calculated Result

**Legacy Entry**:
A historical scalar, annual, or labeled breakdown actual retained for dashboard comparison and backward-compatible reporting.
_Avoid_: Observation, Calculated Result

**Legacy Breakdown Entry**:
A named subvalue of a KPI for a Reporting Period, used when a Legacy Entry is represented as labeled parts rather than one scalar.
_Avoid_: Distribution Observation, KPI Component

**Observation**:
The raw inputs recorded for one strategic KPI and Reporting Period so its Calculated Result can be reproduced.
_Avoid_: Metric Fact, Calculated Result, score

**Component Entry**:
The raw inputs recorded for one KPI Component and Reporting Period.
_Avoid_: Observation when the inputs belong to a KPI Component

**Distribution Observation**:
A respondent total and ordered set of band counts recorded for one KPI or KPI Component and Reporting Period.
_Avoid_: Legacy Breakdown Entry, percentage list

**Distribution Band**:
An effective-dated named classification used by Distribution Observations whose historical meaning is preserved when later labels change.
_Avoid_: Breakdown label, demographic group

**Calculated Result**:
The reproducible outcome derived from raw inputs under a Measurement Configuration, together with an explicit Calculation State and issues.
_Avoid_: Observation, Metric Fact, stored value

**Calculation State**:
The classification of a Calculated Result as valid, missing, or invalid; missing and invalid are never implicit zeroes.
_Avoid_: Progress State, Board Status

## Targets and progress

**Target**:
The desired outcome for a KPI or KPI Component, expressed as an annual or full-plan expectation and possibly as a numeric, structured, or qualitative value.
_Avoid_: Strategic Goal, Legacy KPI Goal

**Annual Target**:
A Target for one Reporting Year.
_Avoid_: Full-Plan Target, pacing target

**Full-Plan Target**:
A cumulative Target due by a Strategic Plan target year.
_Avoid_: Annual Target, Legacy KPI Goal

**Baseline Value**:
The fixed reference value and year from which progress toward a Target is measured.
_Avoid_: Previous-Period Value, moving baseline

**Previous-Period Value**:
The comparable prior actual used to calculate period-over-period or year-over-year change.
_Avoid_: Baseline Value, Target

**Annual Pacing**:
Progress against the expected portion of an Annual Target by the selected point in the Reporting Year.
_Avoid_: Annual Completion, Full-Plan Progress, YTD completion

**Annual Completion**:
Progress of the reported annual actual against the complete Annual Target.
_Avoid_: Annual Pacing, Full-Plan Progress

**Full-Plan Progress**:
Progress of the cumulative actual against the Full-Plan Target.
_Avoid_: Annual Completion, Annual Pacing

**Progress State**:
The calculated classification of target progress, such as not started, in progress, complete, exceeded, target not finalized, or needs definition.
_Avoid_: Board Status, Configuration Status, Calculation State

**Eligible KPI**:
A required KPI whose configuration is sufficiently resolved to participate in Strategic Goal completion.
_Avoid_: Active KPI, reported KPI

**Required KPI**:
A KPI whose valid progress may contribute to its Strategic Goal's completion result.
_Avoid_: Informational KPI, mandatory observation

**Informational KPI**:
A KPI shown within a Strategic Goal but excluded from that goal's Completion Denominator.
_Avoid_: Required KPI, failed KPI

**Goal Completion**:
The evaluation of a Strategic Goal under its Goal Completion Rule using only eligible Goal–KPI Memberships.
_Avoid_: Average KPI improvement, Legacy KPI Goal progress

**Completion Denominator**:
The eligible KPIs or Strategic Goals included when a completion percentage is calculated; excluded items remain visible with reasons.
_Avoid_: Total configured items, total visible items

**Eligible Goal**:
A Strategic Goal with a valid completion result that may enter Strategic Priority and organization completion denominators.
_Avoid_: Active goal, incomplete goal

**Strategic Rollup**:
A Strategic Priority or organization summary based on completed Eligible Goals rather than on averaging KPI rows.
_Avoid_: KPI average, metric rollup

## Reporting

**Reporting Year**:
The year whose effective definitions, observations, targets, and progress are being evaluated.
_Avoid_: Calendar selection, target year

**Dashboard Comparison**:
A current Reporting Year and comparison year evaluated through a selected month for historical KPI reporting.
_Avoid_: Strategic Plan progress

**Board Report**:
The organization-to-Strategic Priority-to-Strategic Goal-to-KPI view of strategic results, target progress, readiness, and unresolved reporting items.
_Avoid_: Dashboard, export file

## History and lifecycle

**Entry History**:
The append-only record of Legacy Entry changes, using immutable snapshots so events remain understandable after current metadata changes.
_Avoid_: Activity log, current state

**Strategic Audit Event**:
An immutable before-and-after record of a strategic definition, lifecycle, or value-entry change.
_Avoid_: Entry History record, mutable log entry

**Immutable Snapshot**:
The display and context values captured when an audited change occurs and preserved independently of later renames or deletions.
_Avoid_: Live metadata, cached label

**Tombstone**:
The audited deletion record that preserves the prior value and context after a Legacy Entry is removed.
_Avoid_: Archived entity, placeholder row

**Archive**:
A reversible lifecycle state that retains a strategic entity and its history while excluding it from current reporting.
_Avoid_: Delete, disable

**Delete**:
The removal of a Metric Fact or non-strategic catalog entity after required historical context has been preserved.
_Avoid_: Archive, hide

## Identity and access

**User Account**:
The durable identity used for sign-in, role assignment, disablement, and session revocation.
_Avoid_: Session, actor

**Actor**:
The User Account, operator, or system identity attributed to an audited change.
_Avoid_: Owner, session

**Admin**:
The role permitted to perform protected mutations and manage accounts and strategic definitions.
_Avoid_: Superuser, owner

**Viewer**:
The role permitted to read session-gated reporting but not perform admin-gated mutations.
_Avoid_: Guest, anonymous user

## Exports

**Report Export**:
A CSV, PNG, or PDF representation derived from the same reporting truth as the dashboard or Board Report.
_Avoid_: Independent report calculation, database dump
