# Architecture Refactor Inventory

Status: historical; superseded for live product ownership by ADR 0022
Last updated: 2026-07-14

This file records the preservation-first refactor sequence. Its old-route
ownership tables are historical evidence, not a current navigation or module
map. See `docs/issue-42-replacement-inventory.md` for the subtraction that
replaced those production workflows.

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
- Seventeenth protected slice: removed the obsolete `GET /api/kpis` and `GET /api/categories` read adapters. Smoke now proves finalized catalog visibility through the server-rendered `/admin/kpis` page and uses `scripts/smoke-catalog.ts` only to obtain local KPI IDs for mutation round-trips.
- Eighteenth protected slice: removed the obsolete `GET /api/entries/history` read adapter. `/admin/history` reads the audit feature directly, smoke verifies audit rows through the page, and tests cover page-level admin redirects plus durable audit read-model behavior.
- Seventeenth protected slice: user-management mutation API adapters now return refreshed `users`, so `UserManagerClient` no longer performs follow-up `/api/users` GETs after create/password-reset/delete/role/disable operations while preserving session-revocation and self-target guard coverage.
- Eighteenth protected slice: DB-backed user account reads/writes moved into `src/features/users/server.ts`, so admin user routes, setup-password, operator setup, session revalidation, and auth regression setup use one account-management surface while credential verification and bootstrap/bypass policy remain in `src/features/auth/server.ts`.
- Nineteenth protected slice: restored the lint verification gate by adding a non-interactive Next ESLint configuration and fixing the newly surfaced warnings/errors, so `npm run lint` now runs design/security guards plus ESLint cleanly.
- Twentieth protected slice: credential verification and bootstrap/bypass auth policy moved into `src/features/auth/server.ts`, the obsolete `src/lib/auth.ts` module was removed, and login, seed, setup, session, and auth tests now import the feature-owned auth surface directly.
- Twenty-first protected slice: app routes, server pages, and auth regression tests now import session gates through `src/features/auth/session.ts`, while `src/lib/session.ts` remains the low-level Next.js cookies/iron-session implementation.
- Twenty-second protected slice: removed the unused `GET /api/users` read adapter; `/admin/users` reads directly from `src/features/users/server.ts`, and user mutations continue returning refreshed `users` payloads.
- Twenty-third protected slice: removed the unused `GET /api/meta` read adapter; server-rendered pages already read sample-data and available years through feature/server loaders.
- Twenty-fourth protected slice: removed the unused `GET /api/entries/years` and `GET /api/goals` read adapters; dashboard year options and admin goals initial state already come from server-rendered feature loaders, while goal mutations still return refreshed goals.
- Twenty-fifth protected slice: removed the unused `GET /api/entries` and `GET /api/breakdowns` read adapters; smoke now uses POST response bodies for created row IDs, and server-rendered pages continue using metrics feature queries directly.
- Twenty-sixth protected slice: added `scripts/architecture-boundary-guard.sh` and wired it into the CI gate so server-owned source cannot call the app's own `/api/*` boundary, client components cannot import server-only data access, and removed internal read routes cannot reappear in `src/` or smoke scripts.
- Twenty-seventh protected slice: Trend Explorer page data assembly moved into `loadTrendExplorerPageData()` so the page reads catalog/entry data once through the reporting feature, derives available years in a tested helper, and passes a feature-prepared initial selection to the interactive client.
- Twenty-eighth protected slice: donor referral-to-donor conversion rows, totals, chart data, and percentage-point movement moved into `src/features/reporting/donor-conversion.ts`, so overview rollups and `DonorConversionCard` share one tested reporting rule.
- Twenty-ninth protected slice: annual breakdown comparison rows, totals, chart rows, and percent-change movement moved into `src/features/reporting/breakdown-comparison.ts`, so `BreakdownChart` renders a feature-built model instead of calculating chart/table data inline.
- Thirtieth protected slice: Trend Explorer selector and chart presentation moved into `src/components/TrendExplorerSidebar.tsx` and `src/components/TrendExplorerChartPanel.tsx`, so `TrendExplorerClient` now owns browser selection state, model orchestration, and export placement instead of the full control/chart markup.
- Thirty-first protected slice: admin data-entry draft construction and breakdown edit-month resolution moved into `src/features/metrics/admin-data-entry.ts`, so annual month `0`, monthly months `1-12`, zero-valued saved entries, and monthly breakdown month selection are feature-owned and directly tested.
- Thirty-second protected slice: admin data-entry filter, annual editor, monthly editor, and breakdown editor presentation moved into `src/components/AdminDataFilters.tsx`, `src/components/AdminAnnualEntryEditor.tsx`, `src/components/AdminMonthlyEntryEditor.tsx`, and `src/components/AdminBreakdownEntryEditor.tsx`, so `AdminDataClient` now focuses on browser state, confirmation state, and guarded mutations.
- Thirty-third protected slice: admin goal category summaries, search/category filtering, KPI availability for the selected year, rolling year options, and goal display formatting moved into `src/features/goals/admin-goals.ts`; the create form, goals table, and edit dialog moved into `src/components/AdminGoalCreateForm.tsx`, `src/components/AdminGoalsTable.tsx`, and `src/components/AdminGoalEditDialog.tsx`, so `GoalsManagerClient` now focuses on browser state, confirmation state, and guarded goal mutations.
- Thirty-fourth protected slice: admin catalog KPI/category summaries, KPI search/category filtering, fixed unit/frequency/direction option lists, direction labels, and create-form payload shaping moved into `src/features/catalog/admin-catalog.ts`; the KPI create form, KPI table, category create form, and category list moved into `src/components/AdminKpiCreateForm.tsx`, `src/components/AdminKpisTable.tsx`, `src/components/AdminCategoryCreateForm.tsx`, and `src/components/AdminCategoriesList.tsx`, so `KPIManagerClient` now focuses on tab state, confirmation state, and guarded catalog mutations.
- Thirty-fifth protected slice: admin user create-form payload shaping, role options, self/status/password-reset rules, date labels, and account-change success messages moved into `src/features/users/admin-users.ts`; the create form, user table, and temporary-password dialog moved into `src/components/AdminUserCreateForm.tsx`, `src/components/AdminUsersTable.tsx`, and `src/components/AdminPasswordResetDialog.tsx`, so `UserManagerClient` now focuses on account mutation state, confirmation targets, and guarded user-management calls.
- Thirty-sixth protected slice: audit-history browser filter state normalization, filter URL construction, KPI option filtering, year option derivation, period/value/change labels, deleted metadata labels, and actor fallback moved into `src/features/audit/admin-history.ts`; the filter panel and activity table moved into `src/components/AdminHistoryFilters.tsx` and `src/components/AdminHistoryTable.tsx`, so `HistoryClient` now focuses on router state and read-only filter transitions.
- Thirty-seventh protected slice: PNG/PDF raster export DOM preparation and the legacy html2canvas/jsPDF adapter moved into `src/features/exports`, so dashboard-specific report chrome, action hiding, background fallback, cleanup, and legacy PDF code-splitting have one tested export feature home.
- Thirty-eighth protected slice: admin data-entry draft edit/saving/saved/cleared/add/remove transitions moved into `src/features/metrics/admin-data-entry.ts`, so `AdminDataClient` keeps browser state, confirmation state, and guarded API mutations while deterministic draft state changes are feature-owned and directly tested.
- Thirty-ninth protected slice: donor-conversion rendering split into focused summary, chart, and table components while `DonorConversionCard` remains the small model/composition boundary around the feature-owned donor conversion model.
- Fortieth protected slice: calendar month labels, admin data-entry metric selection, breakdown period labels, and saved-entry deletion identity moved into the metrics feature. Entry drafts now retain their database row id so the Clear action uses the mutation adapter's documented `{ id }` contract, including for zero-valued entries.
- Forty-first protected slice: admin entry and breakdown mutation response readers moved into the metrics feature and now validate the distinct `{ entry }` and `{ breakdown }` success payloads before updating browser drafts. This fixes successful breakdown saves reading the wrong response key. Saved breakdown edits now retain their durable row id through the route and feature mutation, so changing a label updates the original row instead of inserting a duplicate; stale and conflicting edits return explicit 404/409 responses. Catalog deletion confirmations also moved into the catalog feature and now describe the real dependent-entry guard instead of incorrectly promising entry cascades.
- Forty-second protected slice: `/admin/data` page assembly moved into the metrics-owned `loadAdminDataPageData()` server operation, so the route no longer imports `getDb()` or executes SQL. The architecture guard now rejects low-level database imports from all production app/component files, and the shared sample-data metadata query has one narrow infrastructure home.
- Forty-third protected slice: raster export layout and proof were completed inside `src/features/exports`. Export-only Galano text now receives tested temporary line/wrap corrections with exact cleanup, redundant live page headers are hidden from all export-enabled dashboard views, and the legacy PDF adapter measures keep-together boundaries in the exact html2canvas clone before deterministic letter-page slicing. Live downloads and rendered artifacts verify the overview PNG plus a three-page overview PDF with intact card rows, monthly partial-year count PNG, annual currency PNG, and long-name percentage-point PNG.
- Forty-fourth protected slice: reporting server reads now expose explicit overview, category, metric-detail, and Trend Explorer operations. Category and metric pages receive only rows for their selected scope, while overview and trends retain broader datasets for documented instant interactions. Seeded JSON measurements reduced the Education category payload to 82,471 bytes and the Video views metric payload to 8,684 bytes, versus 273,363 bytes for overview. ADRs 0017-0019 define the modular-monolith, server-first, and auth-enforcement decisions; the final structural audit records SQL ownership, duplicate-rule review, removals, and intentionally retained paths. The architecture guard now also blocks cross-feature internal imports and framework/database dependencies in calculation modules.
- Forty-fifth protected slice: added a serial Playwright/Chrome acceptance suite for goal create/edit/goal-bearing PNG/delete, entry save failure/retry/clear, desktop and mobile navigation, no-data PNG, category and metric legacy PDF, and native print PDF. The suite found a real `?legacy=1` hydration mismatch; category/metric server pages now parse that flag and pass it as an explicit client prop.
- Forty-sixth protected slice: integrated the strategic-plan catalog as feature-owned data rather than returning seed definitions or calculations to routes/components. `src/features/catalog/strategic-plan.ts` owns 5 priorities, 59 annual KPIs, and 25 goals; reporting models own goal-prefix grouping, nearest-upcoming-goal selection, and overview goal summaries; schema 8 and ADR 0020 make the intentional catalog reset explicit; the metrics write boundary rejects annual/monthly period mismatches.
- Forty-seventh protected slice: corrected the migration boundary and strategic goal semantics. Schema 9 additively persists `baseline_year`, pre-strategic versions always take the documented reset path, numeric strategic goals declare absolute endpoints, and reporting computes progress for an explicit selected year without moving the target baseline. Populated migration, goal integration, API validation, catalog invariant, and browser acceptance coverage protect the behavior.

## Current Ownership Map

| Area | Current files | Notes |
| --- | --- | --- |
| Goals | `src/app/admin/goals/*`, `src/app/api/goals/route.ts`, `src/features/goals/*`, `src/components/AdminGoalCreateForm.tsx`, `src/components/AdminGoalsTable.tsx`, `src/components/AdminGoalEditDialog.tsx` | Goal calculations, queries, mutations, validation, admin goal list/form helpers, and DB-backed behavior tests are now feature-owned. Production call sites and tests use the public goals index for server operations; admin browser helpers use the client-safe `admin-goals` surface. The route is now an auth/CSRF adapter that returns refreshed feature-owned data after writes, and goal admin presentation is split into focused form/table/dialog components. |
| Catalog metadata | `src/features/catalog/strategic-plan.ts`, `src/features/catalog/server.ts`, `src/features/catalog/admin-catalog.ts`, `src/app/admin/kpis/*`, catalog components and mutation routes | The canonical strategic-plan definition, category/KPI ordering, lookup, mutations, dependent-entry checks, and admin catalog models are feature-owned. The strategic definition is pinned by direct count/order/uniqueness/sample-year/goal tests. |
| Metrics and entries | `src/features/metrics/*`, `src/app/admin/data/*`, focused data-entry components, `src/app/api/entries/route.ts`, `src/app/api/breakdowns/route.ts`, `src/lib/analytics.ts` | Period rules, entry data access, write-period enforcement, admin page/draft models, breakdown edit identity, response validation, and audit writes are feature-owned. Routes remain thin auth/CSRF/validation adapters; annual/flexible writes accept only month 0 and monthly writes only months 1-12. |
| Metric period rules | `src/features/metrics/period-rules.ts`, `src/features/metrics/index.ts` | Client-safe shared source for annual month `0`, monthly months `1-12`, short/full calendar month labels, and annual/monthly reporting-frequency classification. |
| Dashboard reporting | `src/features/reporting/server.ts`, `src/features/reporting/period.ts`, `src/features/reporting/types.ts`, `src/features/reporting/category-summary.ts`, `src/features/reporting/category-page.ts`, `src/features/reporting/metric-detail.ts`, `src/features/reporting/trend-explorer.ts`, `src/features/reporting/donor-conversion.ts`, `src/features/reporting/breakdown-comparison.ts`, `src/features/reporting/csv.ts`, `src/app/dashboard/**`, `src/components/MetricCard.tsx`, `src/components/CategoryOverviewCard.tsx`, `src/components/CategoryMetricGrid.tsx`, `src/components/CategoryMonthlyBreakdowns.tsx`, `src/components/CategoryAnnualBreakdowns.tsx`, `src/components/MetricComparisonStats.tsx`, `src/components/MetricGoalPanel.tsx`, `src/components/MetricTrendCard.tsx`, `src/components/MetricYtdBarCard.tsx`, `src/components/MetricBreakdownPanel.tsx`, `src/components/MetricValuesTable.tsx`, `src/components/TrendExplorerSidebar.tsx`, `src/components/TrendExplorerChartPanel.tsx`, `src/components/DonorConversionCard.tsx`, `src/components/DonorConversionSummaryCards.tsx`, `src/components/DonorConversionCharts.tsx`, `src/components/DonorConversionTable.tsx`, `src/components/BreakdownChart.tsx` | Server pages use explicit overview, category, metric-detail, and Trend Explorer operations plus feature-owned period state. Category and metric operations scope rows before serialization; overview and trends intentionally retain the datasets required for instant cross-category or cross-KPI controls. Overview rollups, category detail, metric detail, Trend Explorer models/defaults, donor conversion, annual breakdown comparison, and CSV rows are feature-owned and tested. Client components own browser controls and chart rendering, with Trend Explorer and donor-conversion presentation split from their route/card orchestration boundaries. |
| Exports | `src/features/reporting/csv.ts`, `src/features/exports/dom-capture.ts`, `src/features/exports/legacy-pdf-export.ts`, `src/components/ui/ExportCSVButton.tsx`, `src/components/ui/ExportPNGButton.tsx`, `src/components/ui/PrintButton.tsx`, `src/components/ExportPDFButton.tsx`, `src/components/LegacyExportPDFButton.tsx` | CSV export data shaping is feature-owned by reporting. PNG/PDF raster export DOM preparation and the dynamically imported legacy PDF adapter are feature-owned by exports, while the buttons remain thin browser adapters that use the rendered dashboard values. |
| Audit history | `src/features/audit/server.ts`, `src/features/audit/admin-history.ts`, `src/app/admin/history/*`, `src/components/AdminHistoryFilters.tsx`, `src/components/AdminHistoryTable.tsx` | Audit browsing/read models are feature-owned. Existing tests cover immutable history after source metadata changes, including snapshot fields, LEFT JOIN behavior, deleted metadata filter options, and page-level admin redirects. Audit-history browser display/filter helpers are client-safe feature rules, while filter and activity rendering live in focused components. |
| Users and account management | `src/features/users/server.ts`, `src/features/users/admin-users.ts`, `src/app/admin/users/*`, `src/components/AdminUserCreateForm.tsx`, `src/components/AdminUsersTable.tsx`, `src/components/AdminPasswordResetDialog.tsx`, `src/app/api/users/route.ts`, `src/app/api/users/account/route.ts`, `scripts/setup-admin.ts`, auth regression tests | DB-backed account-row reads/writes are feature-owned: lookup, listing, creation, deletion, password updates, role changes, disable/enable, and revocation-watermark bumps. User mutation adapters return refreshed users to the browser client. Admin user presentation is split into focused form/table/dialog components, while client-safe role/display/payload helpers live in the users feature. |
| Auth and authorization | `src/features/auth/server.ts`, `src/features/auth/session.ts`, `src/lib/session.ts`, `src/lib/auth-flag.ts`, `src/lib/request-guard.ts`, `src/app/api/auth/**`, protected API routes, auth regression tests | Protected route coverage is data-driven. Credential verification, bootstrap/bypass policy, and the app-facing session/authorization gate are feature-owned. `src/lib/session.ts` owns the underlying Next.js cookies/iron-session plumbing, and `src/lib/auth-flag.ts` / `src/lib/request-guard.ts` remain centralized infrastructure guardrails. New mutation boundaries must use the shared auth and CSRF path. |
| Shared UI | `src/components/ui/*`, `scripts/design-system-guard.sh`, `scripts/design-tokens-guard.sh` | Keep new controls inside the design-system library or existing primitives. |
| Verification tooling | `eslint.config.mjs`, `package.json`, `scripts/design-*.sh`, `scripts/auth-bypass-guard.sh`, `scripts/architecture-boundary-guard.sh`, `scripts/d8ad-can-008-ci-gate.sh` | Linting, design-token/design-system guards, auth-bypass guard, architecture-boundary guard, shell-injection regression gate, typecheck, build, unit tests, and smoke checks are part of the preservation proof bundle. |

## Observed Coupling

- `src/lib/repository.ts` has been removed. Goal, metrics, catalog, and audit-history data access now live in feature-owned modules.
- Dashboard pages still pass large datasets into client components where browser interaction needs them, though their data loading, reporting-period selection, overview category rollups, category, metric detail, donor conversion display models, annual breakdown comparison models, Trend Explorer page defaults/view models, focused Trend Explorer presentation components, and CSV export rows now come from feature-owned or responsibility-focused modules.
- Production App Router and component files no longer import `getDb()` or `node:sqlite`; the architecture guard enforces that UI/server-page boundary.
- Admin client components still call internal API routes through `apiFetch` for guarded mutations. The goals, catalog, and user-management clients no longer perform follow-up internal GETs after writes; they consume mutation response payloads instead. Goal and catalog admin clients now keep browser state/confirmations while feature-owned helpers prepare list/filter/form view data and focused components render the forms and tables.
- User account data access, credential/bootstrap policy, app-facing session gates, and admin user-management display/payload helpers are now feature-owned. Session cookie handling still lives in `src/lib/session.ts` because it is the Next.js cookie/session infrastructure boundary.
- `docs/api-boundary-inventory.md` identifies current production browser route consumers and records removed internal read adapters such as `GET /api/users`, `GET /api/meta`, and `GET /api/entries/history`.
- The audit-history page now keeps server-side immutable-history loading in `src/features/audit/server.ts`, client-safe filter/display rules in `src/features/audit/admin-history.ts`, and focused filter/table markup in `src/components`.
- Annual KPI handling is mostly correct in tests. Basic annual/monthly classification and month-range predicates have one shared module, and metric entry/breakdown query and mutation boundaries now live in the metrics feature.
- Admin data-entry draft construction, draft state transitions, and monthly-breakdown period rules now live in the metrics feature, and the data-entry filter/monthly/annual/breakdown renderers are focused components. `AdminDataClient` still owns confirmation state and guarded browser mutation calls.
- Goal behavior is covered by feature-owned integration tests and pure calculation tests. Admin goal filtering, category summaries, KPI/year option derivation, and target display helpers are feature-owned, while `GoalsManagerClient` owns confirmation state and guarded browser mutation calls.

## First Slice Completed

Goal ownership was extracted without changing user-visible behavior:

- Added `src/features/goals/calculations.ts`.
- Added `src/features/goals/calculations.test.ts`.
- Added `src/features/goals/queries.ts`, `src/features/goals/mutations.ts`, and `src/features/goals/records.ts`.
- Added `src/features/goals/validation.ts`, `src/features/goals/validation.test.ts`, and `src/features/goals/index.ts`.
- Added `src/features/goals/admin-goals.ts` and `src/features/goals/admin-goals.test.ts` for admin goal category summaries, KPI availability, filtering, year options, and display formatting.
- Updated `src/app/admin/goals/page.tsx`, the dashboard data loader, and `src/app/api/goals/route.ts` to use the feature-owned public surface.
- Extracted `src/components/AdminGoalCreateForm.tsx`, `src/components/AdminGoalsTable.tsx`, and `src/components/AdminGoalEditDialog.tsx` from `GoalsManagerClient` so create/list/edit rendering has focused presentation ownership.
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
- Added `src/features/metrics/admin-data-entry.ts` to build admin entry/breakdown drafts and resolve monthly breakdown edit months without falling back to annual month `0`.
- Added `src/features/metrics/server.ts` as the server-only public surface for DB-backed metric entry operations; `src/features/metrics/index.ts` remains client-safe for period rules.
- Removed `listEntries`, `upsertEntry`, `deleteEntry`, `listBreakdowns`, `upsertBreakdown`, `deleteBreakdown`, and `listAvailableYears` from `src/lib/repository.ts`.
- Updated API routes, dashboard/admin pages, seed data, and DB-backed tests to import the public metrics feature surface.
- Preserved the existing upsert/readback/history transaction pattern and immutable snapshot write in the feature module.
- Added `src/features/metrics/admin-data-entry.test.ts` covering annual month `0` drafts, twelve monthly drafts, zero-valued saved months, monthly breakdown classification, selected-month draft filtering, month `0` avoidance for monthly breakdown editing, and draft edit/saving/saved/cleared/add/remove transitions.
- Extracted `src/components/AdminDataFilters.tsx`, `src/components/AdminAnnualEntryEditor.tsx`, `src/components/AdminMonthlyEntryEditor.tsx`, and `src/components/AdminBreakdownEntryEditor.tsx` from `AdminDataClient` so filter controls and the three editor modes have focused presentation ownership.
- Moved entry and breakdown draft mutation helpers (`patchEntryDraft`, `markEntryDraftSaving`, `applySavedEntryDraft`, `clearSavedEntryDraft`, `patchBreakdownDraft`, `markBreakdownDraftSaving`, `applySavedBreakdownDraft`, `addBlankBreakdownDraft`, `removeBreakdownDraft`) into the metrics feature so the admin client no longer hand-rolls these state transitions inline.
- Moved calendar month labels and the selected KPI/breakdown period model into the metrics feature, and retained the saved `monthly_entries.id` in each entry draft so Clear sends the route's `{ id }` delete payload instead of an unsupported natural-key payload.
- Re-ran focused entry/breakdown/audit route and DB tests after the move.

Catalog metadata data access was moved without changing deletion behavior:

- Added `src/features/catalog/server.ts` for category and KPI metadata reads/writes.
- Added `src/features/catalog/admin-catalog.ts` and `src/features/catalog/admin-catalog.test.ts` for admin catalog KPI filtering, category-count chips, form option lists, direction labels, and create payload builders.
- Removed category/KPI metadata operations and dependent-entry deletion guards from `src/lib/repository.ts`.
- Updated metadata API routes, admin/dashboard pages, seed data, and DB-backed tests to import the catalog feature surface.
- Extracted `src/components/AdminKpiCreateForm.tsx`, `src/components/AdminKpisTable.tsx`, `src/components/AdminCategoryCreateForm.tsx`, and `src/components/AdminCategoriesList.tsx` from `KPIManagerClient` so KPI/category create and list rendering has focused presentation ownership.
- Preserved the existing `DependentEntriesError` 409 path when a category or KPI still has live monthly/breakdown dependents.

Audit-history browsing was moved without changing durable-history behavior:

- Added `src/features/audit/server.ts` for history list queries and deleted metadata filter options.
- Moved D8AD-CAN-005 DB integration coverage into `src/features/audit/integration.test.ts`.
- Updated the admin history page to import the audit feature surface.
- Preserved snapshot-column filtering, LEFT JOIN current-metadata fields, deleted/renamed flags, and the admin-only route boundary.
- Removed the obsolete `src/lib/repository.ts` module.

Audit-history browser presentation was narrowed without changing filter or table behavior:

- Added `src/features/audit/admin-history.ts` and `src/features/audit/admin-history.test.ts` for active-filter state, deep-link URL construction, KPI option filtering, descending year options, monthly/annual/breakdown period labels, value labels, preserved change-label semantics, deleted metadata labels, and actor fallback.
- Extracted `src/components/AdminHistoryFilters.tsx` and `src/components/AdminHistoryTable.tsx` from `HistoryClient` so filter controls and read-only activity rendering have focused presentation ownership.
- Kept `/admin/history` loading, auth redirects, deleted metadata option merging, and router transitions in the existing page/client boundary.

CSV export row construction was moved without changing export content:

- Added `src/features/reporting/csv.ts` with pure row builders for overview, category, metric detail, and trend exports.
- Added `src/features/reporting/csv.test.ts` covering monthly KPIs, annual month `0`, breakdown rows, metric table rows, and trend series columns.
- Updated dashboard clients to pass feature-built rows/columns/filenames into `ExportCSVButton`.
- Kept CSV serialization and formula-injection protection in the shared UI helper.

PNG/PDF raster export adapter ownership was moved without changing export content:

- Added `src/features/exports/dom-capture.ts` for the shared DOM preparation rules used before dashboard raster capture.
- Added `src/features/exports/dom-capture.test.ts` covering report-chrome reveal, action hiding, cleanup restoration, and server/test background fallback.
- Moved the legacy html2canvas/jsPDF adapter to `src/features/exports/legacy-pdf-export.ts` and kept it dynamically imported from `ExportPDFButton`.
- Updated `ExportPNGButton` to use the same feature-owned DOM preparation helper before snapshotting the rendered dashboard.
- Removed the old `src/lib/export-helpers.ts` and `src/lib/legacy-pdf-export.ts` import paths.

Dashboard data and reporting-period ownership was moved without changing routing behavior:

- Initially added `src/features/reporting/server.ts` with one broad dashboard
  loader and `listDashboardYears`; the broad loader was later replaced by
  explicit overview, category, metric-detail, and Trend Explorer operations.
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
- Extracted `src/components/CategoryMetricGrid.tsx`, `src/components/CategoryMonthlyBreakdowns.tsx`, and `src/components/CategoryAnnualBreakdowns.tsx` from the category route client so metric cards, monthly donor-conversion breakdowns, and annual composition breakdowns have focused presentation components.

Metric detail page model construction was moved without changing page output:

- Added `src/features/reporting/metric-detail.ts` to build KPI/category lookup results, KPI analytics, trend series, YTD bar data, selected-year goals, value table rows, direction labels, and breakdown display models.
- Added `src/features/reporting/metric-detail.test.ts` covering monthly and annual KPI models, selected-year goals, trend/table/YTD data, monthly donor-conversion routing, annual month-0 current/compare breakdown routing, and unknown KPI slugs.
- Moved the `MetricValueRow` contract into `src/features/reporting/types.ts` so metric detail models and CSV exports share one table-row shape.
- Updated `src/app/dashboard/metric/[slug]/MetricDetailClient.tsx` to render the feature-built model instead of calculating analytics, trend data, goal lookup, table rows, and breakdown routing inline.
- Extracted `src/components/MetricComparisonStats.tsx`, `src/components/MetricGoalPanel.tsx`, `src/components/MetricTrendCard.tsx`, `src/components/MetricYtdBarCard.tsx`, `src/components/MetricBreakdownPanel.tsx`, and `src/components/MetricValuesTable.tsx` from the metric detail client so comparison stat rendering, goal progress rendering, trend rendering, annual/YTD bar rendering, breakdown routing, and value-table rendering have focused components while preserving the existing comparison/goal/both URL modes and the annual completion vs monthly YTD/full-year distinction.

Trend Explorer model construction was moved without changing chart output:

- Added `src/features/reporting/trend-explorer.ts` to build default KPI/year selections, category-visible KPI lists, raw monthly trend rows, indexed/log axis transforms, selected-series metadata, export filenames, filter labels, and empty states.
- Added `src/features/reporting/trend-explorer.test.ts` covering default selection, monthly-only KPI filtering, month `0` exclusion, duplicate monthly value summing, indexed baseline behavior, log-mode non-positive value handling, series labels, export names, and empty states.
- Updated `src/app/dashboard/trends/TrendExplorerClient.tsx` to consume the feature-built model while retaining browser selection state, Recharts rendering, and export controls.
- Added `loadTrendExplorerPageData()` in `src/features/reporting/server.ts` so the server page reads KPI/category/entry data once, derives trend years through `listTrendExplorerYears()`, and passes a feature-built initial selection into the client.
- Extracted `src/components/TrendExplorerSidebar.tsx` and `src/components/TrendExplorerChartPanel.tsx` so selector controls, chart rendering, y-axis mode tabs, legends, and empty states are no longer embedded in the route client.

Donor conversion display model construction was moved without changing card output:

- Added `src/features/reporting/donor-conversion.ts` to build monthly referred/donor rows, YTD totals, conversion percentages, percentage-point changes, and chart rows.
- Added `src/features/reporting/donor-conversion.test.ts` covering through-month totals, chart data, percentage-point movement, zero-denominator behavior, and omitted compare series.
- Updated `src/features/reporting/category-summary.ts` and `src/components/DonorConversionCard.tsx` to use the shared donor conversion rule instead of maintaining separate implementations.
- Extracted `src/components/DonorConversionSummaryCards.tsx`, `src/components/DonorConversionCharts.tsx`, and `src/components/DonorConversionTable.tsx` so the card composes the feature model while summary stats, Recharts rendering, and monthly table rendering have focused presentation ownership.

Annual breakdown comparison model construction was moved without changing chart output:

- Added `src/features/reporting/breakdown-comparison.ts` to build ordered component rows, current/compare totals, chart data, per-row deltas, and percent change.
- Added `src/features/reporting/breakdown-comparison.test.ts` covering label ordering, summed values, chart rows, totals, percent change, and missing compare-year rows.
- Updated `src/components/BreakdownChart.tsx` to render the feature-built model instead of computing chart/table rows inline.

Catalog API refresh behavior was narrowed without weakening auth/CSRF:

- Updated `src/app/api/kpis/route.ts` and `src/app/api/categories/route.ts` so successful POST/PATCH/DELETE responses include refreshed `kpis` and `categories` from the catalog feature.
- Updated `src/app/admin/kpis/KPIManagerClient.tsx` to consume that mutation response directly instead of calling `GET /api/kpis` and `GET /api/categories` after each write.
- Added `src/app/api/kpis/route.test.ts` and `src/app/api/categories/route.test.ts` to pin refreshed-payload behavior with mocked auth and real request-guard headers.
- Removed the obsolete `GET /api/kpis` and `GET /api/categories` adapters after the admin page and mutation responses covered current browser needs.
- Updated `scripts/smoke.sh` to assert the strategic 59-KPI / 5-priority catalog through `/admin/kpis`; `scripts/smoke-catalog.ts` supplies only local mutation IDs, and the D8AD-CAN-008 fake-server gate runs that helper in fixture mode.
- Removed the obsolete `GET /api/entries/history` adapter after `/admin/history` became the sole audit-history browser surface.
- Added `docs/api-boundary-inventory.md` to record active browser consumers, smoke/QA-only read routes, and removal conditions for remaining API adapters.

User-management API refresh behavior was narrowed without weakening auth, CSRF, or session revocation:

- Updated `src/app/api/users/route.ts` and `src/app/api/users/account/route.ts` so successful user creation, temporary password reset, deletion, role change, and disable/enable responses include refreshed `users`.
- Updated `src/app/admin/users/UserManagerClient.tsx` to consume mutation responses directly instead of calling `GET /api/users` after each write.
- Added `src/app/api/users/route.test.ts` and `src/app/api/users/account/route.test.ts` to pin refreshed-payload behavior with mocked auth and real request-guard headers, including self-target and missing-target account guards.
- Updated `docs/api-boundary-inventory.md` and ADR 0003 to record that `GET /api/users` has no production browser read path and is safe to remove once the auth regression matrix is adjusted.

Admin user-management presentation ownership was narrowed without changing account behavior:

- Added `src/features/users/admin-users.ts` and `src/features/users/admin-users.test.ts` for create-form payload shaping, role option order, self-row detection, active/disabled labels, password-reset eligibility, created-date formatting, and account-change success messages.
- Extracted `src/components/AdminUserCreateForm.tsx`, `src/components/AdminUsersTable.tsx`, and `src/components/AdminPasswordResetDialog.tsx` from `UserManagerClient` so invite, account table, and temporary-password rendering have focused presentation ownership.
- Kept role changes, disable/enable, reset, delete, refreshed-user payload handling, and confirmation state in `UserManagerClient`, with all mutations still going through the existing auth/CSRF-protected API adapters.

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

Architecture boundary fitness checks were added for the API simplification phase:

- Added `scripts/architecture-boundary-guard.sh`.
- Wired the guard into `npm run design-system:guard` and `npm run design-system:test`.
- The guard fails when server-owned source uses `fetch()`/`apiFetch()` against the app's own `/api/*` routes, while allowing intended browser client mutations.
- The guard fails when `"use client"` files import `@/lib/db`, `node:sqlite`, or feature `*/server` modules.
- The guard fails when fully removed internal read adapters such as `GET /api/meta`, `GET /api/entries/years`, or `GET /api/entries/history` reappear in `src/` or smoke scripts.
- The guard fails when any production file under `src/app` or `src/components` imports low-level database access.

Admin mutation contracts were made explicit at the browser boundary:

- Added tested `readSavedEntryMutation()` and `readSavedBreakdownMutation()` helpers in the metrics feature.
- Updated `AdminDataClient` to validate successful JSON before applying it to draft state and to consume the breakdown adapter's actual `{ breakdown }` key.
- Kept zero-valued entries valid and added a controlled error state for malformed success payloads instead of allowing a browser exception.
- Preserved saved breakdown row ids through `POST /api/breakdowns`; id-based edits verify KPI/year/month ownership, update labels in place without changing sort order, reject duplicate labels with 409, and return 404 when the target row no longer exists.
- Updated monthly breakdown save/delete feedback to use the selected month-and-year period label.
- Added tested catalog deletion confirmation models that explain live entries must be cleared first so audit tombstones are preserved; removed the incorrect promise that deleting KPI/category metadata cascades through live entries.
- Verified the real browser workflow against the loopback dev server by creating, renaming, and deleting a temporary annual breakdown row. The rename left exactly one row, the success banner used the selected period, cleanup succeeded, and the browser console remained error-free.

Admin data page assembly was moved behind a feature boundary:

- Added `src/features/metrics/admin-data-server.ts` with `loadAdminDataPageData()` for ordered KPIs/categories, entries, breakdowns, year options, and sample-data state.
- Updated `/admin/data` to perform only session/role redirects and pass the feature-built page data to its client coordinator.
- Added DB integration coverage for the complete page-data shape.
- Added `src/lib/app-meta.ts` so reporting and metrics loaders share one narrow sample-data metadata query.
- Extended the architecture guard to reject `@/lib/db` and `node:sqlite` imports anywhere in production app/component code.

Raster export pagination and visual proof were strengthened:

- Added `src/features/exports/raster-layout.ts` with direct tests for aspect
  ratio, exact source-pixel coverage, keep-together cut movement, and invalid
  dimensions.
- Updated the legacy PDF adapter to capture the complete export root once,
  measure `.surface` and report chrome boundaries in html2canvas's cloned DOM,
  and slice landscape Letter pages without splitting category-card rows.
- Added adapter tests for slice order, cloned-layout measurement, save
  behavior, and cleanup after raster failures.
- Added explicit export-text preparation for tight Galano lines, long mover
  labels, and report footer text; all temporary styles restore exactly.
- Hid the redundant live `PageHeader` in overview, category, metric, and trend
  exports because `PrintReportHeader` already contains the title and filter
  context.
- Downloaded and visually inspected valid overview PNG/PDF artifacts plus
  monthly count, annual currency, and long-name percentage PNGs. The approved
  overview PDF is landscape Letter, three pages, and renders every card row
  and footer without clipping.

Server/client boundaries and final structural ownership were audited:

- Added `loadOverviewPageData()`, `loadCategoryPageData()`,
  `loadMetricDetailPageData()`, and `loadTrendExplorerPageData()` with direct
  server-operation tests.
- Scoped category and metric entry/breakdown/goal reads before serialization.
  Seeded JSON measurements were 273,363 bytes for overview, 82,471 bytes for
  Education, 8,684 bytes for Video views, and 213,111 bytes for trends.
- Retained broad overview and trend payloads because their existing controls
  switch across every category or eligible KPI without a network read.
- Added filtered KPI-set entry reads and filtered goal reads with DB integration
  coverage; available years now use the distinct-year query instead of loading
  all entry rows.
- Removed obsolete goal response aliases, the no-op `BrandMark.inverted` prop,
  duplicate reporting year derivation, and the hardcoded current-year seed
  month list.
- Added ADR 0017 for the feature-oriented modular monolith, ADR 0018 for
  server-first rendering/client payloads, ADR 0019 for auth enforcement, and
  `docs/architecture-refactor-final-audit.md` for rerunnable structural proof.
- Extended the architecture guard to reject cross-feature internal imports and
  React/Next/database dependencies in calculation modules. Strict TypeScript
  unused checks pass after the cleanup.

Durable browser acceptance coverage was added:

- Added `playwright.config.ts` and `e2e/dashboard-acceptance.spec.ts`; the suite
  starts a loopback dev server, runs serially in installed Chrome, stores
  failure artifacts outside the repository, and cleans up test data.
- Goal create/edit/delete is exercised through the real UI, including a
  goal-bearing metric PNG whose signature and dimensions are validated.
- Monthly data entry exercises a controlled server failure, visible error,
  successful retry, saved state, confirmation dialog, and clear.
- Desktop and 390x844 mobile navigation are exercised through visible links
  and the mobile drawer.
- Conversion and ten-badge synthetic no-data PNGs, category and metric legacy
  PDFs, and a browser-native print PDF are validated as real files.
- The first export run caught the legacy fallback reading `window.location`
  during render. The server now parses `legacy=1` and passes a stable boolean,
  eliminating the hydration mismatch.

Post-merge self-review hardened correctness at the data boundaries:

- Schema 9 additively freezes each goal's baseline year; versions 7 and older
  always take the documented strategic-catalog reset path instead of being
  stamped current by legacy in-place migrations.
- Strategic goals declare auditable absolute endpoints or growth percentages;
  the seed adapter derives stored deltas from the fixed 2026 baseline.
- Scalar and breakdown writes reject unknown KPIs, the wrong storage type,
  mismatched annual/monthly periods, and blank breakdown labels before SQLite
  mutation.
- Populated migration, goal, catalog, route, integration, and browser tests
  protect these behaviors. Final acceptance is 642 Vitest tests, 4 Playwright
  workflows, 48/48 bypass smoke checks, and 52/52 auth-enabled smoke checks.
- Final schema-9 seeded JSON is 122,406 bytes for overview, 15,952 for Justice
  Education, 1,961 for one metric, and 1,721 for the annual-only trends state.

## Next Safe Slices

The objective is complete. Future work should be driven by a new product,
security, or maintenance requirement rather than continuing this refactor.
Remaining browser mutation adapters have documented current consumers and
security contracts; replacing them is not required for the modular-monolith
architecture.

## Guardrails

- Do not remove API routes until route usage is inventoried and current consumers are migrated.
- Do not restore removed read adapters, server-side self-HTTP calls, or client imports of server-only data access; use feature-owned server operations instead.
- Do not move auth or CSRF checks into client code.
- Do not change KPI definitions or seeded metric ordering without explicit approval.
- Do not collapse YTD pacing and full-year completion into one value.
- Do not treat `0` as missing data.
- Do not use INNER JOINs for durable audit history display where source metadata may be deleted.
