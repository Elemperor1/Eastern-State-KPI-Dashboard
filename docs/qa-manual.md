# QA manual

Run automated gates first:

```bash
npm test
npm run design-system:test
npm run test:e2e
```

Then start a loopback development server and run the smoke harness:

```bash
AUTH_DISABLED=true PORT=3290 npm run dev
AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh
```

## Overview

- Open `/dashboard/overview?year=2026` at 1280 px and 390 px.
- Confirm one title, organization progress, five Strategic Priorities, and a
  bounded Needs attention list.
- Confirm there is no Board Report heading or report/export root in the DOM.
- Record a production Chrome trace: response time, LCP, decoded document size,
  DOM count, and route JavaScript. Overview must be usable within two seconds
  under the recorded profile and remain below the issue-42 structural baseline.

## Data Entry

- Open `/data-entry?year=2029` as an Admin.
- Exercise one atomic, one multi-component, and one distribution measure.
- Force one strategic mutation to return 500. Confirm the input remains,
  Couldn't save is announced, and the checklist is not Complete.
- Retry. Confirm Saved appears only after the response, Save and continue opens
  the next unfinished item, reload preserves the value, and Activity records
  the Actor and time.
- Try to leave a dirty form and confirm the warning.
- Confirm no user-facing month zero appears.

## Reports

- Open `/reports?view=board&year=2026`; verify the visible Board Report and its
  CSV, PNG, PDF, year, totals, and calculated results.
- Change Report to Trends. Confirm the Board Report root is removed and the
  trend uses first-class strategic results.
- Return to Overview and confirm neither report is present or loaded there.

## Setup

- Confirm the persistent selector contains exactly Measures, Goals, People,
  and Activity.
- In Measures, apply Needs attention and open a measure detail without leaving
  Setup. At 390 px, verify Back to Measures restores the list and focus order is
  understandable.
- In Goals, exercise selection, completion rules, membership, annual targets,
  and full-plan targets.
- In People, verify role/status/password-recovery controls and self-lockout
  prevention.
- In Activity, verify Entry History and Strategic Audit Events retain immutable
  labels after rename/delete, expose tombstones, and allow Older/Newer paging.

## Deletion and security

- Confirm removed UI routes and `/api/entries`, `/api/breakdowns`, `/api/goals`
  return 404.
- Confirm a Viewer sees only Overview and Reports and receives 403 from every
  Admin mutation in the auth regression matrix.
- Confirm revoked sessions receive uniform 401 responses, CSRF failures remain
  generic, and `AUTH_DISABLED` cannot run outside loopback development.

## Release

- Back up the production SQLite volume and verify the backup opens.
- Run `DATABASE_PATH=/absolute/path/to/kpi.db npm run db:migrate`; never use
  `db:seed` as a migration.
- Run the credentialed production/auth-enabled smoke.
- Record before/after traces for Overview, Data Entry, Reports, and Setup on
  desktop and representative mobile widths.
- Run `npm run perf:profile` with `BASE`, `PERF_EMAIL`, and `PERF_PASSWORD`.
  Confirm both performance JSON files and all sixteen trace files (eight
  current, eight controlled baseline) are fresh, authenticated, and readable
  with `gzip -t`.
- Rollback follows ADR 0022: application rollback, plus backup restoration when
  post-deploy strategic writes must also be removed.
