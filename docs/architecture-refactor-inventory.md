# Architecture Refactor Inventory

Status: active
Last updated: 2026-07-07

This inventory tracks the preservation-first modular refactor described in the Codex objective file at `/Users/jacobcyber/.codex/attachments/9dbe2c83-383b-4496-850d-9c46fd20ce8a/goal-objective.md`.

The refactor is not a rewrite, redesign, framework migration, or product expansion. Each slice should preserve approved behavior and strengthen tests before moving ownership boundaries.

## Baseline

- `npm test` passed before the first extraction: 16 files, 579 tests.
- First protected slice: goal target/progress/YTD/full-year calculations now have a feature-owned pure module with direct unit tests.
- Second protected slice: goal SQL queries and mutations moved into `src/features/goals/queries.ts` and `src/features/goals/mutations.ts`.
- Third protected slice: goal API validation and query-param normalization moved into `src/features/goals/validation.ts`, and production call sites import from the public `src/features/goals/index.ts` surface.
- Fourth protected slice: removed the repository compatibility re-exports for goals. DB-backed goal behavior tests now live in `src/features/goals/integration.test.ts` and import goal operations from the public goals feature surface.
- Fifth protected slice: annual/monthly period rules moved into `src/features/metrics/period-rules.ts`, and goals, analytics, exports, admin data entry, chart routing, and history labels now use the shared predicates/constants instead of raw `month === 0` / `month > 0` / `reporting_frequency !== "monthly"` checks.
- Sixth protected slice: goal mutations still use the approved auth/CSRF-protected API route, but successful writes now return a refreshed feature-owned goals payload so the admin goals client no longer performs a second internal GET after every mutation.
- Seventh protected slice: monthly entry and breakdown reads/writes, available-year lookup, row mapping, and audit-history write snapshots moved into `src/features/metrics`, preserving the existing transaction and durable-history behavior.
- Eighth protected slice: category and KPI metadata reads/writes plus dependent-entry deletion guards moved into `src/features/catalog/server.ts`, preserving the existing route-level auth/CSRF/validation and 409 conflict behavior.
- Ninth protected slice: audit-history browsing/read models moved into `src/features/audit/server.ts`, preserving snapshot-field filtering, LEFT JOIN display semantics, deleted metadata filter options, and admin-only route behavior. The obsolete `src/lib/repository.ts` module was removed.
- Tenth protected slice: dashboard CSV export row construction moved into `src/features/reporting/csv.ts`, so overview, category, metric detail, and trend exports use shared annual/monthly/breakdown row builders with direct tests.
- Eleventh protected slice: dashboard data loading, available reporting years, and URL reporting-period selection moved into `src/features/reporting/server.ts`, `period.ts`, and `types.ts`, so dashboard pages use one feature-owned loader and one tested period resolver.
- Twelfth protected slice: overview category-card YoY rollup logic moved into `src/features/reporting/category-summary.ts`, so improving/declining/flat counts, top mover selection, annual breakdown totals, and monthly donor conversion are feature-owned and directly tested.
- Thirteenth protected slice: category detail page model construction moved into `src/features/reporting/category-page.ts`, so metric-card analytics, selected-year goal attachment, and monthly-vs-annual breakdown section data are feature-owned and directly tested.
- Fourteenth protected slice: metric detail page model construction moved into `src/features/reporting/metric-detail.ts`, so KPI/category lookup, analytics, trend series, YTD bar data, selected-year goal lookup, value table rows, and breakdown chart routing are feature-owned and directly tested.
- Fifteenth protected slice: Trend Explorer model construction moved into `src/features/reporting/trend-explorer.ts`, so default KPI/year selection, visible monthly KPI filtering, raw monthly series, log/indexed transforms, series metadata, export labels, and empty states are feature-owned and directly tested.
- Sixteenth protected slice: catalog mutation API adapters now return refreshed `kpis` and `categories` from feature-owned reads, so `KPIManagerClient` no longer performs follow-up `/api/kpis` and `/api/categories` GETs after create/delete operations; the remaining API boundary inventory is documented in `docs/api-boundary-inventory.md`.
- Seventeenth protected slice: user-management mutation API adapters now return refreshed `users`, so `UserManagerClient` no longer performs follow-up `/api/users` GETs after create/password-reset/delete/role/disable operations while preserving session-revocation and self-target guard coverage.
- Eighteenth protected slice: DB-backed user account reads/writes moved into `src/features/users/server.ts`, so admin user routes, setup-password, operator setup, session revalidation, and auth regression setup use one account-management surface while credential verification and bootstrap/bypass policy remain in `src/features/auth/server.ts`.
- Nineteenth protected slice: restored the lint verification gate by adding a non-interactive Next ESLint configuration and fixing the newly surfaced warnings/errors, so `npm run lint` now runs design/security guards plus ESLint cleanly.
- Twentieth protected slice: credential verification and bootstrap/bypass auth policy moved into `src/features/auth/server.ts`, the obsolete `src/lib/auth.ts` module was removed, and login, seed, setup, session, and auth tests now import the feature-owned auth surface directly.
- Twenty-first protected slice: app routes, server pages, and auth regression tests now import session gates through `src/features/auth/session.ts`, while `src/lib/session.ts` remains the low-level Next.js cookies/iron-session implementation.
- Twenty-second protected slice: removed the unused `GET /api/users` read adapter; `/admin/users` reads directly from `src/features/users/server.ts`, and user mutations continue returning refreshed `users` payloads.
- Twenty-third protected slice: removed the unused `GET /api/meta` read adapter; server-rendered pages already read sample-data and available years through feature/server loaders.
- Twenty-fourth protected slice: removed the unused `GET /api/entries/years` and `GET /api/goals` read adapters; dashboard year options and admin goals initial state already come from server-rendered feature loaders, while goal mutations still return refreshed goals.
- Twenty-fifth protected slice: removed the unused `GET /api/entries` and `GET /api/breakdowns` read adapters; smoke now uses POST response bodies for created row IDs, and server-rendered pages continue using metrics feature queries directly.

## Current Ownership Map

| Area | Current files | Notes |
| --- | --- | --- |
| Goals | `src/app/admin/goals/*`, `src/app/api/goals/route.ts`, `src/features/goals/*` | Goal calculations, queries, mutations, validation, and DB-backed behavior tests are now feature-owned. Production call sites and tests use the public goals index; the route is now an auth/CSRF adapter that returns refreshed feature-owned data after writes. |
| Catalog metadata | `src/features/catalog/server.ts`, `src/app/admin/kpis/*`, `src/app/api/categories/route.ts`, `src/app/api/kpis/route.ts` | Category and KPI ordering, lookup, create/update/delete operations, and dependent-entry conflict checks are feature-owned. Delete operations still refuse live monthly/breakdown dependents so entry audit tombstones are recorded before metadata removal. Catalog mutation routes return refreshed catalog lists for the browser admin client. |
| Metrics and entries | `src/features/metrics/*`, `src/app/admin/data/*`, `src/app/api/entries/route.ts`, `src/app/api/breakdowns/route.ts`, `src/lib/analytics.ts` | Period rules, monthly/breakdown entry data access, available-year lookup, row mapping, and entry audit writes are feature-owned. Data-entry UI and dashboard pages still shape some metric view data client-side. Entry/breakdown routes are now mutation-only adapters. |
| Metric period rules | `src/features/metrics/period-rules.ts`, `src/features/metrics/index.ts` | Client-safe shared source for annual month `0`, monthly months `1-12`, and annual/monthly reporting-frequency classification. |
| Dashboard reporting | `src/features/reporting/server.ts`, `src/features/reporting/period.ts`, `src/features/reporting/types.ts`, `src/features/reporting/category-summary.ts`, `src/features/reporting/category-page.ts`, `src/features/reporting/metric-detail.ts`, `src/features/reporting/trend-explorer.ts`, `src/features/reporting/csv.ts`, `src/app/dashboard/**`, `src/components/MetricCard.tsx`, `src/components/CategoryOverviewCard.tsx` | Server pages use the reporting feature for broad dashboard datasets, available years, and URL period state. Overview category summary rollups, category detail, metric detail, Trend Explorer models, and CSV export rows are feature-owned and tested. Client components still own browser controls and chart rendering. |
| Exports | `src/features/reporting/csv.ts`, `src/components/ui/ExportCSVButton.tsx`, `src/components/ui/ExportPNGButton.tsx`, `src/components/ExportPDFButton.tsx`, `src/lib/export-helpers.ts`, `src/lib/legacy-pdf-export.ts` | CSV export data shaping is feature-owned. PNG/PDF remain DOM export adapters and must continue to use the rendered dashboard values. |
| Audit history | `src/features/audit/server.ts`, `src/app/admin/history/*`, `src/app/api/entries/history/route.ts` | Audit browsing/read models are feature-owned. Existing tests cover immutable history after source metadata changes, including snapshot fields, LEFT JOIN behavior, and deleted metadata filter options. |
| Users and account management | `src/features/users/server.ts`, `src/app/admin/users/*`, `src/app/api/users/route.ts`, `src/app/api/users/account/route.ts`, `scripts/setup-admin.ts`, auth regression tests | DB-backed account-row reads/writes are feature-owned: lookup, listing, creation, deletion, password updates, role changes, disable/enable, and revocation-watermark bumps. User mutation adapters return refreshed users to the browser client. |
| Auth and authorization | `src/features/auth/server.ts`, `src/features/auth/session.ts`, `src/lib/session.ts`, `src/lib/auth-flag.ts`, `src/lib/request-guard.ts`, `src/app/api/auth/**`, protected API routes, auth regression tests | Protected route coverage is data-driven. Credential verification, bootstrap/bypass policy, and the app-facing session/authorization gate are feature-owned. `src/lib/session.ts` owns the underlying Next.js cookies/iron-session plumbing, and `src/lib/auth-flag.ts` / `src/lib/request-guard.ts` remain centralized infrastructure guardrails. New mutation boundaries must use the shared auth and CSRF path. |
| Shared UI | `src/components/ui/*`, `scripts/design-system-guard.sh`, `scripts/design-tokens-guard.sh` | Keep new controls inside the design-system library or existing primitives. |
| Verification tooling | `eslint.config.mjs`, `package.json`, `scripts/design-*.sh`, `scripts/auth-bypass-guard.sh`, `scripts/d8ad-can-008-ci-gate.sh` | Linting, design-token/design-system guards, auth-bypass guard, shell-injection regression gate, typecheck, build, unit tests, and smoke checks are part of the preservation proof bundle. |

## Observed Coupling

- `src/lib/repository.ts` has been removed. Goal, metrics, catalog, and audit-history data access now live in feature-owned modules.
- Dashboard pages still pass large datasets into client components, though their data loading, reporting-period selection, overview category rollups, category, metric detail, Trend Explorer view models, and CSV export rows now come from the reporting feature.
- Admin client components still call internal API routes through `apiFetch` for guarded mutations. The goals, catalog, and user-management clients no longer perform follow-up internal GETs after writes; they consume mutation response payloads instead.
- User account data access, credential/bootstrap policy, and app-facing session gates are now feature-owned. Session cookie handling still lives in `src/lib/session.ts` because it is the Next.js cookie/session infrastructure boundary.
- `docs/api-boundary-inventory.md` identifies current production browser route consumers separately from read routes retained only for smoke/QA or auth-regression coverage, and records removed internal read adapters such as `GET /api/users`.
- Annual KPI handling is mostly correct in tests. Basic annual/monthly classification and month-range predicates have one shared module, and metric entry/breakdown query and mutation boundaries now live in the metrics feature.
- Goal behavior is covered by feature-owned integration tests and pure calculation tests.

## First Slice Completed

Goal ownership was extracted without changing user-visible behavior:

- Added `src/features/goals/calculations.ts`.
- Added `src/features/goals/calculations.test.ts`.
- Added `src/features/goals/queries.ts`, `src/features/goals/mutations.ts`, and `src/features/goals/records.ts`.
- Added `src/features/goals/validation.ts`, `src/features/goals/validation.test.ts`, and `src/features/goals/index.ts`.
- Updated `src/app/admin/goals/page.tsx`, the dashboard data loader, and `src/app/api/goals/route.ts` to use the feature-owned public surface.
- Removed the goal-specific implementation and goal compatibility re-exports from `src/lib/repository.ts`.
- Moved DB-backed goal behavior coverage into `src/features/goals/integration.test.ts`.
- Kept compatibility aliases on `KpiGoalWithMeta` intact.

Metric period-rule ownership was extracted without changing user-visible behavior:

- Added `src/features/metrics/period-rules.ts`, `src/features/metrics/period-rules.test.ts`, and `src/features/metrics/index.ts`.
- Updated goal calculations/queries, analytics, admin data entry, category/overview CSV prep, metric detail chart routing, trend explorer filtering, donor conversion rows, metric cards, goal manager display, and history labels to use the shared period-rule surface.
- Verified that raw annual/monthly condition searches no longer find app/component/lib/feature TypeScript call sites, outside intentional SQL/schema text.

Admin goals refresh behavior was narrowed without weakening auth/CSRF:

- Updated `src/app/api/goals/route.ts` so successful POST/PATCH/DELETE responses include `goals: listGoals({ throughMonth, year })` for the request's query params.
- Updated `src/app/admin/goals/GoalsManagerClient.tsx` to consume that mutation response directly instead of calling `GET /api/goals` after each write.
- Added `src/app/api/goals/route.test.ts` to pin POST/PATCH/DELETE refreshed-payload behavior with mocked auth and real request-guard headers.
- Kept `apiFetch` and the shared `assertMutationRequest` guard on all state-changing calls.

Metric entry and breakdown data access was moved without changing audit behavior:

- Added `src/features/metrics/entries.ts`, `breakdowns.ts`, `records.ts`, `history.ts`, and `years.ts`.
- Added `src/features/metrics/server.ts` as the server-only public surface for DB-backed metric entry operations; `src/features/metrics/index.ts` remains client-safe for period rules.
- Removed `listEntries`, `upsertEntry`, `deleteEntry`, `listBreakdowns`, `upsertBreakdown`, `deleteBreakdown`, and `listAvailableYears` from `src/lib/repository.ts`.
- Updated API routes, dashboard/admin pages, seed data, and DB-backed tests to import the public metrics feature surface.
- Preserved the existing upsert/readback/history transaction pattern and immutable snapshot write in the feature module.
- Re-ran focused entry/breakdown/audit route and DB tests after the move.

Catalog metadata data access was moved without changing deletion behavior:

- Added `src/features/catalog/server.ts` for category and KPI metadata reads/writes.
- Removed category/KPI metadata operations and dependent-entry deletion guards from `src/lib/repository.ts`.
- Updated metadata API routes, admin/dashboard pages, seed data, and DB-backed tests to import the catalog feature surface.
- Preserved the existing `DependentEntriesError` 409 path when a category or KPI still has live monthly/breakdown dependents.

Audit-history browsing was moved without changing durable-history behavior:

- Added `src/features/audit/server.ts` for history list queries and deleted metadata filter options.
- Moved D8AD-CAN-005 DB integration coverage into `src/features/audit/integration.test.ts`.
- Updated the admin history page and `/api/entries/history` route to import the audit feature surface.
- Preserved snapshot-column filtering, LEFT JOIN current-metadata fields, deleted/renamed flags, and the admin-only route boundary.
- Removed the obsolete `src/lib/repository.ts` module.

CSV export row construction was moved without changing export content:

- Added `src/features/reporting/csv.ts` with pure row builders for overview, category, metric detail, and trend exports.
- Added `src/features/reporting/csv.test.ts` covering monthly KPIs, annual month `0`, breakdown rows, metric table rows, and trend series columns.
- Updated dashboard clients to pass feature-built rows/columns/filenames into `ExportCSVButton`.
- Kept CSV serialization and formula-injection protection in the shared UI helper.

Dashboard data and reporting-period ownership was moved without changing routing behavior:

- Added `src/features/reporting/server.ts` for `loadDashboardData` and `listDashboardYears`.
- Added `src/features/reporting/period.ts` and `period.test.ts` for URL `currentYear`, `compareYear`, and `currentMonth` resolution.
- Added `src/features/reporting/types.ts` for shared reporting/dashboard data contracts.
- Updated overview, category, and metric server pages to use the reporting feature surface instead of local period parsing or a generic lib loader.
- Removed the obsolete generic dashboard loader.

Overview category summary rollups were moved without changing card output:

- Added `src/features/reporting/category-summary.ts` with pure builders for category metric movement and category overview summaries.
- Added `src/features/reporting/category-summary.test.ts` covering monthly KPI YTD movement, lower-is-better direction, flat movement, annual breakdown totals, monthly donor conversion, and zero-referred conversion.
- Updated `src/components/CategoryOverviewCard.tsx` to render a prepared `CategoryOverviewSummary` instead of calculating YoY movement itself.
- Updated `src/app/dashboard/overview/DashboardOverviewClient.tsx` to call the reporting feature summary builder for the active comparison period.

Category detail page model construction was moved without changing page output:

- Added `src/features/reporting/category-page.ts` to build metric card analytics, attach goals for the selected current year, and split breakdown KPIs into monthly donor-conversion sections or annual composition chart sections.
- Added `src/features/reporting/category-page.test.ts` covering metric analytics, selected-year goal attachment, monthly breakdown rows, annual month-0 current/compare rows, and unknown category slugs.
- Updated `src/app/dashboard/category/[slug]/CategoryPageClient.tsx` to render the feature-built model instead of calculating analytics and breakdown section membership inline.

Metric detail page model construction was moved without changing page output:

- Added `src/features/reporting/metric-detail.ts` to build KPI/category lookup results, KPI analytics, trend series, YTD bar data, selected-year goals, value table rows, direction labels, and breakdown display models.
- Added `src/features/reporting/metric-detail.test.ts` covering monthly and annual KPI models, selected-year goals, trend/table/YTD data, monthly donor-conversion routing, annual month-0 current/compare breakdown routing, and unknown KPI slugs.
- Moved the `MetricValueRow` contract into `src/features/reporting/types.ts` so metric detail models and CSV exports share one table-row shape.
- Updated `src/app/dashboard/metric/[slug]/MetricDetailClient.tsx` to render the feature-built model instead of calculating analytics, trend data, goal lookup, table rows, and breakdown routing inline.

Trend Explorer model construction was moved without changing chart output:

- Added `src/features/reporting/trend-explorer.ts` to build default KPI/year selections, category-visible KPI lists, raw monthly trend rows, indexed/log axis transforms, selected-series metadata, export filenames, filter labels, and empty states.
- Added `src/features/reporting/trend-explorer.test.ts` covering default selection, monthly-only KPI filtering, month `0` exclusion, duplicate monthly value summing, indexed baseline behavior, log-mode non-positive value handling, series labels, export names, and empty states.
- Updated `src/app/dashboard/trends/TrendExplorerClient.tsx` to consume the feature-built model while retaining browser selection state, Recharts rendering, and export controls.

Catalog API refresh behavior was narrowed without weakening auth/CSRF:

- Updated `src/app/api/kpis/route.ts` and `src/app/api/categories/route.ts` so successful POST/PATCH/DELETE responses include refreshed `kpis` and `categories` from the catalog feature.
- Updated `src/app/admin/kpis/KPIManagerClient.tsx` to consume that mutation response directly instead of calling `GET /api/kpis` and `GET /api/categories` after each write.
- Added `src/app/api/kpis/route.test.ts` and `src/app/api/categories/route.test.ts` to pin refreshed-payload behavior with mocked auth and real request-guard headers.
- Added `docs/api-boundary-inventory.md` to record active browser consumers, smoke/QA-only read routes, and removal conditions for remaining API adapters.

User-management API refresh behavior was narrowed without weakening auth, CSRF, or session revocation:

- Updated `src/app/api/users/route.ts` and `src/app/api/users/account/route.ts` so successful user creation, temporary password reset, deletion, role change, and disable/enable responses include refreshed `users`.
- Updated `src/app/admin/users/UserManagerClient.tsx` to consume mutation responses directly instead of calling `GET /api/users` after each write.
- Added `src/app/api/users/route.test.ts` and `src/app/api/users/account/route.test.ts` to pin refreshed-payload behavior with mocked auth and real request-guard headers, including self-target and missing-target account guards.
- Updated `docs/api-boundary-inventory.md` and ADR 0003 to record that `GET /api/users` has no production browser read path and is safe to remove once the auth regression matrix is adjusted.

User account data access was moved without changing auth or session behavior:

- Added `src/features/users/server.ts` for account lookup, credential-record lookup, listing, creation, deletion, password updates, role updates, disable/enable, and revocation-watermark bumps.
- Updated admin user pages/routes, setup-password, operator setup, session revalidation, and auth/account tests to use the user feature surface for account-row operations.
- Kept `src/features/auth/server.ts` responsible for reserved-email rejection, `verifyCredentials`, bootstrap password sourcing, bypass hash rotation, and `ensureSeedAdmin`.
- Added ADR 0013 to document the user account data ownership split and its preservation guardrails.

Auth credential and bootstrap policy was moved without changing login or session behavior:

- Added `src/features/auth/server.ts` for reserved-email rejection, `verifyCredentials`, bootstrap password sourcing, bypass hash rotation, and `ensureSeedAdmin`.
- Updated login, setup, seed, page, session, and auth tests to import the auth feature surface.
- Removed the obsolete `src/lib/auth.ts` compatibility module so credential policy has one import path.
- Kept `AUTH_DISABLED` configuration guardrails in `src/lib/auth-flag.ts`, session cookie helpers in `src/lib/session.ts`, and CSRF enforcement in `src/lib/request-guard.ts`.
- Added ADR 0014 to document the auth credential-policy ownership boundary.

The app-facing auth/session surface was moved without changing cookie behavior:

- Added `src/features/auth/session.ts` as the public import path for `getSession`, `getCurrentUser`, `getCurrentUserReadOnly`, `requireSession`, `requireAdmin`, `AuthError`, and `authErrorResponse`.
- Updated app routes, server pages, and auth regression tests to import the feature-owned auth session surface instead of `src/lib/session.ts`.
- Kept the implementation in `src/lib/session.ts`, where the Next.js `cookies()` and iron-session mechanics remain isolated.
- Added ADR 0015 to document why this is a feature public surface, not a second session implementation.

The unused user-management read adapter was removed without changing the admin users workflow:

- Removed `GET /api/users` from `src/app/api/users/route.ts`.
- Kept POST/PATCH/DELETE user mutation adapters, their refreshed `users` response payloads, and the shared auth/CSRF guards.
- Updated the auth regression route table to cover the then-remaining 25 protected route+method combos while preserving user-management mutation and revocation coverage.
- Updated `docs/api-boundary-inventory.md` and ADR 0003 to record the route removal.

The unused metadata read adapter was removed without changing dashboard metadata behavior:

- Removed `src/app/api/meta/route.ts`.
- Kept server-rendered pages on feature/server loaders for sample-data flags and available-year options.
- Updated the auth regression route table to cover the then-remaining 24 protected route+method combos.
- Updated `docs/api-boundary-inventory.md` and CSRF docs to record the route removal.

Unused entries-years and goals read adapters were removed without changing dashboard or goal-management behavior:

- Removed `src/app/api/entries/years/route.ts`.
- Removed `GET /api/goals` while keeping POST/PATCH/DELETE goal mutation adapters.
- Kept dashboard year options on reporting/metrics feature loaders and admin goals initial state on the server-rendered page.
- Updated the auth regression route table to cover the then-remaining 22 protected route+method combos.
- Updated `docs/api-boundary-inventory.md` and CSRF docs to record the route removals.

Unused entry and breakdown read adapters were removed without changing data-entry behavior:

- Removed `GET /api/entries` and `GET /api/breakdowns` while keeping POST/DELETE mutation adapters.
- Removed the now-unused year-filter route helper and route-only hardening tests tied to those GET adapters.
- Updated `scripts/smoke.sh` to verify created monthly, annual, breakdown, and bypass rows from POST response bodies instead of follow-up read APIs.
- Updated the D8AD-CAN-008 fake server to return the same POST payload shape so the shell-injection gate still exercises mutation response bodies.
- Updated the auth regression route table to cover the remaining 20 protected route+method combos.
- Updated `docs/api-boundary-inventory.md`, CSRF docs, and ADR 0003 to record the route removals.

Verification tooling was restored so the full documented command set is runnable:

- Added `eslint.config.mjs` using Next's `core-web-vitals` and TypeScript rules.
- Added the required ESLint dependencies to `package.json` / `package-lock.json`.
- Fixed the lint warnings/errors surfaced by the first real pass, including stale unused params/imports and dashboard state-sync hook dependencies.
- Confirmed `npm run lint` runs non-interactively after the existing design/security prelint guards.

## Next Safe Slices

1. Decide whether smoke/QA-only read API routes should stay as supported diagnostic adapters or be replaced by feature-level/runtime checks.
2. Continue narrowing dashboard client props where a server-prepared view model can reduce serialized data without changing browser behavior.
3. Evaluate whether `src/lib/session.ts` should keep owning the cookie implementation long-term; any move must preserve AUTH_DISABLED production guardrails, CSRF bootstrap, bootstrap secrecy, and the full auth regression matrix.

## Guardrails

- Do not remove API routes until route usage is inventoried and current consumers are migrated.
- Do not move auth or CSRF checks into client code.
- Do not change KPI definitions or seeded metric ordering without explicit approval.
- Do not collapse YTD pacing and full-year completion into one value.
- Do not treat `0` as missing data.
- Do not use INNER JOINs for durable audit history display where source metadata may be deleted.
