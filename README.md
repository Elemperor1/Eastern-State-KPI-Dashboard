# Eastern State Strategic Plan

This is Eastern State Penitentiary Historic Site's internal home for following
the 2025–2029 Strategic Plan. It helps leadership see what is progressing, what
needs attention, and where information or decisions are still missing.
The current plan can be extended beyond 2029; see
[Continuing after 2029](docs/leadership-guide.md#continuing-after-2029) for the
supported workflow and the distinction between extending this plan and
creating a separate successor plan.

## Start here

You do not need to read this repository from beginning to end. Choose the guide
that matches what you need to do:

| I am… | Start with… | What it explains |
| --- | --- | --- |
| A leader, Board member, or first-time reader | [Leadership guide](docs/leadership-guide.md) | What the product is, what the information means, who does what, and what leadership should confirm before launch |
| A person using the product | [Leadership guide](docs/leadership-guide.md#how-to-use-the-product) | First sign-in, the four main areas, roles, and common reporting questions |
| The person installing or maintaining the local server | [Local server deployment](docs/local-server-deployment.md) | Backup, installation, security, first accounts, health checks, and rollback |
| An engineer or future maintainer | [Documentation map](docs/README.md) | Product, design, architecture, security, operations, and historical references organized by audience |

For a short explanation suitable for a handoff meeting, read only the
[leadership guide](docs/leadership-guide.md). No command line, database, or
software-development knowledge is required.

## Quick start

```bash
# 1. Install dependencies
npm run install:controlled

# 2. Create/reset the exact disposable development database with sample data (2024–2026)
DATABASE_PATH="$(pwd -P)/data/kpi.db" \
  SEED_CONFIRM="$(pwd -P)/data/kpi.db" npm run db:seed

# 3. Start the loopback-only development server with the local auth bypass
AUTH_DISABLED=true npm run dev
```

For an existing schema 9–15 database, especially a production SQLite volume,
back up the database and its WAL/SHM files and run the additive migration to
schema 16 instead of the destructive sample seed:

```bash
DATABASE_PATH=/absolute/path/to/kpi.db npm run db:migrate
AUTH_DISABLED= npm run build
npm start
```

`npm run db:seed` intentionally replaces KPI-owned sample values, definitions,
and audit history while preserving users. It requires `SEED_CONFIRM` to equal
the exact resolved `DATABASE_PATH`; it is for disposable/sample databases, not
production migration. Schema 8 also has an additive migration path, but only
through an explicit, backed-up `db:migrate` run. Schema 7 and older cross the
intentional schema-8 catalog-replacement boundary; see
`docs/migration-notes.md` before proceeding.

Open <http://localhost:3000>. With the quick-start bypass, the app opens
directly; with auth enabled, sign in normally.

Next.js 16 defaults both development and production builds to Turbopack. This
repository intentionally keeps Webpack explicit for `npm run dev` and
`npm run build`, preserving the proven Next.js 15 bundler path while the
framework runtime moves to Next.js 16. Playwright builds that production path
before starting its loopback acceptance server.

> **Auth bypass (temporary).** No tracked environment file enables the bypass.
> Start development with `AUTH_DISABLED=true npm run dev` (or set the same value
> in your untracked `.env.local`) to make the dashboard reachable without a
> login — `/` redirects straight to
> `/dashboard/overview` and the login form is skipped. The flag is read by
> `src/lib/auth-flag.ts`; with it on, the auth feature session surface returns
> the real `auth-disabled@local` users row and the `AccountBlock` in `AppShell`
> hides its Logout button. The bypass is blocked in production/test: `next build` fails
> with `AUTH_DISABLED=true`, and `next start` cannot serve app routes with the
> flag set. To use the preserved iron-session login, unset `AUTH_DISABLED` or
> set it to `false`; no code reversion is required. The `/login` page,
> `/api/auth/*` routes, seeded accounts, and the
> `src/features/auth/session.ts` gate surface remain active.

### Default accounts (seeded on first DB access)

On the first run against a fresh database, `ensureSeedAdmin()` creates
`zach@easternstate.org` (Zach Palmer, admin) and
`kerry@easternstate.org` (Kerry Sautner, viewer). **No plaintext password is
ever written to stdout, stderr, or logs** — the old "read the password from the
startup log" flow has been removed (security finding D8AD-CAN-001).
Provisioning works as follows:

- **Preferred (operator-provided secret).** Set `BOOTSTRAP_ADMIN_PASSWORD` and `BOOTSTRAP_VIEWER_PASSWORD` in the environment (via `fly secrets set` in production — never in `fly.toml` or a shell command line). The seed hashes those values into the bootstrap accounts and emits only a non-sensitive status line naming the accounts and their credential source.
- **Fallback (random, unlogged).** If an env var is unset, the account gets a cryptographically-random password that is recorded nowhere — not in source, not in stdout, not in any log. The seed prints a non-sensitive warning pointing the operator at `npm run setup:admin` (see below). The account is effectively locked until the operator provisions a known credential.
- **Forced rotation.** Every bootstrap account is created with `must_change_password=1`. The login response directs the user to `/setup-password`, every protected page redirects there, and `requireSession`/`requireAdmin` return HTTP 403 until the user replaces the temporary credential. Bootstrap users therefore cannot use the app with a seeded/temporary password.
- **Operator recovery command.** `SETUP_ADMIN_PASSWORD=... npm run setup:admin` (optionally `SETUP_ADMIN_EMAIL=...`) sets a known password on a bootstrap account and clears the rotation flag. The password is read from the env var only — never from argv, stdout, or a log — so it cannot leak through shell history, `ps`, or CI logs. See `docs/operator-provisioning.md` for the full operator runbook.

The quick-start development command above runs with `AUTH_DISABLED=true` and
never logs in, so provisioning stays out of your way.

If normal development reports `EMFILE` or stops noticing file changes, use
`AUTH_DISABLED=true npm run dev:stable`. It runs the same loopback development
server with Watchpack polling and is the stable fallback for constrained macOS
file-watcher limits.

## What you get

### Data model

The legacy KPI catalog remains intact. Schema 10 introduced the normalized
strategic sidecar, schema 11 hardened its effective-dated component identity
and ratio semantics, and schema 12 added persisted organization/plan ownership.
Schema 13 added the Board role, schema 14 added the editable Board visibility
scope, and schema 15 added transactional user-lifecycle audit and last-admin
protections. Schema 16 adds the preservation-only Successor Strategic Plan
lifecycle, lineage, readiness, activation, and recovery evidence.
After initialization, SQLite—not the seed snapshot—is authoritative for the
organization identity, plan years, priorities, goals, measures, configurations,
components, targets, and source references. Every KPI can explicitly define:

- **category** — one of the 5 Eastern State strategic priorities
- **metric name**
- **measurement type** — `binary`, `milestone`, `count`, `percentage`,
  `average`, `cumulative`, `year_over_year`, `distribution`, `currency`,
  `ratio`, or `multi_component`
- **reporting frequency** — `monthly`, `quarterly`, `annual`, `cumulative`, or
  `one_time`
- raw calculation inputs, components, annual/full-plan targets, target
  descriptions, board status, and configuration-gap ownership
- **direction** — `higher` is better, `lower` is better, or `neutral`
- optional **notes** for context

Legacy annual-only values remain stored as a single full-year value at internal
`month = 0`. Schema-10 observations use an explicit `period_type` and
`period_index`; annual, cumulative, and one-time records use internal index `0`,
which is rendered as a human label and never offered as a month. Legacy
breakdown metrics continue to use `breakdown_entries` keyed by label × year.

### Initial strategic-plan fixture (5 priorities · 22 named goals · 59 KPIs)

- **Reimagine Visitor Experience** — 16 KPIs, 13 with 2027/2029 targets
- **Advance Historic Preservation** — 13 KPIs, 4 with targets
- **Expand Workforce Development** — 9 KPIs, 3 with targets
- **Support Learning through Justice Education** — 9 KPIs, 1 with a target
- **Enhance Organizational Capacity** — 12 KPIs, 4 with targets

The explicit one-time seed/migration fixture is mapped by stable slug. It includes 46
component definitions and preserves every TK/TBD target as an unresolved
configuration item rather than inventing a zero. The older 25 per-KPI target
rows remain available for backward compatibility; they are not the named goal
count. Legacy annual values continue to use internal `month = 0`, which is
never exposed as a user-selectable month.

### Product destinations

- **Overview** (`/dashboard/overview`) — a route-scoped organization score, the five Strategic Priorities, and a bounded Needs attention list. It never calculates or renders the Board Report.
- **Data Entry** (`/data-entry`, Admin) — one resumable reporting-year checklist. Each measure renders only the raw inputs required by its effective strategic configuration. Save state is server-confirmed and failed saves retain the draft.
- **Reports** (`/reports`) — Board Report and strategic Trends behind one selector. Only the selected report is loaded; CSV/PNG/PDF exports operate from the visible report.
- **Setup** (`/setup`, Admin) — one Plans, Measures, Goals, People, and Activity workspace. Configuration gaps are a Measures attention filter rather than a destination.

Overview also links to two deliberate drill-down routes; they are not top-level
destinations or additional workflows:

- **Strategic Priority** (`/dashboard/category/[slug]`) — goal progress and the
  measures that contribute to it, using strategic calculated results only.
- **Measure** (`/dashboard/metric/[slug]`) — current result, target progress,
  related inputs, and strategic reported-result history.

Comparison logic adapts to unit type:

- Monthly count/attendance/currency metrics support month-by-month, year-to-date (always January through the selected month), and trend comparisons with percent change.
- Annual metrics compare full-year values directly; YTD/through-month is hidden.
- Percent metrics show percentage-point deltas (pts) in addition to relative change.
- Direction-aware coloring marks an increase as good/bad depending on whether higher or lower is better.
- Board CSV/PNG/PDF exports consume the same sanitized report model as the UI; the server export route is session-protected.

The former `/admin/*`, `/dashboard/trends`, `/api/entries`, `/api/breakdowns`,
and `/api/goals` production workflows are removed, not aliased. Legacy values,
breakdowns, targets, snapshots, and tombstones remain a read-only historical
archive. ADR 0022 documents backup, migration, and rollback.

## Architecture

| Layer       | Tech                                              |
| ----------- | ------------------------------------------------- |
| Framework   | Next.js 16 App Router + TypeScript                |
| Styling     | Tailwind CSS with a custom brand palette          |
| Database    | SQLite via Node's built-in `node:sqlite` module   |
| Auth        | `iron-session` (encrypted cookies) + `bcryptjs`   |
| Validation  | Zod                                               |
| Charts      | Recharts                                          |
| PDF export  | `html2canvas` + `jspdf` (client-side)             |
| Icons       | `lucide-react`                                    |

The schema is versioned (`src/lib/schema-version.json` mirrored into
`meta.schema_version`). Schema 10 migrates schema 9 transactionally and
additively; schema 11 then rebuilds only the strategic component sidecar so
component slugs are configuration-scoped and ratio numerator/denominator roles
are explicit. Schema 12 adds `organizations` and `strategic_plans`, assigns
every priority to the active plan, removes plan-specific year defaults/checks,
and preserves every descendant ID and value. Its one-time content-migration
marker permits initialization or narrowly fingerprinted historical repair only
during the explicit upgrade pass; subsequent migration runs do not reconcile
operator content from code. Schema 13 widens the user role contract with Board
reporting access; schema 14 stores Board visibility scope and immutable scope
audit; schema 15 stores immutable user-lifecycle audit events and refuses
last-active-admin removal; schema 16 adds Successor Strategic Plan lifecycle
state and immutable activation/recovery evidence without creating a Draft or
rewriting existing plan-owned content. None of these additive migrations resets
legacy KPI values, targets, IDs, users, or audit history. All sample data is
flagged via `meta.sample_data` and surfaced as a "Sample data" badge throughout
the UI.

## Routes

| Path                           | Purpose                                     | Auth                |
| ------------------------------ | ------------------------------------------- | ------------------- |
| `/login`                       | Sign in                                     | public              |
| `/dashboard/overview`          | Strategic Plan overview                     | Board + viewer + admin |
| `/dashboard/category/[slug]`   | Strategic Priority drill-down               | Board + viewer + admin |
| `/dashboard/metric/[slug]`     | Measure drill-down                          | Board + viewer + admin |
| `/reports`                     | Board Report and strategic Trends           | Board + viewer + admin |
| `/data-entry`                  | Reporting checklist and strategic values    | admin only          |
| `/setup`                       | Plans, Measures, Goals, People, and Activity | admin only          |

### Strategic API surfaces

Schema-10 data is first class; the UI does not serialize raw strategic inputs
through legacy scalar entry routes:

- `GET /api/strategy/export` returns the session-protected board-report model
  or CSV for a reporting year.
- `POST`/`DELETE /api/strategy/observations`,
  `/api/strategy/component-entries`, and `/api/strategy/distributions` write or
  remove raw KPI, component, and distribution values.
- `POST /api/strategy/observations` also accepts the atomic multi-input payload
  (`submission_type: "multi_input"`) used to save every component and
  distribution in one form submission.
- `GET`/`POST`/`PATCH /api/strategy/distribution-bands` reads effective bands
  and creates, updates, reorders, archives, or restores them.
- `POST`/`PATCH /api/strategy/configurations`,
  `/api/strategy/components`, and `/api/strategy/targets` manage effective
  configuration, component definitions, and annual/full-plan targets.
- `PATCH /api/strategy/goals` manages named-goal rules and lifecycle.
- `PATCH /api/strategy/memberships` manages effective KPI completion role,
  weight, and display order within a named goal.

The exhaustive auth regression matrix currently contains 32 protected
route/method combinations: 30 admin-gated combinations, the staff-only
distribution-band read, and the general-session Board report export. Every
mutation is also enrolled in the shared same-origin, JSON content-type, and
CSRF checks.

## Quality checks

Run the fast compiler, repository guards, type-aware lint, and unit/integration
suite before each commit:

```bash
npm run check
```

Use `npm run check:all` for release-level validation and
`npm run security:scan` for the pinned OSV-Scanner, Gitleaks, and Semgrep gates.
GitHub Actions runs those gates independently alongside CodeQL so each can be a
stable required check. Pull requests also receive dependency-delta review and
an always-present production-container security contract; production-relevant
pull requests and every `master` commit receive the full Trivy image scan.
OpenSSF Scorecard runs as a scheduled repository supply-chain signal. See
[`docs/quality-and-security-gates.md`](docs/quality-and-security-gates.md) for
commands, policies, exceptions, failure triage, live GitHub governance, and
approval-only administrator actions.

## Verification

A repeatable smoke harness lives at `scripts/smoke.sh`. Invoke it directly (no
npm wrapper) against a running server. The bypass path is dev-only because
`next start` runs with `NODE_ENV=production` and cannot serve app routes with
`AUTH_DISABLED=true`.
TLS certificates are verified. For an HTTPS endpoint signed by a private CA,
set `SMOKE_CA_BUNDLE` to the CA certificate bundle path.

```bash
# Smoke test the bypass-auth flow (no login required).
AUTH_DISABLED=true APP_CANONICAL_ORIGIN=http://127.0.0.1:3290 \
  WATCHPACK_POLLING=true PORT=3290 npm run dev &
AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh

# Stop the dev server before reusing :3290 for the production/auth-enabled flow.
AUTH_DISABLED= npm run build
AUTH_DISABLED=false PORT=3290 node_modules/.bin/next start -p 3290 &
SMOKE_EMAIL=zach@easternstate.org SMOKE_PASSWORD='<operator-provisioned password>' \
  AUTH_DISABLED=false PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh
```

It verifies the four-destination product, the 5-priority/59-KPI strategic
catalog, a narrow Overview with no report markup, removed-route 404s, on-demand
Reports, Setup areas, canonical strategic mutation/export round-trips, and the
development-bypass boundary. For curl mutations, the harness first fetches
the `eastern_state_kpi_csrf` cookie from `/api/auth/me` and sends both `Origin`
and `X-CSRF-Token`, matching the browser `apiFetch` path.

With that server still running, use `PERF_EMAIL` and `PERF_PASSWORD` with
`BASE=http://127.0.0.1:3290 npm run perf:profile`. It verifies the session,
records server response, LCP, decoded HTML/JavaScript, DOM size, and hidden
Board Report presence, and saves a raw Chrome trace for every desktop/mobile
destination pair. The evidence set contains eight current and eight controlled
baseline traces. See `docs/performance/issue-42.md`.

`npm run test:e2e` never points at `data/kpi.db`: Playwright atomically
reserves a database in a private `0700` temporary run directory, propagates
its exact identity to teardown, and removes its DB/WAL/SHM files only after
owner, marker, inode, and link-count checks. An `E2E_DATABASE_PATH` override
must be a new prefixed `.db` beneath the OS temp root; pre-existing files,
directories, links, and path escapes are rejected before seeding.

## Deployment Notes

Before declaring a release ready, dispatch the manual `Release Security`
workflow from `master` and record the exact SHA in its successful `Release
container readiness` summary. It fails unless `master` still points at that SHA
and the latest exact-commit `Container image / Trivy` and `Production container
security` jobs are both green. Deploy only a clean checkout of the recorded
commit; if `master` moves or a newer exact-commit scan fails, rerun the release
check. See `docs/quality-and-security-gates.md` and
`docs/operator-provisioning.md` for the complete contract. For an on-premises
or other local production server, follow
[`docs/local-server-deployment.md`](docs/local-server-deployment.md); it covers
the single-process SQLite boundary, TLS reverse proxy, first-boot secrets,
Zach/Kerry onboarding, health verification, backup, and rollback.

Fly deploys through `Dockerfile` + `fly.toml` with SQLite mounted at
`/app/data/kpi.db`. `TRUST_PROXY=true` is set for Fly so the login throttle uses
the proxy-provided client IP instead of collapsing every failed attempt into the
`unknown` bucket. The production startup script runs `scripts/ensure-seeded.mjs`;
that probe compares the mounted database's `meta.schema_version` with
`src/lib/schema-version.json`, runs `db:migrate` for populated schema 9–15
predecessors to reach schema 16, refuses a destructive reseed if migration does
not produce a ready database, and seeds only a missing/disposable sample
database. Schema 8 requires the explicit operator-run migration documented
above rather than automatic boot migration. Docker builds point
`DATABASE_PATH` at a disposable `/tmp` database and remove `/app/data` before the
final image copy, so build-time SQLite files and one-time seed passwords are not
baked into the runtime image.

### Existing guard and build aggregate

`npm run design-system:test` is the existing combined guard/build aggregate.
The primary GitHub `Quality` workflow also exposes typecheck, lint, tests,
build, E2E, OSV-Scanner, Gitleaks, and Semgrep as separate required checks.
The aggregate follows the current `package.json` chain; any failure aborts:

1. `npm run quality:guards`, which runs:
   - `npm run design-system:guard` (design tokens, shared components,
     auth-bypass policy, and architecture boundaries);
   - `npm run deployment-config:guard`;
   - `npm run hygiene:guard`;
   - `npm run docstrings:guard`;
   - `npm run production-dependencies:guard`;
   - `npm run install-scripts:guard`; and
   - `scripts/d8ad-can-008-ci-gate.sh` for shell-injection regressions.
2. `npm run typecheck`, which runs Next route type generation with
   `AUTH_DISABLED` cleared and then `tsc --noEmit`.
3. `AUTH_DISABLED= npm run build`, the explicit Webpack production build with
   the development bypass cleared.

To verify the gate locally before opening a PR:

```bash
npm run design-system:test
```

A **human-readable QA checklist** that exercises every flow the smoke harness
covers — plus mobile rendering at 390 px, exports, forced password rotation,
and auth API regression coverage — lives at `docs/qa-manual.md`. New engineers should
walk the checklist end-to-end after their first checkout.

The schema-12 release verification recorded on July 15, 2026: `npm test` passed
**82 files / 1,217 tests**; `npm run design-system:test` passed its security and
architecture guards, typecheck, and production build; the loopback development
smoke passed **51/51** checks; the credentialed production smoke passed
**52/52**; and `npm run test:e2e` passed **11/11** serial workflows through a
real provisioned admin login, including password rotation, atomic save/error/
offline recovery, the 320–1920 px and 200%–400% reflow matrix,
keyboard/reduced-motion/print checks, and CSV/PNG/PDF validation. The authenticated production
profile set saved sixteen raw Chrome traces: eight current and eight controlled
baseline. The exact-route Overview comparison reduced decoded HTML by 94.2%
and DOM elements by 96.7%, with no hidden Board Report. Auth behavior is
covered by that release's 28-route regression matrix. Those counts are
historical evidence, not the current schema-16 suite; run `npm test` and
`npm run test:e2e` for current totals.

Schema 8 intentionally replaced the former sample catalog with the strategic
plan, resetting KPI data and audit history while preserving users. Schema 9 is
additive: it gives every goal a fixed baseline year so 2027/2029 progress can
be measured against the 2026 strategic baseline. Schema 10 is also additive
from schema 9: `npm run db:migrate` creates the strategic sidecars and
idempotently maps the existing catalog without resetting legacy IDs, values,
targets, users, or audit history. Schema 11 additively scopes component identity
to each effective configuration and records ratio aggregation roles while
preserving existing component IDs and observations. Schema 12 adds the
database-owned organization/plan boundary and removes embedded plan-year
constraints while preserving strategic records and IDs. Schema 13 widens user
roles with Board reporting access; schema 14 persists the editable Board
visibility scope and its immutable audit snapshots; schema 15 adds immutable
user-lifecycle audit plus last-active-admin and newer-schema refusal guards;
schema 16 adds Successor Strategic Plan lifecycle state, lineage, readiness,
activation, and recovery evidence without rewriting existing plan content.
Back up a production database before any migration; see ADRs 0023/0024 and
`docs/migration-notes.md`.

## Data model (schema)

- **organizations / strategic_plans** — persisted installation identity, plan metadata, inclusive reporting-year range, revision, and audit ownership
- **categories** — plan owner, slug, name, description, sort order
- **kpis** — category, optional parent, slug, name, unit label, `unit_type`, `reporting_frequency`, `direction`, description, sort order, active flag
- **monthly_entries** — KPI × year × month (1–12 monthly, 0 annual) = value + notes; unique per (kpi, year, month)
- **breakdown_entries** — KPI × year × month × label = value + notes; `month = 0` for annual breakdowns, `1–12` for monthly breakdowns; unique per (kpi, year, month, label)
- **strategic_goals / goal_kpis** — 22 named goals (each with 2–5 KPIs) and explicit, effective-dated membership for all 59 KPIs
- **kpi_measurement_configs / kpi_targets** — typed formulas, frequencies, statuses, configuration gaps, and distinct annual/full-plan targets
- **kpi_observations** — first-class KPI values and raw calculation inputs by typed period
- **kpi_components / kpi_component_entries** — initially seeded component definitions plus raw component values; identity is configuration-scoped and ratio roles are explicit
- **distribution_bands / distribution_observations / distribution_values** — effective band definitions, respondent totals, counts, immutable label snapshots, and successor-only edits for referenced calculation classifications
- **strategic_audit_events** — immutable snapshots for strategic configuration, lifecycle, and value changes
- **users** — accounts, password hashes, role, forced-rotation state, and durable session-revocation state
- **user_lifecycle_audit_events** — immutable actor-attributed lifecycle events without passwords or password hashes
- **meta** — schema version + sample-data flag
