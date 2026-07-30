# Successor Strategic Plans: leadership overview

Audience: Eastern State leadership and people responsible for approving a new
planning cycle

## The short version

A Successor Strategic Plan is a separate plan prepared for the next planning
cycle while the current Strategic Plan remains in use. It is not an extension
of the current plan and it does not reuse the current plan's records.

An Admin prepares the successor in **Setup → Plans**. Normal reporting and Data
Entry continue to use the **Active** plan until the Admin deliberately
activates the successor. Activation makes the successor Active and preserves
the former Active plan as an **Archived**, read-only historical record.

The product does not activate a plan automatically.

## Why the plans stay separate

Each Strategic Plan owns its own Priorities, Goals, Measures, Targets,
definitions, Board scope, results, and history. Keeping those records separate
protects the meaning of earlier reports when the organization changes what it
measures or how it describes its work.

A successor can start in either of two ways:

- **Blank** starts with an empty plan structure.
- **Structural clone** copies the current plan's structure as a starting point.

A structural clone does not copy recorded results. Copied definitions are new
successor records, retain a visible “Copied from” relationship, and must be
reviewed again. Targets and baselines are not silently carried forward.

## Lifecycle terms

- **Active plan:** the one plan used by Overview, Data Entry, Reports, and
  ordinary Setup work.
- **Draft plan:** a successor being prepared. Only Admins can see or change it.
- **Cancelled plan:** a Draft an Admin ended. It remains available to Admins as
  a permanent read-only record and was never an Active plan.
- **Archived plan:** a former Active plan preserved after its successor was
  activated. Signed-in users may open its historical reports according to
  their role.

There can be exactly one Active plan and no more than one Draft at a time.
There is no standalone “archive the current plan” action. Archiving and
activating happen together so the organization is never left without an
Active plan.

## What each role can do

| Role | Active plan | Draft and Cancelled plans | Archived plans |
| --- | --- | --- | --- |
| **Admin** | Read, enter results, and manage setup | Create, edit, review, cancel, and activate | Read full historical reports |
| **Viewer** | Read full reporting | No access | Read full historical reports |
| **Board** | Read the approved Board scope | No access | Read that plan's preserved Board scope |

Infrastructure work remains separate. The system operator—not the dashboard
Admin—owns release testing, database migration, deployment, backup restoration,
and emergency recovery.

## What leadership decides

Before activation, leadership should confirm:

- the successor's name and Reporting Years match the approved planning cycle;
- its first Reporting Year immediately follows the predecessor's final
  Reporting Year;
- the Priorities, Goals, Measures, definitions, owners, Targets, and baselines
  express the new plan deliberately;
- the Board view contains only the approved successor content;
- unresolved questions have been classified as either required before
  activation or approved follow-up work;
- any readiness exception has a plain-language reason; and
- the planned activation date is not earlier than January 1 of the successor's
  first Reporting Year.

The product labels the Draft:

- **Ready to activate**
- **Ready with warnings**
- **Needs decisions**
- **Cannot activate**

Hard lifecycle rules cannot be overridden. A readiness requirement can be
overridden only by an Admin who records a reason. Warnings must be reviewed and
acknowledged. Missing information remains visible after activation; an
override does not turn missing information into a result.

## What activation changes

At the moment activation completes:

1. the current Active plan becomes Archived and read-only;
2. the Draft becomes the single Active plan;
3. its reviewed Board scope becomes the Board view;
4. future navigation and saves use the new Active plan; and
5. immutable lifecycle records preserve who activated the plan and what was
   checked.

Signed-in users are not forced out. Their next navigation or refresh opens the
new Active plan according to their existing role. A form opened against the
predecessor cannot save after the activation cutoff; the user must refresh.

Earlier results are not moved into the successor. The predecessor remains
available through Archived Plan Review with the wording, Targets, Board scope,
results, and incomplete items that belonged to its era.

## Safety during activation

The dashboard starts the safeguards; the Admin does not run server commands.

Before the Active plan changes, the application briefly pauses saves and
creates a verified database backup. It then performs the archive-and-activate
change as one transaction and verifies the result before saves resume. If the
backup cannot be created or the transaction cannot commit, the plans remain
unchanged.

If activation commits but the final verification fails, saves stay paused and
the system operator is called. The product does not guess, retry the transition,
or restore a backup automatically.

## The recovery boundary

There are two different rollback boundaries:

- **Before any successor lifecycle work is saved:** the operator may restore
  the pre-migration backup and matching previous application release.
- **After a Draft, cancellation, activation, or related lifecycle record
  exists:** automatic rollback is forbidden because it would discard
  authoritative work. The operator preserves the current database and repairs
  forward unless an explicitly approved disaster-recovery decision accepts
  the loss.

Immediately after activation, one narrower recovery may be safe: if final
verification failed and no new save was allowed after activation, the operator
may restore the verified pre-activation backup while the application remains
unavailable. This recovery is recorded outside the database being restored and
inside the restored database.

## Release expectations

Successor planning should be enabled in production only after:

- the additive database upgrade and restoration have been rehearsed on a
  restored copy of the real production database;
- existing identities, reporting content, users, Board scope, exports, and
  audit history are proven unchanged;
- the complete lifecycle has been exercised on that restored copy;
- a nontechnical Admin has completed the dashboard-only acceptance walkthrough;
- Viewer and Board access has been checked;
- automated, mobile, keyboard, and accessibility checks pass; and
- a non-destructive production smoke confirms availability without creating,
  cancelling, or activating a live Draft.

The live release happens during a planned maintenance window. Successor
creation is enabled only after the existing installation has passed its
preservation checks.

## When to stop and call the operator

Contact the system operator when:

- the product says activation committed but verification failed;
- saving remains paused after activation;
- health reports unavailable;
- the product detects zero or more than one Active plan;
- a restart occurred during activation;
- a verified activation backup is missing; or
- anyone proposes restoring a database after successor work has been saved.

Do not try to repair those conditions from the dashboard.
