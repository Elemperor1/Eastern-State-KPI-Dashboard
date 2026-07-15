# Eastern State Strategic Plan

A production-quality strategic-performance decision-support product for
**Eastern State Penitentiary Historic Site**. It helps executive leadership and
Board reviewers understand completion of the 2025–2029 Strategic Plan, annual
pacing, full-plan progress, unresolved Measurement Definitions, and supporting
year comparisons.

The canonical cross-layer product specification is
[`docs/product-foundation.md`](docs/product-foundation.md). It defines the
evidence boundary, user needs, product outcome, conceptual model, vocabulary,
navigation, flows, states, and constraints that future visual work must
preserve. ADR 0022 remains the four-destination and legacy-archive authority;
`CONTEXT.md` remains the detailed domain glossary; `DESIGN.md` remains the
visual-system authority.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create/reset a disposable development database with sample data (2024–2026)
npm run db:seed

# 3. Start the loopback-only development server with the local auth bypass
AUTH_DISABLED=true npm run dev
```

For an existing schema-9 or schema-10 database, especially a production SQLite volume, back
up the database and its WAL/SHM files and run the additive migration instead of
the destructive sample seed:

```bash
DATABASE_PATH=/absolute/path/to/kpi.db npm run db:migrate
AUTH_DISABLED= npm run build
npm start
```

`npm run db:seed` intentionally replaces KPI-owned sample values, definitions,
and audit history while preserving users. It is for disposable/sample
databases, not production migration.

Open <http://localhost:3000>. With the quick-start bypass, the app opens
directly; with auth enabled, sign in normally.

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

On the first run against a fresh database, `ensureSeedAdmin()` creates `kerry@easternstate.org` (admin) and `zach@easternstate.org` (viewer). **No plaintext password is ever written to stdout, stderr, or logs** — the old "read the password from the startup log" flow has been removed (security finding D8AD-CAN-001). Provisioning works as follows:

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
strategic sidecar, and schema 11 hardens its effective-dated component identity
and ratio semantics, so every KPI can explicitly define:

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

### Strategic-plan metric set (5 priorities · 22 named goals · 59 KPIs)

- **Reimagine Visitor Experience** — 16 KPIs, 13 with 2027/2029 targets
- **Advance Historic Preservation** — 13 KPIs, 4 with targets
- **Expand Workforce Development** — 9 KPIs, 3 with targets
- **Support Learning through Justice Education** — 9 KPIs, 1 with a target
- **Enhance Organizational Capacity** — 12 KPIs, 4 with targets

The source dashboard is mapped explicitly by stable slug. It includes 46
component definitions and preserves every TK/TBD target as an unresolved
configuration item rather than inventing a zero. The older 25 per-KPI target
rows remain available for backward compatibility; they are not the named goal
count. Legacy annual values continue to use internal `month = 0`, which is
never exposed as a user-selectable month.

### Product destinations

- **Overview** (`/dashboard/overview`) — a route-scoped organization score, the five Strategic Priorities, and a bounded Needs attention list. It never calculates or renders the Board Report.
- **Data Entry** (`/data-entry`, Admin) — one resumable reporting-year checklist. Each measure renders only the raw inputs required by its effective strategic configuration. Save state is server-confirmed and failed saves retain the draft.
- **Reports** (`/reports`) — Board Report and strategic Trends behind one selector. Only the selected report is loaded; CSV/PNG/PDF exports operate from the visible report.
- **Setup** (`/setup`, Admin) — one Measures, Goals, People, and Activity workspace. Configuration gaps are a Measures attention filter rather than a destination.

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
| Framework   | Next.js 15 App Router + TypeScript          |
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
are explicit. Neither migration resets legacy KPI values, targets, IDs, users,
or audit history. The production migrator applies only narrowly fingerprinted,
audited corrections to prior system-owned canonical contracts and leaves
operator-attributed/customized rows unchanged. All sample data is flagged via `meta.sample_data` and surfaced
as a "Sample data" badge throughout the UI.

## Routes

| Path                           | Purpose                                     | Auth                |
| ------------------------------ | ------------------------------------------- | ------------------- |
| `/login`                       | Sign in                                     | public              |
| `/dashboard/overview`          | Strategic Plan overview                     | viewer + admin      |
| `/dashboard/category/[slug]`   | Strategic Priority drill-down               | viewer + admin      |
| `/dashboard/metric/[slug]`     | Measure drill-down                          | viewer + admin      |
| `/reports`                     | Board Report and strategic Trends           | viewer + admin      |
| `/data-entry`                  | Reporting checklist and strategic values    | admin only          |
| `/setup`                       | Measures, Goals, People, and Activity        | admin only          |

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

The exhaustive auth regression matrix currently contains 28 protected
route/method combinations: 26 admin-gated mutations and two session-gated
reads (`strategy/export` and `strategy/distribution-bands`). Every mutation is
also enrolled in the shared same-origin, JSON content-type, and CSRF checks.

## Quality checks

Run the fast compiler, repository guards, type-aware lint, and unit/integration
suite before each commit:

```bash
npm run check
```

Use `npm run check:all` for release-level validation and
`npm run security:scan` for the pinned OSV-Scanner, Gitleaks, and Semgrep gates.
GitHub Actions runs those gates independently alongside CodeQL so each can be a
stable required check. See
[`docs/quality-and-security-gates.md`](docs/quality-and-security-gates.md) for
commands, policies, exceptions, failure triage, and the GitHub settings an
administrator must enable.

## Verification

A repeatable smoke harness lives at `scripts/smoke.sh`. Invoke it directly (no
npm wrapper) against a running server. The bypass path is dev-only because
`next start` runs with `NODE_ENV=production` and cannot serve app routes with
`AUTH_DISABLED=true`.

```bash
# Smoke test the bypass-auth flow (no login required).
AUTH_DISABLED=true APP_CANONICAL_ORIGIN=http://127.0.0.1:3290 \
  WATCHPACK_POLLING=true PORT=3290 npm run dev &
AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh

# Stop the dev server before reusing :3290 for the production/auth-enabled flow.
AUTH_DISABLED= npm run build
AUTH_DISABLED=false PORT=3290 node_modules/.bin/next start -p 3290 &
SMOKE_EMAIL=kerry@easternstate.org SMOKE_PASSWORD='<operator-provisioned password>' \
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

Fly deploys through `Dockerfile` + `fly.toml` with SQLite mounted at
`/app/data/kpi.db`. `TRUST_PROXY=true` is set for Fly so the login throttle uses
the proxy-provided client IP instead of collapsing every failed attempt into the
`unknown` bucket. The production startup script runs `scripts/ensure-seeded.mjs`;
that probe compares the mounted database's `meta.schema_version` with
`src/lib/schema-version.json`, runs `db:migrate` for a populated additive
predecessor such as schema 9, refuses a destructive reseed if migration does
not produce a ready database, and seeds only a missing/disposable sample
database. Docker builds point
`DATABASE_PATH` at a disposable `/tmp` database and remove `/app/data` before the
final image copy, so build-time SQLite files and one-time seed passwords are not
baked into the runtime image.

### Existing guard and build aggregate

`npm run design-system:test` is the existing combined guard/build aggregate.
The primary GitHub `Quality` workflow also exposes typecheck, lint, tests,
build, E2E, OSV-Scanner, Gitleaks, and Semgrep as separate required checks.
This aggregate chains seven checks in order; any failure aborts:

1. `scripts/design-tokens-guard.sh` — fails if any literal hex color, raw `transition: all`, or inline `style={{ ... color: "#…" }}` bypass is introduced in `src/app/**` or `src/components/**` outside the design-system library (`src/components/ui/`) and the source-of-truth `src/app/globals.css`.
2. `scripts/design-system-guard.sh` — fails if any raw `<button>` / `<input>` / `<select>` / `<table>` element or shared primitive class (`surface`, `btn-*`, `input`, `pill`, `data-table`, …) is used outside `src/components/ui/`.
3. `scripts/auth-bypass-guard.sh` — proves deploy/build configuration cannot
   enable the development bypass.
4. `scripts/architecture-boundary-guard.sh` — enforces server/client and
   internal data-access boundaries.
5. `scripts/d8ad-can-008-ci-gate.sh` — rejects shell-injection regressions.
6. `npx tsc --noEmit` — typecheck.
7. `AUTH_DISABLED= npx next build` — production build with the bypass cleared.

To verify the gate locally before opening a PR:

```bash
npm run design-system:test
```

A **human-readable QA checklist** that exercises every flow the smoke harness
covers — plus mobile rendering at 390 px, exports, forced password rotation,
and auth API regression coverage — lives at `docs/qa-manual.md`. New engineers should
walk the checklist end-to-end after their first checkout.

Current schema-11 verification recorded on July 15, 2026: `npm test` passed
**78 files / 1,185 tests**; `npm run design-system:test` passed its security and
architecture guards, typecheck, and production build; the loopback development
smoke passed **51/51** checks; the credentialed production smoke passed
**52/52**; and `npm run test:e2e` passed **11/11** serial workflows through a
real provisioned admin login, including password rotation, atomic save/error/
offline recovery, the 320–1920 px and 200%–400% reflow matrix,
keyboard/reduced-motion/print checks, and CSV/PNG/PDF validation. The authenticated production
profile set saved sixteen raw Chrome traces: eight current and eight controlled
baseline. The exact-route Overview comparison reduced decoded HTML by 94.2%
and DOM elements by 96.7%, with no hidden Board Report. Auth behavior is
covered by the current 28-route regression matrix.

Schema 8 intentionally replaced the former sample catalog with the strategic
plan, resetting KPI data and audit history while preserving users. Schema 9 is
additive: it gives every goal a fixed baseline year so 2027/2029 progress can
be measured against the 2026 strategic baseline. Schema 10 is also additive
from schema 9: `npm run db:migrate` creates the strategic sidecars and
idempotently maps the existing catalog without resetting legacy IDs, values,
targets, users, or audit history. Schema 11 additively scopes component identity
to each effective configuration and records ratio aggregation roles while
preserving existing component IDs and observations. Back up a production
database before any migration; see ADR 0020 and `docs/migration-notes.md`.

## Data model (schema)

- **categories** — slug, name, description, sort order
- **kpis** — category, optional parent, slug, name, unit label, `unit_type`, `reporting_frequency`, `direction`, description, sort order, active flag
- **monthly_entries** — KPI × year × month (1–12 monthly, 0 annual) = value + notes; unique per (kpi, year, month)
- **breakdown_entries** — KPI × year × month × label = value + notes; `month = 0` for annual breakdowns, `1–12` for monthly breakdowns; unique per (kpi, year, month, label)
- **strategic_goals / goal_kpis** — 22 named goals (each with 2–5 KPIs) and explicit, effective-dated membership for all 59 KPIs
- **kpi_measurement_configs / kpi_targets** — typed formulas, frequencies, statuses, configuration gaps, and distinct annual/full-plan targets
- **kpi_observations** — first-class KPI values and raw calculation inputs by typed period
- **kpi_components / kpi_component_entries** — 46 canonical component definitions plus raw component values; identity is configuration-scoped and ratio roles are explicit
- **distribution_bands / distribution_observations / distribution_values** — effective band definitions, respondent totals, counts, immutable label snapshots, and successor-only edits for referenced calculation classifications
- **strategic_audit_events** — immutable snapshots for strategic configuration, lifecycle, and value changes
- **users** — name, email, bcrypt-hashed password, role
- **meta** — schema version + sample-data flag
