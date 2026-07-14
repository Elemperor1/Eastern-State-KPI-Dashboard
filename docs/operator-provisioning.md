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
| `kerry@easternstate.org`  | admin   | `BOOTSTRAP_ADMIN_PASSWORD`          |
| `zach@easternstate.org`   | viewer  | `BOOTSTRAP_VIEWER_PASSWORD`         |

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
[seed]   kerry@easternstate.org  (admin)  credential source: BOOTSTRAP_ADMIN_PASSWORD
[seed]   zach@easternstate.org  (viewer)  credential source: BOOTSTRAP_VIEWER_PASSWORD
```

or, for the random fallback, a non-sensitive warning naming the account
and pointing at `npm run setup:admin` — **never the password itself**.

Every bootstrap account is created with `must_change_password = 1`, so
the user is forced through `/setup-password` (login redirect + per-page
server-component redirect + `requireSession`/`requireAdmin` HTTP 403)
before reaching the dashboard. A seeded/temporary credential cannot be
used as a permanent login.

## Production deployment (Fly.io)

Secrets must be set with `fly secrets set`, **never** committed to
`fly.toml`. The `[env]` block in `fly.toml` is non-secret, version
controlled, and visible in CI/deploy logs — do not put any password
there.

```bash
# One-time, before first deploy:
fly secrets set SESSION_SECRET="$(openssl rand -hex 32)"
fly secrets set BOOTSTRAP_ADMIN_PASSWORD="$(openssl rand -base64 24)"
fly secrets set BOOTSTRAP_VIEWER_PASSWORD="$(openssl rand -base64 24)"
fly deploy
```

The deploy runs `scripts/start-production.sh` → `scripts/ensure-seeded.mjs`
→ `npm run db:seed` only when the mounted DB's schema is missing/stale;
the seed consumes the `BOOTSTRAP_*_PASSWORD` secrets and provisions the
accounts. `fly logs` will show only the non-sensitive `[seed]` status
lines above — never the plaintexts.

After deploy, share each bootstrap password with its user **out of band**
(phone, verified signal, password manager share). The user logs in,
is redirected to `/setup-password`, and replaces the temporary credential.
At that point `must_change_password` is cleared and the account is normal.

## Operator recovery / provisioning a known credential

If a bootstrap account was created with the random fallback (no
`BOOTSTRAP_*_PASSWORD`), or an operator needs to (re)set a known
password on any bootstrap account, use the operator-only command:

```bash
SETUP_ADMIN_PASSWORD="<choose-a-strong-password>" \
  SETUP_ADMIN_EMAIL="kerry@easternstate.org" \
  npm run setup:admin
```

- `SETUP_ADMIN_PASSWORD` is **required** and must be ≥ 8 chars. It is read
  from the environment only — **never** from a command-line argument — so
  it cannot leak through shell history, `ps`, or CI logs.
- `SETUP_ADMIN_EMAIL` defaults to `kerry@easternstate.org`; set it to
  target the viewer (`zach@easternstate.org`) or another bootstrap account.
- The command sets the password and **clears** `must_change_password`
  (the operator chose this password, so it is treated as permanent, not
  temporary). If you instead want the user to rotate it at next login, use
  Setup → People, which sets a temporary
  password and keeps `must_change_password = 1`.
- Output is non-sensitive only:

  ```
  [setup:admin] password updated for kerry@easternstate.org (admin); must_change_password cleared. The account is ready for login.
  [setup:admin] reminder: share credentials out-of-band, never by email/log.
  ```

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
   forces the constant to `false` and **throws at startup** if the flag
   is set. (`vitest` runs with `NODE_ENV=test`, so the test suite itself
   guards against an accidentally-bypassed test run.)

2. **The server is bound exclusively to a loopback address.** The
   declared bind host (`BIND_HOST`) must be one of `127.0.0.1`, `::1`,
   or `localhost`. A non-loopback or unset bind (`0.0.0.0`, a LAN IP,
   etc.) with the flag set **throws at startup**. `npm run dev`
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
| `AUTH_DISABLED=true` + `NODE_ENV=production` or `test`      | startup throw     |
| `AUTH_DISABLED=true` + `NODE_ENV=development` + non-loopback `BIND_HOST` | startup throw |
| `AUTH_DISABLED=true` + `next build`                          | build-time throw  |
| `AUTH_DISABLED=true` in `fly.toml` / `Dockerfile` / `start-production.sh` | `auth-bypass-guard.sh` fails CI |

`scripts/auth-bypass-guard.sh` (run by `npm run design-system:test`)
asserts that no supported deployment configuration can enable the
bypass, so a regression that bakes `AUTH_DISABLED` into a deploy config
fails the gate before it ships.
