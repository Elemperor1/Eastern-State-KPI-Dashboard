# Architecture Refactor Final Audit

Status: current-state evidence
Date: 2026-07-08

This audit records the final structural searches for the modular-monolith
refactor. It complements the requirement ledger in
`docs/architecture-refactor-completion-audit.md`.

## Server And Client Boundaries

- Category pages serialize only their category; metric pages serialize only
  their KPI. Final schema-9 seeded JSON measurements are 122,406 bytes for
  overview, 15,952 for Justice Education, 1,961 for one representative metric,
  and 1,721 for the annual-only Trend Explorer.
- Overview retains the full dataset because every category card recalculates
  immediately for period changes.
- Trend Explorer retains all monthly non-breakdown series because any eligible
  KPI can be toggled without a read. The current annual-only strategic seed
  produces a 1,721-byte empty-state payload while preserving that behavior for
  future monthly KPIs.
- `listAvailableYears()` owns the distinct-year query; reporting no longer loads
  every entry merely to derive control options.
- `scripts/architecture-boundary-guard.sh` rejects server self-HTTP, client
  server-module imports, low-level DB imports from app/components, cross-feature
  internal imports, and framework/database dependencies in calculation modules.

## Data Access

Production SQL is confined to:

- `src/features/audit/server.ts`
- `src/features/auth/server.ts`
- `src/features/catalog/server.ts`
- `src/features/goals/{queries,mutations}.ts`
- `src/features/metrics/{entries,breakdowns,history,years}.ts`
- `src/features/users/server.ts`
- `src/lib/{db,app-meta}.ts`

The two `src/lib` files are narrow SQLite lifecycle/schema and application-meta
infrastructure, not a generic repository.

Canonical strategic-plan seed data lives in
`src/features/catalog/strategic-plan.ts`. `scripts/seed.ts` is a transactional
adapter over catalog, metrics, and goals feature operations; it does not own a
parallel catalog model.

## Duplicate Rules

Repository searches found no production direct `month === 0` classification
outside the metrics period-rule surface. Scalar and breakdown writes validate
KPI existence, storage type, and reporting period before mutation; breakdown
labels must remain non-empty after trimming. Percentage arithmetic remains in
separate authoritative rules with distinct meanings: KPI YoY analytics, goal
progress, category rollups, breakdown comparison, donor conversion, and trend
indexing. UI `Progress` only clamps a prepared display value.

Calculation modules pass a fitness rule that forbids React, Next.js, and
database imports.

## Removed Obsolete Paths

- Generic repository, dashboard loader, export helper, and legacy PDF lib paths.
- Unused internal read API routes and server self-HTTP paths.
- `KpiGoalWithMeta.current_value`, `goal_target`, and `progress_pct` migration
  aliases after searches confirmed no production consumer.
- The no-op `BrandMark.inverted` compatibility prop and all call-site arguments.
- Duplicate broad year derivation in reporting.
- A hardcoded current-year month list in the seed; `THROUGH_MONTH` now owns it.

`npx tsc --noEmit --noUnusedLocals --noUnusedParameters` passes after these
removals.

## Intentionally Retained Paths

- `LegacyExportPDFButton` is a current product fallback, not dead compatibility
  code. Overview uses raster PDF directly; category/metric pages expose the
  fallback with `legacy=1` while native Print/PDF remains primary. The server
  page parses this flag and passes an explicit boolean so the fallback does not
  create a hydration mismatch.
- Session handling for cookies without `issuedAt` is retained because it safely
  migrates a previously issued encrypted cookie into the durable revocation
  model. Removing it requires proof that no pre-watermark session can remain.
- Browser mutation routes remain where active client forms depend on their
  auth/CSRF/validation/error contracts. The route inventory records each
  consumer and removal condition.

## Rerunnable Evidence

```bash
npm run architecture:guard
npm run test:e2e
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
node --import tsx -e "import {STRATEGIC_PLAN_CATEGORIES as c} from './src/features/catalog/strategic-plan.ts'; console.log(c.length, c.flatMap(x => [...x.annual, ...(x.breakdown ?? [])]).length)"
rg -n "month\\s*(===|!==|==|!=)\\s*0" src --glob '*.ts' --glob '*.tsx'
rg -n "current_value|goal_target|progress_pct|loadDashboardData" src
rg -l "\\.prepare\\(|\\.exec\\(" src --glob '*.ts' --glob '!**/*.test.ts'
```
