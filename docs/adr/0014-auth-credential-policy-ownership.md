# ADR 0014: Auth Credential Policy Ownership

Status: accepted
Date: 2026-07-07

## Context

Authentication behavior spans two different concerns.

Credential policy and bootstrap provisioning are product/security rules: reserved login identifiers, credential verification, first-run bootstrap account creation, and the development bypass row. Session cookies, the `AUTH_DISABLED` production guard, and CSRF request validation are framework and request-boundary concerns.

Before this decision, credential verification and bootstrap/bypass policy lived in `src/lib/auth.ts`. The user account data-access slice already moved account-row reads and writes into `src/features/users/server.ts`, leaving credential policy as the remaining auth business rule outside a feature-owned surface.

## Decision

Credential verification and bootstrap/bypass auth policy are owned by `src/features/auth/server.ts`.

That feature surface owns:

- `BYPASS_USER_EMAIL` and `BYPASS_USER_ID`
- reserved-email rejection for login credentials
- `verifyCredentials`
- bootstrap password sourcing
- bypass hash rotation
- `ensureSeedAdmin`

The auth feature calls `src/features/users/server.ts` for account-row reads and writes. It does not own admin user management or durable session revalidation.

`src/features/auth/session.ts` is the app-facing auth/session surface. `src/lib/session.ts` remains the low-level session/cookie implementation. `src/lib/auth-flag.ts` remains the `AUTH_DISABLED` environment guard. `src/lib/request-guard.ts` remains the CSRF and mutation request guard.

The obsolete `src/lib/auth.ts` module was removed so there is one import path for credential and bootstrap policy.

## Alternatives Considered

- Leave credential policy in `src/lib/auth.ts`. This preserved behavior but kept auth business rules in a generic library module after user account data access had become feature-owned.
- Move `src/lib/session.ts`, `src/lib/auth-flag.ts`, and `src/lib/request-guard.ts` in the same slice. That would combine credential policy, Next.js cookie handling, environment startup guards, CSRF bootstrap, and every protected-route regression in one larger change.
- Keep a compatibility wrapper at `src/lib/auth.ts`. That would reduce import churn but keep two apparent ownership paths for a security-sensitive module.

## Consequences

- Login, setup, seed, page, session, and auth tests import credential policy from `src/features/auth/server.ts`.
- Bootstrap secrecy, reserved-email rejection, bypass hash rotation, and durable session behavior remain covered by the existing auth regression suite.
- Future auth slices can decide whether session/cookie infrastructure should stay implemented in `src/lib/session.ts` without also relocating credential policy or changing app import paths.
