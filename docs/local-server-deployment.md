# Local production server runbook

This runbook is for an on-premises or other operator-managed server. The
supported production shape is one application container, one persistent SQLite
directory, and one TLS reverse proxy. Do not run multiple application
containers against the same database: SQLite writes and the in-process login
throttle require a single process.

## 1. Freeze and verify the release

Deploy only a clean, reviewed commit:

```bash
git status --short
git rev-parse HEAD
npm run check:all
```

Dispatch the manual `Release Security` workflow from `master` and record the
exact successful SHA before cutover. If the checkout changes after the gate,
repeat the gate for the new SHA.

The authenticated smoke harness performs mutations. Run it only against its
disposable release-candidate database or a restored clone, never the live
database.

## 2. Prepare the persistent database

Create a host directory owned by the container's application uid/gid:

```bash
sudo install -d -o 10001 -g 10001 -m 0700 \
  /srv/eastern-state-kpi/data
```

For a fresh installation, leave the directory empty. The production startup
probe will create schema 16, seed the 2025–2029 sample strategic plan, and
create the two bootstrap accounts.

For an existing installation:

1. Stop the current application so no writer remains.
2. Copy `kpi.db` and any `kpi.db-wal`/`kpi.db-shm` files into a timestamped,
   access-restricted backup directory.
3. Verify the backup opens and run `npm run db:integrity` against a restored
   copy.
4. Place the database at
   `/srv/eastern-state-kpi/data/kpi.db`.
5. Use `npm run db:migrate`, never `db:seed`, for a populated database.
   Schema 9–15 predecessors are additive and the production startup probe can
   migrate them automatically. Schema 8 requires the explicit backed-up
   migration in `docs/migration-notes.md`; schema 7 and older cross the
   catalog-replacement boundary and require the documented operator decision.

Keep the pre-cutover backup until the release and onboarding checks are
complete.

## 3. Create the runtime environment

Create a root-readable file outside the repository:

```bash
sudo install -d -m 0700 /etc/eastern-state-kpi
sudo install -m 0600 /dev/null /etc/eastern-state-kpi/runtime.env
sudoedit /etc/eastern-state-kpi/runtime.env
```

Populate it with the final HTTPS origin and secrets generated in a password
manager or other operator-only channel:

```dotenv
NODE_ENV=production
AUTH_DISABLED=false
DATABASE_PATH=/app/data/kpi.db
PORT=3000
APP_CANONICAL_ORIGIN=https://strategic-plan.example.org
SESSION_SECURE=true
TRUST_PROXY=true
SESSION_SECRET=<at-least-32-random-characters>
BOOTSTRAP_ADMIN_PASSWORD=<temporary-password-for-zach>
BOOTSTRAP_VIEWER_PASSWORD=<temporary-password-for-kerry>
```

`TRUST_PROXY=true` is correct only when the app is behind a reverse proxy that
removes client-supplied forwarding headers and writes trusted client-IP
headers. If the app is exposed directly, set it to `false`. A live deployment
must use HTTPS with `SESSION_SECURE=true`.

The bootstrap mapping is fixed for a fresh database:

| Person | Email | Initial role | Temporary-secret variable |
| --- | --- | --- | --- |
| Zach Palmer | `zach@easternstate.org` | Admin | `BOOTSTRAP_ADMIN_PASSWORD` |
| Kerry Sautner | `kerry@easternstate.org` | Viewer | `BOOTSTRAP_VIEWER_PASSWORD` |

Never put usable passwords in the repository, Dockerfile, service definition,
shell history, or logs.

## 4. Build and start one container

Build the exact release checkout:

```bash
docker build --pull --tag eastern-state-kpi:release .
```

Start one container and publish it only on loopback; the reverse proxy is the
public/LAN entry point:

```bash
docker run -d \
  --name eastern-state-kpi \
  --restart unless-stopped \
  --env-file /etc/eastern-state-kpi/runtime.env \
  --mount type=bind,src=/srv/eastern-state-kpi/data,dst=/app/data \
  --publish 127.0.0.1:3000:3000 \
  eastern-state-kpi:release
```

The image starts as root only long enough to validate and repair ownership of
`/app/data`, then drops permanently to uid/gid 10001 before migration, seed, or
Next.js startup. Startup fails closed for an unreadable, unsafe-to-seed, newer,
or incompletely migrated database.

Configure the reverse proxy to:

- terminate TLS for the exact `APP_CANONICAL_ORIGIN`;
- proxy to `http://127.0.0.1:3000`;
- replace, rather than append untrusted, forwarded client-IP/protocol headers;
- preserve request bodies and response streaming;
- allow only one application container to use the SQLite directory.

## 5. Verify startup before onboarding

Review non-sensitive startup status and confirm the container remains healthy:

```bash
docker logs eastern-state-kpi
docker ps --filter name=eastern-state-kpi
curl --fail --silent --show-error \
  https://strategic-plan.example.org/api/health/ready
```

The health response must be exactly:

```json
{"status":"ready"}
```

It intentionally exposes no account, path, schema, row-count, session, or
secret information.

After the first successful initialization, remove the two `BOOTSTRAP_*`
values from `runtime.env` and restart the container. Their hashes are already
stored; startup will not regenerate existing accounts.

## 6. Complete first-login onboarding

Share temporary credentials only out of band.

1. Zach signs in at `/login`, is forced to `/setup-password`, replaces the
   temporary credential, and signs in again. Confirm all four destinations are
   visible and Setup → People shows Zach as Admin.
2. Kerry signs in, completes the same forced-rotation flow, and signs in again.
   Confirm only Overview and Reports are available and Setup → People shows
   Kerry as Viewer.
3. Confirm Activity contains the password-change lifecycle events without
   credentials or password hashes.

The password-change endpoint revokes the temporary session, so the required
second sign-in is expected.

If a bootstrap secret was omitted before the first database access, the app
stored a random credential nowhere. Provision a known password from an
interactive shell inside the container:

```bash
docker exec -it eastern-state-kpi sh
printf 'New password: '
stty -echo
IFS= read -r SETUP_ADMIN_PASSWORD
stty echo
printf '\n'
export SETUP_ADMIN_PASSWORD
SETUP_ADMIN_EMAIL="zach@easternstate.org" \
  node node_modules/tsx/dist/cli.mjs scripts/setup-admin.ts
unset SETUP_ADMIN_PASSWORD
exit
```

Repeat with `SETUP_ADMIN_EMAIL="kerry@easternstate.org"` if the viewer secret
was also omitted. This operator command clears forced rotation, so treat the
new value as permanent or issue a temporary reset later through Setup →
People.

For an existing database, bootstrap code does not overwrite operator-managed
roles. If the roles differ, use Setup → People to promote Zach to Admin first,
then change Kerry to Viewer. This order preserves the last-active-admin
invariant.

## 7. Cutover and rollback

Before announcing availability:

- verify Overview, Reports, Data Entry, and Setup at desktop and 390 px;
- verify Zach and Kerry's role-specific navigation;
- verify `/api/health/ready` through the final HTTPS origin;
- verify the reverse proxy and application logs contain no credentials;
- record the deployed Git SHA and backup path.

To roll back, stop the container, start the previously approved image against
the unchanged database when its schema is compatible, and recheck readiness.
If post-deploy writes must also be removed or the older image cannot read
schema 16, stop all writers and restore the pre-cutover database backup before
starting the old image.
