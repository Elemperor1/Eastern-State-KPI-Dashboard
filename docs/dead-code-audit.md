# Dead-code and unused-dependency audit

Date: 2026-07-17

Repository: `Elemperor1/Eastern-State-KPI-Dashboard`

Baseline revision: `d12f7b15dfd34d0b0b5257dc89f43d9b72aa28b4`
(`origin/master`, `Repository hygiene audit and guard (#60)`)

Branch: `codex/dead-code-audit-2026-07-17`

This audit is behavior-preserving. A missing static import is not deletion
proof: Next.js filesystem discovery, dynamic imports, npm lifecycle hooks,
shell and workflow entry points, Docker/Fly behavior, test-only contracts,
public assets, CSS/runtime selectors, and SQLite compatibility are all part of
the reachability model.

## Baseline receipt

The audit runs in the isolated worktree
`/private/tmp/eastern-state-kpi-dead-code-audit`. The user's primary checkout
was inspected read-only and left untouched, including its modified
`opencode.json` and untracked security, research, article, external-source, and
wiki material.

| Measure | Baseline |
| --- | ---: |
| Tracked files | 416 |
| Tracked bytes | 12,485,816 |
| `src/` files | 256 |
| TypeScript/TSX source files | 253 |
| Source lines (`src/**/*.ts(x)`) | 62,937 |
| Tracked code lines (TS/TSX/JS/MJS/shell) | 67,910 |
| Test files | 82 |
| Public assets | 9 |
| Script files | 28 |
| Workflow files | 5 |
| Package scripts | 30 |
| Production dependencies | 12 |
| Development dependencies | 18 |

### Routes and framework entries

The source contains 9 `page.tsx`, 18 `route.ts`, 9 `loading.tsx`, and 4
`error.tsx` files. The 18 route handlers export 32 HTTP method functions.
`next build --webpack` discovered the following routes:

- pages: `/`, `/dashboard`, `/dashboard/overview`,
  `/dashboard/category/[slug]`, `/dashboard/metric/[slug]`, `/data-entry`,
  `/reports`, `/setup`, `/login`, and `/setup-password`;
- framework route: `/_not-found`;
- API routes: `/api/auth/change-password`, `/api/auth/login`,
  `/api/auth/logout`, `/api/auth/me`, `/api/categories`, `/api/kpis`,
  `/api/users`, `/api/users/account`, and `/api/strategy/{component-entries,
  components,configurations,distribution-bands,distributions,export,goals,
  memberships,observations,targets}`.

The production build completed 24 static-generation tasks. No middleware,
proxy, instrumentation, sitemap, robots, or generated social-image file is
present. `src/app/layout.tsx`, route pages/handlers, loading files, error
boundaries, `public/favicon.ico`, and metadata icon declarations are retained
as framework-discovered entries.

### Workflows and module boundaries

The primary workflows are authentication/password rotation; Overview and its
priority/measure drill-downs; strategic KPI data entry and deletion; Board and
Trends reporting with CSV/PNG/PDF/print output; Setup Measures, Goals, People,
and immutable Activity; empty/error/recovery states; responsive and keyboard
navigation; migration/seed/provisioning; performance profiling; and the
security/quality gates.

Package scripts were traced through npm lifecycle semantics, documentation,
GitHub Actions, Docker, Fly, Playwright, and shell-to-script calls. The
`prelint` lifecycle hook is implicitly invoked by `npm run lint`. The Docker
entry point reaches `start:deploy` -> `scripts/start-production.sh` ->
`scripts/ensure-seeded.mjs`. Playwright reaches `scripts/e2e-server.sh`; the
smoke harness invokes `scripts/smoke-catalog.ts` by path.

Madge resolved 256 source modules and 676 static import edges with no circular
dependencies. Its roots consist of Next.js filesystem entries and test files.
Knip additionally recognized dynamic imports of the legacy PDF adapter and
`html2canvas`. The architecture guard covers server/client and cross-feature
boundaries.

### Dependencies and build output

The lockfile installed 504 packages with zero npm audit vulnerabilities.
Direct production packages are `bcryptjs`, `clsx`, `date-fns`, `html2canvas`,
`iron-session`, `jspdf`, `lucide-react`, `next`, `react`, `react-dom`,
`recharts`, and `zod`. Direct development packages are the ESLint/TypeScript,
Tailwind/PostCSS, Vitest/coverage, Playwright, and `tsx` toolchain recorded in
`package.json`.

Baseline production output after the acceptance build:

| Build measure | Baseline |
| --- | ---: |
| `.next` files | 306 |
| `.next` disk use | 298,816 KiB |
| Static chunk bytes | 2,666,237 |
| Server output bytes | 4,294,904 |

`html2canvas` and `jspdf` are deliberately lazy: PNG imports `html2canvas` on
click and PDF dynamically imports the feature adapter. Recharts is exercised
by the Trends workflow. PostCSS discovers `tailwindcss` and `autoprefixer`
through `postcss.config.mjs`; ESLint configuration consumes the resolver
transitively through `eslint-config-next`.

### Data compatibility

Schema version 11 has additive predecessors 9 and 10. The initialized schema
contains 19 tables: `users`, `meta`, `categories`, `kpis`, `monthly_entries`,
`breakdown_entries`, `entry_history`, `kpi_goals`, `strategic_goals`,
`goal_kpis`, `kpi_measurement_configs`, `kpi_observations`, `kpi_components`,
`kpi_component_entries`, `kpi_targets`, `distribution_bands`,
`distribution_observations`, `distribution_values`, and
`strategic_audit_events`.

All schema-creation, v8-to-v9, v9-to-v10, and v10-to-v11 logic is retained.
Legacy tables and migration reconciliation are stored-data and rollback
contracts, not dead code.

### Test and runtime baseline

| Check | Baseline result |
| --- | --- |
| `npm test` | 81 files / 1,204 tests passed |
| `npm run test:coverage` | 1,204 tests; reporting-cycle gate: 100% statements/lines/functions, 97.05% branches |
| `npm run design-system:test` | Guards, type generation, TypeScript, and Next.js production build passed |
| `npm run lint` | Passed with all prelint guards |
| `npm run test:e2e` | 11/11 credentialed Chrome workflows passed |
| D8AD-CAN-008 dynamic gate | 51 smoke assertions plus injection side-effect checks passed |

Coverage is intentionally scoped to the shared reporting-cycle contract. It
is evidence for that contract, not proof that an uncovered file is unused.

## Evidence methods

- TypeScript strict compilation and type-aware ESLint;
- Next.js route type generation and production build discovery;
- Knip 6.27.0 in normal and production modes;
- Depcheck 1.4.7;
- `ts-prune` as a noisy secondary export signal;
- Madge import graph/orphan/cycle analysis;
- repository-wide exact-name, string, asset, script, environment, CSS class,
  and custom-property searches;
- package.json, npm lifecycle, workflow, Docker, Fly, Playwright, shell, and
  documentation tracing;
- initialized SQLite schema inspection and migration tests;
- Vitest coverage, production build traces, Playwright workflows, and manual
  browser/runtime verification;
- final security, Docker, container, smoke, and unused-code checks.

Scanner output is a candidate generator. Each candidate below has an explicit
framework/operational check and disposition.

## Evidence ledger before deletion

### Files, assets, dependencies, scripts, and dead subtrees

| Candidate | Reference and discovery checks | Runtime/coverage evidence | Confidence | Disposition |
| --- | --- | --- | --- | --- |
| `scripts/ensure-seeded.mjs` | Knip file finding contradicted by `start-production.sh`, Docker `start:deploy`, README/operator/migration docs, and direct tests | Docker/startup path and `ensure-seeded.test.ts` | High retain | retain as operational support |
| `scripts/smoke-catalog.ts` | Knip file finding contradicted by runtime string invocation in `scripts/smoke.sh`; architecture inventory documents the helper | D8AD-CAN-008 and real smoke path execute it | High retain | retain as operational support |
| `security-audit/D8AD-CAN-004/fixtures/set_admin_password.mjs` | Knip file finding contradicted by `fixtures/start_app.sh` plus the reproducibility report | Versioned historical security reproduction | High retain | retain as test or operational support |
| Next `page.tsx`, `route.ts`, `loading.tsx`, `error.tsx`, and `layout.tsx` entries | Filesystem convention plus build route discovery | Production build and Playwright | High retain | retain as framework-discovered |
| `public/favicon.ico`, Galano fonts, mark logo, and `starfield.svg` | Metadata, `@font-face`, preload, `BrandMark`, login/setup styles | Build and browser workflows | High retain | retain as active |
| `public/fonts/LICENSE.txt` | No runtime import; required license accompanies versioned font binaries | Operational/legal support | High retain | retain as operational support |
| `public/logos/eastern-state-logo.png` | Exact basename/path search found no source, CSS, metadata, test, document, workflow, Docker, or runtime-string reference | Absent from build consumers and browser workflows | High remove | remove |
| `date-fns` | Knip and Depcheck agree; exact package/import search found only `package.json`/lockfile | Build/tests pass without any source consumer | High remove | remove |
| `autoprefixer`, `postcss`, `eslint-import-resolver-typescript` | Depcheck cannot see configuration/transitive plugin loading; config and framework packages require them | lint/build consume them | High retain | retain as configuration-driven |
| `test:unit` package script | Same command as `test`; no workflow, documentation, shell, or package-script consumer | `test` and `test:ci` are the supported paths | High remove | remove |
| `d8ad-can-008:test` package script | No consumer or documentation; `quality:guards` invokes the shell gate directly | Shell gate remains active in lint/build | High remove | remove |
| `CardAction.tsx` | Only barrel, source-text motion test, and historical design-audit references; no render/import/runtime string | Absent from production graph and Playwright | High remove | remove source/test hook; retain dated audit evidence |
| `Tabs.tsx` | Only barrel, source-text motion test, live design-system import example, and obsolete removed-Trends roadmap references | Absent from production graph and build | High remove | remove source/live import example; retain historical roadmap/audit evidence |
| `ProgressToTarget.tsx`, `progress-to-target-model.ts`, and their test | Closed subtree reachable only from barrel/component/test; dated implementation plan is explicitly historical | Test covers only deleted presentation behavior | High remove | remove subtree; retain dated plan/audit evidence |
| `strategic-history-model.ts` and test | Production Knip file finding; exact symbol/import search shows the test is the sole consumer | Activity UI uses different active models | High remove | remove obsolete implementation and test |
| `features/reporting/goal-selection.ts` and test | Production Knip file finding; exact symbol/import search shows the test is the sole consumer | Current strategic target policy/reporting queries use different code | High remove | remove obsolete legacy goal selector and test |
| Legacy types in `src/lib/types.ts`: `MonthlyEntry*`, `BreakdownEntry*`, `ComparisonPoint`, `GoalType`, `KpiGoal*`, `YearSummary`, `KPIAnalytics` | `ts-prune`, Knip, and exact symbol searches; remaining `KpiGoal*` consumers are the dead goal-selector subtree | No serialization/runtime use; SQLite tables remain untouched | High remove | remove types only; retain stored-data schema |
| `getKPIBySlug`, `listChildKPIs` | Knip plus exact symbol search found declarations only | Current pages use strategic reporting operations; current catalog reads use `getKPI`/`listKPIs` | High remove | remove functions |

### CSS and configuration candidates

| Candidate | Reference and discovery checks | Confidence | Disposition |
| --- | --- | --- | --- |
| `.tab-button`, `.card-action` rules | Exact class search reaches only the dead UI files (and a workflow action name false match) | High remove | remove with components |
| `.section-head`, `.text-caption`, `.surface-dark`, `.surface-card` | Parsed PostCSS selector inventory plus exact source search found no runtime class | High remove | remove |
| Recharts selectors | No literal JSX class because Recharts generates them at runtime; chart dependency and E2E locate them | High retain | retain as framework/runtime-discovered |
| `--chart-brand-mid`, `--chart-brand-soft`, `--chart-cursor`, `--chart-ink-soft`, `--chart-muted`, `--chart-secondary`, `--chart-tertiary` | Custom-property definition inventory and exact `var(...)`/name search found no consumer | High remove | remove |
| `--color-canvas-light`, `--color-canvas-dark` | Initial literal search found no `var(...)` consumer, but the contrast test resolves them dynamically through ``--${name}`` and requires both canvas colors | High retain | retain as test/design-system support |
| `--color-gradient-brand`, `--color-hairline-dark`, `--color-info-text`, `--color-on-dark` | Exact custom-property search found definitions (plus one historical design-audit row) but no runtime, dynamic test, or `var(...)` consumer | High remove | remove; retain dated audit evidence |
| `--radius-{xs,sm,md,xl,xxl}`, `--shadow-floating`, and post-CardAction `--shadow-surface-hover` | Exact custom-property search found no `var(...)` consumer; active `shadow-floating` is a distinct Tailwind utility | High remove | remove CSS variables only |
| Tailwind `boxShadow.card`, `boxShadow.soft`, `backgroundImage.brand-gradient`, `fontFamily.display`, `fontFamily.mono` | Exact utility-class search found no source consumer; Tailwind emits utilities only when content references them | High remove | remove unused configuration branches |
| Remaining Tailwind palette keys | They are the documented design-system palette; unused keys do not emit production CSS | Medium retain | retain as active design-system contract |

### Scanner export/type candidates

The private application has no published package export map. Its feature
barrels are nevertheless deliberate internal boundaries enforced by the
architecture guard. Unused re-exports can be removed, while declarations
needed inside a module remain private and active.

| Path / symbols | Evidence and compatibility check | Disposition |
| --- | --- | --- |
| `src/features/strategy/server.ts`: scanner-listed functions, schemas, and types | No external package; exact consumers retain only current route/page imports. Underlying feature modules remain active. | remove unused re-exports; retain active server surface |
| `src/features/strategy/index.ts`: scanner-listed constants, calculations, reporting helpers, and types | Cross-feature imports must use this barrel, but exact current imports define the supported surface. | remove unused re-exports; retain active strategy surface |
| `src/features/catalog/server.ts`: `countKPIDependents`, `deleteCategory`, `deleteKPI` | Used internally by current transactional retirement/deletion path. | make private, retain active behavior |
| `src/features/auth/server.ts:BYPASS_USER_ID`, `src/features/users/server.ts:hashPassword`, `scripts/security-tooling.mjs:repositoryRoot` | Exact searches show module-internal use only. | remove export modifier; retain active behavior |
| `src/lib/api-client.ts:{CSRF_HEADER,CSRF_COOKIE_NAME,readCsrfToken}`, `src/lib/request-guard.ts:{CSRF_HEADER,CSRF_COOKIE_NAME,canonicalOrigins}`, `src/lib/session.ts:getBypassUser` | Module-internal use only; public callers use `apiFetch`, mutation guards, and session gates. | remove export modifier; retain active behavior |
| `src/lib/auth-regression-helpers.ts` scanner list | Test-only helper surface and data-driven 28-route auth contract. | retain as test support; trim only exports with no test consumer |
| `src/components/strategic-data-entry-model.ts` scanner constants/types | Adapter uses active shared strategy types; redundant local exports have no external consumer. | remove unused local exports, retain module behavior |
| `src/features/strategy/data-entry-server.ts:dataEntryLoadFailure` | Used only in its module. | make private |
| `src/features/exports/dom-capture.ts` raster limit constants | Used by the active capture implementation/tests inside the module. | make private |
| `src/features/metrics/period-rules.ts:FIRST_MONTH` and metrics-barrel scanner entries | Period constants/functions remain active internally; barrel exposes only current consumers. | make local constant private and trim unused barrel re-exports |
| `src/features/strategy/{calculations,mutations,queries,validation,value-entry}.ts` scanner-listed exports/types | Most are active within the feature or re-exported through public surfaces; exact current cross-file imports determine which export modifiers are required. Duplicate validation aliases are compatibility remnants with no consumer. | remove unused aliases/re-exports; make module-internal symbols private; retain active declarations |
| `src/components/ui/{ExportCSVButton,csv-helpers}.ts(x)` scanner helpers | Helpers are active inside CSV construction and targeted tests; no published component package. | make module-internal helpers private where tests do not import; retain CSV behavior |
| Component/report/strategy model types listed by Knip | Exact symbol search distinguishes internal annotations from unreferenced declarations. | make active internal types private; delete only declarations with zero references |
| `src/features/catalog/index.ts` and other feature barrels | Repository architecture treats barrels as supported cross-feature surfaces, but unused entries have no current consumer. | trim to current consumers; retain boundary files |

### Retained compatibility and historical candidates

- All SQLite tables, schema fields, indexes, migrations, legacy archive reads,
  effective-dated configuration logic, reconciliation, and rollback notes.
- Dynamic PNG/PDF dependencies and DOM/export selectors.
- Security audit fixtures/reports and performance traces as intentionally
  versioned historical evidence.
- Test-only auth, migration, e2e database, and security workflow helpers.
- All environment variables read by runtime, scripts, Playwright, Docker/Fly,
  or documented operator flows. No dead environment branch was confirmed.
- `allowScripts` lockfile/native-package entries: installation policy, not
  application imports.
- Next.js route/loading/error/layout modules and Recharts-generated selectors.

No uncertain candidate will be removed. Any candidate contradicted by build,
test, runtime, deployment, stored-data, or documented compatibility evidence
is retained under one of the dispositions above.

## Implemented coherent removals

The cleanup removes one unused production dependency (`date-fns`), one
unreferenced logo asset, two redundant package-script aliases, nine dead
source/test files, obsolete CSS and Tailwind configuration, legacy-only type
declarations, unconsumed catalog reads, duplicate schema aliases, and unused
barrel exports. Active internal declarations were made private instead of
being deleted when their module still consumes them.

Deleted files:

- `public/logos/eastern-state-logo.png`;
- `src/components/strategic-history-model.ts` and its test;
- `src/components/ui/CardAction.tsx`;
- `src/components/ui/ProgressToTarget.tsx`;
- `src/components/ui/Tabs.tsx`;
- `src/components/ui/progress-to-target-model.ts` and its test;
- `src/features/reporting/goal-selection.ts` and its test.

No replacement abstraction, package, route, database table, migration, or
compatibility adapter was added. Historical documents still describe dated
implementation states; they were not rewritten to erase project history.

## Final analyzer disposition

The normal Knip scan now reports only six reviewed exceptions:

- `scripts/ensure-seeded.mjs`, reached by the Docker production start chain;
- `scripts/smoke-catalog.ts`, invoked by path from the shell smoke harness;
- `security-audit/D8AD-CAN-004/fixtures/set_admin_password.mjs`, retained by
  the versioned security reproduction;
- `updateMeasurementConfigurationStatus`, `getStrategicGoalBySlug`, and
  `StrategyObservationWriteSchema` from the strategy server facade, consumed
  by integration/contract tests rather than production entries.

Knip production mode deliberately excludes test and package-script roots, so
its larger list is not deletion proof for this application. Depcheck reports
no unused production dependency; its three development findings are the
configuration-driven `autoprefixer`, `postcss`, and
`eslint-import-resolver-typescript`. Madge resolves 247 source modules and 657
static edges with no cycles, down from 256 modules and 676 edges. `ts-prune`
remains a secondary signal because it cannot distinguish Next.js entries,
barrel contracts, and test-only exports reliably enough to be a gate.

Knip was not added to CI. Promoting it to a blocking gate would first require
explicit configuration for filesystem entries, shell/runtime paths, and the
test-only server facade; otherwise the repository would institutionalize
known false positives.

## Before and after

| Measure | Baseline | Final | Change |
| --- | ---: | ---: | ---: |
| Tracked files | 416 | 407 | -9 |
| Tracked bytes | 12,485,816 | 12,430,437 | -55,379 |
| `src/` files | 256 | 247 | -9 |
| TypeScript/TSX source files | 253 | 244 | -9 |
| Source lines (`src/**/*.ts(x)`) | 62,937 | 61,612 | -1,325 |
| Tracked code lines (TS/TSX/JS/MJS/shell) | 67,910 | 66,571 | -1,339 |
| Test files | 82 | 79 | -3 |
| Public assets | 9 | 8 | -1 |
| Script files | 28 | 28 | 0 |
| Workflow files | 5 | 5 | 0 |
| Package scripts | 30 | 28 | -2 |
| Production dependencies | 12 | 11 | -1 |
| Development dependencies | 18 | 18 | 0 |
| Madge modules / edges | 256 / 676 | 247 / 657 | -9 / -19 |

The clean production-image build also shrank without changing its route map:

| Build measure | Baseline | Final | Change |
| --- | ---: | ---: | ---: |
| `.next` files | 306 | 297 | -9 |
| `.next` disk use | 298,816 KiB | 257,452 KiB | -41,364 KiB |
| Static chunk bytes | 2,666,237 | 2,656,300 | -9,937 |
| Server output bytes | 4,294,904 | 4,240,189 | -54,715 |

The unit count changed from 81 files / 1,204 tests to 78 files / 1,187 tests.
All 17 removed tests belonged to the three deleted closed subtrees; no active
behavior lost coverage. The reporting-cycle coverage contract remains 100%
for statements, lines, and functions and 97.05% for branches.

## Final validation receipt

| Check | Final result |
| --- | --- |
| `npm ci` | 503 packages installed; 504 audited; zero npm vulnerabilities |
| `npm test` | 78 files / 1,187 tests passed |
| `npm run test:coverage` | 1,187 tests passed; reporting-cycle threshold unchanged |
| `npm run design-system:test` | All guards, type generation, TypeScript, and production build passed |
| `npm run lint` | Passed with the complete prelint guard chain |
| `npm run test:e2e` | 11/11 credentialed Chrome workflows passed |
| D8AD-CAN-008 gate | 51 smoke assertions and injection side-effect checks passed |
| Knip / Depcheck / Madge | Only documented exceptions; no unused production dependency; no cycle |
| `npm run security:scan` | OSV, Gitleaks, and Semgrep passed with zero findings |
| Production Docker build | Exact root `Dockerfile` built successfully |
| Production container smoke | 53/53 authenticated checks passed against the built image |
| Manual production browser | Login, overview/drill-down, save, Trends, Activity, exports, mobile nav, keyboard focus, empty/missing states, and removed-route 404 passed |
| `git diff --check` | Passed |

The repository security gate scanned 594 lockfile packages with no OSV issue,
109 commits / 17.15 MB with no Gitleaks leak, and 269 targets with 13 Semgrep
rules and zero findings. An independent Codex Security diff scan reviewed all
53 source-like changed or deleted files, including full-file context for
deleted paths, and completed with zero candidates, deferred items, or findings.

The manual browser pass used an auth-enabled production server and a disposable
SQLite database. A percentage result was saved through the normal Data Entry
form, appeared as `90%` in Trends, and appeared in Setup Activity under the
authenticated admin. The downloaded trend CSV contained that value; the Board
Report PNG was a valid 788 x 29,939 image and the PDF was a valid 60-page PDF.
Setup also created and edited a disposable monthly measure, changing its unit
and owner through the normal measure form. That addition exposed January
through December in Data Entry and Reports; the January Board Report rendered
the measure, and Trends compared the saved January values of 100 in 2026 and
120 in 2027 across the five-year table and chart. Strategic result deletion is
not exposed as a browser control in the current product boundary; its supported
canonical API save/delete path and immutable tombstone were exercised by both
the 53-check container smoke and the acceptance suite.
At 390 x 844, the navigation drawer exposed exactly Overview, Reports, Data
Entry, and Setup. Keyboard Tab focused the skip link and Enter moved focus to
`main-content`. Active routes emitted no console errors; the only warnings were
the existing Galano font-preload timing notices. The removed `/admin` surface
returned the expected 404.

## Compatibility and retained risk

- Schema versions 9, 10, and 11, all 19 SQLite tables, legacy archive reads,
  migration reconciliation, and deletion/audit contracts are unchanged.
- Next.js filesystem entries, npm lifecycle hooks, Docker/Fly entry points,
  dynamic export imports, Recharts runtime selectors, legal font assets, and
  security evidence remain intact.
- The dynamically referenced canvas colors were restored after the contrast
  test contradicted the initial literal-search candidate. This is the expected
  audit behavior: runtime evidence overrides scanner output.
- The remaining Knip and Depcheck findings are documented reachability gaps,
  not uncertain deletions. No lower-confidence candidate was removed.
- Existing npm peer-range warnings between ESLint 10 and plugins bundled by
  `eslint-config-next` are unchanged and do not belong in this cleanup.

Later work can configure Knip as an informational repository script, resolve
the font-preload timing warning, or revisit the three test-only strategy facade
exports if the contract-test boundary changes. Those are separate decisions;
none is required to establish this cleanup as behavior-preserving.
