# Security Review: Eastern State KPI

## Scope

Deep repository scan of the Eastern State KPI Next.js 15 App Router application, SQLite persistence layer, session/auth helpers, API routes, UI export helpers, seed scripts, package manifests, and repository docs. Discovery saturated after three deep-review rounds with zero new canonical candidate classes in round three.

- Scan mode: deep_repository
- Target kind: git_worktree
- Target ID: target_sha256_c52e00deea4d13466c16eaa9baa4f9472be3a724f1b2c6bc01cf64b9ccee6f96
- Revision: 5525e1a3a5f852e49e2e86f56b8c687717ce5bd4
- Snapshot digest: codex-security-snapshot/v1:sha256:154d06ed64528e3ce884d1453f28332200d803138fb1614d48849fac5a01ab96
- Inventory strategy: repository
- Included paths: .
- Excluded paths: node_modules/, .next/, data/, coverage/
- Runtime or test status: Bounded validation commands exercised auth helpers, credential verification, CSV serialization, SQLite upsert behavior, and npm production advisory lookup. No full server smoke run was needed for the final proof tuples.
- Artifacts reviewed: AGENTS.md, package.json, package-lock.json, src/app/\*\*, src/components/\*\*, src/lib/\*\*, scripts/\*\*, next.config.mjs, .env.local (local runtime context)
- Scan context: The app is documented as an internal KPI dashboard. Login is currently disabled in local configuration via AUTH_DISABLED=true; this materially affects current security posture but production ingress was not provided.

Limitations and exclusions:
- No public deployment or reverse-proxy configuration was present in the repository.
- `.env.local` is local development context and is not tracked, but it was available in the scanned worktree and used to assess current runtime posture.
- Generated build output and local SQLite data files were excluded from source review.
- Excluded node_modules/: Third-party installed dependencies; production advisories checked through npm audit.
- Excluded .next/: Generated Next.js build output.
- Excluded data/: Local SQLite runtime data; schema, seed, and repository code were reviewed instead.
- Excluded coverage/: Generated test coverage output.

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 6 |
| Severity mix | high: 2, medium: 3, low: 1 |
| Confidence mix | high: 5, medium: 1 |
| Coverage | complete |
| Validation mode | Centralized validation with targeted runtime helper/SQLite repros and static source/control/sink tracing. |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

Internal KPI dashboard with admin-only data mutation, user management, audit-history, and CSV export workflows. The key boundaries are anonymous versus authenticated users, viewer versus admin, trusted dashboard data versus spreadsheet execution, and local development configuration versus production deployment.

### Assets

- KPI/category/entry data and notes
- User accounts, password hashes, and session cookies
- Admin audit history in entry_history
- CSV exports consumed by staff

### Trust Boundaries

- Anonymous HTTP requests to dashboard/API routes
- Viewer sessions versus admin-only mutation and user management
- Stored dashboard text exported into staff spreadsheet software
- Local development env files versus production deployment settings

### Attacker Capabilities

- Reach exposed HTTP routes
- Attempt login with known or guessed credentials
- Write KPI data if authentication/authorization is bypassed or credentials are valid
- Convince staff to open exported CSV files

### Security Objectives

- Protected routes must fail closed without a valid session and role
- Synthetic or seeded users must not provide fixed login credentials
- Audit history must represent the row actually changed
- CSV exports must not turn stored text into active spreadsheet formulas

### Assumptions

- Repository calls the app internal, but no deployment ingress config was available.
- SameSite=Lax cookie behavior applies to ordinary browser CSRF/clickjacking paths when auth is enabled.

## Findings

| Finding | Severity | Confidence |
| --- | --- | --- |
| [AUTH_DISABLED grants anonymous admin access when enabled](#finding-1) | high | high |
| [Synthetic bypass admin can authenticate with a documented password](#finding-2) | high | high |
| [Entry upsert conflicts can corrupt or abort audit history](#finding-3) | medium | high |
| [Fresh databases seed documented default accounts without rotation](#finding-4) | medium | high |
| [CSV exports preserve spreadsheet formula prefixes from stored KPI text](#finding-5) | medium | high |
| [Login has no repository-visible throttling or lockout](#finding-6) | low | medium |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] AUTH_DISABLED grants anonymous admin access when enabled

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | runtime helper reproduction plus static route trace; The repository does not include production ingress evidence; severity assumes the app may be run with the documented bypass configuration on a reachable host. |
| Category | Authentication and authorization bypass |
| CWE | CWE-306: Missing Authentication for Critical Function, CWE-862: Missing Authorization |
| Affected lines | .env.local:9-11, src/lib/auth-flag.ts:1, src/lib/session.ts:66-90, src/app/api/entries/route.ts:35-50, src/app/api/users/route.ts:22-34 |

#### Summary

When `AUTH_DISABLED=true`, the session helpers synthesize the real `auth-disabled@local` admin user before reading cookies or checking roles. API routes that rely on `requireAdmin()` therefore become anonymous admin actions if the app is run with the documented bypass configuration.

#### Root Cause

The violated invariant is that protected dashboard and API operations must derive identity from a valid session cookie and then enforce admin role checks. The bypass branch returns an admin user before either control runs.

**Local bypass flag enables public dashboard mode** — `.env.local:9-11`

The local environment enables `AUTH_DISABLED`, which activates the bypass branch.

```text
# Temporarily bypass login so the dashboard is publicly accessible.
# Set to "false" (or unset) to restore iron-session login. See src/lib/auth-flag.ts.
AUTH_DISABLED=true
```

**AUTH_DISABLED is read directly from environment** — `src/lib/auth-flag.ts:1`

The flag is true whenever the environment variable is the string `true`.

```typescript
export const AUTH_DISABLED = process.env.AUTH_DISABLED === "true";
```

#### Validation

A bounded runtime check imported `requireAdmin()` with `AUTH_DISABLED=true` and returned `auth-disabled@local` as role `admin` without any cookie context. Static tracing shows protected write and user-management routes trust this helper.

Validation method: runtime helper reproduction plus static route trace

**Local bypass flag enables public dashboard mode** — `.env.local:9-11`

The local environment enables `AUTH_DISABLED`, which activates the bypass branch.

```text
# Temporarily bypass login so the dashboard is publicly accessible.
# Set to "false" (or unset) to restore iron-session login. See src/lib/auth-flag.ts.
AUTH_DISABLED=true
```

**AUTH_DISABLED is read directly from environment** — `src/lib/auth-flag.ts:1`

The flag is true whenever the environment variable is the string `true`.

```typescript
export const AUTH_DISABLED = process.env.AUTH_DISABLED === "true";
```

**Session helpers return a bypass admin before cookie or role checks** — `src/lib/session.ts:66-90`

`getSession()`, `requireSession()`, and `requireAdmin()` return the bypass user before consulting cookies or checking roles.

```typescript
export async function getSession(): Promise<IronSession<SessionData>> {
  if (AUTH_DISABLED) {
    return {
      user: getBypassUser(),
      save: async () => {},
      destroy: async () => {},
    } as unknown as IronSession<SessionData>;
  }
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

/** Throw 401-style helpers for route handlers. */
export async function requireSession(): Promise<SessionUser> {
  if (AUTH_DISABLED) return getBypassUser();
  const session = await getSession();
  if (!session.user) {
    throw new AuthError("Authentication required", 401);
  }
  return session.user;
}

export async function requireAdmin(): Promise<SessionUser> {
  if (AUTH_DISABLED) return getBypassUser();
  const user = await requireSession();
```

**KPI entry writes trust requireAdmin** — `src/app/api/entries/route.ts:35-50`

The write route accepts the user returned by `requireAdmin()` as the authorization decision.

```typescript
export async function POST(req: NextRequest) {
  let sessionUser;
  try {
    sessionUser = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = UpsertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const entry = upsertEntry({ ...parsed.data, updated_by: sessionUser.id });
  return NextResponse.json({ entry }, { status: 201 });
```

**User creation trusts requireAdmin** — `src/app/api/users/route.ts:22-34`

User management is also gated only by `requireAdmin()` before creating accounts.

```typescript
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const user = createUser(parsed.data);
    return NextResponse.json({ user }, { status: 201 });
```

#### Dataflow

Environment variable `AUTH_DISABLED=true` -\> `AUTH_DISABLED` constant -\> `requireAdmin()` early return -\> protected API route -\> KPI/user/audit data read or mutation.

- **Source:** remote or local-network HTTP if the app is run with the documented bypass env

- **Sink:** src/app/api/users/route.ts

- **Outcome:** A network user who can reach a deployment running with this flag needs no cookie or credentials. The strongest counterevidence is that AGENTS.md calls the mode temporary, but that does not constrain runtime behavior.

**Local bypass flag enables public dashboard mode** — `.env.local:9-11`

The local environment enables `AUTH_DISABLED`, which activates the bypass branch.

```text
# Temporarily bypass login so the dashboard is publicly accessible.
# Set to "false" (or unset) to restore iron-session login. See src/lib/auth-flag.ts.
AUTH_DISABLED=true
```

**AUTH_DISABLED is read directly from environment** — `src/lib/auth-flag.ts:1`

The flag is true whenever the environment variable is the string `true`.

```typescript
export const AUTH_DISABLED = process.env.AUTH_DISABLED === "true";
```

**Session helpers return a bypass admin before cookie or role checks** — `src/lib/session.ts:66-90`

`getSession()`, `requireSession()`, and `requireAdmin()` return the bypass user before consulting cookies or checking roles.

```typescript
export async function getSession(): Promise<IronSession<SessionData>> {
  if (AUTH_DISABLED) {
    return {
      user: getBypassUser(),
      save: async () => {},
      destroy: async () => {},
    } as unknown as IronSession<SessionData>;
  }
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

/** Throw 401-style helpers for route handlers. */
export async function requireSession(): Promise<SessionUser> {
  if (AUTH_DISABLED) return getBypassUser();
  const session = await getSession();
  if (!session.user) {
    throw new AuthError("Authentication required", 401);
  }
  return session.user;
}

export async function requireAdmin(): Promise<SessionUser> {
  if (AUTH_DISABLED) return getBypassUser();
  const user = await requireSession();
```

**KPI entry writes trust requireAdmin** — `src/app/api/entries/route.ts:35-50`

The write route accepts the user returned by `requireAdmin()` as the authorization decision.

```typescript
export async function POST(req: NextRequest) {
  let sessionUser;
  try {
    sessionUser = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = UpsertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const entry = upsertEntry({ ...parsed.data, updated_by: sessionUser.id });
  return NextResponse.json({ entry }, { status: 201 });
```

**User creation trusts requireAdmin** — `src/app/api/users/route.ts:22-34`

User management is also gated only by `requireAdmin()` before creating accounts.

```typescript
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const user = createUser(parsed.data);
    return NextResponse.json({ user }, { status: 201 });
```

#### Reachability

A network user who can reach a deployment running with this flag needs no cookie or credentials. The strongest counterevidence is that AGENTS.md calls the mode temporary, but that does not constrain runtime behavior.

- **Attacker:** public when AUTH_DISABLED is true

- **Entry point:** remote or local-network HTTP if the app is run with the documented bypass env

- **Outcome:** When `AUTH_DISABLED=true`, the session helpers synthesize the real `auth-disabled@local` admin user before reading cookies or checking roles. API routes that rely on `requireAdmin()` therefore become anonymous admin actions if the app is run with the documented bypass configuration.

#### Severity

**High** — This is high because a reachable deployment with the current bypass mode exposes full admin read/write behavior, including user management and KPI audit surfaces, to anonymous requests. It would drop if production deployment evidence proved the flag cannot be set outside isolated local development.

Severity would rise with public internet ingress evidence and fall if the bypass branch were compiled out or guarded to local development only.

#### Remediation

Remove the fail-open `AUTH_DISABLED` branch from production code, or enforce a startup failure when it is set outside a verified local-development environment. Keep auth-restoration checks in CI and add an integration test asserting protected routes return 401/403 without a session.

Tests:
- Run `AUTH_DISABLED=false PORT=3290 BASE=http://127.0.0.1:3290 bash ./scripts/smoke.sh` and verify protected writes require auth.
- Add a route-handler test for `/api/entries` POST without cookies under production env.

Preventive controls:
- Production startup should fail if `AUTH_DISABLED=true`.
- Deployment config should require explicit secret and auth settings review.

<a id="finding-2"></a>

### [2] Synthetic bypass admin can authenticate with a documented password

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | runtime credential verification on a disposable validation database; No live browser login was run; source and repository-function proof are sufficient for the credential acceptance path. |
| Category | Hardcoded administrative credentials |
| CWE | CWE-798: Use of Hard-coded Credentials |
| Affected lines | src/lib/auth.ts:118-124, src/lib/auth.ts:141-157, src/lib/auth.ts:48-60, src/app/api/auth/login/route.ts:21-31 |

#### Summary

The synthetic bypass account is a persisted admin user, and the source comment discloses the plaintext behind its bcrypt hash. A validation run against a disposable database confirmed `verifyCredentials()` accepts `auth-disabled@local` with that password.

#### Root Cause

The bypass identity should not be usable as a normal login credential. Instead, it is stored in the same `users` table and passes through the same password verifier as ordinary users.

**Comment discloses the placeholder password and hash** — `src/lib/auth.ts:118-124`

The comment gives the plaintext for the stored bcrypt hash.

```typescript
/**
 * Bcrypt hash of the synthetic placeholder password "__bypass_disabled_not_a_real_password__".
 * Kept as a constant so the seed is idempotent without re-hashing at runtime.
 * The plain-text value is intentionally not a credential anyone can sign in with.
 */
const BYPASS_PASSWORD_HASH =
  "$2a$10$cl80j8yESM1p1sDXfdNqfuoPJg53icrtO6s/Mgoun4KJfUV6ULzgK";
```

**Bypass row is upserted as admin** — `src/lib/auth.ts:141-157`

The bypass account is a real `users` row with role `admin`.

```typescript
  const existingBypass = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get("auth-disabled@local") as { id: number } | undefined;
  if (existingBypass) {
    db.prepare(
      "UPDATE users SET password_hash = ?, role = 'admin', name = ? WHERE email = ?",
    ).run(BYPASS_PASSWORD_HASH, "Auth Disabled", "auth-disabled@local");
  } else {
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, role)
       VALUES (?, ?, ?, ?, 'admin')`,
    ).run(
      BYPASS_USER_ID,
      "auth-disabled@local",
      "Auth Disabled",
      BYPASS_PASSWORD_HASH,
    );
```

#### Validation

The bcrypt hash matched the commented plaintext, and `verifyCredentials()` returned `{"id":-1,"email":"auth-disabled@local","role":"admin"}` for that credential pair.

Validation method: runtime credential verification on a disposable validation database

**Comment discloses the placeholder password and hash** — `src/lib/auth.ts:118-124`

The comment gives the plaintext for the stored bcrypt hash.

```typescript
/**
 * Bcrypt hash of the synthetic placeholder password "__bypass_disabled_not_a_real_password__".
 * Kept as a constant so the seed is idempotent without re-hashing at runtime.
 * The plain-text value is intentionally not a credential anyone can sign in with.
 */
const BYPASS_PASSWORD_HASH =
  "$2a$10$cl80j8yESM1p1sDXfdNqfuoPJg53icrtO6s/Mgoun4KJfUV6ULzgK";
```

**Bypass row is upserted as admin** — `src/lib/auth.ts:141-157`

The bypass account is a real `users` row with role `admin`.

```typescript
  const existingBypass = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get("auth-disabled@local") as { id: number } | undefined;
  if (existingBypass) {
    db.prepare(
      "UPDATE users SET password_hash = ?, role = 'admin', name = ? WHERE email = ?",
    ).run(BYPASS_PASSWORD_HASH, "Auth Disabled", "auth-disabled@local");
  } else {
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, role)
       VALUES (?, ?, ?, ?, 'admin')`,
    ).run(
      BYPASS_USER_ID,
      "auth-disabled@local",
      "Auth Disabled",
      BYPASS_PASSWORD_HASH,
    );
```

**Normal credential verifier accepts any matching user hash** — `src/lib/auth.ts:48-60`

`verifyCredentials()` has no exception for the bypass email.

```typescript
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const db = getDb();
  const row = asUserRow(
    db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.toLowerCase().trim()),
  );
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
```

**Login stores the verified user in the session** — `src/app/api/auth/login/route.ts:21-31`

The login route saves any user returned by the verifier.

```typescript
    const { email, password } = parsed.data;
    const user = await verifyCredentials(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }
    const session = await getSession();
    session.user = user;
    await session.save();
```

#### Dataflow

Attacker-supplied login email/password -\> `/api/auth/login` -\> `verifyCredentials()` -\> bypass user row -\> session save as admin.

- **Source:** HTTP login route

- **Sink:** src/app/api/auth/login/route.ts

- **Outcome:** Anyone who can reach the login route can try the documented email/password pair. This remains exploitable even after setting `AUTH_DISABLED=false` unless the bypass account or verifier path is changed.

**Comment discloses the placeholder password and hash** — `src/lib/auth.ts:118-124`

The comment gives the plaintext for the stored bcrypt hash.

```typescript
/**
 * Bcrypt hash of the synthetic placeholder password "__bypass_disabled_not_a_real_password__".
 * Kept as a constant so the seed is idempotent without re-hashing at runtime.
 * The plain-text value is intentionally not a credential anyone can sign in with.
 */
const BYPASS_PASSWORD_HASH =
  "$2a$10$cl80j8yESM1p1sDXfdNqfuoPJg53icrtO6s/Mgoun4KJfUV6ULzgK";
```

**Bypass row is upserted as admin** — `src/lib/auth.ts:141-157`

The bypass account is a real `users` row with role `admin`.

```typescript
  const existingBypass = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get("auth-disabled@local") as { id: number } | undefined;
  if (existingBypass) {
    db.prepare(
      "UPDATE users SET password_hash = ?, role = 'admin', name = ? WHERE email = ?",
    ).run(BYPASS_PASSWORD_HASH, "Auth Disabled", "auth-disabled@local");
  } else {
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, role)
       VALUES (?, ?, ?, ?, 'admin')`,
    ).run(
      BYPASS_USER_ID,
      "auth-disabled@local",
      "Auth Disabled",
      BYPASS_PASSWORD_HASH,
    );
```

**Normal credential verifier accepts any matching user hash** — `src/lib/auth.ts:48-60`

`verifyCredentials()` has no exception for the bypass email.

```typescript
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const db = getDb();
  const row = asUserRow(
    db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.toLowerCase().trim()),
  );
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
```

**Login stores the verified user in the session** — `src/app/api/auth/login/route.ts:21-31`

The login route saves any user returned by the verifier.

```typescript
    const { email, password } = parsed.data;
    const user = await verifyCredentials(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }
    const session = await getSession();
    session.user = user;
    await session.save();
```

#### Reachability

Anyone who can reach the login route can try the documented email/password pair. This remains exploitable even after setting `AUTH_DISABLED=false` unless the bypass account or verifier path is changed.

- **Attacker:** public login with known synthetic admin credential

- **Entry point:** HTTP login route

- **Outcome:** The synthetic bypass account is a persisted admin user, and the source comment discloses the plaintext behind its bcrypt hash. A validation run against a disposable database confirmed `verifyCredentials()` accepts `auth-disabled@local` with that password.

#### Severity

**High** — This is high because it provides a known administrative credential through the normal login boundary. Severity would fall only if deployment evidence showed the login route is unreachable and the bypass row cannot exist in production data.

Severity would fall if `verifyCredentials()` explicitly rejected the bypass email and existing bypass rows were rotated or deleted.

#### Remediation

Make bypass identities non-loginable. Explicitly reject `auth-disabled@local` in `verifyCredentials()`, remove plaintext comments, and seed the bypass row only with an unusable random hash or a schema flag that cannot authenticate.

Tests:
- Add a unit test asserting `verifyCredentials(auth-disabled@local, <placeholder>)` returns null.
- Run the smoke harness with `AUTH_DISABLED=false` and verify the bypass account cannot log in.

Preventive controls:
- Keep synthetic/system users outside user-facing credential flows.
- Add a lint or unit-test guard for reserved account emails.

<a id="finding-3"></a>

### [3] Entry upsert conflicts can corrupt or abort audit history

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | SQLite primitive reproduction plus repository-function reproduction on a disposable validation database; The issue requires an update conflict on an existing entry or breakdown and prior inserts that make `lastInsertRowid` differ from the target row. |
| Category | Audit integrity flaw |
| CWE | CWE-672: Operation on a Resource after Expiration or Release, CWE-345: Insufficient Verification of Data Authenticity |
| Affected lines | src/lib/repository.ts:441-461, src/lib/repository.ts:463-474, src/lib/repository.ts:590-612, src/lib/repository.ts:614-625 |

#### Summary

The monthly and breakdown upsert paths fetch the post-write row using `result.lastInsertRowid` after an `ON CONFLICT DO UPDATE`. On conflict updates, SQLite can leave that value pointing at a different prior insert, causing wrong return data, corrupted audit entries, or a crash after data has changed.

#### Root Cause

The invariant is that audit history must describe the row just modified. The code captures the prior row by unique key, but fetches the new row by a connection-level insert id that is not reliable for conflict updates.

**Monthly upsert reads back by lastInsertRowid** — `src/lib/repository.ts:441-461`

After an upsert, the code fetches `monthly_entries` by `result.lastInsertRowid`.

```typescript
  const result = db
    .prepare(
      `INSERT INTO monthly_entries (kpi_id, year, month, value, notes, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(kpi_id, year, month) DO UPDATE SET
         value = excluded.value,
         notes = excluded.notes,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    )
    .run(
      input.kpi_id,
      input.year,
      input.month,
      input.value,
      input.notes ?? null,
      input.updated_by ?? null,
    );
  const row = db
    .prepare("SELECT * FROM monthly_entries WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
```

**Monthly audit history trusts the fetched row** — `src/lib/repository.ts:463-474`

The fetched row supplies `entry_id`, `kpi_id`, and `new_value` for audit history.

```typescript
  recordHistory({
    entry_type: "monthly",
    entry_id: entry.id,
    kpi_id: entry.kpi_id,
    year: entry.year,
    month_or_label: String(entry.month),
    prev_value: prior?.value ?? null,
    new_value: entry.value,
    prev_notes: prior?.notes ?? null,
    new_notes: entry.notes,
    changed_by: input.updated_by ?? null,
  });
```

#### Validation

A repository-function repro updated KPI 1, but `upsertEntry()` returned KPI 2 and wrote an audit row with KPI 2 plus KPI 1 previous value. The breakdown conflict updated the table value and then threw before recording the intended history.

Validation method: SQLite primitive reproduction plus repository-function reproduction on a disposable validation database

**Monthly upsert reads back by lastInsertRowid** — `src/lib/repository.ts:441-461`

After an upsert, the code fetches `monthly_entries` by `result.lastInsertRowid`.

```typescript
  const result = db
    .prepare(
      `INSERT INTO monthly_entries (kpi_id, year, month, value, notes, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(kpi_id, year, month) DO UPDATE SET
         value = excluded.value,
         notes = excluded.notes,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    )
    .run(
      input.kpi_id,
      input.year,
      input.month,
      input.value,
      input.notes ?? null,
      input.updated_by ?? null,
    );
  const row = db
    .prepare("SELECT * FROM monthly_entries WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
```

**Monthly audit history trusts the fetched row** — `src/lib/repository.ts:463-474`

The fetched row supplies `entry_id`, `kpi_id`, and `new_value` for audit history.

```typescript
  recordHistory({
    entry_type: "monthly",
    entry_id: entry.id,
    kpi_id: entry.kpi_id,
    year: entry.year,
    month_or_label: String(entry.month),
    prev_value: prior?.value ?? null,
    new_value: entry.value,
    prev_notes: prior?.notes ?? null,
    new_notes: entry.notes,
    changed_by: input.updated_by ?? null,
  });
```

**Breakdown upsert uses the same read-back pattern** — `src/lib/repository.ts:590-612`

The breakdown path also fetches by `result.lastInsertRowid` after conflict-capable upsert.

```typescript
  const result = db
    .prepare(
      `INSERT INTO breakdown_entries (kpi_id, year, label, value, sort_order, notes, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(kpi_id, year, label) DO UPDATE SET
         value = excluded.value,
         sort_order = excluded.sort_order,
         notes = excluded.notes,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    )
    .run(
      input.kpi_id,
      input.year,
      label,
      input.value,
      input.sort_order ?? 0,
      input.notes ?? null,
      input.updated_by ?? null,
    );
  const row = db
    .prepare("SELECT * FROM breakdown_entries WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
```

**Breakdown audit history trusts the fetched row** — `src/lib/repository.ts:614-625`

The fetched breakdown row drives the audit record.

```typescript
  recordHistory({
    entry_type: "breakdown",
    entry_id: entry.id,
    kpi_id: entry.kpi_id,
    year: entry.year,
    month_or_label: entry.label,
    prev_value: prior?.value ?? null,
    new_value: entry.value,
    prev_notes: prior?.notes ?? null,
    new_notes: entry.notes,
    changed_by: input.updated_by ?? null,
  });
```

#### Dataflow

Admin write request -\> `upsertEntry()` or `upsertBreakdown()` -\> SQLite conflict update -\> stale `lastInsertRowid` read-back -\> incorrect return/audit row or thrown exception.

- **Source:** authenticated or bypass-enabled KPI write API

- **Sink:** src/lib/repository.ts

- **Outcome:** Any admin-capable writer can trigger this with repeated writes to existing KPI/month or breakdown labels. Under `AUTH_DISABLED=true`, anonymous callers can reach the same write routes.

**Monthly upsert reads back by lastInsertRowid** — `src/lib/repository.ts:441-461`

After an upsert, the code fetches `monthly_entries` by `result.lastInsertRowid`.

```typescript
  const result = db
    .prepare(
      `INSERT INTO monthly_entries (kpi_id, year, month, value, notes, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(kpi_id, year, month) DO UPDATE SET
         value = excluded.value,
         notes = excluded.notes,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    )
    .run(
      input.kpi_id,
      input.year,
      input.month,
      input.value,
      input.notes ?? null,
      input.updated_by ?? null,
    );
  const row = db
    .prepare("SELECT * FROM monthly_entries WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
```

**Monthly audit history trusts the fetched row** — `src/lib/repository.ts:463-474`

The fetched row supplies `entry_id`, `kpi_id`, and `new_value` for audit history.

```typescript
  recordHistory({
    entry_type: "monthly",
    entry_id: entry.id,
    kpi_id: entry.kpi_id,
    year: entry.year,
    month_or_label: String(entry.month),
    prev_value: prior?.value ?? null,
    new_value: entry.value,
    prev_notes: prior?.notes ?? null,
    new_notes: entry.notes,
    changed_by: input.updated_by ?? null,
  });
```

**Breakdown upsert uses the same read-back pattern** — `src/lib/repository.ts:590-612`

The breakdown path also fetches by `result.lastInsertRowid` after conflict-capable upsert.

```typescript
  const result = db
    .prepare(
      `INSERT INTO breakdown_entries (kpi_id, year, label, value, sort_order, notes, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(kpi_id, year, label) DO UPDATE SET
         value = excluded.value,
         sort_order = excluded.sort_order,
         notes = excluded.notes,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    )
    .run(
      input.kpi_id,
      input.year,
      label,
      input.value,
      input.sort_order ?? 0,
      input.notes ?? null,
      input.updated_by ?? null,
    );
  const row = db
    .prepare("SELECT * FROM breakdown_entries WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
```

**Breakdown audit history trusts the fetched row** — `src/lib/repository.ts:614-625`

The fetched breakdown row drives the audit record.

```typescript
  recordHistory({
    entry_type: "breakdown",
    entry_id: entry.id,
    kpi_id: entry.kpi_id,
    year: entry.year,
    month_or_label: entry.label,
    prev_value: prior?.value ?? null,
    new_value: entry.value,
    prev_notes: prior?.notes ?? null,
    new_notes: entry.notes,
    changed_by: input.updated_by ?? null,
  });
```

#### Reachability

Any admin-capable writer can trigger this with repeated writes to existing KPI/month or breakdown labels. Under `AUTH_DISABLED=true`, anonymous callers can reach the same write routes.

- **Attacker:** admin write route; public if AUTH_DISABLED is true

- **Entry point:** authenticated or bypass-enabled KPI write API

- **Outcome:** The monthly and breakdown upsert paths fetch the post-write row using `result.lastInsertRowid` after an `ON CONFLICT DO UPDATE`. On conflict updates, SQLite can leave that value pointing at a different prior insert, causing wrong return data, corrupted audit entries, or a crash after data has changed.

#### Severity

**Medium** — This is medium because it compromises the integrity and availability of the audit trail that admins rely on, though it does not by itself disclose secrets or grant new privileges. Severity would rise if audit logs are compliance-critical or used for automated rollback/security decisions.

Severity would fall if audit history were informational only and all writes required trusted admins with independent database auditing.

#### Remediation

After the upsert, fetch by the natural unique key already used to capture `prior` rather than by `lastInsertRowid`. Wrap write plus history insert in a transaction and assert the fetched row matches the requested key.

Tests:
- Add regression tests for conflict updates after unrelated inserts for monthly and breakdown entries.
- Assert the returned row and latest `entry_history` row match the requested KPI/year/month or KPI/year/label.

Preventive controls:
- Use transaction-scoped consistency checks for audited writes.
- Avoid connection-level insert-id APIs after conflict-capable updates.

<a id="finding-4"></a>

### [4] Fresh databases seed documented default accounts without rotation

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | runtime credential verification on a disposable validation database plus static seed trace; This finding depends on a fresh or reset database where the seeded accounts have not been rotated or deleted. |
| Category | Default credentials |
| CWE | CWE-1392: Use of Default Credentials |
| Affected lines | src/lib/auth.ts:160-178, src/app/page.tsx:4-11, AGENTS.md:17-24, src/lib/auth.ts:48-60 |

#### Summary

Fresh database initialization creates fixed admin and viewer accounts whose passwords are documented in repository instructions. A disposable validation database confirmed the seeded admin and viewer credentials authenticate through the normal verifier.

#### Root Cause

The setup invariant should be that seeded accounts are either absent, random, or forced to rotate before use. The runtime seed path creates stable credentials with no rotation gate.

**Fresh DB seeds fixed admin and viewer passwords** — `src/lib/auth.ts:160-178`

The runtime seed path creates named accounts with fixed passwords.

```typescript
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as
    | Record<string, unknown>
    | undefined;
  const count = Number(row?.count ?? 0);
  // The bypass row above is always present; the named seed admins are only
  // created on a fresh DB (no users at all).
  if (count > 1) return;
  createUser({
    email: "kerry@easternstate.org",
    name: "Kerry Sautner",
    password: "KerryAdmin!2026",
    role: "admin",
  });
  createUser({
    email: "zach@easternstate.org",
    name: "Zach Palmer",
    password: "ZachView!2026",
    role: "viewer",
  });
```

**First page access invokes seed setup** — `src/app/page.tsx:4-11`

The app imports and calls `ensureSeedAdmin()` on the page path.

```typescript
import { AUTH_DISABLED } from "@/lib/auth-flag";

// Run once at module load to make sure an admin can always log in.
ensureSeedAdmin();

export default async function HomePage() {
  if (AUTH_DISABLED) {
    redirect("/dashboard/overview");
```

#### Validation

After `ensureSeedAdmin()` ran on a temp database, `verifyCredentials()` accepted `kerry@easternstate.org` / `KerryAdmin!2026` as admin and `zach@easternstate.org` / `ZachView!2026` as viewer.

Validation method: runtime credential verification on a disposable validation database plus static seed trace

**Fresh DB seeds fixed admin and viewer passwords** — `src/lib/auth.ts:160-178`

The runtime seed path creates named accounts with fixed passwords.

```typescript
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as
    | Record<string, unknown>
    | undefined;
  const count = Number(row?.count ?? 0);
  // The bypass row above is always present; the named seed admins are only
  // created on a fresh DB (no users at all).
  if (count > 1) return;
  createUser({
    email: "kerry@easternstate.org",
    name: "Kerry Sautner",
    password: "KerryAdmin!2026",
    role: "admin",
  });
  createUser({
    email: "zach@easternstate.org",
    name: "Zach Palmer",
    password: "ZachView!2026",
    role: "viewer",
  });
```

**First page access invokes seed setup** — `src/app/page.tsx:4-11`

The app imports and calls `ensureSeedAdmin()` on the page path.

```typescript
import { AUTH_DISABLED } from "@/lib/auth-flag";

// Run once at module load to make sure an admin can always log in.
ensureSeedAdmin();

export default async function HomePage() {
  if (AUTH_DISABLED) {
    redirect("/dashboard/overview");
```

**Repository instructions document the seeded credentials** — `AGENTS.md:17-24`

The setup notes publish the credential pairs.

````markdown
```

Seeded accounts (first DB access only, via `ensureSeedAdmin` in `src/lib/auth.ts`; unused while auth is disabled):

- `kerry@easternstate.org` / `KerryAdmin!2026` — admin
- `zach@easternstate.org` / `ZachView!2026` — viewer

## Commands
````

**Normal verifier accepts seeded accounts** — `src/lib/auth.ts:48-60`

The same password verifier accepts these seeded account hashes.

```typescript
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const db = getDb();
  const row = asUserRow(
    db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.toLowerCase().trim()),
  );
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
```

#### Dataflow

Fresh DB access -\> `ensureSeedAdmin()` -\> fixed credential users -\> `/api/auth/login` -\> authenticated dashboard session.

- **Source:** HTTP login route on fresh/reset database

- **Sink:** src/lib/auth.ts

- **Outcome:** The path matters for fresh or reset deployments before an operator rotates/deletes the accounts. Existing databases with changed accounts lower likelihood but do not remove the runtime seed behavior.

**Fresh DB seeds fixed admin and viewer passwords** — `src/lib/auth.ts:160-178`

The runtime seed path creates named accounts with fixed passwords.

```typescript
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as
    | Record<string, unknown>
    | undefined;
  const count = Number(row?.count ?? 0);
  // The bypass row above is always present; the named seed admins are only
  // created on a fresh DB (no users at all).
  if (count > 1) return;
  createUser({
    email: "kerry@easternstate.org",
    name: "Kerry Sautner",
    password: "KerryAdmin!2026",
    role: "admin",
  });
  createUser({
    email: "zach@easternstate.org",
    name: "Zach Palmer",
    password: "ZachView!2026",
    role: "viewer",
  });
```

**First page access invokes seed setup** — `src/app/page.tsx:4-11`

The app imports and calls `ensureSeedAdmin()` on the page path.

```typescript
import { AUTH_DISABLED } from "@/lib/auth-flag";

// Run once at module load to make sure an admin can always log in.
ensureSeedAdmin();

export default async function HomePage() {
  if (AUTH_DISABLED) {
    redirect("/dashboard/overview");
```

**Repository instructions document the seeded credentials** — `AGENTS.md:17-24`

The setup notes publish the credential pairs.

````markdown
```

Seeded accounts (first DB access only, via `ensureSeedAdmin` in `src/lib/auth.ts`; unused while auth is disabled):

- `kerry@easternstate.org` / `KerryAdmin!2026` — admin
- `zach@easternstate.org` / `ZachView!2026` — viewer

## Commands
````

**Normal verifier accepts seeded accounts** — `src/lib/auth.ts:48-60`

The same password verifier accepts these seeded account hashes.

```typescript
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const db = getDb();
  const row = asUserRow(
    db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.toLowerCase().trim()),
  );
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
```

#### Reachability

The path matters for fresh or reset deployments before an operator rotates/deletes the accounts. Existing databases with changed accounts lower likelihood but do not remove the runtime seed behavior.

- **Attacker:** public login with known seeded setup credentials

- **Entry point:** HTTP login route on fresh/reset database

- **Outcome:** Fresh database initialization creates fixed admin and viewer accounts whose passwords are documented in repository instructions. A disposable validation database confirmed the seeded admin and viewer credentials authenticate through the normal verifier.

#### Severity

**Medium** — This is medium because compromise is severe on a fresh deployment, but exploitation depends on seed accounts remaining present. Severity would rise with evidence that production deployments routinely start from the seeded DB.

Severity would fall if deployment automation forced random passwords or first-login rotation before the app became reachable.

#### Remediation

Remove fixed seeded passwords from runtime code. Generate one-time setup credentials out-of-band, force rotation before dashboard access, or require an explicit admin creation flow.

Tests:
- Run a temp DB seed and assert known passwords do not authenticate.
- Add a migration/seed test that fails if fixed production-looking credentials are present.

Preventive controls:
- Separate demo/sample seeding from production runtime initialization.
- Document setup credentials outside shipped runtime code and rotate automatically.

<a id="finding-5"></a>

### [5] CSV exports preserve spreadsheet formula prefixes from stored KPI text

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | targeted helper reproduction plus static source-to-download trace; Spreadsheet execution depends on the victim spreadsheet application and the user opening the exported file. |
| Category | CSV formula injection |
| CWE | CWE-1236: Improper Neutralization of Formula Elements in a CSV File |
| Affected lines | src/components/ui/csv-helpers.ts:10-17, src/components/ui/csv-helpers.ts:37-42, src/components/ui/ExportCSVButton.tsx:41-50 |

#### Summary

The shared CSV helper performs RFC-4180 quoting but does not neutralize cells that begin with spreadsheet formula characters. Stored KPI notes, labels, or breakdown text can therefore become active formulas when staff open exported CSVs.

#### Root Cause

CSV syntax escaping and spreadsheet formula neutralization are different controls. The implementation only quotes delimiters and leaves leading formula characters intact.

**CSV escaping only handles delimiters** — `src/components/ui/csv-helpers.ts:10-17`

The helper returns formula-leading strings unchanged unless delimiter quoting is needed.

```typescript
/** Escape one cell per RFC-4180. */
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (NEEDS_QUOTE.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
```

**All exported values flow through the helper** — `src/components/ui/csv-helpers.ts:37-42`

`buildCSV()` applies `escapeCell()` to every cell.

```typescript
export function buildCSV(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(escapeCell).join(",");
  const body = rows
    .map((row) => columns.map((col) => escapeCell(row[col])).join(","))
    .join(CRLF);
  return body ? `${header}${CRLF}${body}${CRLF}` : `${header}${CRLF}`;
```

#### Validation

A targeted helper run serialized values beginning with `=HYPERLINK(...)` and `+SUM(1,1)`; the formula prefixes remained in the CSV payload.

Validation method: targeted helper reproduction plus static source-to-download trace

**CSV escaping only handles delimiters** — `src/components/ui/csv-helpers.ts:10-17`

The helper returns formula-leading strings unchanged unless delimiter quoting is needed.

```typescript
/** Escape one cell per RFC-4180. */
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (NEEDS_QUOTE.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
```

**All exported values flow through the helper** — `src/components/ui/csv-helpers.ts:37-42`

`buildCSV()` applies `escapeCell()` to every cell.

```typescript
export function buildCSV(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(escapeCell).join(",");
  const body = rows
    .map((row) => columns.map((col) => escapeCell(row[col])).join(","))
    .join(CRLF);
  return body ? `${header}${CRLF}${body}${CRLF}` : `${header}${CRLF}`;
```

**CSV is downloaded for spreadsheet import** — `src/components/ui/ExportCSVButton.tsx:41-50`

The UI turns generated CSV text into a downloadable `text/csv` blob.

```typescript
  const handleClick = useCallback(() => {
    if (typeof document === "undefined") return;
    const cols = columns ?? inferColumns(rows);
    const csv = buildCSV(rows ?? [], cols);
    // BOM helps Excel detect UTF-8; harmless for other parsers.
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ensureCsvExt(filename);
```

#### Dataflow

Stored KPI text -\> dashboard export rows -\> `buildCSV()` -\> browser CSV download -\> spreadsheet import formula evaluation.

- **Source:** stored KPI text to staff CSV export

- **Sink:** src/components/ui/ExportCSVButton.tsx

- **Outcome:** A writer who can store KPI notes or labels can plant the payload. In the current auth-disabled posture this can be anonymous; after auth fixes it requires a writer/admin or another write-path compromise.

**CSV escaping only handles delimiters** — `src/components/ui/csv-helpers.ts:10-17`

The helper returns formula-leading strings unchanged unless delimiter quoting is needed.

```typescript
/** Escape one cell per RFC-4180. */
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (NEEDS_QUOTE.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
```

**All exported values flow through the helper** — `src/components/ui/csv-helpers.ts:37-42`

`buildCSV()` applies `escapeCell()` to every cell.

```typescript
export function buildCSV(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(escapeCell).join(",");
  const body = rows
    .map((row) => columns.map((col) => escapeCell(row[col])).join(","))
    .join(CRLF);
  return body ? `${header}${CRLF}${body}${CRLF}` : `${header}${CRLF}`;
```

**CSV is downloaded for spreadsheet import** — `src/components/ui/ExportCSVButton.tsx:41-50`

The UI turns generated CSV text into a downloadable `text/csv` blob.

```typescript
  const handleClick = useCallback(() => {
    if (typeof document === "undefined") return;
    const cols = columns ?? inferColumns(rows);
    const csv = buildCSV(rows ?? [], cols);
    // BOM helps Excel detect UTF-8; harmless for other parsers.
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ensureCsvExt(filename);
```

#### Reachability

A writer who can store KPI notes or labels can plant the payload. In the current auth-disabled posture this can be anonymous; after auth fixes it requires a writer/admin or another write-path compromise.

- **Attacker:** writer controls stored text; current auth bypass or credentials can provide write access

- **Entry point:** stored KPI text to staff CSV export

- **Outcome:** The shared CSV helper performs RFC-4180 quoting but does not neutralize cells that begin with spreadsheet formula characters. Stored KPI notes, labels, or breakdown text can therefore become active formulas when staff open exported CSVs.

#### Severity

**Medium** — This is medium because it crosses from dashboard data into a staff spreadsheet execution context, but it requires a user to export and open the file. Severity would rise if CSV export is used for automated privileged spreadsheet workflows.

Severity would fall if exports were consumed only by inert parsers or all formula-leading cells were neutralized.

#### Remediation

Prefix formula-leading cells with a single quote or tab according to the chosen spreadsheet-safety policy, and apply the rule before delimiter quoting. Cover `=`, `+`, `-`, `@`, tab, carriage return, and leading whitespace variants.

Tests:
- Add unit tests for `escapeCell()` with formula-leading strings.
- Run existing CSV component tests and verify exported payloads neutralize formulas.

Preventive controls:
- Centralize CSV export through the helper and block direct CSV construction elsewhere.
- Document spreadsheet-safe CSV encoding in the design-system utility.

<a id="finding-6"></a>

### [6] Login has no repository-visible throttling or lockout

| Field | Value |
| --- | --- |
| Severity | low |
| Confidence | medium |
| Confidence rationale | static source trace and negative control search; Deployment-level WAF or reverse-proxy rate limiting was not evidenced in the repository. |
| Category | Missing login abuse control |
| CWE | CWE-307: Improper Restriction of Excessive Authentication Attempts |
| Affected lines | src/app/api/auth/login/route.ts:11-31, src/lib/auth.ts:48-60 |

#### Summary

The public login route performs password verification without any repository-visible rate limit, lockout, delay, or attempt accounting.

#### Root Cause

The authentication boundary should slow or block repeated online guesses. The route performs the verifier call and returns 401 on failure without an abuse-control layer in code.

**Login calls verifier without attempt control** — `src/app/api/auth/login/route.ts:11-31`

The route parses input and calls `verifyCredentials()` directly.

```typescript
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please provide a valid email and password." },
        { status: 400 },
      );
    }
    const { email, password } = parsed.data;
    const user = await verifyCredentials(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }
    const session = await getSession();
    session.user = user;
    await session.save();
```

**Verifier compares passwords for matching users** — `src/lib/auth.ts:48-60`

Each matching email causes a bcrypt comparison and success/failure response.

```typescript
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const db = getDb();
  const row = asUserRow(
    db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.toLowerCase().trim()),
  );
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
```

#### Validation

Static tracing and a targeted search found no login throttling, lockout, or attempt counter in the route, auth helper, session helper, or app config. External gateway controls were not evidenced.

Validation method: static source trace and negative control search

**Login calls verifier without attempt control** — `src/app/api/auth/login/route.ts:11-31`

The route parses input and calls `verifyCredentials()` directly.

```typescript
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please provide a valid email and password." },
        { status: 400 },
      );
    }
    const { email, password } = parsed.data;
    const user = await verifyCredentials(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }
    const session = await getSession();
    session.user = user;
    await session.save();
```

**Verifier compares passwords for matching users** — `src/lib/auth.ts:48-60`

Each matching email causes a bcrypt comparison and success/failure response.

```typescript
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const db = getDb();
  const row = asUserRow(
    db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.toLowerCase().trim()),
  );
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
```

#### Dataflow

Attacker POSTs email/password guesses -\> `/api/auth/login` -\> `verifyCredentials()` -\> bcrypt compare -\> 401 or session save.

- **Source:** HTTP login route

- **Sink:** src/lib/auth.ts

- **Outcome:** Anyone who can reach the login endpoint can submit attempts. Practical risk depends on deployment exposure and any out-of-repository WAF or reverse-proxy rate limiting.

**Login calls verifier without attempt control** — `src/app/api/auth/login/route.ts:11-31`

The route parses input and calls `verifyCredentials()` directly.

```typescript
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please provide a valid email and password." },
        { status: 400 },
      );
    }
    const { email, password } = parsed.data;
    const user = await verifyCredentials(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }
    const session = await getSession();
    session.user = user;
    await session.save();
```

**Verifier compares passwords for matching users** — `src/lib/auth.ts:48-60`

Each matching email causes a bcrypt comparison and success/failure response.

```typescript
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const db = getDb();
  const row = asUserRow(
    db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.toLowerCase().trim()),
  );
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
```

#### Reachability

Anyone who can reach the login endpoint can submit attempts. Practical risk depends on deployment exposure and any out-of-repository WAF or reverse-proxy rate limiting.

- **Attacker:** public unauthenticated credential guessing

- **Entry point:** HTTP login route

- **Outcome:** The public login route performs password verification without any repository-visible rate limit, lockout, delay, or attempt accounting.

#### Severity

**Low** — This is low because it is an abuse-control gap rather than a direct bypass, and deployment exposure is unknown. It would rise if the app is internet-facing without gateway throttling, especially while known/default credentials exist.

Severity would fall if deployment manifests showed enforced per-IP and per-account throttling at the edge.

#### Remediation

Add per-IP and per-account throttling around `/api/auth/login`, track failed attempts, and consider short lockouts or progressive delays. Ensure responses do not expose account existence.

Tests:
- Add tests that repeated bad passwords hit a throttle before bcrypt comparison.
- Exercise login smoke under valid credentials to ensure legitimate users are not locked out incorrectly.

Preventive controls:
- Monitor failed login attempt rates.
- Document edge rate-limiting requirements for deployments.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| AUTH_DISABLED turns session and admin guards into a static admin user | AUTH_DISABLED | Reported | Became a final finding. Evidence: artifacts/05_findings/ESKPI-CAN-001/validation_report.md, artifacts/05_findings/ESKPI-CAN-001/attack_path_analysis_report.md |
| Bypass account has a documented plaintext password accepted by normal login | Bypass | Reported | Became a final finding. Evidence: artifacts/05_findings/ESKPI-CAN-002/validation_report.md, artifacts/05_findings/ESKPI-CAN-002/attack_path_analysis_report.md |
| Fresh databases seed documented default admin and viewer credentials | Fresh | Reported | Became a final finding. Evidence: artifacts/05_findings/ESKPI-CAN-003/validation_report.md, artifacts/05_findings/ESKPI-CAN-003/attack_path_analysis_report.md |
| Login endpoint lacks online guessing throttling or lockout | Login | Reported | Became a final finding. Evidence: artifacts/05_findings/ESKPI-CAN-004/validation_report.md, artifacts/05_findings/ESKPI-CAN-004/attack_path_analysis_report.md |
| CSV exports preserve spreadsheet formula prefixes from stored KPI text | CSV export | Reported | Became a final finding. Evidence: artifacts/05_findings/ESKPI-CAN-005/validation_report.md, artifacts/05_findings/ESKPI-CAN-005/attack_path_analysis_report.md |
| State-changing API routes may lack CSRF-specific defenses | State-changing | Rejected | `SameSite=Lax` and JSON body requirements defeat the cross-site browser POST path for normal authenticated sessions. Evidence: artifacts/05_findings/ESKPI-CAN-006/validation_report.md, artifacts/05_findings/ESKPI-CAN-006/attack_path_analysis_report.md |
| Local session secret and insecure cookie flag can become a deployment footgun | Local | Not applicable | Local-only untracked configuration and production guidance make this a deployment hygiene note, not a repository finding. Evidence: artifacts/05_findings/ESKPI-CAN-007/validation_report.md, artifacts/05_findings/ESKPI-CAN-007/attack_path_analysis_report.md |
| Entry upsert conflict path may record audit history for the wrong row | Entry | Reported | Became a final finding. Evidence: artifacts/05_findings/ESKPI-CAN-008/validation_report.md, artifacts/05_findings/ESKPI-CAN-008/attack_path_analysis_report.md |
| Admin pages lack explicit anti-framing headers | Admin | Rejected | Repository evidence did not establish a browser-authenticated framed action path with cookies sent in a third-party iframe. Evidence: artifacts/05_findings/ESKPI-CAN-009/validation_report.md, artifacts/05_findings/ESKPI-CAN-009/attack_path_analysis_report.md |
| Production dependency advisories | Supply chain | No issue found | `npm audit --omit=dev --json` reported zero production vulnerabilities. Evidence: artifacts/03_coverage/npm-audit-prod.json |
| Generated build output and local SQLite data | Generated artifacts | Not applicable | Generated `.next`, `node_modules`, and local `data/` database contents were excluded as non-source artifacts; source, package manifests, and seed paths were reviewed. Evidence: artifacts/03_coverage/repository_coverage_ledger.md |

## Open Questions And Follow Up

- Is any deployment reachable with `AUTH_DISABLED=true`?
  - Follow-up prompt: Review deployment environment for Eastern State KPI at revision 5525e1a3a5f852e49e2e86f56b8c687717ce5bd4 and verify AUTH_DISABLED is false or unavailable in production.
- Does edge infrastructure provide login rate limiting outside this repository?
  - Follow-up prompt: Check Eastern State KPI deployment gateway or reverse-proxy config for per-IP and per-account throttling on /api/auth/login.
