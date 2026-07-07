# ADR 0015: Auth Session Public Surface

Status: accepted
Date: 2026-07-07

## Context

The dashboard has one approved authentication and authorization path: DB-backed session revalidation, `requireSession`, `requireAdmin`, and uniform JSON auth errors for protected API routes.

After credential verification moved into `src/features/auth/server.ts`, app routes and server pages still imported those session gates directly from `src/lib/session.ts`. That made product code depend on a low-level module whose real job is Next.js `cookies()` and iron-session plumbing.

## Decision

Pages, route handlers, and auth regression tests import the app-facing session and authorization surface from `src/features/auth/session.ts`.

That surface exports:

- `getSession`
- `getCurrentUser`
- `getCurrentUserReadOnly`
- `requireSession`
- `requireAdmin`
- `AuthError`
- `authErrorResponse`
- `SessionData`

`src/lib/session.ts` remains the implementation detail for `cookies()`, iron-session options, `AUTH_DISABLED` bypass session behavior, DB-backed revocation checks, and cookie save/destroy mechanics.

## Alternatives Considered

- Keep importing from `src/lib/session.ts` everywhere. This worked, but it kept a low-level infrastructure module as the visible product authorization boundary.
- Move the full implementation into `src/features/auth/session.ts` in one slice. That would reduce one file, but it would mix a public dependency-path change with cookie/session implementation movement and increase risk around revoked-cookie cleanup.
- Add a wrapper but keep both paths in app code. That would create two public auth surfaces and make future protected-route audits noisier.

## Consequences

- App routes, server pages, and auth tests have one feature-owned auth/session import path.
- The cookie implementation can stay isolated until there is a concrete reason to move it.
- Protected-route audits can search for `src/features/auth/session.ts` imports instead of treating every `src/lib/session.ts` import as product code.
- Future changes to session mechanics must preserve the existing auth regression suite, CSRF bootstrap route behavior, and live smoke path.
