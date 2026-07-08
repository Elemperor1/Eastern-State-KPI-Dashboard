# Architecture Refactor Completion Audit

Status: complete — requirements proven
Last updated: 2026-07-08

This is the requirement-level evidence ledger for the modular-monolith objective at `/Users/jacobcyber/.codex/attachments/9dbe2c83-383b-4496-850d-9c46fd20ce8a/goal-objective.md`.

`docs/architecture-refactor-inventory.md` records incremental slices. This file
records the final evidence proving each required outcome.

## Evidence Status

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Finalized 8 categories / 52 KPIs and ordering | `scripts/seed.ts`; server-rendered catalog assertions in `scripts/smoke.sh` | Proven |
| Existing schema and valid data preserved | No refactor schema bump; DB integration suites run against current schema | Proven for refactor code; final production-data verification still required before deployment |
| Annual `month = 0` and monthly `1–12` behavior | `period-rules.test.ts`, `analytics.test.ts`, metrics integration tests, annual/monthly smoke round-trips | Proven |
| Missing months, zero values, partial current year, completed prior year | Analytics, reporting model, period-rule, and admin draft tests | Proven |
| Counts, percentages, percentage points, conversion rates, donor conversion, YoY | `analytics.test.ts`, `donor-conversion.test.ts`, category/metric reporting model tests | Proven |
| Goal CRUD, supported years, fixed baseline, annual progress, YTD pacing, full-year completion | Goals calculation/integration/validation/route tests, auth regression matrix, and Playwright create/edit/goal-bearing export/delete workflow | Proven |
| Dashboard period filters, overview, category, metric, and trend models | Reporting period/category/metric/trend tests plus live smoke page checks | Proven for model and route rendering |
| Monthly and annual breakdown editing | Metrics draft/DB/route tests; direct browser create/rename/delete verification | Proven for current workflow |
| Admin catalog, goals, users, history, and data entry | Feature view-helper tests, mutation-route tests, page smoke checks, and Playwright goal/monthly-data workflows including an error/retry path | Proven for approved workflows |
| Navigation behavior | AppShell implementation, route smoke checks, and Playwright desktop plus 390x844 mobile drawer navigation | Proven |
| CSV exports | Reporting CSV row tests and CSV serialization/formula-injection tests | Proven |
| PNG output | DOM preparation/style-restoration tests, visually inspected overview/monthly/annual/long-name artifacts, and Playwright file validation for conversion, goal-bearing metric, and ten-badge synthetic no-data views | Proven |
| PDF output | Tested clone-measured pagination; inspected three-page landscape-Letter overview; Playwright validates category/metric legacy downloads plus browser-native print PDF | Proven |
| Authentication, authorization, session revocation | Auth workflow, secrecy, regression, role, and revocation suites | Proven at integration/route level |
| Production rejects `AUTH_DISABLED=true` | `auth-flag.test.ts`, auth bypass guard, production build gate | Proven |
| CSRF protection on browser mutations | `csrf-hardening.test.ts`, route tests, CSRF-aware live smoke | Proven |
| Goals authentication regression coverage | Goals route is included in the exhaustive protected-route matrix | Proven |
| Smoke command-injection defense | D8AD-CAN-008 static and fake-server dynamic gate | Proven |
| Durable audit history after KPI/category deletion | Audit integration/e2e tests cover snapshots, LEFT JOIN behavior, tombstones, rename/delete states | Proven |
| Feature-owned data access | Production SQL is confined to feature data-access modules and narrow DB infrastructure; app/components are blocked by `architecture-boundary-guard.sh` | Proven for current source |
| No server-side self-HTTP or obsolete read adapters | API boundary inventory plus architecture guard | Proven for current source |
| Large components divided by responsibility | Admin, category, metric, trend, donor-conversion, and audit renderers have focused components; client coordinators retain only browser state, mutation orchestration, and composition | Proven by responsibility review |
| Minimal serialized client props / server-first reads | Explicit reporting operations scope category and metric rows before serialization; seeded payloads measured 82,471 and 8,684 bytes versus 273,363 for overview. ADR 0018 documents why overview and trends retain broader data for instant controls | Proven for current dashboard boundaries |
| Required ADR topics | ADR 0017 defines the feature-oriented modular monolith, ADR 0018 defines server-first/client-payload strategy, and ADR 0019 defines centralized auth enforcement; earlier ADRs retain detailed feature decisions | Proven |
| Obsolete abstractions, duplicate calculations, dead routes, compatibility paths removed | `architecture-refactor-final-audit.md` records SQL ownership, duplicate-rule review, removals, retained-path rationale, and rerunnable searches; strict TypeScript unused checks pass; the architecture guard blocks cross-feature internals and calculation-layer framework/DB imports | Proven for current source |
| Full product acceptance | 615 Vitest tests; strict typecheck; lint; design/security/architecture gates; production build; 4 Playwright workflows; real bypass smoke 56/56; auth-enabled production smoke 60/60 | Proven |

## Current Completion Blockers

None.

## Latest Boundary Proof

The forty-fifth protected slice added four serial Playwright/Chrome workflows:
goal create/edit/goal-bearing PNG/delete; monthly save failure/retry/clear;
desktop/mobile navigation; and conversion/no-data PNG plus category/metric
legacy and native print PDFs. File signatures and dimensions are validated,
temporary rows are removed, and unexpected console errors fail the suite. This
proof found and fixed a real legacy-export hydration mismatch by making the
server page own `legacy=1` parsing. Final acceptance passed 615 Vitest tests,
strict typecheck, lint, all design/security/architecture gates, production
build, 56/56 live bypass smoke checks, and 60/60 auth-enabled production smoke
checks.
