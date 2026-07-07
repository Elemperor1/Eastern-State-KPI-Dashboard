# ADR 0013: User Account Data Ownership

Status: accepted
Date: 2026-07-07

## Context

User account rows support several security-sensitive behaviors: login credential verification, first-run bootstrap provisioning, the AUTH_DISABLED bypass row, admin user management, password rotation, role changes, disable/enable, deletion, and durable session revocation through `sessions_valid_after`.

Before this decision, account row data access lived in `src/lib/auth.ts` alongside credential verification and bypass provisioning. That preserved behavior, but it made admin user management look like a generic auth helper instead of a feature-owned account-management surface. It also forced `/admin/users`, `/api/users`, `/api/users/account`, session revalidation, setup-password, operator setup, and auth tests to share one broad auth module for distinct responsibilities.

## Decision

DB-backed account-row reads and writes are owned by `src/features/users/server.ts`.

The users feature exposes:

- user lookup by email and id
- credential-record lookup for login verification
- user listing for admin management
- user creation and deletion
- password update with `must_change_password` control
- role update with revocation-watermark bump
- disable/enable with revocation-watermark bump

`src/features/auth/server.ts` keeps credential policy and bootstrap/bypass ownership: reserved-email rejection, `verifyCredentials`, bootstrap password sourcing, bypass hash rotation, and `ensureSeedAdmin`. It calls the users feature for account-row operations. `src/lib/session.ts` calls the users feature for the live id-keyed revalidation required by durable session revocation.

Admin user API routes remain thin adapters. They still enforce `requireAdmin`, `assertMutationRequest`, zod validation, self-target guards, and the existing refreshed `users` response payloads.

## Alternatives Considered

- Move all authentication and session logic into a new auth feature in one slice. That is likely a future simplification, but doing it together with account-row extraction would combine login, session cookies, AUTH_DISABLED, CSRF bootstrap, and admin user management in one higher-risk change.
- Keep compatibility re-exports from `src/lib/auth.ts`. That would leave two import paths for account mutations and make the new ownership boundary less trustworthy.
- Leave user data access in `src/lib/auth.ts`. This would keep the working implementation, but it would preserve a broad mixed-purpose module for both credential policy and admin account management.

## Consequences

- Admin user pages and routes now use the user feature surface for account data.
- Credential verification and bootstrap/bypass policy remain centralized in auth.
- Session revalidation still uses stable user ids and the live DB row on every protected request.
- Durable revocation tests, auth workflow tests, bootstrap secrecy tests, and CSRF tests cover the split.
