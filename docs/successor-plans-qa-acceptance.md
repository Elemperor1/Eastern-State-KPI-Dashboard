# Successor Strategic Plans: QA and acceptance record

Audience: QA facilitators, release maintainers, and staff participating in the
dashboard walkthrough

This is a reusable checklist and results record. It contains no claimed test
results. Complete it for the exact release commit and release-candidate
database. Do not copy a prior release's status.

## Evidence header

| Field | Result |
| --- | --- |
| Release commit SHA |  |
| Previous approved commit SHA |  |
| Release date |  |
| Facilitator |  |
| Nontechnical Admin participant |  |
| Viewer participant |  |
| Board participant |  |
| Production-clone database identity |  |
| Disposable dashboard-acceptance database identity |  |
| Previous schema → release schema |  |
| Desktop browser and viewport |  |
| Mobile browser and viewport |  |

Result values: **Pass**, **Fail**, **Blocked**, or **Not run**. Attach a receipt
or short note for every result. Do not use Pass without current evidence.

## Release-gate results

| Check | Result | Receipt or notes |
| --- | --- | --- |
| Focused migrations from every supported predecessor schema |  |  |
| Populated-database preservation tests |  |  |
| Migration second-run idempotency tests |  |  |
| Injected migration failure rolls back completely |  |  |
| Injected structural-clone failure rolls back completely |  |  |
| Injected cancellation failure rolls back completely |  |  |
| Injected activation failure rolls back completely |  |  |
| Authorization and role matrix |  |  |
| Blank-plan workflow |  |  |
| Structural-clone workflow |  |  |
| Cancelled-plan workflow |  |  |
| Readiness, warnings, and overrides |  |  |
| Activation and idempotent retry |  |  |
| Archived reporting and exports |  |  |
| Board scope cutover and preservation |  |  |
| Restart reconciliation |  |  |
| Safe restore and forward-repair boundary |  |  |
| Desktop and mobile acceptance |  |  |
| Keyboard-only and accessibility checks |  |  |
| Full local release gate, consecutive run 1 |  |  |
| Full local release gate, consecutive run 2 |  |  |
| Hosted security workflow for exact release SHA |  |  |

The full local gate is:

```bash
npm run check:all
```

Record two complete successful runs after the final change. A partial command,
focused test, older SHA, or one successful run does not satisfy this row.

## Production-clone migration rehearsal

Use a restored copy of the real production database. Never use the live
database for lifecycle acceptance.

| Preservation check | Before | After first migration | After second migration | Result / notes |
| --- | --- | --- | --- | --- |
| Schema version |  |  |  |  |
| User stable IDs and count |  |  |  |  |
| Organization stable ID and content |  |  |  |  |
| Existing Strategic Plan stable ID and content |  |  |  |  |
| Existing plan remains Active |  |  |  |  |
| Existing predecessor remains empty |  |  |  |  |
| No Draft created |  |  |  |  |
| Priority stable IDs and count |  |  |  |  |
| Goal stable IDs and count |  |  |  |  |
| Measure stable IDs and count |  |  |  |  |
| Relationship stable IDs and count |  |  |  |  |
| Definitions, Inputs, bands, and Targets |  |  |  |  |
| Results, notes, and sources |  |  |  |  |
| Board scope and linked Measure IDs |  |  |  |  |
| Strategic, entry, user, and lifecycle audit history |  |  |  |  |
| Representative report checksums |  |  |  |  |
| Representative export checksums |  |  |  |  |
| `npm run db:integrity` |  |  |  |  |
| `PRAGMA foreign_key_check` |  |  |  |  |

Second migration result: _____

Previous-release backup restoration result: _____

Previous-release sign-in, reporting, Board scope, export, and health result:
_____

## Dashboard-only Admin acceptance

Use a disposable release-candidate database. The participant should not use a
terminal, receive server assistance, or interpret technical error codes. Any
ordinary lifecycle step that requires those things fails usability acceptance.

### Orientation and role boundary

- [ ] Admin finds **Setup → Plans** without instruction.
- [ ] Active, Draft, Archived, and Cancelled terms are understandable in
  context.
- [ ] Admin can identify the current Active plan and whether a Draft exists.
- [ ] Viewer and Board accounts cannot open Plans.
- [ ] Draft and Cancelled content is absent from Overview, Data Entry, normal
  Reports, and Board access.

Result and notes:

### Blank Draft

- [ ] Admin creates a Blank successor.
- [ ] The first Reporting Year follows the predecessor with no overlap or gap.
- [ ] The Admin chooses the final Reporting Year.
- [ ] The Active plan remains unchanged in normal reporting.
- [ ] No results, Targets, baselines, or Board content appear automatically.
- [ ] A second Draft is refused while this Draft exists.

Result and notes:

### Structural clone

- [ ] On a reset disposable database, Admin creates a structural clone.
- [ ] New plan-owned identities differ from predecessor identities.
- [ ] Plan structure copies; results and historical evidence do not.
- [ ] Targets and baselines are not silently approved or carried forward.
- [ ] Copied items show “Copied from” lineage.
- [ ] Copied definitions, owner suggestions, and Board content begin Needs
  review.
- [ ] A later Active-plan change does not synchronize into the Draft and
  returns affected sections to Needs review.

Result and notes:

### Plan configuration

- [ ] Admin can change plan details and recover from a stale save.
- [ ] Admin can create, revise, and remove Priorities, Goals, Measures,
  definitions, Inputs, bands, memberships, and Targets.
- [ ] Admin can record valid Copied from, Merged from, and Split from lineage.
- [ ] Invalid cross-plan, cross-kind, skipped-predecessor, and cyclical lineage
  is refused.
- [ ] Admin can approve a compatible successor baseline.
- [ ] Missing and incompatible first-year coverage is explained in plain
  language.
- [ ] Changing predecessor dates triggers a Plan-Date Review.

Result and notes:

### Board view

- [ ] Admin reviews Board titles, focus statements, and successor Measure
  links.
- [ ] Links without valid successor lineage are omitted from a structural
  clone.
- [ ] Empty Board Priorities are omitted.
- [ ] Admin can deliberately approve an empty Board scope.
- [ ] Draft preview uses only successor content and labels missing results Not
  reported.
- [ ] Viewer and Board accounts cannot preview the Draft.
- [ ] Changing a linked Measure resets only the affected Board review.

Result and notes:

### Readiness

- [ ] Readiness updates from the latest saved revision.
- [ ] Ready to activate, Ready with warnings, Needs decisions, and Cannot
  activate are distinguishable.
- [ ] A Hard Activation Rule cannot be overridden.
- [ ] Each readiness override requires its own plain-language reason.
- [ ] An override remains visible and does not hide missing information.
- [ ] Unresolved questions must be classified as must resolve or follow-up.
- [ ] Warning acknowledgment covers the complete current warning list.
- [ ] A stale whole-plan revision stops cancellation or activation.
- [ ] Activation before the eligibility date is refused using
  `America/New_York` local time.

Result and notes:

### Cancellation

- [ ] Exact Draft name is required.
- [ ] Cancellation is atomic.
- [ ] The Cancelled plan becomes permanently read-only.
- [ ] Its lineage and lifecycle history remain visible to Admins.
- [ ] It is excluded from Active and Archived reporting.
- [ ] The Active plan remains unchanged.
- [ ] A new successor Draft may be created afterward.

Result and notes:

### Activation

- [ ] Final review names both plans and their Reporting Years.
- [ ] Exact successor name is required.
- [ ] All current warnings and overrides are shown.
- [ ] Predecessor incomplete-period warning is shown when applicable.
- [ ] New saves receive a clear retry-later response during the write pause.
- [ ] Viewing remains available during the brief pause.
- [ ] Backup failure leaves predecessor Active and successor Draft.
- [ ] Atomic activation never exposes zero or multiple Active plans.
- [ ] A lost-response retry returns the authoritative completed activation
  without duplicate events.
- [ ] Post-verification success releases saves.
- [ ] A predecessor form opened before the cutoff cannot save afterward.
- [ ] Sessions continue and refresh into the new Active plan.

Result and notes:

## Viewer and Board acceptance

### Viewer

- [ ] Viewer sees the new Active plan after activation.
- [ ] Viewer can open full Archived Plan Review.
- [ ] Archived selection is request-scoped and does not change Overview or a
  later normal Reports visit.
- [ ] Viewer cannot see Draft, Cancelled, readiness, activation, or lifecycle
  administration.
- [ ] Archived CSV, PNG, and PDF use the archived plan's wording and data.

Result and notes:

### Board

- [ ] Board sees only the successor's approved Board scope after activation.
- [ ] Board can open the predecessor's preserved Archived Board report.
- [ ] Archived Board exports preserve that plan's scope.
- [ ] Board cannot see Draft or Cancelled content.
- [ ] An intentionally empty Board scope produces a clear message.
- [ ] Missing historical reporting remains Not reported or Incomplete.

Result and notes:

## Recovery acceptance

Perform these checks on a restored clone with the operator runbook.

| Scenario | Expected result | Actual result / receipt | Status |
| --- | --- | --- | --- |
| Interrupt before activation commit | Predecessor Active, successor Draft; no replay |  |  |
| Restart with committed activation | Post-activation verification runs before saves resume |  |  |
| Unexpected lifecycle combination | Application fails closed as an Active Plan Integrity Incident |  |  |
| Verification failure before write-pause release | Safe Pre-Write Activation Restore is available |  |  |
| Preserved failed database | Artifact hash and external recovery record exist |  |  |
| Supported recovery operation | Immutable recovery evidence is added without ad hoc SQL |  |  |
| One post-activation successor write | Pre-activation restore is refused |  |  |
| Forward-repair drill | Current database is preserved and repaired without erasing the write |  |  |
| Retention gate | Artifacts remain until verification, cutover confirmation, and a scheduled backup |  |  |

## Interaction and accessibility

Check at desktop and representative mobile widths:

- [ ] Focus order follows the visible workflow.
- [ ] All controls have accessible names and instructions.
- [ ] Lifecycle state is not communicated by color alone.
- [ ] Readiness items identify the problem and corrective action.
- [ ] Confirmation dialogs identify the exact consequential change.
- [ ] Keyboard-only operation can complete every ordinary Admin step.
- [ ] Save, conflict, pause, failure, and success messages are announced.
- [ ] Long names, warnings, lineage, and error messages wrap without clipping.
- [ ] Archived and Cancelled read-only states are clear.
- [ ] Reduced-motion and zoom behavior remain usable.

Result and notes:

## Non-destructive production smoke

Run only after staged enablement on the live installation.

- [ ] Admin can open Setup → Plans.
- [ ] Viewer and Board role boundaries are correct.
- [ ] The pre-release Active plan remains the same authoritative plan.
- [ ] Existing reports and exports work.
- [ ] Existing Board scope is unchanged.
- [ ] Successor planning is enabled.
- [ ] No Draft was created.
- [ ] No Draft was cancelled.
- [ ] No readiness or lifecycle decision was saved.
- [ ] No plan was activated.
- [ ] `GET /api/health/ready` returns exactly `{"status":"ready"}`.

Result and notes:

## Final practical release gate

| Gate | Result | Evidence |
| --- | --- | --- |
| Automated checks pass |  |  |
| Migration and restoration pass on the restored real-data copy |  |  |
| Backup and rollback are verified |  |  |
| Nontechnical Admin completes the dashboard workflow |  |  |
| Viewer and Board acceptance passes |  |  |
| Existing data and reporting remain unchanged |  |  |
| Documentation is current |  |  |
| Non-destructive live smoke passes |  |  |

Overall result: _____

Open blockers: _____

Follow-up work: _____

Evidence location: _____

No named signoff or formal approval dossier is required. A failed, blocked, or
not-run gate means the feature is not ready for live use.
