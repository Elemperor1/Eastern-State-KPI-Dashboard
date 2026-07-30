# Operator provisioning runbook (first-run accounts)

This runbook describes how an operator provisions the first-run
bootstrap accounts **without ever writing a usable password, token, or
recovery code to stdout, stderr, application logs, deployment logs, or
CI logs** (security finding **D8AD-CAN-001**).

## What the app does automatically

On the first run against a fresh database, `ensureSeedAdmin()`
(`src/features/auth/server.ts`) creates two bootstrap accounts:

| Email                     | Role    | Env var consumed at seed time       |
| ------------------------- | ------- | ----------------------------------- |
| `zach@easternstate.org`   | admin   | `BOOTSTRAP_ADMIN_PASSWORD`          |
| `kerry@easternstate.org`  | viewer  | `BOOTSTRAP_VIEWER_PASSWORD`         |

For each account:

1. If the matching env var is **set**, the seed hashes that value into
   the account's `password_hash` (bcrypt). The operator already knows the
   plaintext because they chose it.
2. If the matching env var is **unset**, the seed generates a
   cryptographically-random password, hashes it in, and records the
   plaintext **nowhere** — not in stdout, not in stderr, not in any log.
   The account is effectively locked until the operator provisions a
   known credential with `npm run setup:admin` (below).

In **both** cases the seed emits only non-sensitive status, e.g.:

```
[seed] provisioned 2 bootstrap account(s) on first run. Each was given a temporary credential that must be rotated at first login.
[seed]   zach@easternstate.org  (admin)  credential source: BOOTSTRAP_ADMIN_PASSWORD
[seed]   kerry@easternstate.org  (viewer)  credential source: BOOTSTRAP_VIEWER_PASSWORD
```

or, for the random fallback, a non-sensitive warning naming the account
and pointing at `npm run setup:admin` — **never the password itself**.

Every bootstrap account is created with `must_change_password = 1`, so
the user is forced through `/setup-password` (login redirect + per-page
server-component redirect + `requireSession`/`requireAdmin` HTTP 403)
before reaching the dashboard. A seeded/temporary credential cannot be
used as a permanent login.

For an on-premises or other local production server, use
[`local-server-deployment.md`](local-server-deployment.md). It applies the same
credential contract to the repository's production Docker image and documents
the Zach/Kerry first-login handoff.

## Production deployment (Fly.io)

### Release security preflight

For every release, dispatch `.github/workflows/release-security.yml` from
`master` and wait for `Release container readiness` to complete successfully.
The workflow fails closed unless the dispatched SHA is still the current
default-branch head and the latest Container Security run for that exact commit
has successful `Container image / Trivy` and `Production container security`
jobs. Missing, pending, skipped, cancelled, stale, or red scan evidence is not
release-ready.

Record the exact SHA and linked Container Security run from the job summary.
Deploy only from a clean checkout whose `git rev-parse HEAD` matches that SHA.
If `master` moves, the checkout becomes dirty, or a newer exact-commit scan is
red, stop and dispatch a new release check. The workflow verifies evidence only;
it does not deploy and grants no write permission.

Secrets must be set with `fly secrets set`, **never** committed to
`fly.toml`. The `[env]` block in `fly.toml` is non-secret, version
controlled, and visible in CI/deploy logs — do not put any password
there.

```bash
# One-time, before first deploy:
fly secrets set SESSION_SECRET="$(openssl rand -hex 32)"
fly secrets set BOOTSTRAP_ADMIN_PASSWORD="$(openssl rand -base64 24)"
fly secrets set BOOTSTRAP_VIEWER_PASSWORD="$(openssl rand -base64 24)"

# Only after the exact-commit Release Security preflight is green:
fly deploy
```

The deploy runs `scripts/start-production.sh` → `scripts/ensure-seeded.mjs`.
An existing schema 9–15 database with business rows is migrated additively to
schema 16 and is never sent through the destructive seed. Schema 8 is also
additively migratable, but it is deliberately excluded from automatic boot
migration: stop writes, back it up, and run
`DATABASE_PATH=/absolute/path/to/kpi.db npm run db:migrate` explicitly. Schema
7 and older cross the intentional schema-8 catalog-replacement boundary and
require the backup/reset procedure in `docs/migration-notes.md`; do not treat
first-boot seeding as a production upgrade. `npm run db:seed` runs
automatically only for a missing or empty database that is safe to initialize;
it consumes the `BOOTSTRAP_*_PASSWORD` secrets and provisions the accounts.
`fly logs` will show only non-sensitive `[seed]`/`[migrate]` status lines —
never the plaintexts.

Manual `npm run db:seed` invocations are guarded (S053-C1): the operator must
pass `SEED_CONFIRM=<absolute resolved DATABASE_PATH>` naming the exact
database to wipe, and the script refuses `NODE_ENV=production` unless
`--force` is passed. Every committed reset leaves a
`meta.last_seed_reset_at` tombstone. The automatic first-boot path in
`ensure-seeded.mjs` passes `SEED_CONFIRM` itself after its own safety probe.

After deploy, the next step depends on how each account was initialized:

- If its `BOOTSTRAP_*_PASSWORD` secret was set **before the first database
  access**, share that operator-chosen temporary password with the user **out
  of band** (phone, verified signal, password-manager share). The user logs in,
  is redirected to `/setup-password`, and replaces it.
- If its `BOOTSTRAP_*_PASSWORD` was unset at first database access, there is no
  password to recover or share. The seed stored a random credential nowhere.
  Provision a known credential against the mounted production database with
  `npm run setup:admin` before asking that user to log in:

  ```bash
  fly ssh console --app eastern-state-kpi-dashboard
  read -r -s -p "New password: " SETUP_ADMIN_PASSWORD; echo
  export SETUP_ADMIN_PASSWORD
  SETUP_ADMIN_EMAIL="zach@easternstate.org" \
    node node_modules/tsx/dist/cli.mjs scripts/setup-admin.ts
  unset SETUP_ADMIN_PASSWORD
  exit
  ```

  The `read -s` prompt keeps the plaintext out of the command line, terminal
  echo, and shell history. Repeat inside a fresh console for
  `kerry@easternstate.org` if the viewer secret was also unset. Because
  `setup:admin` clears `must_change_password`, treat this as the user's
  permanent credential or issue a temporary replacement later through
  Setup → People. Share it only out of band.

### Reverse proxy and client-IP trust (`TRUST_PROXY`)

`fly.toml` sets `TRUST_PROXY = "true"` because Fly terminates TLS and
forwards requests. Only the login throttle reads the real client IP from
Fly's `fly-client-ip` header, then `x-forwarded-for` / `x-real-ip`; the CSRF
guard validates request origins and uses `APP_CANONICAL_ORIGIN` in production.
Keep `TRUST_PROXY=true` behind Fly (or any sanitizing reverse proxy you
control). When it is unset, every client collapses into a single `unknown`
throttle bucket — a deliberate fail-closed default against header spoofing,
but one shared lockout counter for all users. Never set `TRUST_PROXY=true`
when the app is directly internet-facing without a proxy that strips
client-supplied forwarded headers: an attacker could then rotate
`X-Forwarded-For` to evade the login throttle. See
`docs/csrf-hardening.md`.

## Operator recovery / provisioning a known credential

If a bootstrap account was created with the random fallback (no
`BOOTSTRAP_*_PASSWORD`), or an operator needs to (re)set a known
password on any bootstrap account, use the operator-only command:

```bash
SETUP_ADMIN_PASSWORD="<choose-a-strong-password>" \
  SETUP_ADMIN_EMAIL="zach@easternstate.org" \
  npm run setup:admin
```

- `SETUP_ADMIN_PASSWORD` is **required** and must be ≥ 8 chars. It is read
  from the environment only — **never** from a command-line argument — so
  it cannot leak through shell history, `ps`, or CI logs.
- `SETUP_ADMIN_EMAIL` defaults to `zach@easternstate.org`; set it to
  target the viewer (`kerry@easternstate.org`) or another bootstrap account.
- The command sets the password and **clears** `must_change_password`
  (the operator chose this password, so it is treated as permanent, not
  temporary). If you instead want the user to rotate it at next login, use
  Setup → People, which sets a temporary
  password and keeps `must_change_password = 1`.
- If the named account **does not exist** and the database has no active
  administrator, the command CREATES it as an active admin with the
  operator-chosen password — this is the automatic recovery path for a
  database with no usable administrator (the last-active-administrator
  guard makes that state unreachable through the UI, but databases modified
  out-of-band can still land there). The internal
  `auth-disabled@local` bypass row does not count as a usable administrator.
  If an active administrator already exists, create the account through
  Setup → People. An exceptional operator break-glass creation requires
  `SETUP_ADMIN_CREATE_CONFIRM` to exactly match the normalized
  `SETUP_ADMIN_EMAIL`; this explicit confirmation prevents a typo from
  silently creating another active administrator. If the account exists
  but is disabled, the command re-enables it.
- Password maxima are measured as UTF-8 bytes. The shared resource ceiling
  is 256 bytes; bcrypt's documented 72-byte effective-prefix behavior is a
  separate accepted primitive and is not represented as a character count.
  The same shared policy applies to `BOOTSTRAP_*_PASSWORD`, login
  verification, self-service changes, Admin create/reset, and
  `SETUP_ADMIN_PASSWORD`.
- Output is non-sensitive only:

  ```
  [setup:admin] password updated for zach@easternstate.org (admin); must_change_password cleared. The account is ready for login.
  [setup:admin] reminder: share credentials out-of-band, never by email/log.
  ```

## Account lifecycle guardrails (schema 15)

- **Every account lifecycle change is audited.** Creation, admin password
  resets, self-service password changes, role changes, disable/enable, and
  deletion each write one immutable row to `user_lifecycle_audit_events` in
  the same transaction as the change, with subject and actor snapshots.
  Events never contain password hashes or credentials.
- **The last active administrator cannot be removed.** Role changes away
  from admin, disables, and deletions targeting the last active admin are
  refused (HTTP 409), and an admin cannot delete their own account at all
  (HTTP 400). The check runs inside the mutation transaction.
- **Admin-created users rotate at first login.** Accounts created in
  Setup → People are issued a temporary credential with
  `must_change_password = 1`, exactly like an admin-issued reset; share the
  initial password out-of-band.

## Retries and partial failures (determinism)

Bootstrap account creation is wrapped in a single database transaction.
If the seed runs again (e.g. a crashed deploy retried), the count check
sees the accounts already exist and skips re-provisioning, so:

- Credentials are **not regenerated** on retry — the existing hashes stay.
- A partial failure (one account created, the second failing) rolls back
  **both** accounts, so the count never sits at 1 with an inconsistent
  half-provisioned state. The next run re-provisions atomically.
- The env-var path is fully deterministic across retries: the same
  `BOOTSTRAP_*_PASSWORD` produces the same hash every time, so a retry
  never hands the user a different credential than the one the operator
  shared.

## What is never logged

The following are guaranteed absent from stdout/stderr/process logs and
are asserted by automated tests in `src/lib/auth-secrecy.test.ts`
(in-process spies + end-to-end child-process capture of `npm run db:seed`
and `npm run setup:admin`):

- The `BOOTSTRAP_*_PASSWORD` plaintext.
- The `SETUP_ADMIN_PASSWORD` plaintext.
- Any random fallback password generated by the seed.
- Any bcrypt hash (which could be cracked offline).

Status messages contain only emails, role names, env-var names, and prose.

## Migration from the old flow

Before this fix, `ensureSeedAdmin()` logged the bootstrap admin password
to stdout and operators read it from the startup log. That flow is gone.
If you previously relied on it:

1. Set `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_VIEWER_PASSWORD` as Fly
   secrets (above) and redeploy, **or** leave them unset and use
   `npm run setup:admin` to provision known credentials after first boot.
2. Existing seeded accounts are unaffected — the migration only changes
   how *new* first-run accounts are provisioned. To force rotation on an
   existing account, an admin can use the "Reset password" UI at
   Setup → People, which issues a temporary password and re-arms
   `must_change_password`.

## AUTH_DISABLED — exact safe-use conditions (D8AD-CAN-002)

`AUTH_DISABLED=true` grants **anonymous admin access** (the
`auth-disabled@local` bypass user). It is a local-development convenience
only. The flag is enforced by `src/lib/auth-flag.ts` at module load and
by `next.config.mjs` at build time. The bypass is permitted **only when
all** of the following are true:

1. **`NODE_ENV=development`.** In `production` or `test`, `auth-flag.ts`
   forces the constant to `false` and **throws when the module loads** if the flag
   is set. (`vitest` runs with `NODE_ENV=test`, so the test suite itself
   guards against an accidentally-bypassed test run.)

2. **The server is bound exclusively to a loopback address.** The
   declared bind host (`BIND_HOST`) must be one of `127.0.0.1`, `::1`,
   or `localhost`. A non-loopback or unset bind (`0.0.0.0`, a LAN IP,
   etc.) with the flag set **throws when the module loads**. Next.js may
   defer that module load until the first app-route request. `npm run dev`
   (`scripts/dev.sh`) sets `BIND_HOST=127.0.0.1` and binds `next dev -H
   127.0.0.1` automatically when `AUTH_DISABLED` is set, so the common
   workflow needs no extra configuration.

3. **Not a production build.** `next build` inlines
   `process.env.NODE_ENV` to `"production"` in the server bundle, so
   `AUTH_DISABLED` is dead-stripped to `false` regardless of runtime env
   vars. `next.config.mjs` additionally **refuses to build** if
   `AUTH_DISABLED` is set during a production build, and the runtime
   throw fires if a production build is ever started with the flag set.

### What is NOT trusted

- **Request `Host` / `X-Forwarded-For` headers are never consulted** to
  enable or broaden the bypass. `AUTH_DISABLED` is a module-load
  constant, not a per-request decision, so spoofed headers cannot turn
  it on or override the loopback requirement. (`TRUST_PROXY`/`XFF`
  affect client-IP attribution for throttling only — never the bypass.)

### dev.sh .env parsing (AUTH-002 note)

`npm run dev` (`scripts/dev.sh`) re-reads the `.env*` files in bash so the
`BIND_HOST` decision matches what `auth-flag.ts` will later see inside
Node. The two parsers are intentionally conservative but not identical:
the bash side checks `.env.local`, `.env.development.local`,
`.env.development`, then `.env` and accepts the first truthy value, while
Next.js applies its own precedence (`.env.development.local` highest), and
the bash side strips only one pair of surrounding double quotes, so a
single-quoted value stays quoted and is therefore treated as truthy unless
it is literally `false`/`0`/`off`/`no`. Every mismatch direction fails
closed: if bash detects the bypass but Node does not, the server binds
loopback with no bypass active (harmless); if Node detects the bypass but
bash did not, `auth-flag.ts` throws when the module loads because the bind is
non-loopback. No drift case can produce a bypass listening on a
non-loopback interface.

### Safe local workflow

```bash
# Bypass on, loopback only (recommended dev default):
AUTH_DISABLED=true npm run dev      # → http://127.0.0.1:3000

# Bypass off, normal login (LAN-accessible for device testing):
npm run dev                          # binds 0.0.0.0, no bypass
```

A conspicuous `⚠ AUTH_DISABLED IS ON` warning is printed to stderr at
startup. It contains **no secrets** — only the (public) bind host and
the bypass state.

### What will fail (by design)

| Configuration                                               | Result            |
| ----------------------------------------------------------- | ----------------- |
| `AUTH_DISABLED=true` + `NODE_ENV=production` or `test`      | module-load refusal |
| `AUTH_DISABLED=true` + `NODE_ENV=development` + non-loopback `BIND_HOST` | module-load refusal |
| `AUTH_DISABLED=true` + `next build`                          | build-time throw  |
| `AUTH_DISABLED=true` in `fly.toml` / `Dockerfile` / `start-production.sh` | `auth-bypass-guard.sh` fails CI |

`scripts/auth-bypass-guard.sh` (run by `npm run design-system:test`)
asserts that no supported deployment configuration can enable the
bypass, so a regression that bakes `AUTH_DISABLED` into a deploy config
fails the gate before it ships.
