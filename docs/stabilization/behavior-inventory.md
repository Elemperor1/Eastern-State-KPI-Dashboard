# Pre-architecture behavior inventory

Status: discovery baseline

Baseline commit: `ef29cfbf2f396c061063a15fcd6f2cfbeff48922`

Baseline source: `origin/master` after PR #61 and successful post-merge Quality,
CodeQL, Container Security, Scorecard, and Vercel checks on July 17, 2026.

This inventory is the expected-behavior contract for the stabilization audit.
It reconciles `README.md`, `CONTEXT.md`, `DESIGN.md`,
`docs/product-foundation.md`, ADRs 0020-0022, calculation and workflow docs,
the schema, route tree, existing tests, and deployment configuration. A later
test result may refine this inventory, but a preference or proposed future
surface does not override it.

## Product boundary

- The authenticated product has exactly four destinations: Overview and
  Reports for Viewer and Admin; Data Entry and Setup for Admin only.
- Strategic Priority and Measure routes are supporting drill-downs, not
  destinations. Login and forced password change are authentication routes.
- The removed `/admin/*`, `/dashboard/trends`, `/api/entries`,
  `/api/breakdowns`, and `/api/goals` surfaces return 404; they are not aliases.
- First-class strategic observations, component entries, and distributions are
  the sole live reporting truth. Legacy values and `entry_history` remain a
  read-only archive and never become fallback inputs for current reporting.

## Supported workflows

### Authentication and access

1. A fresh database creates one Admin and one Viewer bootstrap account without
   logging a password or hash. Temporary credentials require password change.
2. Login gives the same public failure message for unknown, wrong-password,
   disabled, and deleted accounts. Throttling is applied per source and
   account according to proxy configuration. All unusable identities still
   perform one fixed-cost password comparison, so this generic response is not
   an active-account timing oracle.
3. Forced password change blocks protected application/API use until complete,
   rotates the session watermark, then requires a fresh sign-in.
4. Logout clears the session. Password reset/change, role change,
   disable/enable, and deletion invalidate retained cookies uniformly.
5. Viewer can read Overview, drill-downs, Reports, board export, and
   distribution bands, but cannot reach Admin pages or any Admin mutation.
6. `AUTH_DISABLED=true` works only in loopback-bound development and is
   rejected in test, build, production, and non-loopback configurations.
7. Anonymous failures cannot impose a victim-wide hard lock on a correct
   credential. A successful account login clears only that account's history;
   it does not erase the independent source-IP spray budget. Retained throttle
   identities and one-request cleanup work are both bounded.
8. A newly issued session carries the exact credential/revocation version read
   with the verified password hash. Rotation invalidates in-flight old-hash
   authentication as well as older cookies. Self-service password replacement
   uses compare-and-swap against the reauthenticated hash, so a stale request
   cannot overwrite a concurrent administrator reset.

### Review strategic performance

1. Overview shows one organization completion result, its denominator, all
   five Strategic Priorities, and a bounded attention list for the selected
   Reporting Year. It does not load or hide Board Report markup.
2. Overview -> Strategic Priority -> Measure preserves Reporting Year and shows
   the selected year's effective definitions, Calculated Results, Targets,
   progress, inputs, history, exclusions, and caveats.
3. Missing, invalid, excluded, unresolved, zero, and over-target results remain
   distinct. Missing/invalid are never rendered as implicit zero.
4. Unknown Priority or Measure paths fail safely without exposing technical
   details; supported links and browser history remain usable.

### Complete a reporting cycle

1. Data Entry selects a Reporting Year and compatible Reporting Period, lists
   each Measure as Not started, Needs attention, or Complete, and opens one
   focused form.
2. The form renders only raw inputs required by the effective Measurement
   Definition: direct value, boolean, milestone, numerator/denominator,
   average inputs, components, or distribution total and groups.
3. Validation preserves the draft and associates specific errors. `month = 0`
   remains an internal annual sentinel and never appears in UI copy.
4. Save follows Unsaved -> Saving -> Saved only after commit. Pending state
   suppresses repeated submission; failure retains the draft and does not mark
   the checklist Complete; retry remains available.
5. Multi-input saves are atomic: every component/distribution persists with
   one audit boundary or none do. Successful values and completion survive
   reload and a new session.
6. Dirty navigation requires an explicit stay-or-discard decision. The product
   is online-required: a failed/offline save preserves only the current
   in-memory draft and never promises synchronization.
7. No versioned concurrent-edit prevention contract is currently verified;
   last-write behavior is a documented risk, while Activity provides evidence
   rather than conflict prevention.

### Govern Measures, Goals, People, and Activity

1. Setup has exactly four persistent areas: Measures, Goals, People, Activity.
2. Measures supports creation, metadata edits, attention filtering,
   effective-dated Measurement Definitions, Inputs, Reporting Groups, Targets,
   archive/restore, and dependency-aware deletion for removable legacy
   metadata. Calculation-affecting definitions with history use successors,
   not in-place rewrites.
3. Goals supports completion rules, effective memberships and role/weight/order,
   manual state where configured, annual/full-plan Targets, successor creation,
   and archive/restore. Only eligible required Measures enter denominators.
4. People supports account creation, credential reset, role/status changes,
   enable/disable, and deletion while preventing self-lockout. Security-sensitive
   changes revoke old sessions.
5. Activity keeps legacy Entry History and strategic audit events immutable,
   actor-attributed, filterable, and pageable. Renames/deletions do not rewrite
   historical labels; tombstones and missing live metadata remain visible.

### Reports and exports

1. Reports loads either Board Report or Trends according to URL state; only the
   selected view is loaded and visible.
2. Board screen, CSV, PNG, raster PDF, and browser print use the same sanitized
   reporting model and preserve report identity, Reporting Year/Period,
   denominators, Targets, raw/detail evidence, unresolved reasons, provenance,
   and stable Measure identity.
3. Trends compares the same reporting cycle across years and exports the
   selected Measure as CSV. Formula markers remain inert even after leading
   whitespace/control normalization by spreadsheet consumers.
4. Raster export validates dimensions and rejects unsafe captures instead of
   creating blank output. PDF failure offers Print / PDF as a fallback. DOM
   capture restores temporary live-document changes even after failure.
5. Print removes product chrome, preserves report context and all evidence,
   repeats table headers where possible, and remains readable in grayscale.

### Calculations and persistence invariants

1. Formula ownership is centralized in
   `src/features/strategy/calculations.ts`; UI and export adapters do not
   recalculate.
2. Percentage and ratio divide explicit numerator by a non-zero denominator;
   YoY is `(current - previous) / abs(previous) * 100`; zero denominator is
   invalid and missing prior data is missing, not zero.
3. January-through-selected-month cumulative/YTD comparisons include only the
   chosen year's periods through the selected month. Monthly and quarterly YoY
   use the same prior-year period.
4. Negative and decimal finite inputs follow their supported measurement and
   direction rules; currency preserves cents; precision is 0-6 decimals.
5. Numeric target zero is valid and distinct from a missing Target. Annual
   pacing, annual completion, and full-plan progress remain separate. Text
   preserves over-performance while progress fill caps at 100%.
6. Goal/priority/organization completion is derived from eligible named Goals,
   not KPI-row averages. Informational, unresolved, draft, archived, and
   ineligible items remain visible with exclusion reasons.
7. Current writes and audit events commit atomically. Effective-year ranges do
   not overlap or orphan compatible values/Targets. Strategic foreign keys are
   restrictive; `PRAGMA foreign_key_check` must remain empty.

### Global state, accessibility, and responsive behavior

1. Every public route has a structure-mirroring skeleton and accessible
   loading label. The four destinations have focused, retryable route errors.
2. Empty and partial states explain what is absent and offer only
   role-appropriate actions. Validation, server, permission, export, and
   unknown-route failures remain specific and recoverable.
3. Navigation/filter/report state is URL-backed where documented and survives
   refresh, direct access, and back/forward navigation.
4. The app provides skip navigation, logical landmarks/headings, visible
   focus, keyboard-operable dialogs/drawers, focus trapping/restoration,
   named tables/charts/progress, non-color meaning, and stable live regions.
5. Reduced motion removes translation/scale and makes progress immediate while
   retaining every semantic state.
6. At 320-1920 px and 200%-400% zoom-equivalent widths, content reflows without
   page-level horizontal overflow, collisions, clipped actions, or truncated
   meaning. Wide tables may scroll inside named local regions.

### Initialization, migration, and deployment

1. `db:seed` is destructive only for disposable KPI-owned sample data and
   preserves users. Production startup seeds only a missing/disposable DB.
2. Schema 9 -> 10 -> 11 migration is additive, transactional, idempotent, and
   preserves stable IDs, legacy/strategic values, users, history, and
   operator-owned configuration. Migration failure rolls back.
3. Production startup refuses an incompatible populated database rather than
   reseeding it. Fly uses persistent `/app/data/kpi.db`; Docker build uses a
   disposable database and does not bake generated data or secrets into the
   runtime image.
4. Production build, container startup, Fly-equivalent startup, and Vercel
   preview must preserve auth and database contracts. Repository guards,
   branch protections, and the dead-code/hygiene conclusions are fixed
   invariants for this audit.
5. Docker fallback security scanners are selected by reviewed immutable image
   digest. Local editor tooling fails closed when its reviewed application
   bundle is absent; it does not execute mutable registry packages as an
   availability fallback.

## Explicit non-bugs without contrary evidence

- Lack of offline synchronization and versioned concurrent-edit conflict
  prevention are documented product risks, not implemented promises.
- A future contextual Measure-to-Target editing route is a documented future
  surface, not a current supported workflow.
- Unresolved TK/TBD definitions and Targets are honest domain states, not zero
  values or automatic failures.
- The internal annual period index `0`, retained legacy tables, and two audit
  feeds are intentional compatibility behavior when they remain outside
  current product copy/writes.
