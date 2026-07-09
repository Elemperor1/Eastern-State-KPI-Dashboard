# Eastern State KPI Intelligence Dashboard

A production-quality internal KPI Intelligence Dashboard for **Eastern State Penitentiary Historic Site**. Built for executive leadership and board reporting to understand completion of the 2025–2029 strategic plan, annual pacing, full-plan progress, unresolved measurement definitions, and supporting year comparisons.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create/reset a disposable development database with sample data (2024–2026)
npm run db:seed

# 3. Start the loopback-only development server
npm run dev
```

For an existing schema-9 database, especially a production SQLite volume, back
up the database and its WAL/SHM files and run the additive migration instead of
the destructive sample seed:

```bash
DATABASE_PATH=/absolute/path/to/kpi.db npm run db:migrate
npm run build
npm start
```

`npm run db:seed` intentionally replaces KPI-owned sample values, definitions,
and audit history while preserving users. It is for disposable/sample
databases, not production migration.

Open <http://localhost:3000> and sign in.

> **Auth bypass (temporary).** `AUTH_DISABLED=true` is set in `.env.local`, so the
> dashboard is publicly reachable in dev — `/` redirects straight to
> `/dashboard/overview` and the login form is skipped. The flag is read by
> `src/lib/auth-flag.ts`; with it on, the auth feature session surface returns
> the real `auth-disabled@local` users row and the `AccountBlock` in `AppShell`
> hides its Logout button. The bypass is blocked in production/test: `next build` fails
> with `AUTH_DISABLED=true`, and `next start` cannot serve app routes with the
> flag set. To restore iron-session
> login, set `AUTH_DISABLED=false` in `.env.local` (or unset it) and revert the
> four conditional branches in `src/lib/session.ts`, `src/app/page.tsx`, and
> `src/components/AppShell.tsx`. The `/login` page, `/api/auth/*` routes, seeded
> accounts, and the `src/features/auth/session.ts` gate surface is preserved — no
> other restoration work is needed.

### Default accounts (seeded on first DB access)

On the first run against a fresh database, `ensureSeedAdmin()` creates `kerry@easternstate.org` (admin) and `zach@easternstate.org` (viewer). **No plaintext password is ever written to stdout, stderr, or logs** — the old "read the password from the startup log" flow has been removed (security finding D8AD-CAN-001). Provisioning works as follows:

- **Preferred (operator-provided secret).** Set `BOOTSTRAP_ADMIN_PASSWORD` and `BOOTSTRAP_VIEWER_PASSWORD` in the environment (via `fly secrets set` in production — never in `fly.toml` or a shell command line). The seed hashes those values into the bootstrap accounts and emits only a non-sensitive status line naming the accounts and their credential source.
- **Fallback (random, unlogged).** If an env var is unset, the account gets a cryptographically-random password that is recorded nowhere — not in source, not in stdout, not in any log. The seed prints a non-sensitive warning pointing the operator at `npm run setup:admin` (see below). The account is effectively locked until the operator provisions a known credential.
- **Forced rotation.** Every bootstrap account is created with `must_change_password=1`. The login response directs the user to `/setup-password`, every protected page redirects there, and `requireSession`/`requireAdmin` return HTTP 403 until the user replaces the temporary credential. Bootstrap users therefore cannot use the app with a seeded/temporary password.
- **Operator recovery command.** `SETUP_ADMIN_PASSWORD=... npm run setup:admin` (optionally `SETUP_ADMIN_EMAIL=...`) sets a known password on a bootstrap account and clears the rotation flag. The password is read from the env var only — never from argv, stdout, or a log — so it cannot leak through shell history, `ps`, or CI logs. See `docs/operator-provisioning.md` for the full operator runbook.

The default development workflow runs with `AUTH_DISABLED=true` and never logs in, so provisioning stays out of your way.

## What you get

### Data model

The legacy KPI catalog remains intact. Schema 10 adds a normalized strategic
sidecar so every KPI can explicitly define:

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

The source dashboard is mapped explicitly by stable slug. It includes 45
component definitions and preserves every TK/TBD target as an unresolved
configuration item rather than inventing a zero. The older 25 per-KPI target
rows remain available for backward compatibility; they are not the named goal
count. Legacy annual values continue to use internal `month = 0`, which is
never exposed as a user-selectable month.

### Dashboard views

- **Organization overview** (`/dashboard/overview`) — one organization-level “X of Y goals completed” score followed by five concise performance-area cards. Priority, named-goal, and configuration detail stays in drill-downs and board exports instead of expanding the landing page.
- **Individual category pages** (`/dashboard/category/[slug]`) — every metric in the category as a direction-aware summary card, plus breakdown charts where applicable.
- **Individual metric detail** (`/dashboard/metric/[slug]`) — calculated result, formula, raw inputs, target description, annual and full-plan progress, components/distributions/revenue, history, and exports.
- **Trend Explorer** (`/dashboard/trends`) — multi-KPI, multi-year overlays (monthly metrics).

Comparison logic adapts to unit type:

- Monthly count/attendance/currency metrics support month-by-month, year-to-date (always January through the selected month), and trend comparisons with percent change.
- Annual metrics compare full-year values directly; YTD/through-month is hidden.
- Percent metrics show percentage-point deltas (pts) in addition to relative change.
- Direction-aware coloring marks an increase as good/bad depending on whether higher or lower is better.
- Board CSV/PNG/PDF exports consume the same sanitized report model as the UI; the server export route is session-protected.

### Admin

- **Data entry** (`/admin/data`) — pick category, metric, and year. Monthly metrics get a 12-month grid; annual metrics get a single full-year value; breakdown metrics get editable label/value rows. Optional notes per entry.
- **Strategic data entry** (`/admin/strategy-data`) — enter or remove first-class KPI observations, component entries, and distribution responses using the configured period and raw-input shape.
- **KPIs & categories** (`/admin/kpis`) — manage legacy catalog metadata and open the strategic editor for formulas, targets, components, and bands.
- **Strategic KPI editor** (`/admin/kpis/[id]`) — edit effective-dated measurement configuration, annual/full-plan targets, components, and distribution bands.
- **Legacy KPI goals** (`/admin/goals`) — maintain the backward-compatible per-KPI baseline/delta targets.
- **Strategic goals** (`/admin/strategic-goals`) — edit named-goal rules, status, ownership, and lifecycle.
- **Configuration gaps** (`/admin/configuration-gaps`) — filter unresolved targets and definitions by priority, goal, owner, year, status, and frequency.
- **History** (`/admin/history`) — browse value-entry and immutable strategic-configuration audit events.
- **Users** (`/admin/users`) — invite viewers, reset passwords.

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

The schema is versioned (`src/lib/schema-version.json` mirrored into `meta.schema_version`). Schema 10 migrates schema 9 transactionally and additively; it does not reset legacy KPI values, targets, IDs, users, or audit history. All sample data is flagged via `meta.sample_data` and surfaced as a "Sample data" badge throughout the UI.

## Routes

| Path                           | Purpose                                     | Auth                |
| ------------------------------ | ------------------------------------------- | ------------------- |
| `/login`                       | Sign in                                     | public              |
| `/dashboard/overview`          | Category overview (executive summary)       | viewer + admin      |
| `/dashboard/category/[slug]`   | Individual category page                    | viewer + admin      |
| `/dashboard/metric/[slug]`     | Individual metric detail view               | viewer + admin      |
| `/dashboard/trends`            | Multi-KPI, multi-year trend explorer         | viewer + admin      |
| `/admin/data`                  | Data entry (monthly/annual/breakdown)       | admin only          |
| `/admin/strategy-data`         | Strategic raw-value data entry              | admin only          |
| `/admin/kpis`                  | Manage KPIs and categories                  | admin only          |
| `/admin/kpis/[id]`             | Edit strategic KPI configuration            | admin only          |
| `/admin/goals`                 | Manage legacy per-KPI targets               | admin only          |
| `/admin/strategic-goals`       | Manage named strategic goals                | admin only          |
| `/admin/configuration-gaps`    | Resolve strategic KPI configuration gaps   | admin only          |
| `/admin/history`               | Value and strategic audit history           | admin only          |
| `/admin/users`                 | Manage team members                         | admin only          |

### Strategic API surfaces

Schema-10 data is first class; the UI does not serialize raw strategic inputs
through legacy scalar entry routes:

- `GET /api/strategy/export` returns the session-protected board-report model
  or CSV for a reporting year.
- `POST`/`DELETE /api/strategy/observations`,
  `/api/strategy/component-entries`, and `/api/strategy/distributions` write or
  remove raw KPI, component, and distribution values.
- `GET`/`POST`/`PATCH /api/strategy/distribution-bands` reads effective bands
  and creates, updates, reorders, archives, or restores them.
- `POST`/`PATCH /api/strategy/configurations`,
  `/api/strategy/components`, and `/api/strategy/targets` manage effective
  configuration, component definitions, and annual/full-plan targets.
- `PATCH /api/strategy/goals` manages named-goal rules and lifecycle.
- `PATCH /api/strategy/memberships` manages effective KPI completion role,
  weight, and display order within a named goal.

The exhaustive auth regression matrix currently contains 35 protected
route/method combinations: 33 admin-gated mutations and two session-gated
reads (`strategy/export` and `strategy/distribution-bands`). Every mutation is
also enrolled in the shared same-origin, JSON content-type, and CSRF checks.

## Verification

A repeatable smoke harness lives at `scripts/smoke.sh`. Invoke it directly (no
npm wrapper) against a running server. The bypass path is dev-only because
`next start` runs with `NODE_ENV=production` and cannot serve app routes with
`AUTH_DISABLED=true`.

```bash
# Smoke test the bypass-auth flow (no login required).
AUTH_DISABLED=true node_modules/.bin/next dev -p 3290 &
AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh

# Stop the dev server before reusing :3290 for the production/auth-enabled flow.
npm run build
AUTH_DISABLED=false PORT=3290 node_modules/.bin/next start -p 3290 &
SMOKE_EMAIL=kerry@easternstate.org SMOKE_PASSWORD='<operator-provisioned password>' \
  AUTH_DISABLED=false PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh
```

It verifies the 5-priority/59-KPI strategic catalog, every category page,
representative annual percentage/currency/breakdown metrics, the annual-only
Trend Explorer state, admin pages, mutation round-trips, and the auth-bypass
behavior of `POST /api/entries` (401 with no session when auth is enabled; 201
when the bypass is in effect). For curl mutations, the harness first fetches
the `eastern_state_kpi_csrf` cookie from `/api/auth/me` and sends both `Origin`
and `X-CSRF-Token`, matching the browser `apiFetch` path.

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

### CI gate

`npm run design-system:test` is the **CI gate** and must pass on every PR.
It chains four checks in order; any failure aborts:

1. `scripts/design-tokens-guard.sh` — fails if any literal hex color, raw `transition: all`, or inline `style={{ ... color: "#…" }}` bypass is introduced in `src/app/**` or `src/components/**` outside the design-system library (`src/components/ui/`) and the source-of-truth `src/app/globals.css`.
2. `scripts/design-system-guard.sh` — fails if any raw `<button>` / `<input>` / `<select>` / `<table>` element or shared primitive class (`surface`, `btn-*`, `input`, `pill`, `data-table`, …) is used outside `src/components/ui/`.
3. `npx tsc --noEmit` — typecheck.
4. `npm run build` — production build.

To verify the gate locally before opening a PR:

```bash
npm run design-system:test
```

A **human-readable QA checklist** that exercises every flow the smoke harness
covers — plus mobile rendering at 390 px, exports, and the self-service
password change flow — lives at `docs/qa-manual.md`. New engineers should
walk the checklist end-to-end after their first checkout.

Current schema-10 verification recorded on July 9, 2026: `npm test` passed
**81 files / 1,277 tests**; `npm run design-system:test` passed its guards,
typecheck, and production build; the development smoke passed **64/64** checks;
and `npm run test:e2e` passed **5/5** serial workflows. Manual Chrome review
also retained a valid 1664×14,886 overview PNG and a readable 15-page,
Letter-landscape, 1.5 MB overview PDF. Auth behavior is covered by the
35-route regression matrix; run the documented auth-enabled smoke with an
operator-provisioned credential before a production release.

Schema 8 intentionally replaced the former sample catalog with the strategic
plan, resetting KPI data and audit history while preserving users. Schema 9 is
additive: it gives every goal a fixed baseline year so 2027/2029 progress can
be measured against the 2026 strategic baseline. Schema 10 is also additive
from schema 9: `npm run db:migrate` creates the strategic sidecars and
idempotently maps the existing catalog without resetting legacy IDs, values,
targets, users, or audit history. Back up a production database before any
migration; see ADR 0020 and `docs/migration-notes.md`.

## Data model (schema)

- **categories** — slug, name, description, sort order
- **kpis** — category, optional parent, slug, name, unit label, `unit_type`, `reporting_frequency`, `direction`, description, sort order, active flag
- **monthly_entries** — KPI × year × month (1–12 monthly, 0 annual) = value + notes; unique per (kpi, year, month)
- **breakdown_entries** — KPI × year × month × label = value + notes; `month = 0` for annual breakdowns, `1–12` for monthly breakdowns; unique per (kpi, year, month, label)
- **strategic_goals / goal_kpis** — 22 named goals and explicit, effective-dated membership for all 59 KPIs
- **kpi_measurement_configs / kpi_targets** — typed formulas, frequencies, statuses, configuration gaps, and distinct annual/full-plan targets
- **kpi_observations** — first-class KPI values and raw calculation inputs by typed period
- **kpi_components / kpi_component_entries** — 45 canonical component definitions plus raw component values
- **distribution_bands / distribution_observations / distribution_values** — effective band definitions, respondent totals, counts, and immutable label snapshots
- **strategic_audit_events** — immutable snapshots for strategic configuration, lifecycle, and value changes
- **users** — name, email, bcrypt-hashed password, role
- **meta** — schema version + sample-data flag
