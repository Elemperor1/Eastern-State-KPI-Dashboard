# Eastern State KPI — Agent Notes

Internal KPI dashboard for Eastern State Penitentiary Historic Site. Next.js 16 App Router + SQLite + iron-session.

## Current product boundary (issue 42)

ADR 0022 supersedes older route and interaction notes below wherever they
conflict. The production product has exactly four destinations:
`/dashboard/overview`, `/data-entry`, `/reports`, and `/setup`. Setup contains
Measures, Goals, People, and Activity; persisted Organization and Strategic
Plan settings are edited inside Goals rather than through a fifth destination.
The former `/admin/*` and
`/dashboard/trends` pages are removed, as are the legacy `/api/entries`,
`/api/breakdowns`, and `/api/goals` mutation adapters. Legacy SQLite rows and
`entry_history` remain a read-only archive; current writes use the strategic
observation/component/distribution routes only. The exhaustive auth matrix is
28 protected route/method combinations: 26 Admin-gated and two session-gated.

## Auth status (temporary)

Login can be disabled locally by starting with `AUTH_DISABLED=true npm run dev` (or by setting the same value in an untracked `.env.local`; no tracked environment file enables it). The flag is read by `src/lib/auth-flag.ts`; when true (and `NODE_ENV !== "production"`), `getSession()` / `requireSession()` / `requireAdmin()` return a real `users` row (`auth-disabled@local`) instead of consulting cookies, and `/` redirects straight to `/dashboard/overview`. The `AccountBlock` (and its Logout button) is hidden in `src/components/AppShell.tsx` when the bypass user is detected (`user.email === "auth-disabled@local"`).

**Production guard:** `src/lib/auth-flag.ts` forces `AUTH_DISABLED=false` whenever `NODE_ENV` is `production` or `test`, and throws at module load if the env var is explicitly set in those modes. A reachable production deployment therefore cannot be misconfigured into fail-open admin mode — `next build` fails with `AUTH_DISABLED=true`, and `next start` cannot serve app routes when the flag is set. The bypass only works in dev (`npm run dev`, `NODE_ENV=development`).

The CI gate (`npm run design-system:test`) runs `next build` with `AUTH_DISABLED` explicitly cleared so the production build path is verified on every PR.

**Loopback-only bypass (D8AD-CAN-002):** the bypass is permitted **only** when `NODE_ENV=development` AND the server is bound exclusively to a loopback address (`BIND_HOST` ∈ `127.0.0.1`/`::1`/`localhost`). `auth-flag.ts` throws at startup if the flag is set on a non-loopback bind, and `next.config.mjs` throws at build time if the flag is set during a production build. Enforcement uses the declared `BIND_HOST` env var — never request `Host`/`X-Forwarded-For` headers. `npm run dev` (`scripts/dev.sh`) sets `BIND_HOST=127.0.0.1` and binds `next dev -H 127.0.0.1` automatically when `AUTH_DISABLED` is set. `scripts/auth-bypass-guard.sh` (part of the CI gate) asserts `fly.toml`/`Dockerfile`/`start-production.sh` cannot enable the bypass. Exact safe-use conditions: `docs/operator-provisioning.md` → "AUTH_DISABLED — exact safe-use conditions".

**Durable session revocation (D8AD-CAN-003):** a per-user `sessions_valid_after` unix-ms watermark on the `users` row is the revocation value. Every newly issued session carries the stable user **id** (never email as the identity key) and an `issuedAt` timestamp. App code imports `getCurrentUser()` / `requireSession()` / `requireAdmin()` from `src/features/auth/session.ts`; the implementation in `src/lib/session.ts` re-reads the row from the DB by id on every protected request and rejects — destroying the cookie and returning null — when the user (a) no longer exists (deleted), (b) is disabled (`disabled` flag), or (c) has `issuedAt < sessions_valid_after` (a security-sensitive change happened after this session was issued). `requireAdmin` additionally rejects a downgraded role against the DB-synced role. The watermark is bumped atomically in a transaction on password reset (`updateUserPassword`), self-service password change, role change (`updateUserRole` via `PATCH /api/users/account`), and disable/enable (`setUserDisabled`); deletion needs no bump because the row is gone. Admin role-change + disable/enable live at `PATCH /api/users/account` (self-targeted changes are refused to prevent self-lockout); the UI lives in Setup → People. Invalid cookies are cleared by `getCurrentUser` and every data API returns a consistent 401 `{error:"Unauthorized"}` (or 403 `{error:"Forbidden"}` for insufficient role) via the shared `authErrorResponse` helper. Login answers identically for unknown / wrong-password / disabled / deleted accounts ("Invalid email or password.") so no former existence leaks. Replay tests in `src/lib/session-revocation.test.ts` cover all five revocation triggers; the full auth/az suite is part of `npm test`.

**D8AD-CAN-003 regression suite (`src/lib/auth-regression.test.ts` + `src/lib/auth-regression-helpers.ts`):** data-driven from `PROTECTED_API_ROUTES` (the exhaustive table of every protected API route + method + gate). The reusable helpers (`dispatch(method,path)`/`assertUnauthorized`/`assertForbidden`) exercise the shared authz boundary consistently. The suite (a) creates an admin + viewer, logs each in and retains the cookie; (b) performs password reset, role change, disablement, and deletion; (c) replays the retained cookie against all **28 protected route+method combinations** (4 triggers × 28) → uniform 401 `{error:"Unauthorized"}` with the cookie cleared; (d) asserts a viewer session gets 403 on the **26 admin-gated combinations** while the two session-gated reads remain viewer-accessible; (e) asserts a fresh session works after a legitimate reset; (f) verifies invalid-session handling does not redirect-loop or leak account details. The two session-gated matrix entries are `GET /api/strategy/export` and `GET /api/strategy/distribution-bands`; all other matrix entries require admin. Routes that cannot use the shared throw-based boundary are documented in `auth-regression-helpers.ts`, including login/logout/account bootstrap and server-rendered pages.

**Bypass row is not a login credential:** the `auth-disabled@local` row exists in `users` so FK references (`monthly_entries.updated_by`, `breakdown_entries.updated_by`) resolve to a real `users.id`, and so the dev bypass has a stable identity. `src/features/auth/server.ts` lists the email in a `RESERVED_EMAILS` set and `verifyCredentials()` short-circuits to `null` for any reserved email — the row is unreachable through `/api/auth/login` regardless of the stored hash. The stored hash is also rotated to `bcrypt(crypto.randomBytes(64))` on every `ensureSeedAdmin()` call, so the previous documented plaintext is no longer a valid credential and the hash never appears in source control. `src/lib/auth.test.ts` asserts both the reserved-email rejection and the hash rotation.

To use login, unset `AUTH_DISABLED` or set it to `false`. The `/login` page, `/api/auth/*` routes, seeded accounts, and `requireSession`/`requireAdmin` call sites are preserved; no code reversion is needed.

## Setup

```bash
npm install
npm run db:seed   # destructive/disposable: resets KPI-owned sample data
AUTH_DISABLED=true npm run dev   # loopback-only bypass at http://localhost:3000
```

For an existing schema-9, schema-10, or schema-11 database, especially a production volume, back it up
and run `DATABASE_PATH=/absolute/path/to/kpi.db npm run db:migrate`. Do not run
`db:seed` as a production migration; it intentionally replaces KPI-owned
values, definitions, and audit history while preserving users.

Seeded accounts (first DB access only, via `ensureSeedAdmin` in `src/features/auth/server.ts`; unused while auth is disabled):

On the first run against a fresh database, the seed creates `kerry@easternstate.org` (admin) and `zach@easternstate.org` (viewer). **No plaintext password is ever written to stdout, stderr, or logs** (security finding D8AD-CAN-001). The seed prefers operator-provided secrets — set `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_VIEWER_PASSWORD` in the environment (production: `fly secrets set`; never in `fly.toml` or on the command line) before the first database access and the seed hashes them in, emitting only a non-sensitive status line naming the accounts and their credential source. If an env var is unset, the account gets a cryptographically-random password recorded nowhere (not in stdout, not in any log); the seed prints a non-sensitive warning pointing at `npm run setup:admin`, and the account is locked until the operator provisions a known credential. Every bootstrap account is created with `must_change_password=1`, so the user is forced through `/setup-password` (login redirect + per-page server-component redirect + `requireSession`/`requireAdmin` HTTP 403) before reaching the app. Operator recovery / first-credential provisioning after seeding: `SETUP_ADMIN_PASSWORD=... npm run setup:admin` (optionally `SETUP_ADMIN_EMAIL=...`) — the password is read from the env var only and never from argv/stdout/logs, then the rotation flag is cleared. See `docs/operator-provisioning.md`. The quick-start bypass workflow never logs in, so provisioning stays out of the way.

## Commands

| Command                       | Purpose                                                       |
| ----------------------------- | ------------------------------------------------------------- |
| `npm run dev`                 | Dev server on :3000                                           |
| `npm run dev:stable`          | Dev server with polling; use when macOS file-watcher limits cause `EMFILE` failures. |
| `npm run build`               | Production build                                              |
| `npm start`                   | Serve production build on :3000                               |
| `npm run lint`                | `next lint` — runs the token, design-system, auth-bypass, and architecture guards first via `prelint`|
| `npm run design-system:guard` | Fails if raw `<button>`/`<input>`/primitive classes used outside `src/components/ui/`, or if hex literals / `transition: all` / inline-style hex bypasses are introduced in `src/app/**` or `src/components/**` (excluding `src/components/ui/` and `src/app/globals.css`). |
| `npm run design-system:test`  | Token, design-system, auth-bypass, architecture, and shell-injection guards + `tsc --noEmit` + a production `next build` with `AUTH_DISABLED` cleared — **the CI gate**. Run this before opening a PR; CI is expected to invoke this script verbatim. |
| `npm run db:migrate`          | Apply the idempotent additive schema migration and consume any one-time database-authority content marker without seeding or resetting existing data. Back up SQLite first. |
| `npm run db:seed`             | Destructively reset KPI-owned legacy/strategy tables and reseed disposable 2024–2026 sample data; users are preserved. |
| `npm run setup:admin`         | Operator-only: set a known password on a bootstrap account (`SETUP_ADMIN_PASSWORD=...`), clears `must_change_password`. Never logs the password. |
| `npm run architecture:guard`  | Fails if server-owned source calls the app's own `/api/*` routes, client components import server-only data access, or removed internal read routes reappear in `src/` or smoke scripts. |
| `npm test`                    | Vitest unit and contract tests across app, feature, and infrastructure boundaries |
| `npm run test:e2e`            | Playwright/Chrome acceptance suite for the four destinations, strategic save recovery, removed routes, Setup, and CSV/PNG/PDF output. Builds and starts a loopback production server automatically. |
| `npm run perf:profile`         | Repeatable Chrome performance profile for the four destinations; requires a running server. |
| `npm run test:coverage`       | Vitest with v8 coverage (≥ 90% on the shared reporting-cycle contract) |

## Loading skeletons & favicon

Every public route has a structure-mirroring `loading.tsx` that renders an
immediate skeleton via the design-system `Skeleton` primitives while the page
data is fetched:

- `src/app/dashboard/loading.tsx` — overview/card grid
- `src/app/dashboard/overview/loading.tsx` — header + filter toolbar + card grid
- `src/app/dashboard/category/[slug]/loading.tsx` — breadcrumb + header + toolbar + cards + summary table
- `src/app/dashboard/metric/[slug]/loading.tsx` — breadcrumb + header + toolbar + 3 stat cards + 2 chart cards + values table
- `src/app/data-entry/loading.tsx` — reporting checklist + focused form
- `src/app/reports/loading.tsx` — report selector + active report
- `src/app/setup/loading.tsx` — area selector + list/detail workspace
- `src/app/login/loading.tsx` — two-column split (marketing panel + form panel)

Favicon is served at `/favicon.ico` (a 6-resolution multi-size `.ico` — 16/32/48/64/128/256 — generated from `public/logos/eastern-state-mark.png` via `magick`) and is also registered via `metadata.icons` in `src/app/layout.tsx` (which lists both the `.ico` and the 256×256 PNG so modern browsers can pick the PNG). The in-app `BrandMark` component (`src/components/ui/BrandMark.tsx`) renders the same source-of-truth PNG via `next/image` at sidebar/header/login sizes.

## Verification (smoke harness)

Requires a running server. Invoke `scripts/smoke.sh` directly (no npm wrapper) so the `AUTH_DISABLED` env var reaches the script. The bypass smoke path is development-only; `next start` always runs with `NODE_ENV=production` and cannot serve app routes with `AUTH_DISABLED=true`.

```bash
# Bypass-auth smoke (dev server only).
AUTH_DISABLED=true APP_CANONICAL_ORIGIN=http://127.0.0.1:3290 \
  WATCHPACK_POLLING=true PORT=3290 npm run dev &
AUTH_DISABLED=true PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh

# Stop the dev server before reusing :3290 for production/auth-enabled smoke.
AUTH_DISABLED= npm run build
AUTH_DISABLED=false PORT=3290 node_modules/.bin/next start -p 3290 &
SMOKE_EMAIL=kerry@easternstate.org SMOKE_PASSWORD='<operator-provisioned password>' \
  AUTH_DISABLED=false PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh
```

Tests the four product destinations, all five priorities, the 59-KPI Board
Report, strategic Trends, Setup areas, canonical strategic mutation/export,
immutable Activity, and removed-route 404s. The July 14, 2026 loopback run
passed **51/51** checks and the credentialed production run passed **52/52**.
Current unit evidence is **78 files / 1,185 tests**; the Chrome e2e suite passed
**11/11** workflows through a real provisioned admin login. The authenticated production evidence includes eight
current and eight controlled-baseline Chrome traces in `docs/performance/`.

The shared Reporting Period contract is covered directly by
`src/features/strategy/reporting-cycle.test.ts` with the configured coverage
gate. Run `npm test`; the smoke harness complements, rather than replaces,
these unit and contract tests.

Browser acceptance tests live in `e2e/dashboard-acceptance.spec.ts`. Run
`npm run test:e2e`; Playwright provisions a disposable admin, builds the explicit
Webpack production path, and starts a loopback-only auth-enabled production
server. It uses the installed Google Chrome channel, validates downloaded PNG/PDF file
signatures and dimensions, and runs against a dedicated private temporary
SQLite database. Its DB/WAL/SHM files and temporary application records are
removed during identity-checked teardown, so `data/kpi.db` is never used by
the suite. The optional `E2E_DATABASE_PATH` override must name a nonexistent
`.db` file under the OS temp root using the
`eastern-state-kpi-playwright-` prefix; existing files, directories,
symlinks/hardlinks, and parent-directory escapes are rejected before seeding.

## Architecture

- `src/app/` — App Router pages + API route handlers for auth, catalog/users, and first-class `/api/strategy/*` setup/value/export routes.
- `src/features/` — feature-owned server surfaces and business rules for catalog metadata, strategic configuration/calculation/value entry, reporting, audit history, users, and auth credential/bootstrap/session policy.
- `src/components/ui/` — **shared design-system library**. Import via `@/components/ui`; never hand-roll buttons/inputs/selects/tables outside this folder (`design-system:guard` enforces it).
- `src/components/` — shared feature components for the shell, reports, Setup, and Data Entry.
- `src/lib/` — shared database, session, auth-flag, request-guard, slug, and type infrastructure. Live strategic calculations stay in `src/features/strategy/`.
- `src/features/installation/` — schema-12 Organization/Strategic Plan ownership, typed active-installation reads, optimistic edits, plan-range integrity, and immutable installation audit.
- `src/features/catalog/strategic-plan.ts` — bootstrap/test fixture for the initial 5-priority, 59-KPI sample catalog and 25 backward-compatible per-KPI target rows; never a runtime authority.
- `src/features/catalog/strategic-config.ts` — bootstrap/migration/test fixture for the initial 22 goals, memberships/configurations, and 46 component definitions; runtime code must not import it.
- `src/features/strategy/` — schema-12 records, validation, calculations, raw-value/configuration operations, immutable audit, and report queries.
- `scripts/migrate.ts` — idempotent production-safe schema/configuration migration; `scripts/seed.ts` is the explicit destructive disposable-data reset (users preserved).
- `DESIGN.md` (root) — visual language authority. `docs/design-system.md` translates it into component rules.

Current top-level surfaces are `/dashboard/overview`, `/data-entry`, `/reports`,
and `/setup`. Setup areas are Measures, Goals, People, and Activity.

## Data model quirks

- Annual-only metrics are stored with `month = 0` in `monthly_entries` (single full-year value). See `src/lib/types.ts:60`.
- `unit_type` ∈ `count | percent | currency | attendance | note | breakdown`. Breakdown KPIs write to `breakdown_entries` (label × year), not `monthly_entries`.
- Direction (`higher | lower | neutral`) drives good/bad coloring — read it instead of hardcoding sign.
- Schema bump: edit `src/lib/schema-version.json`. **Schema 8 was the intentional catalog replacement:** versions 7 and older reset KPI tables + `entry_history`, preserve users, and require `npm run db:seed`; back up production before crossing that boundary. **Schema 9 is additive:** v8 legacy KPI goals are preserved and receive a fixed `baseline_year` from their latest available pre-target actual. **Schema 10 is additive from 9:** it creates strategic sidecars and maps the existing 5-priority/22-goal/59-KPI configuration. **Schema 11 is additive from 10:** it scopes component identity to each effective configuration and records explicit ratio aggregation roles while preserving existing IDs and values. **Schema 12 is additive from 11:** it persists Organization/Strategic Plan ownership, attaches every priority through a required `plan_id`, removes plan-specific schema defaults/checks, and marks one explicit content-migration pass. Once the marker is consumed, reruns never recreate deleted strategic content. Use `npm run db:migrate`, not `db:seed`, for an existing database. ADR 0023 and `docs/migration-notes.md` record rollout and rollback.
- Annual pacing and full-plan progress are separate contracts. Annual targets are selected by `reporting_year`; full-plan targets have no reporting year and use their plan target year. Do not substitute one for the other when a target is missing.
- Effective-dated target/configuration integrity is enforced. Defined annual and full-plan targets must retain compatible configuration coverage, and full-plan selection uses nearest future then latest past. Once values or targets use calculation semantics, create a successor instead of editing them in place. For component lifecycle changes, archive affected parent/component targets first; restore the configuration and components before restoring targets.
- First-class strategic observations are the sole live reporting source. Retained legacy rows are visible only as archive/history evidence and are never used as a fallback calculation input.
- First-class raw values use `kpi_observations`, `kpi_component_entries`, and `distribution_observations`/`distribution_values` through `/api/strategy/{observations,component-entries,distributions}`. A multi-input Data Entry submission uses one atomic batch payload through `POST /api/strategy/observations`; it does not create a fourth value boundary. First-class configuration uses `/api/strategy/{configurations,components,targets,goals,distribution-bands}`. Do not tunnel these writes through legacy scalar entry routes.
- Distribution-band labels are snapshotted on recorded values. A referenced band's calculation-semantic classification (`derived_group`, unknown, declined) is immutable; end its effective range and create a successor band so historical demographic percentages do not change.
- Goal targets use a persisted baseline year, not an inferred moving prior year. Overview/Setup loaders pass an explicit progress year, and the goal form exposes the baseline. `baseline_year < target_year` is enforced in validation and SQLite.
- Metric storage integrity is enforced by `src/features/metrics/{entries,breakdowns}.ts`: scalar entries cannot target breakdown KPIs, breakdown rows cannot target scalar KPIs, annual/flexible KPIs accept only `month = 0`, monthly KPIs accept only `1–12`, and blank breakdown labels are rejected. The APIs return 400 for storage-type or period mismatches and 404 for unknown KPIs.
- Historical `upsertEntry` / `deleteEntry` / `upsertBreakdown` / `deleteBreakdown` calls wrote rows to `entry_history` with before/after values and immutable measure/category/actor snapshots. The retained archive is browsable in Setup → Activity through `src/features/audit/server.ts`; the legacy mutation routes are gone.
- **Audit-history immutability (D8AD-CAN-005).** `listEntryHistory` LEFT-joins the live `kpis`/`categories`/`users` tables; the historical label comes from the immutable snapshot columns, never the current (possibly renamed) label, and a missing live row never drops an event. The response surfaces `kpi_current_*`/`category_current_*` (null when deleted), `metadata_deleted` (live KPI/category gone), and `metadata_renamed` (live label differs from snapshot). Filtering by `category_id` uses the SNAPSHOT `h.category_id`, so a row stays visible for its original category even after the category/KPI is deleted. Renaming KPI/category metadata therefore does NOT retroactively rewrite historical labels — this is the documented, intended behavior.
- **Deletion guards (D8AD-CAN-005).** `deleteKPI` / `deleteCategory` throw `DependentEntriesError` (routes return **409**) when live `monthly_entries`/`breakdown_entries` still reference them (including child KPIs for a parent). The admin must delete the dependent entries first — each entry deletion records a tombstone audit row — so no metadata deletion can hide a previously recorded change. A permitted hard delete of a non-strategic KPI/category records its immutable lifecycle snapshot in `strategic_audit_events` in the same transaction; the audit and delete roll back together on failure. The seed script bypasses the guard with raw `DELETE`s after already clearing entries.
- **Catalog audit.** Catalog create/update/delete operations write immutable `strategic_audit_events` snapshots in the same transaction as the mutation. Category deletion snapshots every child KPI before the parent; any audit insertion failure rolls back the entire cascade. API adapters pass the authenticated actor, while seed/system operations are explicitly attributed to `System`.

## Auth & env

- Session uses `iron-session` encrypted cookies. `SESSION_SECRET` must be ≥ 32 chars (validated at runtime in `src/lib/session.ts`).
- For auth-enabled HTTP development, set `SESSION_SECURE=false` in your untracked local environment. Production must omit it (default `true`).
- `DATABASE_PATH` defaults to `./data/kpi.db`; `data/` is gitignored.
- `src/app/page.tsx` runs `ensureSeedAdmin()` at module load — keep that import even if it looks unused.
- **Bootstrap provisioning (D8AD-CAN-001).** `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_VIEWER_PASSWORD` are operator secrets consumed by `ensureSeedAdmin()`; on Fly they MUST be set via `fly secrets set` and MUST NOT appear in `fly.toml` `[env]` (that section is non-secret, version-controlled, and visible in CI/deploy logs). When unset, the account gets a random unlogged password and is locked until `npm run setup:admin`. Bootstrap accounts are created with `must_change_password=1` and enforced through `/setup-password` + `requireSession`/`requireAdmin` 403. `setup-admin.ts` reads `SETUP_ADMIN_PASSWORD` from the env only (never argv) and emits only non-sensitive status. Regression tests live in `src/lib/auth-secrecy.test.ts` (capture stdout/stderr + child-process proof that sentinels never leak).
- **Login throttle.** `src/app/api/auth/login/route.ts` throttles failed attempts per source IP and per account via `src/lib/login-throttle.ts`. Defaults: 10 failures inside 5 minutes → 5-minute lockout (HTTP 429 with `Retry-After`). Tunable via `LOGIN_LOCKOUT_THRESHOLD`, `LOGIN_LOCKOUT_WINDOW_MS`, `LOGIN_LOCKOUT_DURATION_MS`. State is in-process; if you scale horizontally, move the counters to a shared store. **Set `TRUST_PROXY=true` when running behind a reverse proxy** so the throttle can read the real client IP from Fly's `fly-client-ip` header, then `x-forwarded-for` / `x-real-ip`. Without it, the route collapses every request to a single `unknown` IP key (a defensive default against header spoofing), which is correct for internet-facing deployments without a proxy but too aggressive when the app is behind one.
- **CSRF hardening (D8AD-CAN-004).** Every state-changing handler on `/api/users`, `/api/users/account`, `/api/auth/change-password`, `/api/kpis`, `/api/categories`, and the mutating `/api/strategy/{observations,component-entries,distributions,distribution-bands,configurations,components,targets,goals,memberships}` methods runs the shared `assertMutationRequest(req)` guard (`src/lib/request-guard.ts`) after authz. It enforces same-origin requests, exact JSON content type, and a double-submit CSRF token. The UI uses `apiFetch`; clients see only generic 403/415 failures. Full assumptions: `docs/csrf-hardening.md`.

## Conventions specific to this repo

- `prelint` runs the design-token, design-system, auth-bypass, and architecture-boundary guards before `next lint` — fixes for UI guard violations should land in `src/components/ui/` or the Tailwind theme tokens (`tailwind.config.ts` + `src/app/globals.css`), not in pages or feature components.
- **`npm run design-system:test` is the CI gate.** It runs design/security/architecture guards + `tsc --noEmit` + `next build` in sequence. CI must invoke this script verbatim; PRs that skip it will be rejected. The QA manual at `docs/qa-manual.md` is the human-readable companion to the smoke harness for visual verification.
- API handlers follow the pattern `try { await requireSession()/requireAdmin() } catch { return 401/403 }`. All protected mutations require admin. `GET /api/strategy/export` and `GET /api/strategy/distribution-bands` require any valid session; the exhaustive matrix is 28 protected route/method combinations, 26 admin-gated.
- Use `zod` for request body validation on API routes.
- Server dashboard pages call the explicit reporting operations in `src/features/reporting/server.ts`; client components must not import `getDb()` or server-only feature modules.
- New measures and priorities are added at runtime in Setup → Measures; plan identity/range and goals are edited in Setup → Goals. The database is authoritative after initialization. Change the fixture modules only when intentionally changing fresh-install/development seed content, update their invariant tests, and rerun `npm run db:seed` only against a disposable database.

## Gotchas

- `node:sqlite` is a built-in Node module, so Next.js does not need bundler externalization. `next.config.mjs` still contains the production auth-bypass build guard.
- `tsconfig.tsbuildinfo` is gitignored; expect `tsc --noEmit` to be slow on first run after a clean.
- The current strategic-plan sample set is annual-only for 2024–2026; all seeded entries use `month = 0`.
- `iron-session` requires `cookies()` to be awaited — all `getSession()` calls are `async`.
- Tailwind theme tokens (`ink`, `brand`, `accent`) live in `tailwind.config.ts`; do not hardcode hex values in components.

## Agent skills

### Issue tracker

Work is tracked in GitHub Issues for `Elemperor1/Eastern-State-KPI-Dashboard`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository using root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
