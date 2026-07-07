# ADR 0003: API Boundary Policy

Status: accepted
Date: 2026-07-07

## Context

The dashboard is a single Next.js application, not a platform with independent API consumers. The refactor objective explicitly says an HTTP boundary is not required between parts of the same application, and business logic should live in feature-owned operations rather than route handlers.

At the same time, some interactive admin screens currently use existing API routes for browser mutations. Those routes already carry the approved `requireAdmin` authorization path and shared CSRF request guard.

## Decision

Existing API routes may remain while current client components still use them, but they are adapters around feature-owned operations, not the owner of business rules.

For goals, `src/app/api/goals/route.ts` now exists only as a browser mutation adapter. It delegates validation, query-param normalization, calculations, and writes to the public `src/features/goals` surface. Successful POST/PATCH/DELETE responses return the refreshed `listGoals({ throughMonth, year })` payload for the same query params, allowing `src/app/admin/goals/GoalsManagerClient.tsx` to avoid a second internal GET after each mutation. The unused `GET /api/goals` read adapter was removed after confirming the server-rendered page supplies the initial goals state.

For catalog metadata, `src/app/api/kpis/route.ts` and `src/app/api/categories/route.ts` now delegate reads and writes to `src/features/catalog/server.ts`. Successful POST/PATCH/DELETE responses return refreshed `kpis` and `categories`, allowing `src/app/admin/kpis/KPIManagerClient.tsx` to avoid follow-up `/api/kpis` and `/api/categories` GETs after each mutation.

For metric entries and breakdowns, `src/app/api/entries/route.ts` and `src/app/api/breakdowns/route.ts` now exist only as browser mutation adapters. Server-rendered pages and reports read through the metrics/reporting feature loaders. Successful POST responses return the created `entry` or `breakdown`, allowing the smoke harness to verify create/delete round-trips without preserving separate `GET /api/entries` or `GET /api/breakdowns` adapters.

For user management, `src/app/api/users/route.ts` and `src/app/api/users/account/route.ts` now delegate account-row writes to `src/features/users/server.ts` while retaining the approved `requireAdmin` and CSRF route boundary. `/admin/users` reads directly through `listUsers()` on the server-rendered page. Successful POST/PATCH/DELETE/PATCH-account responses return refreshed `users`, allowing `src/app/admin/users/UserManagerClient.tsx` to avoid a follow-up `/api/users` GET after each mutation while preserving durable session revocation, self-target guards, and account-secrecy behavior. The unused `GET /api/users`, `GET /api/meta`, and `GET /api/entries/years` read adapters were removed after confirming no production browser workflow used them.

The current route inventory lives in `docs/api-boundary-inventory.md`. It separates routes with active production browser consumers from routes that remain only for smoke/QA or auth-regression coverage.

Server-side code must not call the application's own HTTP routes. Future slices may replace route-backed client mutations with server actions or other server-side handlers when that simplifies the current dashboard and preserves authentication, authorization, CSRF assumptions, validation, error handling, and tests.

## Alternatives Considered

- Preserve API routes as the primary architecture boundary. This would keep familiar browser calls but leave business behavior spread across route handlers and feature code.
- Remove the goals API route immediately and switch the admin form to server actions in the same slice. This may be the right final shape, but doing it together with feature extraction would combine authorization, CSRF assumptions, client form behavior, and route removal in one larger change.
- Keep the client's post-mutation `GET /api/goals` refresh. This preserved behavior but left an unnecessary read-after-write HTTP call for data the mutation adapter can return directly from the feature operation.
- Keep the catalog admin client's post-mutation `GET /api/kpis` and `GET /api/categories` refreshes. This preserved behavior but kept extra browser HTTP calls for data the mutation adapters can return from feature-owned reads.
- Keep the user admin client's post-mutation `GET /api/users` refresh. This preserved behavior but kept an extra browser HTTP call for data the mutation adapters can return after the approved auth/session-revocation helpers run.

## Consequences

- Route handlers should stay thin and testable.
- Feature modules become the stable internal contract; API response shapes are adapters for active browser consumers.
- Existing auth and CSRF coverage remains meaningful while route-backed client mutations still exist.
- The goals, catalog, and user-management admin clients no longer perform post-mutation read-after-write GET requests for data already available through their server mutation adapters.
- Unused internal read adapters can be removed once server-rendered pages and browser workflows are proven to use feature calls or mutation response payloads instead.
- Removing an API route later requires a usage inventory and replacement tests, not only moving code.
