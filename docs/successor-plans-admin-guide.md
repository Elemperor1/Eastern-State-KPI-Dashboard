# Successor Strategic Plans: Admin guide

Audience: dashboard Admins who prepare and activate the next Strategic Plan

## Before you begin

Use **Setup → Plans** for ordinary successor-plan work. You do not need server
access or command-line tools. If the Plans area is unavailable during a release
or recovery window, wait for the system operator.

Confirm that:

- leadership has approved the next planning cycle;
- you know the successor's final Reporting Year;
- you understand which parts of the current structure should continue; and
- no other Admin is already preparing a Draft.

Only one Draft may exist at a time. One Admin may create, edit, cancel, and
activate it; a second Admin approval is not required. Important actions still
require exact-name confirmation, current revisions, and permanent audit
records.

## 1. Open the Plans workspace

Open **Setup → Plans**. The workspace identifies:

- the current **Active** plan;
- the current **Draft**, if one exists;
- prior **Archived** plans;
- **Cancelled** Drafts; and
- the current readiness outcome.

Draft and Cancelled plans are Admin-only. Overview, Data Entry, and normal
Reports continue to use the Active plan while you prepare a Draft.

## 2. Create the Draft

Choose **Create successor plan**, then choose a starting method:

- **Blank plan** creates an empty successor structure.
- **Copy current structure** creates new successor Priorities, Goals, Measures,
  measurement definitions, components, relationships, and eligible Board
  structure from the Active plan.

Enter the successor name and final Reporting Year. Its first Reporting Year is
set to the year immediately after the Active plan ends. Plans cannot overlap or
leave a gap.

If leadership has an approval source, record it with the plan. Review the
summary, then create the Draft.

Creating a Draft does not change current reporting and does not copy:

- recorded results, notes, or sources;
- calculation outcomes or completion outcomes;
- audit history;
- approved predecessor Targets or target deadlines; or
- predecessor baselines.

A copied item receives a new identity and a permanent “Copied from” link. The
copy is a starting point, not an inherited approval.

## 3. Review plan details

In **Plan details**:

1. confirm the name, description, Reporting Years, and approval source;
2. correct anything that does not match the approved plan;
3. save and wait for the confirmed saved state; and
4. mark the section reviewed only after reading the latest saved version.

If another change was saved first, your stale save is rejected. Refresh, read
the current version, and deliberately reapply any change still needed.

If the Active plan's final Reporting Year changes after the Draft is created,
the Draft requires a new date review. The product does not move its years
silently.

## 4. Build and review the structure

In **Plan structure**, create, remove, or revise the successor's:

- Strategic Priorities;
- Strategic Goals;
- Measures;
- measurement definitions and Inputs;
- distribution bands; and
- Goal–Measure relationships.

For a structural clone, every copied item begins **Needs review**. Approve,
revise, or remove each included item. A later change to the Active plan does
not synchronize into the Draft; it returns affected successor sections to
Needs review so you can make a deliberate decision.

Owners copied from the predecessor are suggestions. Confirm or replace them.
An unconfirmed owner is visible as a warning.

When redesigning the plan, use the available lineage choices:

- **Copied from** for a direct continuation;
- **Merged from** when several predecessor items become one; or
- **Split from** when one predecessor item becomes several.

Do not use lineage merely because names look similar. Blank-plan items may have
no item-level lineage.

The minimum activation structure is one Priority, one Goal owned by that
Priority, and one Measure connected to the Goal. If this requirement is
overridden, the missing structure remains visible.

## 5. Review Targets, baselines, and the Board view

Targets do not copy automatically. If you deliberately copy a predecessor
Target as a starting point, choose a successor target year and review it as new
successor content.

For each Measure that contributes to Goal completion:

1. confirm a usable first-year measurement definition;
2. set an approved first-year Annual Target or a Full-Plan Target that applies
   from the start;
3. approve a compatible baseline when the Target or progress calculation needs
   one; and
4. resolve or classify any later-year gaps.

Later-year definition gaps and Targets for informational Measures may remain
warnings. Missing first-year coverage for a required Measure normally requires
a decision before activation.

In **Board view**:

1. review each Board Priority title and focus statement;
2. confirm every linked Measure belongs to the successor;
3. remove links that no longer express the intended Board view;
4. preview exactly what Board users will see; and
5. approve each included Priority, or deliberately choose an empty Board scope.

Only Admins can preview a Draft Board view. Board and Viewer accounts cannot
see it before activation. Missing successor results appear as **Not reported**;
the preview never borrows predecessor results.

## 6. Resolve readiness

Open **Check and activate** after every section is saved. Readiness is
recalculated from the latest Draft revision; there is no manual ready switch.

### Cannot activate

A hard rule is failing. Hard rules include lifecycle and integrity conditions
such as valid plan-year ownership, the activation eligibility date, and
exactly one Active plan. A hard rule cannot be overridden.

### Needs decisions

One or more readiness requirements remain unresolved. Resolve the underlying
work or, where the product permits, record a separate plain-language override
reason for each requirement.

An override does not hide the problem or turn missing information into a
result. It becomes permanent activation evidence and remains visible until the
underlying issue is resolved.

### Ready with warnings

Activation is allowed, but the displayed warnings and any overrides must be
reviewed and acknowledged. For an unresolved question, explicitly choose
whether it:

- must be answered before activation; or
- may remain as a documented follow-up.

Unfinished predecessor reporting is a warning. Activating makes the
predecessor read-only immediately, so finish any necessary predecessor-period
work first.

### Ready to activate

No unresolved hard rule or readiness requirement remains. Still read the final
comparison before continuing.

## 7. Cancel a Draft

Cancellation is permanent and is not deletion.

1. Open the Draft and choose **Cancel Draft**.
2. Read which Draft will become read-only.
3. Enter the Draft's exact plan name.
4. Confirm cancellation.

The Active plan and all historical reporting remain unchanged. The Cancelled
plan keeps its content, predecessor link, lineage, and lifecycle history. It is
available to Admins in Plans, does not appear in ordinary or Archived
reporting, and no longer counts against the one-Draft limit.

## 8. Activate the successor

Activation cannot occur before January 1 of the successor's first Reporting
Year in Eastern State's `America/New_York` local time.

Before continuing:

1. refresh readiness;
2. review the exact Active plan that will become Archived;
3. review the Draft that will become Active;
4. check both plans' Reporting Years;
5. read every activation warning and override;
6. confirm that any necessary predecessor work is complete; and
7. enter the successor's exact name.

When you confirm, the product:

1. briefly pauses all saves while viewing remains available;
2. creates and verifies a pre-activation database backup;
3. rechecks your Admin access, the current plan revisions, readiness, and the
   single-Active-plan rule;
4. archives the predecessor and activates the successor as one transaction;
5. writes immutable lifecycle events;
6. verifies the new Active plan, Archived predecessor, Board scope, audit
   records, and database relationships; and
7. resumes saves only when verification succeeds.

Do not submit the action repeatedly while it is running. If a response is lost,
refresh Plans. The same activation identity returns the authoritative result
without activating twice.

## 9. Respond to the outcome

### Activation completed

Refresh the product and confirm:

- the successor is Active;
- the predecessor opens as Archived and read-only;
- the Board preview became the approved Board view;
- Overview and Reports use the successor; and
- Data Entry accepts only successor Reporting Years.

Signed-in users keep their sessions. A predecessor form opened before the
activation cutoff must be refreshed and cannot save afterward.

### Activation stopped before changing plans

A backup, readiness, permission, or revision check failed. The Active plan
remains Active and the Draft remains Draft. Follow the displayed correction
and review the latest readiness before trying again. Contact the operator for a
backup failure.

### Activation committed but verification failed

Stop. Do not attempt another activation and do not ask users to save work.
Saving remains paused. Contact the system operator and provide the displayed
activation identity and time. The operator follows the activation recovery
runbook.

There is no dashboard undo action.

## Activity and accountability

Successful creation, cancellation, activation, archive, and recovery actions
write immutable lifecycle records. Open **Setup → Activity** to review them by
plan or action.

Rejected or failed attempts do not appear as completed lifecycle events.
Operational failures belong in the operator's recovery record.
