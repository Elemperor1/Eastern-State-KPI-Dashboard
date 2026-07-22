# ADR 0019: Authentication And Authorization Enforcement

Status: accepted
Date: 2026-07-08

## Context

Authentication behavior spans pages, route handlers, session cookies, account
rows, CSRF checks, bootstrap credentials, and the development-only bypass.
Scattering policy across individual forms would make a refactor likely to omit
a gate or weaken durable session revocation.

## Decision

`src/features/auth/session.ts` is the application-facing authentication and
authorization surface. Its low-level implementation remains in
`src/lib/session.ts`.

- Protected server pages call `getCurrentUserReadOnly()`, redirect unauthenticated
  users to `/login`, and redirect `must_change_password` users to
  `/setup-password`.
- Protected route mutations call `requireSession()` or `requireAdmin()` before
  processing input. Authorization is always server-side; hidden client controls
  are presentation only.
- Board accounts use the durable `board` role. Reporting loaders apply the
  persisted schema-14 Board visibility scope before calculating Overview,
  Board Report, Trends, priority, metric, or export models. Admins edit that
  scope in Setup → Goals.
- `requireStaffSession()` protects authenticated configuration reads that are
  valid for staff viewers but outside the Board reporting contract.
- `getCurrentUser()` and `getCurrentUserReadOnly()` re-read the user by stable id
  and reject deleted, disabled, or watermark-revoked sessions.
- Protected JSON routes use `authErrorResponse()` for consistent 401/403
  responses.
- Browser mutations pass `assertMutationRequest()` after authorization for
  same-origin, JSON content-type, and double-submit CSRF enforcement.
- Credential verification and bootstrap policy remain in
  `src/features/auth/server.ts`; account-row operations remain in
  `src/features/users/server.ts`.
- `AUTH_DISABLED` is allowed only in development on an explicitly declared
  loopback bind. Production/test configuration fails closed, and deployment
  guards reject the flag.

Public login and minimum session-maintenance routes are explicit exceptions to
the normal protected-route matrix and are documented beside that matrix.
Goals mutations are included in the exhaustive auth regression route table.

## Alternatives Considered

- Let each page or route implement cookie and role checks directly. This would
  duplicate policy and make omissions difficult to detect.
- Trust client-side role visibility. A user can bypass client rendering, so
  this is not authorization.
- Cache the cookie's user/role without a DB read. That would break durable
  password, role, disable, and deletion revocation.
- Make the development bypass request-header based. Proxy headers are
  attacker-controlled; the bypass instead depends on process mode and declared
  loopback binding.
- Merge credential, account, cookie, and CSRF mechanics into one auth service.
  They have distinct responsibilities and tests; one large service would be
  harder to audit.

## Consequences

- Security-sensitive entry points have one approved set of gates.
- Session revocation remains durable across password, role, disable, and delete
  changes.
- Route adapters can be removed or replaced without moving auth policy into
  client code.
- Any new protected mutation must update the auth regression route inventory
  and preserve CSRF enforcement.
- Changes to bypass or cookie mechanics must pass production build guards,
  auth regression, secrecy, revocation, and live auth-enabled verification.
