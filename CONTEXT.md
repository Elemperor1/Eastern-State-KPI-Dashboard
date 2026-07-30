# Eastern State Performance Measurement

This context describes how Eastern State Penitentiary Historic Site defines, records, evaluates, and reports organizational performance. It distinguishes the historical KPI dashboard language from the first-class strategic-plan language so targets, progress, and history remain unambiguous.

`docs/product-foundation.md` is the authority for canonical product and surface
vocabulary. This glossary deliberately retains qualified source,
implementation, and legacy terms where the bounded-context distinction matters;
those terms are not interchangeable interface labels.

## Strategic plan structure

**Organization**:
The persisted installation owner whose display identity and Strategic Plan are
managed in Setup. The product currently supports exactly one active
Organization and does not expose tenant selection.
_Avoid_: Tenant, customer, hard-coded brand name

**Strategic Plan**:
The persisted, time-bounded organizational plan whose Strategic Priorities,
Strategic Goals, KPIs, Targets, and Reporting Years define strategic
performance. After initialization, its database row and descendants are the
content authority; bootstrap fixtures are not runtime fallbacks.
_Avoid_: Dashboard, scorecard

**Successor Strategic Plan**:
A separate Draft Strategic Plan prepared to replace the Active Strategic Plan
for a later planning cycle. It may begin blank or copy selected structure, but
it owns its own Strategic Priorities, Strategic Goals, KPIs, Targets, and Board
reporting scope.
_Avoid_: Plan extension, future version

**Preservation-Only Lifecycle Upgrade**:
The introduction of Successor Strategic Plan capability without changing the
identity, ownership, meaning, or history of any existing user, Strategic Plan,
plan-owned definition, relationship, Target, result, Board setting, or audit
record. The existing plan remains Active, receives no invented predecessor, and
no successor Draft is created automatically.
_Avoid_: Catalog reset, synthetic successor, historical rewrite

**Staged Lifecycle Enablement**:
The release sequence that first introduces the Preservation-Only Lifecycle
Upgrade while successor-plan creation remains unavailable, verifies the
existing installation is unchanged, and then enables the Plans interface. The
completed installation leaves successor planning available; the staging
boundary is not a permanent feature mode.
_Avoid_: Permanent hidden feature, unverified immediate enablement

**Production-Clone Migration Rehearsal**:
The required pre-release proof performed on a restored copy of the real server
database before its live database is changed. It compares stable identities,
counts, and strategic content before and after the upgrade; verifies database
integrity, reporting, Board scope, users, and audit history; proves a second
upgrade is a no-op; and proves the backup can be restored with the previous
application release.
_Avoid_: First migration on live data, sample-only rehearsal

**Dashboard Plan Administration**:
The boundary that lets a nontechnical Admin create, clone, configure, review,
cancel, and activate a Successor Strategic Plan entirely within Setup → Plans.
The dashboard presents readiness, validation, confirmation, and activation
safety in plain language and starts required safeguards without asking the
Admin to use server commands.
_Avoid_: Operator-managed plan creation, command-line activation

**Operational Assurance Boundary**:
The technical work that remains with the system operator rather than the
dashboard Admin: application release testing, database migration, deployment,
backup restoration, emergency recovery, and infrastructure verification.
_Avoid_: Admin release console, hidden technical steps in Plans

**Dashboard Lifecycle Acceptance**:
The required pre-release walkthrough on a disposable release-candidate
installation. A nontechnical Admin completes the full Successor Strategic Plan
workflow using only the dashboard; a Viewer validates Active and Archived
reporting without Draft access; and a Board user validates preserved Board
scope. Any ordinary lifecycle step requiring server commands or technical
interpretation fails acceptance.
_Avoid_: Developer-only acceptance, live-plan rehearsal

**Lifecycle Documentation Set**:
The complete handoff material for Successor Strategic Plans: a plain-language
leadership overview, dashboard Admin guide, Viewer and Board guidance,
operator migration and recovery runbook, and QA acceptance record. The
dashboard remains understandable without a manual; documentation supports
orientation, training, operations, and durable evidence.
_Avoid_: One mixed-audience manual, documentation-dependent interface

**Lifecycle Release Cutover**:
The planned maintenance window for introducing Successor Strategic Plans to the
live installation. Normal access stops before a verified backup, preservation
upgrade, integrity checks, deployment, existing-behavior verification, staged
Plans enablement, and production smoke checks. Access reopens only after every
cutover check passes.
_Avoid_: Live migration with active writers, enable before verification

**Successor Lifecycle Rollback Boundary**:
The point before the first successor-plan lifecycle record is saved. Before
that point, an operator may restore the pre-migration backup and matching prior
application release. After a Draft, cancellation, activation, or related
lifecycle record exists, automatic rollback is forbidden because it would
discard authoritative work; recovery preserves the current database and
repairs forward unless an explicitly approved disaster decision accepts loss.
_Avoid_: Version-only rollback, silent successor-data loss

**Non-Destructive Production Smoke**:
The live post-cutover check that verifies Plans availability, role boundaries,
existing reports, and exports without creating a Draft, cancelling work, or
activating a plan in the real database. Complete lifecycle behavior is proven
on the restored production clone before cutover.
_Avoid_: Live lifecycle rehearsal, sample plan in production

**Practical Lifecycle Release Gate**:
The concise go-live standard for Successor Strategic Plans: automated checks
pass, the preservation upgrade and rollback work on a restored real-data copy,
the dashboard workflow works for a nontechnical Admin, existing data and
reporting remain unchanged, documentation is current, and a non-destructive
live smoke succeeds. It requires no named signoffs or formal approval dossier.
_Avoid_: Informal untested release, ceremonial release governance

**Plan Predecessor Link**:
The immutable relationship from every Successor Strategic Plan to the immediate
Strategic Plan it succeeds, regardless of whether it began Blank or as a
Structural Clone. The link records the creation method and establishes the
planning-cycle chain; a blank plan's newly created items do not receive
item-level Successor Lineage.
_Avoid_: Shared plan identity, cloned item lineage

**Draft Strategic Plan**:
A Successor Strategic Plan that can be configured and reviewed without
changing the plan currently used for reporting and Data Entry.
_Avoid_: Inactive plan, staging plan

**Successor Draft Limit**:
The rule that an Organization may prepare no more than one Draft Strategic
Plan at a time. While that draft exists, work continues on it rather than
creating a competing successor.
_Avoid_: Draft history, one plan forever

**Cancelled Strategic Plan**:
A Draft Strategic Plan that an Admin deliberately ends without deleting it.
It becomes permanently read-only, retains its Plan Predecessor Link, lineage,
and audit history, and no longer counts against the Successor Draft Limit. It
was never Active and therefore does not appear as a prior plan in Archived
Plan Review or ordinary historical reporting.
_Avoid_: Deleted plan, Archived Strategic Plan, abandoned editable draft

**Draft Cancellation Confirmation**:
The special confirmation required before a Draft Strategic Plan becomes a
Cancelled Strategic Plan. The Admin must enter the Draft's exact plan name
after being told that the Draft and all its work will become permanently
read-only, while Active and historical reporting data remain untouched. No
written cancellation reason is required.
_Avoid_: Delete confirmation, ordinary save confirmation

**Cancelled Plan Review**:
The Admin-only, read-only record of a Cancelled Strategic Plan available from
Setup → Plans. It preserves the cancelled Draft's content, lineage, and
lifecycle history for accountability but is excluded from Overview, Data
Entry, Reports, and exports because the plan was never Active.
_Avoid_: Archived Plan Review, cancelled performance report

**Single-Admin Lifecycle Authority**:
The rule that one authenticated Admin may create, edit, cancel, and activate a
Successor Strategic Plan without a second Admin's approval. Consequential
actions still require their specified confirmation, concurrency checks, and
immutable audit records.
_Avoid_: Dual approval, unaudited sole control

**Strategic Plan Lifecycle Event**:
An immutable audit record written in the same transaction as every successful
Strategic Plan lifecycle action. It identifies the Admin, timestamp, action,
affected plan and predecessor, before-and-after lifecycle state, checked
revisions, supplied confirmation or reason, and completed result. Rejected or
failed attempts belong in operational security logs and never appear as
completed lifecycle events.
_Avoid_: Mutable activity note, failed action recorded as completed

**Lifecycle Activity View**:
The Admin-only presentation of Strategic Plan Lifecycle Events in Setup →
Activity, filterable by Strategic Plan and lifecycle action. Viewer and Board
access does not include administrative lifecycle details.
_Avoid_: Board audit report, editable activity log

**Active Strategic Plan**:
The single Strategic Plan currently used by Overview, Data Entry, Reports, and
Setup for ordinary work.
_Avoid_: Current year, default plan

**Atomic Active Replacement**:
The rule that an Active Strategic Plan can become Archived only within a
successful Plan Activation transaction that simultaneously makes its ready
successor Active. No standalone archive action is permitted, so the
Organization never has zero Active Strategic Plans.
_Avoid_: Manual active-plan archive, archive then activate

**Archived Strategic Plan**:
A prior Strategic Plan preserved as a read-only historical record after its
successor is activated.
_Avoid_: Deleted plan, inactive plan

**Archived Plan Immutability**:
The invariant that an Archived Strategic Plan and every plan-owned definition,
relationship, Target, Board scope, recorded result, note, lineage record, and
audit event it owns reject mutation at every write boundary. Read-only
presentation is not sufficient enforcement.
_Avoid_: Hidden edit controls, best-effort archive

**Activation Identity Preservation**:
The invariant that Plan Activation changes lifecycle status without
renumbering, reparenting, or moving any plan-owned item. The predecessor and
successor retain their distinct Plan-Owned Identities and ownership links.
_Avoid_: Activation migration, shared active identity

**Archived Plan Review**:
A read-only historical context opened from Reports or the Plan Manager for one
Archived Strategic Plan. It does not replace the Active Strategic Plan used by
Overview or Data Entry and is never an app-wide plan switch.
_Avoid_: Active plan selection, historical Data Entry

**Archived Plan Access**:
The rule that every authenticated user may open Archived Plan Review. Archived
Strategic Plan information remains unavailable without a valid signed-in
session.
_Avoid_: Public archive, Admin-only history

**Archived Report Scope**:
The report detail available during Archived Plan Review. Admins and Viewers may
review the full archived reports; Board users remain limited to that Strategic
Plan's preserved Board report and its approved exports.
_Avoid_: Public report, current Board scope

**Archived Report Set**:
The read-only Board Reports, Strategic Trends, Priority, Goal, and Measure
details, Targets, recorded results, and CSV, PNG, and PDF exports retained for
an Archived Strategic Plan. It excludes Data Entry, editing, readiness, and
Plan Activation controls.
_Avoid_: Archived dashboard, editable report

**Historical Report Reconstruction**:
The generation of an Archived Report Set from the Archived Strategic Plan's
immutable definitions, Targets, Board scope, and recorded results when a user
opens or exports it. The output identifies the historical Reporting Period and
the date it was generated; it is not limited to files captured at Plan
Activation.
_Avoid_: Live-plan recalculation, activation snapshot

**Plan-Era Language**:
The names, descriptions, definitions, Targets, and Board scope owned by a
Strategic Plan and used whenever its reports are reconstructed. An Archived
Strategic Plan never substitutes wording or settings from a successor.
_Avoid_: Current label, shared latest definition

**Historical Completeness Disclosure**:
The rule that Archived Plan Review preserves the full historical structure and
labels missing or unfinished reporting as Not reported or Incomplete. Reports
and exports never hide an unreported item in a way that makes the plan appear
more complete than it was.
_Avoid_: Empty-item suppression, inferred completion

**Viewing Plan Selector**:
The Reports control that opens Archived Plan Review without changing the Active
Strategic Plan. It lists the Active plan first, groups older plans as Archived,
and keeps a visible read-only notice with a direct return to the Active plan.
_Avoid_: Global plan switch, Reporting Year selector

**Request-Scoped Plan Context**:
The rule that an Archived Plan Review applies only to its explicit Reports link
and may be bookmarked without becoming a remembered app-wide selection. Normal
Reports navigation, Overview, Data Entry, and a new signed-in session use the
Active Strategic Plan.
_Avoid_: Sticky archive, account plan preference

**Plan Activation**:
The lifecycle transition that makes a ready Draft Strategic Plan active while
archiving its predecessor as one indivisible change.
_Avoid_: Plan switch, plan replacement

**Atomic Plan Activation**:
The transaction that rechecks the Admin, Whole-Plan Revision, Current Readiness
Evaluation, predecessor identity, and exactly-one-Active-plan invariant before
archiving the predecessor, activating the successor, and writing their
Strategic Plan Lifecycle Events. Every step commits together. Any failure rolls
back the entire transaction, leaving the predecessor Active and the successor
Draft without exposing an intermediate lifecycle state.
_Avoid_: Best-effort activation, archive then activate

**Activation Validation Failure**:
The unchanged outcome when the final activation check finds a stale revision,
new blocker, invalid or expired exception, or another unmet rule before the
lifecycle transition commits. The Admin returns to activation review with each
problem and corrective action identified separately. No confirmation,
Readiness Override, or lifecycle change is recorded as completed.
_Avoid_: Partial activation, generic activation error

**Plan Activation Confirmation**:
The final Admin confirmation for Plan Activation. It identifies the predecessor
becoming Archived, the successor becoming Active, both plans' Reporting Years,
the immediate Activation Cutoff, every Activation Warning, and every Readiness
Override, then requires the Admin to enter the successor's exact plan name.
_Avoid_: Ordinary save confirmation, implicit activation consent

**Idempotent Plan Activation**:
The guarantee that retrying the same Plan Activation after an interrupted or
lost response returns the one authoritative completed outcome without running
the transition again or duplicating lifecycle events. The committed database
state, activation identity, and original audit records determine the result.
_Avoid_: Duplicate activation, false failed activation

**Pre-Activation Backup**:
A consistent, verified SQLite backup created by the server before Atomic Plan
Activation begins. Plan Activation cannot proceed when the backup cannot be
created or verified; the Active and Draft plans remain unchanged and the Admin
is directed to the operator. The backup is identified in operational recovery
records without exposing its server path to ordinary users.
_Avoid_: Best-effort backup, post-activation snapshot

**Operator-Only Activation Recovery**:
The recovery boundary after Plan Activation has committed. The product has no
in-app undo action; an operator must first take the application out of service,
inspect the committed database and activation records, and use the verified
Pre-Activation Backup only through the documented recovery procedure.
_Avoid_: Admin rollback button, lifecycle reversal during live use

**Post-Activation Write Safeguard**:
The recovery rule that a Pre-Activation Backup cannot be restored
automatically after any value, configuration, or other mutation commits after
Plan Activation. The operator preserves and backs up the current database, then
investigates or repairs forward so newer work is not silently erased.
_Avoid_: Destructive automatic rollback, ignored successor work

**Active Plan Integrity Incident**:
The fail-closed condition when the application detects zero or multiple Active
Strategic Plans. Normal use and every mutation become unavailable; health
reports only a privacy-safe unavailable status, and the operator follows the
recovery runbook. The application never chooses or repairs an Active plan
automatically.
_Avoid_: Automatic active-plan selection, read-write degraded mode

**Activation Session Continuity**:
The rule that Plan Activation does not sign users out. On their next navigation
or refresh, signed-in users enter the new Active Strategic Plan according to
their existing role. A predecessor form submitted after the Activation Cutoff
is rejected with a clear refresh instruction and cannot write to either plan.
_Avoid_: Forced activation logout, stale predecessor save

**Post-Activation Verification**:
The fresh read-only checks performed after Atomic Plan Activation commits and
before the product announces complete success. They confirm that the successor
loads as the single Active plan, the predecessor opens read-only as Archived,
the preserved Board scope resolves, and readiness health remains healthy. A
failure states that activation committed but verification failed, blocks new
mutations, and directs the operator to recovery without retrying or restoring
automatically.
_Avoid_: Commit-only success, automatic post-commit rollback

**Activation Write Pause**:
The brief save boundary around Plan Activation. Existing mutations finish
before the pause; new mutations receive a clear retry-later response while
viewing remains available. The server then creates the Pre-Activation Backup,
performs Atomic Plan Activation, completes Post-Activation Verification, and
releases saves against the resulting authoritative plan state.
_Avoid_: Full maintenance outage, writes between backup and activation

**Activation Restart Reconciliation**:
The startup inspection after a server interruption during Plan Activation. A
predecessor still Active with its successor still Draft means activation did
not commit. A predecessor Archived with its successor Active and matching
lifecycle events means activation committed and requires Post-Activation
Verification. Any other combination is an Active Plan Integrity Incident.
Startup never resumes or replays the transition automatically.
_Avoid_: Automatic activation resume, status guessing

**Safe Pre-Write Activation Restore**:
The operator recovery allowed when Plan Activation committed but
Post-Activation Verification failed before the Activation Write Pause released
new saves. The operator keeps the app unavailable, preserves the failed
committed database, restores the verified Pre-Activation Backup, confirms the
predecessor is Active and successor Draft, reruns health and integrity checks,
and only then reopens service.
_Avoid_: Live restore, restore after successor writes

**Activation Recovery Record**:
The durable evidence created for every operator recovery. It preserves the
failed database and records the activation identity, backup identity, operator,
timestamps, integrity checks, actions, and final outcome outside the database
being restored. After a Safe Pre-Write Activation Restore, the restored
database also receives an immutable event identifying the recovered activation.
_Avoid_: Restore without receipt, audit history erased by restore

**Activation Recovery Retention**:
The protection period for each Pre-Activation Backup and preserved failed
database. The activation workflow cannot delete them before Post-Activation
Verification passes, the operator confirms cutover, and at least one scheduled
backup of the new Active state succeeds. Afterward they follow the server's
normal backup-retention policy.
_Avoid_: Immediate activation-backup deletion, permanent unmanaged copy

**Plan Readiness**:
The reviewed state of a Draft Strategic Plan that distinguishes conditions
which normally prevent Plan Activation, conditions that may proceed with a
clear warning, and non-overridable lifecycle rules.
_Avoid_: Reporting completeness, plan progress

**Hard Activation Rule**:
A non-overridable lifecycle or integrity rule required for Plan Activation,
including valid plan-year ownership, the Activation Eligibility Date, exactly
one Active Strategic Plan, and preservation of historical meaning.
_Avoid_: Readiness Requirement, Activation Warning

**Readiness Requirement**:
A condition the Draft Strategic Plan is normally expected to satisfy before
Plan Activation because the plan would otherwise be incomplete, unreviewed, or
difficult to use. An Admin may proceed only through an explicit Readiness
Override.
_Avoid_: Hard Activation Rule, optional suggestion

**Readiness Override**:
The Admin's explicit decision to proceed despite an unmet Readiness
Requirement. Each overridden requirement requires its own plain-language
reason, Admin attribution, activation time, and immutable audit record. A
Readiness Override cannot bypass a Hard Activation Rule.
_Avoid_: Ignored warning, validation bypass

**Open Readiness Exception**:
An unmet Readiness Requirement covered by a Readiness Override when Plan
Activation completes. It remains visible to Admins in Plans and Activity until
resolved; its immutable activation audit remains afterward, and reports
continue to show the underlying missing or limited information honestly.
_Avoid_: Cleared warning, hidden exception

**Readiness Outcome**:
The plain-language summary of a Draft Strategic Plan's Plan Readiness: **Ready
to activate**, **Ready with warnings**, **Needs decisions**, or **Cannot
activate**. The outcomes distinguish satisfied requirements, acknowledged
warnings, overridable requirements, and failing Hard Activation Rules.
_Avoid_: Configuration Status, Board Status

**Current Readiness Evaluation**:
The automatic evaluation of Plan Readiness from the latest saved revision of a
Draft Strategic Plan. It updates after each saved change and is evaluated again
immediately before Plan Activation; there is no manual ready flag.
_Avoid_: Mark ready switch, cached approval

**Activation Warning**:
An acknowledged condition that does not prevent Plan Activation because it
leaves the Strategic Plan's meaning and lifecycle integrity intact. The final
activation step uses one acknowledgment for the complete visible warning list;
individual warning reasons are not required.
_Avoid_: Hard Activation Rule, Readiness Requirement

**Activation Question Classification**:
The Admin's explicit decision that an unresolved successor-plan question must
either be answered before Plan Activation or may remain as an acknowledged
follow-up. Unclassified questions are unmet Readiness Requirements; approved
follow-up questions are Activation Warnings with a recorded explanation.
_Avoid_: Silently unresolved question, automatic warning

**Plan-Year Continuity**:
The rule that a Successor Strategic Plan begins in the Reporting Year
immediately after its predecessor ends. Consecutive Strategic Plans neither
overlap nor leave an unowned Reporting Year between them.
_Avoid_: Activation date, calendar continuity

**Flexible Plan Duration**:
The rule that an Admin chooses a Successor Strategic Plan's final Reporting
Year from the organization's approved plan. Plan-Year Continuity determines
the first Reporting Year, but consecutive Strategic Plans need not have equal
durations.
_Avoid_: Open-ended plan, inherited duration

**Plan-Date Review**:
A required Successor Review triggered when the predecessor's final Reporting
Year changes after a Draft Strategic Plan exists. The Draft is not moved
silently and cannot undergo Plan Activation until the Admin restores Plan-Year
Continuity and reviews affected definitions, Targets, and Baseline Values.
_Avoid_: Automatic date shift, activation warning

**Active-to-Draft Change Review**:
A Successor Review triggered when an Admin changes the Active Strategic Plan
after its successor Draft was created. The Active change remains permitted,
but it never synchronizes into the Draft automatically. Each affected Draft
section returns to **Needs review** and identifies the predecessor change the
Admin must evaluate before Plan Activation.
_Avoid_: Live clone, automatic successor synchronization

**Stale Strategic Plan Save**:
A rejected mutation based on an older revision of the Strategic Plan or
plan-owned record being changed. The first valid save remains authoritative;
the later Admin receives a plain-language conflict, refreshes the latest saved
version, and deliberately reapplies any still-needed change. A stale save never
silently overwrites newer work.
_Avoid_: Last write wins, automatic merge

**Whole-Plan Revision**:
A concurrency value for one Strategic Plan that advances whenever any plan
detail, plan-owned definition, relationship, Target, readiness decision, or
Board setting changes. Cancelling or activating a Draft must compare the exact
Whole-Plan Revision the Admin reviewed; a mismatch stops the lifecycle action
and requires a fresh review.
_Avoid_: Top-level-form revision, stale activation snapshot

**Activation Eligibility Date**:
January 1 of a Draft Strategic Plan's first Reporting Year. A ready or approved
Draft Strategic Plan cannot undergo Plan Activation before this date, so the
predecessor remains Active through its final Reporting Year.
_Avoid_: Approval date, automatic activation date

**Organization Local Time**:
The Eastern Time civil clock for Eastern State, represented by the
`America/New_York` time zone so standard-time and daylight-saving changes are
handled automatically. Calendar-based lifecycle rules such as the Activation
Eligibility Date use this clock rather than UTC or the server's local time.
_Avoid_: EST as a year-round offset, server time

**Delayed Plan Activation**:
The period after a Draft Strategic Plan's Activation Eligibility Date during
which its predecessor remains Active because the successor has not been
deliberately activated. The product warns about the delay, does not activate
automatically, and permits successor results to be backfilled only after Plan
Activation.
_Avoid_: Automatic extension, reporting-year gap

**Delayed-Transition Editing**:
The rule that, before a delayed Plan Activation, staff may finish or correct
Reporting Periods within the predecessor's own Reporting Years. They cannot
record successor-year results under the predecessor or enter results into a
Draft Strategic Plan.
_Avoid_: Backfill, plan extension

**Activation Cutoff**:
The instant Plan Activation completes. Work committed before the cutoff remains
with the predecessor, which becomes read-only; work submitted after the cutoff
belongs to the successor. A predecessor form opened before the cutoff cannot be
saved afterward and must be refreshed.
_Avoid_: Reporting Year boundary, data migration

**Predecessor Completion Warning**:
A non-blocking Plan Activation warning that identifies unfinished predecessor
Reporting Periods and reminds the Admin that the predecessor becomes read-only
at the Activation Cutoff. Incomplete predecessor reporting does not prevent
activation.
_Avoid_: Activation readiness failure, automatic completion

**Plan Structure**:
The Strategic Priorities, Strategic Goals, KPIs, Measurement Configurations,
KPI Components, Distribution Bands, and Goal–KPI Memberships that define what
a Strategic Plan measures and how its results are organized.
_Avoid_: Recorded results, plan data

**Minimum Plan Structure**:
The smallest Plan Structure eligible for Plan Activation: at least one
Strategic Priority, one Strategic Goal owned by that priority, and one Measure
connected to that goal. A Draft Strategic Plan may begin empty but cannot
become Active while this Readiness Requirement is unmet unless the Admin
records a Readiness Override.
_Avoid_: Complete plan, sample structure

**Plan-Owned Identity**:
The distinct identity assigned to every Strategic Plan, Strategic Priority,
Strategic Goal, KPI, Measurement Configuration, KPI Component, Distribution
Band, Goal–KPI Membership, Target, and Board scope created for one planning
cycle. A blank or cloned successor receives new plan-owned identities; the
Organization and User identities remain shared across cycles.
_Avoid_: Shared plan record, reused database identity

**Plan-Scoped Reference**:
A human-readable name, code, or slug that may be reused in different Strategic
Plans while remaining unique within one plan. Matching references do not make
predecessor and successor items the same Plan-Owned Identity.
_Avoid_: Global plan-item key, identity by label

**Successor Lineage**:
An immutable provenance relationship from a successor plan-owned item to one
or more items in its immediate predecessor plan. A Structural Clone records one
**Copied from** link. A deliberate redesign may record **Merged from** links
from several predecessor items or **Split from** links from one predecessor to
several successors. Following successive links reveals longer planning-cycle
history without combining historical results or enabling cross-plan
comparison; unrelated new items have no predecessor link.
_Avoid_: Shared identity, copied result history

**Lineage Validity**:
The invariant that Successor Lineage connects matching kinds of plan-owned
items across directly consecutive Strategic Plans in the same Organization.
It cannot link within one plan, skip the immediate predecessor, cross
Organizations, connect different item kinds, or form a cycle.
_Avoid_: Arbitrary related item, cross-plan mapping

**Lineage Snapshot**:
The system-recorded predecessor name and identifying context captured when
Successor Lineage is created. It remains understandable after either item is
renamed or archived and cannot be edited or removed by an Admin.
_Avoid_: Current predecessor label, editable provenance

**Lineage Disclosure**:
The compact **Copied from**, **Merged from**, or **Split from** provenance shown
in Draft and Archived plan details, with the full planning-cycle chain
available on demand. Routine Overview and Data Entry omit it; detailed
definition exports may include it without attaching it to every result.
_Avoid_: Cross-plan comparison, routine result label

**Clone Source Revision**:
The predecessor revision captured when a Structural Clone is created. Later
predecessor changes never synchronize automatically into the independent Draft
Strategic Plan; they produce a source-changed warning for Admin review.
_Avoid_: Live clone, automatic rollover

**Structural Clone**:
A Draft Strategic Plan initialized with a complete copy of the Active Strategic
Plan's Plan Structure so an Admin can remove or change it before Plan
Activation.
_Avoid_: Database copy, plan extension

**Carry-Forward Definition**:
The definition or relationship in use at the end of the Active Strategic Plan,
copied as the starting definition for a Structural Clone. Earlier
effective-dated versions remain only with the original plan.
_Avoid_: Definition history, latest database row

**Successor Effective Range**:
The full Reporting Year range of the Successor Strategic Plan, used as the
default range for copied definitions and relationships until the Admin changes
them during Successor Review.
_Avoid_: Predecessor effective range, inherited dates

**Carry-Forward Provenance**:
The predecessor descriptions, definition notes, and source references retained
with copied Plan Structure so its origin remains understandable. It is
attributed to the predecessor and still requires Successor Review.
_Avoid_: Historical Reporting Evidence, successor approval

**Successor Review**:
The Admin confirmation that copied Plan Structure remains appropriate for the
Successor Strategic Plan. Every copied definition and relationship begins
unapproved and requires this review even when its predecessor was ready or
active. Any included item still awaiting Successor Review is an unmet
Readiness Requirement until it is approved, revised, removed from the Draft
Strategic Plan, or covered by a Readiness Override.
_Avoid_: Automatic approval, inherited readiness

**Suggested Successor Owner**:
An owner copied from the predecessor as a proposed assignment for successor
work. The Admin must confirm or replace it during Successor Review before Plan
Activation. A missing or unconfirmed owner does not prevent Plan Activation,
but it remains visible as an Activation Warning.
_Avoid_: Inherited owner, approved owner

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
A stable performance indicator whose Plan-Owned Identity persists across its
measurement definitions, observations, Targets, and reports within one
Strategic Plan. A successor KPI receives a new identity even when it carries
forward the same subject.
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

**Activation Definition Coverage**:
The requirement that every active Measure have an approved, usable Measurement
Definition for the Draft Strategic Plan's first Reporting Year. A missing
first-year definition is an unmet Readiness Requirement; a definition gap
limited to a later Reporting Year is an Activation Warning.
_Avoid_: Full-plan definition lock, recorded-result completeness

**Activation Target Coverage**:
The requirement that every Measure which counts toward Strategic Goal
completion have either an approved Annual Target for the Draft Strategic
Plan's first Reporting Year or an approved Full-Plan Target applicable from
the start. Missing first-year coverage is an unmet Readiness Requirement;
later-year Annual Targets and Targets for informational Measures may remain
Activation Warnings.
_Avoid_: All-years target lock, target required for every informational Measure

**Draft Board Scope**:
The Successor Strategic Plan's unapproved Board-specific Priority titles, focus
statements, and linked Measures. A Blank plan starts empty; a Structural Clone
copies the predecessor wording and recreates only Measure links supported by
Successor Lineage. The whole scope begins Needs review.
_Avoid_: Inherited Board approval, current Board scope

**Board Link Carry-Forward**:
The Structural Clone rule that a Board focus statement keeps only Measure links
with valid successor lineage. The statement remains when at least one valid
link survives and requires Board View Review; it is omitted from the successor
when no linked Measure carries forward.
_Avoid_: Dangling Board link, automatic replacement Measure

**Empty Board Priority Omission**:
The Structural Clone rule that a Board Priority with no surviving focus
statements is left out of the Draft Board Scope. An Admin may add it back only
with deliberate successor statements and valid Measure links.
_Avoid_: Empty Board heading, inherited placeholder

**Intentional Empty Board Scope**:
The explicit Admin decision that a Strategic Plan will have no Board report.
It can complete Board View Review without visible content; Board users receive
a clear No Board report configured message rather than a blank or failed
report.
_Avoid_: Unconfigured Board scope, empty report error

**Draft Board Access**:
The rule that only Admins may view, edit, or preview a Draft Strategic Plan's
Board scope. Viewers and Board users remain on the approved Active plan until
Plan Activation.
_Avoid_: Board preview access, early Draft disclosure

**Board Scope Cutover**:
The indivisible Plan Activation change that makes the reviewed Draft Board
Scope active while freezing the predecessor's scope as read-only. A Board
request observes the complete predecessor scope or the complete successor
scope, never a mixture.
_Avoid_: Incremental Board switch, shared Board scope

**Board Priority Review**:
The Admin confirmation of one Draft Board Scope Priority's Board title, focus
statements, linked successor Measures, and visibility. Board View Review is
complete when every included Priority is confirmed or the scope is
intentionally empty; a later edit resets only the affected Priority.
_Avoid_: Whole-report reapproval, inherited Priority approval

**Board Dependency Review**:
The return of an affected Board Priority to Needs review when a linked successor
Measure is renamed, archived, materially redefined, or loses valid first-year
coverage. Removed links then apply Board Link Carry-Forward and Empty Board
Priority Omission.
_Avoid_: Stale Board approval, automatic semantic acceptance

**Draft Board Preview**:
The Admin-only representation of exactly what Board users will see after Plan
Activation, using only successor content. Missing successor results appear as
Not reported; predecessor results are never borrowed to make the preview look
complete.
_Avoid_: Live Board report, predecessor result preview

**Board View Review**:
The Admin confirmation that a Draft Strategic Plan's Board titles, focus
statements, visible Measures, and access scope are deliberate for that planning
cycle. An unreviewed Board view is an unmet Readiness Requirement; review does
not imply that every Measure must be Board-visible.
_Avoid_: Inherited Board scope, all-Measures visibility

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

**Draft Target Copy**:
A predecessor Target that an Admin explicitly chooses as a starting point for a
Successor Strategic Plan. It is unapproved successor content that requires
review and a newly selected successor target year before Plan Activation;
Targets and their predecessor deadlines are never copied automatically.
_Avoid_: Inherited target, approved target

**Annual Target**:
A Target for one Reporting Year.
_Avoid_: Full-Plan Target, pacing target

**Full-Plan Target**:
A cumulative Target due by a Strategic Plan target year.
_Avoid_: Annual Target, Legacy KPI Goal

**Baseline Value**:
The fixed reference value and year from which progress toward a Target is measured.
_Avoid_: Previous-Period Value, moving baseline

**Successor Baseline**:
The value and year deliberately approved as the reference point for a
Successor Strategic Plan. A predecessor baseline is never copied
automatically, although a verified predecessor result may be selected without
moving its Historical Reporting Evidence. A missing or incompatible Successor
Baseline is an unmet Readiness Requirement only when the approved Target or
progress calculation depends on it.
_Avoid_: Inherited baseline, copied result

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

**Historical Reporting Evidence**:
The Observations, Component Entries, Distribution Observations, result notes
and sources, calculated progress, completion outcomes, and audit history
recorded for one Strategic Plan. It remains exclusively with that plan and is
never included in a Structural Clone.
_Avoid_: Cloneable plan data, starting values

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
