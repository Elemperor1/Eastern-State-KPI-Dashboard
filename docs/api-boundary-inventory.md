# API Boundary Inventory

Status: active
Last updated: 2026-07-22

ADR 0022 is authoritative. API handlers are browser adapters around feature
operations; server-rendered pages call feature operations directly.

## Current production consumers

| Route family | Product consumer | Gate | Owner |
| --- | --- | --- | --- |
| `/api/auth/{login,logout,me,change-password}` | Login, logout, CSRF bootstrap, password setup | public or current-session policy | `src/features/auth`, `src/lib/request-guard.ts` |
| `/api/health/ready` | Minimal process-to-SQLite production readiness | public, read-only, constant-shape response | `src/features/health/readiness.ts` |
| `/api/strategy/{observations,component-entries,distributions}` | Data Entry | Admin + CSRF for mutations | `src/features/strategy` |
| `/api/strategy/{configurations,components,targets,goals,memberships}` | Setup → Measures/Goals | Admin + CSRF | `src/features/strategy` |
| `/api/strategy/board-reporting` | Setup → Goals → Board visibility | Admin + CSRF | `src/features/board-reporting` |
| `/api/strategy/distribution-bands` | Data Entry and Setup | staff-session read; Admin + CSRF mutation | `src/features/strategy` |
| `/api/strategy/export` | Reports → Board Report CSV/JSON | session | `src/features/reporting` |
| `/api/{categories,kpis}` | Setup → Measures | Admin + CSRF mutation | `src/features/catalog` |
| `/api/users` and `/api/users/account` | Setup → People | Admin + CSRF mutation | `src/features/users`, `src/features/auth/session.ts` |

The exhaustive regression matrix has 29 route/method combinations: 27 require
Admin, the distribution-band read requires a staff session, and the export read
accepts any valid session before applying the persisted Board scope.

## Removed production boundaries

`/api/entries`, `/api/breakdowns`, and `/api/goals` are removed. No redirect or
compatibility mutation adapter remains. Their SQLite rows and immutable
`entry_history` records are retained as a read-only historical archive.
Current values use strategic observations, component entries, and
distributions. Multi-input forms send one atomic batch payload through the
existing observations boundary. Current target/configuration changes use
strategic configuration routes.

The former internal read adapters (`GET /api/users`, catalog reads, legacy value
reads, years, and history) remain removed. Server pages use feature-owned read
operations and mutation responses return the refreshed data needed by clients.

## Guardrails

- Do not reintroduce a removed legacy mutation or internal read route.
- Keep authorization before CSRF validation on every protected mutation.
- Keep Zod validation and structured error responses at HTTP boundaries.
- Server code must not call this application's own API routes.
- Update `PROTECTED_API_ROUTES`, smoke, e2e, QA, and this inventory together.
- Run `npm run architecture:guard`, `npm test`, `npm run test:e2e`, and the
  credentialed smoke before release.
