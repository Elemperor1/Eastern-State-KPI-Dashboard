# Windows Server 2022 native production runbook

This runbook installs Eastern State KPI directly on Windows Server without
WSL, Docker Desktop, or nested virtualization. It is the Windows counterpart
to `local-server-deployment.md`. The supported shape remains one application
process, one local SQLite database, and one reverse proxy.

This installation is served over **plain HTTP** on a VPN-restricted private
network. TLS is deliberately not terminated anywhere in the path, so session
cookies, CSRF tokens, and login passwords travel in cleartext between the VPN
concentrator and this server. That is an accepted risk for this deployment
because the service is unreachable from outside the VPN; it is not a
recommended posture for any internet-reachable installation.

The reviewed layout is:

```text
C:\Database\app\                         reviewed application checkout
C:\Database\data\kpi.db                 authoritative SQLite database
C:\Database\data\plan-activation-backups\
C:\Database\backups\                     operator backups
C:\ProgramData\EasternStateKPI\runtime.env
C:\ProgramData\EasternStateKPI\logs\
```

Do not put the live database on a UNC path, mapped drive, SMB share, DFS path,
OneDrive-synchronized folder, or other network/synchronization boundary.
SQLite, the login throttle, and scheduled startup require exactly one
application process on this server.

## 1. Establish the release and prerequisites

Use Windows Server 2022 and install Node.js system-wide so the built-in
`LOCAL SERVICE` identity can execute it. The repository requires Node.js
24.15 or newer (or 26 or newer) and npm 11.x. In Administrator PowerShell:

```powershell
node --version
npm --version
Get-Command node.exe | Select-Object -ExpandProperty Source
```

Place a clean, reviewed release checkout at `C:\Database\app`. If Git is
available, clone and detach the exact approved SHA; otherwise extract a clean
release archive to that location:

```powershell
New-Item -ItemType Directory -Path C:\Database -Force | Out-Null
git clone https://github.com/Elemperor1/Eastern-State-KPI-Dashboard.git `
  C:\Database\app
Set-Location C:\Database\app
git checkout --detach <approved-sha>
```

Do not develop or make ad hoc edits in this production checkout. Record:

```powershell
Set-Location C:\Database\app
git status --short
git rev-parse HEAD
```

The exact commit must have a green hosted `Quality / Windows Native Build` job
as well as the normal quality and security checks. Container scanning remains
useful release evidence but does not, by itself, prove the native Windows
runtime.

## 2. Install dependencies and build

The controlled installer installs with lifecycle scripts disabled and then
rebuilds only the repository's approved exact package identities. On Windows it
runs npm's `npm-cli.js` with the current Node executable rather than the
`npm.cmd` shim: Node refuses to spawn a `.cmd` file without a shell, and
enabling the shell would stop treating the installer's arguments as literal.
The lockfile includes the Windows x64 builds for Next and Sharp.

```powershell
Set-Location C:\Database\app
node scripts\install-dependencies.mjs
if ($LASTEXITCODE -ne 0) { throw "Controlled dependency installation failed." }

$BuildDb = Join-Path $env:TEMP ("eastern-state-kpi-build-{0}.db" -f [Guid]::NewGuid())
try {
  Remove-Item Env:AUTH_DISABLED -ErrorAction SilentlyContinue
  $env:DATABASE_PATH = $BuildDb
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
}
finally {
  Remove-Item Env:DATABASE_PATH -ErrorAction SilentlyContinue
  foreach ($Candidate in @($BuildDb, "$BuildDb-wal", "$BuildDb-shm")) {
    if (Test-Path -LiteralPath $Candidate -PathType Leaf) {
      Remove-Item -LiteralPath $Candidate -Force
    }
  }
}
```

Never build against `C:\Database\data\kpi.db`.

## 3. Create the access-restricted runtime file

Prepare the directories and restrictive ACLs before writing any secret. This
mode creates an empty runtime file only when it is missing and does not
register or start the application task:

```powershell
Set-Location C:\Database\app
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\register-windows-startup.ps1 `
  -AppRoot C:\Database\app `
  -RuntimeEnvPath C:\ProgramData\EasternStateKPI\runtime.env `
  -DataDirectory C:\Database\data `
  -BackupDirectory C:\Database\backups `
  -LogDirectory C:\ProgramData\EasternStateKPI\logs `
  -PrepareOnly

notepad.exe C:\ProgramData\EasternStateKPI\runtime.env
```

Populate it with the final origin and secrets chosen in a password
manager or other operator-only channel:

```dotenv
NODE_ENV=production
AUTH_DISABLED=false
BIND_HOST=127.0.0.1
DATABASE_PATH=C:\Database\data\kpi.db
PLAN_ACTIVATION_BACKUP_DIR=C:\Database\data\plan-activation-backups
PORT=3000
APP_CANONICAL_ORIGIN=http://10.20.30.40:8080
SESSION_SECURE=false
TRUST_PROXY=false
SESSION_SECRET=<at-least-32-random-characters>
BOOTSTRAP_ADMIN_PASSWORD=<temporary-password-for-zach>
BOOTSTRAP_VIEWER_PASSWORD=<temporary-password-for-kerry>
SUCCESSOR_PLANS_ENABLED=false
```

Replace the example origin. Quote an environment-file value if it contains
`#`, spaces, or leading/trailing whitespace. Never place the file in the
repository or print its contents into a support transcript.

`APP_CANONICAL_ORIGIN` must be the exact origin a browser will show, because
the CSRF and same-origin guards compare against it byte for byte. Omit the
port only when it is 80 — URL parsing drops the default port, so
`http://10.20.30.40:80` is rejected. Never add a trailing slash.
`SESSION_SECURE=false` must accompany a plain-HTTP origin; with `true` the
session cookie is never sent and every login silently fails.

`TRUST_PROXY=false` is the safe initial value. Change it to `true` only after
the reverse proxy is configured to discard client-supplied forwarding
headers and write its own trusted client-IP headers. With `false`, clients
temporarily share the defensive `unknown` login-throttle bucket.

The bootstrap mapping is fixed on a fresh database:

| Person | Email | Initial role | Runtime setting |
| --- | --- | --- | --- |
| Zach Palmer | `zach@easternstate.org` | Admin | `BOOTSTRAP_ADMIN_PASSWORD` |
| Kerry Sautner | `kerry@easternstate.org` | Viewer | `BOOTSTRAP_VIEWER_PASSWORD` |

Run the secret-safe preflight. It reports setting names and policy failures,
never setting values:

```powershell
Set-Location C:\Database\app
node scripts\start-windows-production.mjs `
  --check `
  "--env-file=C:\ProgramData\EasternStateKPI\runtime.env"
if ($LASTEXITCODE -ne 0) { throw "Windows runtime preflight failed." }
```

## 4. Register low-privilege startup

From Administrator PowerShell, register the idempotent startup task:

```powershell
Set-Location C:\Database\app
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\register-windows-startup.ps1 `
  -AppRoot C:\Database\app `
  -RuntimeEnvPath C:\ProgramData\EasternStateKPI\runtime.env `
  -DataDirectory C:\Database\data `
  -BackupDirectory C:\Database\backups `
  -LogDirectory C:\ProgramData\EasternStateKPI\logs `
  -Start
```

Registration repeats the secret-safe runtime preflight and refuses to create
the task when the production build or configuration is missing.

The registration script deliberately replaces inherited ACLs on the app,
data, backup, log, and runtime paths. Administrators and SYSTEM retain full
control. The startup task runs as the locale-independent `LOCAL SERVICE` SID,
with read-only application/runtime access and modify access only to the data
and log directories plus `.next\cache`. It starts at boot, ignores duplicate
starts, and retries failed startup ten times at one-minute intervals.

Re-run registration after replacing the application checkout so permissions
on new files are normalized and the task retains the reviewed paths.

## 5. Verify first startup before configuring users

Inspect task state and bounded startup logs without opening the runtime file:

```powershell
Get-ScheduledTask -TaskName EasternStateKPI |
  Select-Object TaskName, State
Get-ScheduledTaskInfo -TaskName EasternStateKPI |
  Select-Object LastRunTime, LastTaskResult, NextRunTime
Get-Content C:\ProgramData\EasternStateKPI\logs\server-*.log -Tail 100
```

Verify loopback readiness:

```powershell
$Ready = Invoke-RestMethod http://127.0.0.1:3000/api/health/ready
$Ready | ConvertTo-Json -Compress
```

The response must be exactly:

```json
{"status":"ready"}
```

If startup fails, leave the database in place, inspect the task result and the
bounded log, and correct the named configuration or permission problem. Do
not run `db:seed` manually against a populated database.

After the first successful initialization, remove both `BOOTSTRAP_*` lines
from `runtime.env`, then restart the task:

```powershell
Stop-ScheduledTask -TaskName EasternStateKPI
Start-ScheduledTask -TaskName EasternStateKPI
```

The credential hashes are already stored. Existing accounts are never
regenerated on restart.

## 6. Remove the seeded sample results

First boot initializes the database with the real Eastern State catalog — five
priorities, 22 goals, 59 measures, 46 component definitions, and their
configurations and targets — **and** with fabricated annual values for 2024
through 2026 so a development instance has something to render. Those values
are not Eastern State's. The UI marks them with a "Sample data" badge, but a
badge is thin protection once a Board Report leaves the building.

Clear them before anyone signs in. Stop the task first so exactly one process
holds the database:

```powershell
Stop-ScheduledTask -TaskName EasternStateKPI
$Deadline = (Get-Date).AddSeconds(30)
do {
  $State = (Get-ScheduledTask -TaskName EasternStateKPI).State
  if ($State -eq "Ready") { break }
  Start-Sleep -Seconds 1
} while ((Get-Date) -lt $Deadline)
if ($State -ne "Ready") { throw "The application task did not stop." }
```

Preview what would be removed, then remove it:

```powershell
Set-Location C:\Database\app
$env:DATABASE_PATH = "C:\Database\data\kpi.db"
$env:CLEAR_CONFIRM = "C:\Database\data\kpi.db"
try {
  node scripts\clear-sample-data.mjs --dry-run
  if ($LASTEXITCODE -ne 0) { throw "Sample-data preview failed." }
  node scripts\clear-sample-data.mjs
  if ($LASTEXITCODE -ne 0) { throw "Sample-data clearing failed." }
}
finally {
  Remove-Item Env:DATABASE_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:CLEAR_CONFIRM -ErrorAction SilentlyContinue
}

Start-ScheduledTask -TaskName EasternStateKPI
```

The script clears only value-bearing tables — observations, component entries,
distribution values, legacy monthly and breakdown entries, the legacy per-KPI
target archive, and the value-change history. The catalog, measurement
configurations, components, annual and full-plan targets, board reporting
scope, user accounts, and creation provenance are all preserved. It then
sets `meta.sample_data` to `0`, which removes the "Sample data" badge, and
records `meta.sample_data_cleared_at` as a tombstone.

It fails closed. It refuses to run unless `CLEAR_CONFIRM` names the exact
resolved `DATABASE_PATH`, unless `meta.sample_data` is `1`, and unless the
schema matches this checkout. It runs in one transaction, verifies the catalog
survived before committing, and re-runs the readiness probe afterward. Because
the `meta.sample_data` gate only holds on an untouched sample database, a
second run is refused — so this cannot be used to wipe real reported results.

Confirm the Overview renders an empty plan before continuing:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health/ready | ConvertTo-Json -Compress
```

## 7. Put a plain-HTTP reverse proxy in front

The Node process listens only on `127.0.0.1:3000`; do not create a Windows
Firewall rule that exposes port 3000. The reverse proxy is what listens on the
VPN-facing address, so the loopback-only boundary and its ACL model stay
intact. Configure IIS with the approved reverse proxy modules, an existing
network appliance, or another organization-approved proxy to:

- listen on the VPN-facing address and port named in `APP_CANONICAL_ORIGIN`;
- proxy to `http://127.0.0.1:3000`;
- replace rather than append client-controlled forwarding headers;
- preserve request bodies and response streaming; and
- serve no TLS and send no `Strict-Transport-Security` header.

Open the firewall only for the proxy's port, and only to the VPN subnet:

```powershell
New-NetFirewallRule -DisplayName "Eastern State KPI (VPN only)" `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 `
  -RemoteAddress 10.20.30.0/24
```

The server's address must be static. The origin is pinned to it, so a DHCP
lease change breaks every session and every CSRF check at once.

Once forwarding-header replacement is verified, set `TRUST_PROXY=true` in the
runtime file and restart the task. Verify through the final origin:

```powershell
Invoke-RestMethod http://10.20.30.40:8080/api/health/ready |
  ConvertTo-Json -Compress
```

Sign in through the proxy origin, not through `http://127.0.0.1:3000`. The
CSRF and same-origin guards compare the browser's `Origin` header against
`APP_CANONICAL_ORIGIN`, so a loopback address that does not match it will load
pages but reject every save.

## 8. Complete onboarding and staged successor-plan enablement

Share temporary credentials only through an approved out-of-band channel.

1. Zach signs in and completes the forced password-change flow, then signs in
   again. Confirm all four destinations and the Admin role.
2. Kerry completes the same flow. Confirm Viewer access is limited to Overview
   and Reports.
3. Confirm Setup -> Activity records the password changes without credentials
   or password hashes.
4. Complete the preservation checks in `successor-plans-operator-runbook.md`,
   change `SUCCESSOR_PLANS_ENABLED=true`, restart the task, and finish that
   runbook's acceptance gates.

## 9. Create a stopped, verified database backup

Stopping the single writer before copying SQLite is the simplest native
Windows backup boundary. Run from Administrator PowerShell during a maintenance
window:

```powershell
Stop-ScheduledTask -TaskName EasternStateKPI
$Deadline = (Get-Date).AddSeconds(30)
do {
  $State = (Get-ScheduledTask -TaskName EasternStateKPI).State
  if ($State -eq "Ready") { break }
  Start-Sleep -Seconds 1
} while ((Get-Date) -lt $Deadline)
if ($State -ne "Ready") { throw "The application task did not stop." }

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot = Join-Path C:\Database\backups $Stamp
New-Item -ItemType Directory -Path $BackupRoot | Out-Null
foreach ($Name in @("kpi.db", "kpi.db-wal", "kpi.db-shm")) {
  $Source = Join-Path C:\Database\data $Name
  if (Test-Path -LiteralPath $Source -PathType Leaf) {
    Copy-Item -LiteralPath $Source -Destination (Join-Path $BackupRoot $Name)
  }
}

$env:DATABASE_PATH = Join-Path $BackupRoot "kpi.db"
try {
  Set-Location C:\Database\app
  node scripts\check-database-integrity.mjs
  if ($LASTEXITCODE -ne 0) { throw "Backup integrity verification failed." }
}
finally {
  Remove-Item Env:DATABASE_PATH -ErrorAction SilentlyContinue
}

Start-ScheduledTask -TaskName EasternStateKPI
```

Record the backup path, size, timestamp, deployed Git SHA, and integrity result.
Copy verified backups to access-restricted storage under the organization's
retention policy only after the application is stopped or through a separately
approved SQLite-aware backup product.

## 10. Update and rollback

For an update: record the current SHA, stop the task, take and verify a backup,
install a clean approved release at `C:\Database\app`, run the controlled
install and production build, re-run registration, and start the task. Verify
loopback and final-origin readiness before onboarding users to the change.

For rollback: stop the task and deploy the previous approved application
release against the unchanged database only when that release supports the
current schema. If post-release writes must be discarded or the prior release
cannot read the schema, keep all writers stopped and restore the matching
verified pre-cutover database backup before starting the prior release. Never
attempt an in-place schema downgrade.
