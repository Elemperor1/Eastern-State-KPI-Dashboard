# Issue 42 replacement inventory

Date: 2026-07-14
Decision: ADR 0022

| Previous production surface | Disposition | Replacement |
| --- | --- | --- |
| Board Report embedded in Overview | Deleted | `/reports?view=board` |
| `/dashboard/trends` and monthly legacy trend payload | Deleted | `/reports?view=trends`, calculated from strategic observations |
| `/admin/data` | Deleted | `/data-entry` |
| `/admin/strategy-data` | Deleted | `/data-entry` |
| `/admin` hub | Deleted | `/setup` |
| `/admin/kpis` and `/admin/kpis/[id]` | Deleted as routes | `/setup?area=measures` list/detail |
| `/admin/strategic-goals` | Deleted as a route | `/setup?area=goals` |
| `/admin/configuration-gaps` | Deleted | Measures `Needs attention` filter |
| `/admin/users` | Deleted as a route | `/setup?area=people` |
| `/admin/history` | Deleted as a route | `/setup?area=activity` |
| `/admin/goals` | Deleted | Strategic Goals and Targets in Setup |
| `/api/entries` | Deleted | `/api/strategy/observations` or component/distribution mutations |
| `/api/breakdowns` | Deleted | `/api/strategy/distributions` |
| `/api/goals` | Deleted | `/api/strategy/goals`, memberships, and targets |

Legacy SQLite rows remain in place as a read-only compatibility archive. The
replacement does not silently map, delete, or reinterpret historical records.

## Acceptance reconciliation

| Issue 42 stories | Result | Evidence |
| --- | --- | --- |
| 1–4 | Complete | Narrow Overview, five priorities, bounded attention list, and deliberate priority/measure drill-downs |
| 5–11 | Complete | Board Report and Trends load only in Reports; year/period filters and CSV/PNG/PDF share the visible report truth |
| 12–28 | Complete | One reporting-cycle checklist covers atomic, multi-input, and distribution saves with durable completion, retry, attribution, and unsaved navigation protection |
| 29–37 | Complete | Setup has only Measures, Goals, People, and Activity, with one list/detail pattern, attention filters, and mobile Back-to-list focus restoration |
| 38–46 | Complete | Viewer/admin navigation is role-scoped; titles/actions use plain production language; route payloads are server-scoped; authenticated trace budgets pass |
| 47–51 | Complete | Strategic observations are the sole live reporting/write source; superseded routes, adapters, models, components, and tests were removed; every production-code phase subtracts lines |
| 52–56 | Complete | Backup/migrate/rollback guidance, unmapped archive preservation, immutable audit, auth/CSRF/revocation, and development-only diagnostics remain documented and tested |
| 57 | Complete | Labels, status announcements, dialog focus, browser-history warning, mobile list/detail focus return, and keyboard-visible controls are covered by browser/unit checks |
| 58 | Complete | Unit/coverage, CI gate, e2e, bypass smoke, credentialed smoke, and authenticated before/after performance traces all pass |

The physical legacy tables remain intentionally intact under ADR 0022 until a
separate backup-tested schema-removal migration is approved. They have no live
browser mutation or reporting path.

The former `src/features/goals/**` model and legacy metric query/mutation
services have been deleted. `scripts/legacy-seed.ts` is the sole compatibility
writer: it can populate disposable pre-strategy fixtures only during
`npm run db:seed`. Delete that helper with the physical tables after a future
schema migration proves all four gates: a named archive export, populated-copy
migration fixtures, backup restoration, and operator approval under a new ADR.

## Measured subtraction

Against `14550ae4c20173ccd453a1a54608bb1f328e7967`, production files under
`src/` (excluding test/spec files) changed by **+4,955 / −15,265 lines**, a net
reduction of **10,310 lines**. Counts use the rename-aware
`git diff --numstat -M HEAD` so relocated clients are not falsely counted
as wholly new code.

| Delivery phase | Added | Deleted | Net | What the phase owns |
| --- | ---: | ---: | ---: | --- |
| 1. Baseline and decisions | 0 | 0 | 0 | Evidence, inventory, profiler, and ADR work; no production `src/` change |
| 2. Overview and Reports | 1,254 | 6,075 | −4,821 | Narrow Overview, on-demand reports, report adapters, and deleted legacy dashboard presentation |
| 3. Data Entry | 2,033 | 3,256 | −1,223 | Reporting-cycle checklist, global unsaved guard, strategic entry model, and removed parallel entry paths |
| 4. Setup | 1,550 | 4,062 | −2,512 | Flat list/detail workspace, paged Activity, and removed standalone admin/editor routes |
| 5. Compatibility cleanup | 118 | 1,872 | −1,754 | Deleted legacy goal/metric services and tests, dead analytics, seed-only archive boundary, and final review hardening |
| **Total production `src/`** | **4,955** | **15,265** | **−10,310** | Every code-producing phase is a net subtraction |

The controlled baseline records Overview at 971,362 decoded bytes and 6,891 DOM
elements, including a hidden report. The authenticated final profile records
56,780 bytes and 229–230 elements with no Board Report present: **94.2% less
document data** and **96.7% fewer elements**.
See `docs/performance/issue-42.md` for the method and all four destinations.
