# API Boundary Inventory

Status: active
Last updated: 2026-07-07

This inventory tracks the remaining HTTP route boundaries during the feature-oriented modular monolith refactor. The policy is ADR 0003: API routes are adapters for active browser consumers, not the internal architecture boundary for business rules.

## Current Production Consumers

| Route | Current production consumer | Feature owner behind route | Current status | Removal or simplification condition |
| --- | --- | --- | --- | --- |
| `POST /api/auth/login` | `/login` browser form | `src/features/auth/server.ts`, `src/features/auth/session.ts` | Public credential entry point with throttle. | Keep unless login flow moves to a server action with equivalent throttle, session, and secrecy coverage. |
| `POST /api/auth/logout` | `LogoutButton` browser action | `src/features/auth/session.ts` | Browser session clear. | Keep unless logout moves to a server action or form action with equivalent revoked-cookie behavior. |
| `GET /api/auth/me` | `apiFetch` CSRF bootstrap and `/setup-password` session check | `src/features/auth/session.ts`, `src/lib/request-guard.ts` | Minimum auth route; intentionally outside the must-change gate. | Keep while browser CSRF bootstrap depends on the double-submit cookie from this route. |
| `POST /api/auth/change-password` | `/setup-password` browser form | `src/features/auth/server.ts`, `src/features/auth/session.ts`, `src/features/users/server.ts` | Self-service credential rotation. | Keep unless setup-password moves to an equivalent server-side mutation boundary. |
| `POST/DELETE /api/entries` | `/admin/data` browser mutation controls | `src/features/metrics/server.ts` | Auth/CSRF adapter around feature-owned entry mutations. | Replace only when admin data entry has a server-side mutation path with equivalent validation, authorization, CSRF assumptions, audit writes, and UI refresh. |
| `POST/DELETE /api/breakdowns` | `/admin/data` browser mutation controls | `src/features/metrics/server.ts` | Auth/CSRF adapter around feature-owned breakdown mutations. | Same as entries. |
| `POST/PATCH/DELETE /api/goals` | `/admin/goals` browser mutation controls | `src/features/goals` | Auth/CSRF adapter that returns refreshed `goals`, avoiding a follow-up internal GET. | Replace only after preserving goals auth regression coverage and refreshed UI behavior. |
| `POST/PATCH/DELETE /api/kpis` | `/admin/kpis` browser mutation controls | `src/features/catalog/server.ts` | Auth/CSRF adapter that returns refreshed `kpis` and `categories`, avoiding follow-up `/api/kpis` + `/api/categories` GETs. | Replace only after preserving dependent-entry 409 behavior and catalog UI refresh behavior. |
| `POST/PATCH/DELETE /api/categories` | `/admin/kpis` browser mutation controls | `src/features/catalog/server.ts` | Auth/CSRF adapter that returns refreshed `kpis` and `categories`, avoiding follow-up `/api/kpis` + `/api/categories` GETs. | Same as KPI mutations. |
| `POST/PATCH/DELETE /api/users` | `/admin/users` browser mutation controls | `src/features/users/server.ts`, `src/features/auth/session.ts` | Admin user creation/password-reset/deletion adapter that returns refreshed `users`, avoiding a follow-up internal GET. | Replace with server-side mutations only if that keeps revocation, secrecy, and UI refresh behavior intact. |
| `PATCH /api/users/account` | `/admin/users` browser role/disable controls | `src/features/users/server.ts`, `src/features/auth/session.ts` | Admin account-state mutation adapter with session revocation that returns refreshed `users`, avoiding a follow-up internal GET. | Same as user mutations, preserving self-target guard and durable session revocation tests. |

## Routes Without Current Production Browser Calls

These routes are still covered by auth regression tests and smoke/manual QA, but current server-rendered pages load their data directly through feature operations instead of calling them over HTTP:

| Route | Current usage | Candidate direction |
| --- | --- | --- |
| `GET /api/entries/history` | Smoke/QA readback; `/admin/history` page loads `listEntryHistory()` directly. | Candidate for removal after audit-history browser coverage no longer relies on the endpoint. |
| `GET /api/kpis` | Smoke/QA finalized metric assertions and auth regression matrix. Server/admin pages use `listKPIs()` directly. | Candidate for removal after smoke coverage can assert finalized metric rendering without HTTP API dependence. |
| `GET /api/categories` | Smoke/QA finalized category assertions and auth regression matrix. Server/admin pages use `listCategories()` directly. | Same as KPI reads. |

## Removed Internal Read Adapters

These routes were removed because no production browser workflow used them and the server-rendered pages already call feature operations directly:

| Removed route | Replacement path | Preservation evidence |
| --- | --- | --- |
| `GET /api/users` | `/admin/users` calls `listUsers()` from `src/features/users/server.ts`; user mutations return refreshed `users` payloads. | User mutation route tests, auth workflow/revocation tests, and the full auth regression matrix still cover user-management authorization and session revocation. |
| `GET /api/meta` | Server-rendered pages read sample-data and year options directly through feature loaders such as `loadDashboardData()` and `listAvailableYears()`. | Auth regression coverage was adjusted to the remaining protected routes; dashboard pages, typecheck, build, and smoke checks cover the user-visible metadata behavior. |
| `GET /api/entries/years` | Server-rendered dashboard controls receive available years from reporting/metrics feature loaders. | The route had no production browser or smoke consumer; auth regression coverage now targets the remaining protected route surface. |
| `GET /api/goals` | `/admin/goals` receives initial goals from the server-rendered page and mutation responses return refreshed `goals`. | Goals mutation route tests and goal feature tests still cover validation, auth, refreshed payloads, and progress behavior. |
| `GET /api/entries` | Smoke now reads created entry IDs directly from POST responses; server-rendered pages use `listEntries()` feature calls. | POST/DELETE route coverage, metrics integration tests, and live smoke still cover monthly/annual writes, deletes, audit writes, and auth-bypass behavior. |
| `GET /api/breakdowns` | Smoke now reads created breakdown IDs directly from POST responses; server-rendered pages use `listBreakdowns()` feature calls. | POST/DELETE route coverage, metrics integration tests, and live smoke still cover breakdown writes, deletes, and audit writes. |

## Guardrails

- Do not remove a route solely because server pages no longer call it.
- Before removing a route, update auth-regression coverage, smoke/QA expectations, and any browser workflow that currently uses the route.
- Server-side code must continue using feature operations directly rather than calling `/api/*`.
- Browser mutations must keep server-side authorization, validation, CSRF assumptions, and structured error handling.
