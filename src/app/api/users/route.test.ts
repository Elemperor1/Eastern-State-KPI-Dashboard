/**
 * Real-boundary integration tests for the /api/users admin routes
 * (S022-C2).
 *
 * The previous version of this suite mocked `@/features/auth/session`
 * and `@/features/users/server`, so the REAL authorization gate
 * (`requireAdmin` re-reading the users row on every request), the
 * REAL CSRF/same-origin request guard (D8AD-CAN-004), and the REAL
 * feature-layer contracts (session-revocation watermark bumps,
 * lifecycle audit events, typed-error mappings) were never exercised
 * here — the tests only verified the route's own glue against mock
 * call signatures.
 *
 * This rewrite follows the src/lib/auth-regression.test.ts pattern:
 * only the cookie transport is faked (in-memory jar via
 * `vi.mock("next/headers", ...)`); a disposable temp SQLite database,
 * iron-session, the login route, the session boundary, the request
 * guard, and the users feature module all run for real.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/* ------------------------------------------------------------------ *
 * In-memory cookie jar (fakes only the transport; iron-session, the
 * session boundary, the request guard, and the feature layer are
 * real).
 * ------------------------------------------------------------------ */
const { jar, resetSession, cookieStore } = vi.hoisted(() => {
  const jar: Record<string, string> = {};
  /** Supports the reset session test scenario. */
  function resetSession(): void {
    for (const k of Object.keys(jar)) delete jar[k];
  }
  const cookieStore = {
    /** Supports the get test scenario. */
    get: (name: string) =>
      jar[name] != null && jar[name] !== ""
        ? { name, value: jar[name] }
        : undefined,
    /** Supports the set test scenario. */
    set: (nameOrOpts: unknown, value?: string) => {
      if (typeof nameOrOpts === "string") {
        jar[nameOrOpts] = value ?? "";
      } else {
        const o = nameOrOpts as { name: string; value: string };
        jar[o.name] = o.value;
      }
    },
  };
  return { jar, resetSession, cookieStore };
});

vi.mock("next/headers", () => ({
  /** Supports the cookies test scenario. */
  cookies: async () => cookieStore,
  /** Supports the headers test scenario. */
  headers: async () => new Map<string, string>(),
}));

// Real modules — imported AFTER vi.mock so they see the mocked cookies().
import { getDb, resetDb } from "@/lib/db";
import { createUser, findUserById } from "@/features/users/server";
import { _resetForTests as resetThrottle } from "@/lib/login-throttle";
import { CREDENTIAL_BODY_MAX_BYTES } from "@/lib/request-body";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { GET as meGet } from "@/app/api/auth/me/route";
import { DELETE, PATCH, POST } from "./route";

const COOKIE_NAME = "eastern_state_kpi_session";
const CSRF_COOKIE_NAME = "eastern_state_kpi_csrf";
const CSRF_TOKEN = "test-csrf-token-0123456789abcdef";

interface Account {
  id: number;
  email: string;
  password: string;
  role: "admin" | "viewer" | "board";
}

let tmpDir: string;
let databaseIndex = 0;
let originalDbPath: string | undefined;
const originalEnv: Record<string, string | undefined> = {};

let admin: Account;
let viewer: Account;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-users-route-"));
  originalDbPath = process.env.DATABASE_PATH;
  for (const k of ["DATABASE_PATH", "SESSION_SECRET", "SESSION_SECURE", "TRUST_PROXY"]) {
    originalEnv[k] = process.env[k];
  }
  (process.env as Record<string, string | undefined>).SESSION_SECRET =
    "test-secret-test-secret-test-secret-test";
  (process.env as Record<string, string | undefined>).SESSION_SECURE = "false";
  (process.env as Record<string, string | undefined>).TRUST_PROXY = "true";
});

afterAll(() => {
  if (originalDbPath === undefined) {
    delete (process.env as Record<string, string | undefined>).DATABASE_PATH;
  } else {
    (process.env as Record<string, string | undefined>).DATABASE_PATH = originalDbPath;
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  }
  resetDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Fresh disposable DB with one admin and one viewer per test. */
function freshDb(): void {
  (process.env as Record<string, string | undefined>).DATABASE_PATH = path.join(
    tmpDir,
    `users-route-${databaseIndex++}.db`,
  );
  resetDb();
  resetThrottle();
  resetSession();
  const a = createUser({
    email: "route-admin@example.org",
    name: "Route Admin",
    password: "RouteAdmin!2026",
    role: "admin",
  });
  const v = createUser({
    email: "route-viewer@example.org",
    name: "Route Viewer",
    password: "RouteViewer!2026",
    role: "viewer",
  });
  admin = { id: a.id, email: a.email, password: "RouteAdmin!2026", role: "admin" };
  viewer = { id: v.id, email: v.email, password: "RouteViewer!2026", role: "viewer" };
}

beforeEach(() => {
  freshDb();
});

/** Log in as `acct` through the real login route and capture the cookie. */
async function captureLogin(acct: Account, ip: string): Promise<string> {
  resetSession();
  const res = await loginPost(
    new NextRequest(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ email: acct.email, password: acct.password }),
      }),
    ),
  );
  expect(res.status).toBe(200);
  const cookie = jar[COOKIE_NAME];
  expect(cookie).toBeDefined();
  resetSession();
  return cookie;
}

/** Log in as `acct` and leave the session cookie installed in the jar. */
async function loginAs(acct: Account, ip: string): Promise<void> {
  resetSession();
  const res = await loginPost(
    new NextRequest(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ email: acct.email, password: acct.password }),
      }),
    ),
  );
  expect(res.status).toBe(200);
}

/** The session identity the real /api/auth/me route reports, or null. */
async function sessionUser(cookie: string): Promise<{ id: number } | null> {
  resetSession();
  jar[COOKIE_NAME] = cookie;
  const res = await meGet(
    new NextRequest(new Request("http://localhost/api/auth/me")),
  );
  resetSession();
  const body = (await res.json()) as { user: { id: number } | null };
  return body.user;
}

interface MutationOptions {
  /** Omit the X-CSRF-Token header (cookie stays) to exercise the guard. */
  omitToken?: boolean;
  /** Send a token that does not match the cookie. */
  mismatchedToken?: boolean;
  /** Override the Origin header (same-origin check). */
  origin?: string;
  /** Override the Content-Type header (exact-JSON check). */
  contentType?: string;
  /** Override the declared request length for body-cap tests. */
  contentLength?: string;
}

/** Build a mutation request that passes the request guard by default. */
function mutationReq(
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
  options: MutationOptions = {},
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": options.contentType ?? "application/json",
    origin: options.origin ?? "http://localhost",
    cookie: `${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`,
  };
  if (!options.omitToken) {
    headers["x-csrf-token"] = options.mismatchedToken
      ? `not-${CSRF_TOKEN}`
      : CSRF_TOKEN;
  }
  if (options.contentLength) {
    headers["content-length"] = options.contentLength;
  }
  return new NextRequest(
    new Request("http://localhost/api/users", {
      method,
      headers,
      body: JSON.stringify(body),
    }),
  );
}

/** Dispatch a /api/users handler for the given method. */
async function dispatchUsers(req: NextRequest): Promise<Response> {
  if (req.method === "POST") return POST(req);
  if (req.method === "PATCH") return PATCH(req);
  return DELETE(req);
}

/**
 * Lifecycle audit event types recorded for `subjectId` by a real
 * request actor. The per-test account provisioning runs without an
 * actor (attributed to "System"), so those setup events are excluded
 * and only route-driven, actor-attributed events remain.
 */
function auditEventTypes(subjectId: number): string[] {
  const rows = getDb()
    .prepare(
      `SELECT event_type FROM user_lifecycle_audit_events
       WHERE subject_user_id = ? AND actor_email_snapshot != 'System'
       ORDER BY id`,
    )
    .all(subjectId) as { event_type: string }[];
  return rows.map((row) => row.event_type);
}

/* ------------------------------------------------------------------ *
 * The previously-mocked boundary: real requireAdmin + real request
 * guard now stand between the caller and the feature layer.
 * ------------------------------------------------------------------ */
describe("/api/users real authorization boundary", () => {
  it.each(["POST", "PATCH", "DELETE"] as const)(
    "rejects %s without a session with a uniform 401 before any mutation",
    async (method) => {
      const res = await dispatchUsers(
        mutationReq(method, {
          id: viewer.id,
          name: "X",
          email: "x@example.org",
          password: "Whatever!2026",
          role: "viewer",
        }),
      );

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
      // Nothing reached the database.
      expect(findUserById(viewer.id)?.email).toBe(viewer.email);
      expect(auditEventTypes(viewer.id)).toEqual([]);
    },
  );

  it.each(["POST", "PATCH", "DELETE"] as const)(
    "rejects %s from a real viewer session with 403 before any mutation",
    async (method) => {
      await loginAs(viewer, "10.5.0.1");

      const res = await dispatchUsers(
        mutationReq(method, {
          id: admin.id,
          name: "X",
          email: "x@example.org",
          password: "Whatever!2026",
          role: "viewer",
        }),
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
      expect(findUserById(admin.id)?.role).toBe("admin");
      expect(auditEventTypes(admin.id)).toEqual([]);
    },
  );

  it("rejects an admin mutation whose CSRF token header is missing (D8AD-CAN-004)", async () => {
    await loginAs(admin, "10.5.0.2");

    const res = await POST(
      mutationReq(
        "POST",
        {
          name: "Invited",
          email: "invited@example.org",
          password: "TempPass!2026",
          role: "viewer",
        },
        { omitToken: true },
      ),
    );

    expect(res.status).toBe(403);
    expect(
      getDb().prepare("SELECT COUNT(*) AS c FROM users WHERE email = ?")
        .get("invited@example.org"),
    ).toEqual({ c: 0 });
  });

  it("rejects an admin mutation whose CSRF token does not match the cookie", async () => {
    await loginAs(admin, "10.5.0.3");

    const res = await DELETE(
      mutationReq("DELETE", { id: viewer.id }, { mismatchedToken: true }),
    );

    expect(res.status).toBe(403);
    expect(findUserById(viewer.id)).not.toBeNull();
  });

  it("rejects a cross-origin admin mutation before any credential work", async () => {
    await loginAs(admin, "10.5.0.4");

    const res = await DELETE(
      mutationReq("DELETE", { id: viewer.id }, { origin: "https://evil.example.com" }),
    );

    expect(res.status).toBe(403);
    expect(findUserById(viewer.id)).not.toBeNull();
  });

  it("rejects a non-JSON admin mutation with 415 (CORS-safelisted content type)", async () => {
    await loginAs(admin, "10.5.0.5");

    const res = await PATCH(
      mutationReq(
        "PATCH",
        { id: viewer.id, password: "NewTemp!2026" },
        { contentType: "text/plain" },
      ),
    );

    expect(res.status).toBe(415);
  });
});

/* ------------------------------------------------------------------ *
 * POST: real createUser contract — temporary credential, audit event,
 * refreshed users payload, sanitized error mappings.
 * ------------------------------------------------------------------ */
describe("POST /api/users real feature boundary", () => {
  it("rejects a credential payload declared over the credential cap", async () => {
    await loginAs(admin, "10.5.1.0");

    const res = await POST(
      mutationReq(
        "POST",
        {
          name: "Invited Viewer",
          email: "invited@example.org",
          password: "TempPass!2026",
          role: "viewer",
        },
        { contentLength: String(CREDENTIAL_BODY_MAX_BYTES + 1) },
      ),
    );

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({
      error: "Request body too large.",
    });
    expect(
      getDb().prepare("SELECT COUNT(*) AS c FROM users WHERE email = ?")
        .get("invited@example.org"),
    ).toEqual({ c: 0 });
  });

  it("creates the user with a temporary credential, an actor-attributed audit event, and a refreshed list", async () => {
    await loginAs(admin, "10.5.1.1");

    const res = await POST(
      mutationReq("POST", {
        name: "Invited Viewer",
        email: "invited@example.org",
        password: "TempPass!2026",
        role: "viewer",
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      user: { id: number; email: string; role: string; must_change_password: boolean };
      users: { email: string }[];
    };
    expect(body.user).toMatchObject({
      email: "invited@example.org",
      role: "viewer",
      must_change_password: true,
    });
    expect(body.users.map((u) => u.email)).toContain("invited@example.org");

    // The row really exists with the rotation flag set…
    const row = findUserById(body.user.id);
    expect(row).toMatchObject({ email: "invited@example.org", role: "viewer" });
    expect(row?.must_change_password).toBeTruthy();

    // …the temporary credential really works through the real login
    // route (and the forced-rotation flag is reported)…
    const invitedCookie = await captureLogin(
      { id: body.user.id, email: "invited@example.org", password: "TempPass!2026", role: "viewer" },
      "10.5.1.2",
    );
    expect(invitedCookie).toBeDefined();

    // …and the mutation is actor-attributed in the immutable log.
    const audit = getDb()
      .prepare(
        `SELECT event_type, actor_email_snapshot FROM user_lifecycle_audit_events
         WHERE subject_user_id = ?`,
      )
      .all(body.user.id) as { event_type: string; actor_email_snapshot: string }[];
    expect(audit).toEqual([
      { event_type: "create", actor_email_snapshot: admin.email },
    ]);
  });

  it("accepts the restricted Board role through the real stack", async () => {
    await loginAs(admin, "10.5.1.3");

    const res = await POST(
      mutationReq("POST", {
        name: "Board Member",
        email: "board@example.org",
        password: "TempPass!2026",
        role: "board",
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { id: number } };
    expect(findUserById(body.user.id)?.role).toBe("board");
  });

  it("maps a duplicate email to a sanitized 409 against the real UNIQUE constraint", async () => {
    await loginAs(admin, "10.5.1.4");

    const res = await POST(
      mutationReq("POST", {
        name: "Clone",
        email: viewer.email,
        password: "TempPass!2026",
        role: "viewer",
      }),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "A user with that email already exists.",
    });
    // No second row and no audit event for the rejected write.
    expect(
      getDb().prepare("SELECT COUNT(*) AS c FROM users WHERE email = ?")
        .get(viewer.email),
    ).toEqual({ c: 1 });
  });

  it("never echoes a raw driver error to the client", async () => {
    await loginAs(admin, "10.5.1.5");
    // Force a realistic mid-transaction storage failure whose message
    // imitates a leaking driver string (absolute path included).
    getDb().exec(`
      CREATE TRIGGER fail_user_insert BEFORE INSERT ON users
      BEGIN SELECT RAISE(ABORT, 'disk I/O error at /var/lib/sqlite/kpi.db'); END
    `);

    const res = await POST(
      mutationReq("POST", {
        name: "Unlucky",
        email: "unlucky@example.org",
        password: "TempPass!2026",
        role: "viewer",
      }),
    );

    expect(res.status).toBe(400);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("Could not create user.");
    expect(text).not.toContain("disk I/O error");
    expect(text).not.toContain("/var/lib/sqlite");
  });

  it("rejects out-of-bounds input before any account is created (R-06)", async () => {
    await loginAs(admin, "10.5.1.6");
    const countBefore = (
      getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }
    ).c;

    const longPassword = await POST(
      mutationReq("POST", {
        name: "Viewer",
        email: "a@example.org",
        password: "x".repeat(257),
        role: "viewer",
      }),
    );
    expect(longPassword.status).toBe(400);

    const longName = await POST(
      mutationReq("POST", {
        name: "n".repeat(201),
        email: "b@example.org",
        password: "TempPass!2026",
        role: "viewer",
      }),
    );
    expect(longName.status).toBe(400);

    const longEmail = await POST(
      mutationReq("POST", {
        name: "Viewer",
        email: `${"e".repeat(320)}@example.org`,
        password: "TempPass!2026",
        role: "viewer",
      }),
    );
    expect(longEmail.status).toBe(400);

    expect(
      (getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c,
    ).toBe(countBefore);
  });
});

/* ------------------------------------------------------------------ *
 * PATCH: real password-reset contract — temporary credential, durable
 * session revocation of the target, audit event.
 * ------------------------------------------------------------------ */
describe("PATCH /api/users real feature boundary", () => {
  it("rejects a reset payload declared over the credential cap", async () => {
    await loginAs(admin, "10.5.2.0");
    const watermarkBefore = findUserById(viewer.id)?.sessions_valid_after;

    const res = await PATCH(
      mutationReq(
        "PATCH",
        { id: viewer.id, password: "NewTemp!2026" },
        { contentLength: String(CREDENTIAL_BODY_MAX_BYTES + 1) },
      ),
    );

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({
      error: "Request body too large.",
    });
    expect(findUserById(viewer.id)?.sessions_valid_after).toBe(watermarkBefore);
    expect(auditEventTypes(viewer.id)).toEqual([]);
  });

  it("resets the password, forces rotation, revokes the target's live session, and audits the reset", async () => {
    const revoked = await captureLogin(viewer, "10.5.2.1");
    expect(await sessionUser(revoked)).toMatchObject({ id: viewer.id });

    await loginAs(admin, "10.5.2.2");
    const res = await PATCH(
      mutationReq("PATCH", { id: viewer.id, password: "NewTemp!2026" }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; users: { email: string }[] };
    expect(body.ok).toBe(true);
    expect(body.users.map((u) => u.email)).toContain(viewer.email);

    // Forced rotation + watermark bump in the real row…
    const row = findUserById(viewer.id);
    expect(row?.must_change_password).toBeTruthy();

    // …the session captured BEFORE the reset is dead (D8AD-CAN-003)…
    expect(await sessionUser(revoked)).toBeNull();

    // …the new temporary credential works…
    const fresh = await captureLogin(
      { ...viewer, password: "NewTemp!2026" },
      "10.5.2.3",
    );
    expect(await sessionUser(fresh)).toMatchObject({ id: viewer.id });

    // …and the reset is actor-attributed in the immutable log.
    expect(auditEventTypes(viewer.id)).toEqual(["password_reset"]);
  });

  it("returns 404 for a missing target without mutating anything", async () => {
    await loginAs(admin, "10.5.2.4");

    const res = await PATCH(mutationReq("PATCH", { id: 9999, password: "NewTemp!2026" }));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "User not found." });
    expect(auditEventTypes(9999)).toEqual([]);
  });

  it("rejects an oversized reset password before hashing (R-06)", async () => {
    await loginAs(admin, "10.5.2.5");
    const watermarkBefore = findUserById(viewer.id)?.sessions_valid_after;

    const res = await PATCH(
      mutationReq("PATCH", { id: viewer.id, password: "x".repeat(257) }),
    );

    expect(res.status).toBe(400);
    expect(findUserById(viewer.id)?.sessions_valid_after).toBe(watermarkBefore);
    expect(auditEventTypes(viewer.id)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * DELETE: real deletion contract — row removal, session death,
 * self-target refusal, audit event.
 * ------------------------------------------------------------------ */
describe("DELETE /api/users real feature boundary", () => {
  it("deletes the account, kills its live sessions, and audits the deletion", async () => {
    const revoked = await captureLogin(viewer, "10.5.3.1");

    await loginAs(admin, "10.5.3.2");
    const res = await DELETE(mutationReq("DELETE", { id: viewer.id }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; users: { email: string }[] };
    expect(body.ok).toBe(true);
    expect(body.users.map((u) => u.email)).not.toContain(viewer.email);

    // The row is really gone…
    expect(findUserById(viewer.id)).toBeNull();
    // …the deleted account's session cookie is dead…
    expect(await sessionUser(revoked)).toBeNull();
    // …the credentials no longer verify…
    resetSession();
    const login = await loginPost(
      new NextRequest(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
            "x-forwarded-for": "10.5.3.3",
          },
          body: JSON.stringify({ email: viewer.email, password: viewer.password }),
        }),
      ),
    );
    expect(login.status).toBe(401);
    // …and the immutable log kept an actor-attributed tombstone.
    expect(auditEventTypes(viewer.id)).toEqual(["delete"]);
  });

  it("refuses a self-targeted deletion with 400 before mutating", async () => {
    await loginAs(admin, "10.5.3.4");

    const res = await DELETE(mutationReq("DELETE", { id: admin.id }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "You cannot delete your own account.",
    });
    expect(findUserById(admin.id)).not.toBeNull();
    expect(auditEventTypes(admin.id)).toEqual([]);
    // The admin's own session is untouched.
    expect(await meGet(new NextRequest(new Request("http://localhost/api/auth/me"))).then((r) => r.json()))
      .toMatchObject({ user: { id: admin.id } });
  });

  it("returns 404 for a missing target without mutating anything", async () => {
    await loginAs(admin, "10.5.3.5");

    const res = await DELETE(mutationReq("DELETE", { id: 9999 }));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "User not found." });
    expect(auditEventTypes(9999)).toEqual([]);
  });
});
